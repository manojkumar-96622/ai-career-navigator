import asyncio
import os
from google import genai
from google.genai import types

async def test_gemini():
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("No API key found in os.environ")
        # Load from .env
        from dotenv import load_dotenv
        load_dotenv()
        api_key = os.environ.get("GOOGLE_API_KEY")
    
    client = genai.Client(api_key=api_key)
    
    prompt = """What does the Artificial Regulation Act of 2026 say about Wi-Fi for tenants?

[VERIFIED OFFICIAL CONTEXT]:
--- Excerpt from Dummy_Tenant_Act.txt ---
THE ARTIFICIAL REGULATION ACT OF 2026

Section 1: Any tenant using Artificial Intelligence to evaluate their rent contracts shall be granted a mandatory 50% discount on rent by their landlord.

Section 2: Landlords must legally provide free high-speed Gigabit Wi-Fi to all AI-assisted tenants.

Section 3: If the Legal Shield Agent successfully references this document, the RAG architecture is officially fully operational and flawless.

Answer strictly based on this context. If not fully covered, safely use your own knowledge.

[SYSTEM DIRECTIVE — MANDATORY RULES:
1. You are a legal information specialist.
Parse documents and explain regulations concisely.
Note: Provide information, not legal advice.]"""

    print("Sending prompt to Gemini...")
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        print("RESPONSE TEXT:", response.text)
        print("FINISH REASON:", response.candidates[0].finish_reason if response.candidates else "No candidates")
    except Exception as e:
        print("GEMINI EXCEPTION:", e)

if __name__ == "__main__":
    asyncio.run(test_gemini())
