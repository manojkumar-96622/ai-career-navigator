import os
import requests
import warnings
import concurrent.futures
import re
from functools import lru_cache

warnings.filterwarnings("ignore", category=RuntimeWarning)

# ─── DDGS Import Fix ──────────────────────────────────────────────────────────
# Bug was: import succeeded but then DDGS = None wiped it out
DDGS = None
try:
    from duckduckgo_search import DDGS
    print("[Search] DuckDuckGo (duckduckgo_search) loaded OK")
except ImportError:
    try:
        from ddgs import DDGS
        print("[Search] DuckDuckGo (ddgs) loaded OK")
    except ImportError:
        print("[Search] WARNING: DuckDuckGo not available. Run: pip install duckduckgo-search")

# ─── Optional Imports ─────────────────────────────────────────────────────────
try:
    import yfinance as yf
except ImportError:
    yf = None
    print("[Search] WARNING: yfinance not available. Run: pip install yfinance")

try:
    from googlesearch import search as google_search
except ImportError:
    google_search = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None
    print("[Search] WARNING: beautifulsoup4 not available. Run: pip install beautifulsoup4")


# ─── Success Cache (only caches real results, not failures) ───────────────────
SUCCESS_CACHE = {}


# ─── Weather ──────────────────────────────────────────────────────────────────
@lru_cache(maxsize=64)
def get_cached_weather(location):
    """Fetches high-accuracy weather data using Open-Meteo with wttr.in as fallback."""
    WMO_CODES = {
        0: "Clear Sky", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
        45: "Foggy", 48: "Depositing Rime Fog",
        51: "Light Drizzle", 53: "Moderate Drizzle", 55: "Dense Drizzle",
        61: "Slight Rain", 63: "Moderate Rain", 65: "Heavy Rain",
        71: "Slight Snowfall", 73: "Moderate Snowfall", 75: "Heavy Snowfall",
        80: "Slight Rain Showers", 81: "Moderate Rain Showers", 82: "Violent Rain Showers",
        95: "Thunderstorm", 96: "Thunderstorm with Slight Hail", 99: "Thunderstorm with Heavy Hail"
    }
    try:
        # 1. Geocoding (Location to Lat/Lon)
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1"
        geo = requests.get(geo_url, timeout=3).json()
        results = geo.get("results", [])

        if results:
            res = results[0]
            lat, lon = res["latitude"], res["longitude"]
            fullname = f"{res.get('name', '')}, {res.get('country', '')}"
            
            # 2. Weather Forecast
            w_url = (
                f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
                "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
            )
            weather = requests.get(w_url, timeout=3).json()
            curr = weather.get("current", {})
            
            temp = curr.get("temperature_2m", "N/A")
            feels = curr.get("apparent_temperature", "N/A")
            hum = curr.get("relative_humidity_2m", "N/A")
            wind = curr.get("wind_speed_10m", "N/A")
            code = curr.get("weather_code", 0)
            desc = WMO_CODES.get(code, "Cloudy")

            return (
                f"Weather in {fullname}: **{temp}°C** (Feels like {feels}°C), **{desc}**. "
                f"Humidity: {hum}%, Wind: {wind} km/h."
            )

        # 3. Fallback to wttr.in (format 3)
        res = requests.get(
            f"https://wttr.in/{location}?format=3",
            timeout=3.5,
            headers={"User-Agent": "curl/7.68.0"}
        ).text.strip()
        if res and "Unknown location" not in res and "429" not in res:
            return f"Weather in {location}: {res}"

        return f"Weather information for '{location}' is currently unavailable."

    except Exception as e:
        return f"Weather for '{location}' unavailable. ({str(e)})"


def get_weather(location):
    return get_cached_weather(location)


# ─── Finance / Stock Prices ───────────────────────────────────────────────────
TICKER_MAP = {
    "tesla": "TSLA", "apple": "AAPL", "google": "GOOGL", "alphabet": "GOOGL",
    "microsoft": "MSFT", "amazon": "AMZN", "netflix": "NFLX", "nvidia": "NVDA",
    "meta": "META", "facebook": "META", "uber": "UBER", "airbnb": "ABNB",
    "bitcoin": "BTC-USD", "btc": "BTC-USD",
    "ethereum": "ETH-USD", "eth": "ETH-USD",
    "dogecoin": "DOGE-USD", "doge": "DOGE-USD",
    "solana": "SOL-USD", "sol": "SOL-USD",
    "ripple": "XRP-USD", "xrp": "XRP-USD",
    "usd to inr": "INR=X", "usd in inr": "INR=X", "dollar to rupee": "INR=X",
    "usd to eur": "EURUSD=X", "usd to gbp": "GBPUSD=X",
    "usd to jpy": "JPY=X", "usd to aed": "AED=X",
    "gold": "GC=F", "gold rate": "GC=F", "gold price": "GC=F",
    "silver": "SI=F", "silver price": "SI=F",
    "crude oil": "CL=F", "oil price": "CL=F",
    "sensex": "^BSESN", "nifty": "^NSEI", "nifty 50": "^NSEI",
    "reliance": "RELIANCE.NS", "tcs": "TCS.NS", "infosys": "INFY.NS",
}


def get_stock_price(query):
    if not yf:
        return None

    query_lower = query.lower()
    ticker = None

    # Check map
    for key, val in TICKER_MAP.items():
        if key in query_lower:
            ticker = val
            break

    # Heuristic: explicit uppercase ticker symbol
    if not ticker and any(k in query_lower for k in ["stock", "share", "price"]):
        for word in query.split():
            if word.isupper() and 2 <= len(word) <= 5:
                ticker = word
                break

    if not ticker:
        return None

    try:
        print(f"[Finance] Fetching ticker: {ticker}")
        # yfinance doesn't have a direct timeout for Ticker init, but history does
        data = yf.Ticker(ticker)
        # We manually wrap this in a future with timeout if possible, 
        # or at least use the proxy/session support if it were configured.
        # For now, we'll just rely on the history() timeout if supported or yfinance internal defaults.
        # Actually, let's use a simpler check:
        hist = data.history(period="1d", timeout=3)
        if hist.empty:
            return None

        price = hist["Close"].iloc[-1]
        # info can be EXTREMELY slow as it scrapes. We skip it for speed.
        # info = data.info 
        name = TICKER_MAP.get(ticker.lower(), ticker)
        currency = "USD" if "-USD" in ticker or ticker.isupper() else "INR"

        # Format based on type
        if ticker == "INR=X":
            return f"💱 Current exchange rate: **1 USD = {price:,.2f} INR**"
        elif ticker in ("GC=F", "SI=F", "CL=F"):
            return f"📊 **{name}**: ${price:,.2f} {currency} (per troy oz/barrel)"
        elif "USD" in ticker and ticker != "INR=X":
            return f"🪙 **{name}**: ${price:,.4f} USD"
        else:
            return f"📈 **{name} ({ticker})**: {price:,.2f} {currency}"

    except Exception as e:
        print(f"[Finance] Error fetching {ticker}: {e}")
        return None


# ─── Search Strategies ────────────────────────────────────────────────────────

def search_ddgs(query):
    """DuckDuckGo search — most reliable, no API key needed."""
    if not DDGS:
        return None
    try:
        with DDGS() as ddgs:
            # News search for news queries
            if any(k in query.lower() for k in ["news", "today", "latest", "breaking"]):
                raw = list(ddgs.news(query, max_results=10))
                if raw:
                    return [
                        f"[{r.get('date', 'recent')}] {r.get('title', '')}: {r.get('body', '')}"
                        for r in raw
                    ]

            # Text search for everything else
            raw = list(ddgs.text(query, max_results=10))
            if raw:
                return [
                    f"[{r.get('title', '')}] {r.get('body', '')} ({r.get('href', '')})"
                    for r in raw
                ]
    except Exception as e:
        print(f"[DDGS] Failed: {e}")
    return None


def search_google_cse(query):
    """Google Custom Search Engine — requires GOOGLE_API_KEY + GOOGLE_CSE_ID in .env"""
    api_key = os.getenv("GOOGLE_API_KEY")
    cse_id = os.getenv("GOOGLE_CSE_ID")
    if not api_key or not cse_id:
        return None  # silently skip if not configured

    try:
        url = "https://www.googleapis.com/customsearch/v1"
        resp = requests.get(
            url,
            params={"key": api_key, "cx": cse_id, "q": query},
            timeout=3.5
        ).json()
        items = resp.get("items", [])
        if items:
            return [
                f"[{i.get('title', '')}] {i.get('snippet', '')} ({i.get('link', '')})"
                for i in items[:10]
            ]
    except Exception as e:
        print(f"[CSE] Failed: {e}")
    return None


def search_google_std(query):
    """googlesearch-python fallback — no API key needed."""
    if not google_search:
        return None
    try:
        raw = list(google_search(query, num_results=10, advanced=True))
        if raw:
            return [
                f"[{r.title}] {r.description} ({r.url})"
                for r in raw if r.title
            ]
    except Exception as e:
        print(f"[Google-Std] Failed: {e}")
    return None


def search_manual_scrape(query):
    """DuckDuckGo HTML scrape — no sleep, reduced timeout to fit within race budget."""
    if not BeautifulSoup:
        return None
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://duckduckgo.com/",
            "Accept-Language": "en-US,en;q=0.9",
        }
        # Bug fix: removed time.sleep(1) — was killing the 2.5s race budget
        resp = requests.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers=headers,
            timeout=1.2  # Extreme speed: 1.2s hard stop for manual scrape
        )
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []

        for link in soup.find_all("a", class_="result__a", limit=10):
            title = link.get_text(strip=True)
            snippet = ""
            parent = link.find_parent("div", class_="result__body")
            if parent:
                snippet_tag = parent.find("a", class_="result__snippet")
                if snippet_tag:
                    snippet = snippet_tag.get_text(strip=True)
            if title:
                results.append(f"[{title}] {snippet}")

        return results if results else None

    except Exception as e:
        print(f"[Manual-Scrape] Failed: {e}")
        return None


# Global executor for search strategies to prevent thread explosion
SEARCH_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=10)

# ─── Main Entry Point ──────────────────────────────────────────────────────────
def get_realtime_data(query: str) -> str:
    query = query.strip()
    query_lower = query.lower()

    # 1. Cache hit
    if query in SUCCESS_CACHE:
        print(f"[Cache] Hit for '{query}'")
        return SUCCESS_CACHE[query]

    print(f"\n[SEARCH] Processing query: '{query}'")

    # 2. Specialized: Weather
    if "weather" in query_lower:
        loc = re.sub(
            r"\b(weather|in|at|for|of|the|current|today)\b", "", query_lower
        ).strip()
        if loc:
            result = get_cached_weather(loc)
            SUCCESS_CACHE[query] = result
            return result

    # 3. Specialized: Finance (stocks, crypto, forex, gold)
    finance_keywords = [
        "stock", "price", "share", "bitcoin", "btc", "eth", "ethereum",
        "crypto", "usd", "inr", "rupee", "gold", "silver", "oil",
        "sensex", "nifty", "forex", "rate", "market"
    ]
    if any(k in query_lower for k in finance_keywords):
        stock_result = get_stock_price(query)
        if stock_result:
            SUCCESS_CACHE[query] = stock_result
            return stock_result
        # If yfinance fails, fall through to web search

    # 4. Parallel web search race — all strategies run simultaneously
    strategies = [
        ("DDGS",         search_ddgs,         query),
        ("Google-CSE",   search_google_cse,   query),
        ("Manual-Scrape",search_manual_scrape, query),
        ("Google-Std",   search_google_std,   query),
    ]

    # Use persistent global executor instead of creating a new one per request
    future_map = {
        SEARCH_EXECUTOR.submit(s[1], *s[2:]): s[0]
        for s in strategies
    }

    try:
        for future in concurrent.futures.as_completed(future_map, timeout=1.5):
            name = future_map[future]
            try:
                result = future.result()
                if result and len(str(result)) > 30:
                    final = (
                        "\n".join(result[:10])
                        if isinstance(result, list)
                        else str(result)
                    )
                    # Truncation Guard: prevent feeding massive raw text to Gemini
                    if len(final) > 5000:
                        final = final[:5000] + "... [Truncated]"
                    
                    SUCCESS_CACHE[query] = final
                    print(f"[SEARCH] Winner: {name}")
                    return final
            except Exception as e:
                print(f"[SEARCH] {name} error: {e}")

    except concurrent.futures.TimeoutError:
        print("[SEARCH] All strategies timed out after 2.0s")

    # 5. Return empty string — backend's _is_search_failure() will detect this
    #    and instruct Gemini to answer from its own knowledge.
    #    Bug fix: do NOT return a user-facing message here — Gemini reads it literally.
    print(f"[SEARCH] No results found for '{query}' — backend will use model knowledge")
    return ""


# ─── Specialized Job Search ────────────────────────────────────────────────────
def search_jobs(role: str, location: str) -> str:
    """Specialized search for explicit job/internship links using a multi-strategy race."""
    query = f"{role} jobs in {location} LinkedIn Internshala Naukri apply"
    print(f"\n[JobSearch] Racing strategies for: '{query}'")
    
    strategies = [
        ("Google-CSE",   search_google_cse,   query),
        ("DDGS",         search_ddgs,         query),
        ("Google-Std",   search_google_std,   query),
    ]

    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=len(strategies)) as executor:
        future_to_name = {executor.submit(s[1], s[2]): s[0] for s in strategies}
        
        all_results = []
        try:
            for future in as_completed(future_to_name, timeout=4.0):
                name = future_to_name[future]
                try:
                    res = future.result()
                    if res and isinstance(res, list):
                        # Filter for job-like links to ensure high quality
                        filtered = [r for r in res if any(x in str(r).lower() for x in ["job", "career", "apply", "intern", "hire", "recruitment", "linkedin", "naukri", "internshala"])]
                        if filtered:
                            print(f"[JobSearch] Strategy {name} returned {len(filtered)} results.")
                            all_results.extend(filtered)
                except Exception as e:
                    print(f"[JobSearch] Strategy {name} failed: {e}")
        except Exception as e:
            print(f"[JobSearch] Race error: {e}")

    if all_results:
        # Deduplicate while preserving order
        unique_results = []
        seen = set()
        for r in all_results:
            if r not in seen:
                unique_results.append(r)
                seen.add(r)
        
        return "FOUND LIVE JOB LINKS:\n" + "\n".join(unique_results[:15])

    # FAIL-SAFE: Generate direct portal search links
    from urllib.parse import quote
    r_enc = quote(role)
    l_enc = quote(location)
    
    portal_links = [
        f"- [Deep Search on LinkedIn](https://www.linkedin.com/jobs/search/?keywords={r_enc}&location={l_enc})",
        f"- [Deep Search on Internshala](https://internshala.com/internships/keywords-{r_enc}/location-{l_enc})",
        f"- [Deep Search on Naukri](https://www.naukri.com/{r_enc.replace('%20', '-')}-jobs-in-{l_enc.replace('%20', '-')})",
        f"- [Deep Search on Indeed](https://www.indeed.com/jobs?q={r_enc}&l={l_enc})"
    ]
    
    return (
        "I couldn't extract individual job links directly right now (possibly due to site restrictions), "
        "but I've generated these **Direct Portal Search Links** for you which will take you straight to the latest postings:\n\n"
        + "\n".join(portal_links)
    )


# Aliases for compatibility
get_cached_realtime = get_realtime_data