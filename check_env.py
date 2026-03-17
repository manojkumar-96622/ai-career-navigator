import os
import sys
from pathlib import Path
from dotenv import load_dotenv

def check_env():
    print("=== Environment Health Check ===")
    
    # 1. Check .env
    if not Path(".env").exists():
        print("❌ .env file missing")
        return False
    
    load_dotenv(override=True)
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ GOOGLE_API_KEY missing from .env")
    else:
        print(f"✅ GOOGLE_API_KEY present: {api_key[:4]}...{api_key[-4:]}")
        
    # 2. Check Dependencies
    dependencies = [
        "streamlit", "fastapi", "uvicorn", "google.genai", "dotenv", 
        "requests", "googlemaps", "duckduckgo_search", "yfinance", "bs4"
    ]
    
    missing = []
    for dep in dependencies:
        try:
            __import__(dep.replace("-", "_"))
            print(f"✅ {dep} is installed")
        except ImportError:
            missing.append(dep)
            print(f"❌ {dep} is MISSING")
            
    if missing:
        print(f"\nTotal missing: {len(missing)}")
        return False
        
    print("\n✅ Environment looks healthy!")
    return True

if __name__ == "__main__":
    if not check_env():
        sys.exit(1)
