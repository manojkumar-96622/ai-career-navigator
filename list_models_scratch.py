from core.config import Config

def list_models():
    client = Config.get_genai_client()
    if not client:
        print("GENAI_CLIENT is None")
        return
    
    try:
        models = client.models.list()
        for m in models:
            # Use only the basename
            name = m.name.split('/')[-1]
            print(f"MODEL_ID: {name}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models()
