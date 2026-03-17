from core.config import Config
import os

def list_fine_grained_models():
    client = Config.get_genai_client()
    if not client:
        print("GENAI_CLIENT is None")
        return
    
    try:
        print("--- AVAILABLE MODELS ---")
        for m in client.models.list():
            # Print full name and display name
            print(f"ID: {m.name} | Display: {m.display_name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_fine_grained_models()
