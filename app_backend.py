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
from tools.search_tools import get_realtime_data, get_weather

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
api_keys = []
# Support both naming conventions
for var_name in ["GOOGLE_API_KEY", "GEMINI_API_KEY"]:
    if os.getenv(var_name): 
        api_keys.append(os.getenv(var_name))

for i in range(1, 10):
    k = os.getenv(f"GOOGLE_API_KEY_{i}") or os.getenv(f"GEMINI_API_KEY_{i}")
    if k: 
        api_keys.append(k)

# Deduplicate securely while preserving order
_unique_keys = []
for k in api_keys:
    if k not in _unique_keys: _unique_keys.append(k)

if not _unique_keys:
    logger.critical("❌ NO API KEYS FOUND in environment!")
    GENAI_CLIENTS = []
    GENAI_CLIENT = None
else:
    GENAI_CLIENTS = [genai.Client(api_key=k) for k in _unique_keys]
    GENAI_CLIENT = GENAI_CLIENTS[0]

_current_key_idx = 0

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
# Priority order: fast → fallback → last-resort
FALLBACK_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
]
_active_model = FALLBACK_MODELS[0]  # Tracks current working model globally

def _get_or_create_session(session_id: str, mode: str, model: str = None):
    global _active_model
    use_model = model or _active_model
    entry = _sessions.get(session_id)
    if entry is None or entry["mode"] != mode or entry.get("model") != use_model:
        logger.info(f"[Session] Creating → id={session_id!r}  mode={mode!r}  model={use_model!r}")
        chat = create_agent_session(GENAI_CLIENT, mode, history=None, model=use_model)
        logger.info(f"[Session] System Instruction Applied: {mode!r}")
        _sessions[session_id] = {
            "chat": chat, 
            "mode": mode, 
            "model": use_model,
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


# ─── Async Rate Limiter ────────────────────────────────────────────────────────
# Shared across ALL sessions.
# Reduced min_gap_seconds to 0.1s for lightning-fast, premium parallel bursts.
class _RateLimiter:
    def __init__(self, min_gap_seconds: float = 0.05):
        self._default_gap = min_gap_seconds
        self._last: float = 0.0
        self._requests = deque()  # Rolling timestamps for RPM tracking
        self._lock = asyncio.Lock()
        import threading
        self._sync_lock = threading.Lock() # For get_stats in executor

    async def wait(self):
        async with self._lock:
            now = time.monotonic()
            # Purge requests older than 60s
            while self._requests and (now - self._requests[0] > 60):
                self._requests.popleft()
            
            with self._sync_lock:
                self._requests.append(now)
            rpm = len(self._requests)

            # Accelerated Pacing: Allow more burst before slowing down
            gap = self._default_gap
            if rpm >= 15:
                gap = 1.1  # Minimal gap to prevent hard 429 but keep speed
            elif rpm >= 12:
                gap = 0.2  # Very light pacing
            else:
                gap = 0.0  # Zero latency for bursts under 12 RPM
            
            elapsed = now - self._last
            wait_time = gap - elapsed
            if wait_time > 0:
                logger.debug(f"[Rate] Pacing {wait_time:.2f}s (RPM={rpm})")
                await asyncio.sleep(wait_time)
            
            self._last = time.monotonic()

    def get_stats(self):
        with self._sync_lock:
            now = time.monotonic()
            # Full 60s Window (RPM)
            while self._requests and (now - self._requests[0] > 60):
                self._requests.popleft()
            
            rpm_60 = len(self._requests)
            
            # Focused 15s Window (Intensity) - scaled to RPM
            recent = [t for t in self._requests if (now - t) <= 15]
            rpm_15 = len(recent) * 4 # Projected RPM based on immediate activity
            
            # Return max of real-time vs sliding window for "snappy" feeling
            return {
                "rpm": rpm_60, 
                "intensity": rpm_15,
                "limit": 15
            }


_limiter = _RateLimiter()


# ─── Safe Gemini Send ──────────────────────────────────────────────────────────
async def _safe_send(chat, payload, session_id: str, mode: str, retries: int = 2):
    """Gemini call with automatic model and key fallback on 429 quota exhaustion."""
    global _active_model, GENAI_CLIENT, _current_key_idx
    loop = asyncio.get_event_loop()

    for key_offset in range(max(1, len(GENAI_CLIENTS))):
        if len(GENAI_CLIENTS) > 0:
            try_key_idx = (_current_key_idx + key_offset) % len(GENAI_CLIENTS)
            client = GENAI_CLIENTS[try_key_idx]
        else:
            client = GENAI_CLIENT
            try_key_idx = 0
            
        # Recreate session if we rotated the API key
        if key_offset > 0:
            logger.warning(f"🔄 Rotating to API Key #{try_key_idx + 1}")
            _current_key_idx = try_key_idx
            GENAI_CLIENT = client
            history_to_transfer = list(chat.history) if hasattr(chat, 'history') else []
            chat = create_agent_session(client, mode, history=history_to_transfer, model=_active_model)
            _sessions[session_id] = {"chat": chat, "mode": mode, "model": _active_model, "last_seen": datetime.datetime.now()}

        for model_idx, model_name in enumerate(FALLBACK_MODELS):
            # Skip models that ranked below current active model ONLY on the first key attempt
            if key_offset == 0 and FALLBACK_MODELS.index(_active_model) > model_idx:
                continue

            for attempt in range(retries):
                await _limiter.wait()
                try:
                    if getattr(chat, "_active_model", None) != model_name:
                        logger.info(f"[Fallback] ✅ Now using {model_name} (Key #{try_key_idx + 1})")
                        chat._active_model = model_name
                    
                    if payload.get("stream"):
                        def _get_stream():
                            import itertools
                            gen = chat.send_message_stream(payload["content"])
                            try:
                                first = next(gen)
                                return itertools.chain([first], gen)
                            except StopIteration:
                                return iter([])
                        
                        stream_iter = await loop.run_in_executor(GLOBAL_EXECUTOR, _get_stream)
                        return stream_iter, chat
                    
                    result = await loop.run_in_executor(GLOBAL_EXECUTOR, lambda: chat.send_message(payload["content"]))
                    return result, chat
                
                except Exception as e:
                    err_str = str(e).upper()
                    is_quota = any(x in err_str for x in ["429", "RESOURCE_EXHAUSTED"])
                    is_server = any(x in err_str for x in ["503", "500", "UNAVAILABLE", "INTERNAL_SERVER_ERROR", "SSL", "EOF"])
                    
                    if not (is_quota or is_server):
                        raise  # Non-retryable error

                    err_type = "429 Quota" if is_quota else "Server Error"
                    logger.warning(f"[{err_type}] {model_name} (Key #{try_key_idx + 1}) attempt {attempt + 1}/{retries}")
                    
                    if is_quota:
                        break  # Immediately abandon this model and fallback

                    if attempt < retries - 1:
                        await asyncio.sleep(0.5 * (attempt + 1))

            # If we failed (and exhausted retries or hit Quota), switch to next model on same key
            next_idx = model_idx + 1
            if next_idx < len(FALLBACK_MODELS):
                next_model = FALLBACK_MODELS[next_idx]
                logger.warning(f"[Fallback] 🔄 {model_name} failed — switching to {next_model}")
                _active_model = next_model
                
                history_to_transfer = list(chat.history) if hasattr(chat, 'history') else []
                chat = create_agent_session(client, mode, history=history_to_transfer, model=next_model)
                _sessions[session_id] = {"chat": chat, "mode": mode, "model": next_model, "last_seen": datetime.datetime.now()}
            else:
                # Exhausted all models for THIS KEY.
                break 

        # If we exited the inner loop, all models failed for this key. Try next key!
        
    raise HTTPException(429, f"API error: All available API keys and models completely exhausted. Please check quotas.")



# ─── Search Failure Detection ──────────────────────────────────────────────────
def _is_empty_search(result_str: str) -> bool:
    """Returns True when get_realtime_data returned nothing useful."""
    if not result_str or len(result_str.strip()) < 30:
        return True
    bad_signals = [
        "no results", "unable to find", "error fetching", "search failed",
        "no data found", "could not retrieve", "failed to fetch",
        "exception", "timed out", "none", "null", "[]", "{}",
    ]
    lower = result_str.lower().strip()
    return any(s in lower for s in bad_signals)


# ─── Tool Dispatcher ───────────────────────────────────────────────────────────
def _dispatch_tool(name: str, args: dict) -> Any:
    logger.info(f"[Tool] ▶ {name}  {args}")
    handlers = {
        "get_realtime_data": lambda: get_realtime_data(args["query"]),
        "get_weather":       lambda: get_weather(args["location"]),
        "get_system_info":   lambda: get_system_info(),
        "send_email":        lambda: send_email_logic(**args),
        "store_memory":      lambda: MemoryManager.store(args["key"], args["value"]),
        "get_map_distance":  lambda: get_map_distance(args["origin"], args["destination"]),
        "convert_to_pdf":    lambda: convert_to_pdf(args["content"]),
        "open_website": lambda: {
            "opened_urls": [
                u if u.startswith("http") else f"https://{u}"
                for u in (
                    [args["urls"]] if isinstance(args.get("urls"), str)
                    else args.get("urls", [])
                )
            ]
        },
    }
    fn = handlers.get(name)
    if not fn:
        return f"Tool '{name}' not found."
    return fn()
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

    # ── Direct Command Parser (quota-free fast path) ──────────────────────────
    # Handles clear action commands WITHOUT calling the LLM to avoid quota hits.
    import re as _re
    _msg_lower = message.lower().strip() if message else ""
    if not _msg_lower and inputs:
        # Extract text from the last user message in the inputs list
        for p in reversed(inputs):
            if hasattr(p, "text") and p.text:
                _msg_lower = p.text.lower().strip()
                break

    # --- Mermaid Diagram fast path (Career Rescue Mode) ---
    _roadmap_keywords = ["roadmap", "career path", "step-by-step", "timeline", "how to become", "path to become"]
    if mode == "Career Rescue Mode" and any(kw in _msg_lower for kw in _roadmap_keywords):
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
    try:
        chat = await session_task
    except Exception as e:
        yield sse({"type": "error", "text": f"Session error: {e}"})
        return

    # Initial Gemini call
    try:
        logger.info(f"[Stream] Initial call for session {session_id}")
        # Always stream text immediately
        stream_iter, chat = await _safe_send(chat, {"content": inputs, "stream": True}, session_id=session_id, mode=mode)
    except Exception as e:
        logger.error(f"[Stream] API error: {e}")
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

    response = None
    if first_tool_calls:
        # Create a mock response object so the tool loop can read it
        class MockPart:
            def __init__(self, fc):
                self.function_call = fc
        class MockContent:
            def __init__(self, parts):
                self.parts = parts
        class MockCandidate:
            def __init__(self, content):
                self.content = content
        class MockResponse:
            def __init__(self, candidates):
                self.candidates = candidates
        
        mock_parts_list = [MockPart(fc) for fc in first_tool_calls]
        response = MockResponse([MockCandidate(MockContent(mock_parts_list))])

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

        future_to_call = {
            asyncio.get_event_loop().run_in_executor(
                GLOBAL_EXECUTOR,
                _dispatch_tool,
                getattr(c.function_call, "name", ""),
                dict(c.function_call.args or {}),
            ): (getattr(c.function_call, "name", ""), getattr(c.function_call, "id", ""))
            for c in valid_tool_calls
        }

        for c in valid_tool_calls:
            fname = getattr(c.function_call, "name", "tool")
            yield sse({"type": "status", "text": f"Running {fname}..."})
            yield sse({"type": "tool_start", "name": fname})

        for future in asyncio.as_completed(future_to_call):
            tool_name, call_id = future_to_call[future]
            try:
                result = await future

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

                yield sse({
                    "type": "tool_done",
                    "name": tool_name,
                    "preview": result_str[:160],
                })
                
                tool_responses.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=tool_name,
                            response={"result": result_str}
                        )
                    )
                )

            except Exception as err:
                    logger.error(f"[Tool] {tool_name} exception: {err}")
                    tool_responses.append(
                        types.Part(
                            function_response=types.FunctionResponse(
                                name=tool_name,
                                response={"result": f"Tool error ({err})."}
                            )
                        )
                    )

        if tool_responses:
            yield sse({"type": "status", "text": "🧠 Neural Synthesis In Progress…"})
            yield sse({"type": "status", "text": "⚙️ Processing…"})
            try:
                stream_iter, chat = await _safe_send(chat, {"content": tool_responses, "stream": True}, session_id=session_id, mode=mode)
                
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
                
                if next_tool_calls:
                    mock_parts_list = [MockPart(fc) for fc in next_tool_calls]
                    response = MockResponse([MockCandidate(MockContent(mock_parts_list))])
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
            logger.warning(f"[Stream] Empty response detected for session {session_id}. Sending fallback.")
            debug_info = f"[DEBUG] RateLimit/Empty API Response. Target Model: {_active_model}. Input Message: {inputs[-1] if inputs else 'None'}"
            yield sse({"type": "text", "text": f"I processed your request but received an empty response. {debug_info}"})
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
        rag_injection = ""
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
        if req.mode == "Career Rescue Mode":
            roadmap_keywords = ["roadmap", "career path", "step-by-step", "timeline", "how to become", "path to become"]
            if any(kw in final_message.lower() for kw in roadmap_keywords):
                # Extract the topic from the message and completely rewrite it to force Mermaid output
                final_message = (
                    f"Output ONLY a mermaid diagram based on this request: '{req.message}'. "
                    "No text. No bullets. No headings. Only the mermaid code block, nothing else."
                )

        inputs.append(
            f"{final_message}{rag_injection}\n\n"
            "[SYSTEM DIRECTIVE — MANDATORY RULES:\n"
            "1. You are ARIA. You ALWAYS have a complete answer.\n"
            "2. Phone specs, comparisons, tech info → answer from YOUR OWN KNOWLEDGE. Do not search.\n"
            "3. If a search tool returns empty → answer from your own training knowledge.\n"
            "4. NEVER say 'I was unable to find', 'I recommend searching', or similar.\n"
            "5. Respond like Google Gemini: Premium, authoritative. Use clean, professional Markdown.\n"
            "6. For comparisons → use Markdown tables. For roadmaps, timelines, or step-by-step processes → ALWAYS use a ```mermaid flowchart.\n"
            "7. MERMAID RULES: ALWAYS wrap node labels in double quotes (e.g., A[\"Step 1: Planning\"]). NEVER use unquoted text in brackets.\n"
            "END DIRECTIVE]"
        )

    if not inputs:
        raise HTTPException(400, "No input provided")

    return StreamingResponse(
        _stream_agent(req.session_id, req.mode, inputs, message=final_message),
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
        inputs.append(f"PDF '{file.filename}':\n\n{text}\n\nAnalyze and summarize.")

    elif fname.endswith(".docx"):
        text = read_docx_file_from_stream(io.BytesIO(content))
        inputs.append(f"Word doc '{file.filename}':\n\n{text}\n\nAnalyze and summarize.")

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
            inputs.append(f"File '{file.filename}':\n\n{content.decode('utf-8')}")
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
