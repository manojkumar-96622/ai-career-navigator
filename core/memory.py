import os
import json
from core.config import Config


class MemoryManager:
    @staticmethod
    def load():
        if not os.path.exists(Config.MEMORY_FILE):
            return {}
        try:
            with open(Config.MEMORY_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    @staticmethod
    def save(data):
        with open(Config.MEMORY_FILE, "w") as f:
            json.dump(data, f, indent=4)

    # Alias used by delete endpoint in appbackend.py
    @staticmethod
    def _save(data):
        MemoryManager.save(data)

    @staticmethod
    def store(key, value):
        data = MemoryManager.load()
        data[key] = value
        MemoryManager.save(data)
        return f"✅ Remembered: {key} = {value}"

    @staticmethod
    def delete(key):
        data = MemoryManager.load()
        if key in data:
            del data[key]
            MemoryManager.save(data)
            return f"🗑 Deleted memory: {key}"
        return f"Key '{key}' not found in memory."