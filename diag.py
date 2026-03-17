import requests
import os
from pathlib import Path
from dotenv import load_dotenv

def check_connectivity():
    print("=== AI Career Navigator Diagnostics ===\n")
    
    # 1. Check .env
    env_path = Path(".env")
    if not env_path.exists():
        print("❌ .env file NOT found!")
    else:
        print("✅ .env file found.")
        load_dotenv(env_path)
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            print("❌ GOOGLE_API_KEY NOT found in .env!")
        else:
            print(f"✅ GOOGLE_API_KEY found: {api_key[:5]}...{api_key[-5:]}")

    # 2. Check Backend
    backend_url = "http://localhost:8080/health"
    print(f"\nChecking backend at {backend_url}...")
    try:
        response = requests.get(backend_url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend is ONLINE (Version: {data.get('version')})")
            print(f"✅ GenAI Ready: {data.get('genai_ready')}")
        else:
            print(f"❌ Backend returned status code: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("❌ Backend is OFFLINE! (Could not connect to port 8080)")
    except Exception as e:
        print(f"❌ Backend check failed: {e}")

    # 3. Check Usage/Limits
    usage_url = "http://localhost:8080/usage"
    try:
        response = requests.get(usage_url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Usage stats retrieved: RPM={data.get('rpm')}, Intensity={data.get('intensity')}")
    except:
        pass

    print("\n========================================")

if __name__ == "__main__":
    check_connectivity()
