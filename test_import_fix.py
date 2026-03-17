try:
    from core.config import Config
    print("✅ Successfully imported core.config")
except ImportError as e:
    print(f"❌ Failed to import core.config: {e}")
