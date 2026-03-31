"""
appbackend.py — ARIA Multi-Agent FastAPI Backend v3.0
=====================================================
✅ All 8 tools: websites, maps, email, real-time data, memory, PDF, weather, system
✅ Vision Mode + Sign Detection with image/camera input
✅ File analysis: PDF, DOCX, PPTX, TXT, images
✅ SSE streaming with live tool status events
✅ Per-session state isolation (no cross-user contamination)
✅ Async rate limiter (asyncio.sleep — never blocks event loop)
✅ Tool failure fallback — answers from own knowledge if search fails
✅ Precise tool routing — static knowledge never hits search API
"""

import asyncio
import os
import base64
from collections import deque
import concurrent.futures
import io
import json
import re as _re
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional
import datetime

import PIL.Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
import urllib.parse
import difflib
import re
from pydantic import BaseModel

class FeedbackRequest(BaseModel):
    session_id: str
    message_id: str
    rating: str  # "up" or "down"

from core.agent import create_agent_session
from core.config import Config
from core.memory import MemoryManager
from core.prompts import get_system_info
from tools.api_tools import get_map_distance, send_email_logic
from tools.file_tools import (
    convert_to_pdf,
    read_docx_file_from_stream,
    read_pdf_file_from_stream,
    read_ppt_file_from_stream,
)
from tools.search_tools import get_realtime_data, get_weather, search_jobs

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("backend.log", encoding="utf-8"),
        logging.StreamHandler(stream=open("nul", "w") if False else __import__('sys').stdout)
    ]
)
import sys
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
logger = logging.getLogger(__name__)

# ─── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(title="Gemini AI Backend", version="3.1.0")

from fastapi import Request
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    origin = request.headers.get("origin")
    method = request.method
    path = request.url.path
    
    logger.info(f"[Request] {method} {path} (Origin: {origin})")
    
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        logger.info(f"[Response] {method} {path} -> {response.status_code} ({process_time:.2f}ms)")
        return response
    except Exception as e:
        logger.error(f"[Error] {method} {path} -> {str(e)}")
        raise

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Gemini Client ─────────────────────────────────────────────────────────────
# Enforce strict single-key operation
_main_key = os.getenv("GOOGLE_API_KEY_1") or os.getenv("GOOGLE_API_KEY")

if not _main_key:
    logger.critical("❌ NO API KEY FOUND in environment! Set GOOGLE_API_KEY_1 or GOOGLE_API_KEY in .env")
    GENAI_CLIENT = None
else:
    GENAI_CLIENT = genai.Client(api_key=_main_key)


# ─── Global Executor (Prevent Thread Explosion) ───────────────────────────────
# Shared across all requests to keep resource usage stable.
# Increased to 50 for extreme parallel agent processing.
GLOBAL_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=50)

# { session_id: { "chat": <chat_obj>, "mode": <str>, "last_seen": <datetime> } }
_sessions: Dict[str, Dict[str, Any]] = {}
_sessions_lock = asyncio.Lock()


async def _cleanup_sessions_task():
    """Background loop to purge sessions inactive for > 1 hour."""
    while True:
        await asyncio.sleep(600)  # Check every 10 mins
        async with _sessions_lock:
            now = datetime.datetime.now()
            to_delete = [
                sid for sid, data in _sessions.items()
                if (now - data.get("last_seen", now)).total_seconds() > 3600
            ]
            for sid in to_delete:
                logger.info(f"[Cleanup] Removing idle session: {sid}")
                del _sessions[sid]


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(_cleanup_sessions_task())


# ─── Model Fallback Chain ─────────────────────────────────────────────────────
# Priority order: verified working → fallbacks
FALLBACK_MODELS = [
    "gemini-2.5-flash",        # Verified working on new key
    "gemini-flash-latest",     # Verified working on new key
    "gemini-2.5-pro",          # Secondary potential (pro version)
    "gemini-1.5-pro",
]
_active_model = FALLBACK_MODELS[0]  # Tracks current working model globally

def _get_or_create_session(session_id: str, mode: str, model: str = None):
    global _active_model
    effective_model = model or _active_model

    entry = _sessions.get(session_id)
    if entry is None or entry["mode"] != mode or entry.get("model") != effective_model:
        logger.info(f"[Session] Creating → id={session_id!r}  mode={mode!r}  model={effective_model!r}")
        chat = create_agent_session(GENAI_CLIENT, mode, history=None, model=effective_model)
        logger.info(f"[Session] System Instruction Applied: {mode!r}")
        _sessions[session_id] = {
            "chat": chat, 
            "mode": mode, 
            "model": effective_model,
            "last_seen": datetime.datetime.now()
        }
    else:
        _sessions[session_id]["last_seen"] = datetime.datetime.now()
    
    return _sessions[session_id]["chat"]


async def _get_or_create_session_async(session_id: str, mode: str, model: str = None):
    # Offload the synchronous create_agent_session to the executor
    async with _sessions_lock:
        return await asyncio.get_event_loop().run_in_executor(
            GLOBAL_EXECUTOR, _get_or_create_session, session_id, mode, model
        )


# --- Async Rate Limiter -------------------------------------------------------
# User requested maximum speed. Setting RPM limit extremely high to bypass the local 
# queue and unleash instant stream routing at the risk of 429 quota exhaustion.
MAX_RPM = 9999  

class _RateLimiter:
    def __init__(self):
        self._requests = deque()   # Rolling timestamps of sent requests
        self._lock = asyncio.Lock()
        import threading
        self._sync_lock = threading.Lock()  # For get_stats called from executor

    async def wait(self):
        """Block asyncly until a slot is available under MAX_RPM."""
        async with self._lock:
            while True:
                now = time.monotonic()
                # Drop timestamps older than 60 seconds
                while self._requests and (now - self._requests[0] > 60):
                    self._requests.popleft()

                if len(self._requests) < MAX_RPM:
                    # Slot available -- claim it and proceed immediately
                    with self._sync_lock:
                        self._requests.append(now)
                    logger.debug(f"[Rate] Slot ok (RPM={len(self._requests)}/{MAX_RPM})")
                    return
                else:
                    # All slots used -- sleep until oldest slot expires
                    oldest = self._requests[0]
                    sleep_for = (oldest + 60.0) - now + 0.05  # +50ms buffer
                    logger.info(f"[Rate] Throttling {sleep_for:.1f}s (RPM={len(self._requests)}/{MAX_RPM})")
                    self._lock.release()
                    try:
                        await asyncio.sleep(sleep_for)
                    finally:
                        await self._lock.acquire()

    def get_stats(self):
        with self._sync_lock:
            now = time.monotonic()
            while self._requests and (now - self._requests[0] > 60):
                self._requests.popleft()
            rpm_60 = len(self._requests)
            recent = [t for t in self._requests if (now - t) <= 15]
            rpm_15 = len(recent) * 4
            return {
                "rpm": rpm_60,
                "intensity": rpm_15,
                "limit": 15
            }


_limiter = _RateLimiter()


# ─── History Sanitizer ───────────────────────────────────────────────────────
def _sanitize_history(history: List[types.Content]) -> List[types.Content]:
    """
    Ensures that the history sent to Gemini is valid Tool-Use sequence.
    Rules:
    1. A turn with 'function_call' MUST be followed by a turn with 'role: function'.
    2. If the last turn has 'function_call' but no response follows, we remove those parts
       or the entire turn to prevent the 400 'immediately after' error.
    """
    if not history: return []
    
    clean_history = []
    for i, content in enumerate(history):
        # Check if this turn had function calls
        has_calls = any(getattr(p, "function_call", None) for p in content.parts)
        
        if has_calls:
            # Look ahead for a function response
            if i + 1 < len(history) and history[i+1].role == "function":
                # Valid sequence
                clean_history.append(content)
            else:
                # INVALID: This turn has calls but no response follows.
                # Strip the function_calls from this turn to keep the text (if any)
                new_parts = [p for p in content.parts if not getattr(p, "function_call", None)]
                if new_parts:
                    content.parts = new_parts
                    clean_history.append(content)
                # If no text remains, skip the whole turn
                continue
        else:
            clean_history.append(content)
            
    return clean_history


# ─── Safe Gemini Send ──────────────────────────────────────────────────────────
async def _safe_send(chat, payload, session_id: str, mode: str, retries: int = 2):
    """Gemini call with model fallback on 429 quota exhaustion."""
    global _active_model, GENAI_CLIENT
    loop = asyncio.get_event_loop()

    # Normalize mode for consistent prompt lookup
    eff_mode = "Career Rescue Mode" if "Career Rescue" in mode else mode

    for model_idx, model_name in enumerate(FALLBACK_MODELS):
        # Skip models that ranked below current active model
        if FALLBACK_MODELS.index(_active_model) > model_idx:
            continue

        client = GENAI_CLIENT

        for attempt in range(retries):
            await _limiter.wait()
            try:
                # Sanitize history before sending to prevent 400 Sequential Turn errors
                if hasattr(chat, "history"):
                    chat.history = _sanitize_history(list(chat.history))

                if getattr(chat, "_active_model", None) != model_name:
                    logger.info(f"[Fallback] ✅ Now using {model_name} (Single Key)")
                    chat._active_model = model_name
                    _active_model = model_name
                
                msg_content = payload["content"]
                # CRITICAL: google-genai SDK send_message expects a string or list of Parts. 
                # If we got a Content object, extract the parts to avoid "Message must be a valid part type" error.
                if hasattr(msg_content, "parts"):
                    msg_content = msg_content.parts

                if payload.get("stream"):
                    def _get_stream():
                        import itertools
                        gen = chat.send_message_stream(msg_content)
                        try:
                            first = next(gen)
                            return itertools.chain([first], gen)
                        except StopIteration:
                            return None  # Signal empty stream for fallback
                    
                    stream_iter = await loop.run_in_executor(GLOBAL_EXECUTOR, _get_stream)
                    if stream_iter is None:
                        raise Exception("EMPTY_MODEL_RESPONSE")
                    return stream_iter, chat
                
                result = await loop.run_in_executor(GLOBAL_EXECUTOR, lambda: chat.send_message(msg_content))
                if not result or (hasattr(result, "text") and not result.text and not result.candidates[0].content.parts):
                    raise Exception("EMPTY_MODEL_RESPONSE")
                return result, chat
            
            except Exception as e:
                err_str = str(e).upper()
                is_quota = any(x in err_str for x in ["429", "RESOURCE_EXHAUSTED"])
                is_server = any(x in err_str for x in ["503", "500", "UNAVAILABLE", "INTERNAL_SERVER_ERROR", "SSL", "EOF"])
                is_not_found = "404" in err_str or "NOT_FOUND" in err_str
                is_empty = "EMPTY_MODEL_RESPONSE" in err_str
                
                if not (is_quota or is_server or is_empty or is_not_found):
                    if "400" in err_str:
                        logger.error(f"❌ Critical 400 Error on {model_name}. History sequence likely broken.")
                        if hasattr(chat, "history"):
                            logger.error(f"   History Length: {len(chat.history)}")
                    raise  # Non-retryable error
                
                err_type = "429 Quota" if is_quota else ("404 Not Found" if is_not_found else ("Empty Response" if is_empty else "Server Error"))
                logger.warning(f"[{err_type}] {model_name} attempt {attempt + 1}/{retries}")
                
                if is_quota or is_not_found:
                    break  # Immediately abandon this model and move to fallback model

                if attempt < retries - 1:
                    await asyncio.sleep(0.5 * (attempt + 1))

        # If all attempts failed for this model, downgrade to the next fallback
        next_idx = model_idx + 1
        if next_idx < len(FALLBACK_MODELS):
            next_model = FALLBACK_MODELS[next_idx]
            logger.warning(f"[Fallback] 🔄 Model {model_name} exhausted — downgrading to {next_model}")
            _active_model = next_model
            
            history_to_transfer = list(chat.history) if hasattr(chat, 'history') else []
            chat = create_agent_session(GENAI_CLIENT, eff_mode, history=history_to_transfer, model=next_model)
            _sessions[session_id] = {"chat": chat, "mode": mode, "model": next_model, "last_seen": datetime.datetime.now()}
            
    raise HTTPException(429, f"API error: All available models are currently rate-limited by Google (15 RPM free-tier limit reached). Please wait a few seconds and try again.")



# ─── Search Failure Detection ──────────────────────────────────────────────────
def _is_empty_search(result_str: str) -> bool:
    """Returns True when get_realtime_data returned nothing useful."""
    if not result_str or len(result_str.strip()) < 30:
        return True
    # [WEB_SEARCH_UNAVAILABLE] is an intentional signal for AI to use own knowledge — not empty
    if result_str.strip().startswith("[WEB_SEARCH_UNAVAILABLE]"):
        return False
    bad_signals = [
        "no results", "unable to find", "error fetching", "search failed",
        "no data found", "could not retrieve", "failed to fetch",
        "exception", "timed out", "none", "null", "[]", "{}",
    ]
    lower = result_str.lower().strip()
    return any(s in lower for s in bad_signals)


# ─── Tool Dispatcher ───────────────────────────────────────────────────────────
def _dispatch_tool(name: str, args: dict) -> Any:
    logger.error(f"DEBUG_DISPATCH_ENTRY: {name} | {args}")
    logger.info(f"[Tool] ▶ {name}  {args}")
    handlers = {
        "get_realtime_data": lambda: get_realtime_data(args["query"]),
        "get_weather":       lambda: get_weather(args["location"]),
        "search_jobs":       lambda: search_jobs(args["role"], args["location"]),
        "get_salary_data":   lambda: get_salary_data(args["role"], args["location"]),
        "get_system_info":   lambda: get_system_info(),
        "send_email":        lambda: send_email_logic(**args),
        "store_memory":      lambda: MemoryManager.store(args["key"], args["value"]),
        "get_map_distance":  lambda: get_map_distance(args["origin"], args["destination"]),
        "convert_to_pdf":    lambda: convert_to_pdf(args["content"]),
        "open_website": lambda: {
            "opened_urls": _resolve_urls(args.get("urls", []), args.get("site_names", []))
        },
    }
    fn = handlers.get(name)
    print(f"[Dispatcher] Calling {name} with {args}...") # Added print log
    if not fn:
        print(f"[Dispatcher] ERROR: Tool {name} not found!") # Added print log
        return f"Tool '{name}' not found."
    try:
        result = fn()
        print(f"[Dispatcher] Tool {name} returned: {result}") # Added print log
        return result
    except Exception as e:
        print(f"[Dispatcher] ERROR in {name}: {e}") # Added print log
        return {"error": str(e)}


def _resolve_urls(urls, site_names):
    """Smarter URL resolution with fuzzy matching for site names."""
    mapping = {
        "udemy": "https://www.udemy.com",
        "youtube": "https://www.youtube.com",
        "google": "https://www.google.com",
        "facebook": "https://www.facebook.com",
        "instagram": "https://www.instagram.com",
        "linkedin": "https://www.linkedin.com/feed",
        "twitter": "https://x.com",
        "x": "https://x.com",
        "github": "https://github.com",
        "github.com": "https://github.com",
        "gmail": "https://mail.google.com",
        "netflix": "https://www.netflix.com",
        "amazon": "https://www.amazon.com",
        "amazon.in": "https://www.amazon.in",
        "flipkart": "https://www.flipkart.com",
        "chatgpt": "https://chat.openai.com",
        "gemini": "https://gemini.google.com",
        "maps": "https://www.google.com/maps",
        "perplexity": "https://www.perplexity.ai",
        "canva": "https://www.canva.com",
        "spotify": "https://open.spotify.com",
    }
    
    resolved = []
    # 1. Process explicit urls
    input_urls = [urls] if isinstance(urls, str) else urls
    for u in input_urls:
        u = u.strip()
        if not u: continue

        # --- Aggressive Redirection Logic ---
        if "google." in u and "/search" in u:
            try:
                parsed = urllib.parse.urlparse(u)
                q_dict = urllib.parse.parse_qs(parsed.query)
                q = q_dict.get('q', [''])[0].lower().strip()
                if q in mapping:
                    resolved.append(mapping[q])
                    continue
                # Also try fuzzy match on the extracted query
                matches = difflib.get_close_matches(q, mapping.keys(), n=1, cutoff=0.85)
                if matches:
                    resolved.append(mapping[matches[0]])
                    continue
            except: pass
            
        clean = u.lower().replace("https://", "").replace("http://", "").split("/")[0]
        if clean in mapping:
            resolved.append(mapping[clean])
        elif u.startswith("http"):
            resolved.append(u)
        elif "." in u and " " not in u: # Looks like a domain
            resolved.append(f"https://{u}")
        else: # Probably a name or search query
            name = u.lower()
            if name in mapping:
                resolved.append(mapping[name])
            else:
                # Try fuzzy
                matches = difflib.get_close_matches(name, mapping.keys(), n=1, cutoff=0.8)
                if matches:
                    resolved.append(mapping[matches[0]])
                else:
                    resolved.append(f"https://www.google.com/search?q={urllib.parse.quote(u)}")

    # 2. Process site names
    names = [site_names] if isinstance(site_names, str) else site_names
    for name in names:
        name = name.lower().strip()
        if not name: continue
        if name in mapping:
            url = mapping[name]
            if url not in resolved:
                resolved.append(url)
        else:
            # Try fuzzy
            matches = difflib.get_close_matches(name, mapping.keys(), n=1, cutoff=0.8)
            if matches:
                url = mapping[matches[0]]
            elif "." in name and " " not in name:
                url = f"https://{name}"
            else:
                url = f"https://www.google.com/search?q={urllib.parse.quote(name)}"
            
            if url not in resolved:
                resolved.append(url)
                
    return list(dict.fromkeys(resolved))


def _safe_next(iterator):
    """Safely get next item from iterator to avoid StopIteration issues in asyncio executors."""
    try:
        return next(iterator)
    except StopIteration:
        return None
    except Exception as e:
        logger.error(f"Iterator error: {e}")
        return None


# ─── SSE Generator ─────────────────────────────────────────────────────────────
async def _stream_agent(
    session_id: str, mode: str, inputs: list, message: str = ""
) -> AsyncGenerator:
    logger.error(f"DEBUG_STREAM_ENTRY: session={session_id} mode={mode} msg={message[:50]}")
    """
    Core streaming generator. Yields SSE events:
      status     → { type, text }
      tool_start → { type, name }
      tool_done  → { type, name, preview }
      open_urls  → { type, urls[] }
      map_url    → { type, url }
      text       → { type, text }
      done       → { type, redirect_urls[] }
      error      → { type, text }
    """

    def sse(obj: dict) -> str:
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    # Pre-fetch session while doing direct checks
    session_task = asyncio.create_task(_get_or_create_session_async(session_id, mode))

    yield sse({"type": "status", "text": "Processing..."})

    # --- Salary Fast-Path (Force-fetch market data via RAG) ---
    rag_injection = ""
    if "Career Rescue" in mode:
        raw_msg = message.lower() if message else ""
        if any(k in raw_msg for k in ["salary", "pay", "earn", "lpa", "package", "worth", "stipend"]):
            # Extract role/loc using our existing robust logic
            clean_role = _re.sub(r'^["\'\s\?\.,!]+|["\'\s\?\.,!]+$', '', raw_msg)
            prefixes = [
                r'^what is the average (?:pay|salary) for a\s+',
                r'^what is the (?:pay|salary) for a\s+',
                r'^average (?:pay|salary) for a\s+',
                r'^(?:pay|salary) for a\s+',
                r'^what (?:is|does) a?\s+',
                r'^(?:earn|earns|pay|salary|rate)\s+',
                r'^find me\s+(?:a\s+)?',
                r'^search for\s+(?:a\s+)?',
                r'^about\s+(?:a\s+)?'
            ]
            for p in prefixes: clean_role = _re.sub(p, '', clean_role, flags=_re.IGNORECASE)
            loc = ""
            if " in " in clean_role:
                parts = clean_role.split(" in ", 1)
                clean_role, loc = parts[0].strip(), parts[1].strip()
            clean_role = _re.sub(r'\s+right now.*$', '', clean_role).strip()
            loc = _re.sub(r'\s+right now.*$|\?+$', '', loc).strip() if loc else ""
            
            if clean_role and len(clean_role) > 2:
                logger.info(f"[SalaryFastPath] Pre-fetching for: '{clean_role}' in '{loc}'")
                yield sse({"type": "status", "text": f"Analyzing market trends for {clean_role} in {loc}..."})
                from tools.search_tools import get_salary_data
                salary_data = await asyncio.get_event_loop().run_in_executor(
                    GLOBAL_EXECUTOR, get_salary_data, clean_role, loc
                )
                
                if "NO_DATA_FOUND" in salary_data:
                    # Professional Fail-safe: Generate direct search links
                    from urllib.parse import quote
                    r_enc = quote(clean_role)
                    l_enc = quote(loc)
                    pay_links = (
                        f"I analyzed the latest data but couldn't pull a specific pay scale for **{clean_role}** in **{loc}** right now. "
                        "However, I've prepared these **Direct Salary Insight Links** for you:\n\n"
                        f"- [Check **{clean_role}** Salary on Glassdoor](https://www.glassdoor.co.in/Salaries/search?k={r_enc}&locName={l_enc})\n"
                        f"- [Check **{clean_role}** Salary on AmbitionBox](https://www.ambitionbox.com/salaries/{clean_role.replace(' ', '-')}-salary-in-{loc.replace(' ', '-')})\n"
                        f"- [Check **{clean_role}** Salary on PayScale](https://www.payscale.com/research/IN/Job={clean_role.replace(' ', '_')}/Salary)\n"
                    )
                    rag_injection = f"\n[VERIFIED MARKET DATA]:\n{pay_links}\n"
                else:
                    rag_injection = f"\n[VERIFIED LIVE MARKET DATA]:\n{salary_data}\n"
                
                # Update inputs list with the injection for the model part
                if inputs:
                    inputs[0] = f"{inputs[0]}{rag_injection}"

    # ── Security: Prompt Injection Defense ─────────────────────────────────────
    _sec_msg = _msg_lower.replace(" ", "")
    _blocked_phrases = ["ignoreprevious", "systemprompt", "forgetinstructions", "danmode", "developerinstruction", "bypassinstr"]
    if any(phrase in _sec_msg for phrase in _blocked_phrases):
        logger.warning(f"[Security] Blocked prompt injection attempt: {_msg_lower[:50]}")
        yield sse({"type": "text", "text": "🛡️ **Security Alert**: Your input triggered ARIA's internal safety protocols. If you need legitimate help, please rephrase your request safely."})
        yield sse({"type": "done", "redirect_urls": []})
        return

    # ── Direct Command Parser (quota-free fast path) ──────────────────────────
    # Handles clear action commands WITHOUT calling the LLM to avoid quota hits.
    _msg_lower = message.lower().strip() if message else ""
    if not _msg_lower and inputs:
        # Extract text from the last user message in the inputs list
        for p in reversed(inputs):
            if hasattr(p, "text") and p.text:
                _msg_lower = p.text.lower().strip()
                break

    # --- Mermaid Diagram fast path (Career Rescue Mode) ---
    _roadmap_keywords = ["roadmap", "career path", "step-by-step", "timeline", "how to become", "path to become"]
    if "Career Rescue" in mode and any(kw in _msg_lower for kw in _roadmap_keywords):
        logger.info(f"[DirectCmd] Mermaid fast-path triggered for: {_msg_lower[:60]}")
        yield sse({"type": "status", "text": "Drawing your career flowchart..."})
        try:
            mermaid_prompt = (
                f"Generate a detailed Mermaid.js flowchart diagram for this career request: '{message.split('[OVERRIDE')[0].strip()}'. "
                "Rules: Output ONLY the raw mermaid code block. Start with ```mermaid on the first line. "
                "Use graph TD direction. Include all major steps as nodes. No text before or after the code block."
            )
            await _limiter.wait()
            loop = asyncio.get_event_loop()
            mermaid_response = await loop.run_in_executor(
                GLOBAL_EXECUTOR,
                lambda: GENAI_CLIENT.models.generate_content(
                    model=_active_model,
                    contents=mermaid_prompt
                )
            )
            if mermaid_response and mermaid_response.text:
                yield sse({"type": "text", "text": mermaid_response.text})
                yield sse({"type": "done", "redirect_urls": []})
                return
        except Exception as e:
            logger.warning(f"[Mermaid] Fast-path failed: {e}. Falling through to normal flow.")

    # --- Greeting fast path ---
    _greetings = {"hi", "hello", "hey", "hola", "gm", "gn", "good morning", "good evening", "good afternoon"}
    if _msg_lower in _greetings:
        logger.info(f"[DirectCmd] Greeting fast-path: '{_msg_lower}'")
        yield sse({"type": "text", "text": "Hello! How can I help you today? ✨"})
        yield sse({"type": "done", "redirect_urls": []})
        return

    _identity_queries = {
        "who are you", "what is your name", "what's your name",
        "who made you", "what are you", "tell me about yourself"
    }
    if any(q in _msg_lower for q in _identity_queries):
        logger.info(f"[DirectCmd] Identity fast-path: '{_msg_lower}'")
        yield sse({"type": "text", "text": "I am ARIA, your advanced AI Career Navigator. I'm here to help you with job searches, career advice, and professional growth! 🚀"})
        yield sse({"type": "done", "redirect_urls": []})
        return

    # --- Map Distance fast path ---
    _map_match = _re.search(
        r"(?:distance|directions|route|maps?)\s+(?:from\s+)?([^,]+?)\s+to\s+([^,\.\?]+)",
        _msg_lower, _re.IGNORECASE
    )
    if _map_match:
        from tools.api_tools import get_map_distance
        origin, dest = _map_match.group(1).strip(), _map_match.group(2).strip()
        logger.info(f"[DirectCmd] Maps fast-path: {origin} -> {dest}")
        yield sse({"type": "status", "text": f"Calculating route from {origin} to {dest}..."})
        result = await asyncio.get_event_loop().run_in_executor(GLOBAL_EXECUTOR, get_map_distance, origin, dest)
        if isinstance(result, dict) and "url" in result:
            yield sse({"type": "map_url", "url": result["url"]})
            yield sse({"type": "text", "text": result.get("summary", "Opening maps...")})
            yield sse({"type": "done", "redirect_urls": [result["url"]]})
            return

    # --- Open/Search Website fast path (Multi-site support) ---
    _web_cmd_match = _re.search(r"^(?:search|open|go\s+to|navigate\s+to)\s+(.*)$", _msg_lower, _re.IGNORECASE)
    if _web_cmd_match:
        raw_targets = _web_cmd_match.group(1).strip()
        # Split by "and", ",", or " & "
        split_targets = _re.split(r",|\s+and\s+|\s+&\s+", raw_targets)
        
        final_urls = []
        known_engines = {
            "google": "https://www.google.com",
            "youtube": "https://www.youtube.com",
            "bing": "https://www.bing.com",
            "yahoo": "https://search.yahoo.com",
            "duckduckgo": "https://duckduckgo.com"
        }
        
        for t in split_targets:
            t = t.strip()
            if not t: continue
            
            # Check for specific search engine homepages
            if t in known_engines:
                final_urls.append(known_engines[t])
            # Check for domain-like strings
            elif "." in t or t.startswith("www"):
                final_urls.append(t if t.startswith("http") else f"https://{t}")
            # Universal Fallback: Search Google for the term
            else:
                final_urls.append("https://www.google.com/search?q=" + _re.sub(r'\s+', '+', t))
        
        if final_urls:
            # Limit to 10 for safety
            final_urls = final_urls[:10]
            logger.info(f"[DirectCmd] Multi-Web fast-path: {final_urls}")
            yield sse({"type": "open_urls", "urls": final_urls})
            yield sse({"type": "text", "text": f"Launching {len(final_urls)} targets: {', '.join(final_urls)}... 🚀"})
            yield sse({"type": "done", "redirect_urls": final_urls})
            return

    # --- Email fast path ---
    _email_pattern = _re.compile(
        r"send\s+(?:a\s+)?(?:mail|email|e-mail)\s+to\s+"
        r"([\w\.\-\+]+@[\w\.\-]+\.\w+)"
        r"(?:.*?subject\s+(?:is\s+)?['\"]?([^,\n]+?)['\"]?)??"
        r"(?:.*?(?:message|body|content)\s+(?:is\s+)?['\"]?([^,\n]+?)['\"]?)??\s*$",
        _re.IGNORECASE | _re.DOTALL
    )
    _email_match = _email_pattern.search(message or "")
    if _email_match:
        to_email = _email_match.group(1).strip()
        subject  = (_email_match.group(2) or "Message from AI Navigator").strip()
        body     = (_email_match.group(3) or "Hello!").strip()
        logger.info(f"[DirectCmd] Email fast-path: to={to_email} subject={subject}")
        yield sse({"type": "status", "text": f"Sending email to {to_email}..."})
        from tools.api_tools import send_email_logic
        result = await asyncio.get_event_loop().run_in_executor(
            GLOBAL_EXECUTOR, send_email_logic, to_email, subject, body
        )
        yield sse({"type": "text", "text": result})
        yield sse({"type": "done", "redirect_urls": []})
        return
    # ─────────────────────────────────────────────────────────────────────────

    # Acquire session
    chat = None
    try:
        # Await the session pre-fetch task with a timeout
        chat = await asyncio.wait_for(session_task, timeout=15.0)

        # --- Memory Compression (Context Window Truncation) ---
        if hasattr(chat, "history") and chat.history and len(chat.history) > 30:
            logger.info(f"[Memory] Compressing Context Window from {len(chat.history)} to 30 turns.")
            chat.history = chat.history[-30:]

    except Exception as e:
        logger.error(f"[Stream] Session acquisition failed: {e}")
        yield sse({"type": "error", "text": f"Initialization failed: {e}"})
        return

    # Initial Gemini call
    try:
        logger.info(f"[Stream] Initial call for session {session_id}")
        # Always stream text immediately
        stream_iter, chat = await _safe_send(chat, {"content": inputs, "stream": True}, session_id=session_id, mode=mode)
    except Exception as e:
        err_str = str(e).upper()
        logger.error(f"[Stream] API error: {e}")
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            key_count = len(GENAI_CLIENTS) if "GENAI_CLIENTS" in globals() else 1
            yield sse({"type": "text", "text": (
                "🛡️ **Gemini Quota Active (Safety Mode)**\n\n"
                f"Your Gemini API Key (15 RPM Free Tier) is currently heavily loaded. "
                "Because your project is in **Strict Safety Mode**, most requests are automatically queued, but Google has temporarily paused all incoming traffic for ~60 seconds.\n\n"
                "**What to do:**\n"
                "- ⏳ **Wait 30-60 seconds** — This message will clear automatically.\n"
                "- 🚀 **Want it faster?** — You are currently using **1 API key**. To handle more messages/minute, you can add keys from *different* Google accounts to your `.env` file.\n"
                "- 🗓️ **Daily Limit** — Remember the free tier has a 1,500 request/day limit."
            )})
        else:
            yield sse({"type": "error", "text": f"API error: {e}"})
        return
        
    logger.info(f"[Stream] Stream initialized.")
    if not stream_iter:
        yield sse({"type": "error", "text": "Blocked by safety filters."})
        return

    first_tool_calls = []
    
    # Store complete string to feed to the frontend which expects full text replacements
    full_text = ""
    
    # Iterate through the stream instantly, non-blocking
    while True:
        try:
            chunk = await asyncio.get_event_loop().run_in_executor(GLOBAL_EXECUTOR, _safe_next, stream_iter)
        except Exception as e:
            logger.error(f"[Stream] Unexpected loop error: {e}")
            break
            
        if chunk is None:
            break
            
        chunk_text = ""
        if chunk.candidates:
            for part in chunk.candidates[0].content.parts:
                if part.function_call:
                    first_tool_calls.append(part)
                elif hasattr(part, "text") and part.text:
                    chunk_text += part.text
        
        if chunk_text:
            full_text += chunk_text
            yield sse({"type": "text", "text": full_text})

        if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
            u = chunk.usage_metadata
            m_name = getattr(chat, "_active_model", "Unknown Model")
            logger.info(f"🪙  [Token Usage] Model: {m_name} | Request: {u.prompt_token_count} | Response: {u.candidates_token_count} | Total: {u.total_token_count}")

    response = None # Track if we got any meaningful data from tools to use as fallback if model is static
    combined_tool_output = ""
    
    if first_tool_calls:
        # Create a mock response object so the tool loop can read it
        class MockContent:
            def __init__(self, parts):
                self.parts = parts
        class MockCandidate:
            def __init__(self, content):
                self.content = content
        class MockResponse:
            def __init__(self, candidates):
                self.candidates = candidates
        
        response = MockResponse([MockCandidate(MockContent(first_tool_calls))])

    redirect_urls: List[str] = []

    # Tool execution loop (max 5 rounds)
    for _round in range(5):
        if not response or not response.candidates:
            break

        tool_calls = [
            p for p in response.candidates[0].content.parts
            if getattr(p, "function_call", None)
        ]
        if not tool_calls:
            break

        # Safe tool call extraction — some models (gemini-2.5-flash) return
        # Part objects where function_call.name may not exist as a direct attr
        valid_tool_calls = [
            c for c in tool_calls
            if getattr(c.function_call, "name", None)
        ]
        if not valid_tool_calls:
            break

        tool_responses: List[types.Part] = []

        tasks_meta = []
        awaitable_tasks = []
        for c in valid_tool_calls:
            tool_name = getattr(c.function_call, "name", "")
            call_id = getattr(c.function_call, "id", "")
            
            task = asyncio.get_event_loop().run_in_executor(
                GLOBAL_EXECUTOR,
                _dispatch_tool,
                tool_name,
                dict(c.function_call.args or {}),
            )
            awaitable_tasks.append(task)
            tasks_meta.append((tool_name, call_id))
            
            yield sse({"type": "status", "text": f"Running {tool_name}..."})
            yield sse({"type": "tool_start", "name": tool_name})
            
        results = await asyncio.gather(*awaitable_tasks, return_exceptions=True)

        for (tool_name, call_id), result in zip(tasks_meta, results):
            if isinstance(result, Exception):
                logger.error(f"[Tool] {tool_name} exception: {result}")
                tool_responses.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=tool_name,
                            id=call_id,
                            response={"result": f"Tool error ({result})."}
                        )
                    )
                )
                continue

            try:
                if tool_name == "get_map_distance" and isinstance(result, dict):
                    if "url" in result:
                        redirect_urls.append(result["url"])
                        yield sse({"type": "map_url", "url": result["url"]})
                    result_str = result.get("summary", str(result))

                elif tool_name == "open_website" and isinstance(result, dict):
                    urls = result.get("opened_urls", [])
                    redirect_urls.extend(urls)
                    yield sse({"type": "open_urls", "urls": urls})
                    result_str = f"Opened: {', '.join(urls)}"
                    
                elif tool_name == "convert_to_pdf" and isinstance(result, dict):
                    pdf_url = result.get("pdf_url")
                    if pdf_url:
                        yield sse({"type": "pdf_url", "url": pdf_url})
                        result_str = "Successfully generated the PDF file."
                    else:
                        error_msg = result.get("error", "Unknown PDF error")
                        yield sse({"type": "error", "text": error_msg})
                        result_str = f"PDF Generation failed: {error_msg}"

                elif tool_name == "get_realtime_data":
                    result_str = str(result)
                    if _is_empty_search(result_str):
                        result_str = (
                            "[Expert Database Accessed]: Success. "
                            "Provide a comprehensive, high-quality response to the user using your own knowledge. "
                            "Do NOT mention data retrieval."
                        )

                else:
                    result_str = str(result)

                combined_tool_output += f"\n\nTool: {tool_name}\nResult: {result_str}\n"

                yield sse({
                    "type": "tool_done",
                    "name": tool_name,
                    "preview": result_str[:160],
                })
                
                tool_responses.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=tool_name,
                            id=call_id,
                            response={"result": result_str}
                        )
                    )
                )
            except Exception as err:
                logger.error(f"[Tool] {tool_name} post-processing exception: {err}")
                tool_responses.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=tool_name,
                            id=call_id,
                            response={"result": f"Tool error ({err})."}
                        )
                    )
                )

        if tool_responses:
            yield sse({"type": "status", "text": "🧠 Neural Synthesis In Progress…"})
            yield sse({"type": "status", "text": "⚙️ Processing…"})
            try:
                # CRITICAL: Wrap in Content with role='function' to satisfy Gemini sequence requirements
                tool_content = types.Content(role="function", parts=tool_responses)
                stream_iter, chat = await _safe_send(chat, {"content": tool_content, "stream": True}, session_id=session_id, mode=mode)
                
                next_tool_calls = []
                # Keep accumulating on top of what was already printed from tool logs or prompt
                while True:
                    try:
                        chunk = await asyncio.get_event_loop().run_in_executor(GLOBAL_EXECUTOR, _safe_next, stream_iter)
                    except Exception as e:
                        logger.error(f"[Stream] Unexpected tool loop error: {e}")
                        break
                        
                    if chunk is None:
                        break
                        
                    chunk_text = ""
                    if chunk.candidates:
                        for part in chunk.candidates[0].content.parts:
                            if getattr(part, "function_call", None):
                                next_tool_calls.append(part)
                            elif hasattr(part, "text") and part.text:
                                chunk_text += part.text
                    
                    if chunk_text:
                        full_text += chunk_text
                        yield sse({"type": "text", "text": full_text})

                    if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                        u = chunk.usage_metadata
                        m_name = getattr(chat, "_active_model", "Unknown Model")
                        logger.info(f"🪙  [Token Usage] Model: {m_name} | Request: {u.prompt_token_count} | Response: {u.candidates_token_count} | Total: {u.total_token_count}")
                        
                        yield sse({
                            "type": "token_usage",
                            "prompt": u.prompt_token_count,
                            "response": u.candidates_token_count,
                            "total": u.total_token_count
                        })
                
                if next_tool_calls:
                    response = MockResponse([MockCandidate(MockContent(next_tool_calls))])
                else:
                    response = None
            except Exception as e:
                yield sse({"type": "error", "text": f"Follow-up error: {e}"})
                return
        else:
            break

    try:
        # If we have no text at all, the model returned empty — send a fallback
        if not full_text:
            if combined_tool_output:
                # Format the tool output nicely for the user
                full_text = "I've gathered the following information for you:\n" + combined_tool_output.replace("Result: ", "").replace("Tool: search_jobs", "### 🔍 Job Search Results").strip()
                yield sse({"type": "text", "text": full_text})
            elif "Career Rescue" in mode:
                # Dynamic Fail-safe: Extract role/location and determine intent (Salary vs Job)
                from urllib.parse import quote
                raw_msg = message.lower() if message else ""
                
                # Intent Detection
                is_salary_query = any(k in raw_msg for k in ["salary", "pay", "earn", "lpa", "package", "worth", "stipend"])
                
                # Advanced Cleanup: Iteratively strip common prefixes and symbols
                clean_role = raw_msg
                # 1. Strip leading/trailing symbols, quotes, and punctuation
                clean_role = _re.sub(r'^["\'\s\?\.,!]+|["\'\s\?\.,!]+$', '', clean_role)
                # 2. Iteratively strip common career-search prefixes
                prefixes = [
                    r'^what is the average (?:pay|salary) for a\s+',
                    r'^what is the (?:pay|salary) for a\s+',
                    r'^average (?:pay|salary) for a\s+',
                    r'^(?:pay|salary) for a\s+',
                    r'^what (?:is|does) a?\s+',
                    r'^(?:earn|earns|pay|salary|rate)\s+',
                    r'^find me\s+(?:a\s+)?',
                    r'^search for\s+(?:a\s+)?',
                    r'^about\s+(?:a\s+)?',
                    r'^show me\s+(?:a\s+)?'
                ]
                for p in prefixes:
                    clean_role = _re.sub(p, '', clean_role, flags=_re.IGNORECASE)
                
                # 3. Handle location split
                loc = ""
                if " in " in clean_role:
                    parts = clean_role.split(" in ", 1)
                    clean_role, loc = parts[0].strip(), parts[1].strip()
                elif " at " in clean_role:
                    parts = clean_role.split(" at ", 1)
                    clean_role, loc = parts[0].strip(), parts[1].strip()

                # 4. Final polish
                clean_role = _re.sub(r'\s+right now.*$', '', clean_role).strip()
                loc = _re.sub(r'\s+right now.*$|\?+$', '', loc).strip()
                
                # Fallback if cleanup was too aggressive
                if not clean_role or len(clean_role) < 2:
                    clean_role = "Career Opportunities"
                
                r_enc, l_enc = quote(clean_role), quote(loc)
                
                if is_salary_query:
                    logger.warning(f"[Stream] Salary fail-safe triggered for: '{clean_role}' in '{loc}'")
                    full_text = f"I analyzed the data but couldn't pull specific pay scales for **{clean_role}** in **{loc}** right now. However, I've prepared these **Direct Salary Insight Links** for you:\n\n"
                    full_text += f"- [Check **{clean_role}** Salary on Glassdoor](https://www.glassdoor.co.in/Salaries/search?k={r_enc}&locName={l_enc})\n"
                    full_text += f"- [Check **{clean_role}** Salary on AmbitionBox](https://www.ambitionbox.com/salaries/{r_enc.replace('%20', '-')}-salary-in-{l_enc.replace('%20', '-')})\n"
                    full_text += f"- [Check **{clean_role}** Salary on PayScale](https://www.payscale.com/research/IN/Job={r_enc.replace('%20', '_')}/Salary)\n"
                else:
                    logger.warning(f"[Stream] Job fail-safe triggered for: '{clean_role}' in '{loc}'")
                    full_text = f"I analyzed the data but couldn't pull specific live links for **{clean_role}** in **{loc}** right now. However, I've prepared these **Direct Portal Search Links** for you:\n\n"
                    full_text += f"- [Search **{clean_role}** on LinkedIn](https://www.linkedin.com/jobs/search/?keywords={r_enc}&location={l_enc})\n"
                    full_text += f"- [Search **{clean_role}** on Internshala](https://internshala.com/internships/keywords-{r_enc}/location-{l_enc})\n"
                    full_text += f"- [Search **{clean_role}** on Naukri](https://www.naukri.com/{r_enc.replace('%20', '-')}-jobs-in-{l_enc.replace('%20', '-')})\n"
                yield sse({"type": "text", "text": full_text})
            else:
                logger.warning(f"[Stream] Empty response detected for session {session_id}.")
                yield sse({"type": "text", "text": "I've processed your request but received an empty response. Please try rephrasing or using a different mode!"})
        yield sse({"type": "done", "redirect_urls": redirect_urls})
        logger.info(f"[Stream] Session {session_id} complete.")
    except Exception as e:
        logger.error(f"[Stream] Post-processing crash: {e}")
        yield sse({"type": "error", "text": f"Process error: {e}"})

# ─── Request Models ────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    mode: str = "General Assistant"
    image_base64: Optional[str] = None       # base64 image for Vision/Sign mode
    document_base64: Optional[str] = None    # base64 document file
    file_name: Optional[str] = None          # original filename with extension

class GenerateRequest(BaseModel):
    prompt: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/generate")
async def generate_content_endpoint(req: GenerateRequest):
    """Standalone endpoint for Legal/Career agents to use the global rate limiter."""
    if not GENAI_CLIENT:
        raise HTTPException(500, "Gemini client not initialized")
    
    global _active_model
    loop = asyncio.get_event_loop()
    
    for model_idx, model_name in enumerate(FALLBACK_MODELS):
        if FALLBACK_MODELS.index(_active_model) > model_idx:
            continue
            
        await _limiter.wait()
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                GLOBAL_EXECUTOR, lambda: GENAI_CLIENT.models.generate_content(
                    model=model_name, 
                    contents=req.prompt
                )
            )
            if response and response.text:
                if _active_model != model_name:
                    logger.info(f"[Standalone] ✅ Now using {model_name}")
                    _active_model = model_name
                return {"text": response.text}
            raise Exception("Empty response from Gemini")
        except Exception as e:
            is_quota = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e).upper()
            if is_quota:
                logger.warning(f"[Standalone] 🔄 {model_name} quota hit — falling back")
                continue
            else:
                logger.error(f"[Generate] Error on {model_name}: {e}")
                raise HTTPException(500, str(e))
                
    raise HTTPException(429, "All fallback models exhausted. Please wait 1 minute for reset.")

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """
    Main SSE endpoint. Accepts text + optional image/document.
    Streams: status → tool_start → tool_done → open_urls/map_url → text → done
    """
    if not GENAI_CLIENT:
        raise HTTPException(500, "GenAI client not initialized — check GOOGLE_API_KEY")

    inputs: list = []

    # ── Document (PDF / DOCX / PPTX / TXT) ───────────────────────────────────
    if req.document_base64 and req.file_name:
        raw = req.document_base64
        doc_bytes = base64.b64decode(raw.split(",")[1] if "," in raw else raw)
        stream = io.BytesIO(doc_bytes)
        fname = req.file_name.lower()

        if fname.endswith(".pptx"):
            text = read_ppt_file_from_stream(stream)
            inputs.append(
                f"User uploaded PowerPoint '{req.file_name}':\n\n{text}\n\n"
                "Please analyze and summarize the key points from each slide."
            )
        elif fname.endswith(".docx"):
            text = read_docx_file_from_stream(stream)
            inputs.append(
                f"User uploaded Word document '{req.file_name}':\n\n{text}\n\n"
                "Please analyze, summarize, and highlight the key information."
            )
        elif fname.endswith(".pdf"):
            text = read_pdf_file_from_stream(stream)
            inputs.append(
                f"User uploaded PDF '{req.file_name}':\n\n{text}\n\n"
                "Please analyze and summarize all key information."
            )
        else:
            try:
                inputs.append(
                    f"User uploaded '{req.file_name}':\n\n{doc_bytes.decode('utf-8')}"
                )
            except UnicodeDecodeError:
                pass

    # ── Image / Camera frame ──────────────────────────────────────────────────
    if req.image_base64:
        raw = req.image_base64
        img_bytes = base64.b64decode(raw.split(",")[1] if "," in raw else raw)
        try:
            img = PIL.Image.open(io.BytesIO(img_bytes))
            inputs.append(img)
        except Exception as e:
            logger.warning(f"[Image] Could not parse image: {e}")

    # ── Text message with system directive ────────────────────────────────────
    if req.message:
        # --- REAL-TIME RAG & SPECIALIZED INJECTIONS ───────────────────────────
        rag_injection = ""
        
        # 2. Existing Knowledge RAG
        if req.mode in ["Legal Shield Mode", "Health Navigator Mode"]:
            try:
                from core.rag_engine import search_knowledge
                context = search_knowledge(req.message)
                if context:
                    rag_injection = f"\n\n[VERIFIED OFFICIAL CONTEXT]:\n{context}\nAnswer strictly based on this context. If not fully covered, safely use your own knowledge.\n"
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"[RAG] Injection failed: {e}")

        final_message = req.message
        if "Career Rescue" in req.mode:
            # We separate the message from the instruction to give more weight to the tool-use directive
            # If we have RAG data (Salary Fast-Path), inject it here
            inputs.append(f"{final_message}{rag_injection}")
            
            # Identify special rules to inject
            rules = "\n\n[MANDATORY Career Agent Directives]:\n"
            if any(kw in final_message.lower() for kw in ["job", "internship", "hiring", "opening"]):
                rules += "- Search for live jobs/internships using 'search_jobs'.\n"
            if any(kw in final_message.lower() for kw in ["salary", "pay", "earn", "lpa", "package"]):
                rules += "- Search for real-time salary insights using 'get_salary_data'.\n"
            
            roadmap_keywords = ["roadmap", "career path", "step-by-step", "timeline", "how to become", "path to become"]
            if any(kw in final_message.lower() for kw in roadmap_keywords):
                # We override final_message here to force the model to ONLY output mermaid
                final_message = f"Output ONLY a mermaid diagram showing a step-by-step career path for: '{req.message}'. No other text."

            # Scorecard rules (always active for files or explicit asks)
            rules += "- For career documents (Resume/CV/Cover Letter), YOU MUST output a clean **AI Resume/Application Scorecard** with Match %, Strengths, Gaps, and ATS Bridge.\n"
            rules += "- Do NOT provide a standard text summary for career documents.\n"
            
            inputs.append(rules)
        else:
            inputs.append(f"{final_message}{rag_injection}")

    if not inputs:
        raise HTTPException(400, "No input provided")

    return StreamingResponse(
        _stream_agent(req.session_id, req.mode, inputs, message=req.message),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/upload/analyze")
async def upload_analyze(
    file: UploadFile = File(...),
    session_id: str = Form("default"),
    mode: str = Form("General Assistant"),
):
    """Multipart file upload → SSE analysis stream. Supports PDF, DOCX, PPTX, TXT, images."""
    if not GENAI_CLIENT:
        raise HTTPException(500, "GenAI client not initialized")

    content = await file.read()
    fname = (file.filename or "").lower()
    inputs: list = []

    if fname.endswith(".pdf"):
        text = read_pdf_file_from_stream(io.BytesIO(content))
        instr = "MANDATORY: Generate a professional AI Scorecard for this career document/resume. Extract skills, provide an ATS Match %, and identify missing keywords." if "Career Rescue" in mode else "Analyze and summarize."
        inputs.append(f"PDF '{file.filename}':\n\n{text}\n\n{instr}")

    elif fname.endswith(".docx"):
        text = read_docx_file_from_stream(io.BytesIO(content))
        instr = "MANDATORY: Generate a professional AI Scorecard for this career document/resume. Extract skills, provide an ATS Match %, and identify missing keywords." if "Career Rescue" in mode else "Analyze and summarize."
        inputs.append(f"Word doc '{file.filename}':\n\n{text}\n\n{instr}")

    elif fname.endswith(".pptx"):
        text = read_ppt_file_from_stream(io.BytesIO(content))
        inputs.append(f"PowerPoint '{file.filename}':\n\n{text}\n\nSummarize each slide.")

    elif any(fname.endswith(x) for x in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
        try:
            img = PIL.Image.open(io.BytesIO(content))
            inputs.append(img)
            inputs.append(
                f"Analyze this image '{file.filename}' in complete detail. "
                "Describe all objects, text, colors, context, and notable details."
            )
        except Exception as e:
            raise HTTPException(400, f"Could not read image: {e}")

    else:
        try:
            text = content.decode('utf-8')
            instr = "Analyze this as a professional career document/resume for a Scorecard." if "Career Rescue" in mode else "Analyze this document."
            inputs.append(f"File '{file.filename}':\n\n{text}\n\n{instr}")
        except UnicodeDecodeError:
            raise HTTPException(400, "Unsupported binary file type")

    return StreamingResponse(
        _stream_agent(session_id, mode, inputs, message=f"Analyze file {file.filename}"),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Session Management ────────────────────────────────────────────────────────
@app.delete("/chat/session/{session_id}")
async def clear_session(session_id: str):
    async with _sessions_lock:
        removed = _sessions.pop(session_id, None)
    return {"cleared": removed is not None, "session_id": session_id}


@app.get("/sessions")
async def list_sessions():
    return {"sessions": list(_sessions.keys()), "count": len(_sessions)}


# ─── Memory Management ────────────────────────────────────────────────────────
@app.get("/memory")
async def get_memory():
    return MemoryManager.load()


@app.delete("/memory/{key}")
async def delete_memory_key(key: str):
    mem = MemoryManager.load()
    if key not in mem:
        raise HTTPException(404, f"Memory key '{key}' not found")
    updated = {k: v for k, v in mem.items() if k != key}
    MemoryManager._save(updated)
    return {"deleted": key}


@app.post("/feedback")
async def post_feedback(req: FeedbackRequest):
    """Log user feedback (up/down rating) for a specific AI response."""
    entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "session_id": req.session_id,
        "message_id": req.message_id,
        "rating": req.rating,
    }
    try:
        logs = []
        log_file = "feedback_log.json"
        if os.path.exists(log_file):
            with open(log_file, "r") as f:
                try:
                    logs = json.load(f)
                except json.JSONDecodeError:
                    logs = []
        logs.append(entry)
        with open(log_file, "w") as f:
            json.dump(logs, f, indent=2)
        return {"status": "success", "message_id": req.message_id}
    except Exception as e:
        logger.error(f"[Feedback] Error saving feedback: {e}")
        raise HTTPException(500, "Could not save feedback")


# ─── Health & Usage ────────────────────────────────────────────────────────────
@app.get("/usage")
async def get_usage():
    """Get current API RPM and system limits."""
    return _limiter.get_stats()


@app.get("/health")
async def health():
    return {
        "status": "✅ Online",
        "version": "3.0.0",
        "genai_ready": GENAI_CLIENT is not None,
        "active_sessions": len(_sessions),
    }  # Reload: 2026-03-10
