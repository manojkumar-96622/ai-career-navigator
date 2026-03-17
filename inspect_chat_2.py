from google.genai import Client
from core.config import Config

try:
    client = Config.get_genai_client()
    chat = client.chats.create(model='gemini-2.0-flash')
    with open('chat_inspect.txt', 'w') as f:
        f.write(f"Class: {type(chat)}\n")
        f.write(f"Dir: {dir(chat)}\n")
except Exception as e:
    with open('chat_inspect.txt', 'w') as f:
        f.write(f"Error: {e}\n")
