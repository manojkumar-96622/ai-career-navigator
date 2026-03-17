import requests
import json

def test_stream():
    url = "http://127.0.0.1:8000/chat/stream"
    payload = {
        "message": "Hi, I want to be a software engineer.",
        "session_id": "test_session",
        "mode": "Career Rescue Mode"
    }
    
    try:
        print(f"Sending request to {url}...")
        with requests.post(url, json=payload, stream=True, timeout=10) as r:
            print(f"Status: {r.status_code}")
            if r.status_code != 200:
                print(f"Error: {r.text}")
                return
                
            for line in r.iter_lines():
                if line:
                    print(f"Received: {line.decode('utf-8')}")
                    # Stop after first bit of data to confirm it works
                    break
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_stream()
