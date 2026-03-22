from google.genai import types
from core.config import Config
from core.prompts import get_mode_instructions, get_system_info
from core.memory import MemoryManager


def create_agent_session(client, mode, history=None, model: str = "gemini-2.0-flash"):
    """Create a Gemini chat session with all tools wired up."""

    tool_declarations = [
        types.FunctionDeclaration(
            name="get_system_info",
            description="Get the current date and time. Call when user asks what time or date it is.",
        ),
        types.FunctionDeclaration(
            name="get_weather",
            description=(
                "Get current weather, temperature, humidity, and forecast for any city. "
                "Call ONLY when user explicitly asks about weather or temperature."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "location": {
                        "type": "STRING",
                        "description": "City or location name, e.g. 'Hyderabad' or 'New York, US'",
                    }
                },
                "required": ["location"],
            },
        ),
        types.FunctionDeclaration(
            name="get_realtime_data",
            description=(
                "Fetch the most current real-time data from the web. "
                "CRUCIAL: Your internal knowledge cut-off is late 2024. "
                "USE FOR: ANYTHING that may have changed since 2024, including "
                "latest phone specs, product comparisons, current tech reviews, "
                "live stock/crypto prices, today's news/sports, and current events. "
                "Treat your internal training data as OUTDATED for any product or event "
                "that exists in 2025 or 2026. If a fact could be different today than in 2024, "
                "YOU MUST CALL THIS TOOL TO VERIFY."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "query": {
                        "type": "STRING",
                        "description": (
                            "Specific search query for live data. "
                            "Be precise: 'Bitcoin price USD today' not just 'Bitcoin'."
                        ),
                    }
                },
                "required": ["query"],
            },
        ),
        types.FunctionDeclaration(
            name="search_jobs",
            description=(
                "MANDATORY: Call this to find live job/internship links on LinkedIn, Internshala, and Naukri. "
                "Use whenever the user asks for 'jobs', 'internships', or 'openings'."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "role": {"type": "STRING", "description": "Job title, e.g. 'Frontend Developer'"},
                    "location": {"type": "STRING", "description": "City, e.g. 'Hyderabad'"},
                },
                "required": ["role", "location"],
            },
        ),
        types.FunctionDeclaration(
            name="get_map_distance",
            description=(
                "Get driving distance, travel time, and directions between two locations. "
                "Returns a Google Maps link. Call when user asks for distance, route, "
                "directions, or travel time between places."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "origin": {
                        "type": "STRING",
                        "description": "Starting place name or address, e.g. 'Mumbai'",
                    },
                    "destination": {
                        "type": "STRING",
                        "description": "Destination place name or address, e.g. 'Goa'",
                    },
                },
                "required": ["origin", "destination"],
            },
        ),
        types.FunctionDeclaration(
            name="send_email",
            description=(
                "Compose and send an email on behalf of the user via Gmail SMTP. "
                "Call when user says 'send an email', 'email someone', or 'write an email to'."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "to_email": {
                        "type": "STRING",
                        "description": "Recipient's email address",
                    },
                    "subject": {
                        "type": "STRING",
                        "description": "Email subject line",
                    },
                    "message": {
                        "type": "STRING",
                        "description": "Full email body text",
                    },
                },
                "required": ["to_email", "subject", "message"],
            },
        ),
        types.FunctionDeclaration(
            name="open_website",
            description=(
                "Open one or more websites in the user's browser. "
                "Call when user says 'open [site]', 'go to [site]'. Always use full https:// URLs. "
                "CRUCIAL: Browsers block automatic popups. When using this tool, you MUST explicitly "
                "tell the user: 'I have generated the links for you. Please click the chips below to open them.'"
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "urls": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                        "description": (
                            "List of full URLs with https://. "
                            "Examples: ['https://youtube.com', 'https://google.com']"
                        ),
                    }
                },
                "required": ["urls"],
            },
        ),
        types.FunctionDeclaration(
            name="convert_to_pdf",
            description=(
                "Convert text content into a downloadable PDF file. "
                "Call when user asks to 'save as PDF', 'export PDF', or 'download as PDF'."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "content": {
                        "type": "STRING",
                        "description": "The text content to convert into PDF format",
                    }
                },
                "required": ["content"],
            },
        ),
        types.FunctionDeclaration(
            name="store_memory",
            description=(
                "Store a key-value fact about the user for long-term memory across sessions. "
                "Call when user shares personal info (name, city, job, preferences) "
                "or explicitly asks you to remember something."
            ),
            parameters={
                "type": "OBJECT",
                "properties": {
                    "key": {
                        "type": "STRING",
                        "description": "Memory label, e.g. 'user_name', 'city', 'preferred_language'",
                    },
                    "value": {
                        "type": "STRING",
                        "description": "Value to store, e.g. 'Rahul', 'Hyderabad', 'Python'",
                    },
                },
                "required": ["key", "value"],
            },
        ),
    ]

    # Reverted native search grounding due to SDK incompatibility with Function Declarations
    tools = [
        types.Tool(function_declarations=tool_declarations),
    ]

    # All safety filters off — ARIA is unrestricted
    safety_settings = [
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=types.HarmBlockThreshold.BLOCK_NONE),
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=types.HarmBlockThreshold.BLOCK_NONE),
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=types.HarmBlockThreshold.BLOCK_NONE),
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=types.HarmBlockThreshold.BLOCK_NONE),
        types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold=types.HarmBlockThreshold.BLOCK_NONE),
    ]

    # Inject user memory into the system prompt
    current_memory = MemoryManager.load()
    mem_str = (
        ", ".join(f"{k}: {v}" for k, v in current_memory.items())
        if current_memory
        else "None yet."
    )

    mode_map = get_mode_instructions(mem_str)
    system_instruction = mode_map.get(mode, mode_map["General Assistant"])

    chat = client.chats.create(
        model=model,
        history=history,
        config=types.GenerateContentConfig(
            tools=tools,
            system_instruction=system_instruction,
            temperature=0.7,
            top_p=0.95,
            top_k=40,
            safety_settings=safety_settings,
        ),
    )
    return chat