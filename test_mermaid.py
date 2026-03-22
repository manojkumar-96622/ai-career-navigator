import requests
import json
import codecs

def test_stream():
    url = "http://localhost:8080/chat/stream"
    data = {
        "session_id": "test_session", 
        "mode": "Career Rescue Mode", 
        "message": "Draw me an architecture flowchart roadmap to becoming a Data Scientist. ONLY OUTPUT MERMAID CODE. DO NOT OUTPUT ANYTHING ELSE. NO BULLETS."
    }
    
    print("Sending request to Career Rescue Mode...")
    collected_text = ""
    try:
        with requests.post(url, json=data, stream=True) as r:
            for line in r.iter_lines():
                if line:
                    decoded = line.decode('utf-8')
                    if '"type": "text"' in decoded:
                        try:
                            j = json.loads(decoded.replace('data: ', ''))
                            collected_text = j['text']
                        except:
                            pass
    except Exception as e:
        print(f"Error: {e}")
        
    print("OUTPUT:\n", collected_text[:1000])

if __name__ == "__main__":
    test_stream()
