import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(".env")
client = genai.Client(api_key=os.getenv('GOOGLE_API_KEY'))
try:
    models = list(client.models.list())
    print([m.name for m in models if "generateContent" in m.supported_actions])
except Exception as e:
    print("Error:", e)
    