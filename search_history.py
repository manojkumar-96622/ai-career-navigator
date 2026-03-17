from google.genai import Client
from core.config import Config

try:
    client = Config.get_genai_client()
    chat = client.chats.create(model='gemini-2.0-flash')
    matches = [a for a in dir(chat) if 'history' in a.lower()]
    with open('history_search.txt', 'w') as f:
        f.write(f"Matches: {matches}\n")
        for m in matches:
            f.write(f"{m} type: {type(getattr(chat, m))}\n")
except Exception as e:
    with open('history_search.txt', 'w') as f:
        f.write(f"Error: {e}\n")
