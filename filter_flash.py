from core.config import Config

def filter_flash_models():
    client = Config.get_genai_client()
    if not client: return
    try:
        print("--- FLASH MODELS ONLY ---")
        for m in client.models.list():
            if "flash" in m.name.lower():
                print(f"VALID_ID: {m.name}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    filter_flash_models()
