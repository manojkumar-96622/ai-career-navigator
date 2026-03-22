import requests
import json
import sys

def test_stream():
    url = "http://localhost:8080/chat/stream"
    data = {"session_id": "test_session", "mode": "General Assistant", "message": "What does the Artificial Regulation Act of 2026 say about Wi-Fi for tenants?"}
    
    print("Sending request to General Assistant...")
    try:
        with requests.post(url, json=data, stream=True) as r:
            for line in r.iter_lines():
                if line:
                    print(line.decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")

    print("\n\nNow sending to Legal Shield Mode...")
    data["mode"] = "Legal Shield Mode"
    try:
        with requests.post(url, json=data, stream=True) as r:
            for line in r.iter_lines():
                if line:
                    print(line.decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_stream()
