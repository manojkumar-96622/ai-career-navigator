from core.config import Config
import codecs

def list_to_utf8():
    client = Config.get_genai_client()
    if not client: return
    try:
        with codecs.open("models_utf8.txt", "w", "utf-8") as f:
            for m in client.models.list():
                if "flash" in m.name.lower():
                    f.write(f"{m.name}\n")
        print("Success: models_utf8.txt created.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_to_utf8()
