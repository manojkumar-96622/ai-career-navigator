from google.genai import Client
from core.config import Config

try:
    client = Config.get_genai_client()
    chat = client.chats.create(model='gemini-2.0-flash')
    
    print("--- CHAT OBJECT INSPECTION ---")
    print(f"Type: {type(chat)}")
    print(f"Attributes: {[m for m in dir(chat) if not m.startswith('__')]}")
    
    if hasattr(chat, '_history'):
        print(f"FOUND _history: {type(chat._history)}")
    if hasattr(chat, 'history'):
        print(f"FOUND history: {type(chat.history)}")
    
    # Try to send a dummy message to see if history populates
    print("\nSending dummy message...")
    chat.send_message("hi")
    
    if hasattr(chat, '_history'):
        print(f"Post-send _history len: {len(chat._history)}")
        print(f"Post-send _history sample: {chat._history[0]}")

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
