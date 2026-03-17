import os
from pathlib import Path
from dotenv import load_dotenv
import google.genai as genai
from google.genai import types
import googlemaps

load_dotenv(Path(".env"), override=True)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

class Config:
    GOOGLE_API_KEY = GOOGLE_API_KEY
    MEMORY_FILE = "memory.json"

    @staticmethod
    def get_genai_client():
        if not GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY not found in .env")
        http_opts = types.HttpOptions(
            retry_options=types.HttpRetryOptions(attempts=1)
        )
        return genai.Client(api_key=GOOGLE_API_KEY, http_options=http_opts)

    @staticmethod
    def get_gmaps_client():
        if not GOOGLE_API_KEY:
            return None
        try:
            return googlemaps.Client(key=GOOGLE_API_KEY)
        except Exception:
            return None