
CUSTOM_CSS = """
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Outfit:wght@500;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }

    h1, h2, h3 {
        font-family: 'Outfit', sans-serif;
        font-weight: 700;
    }

    .stApp {
        background-color: #0e1117;
    }

    [data-testid="stSidebar"] {
        background: rgba(17, 25, 40, 0.75);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-right: 1px solid rgba(255, 255, 255, 0.125);
    }

    .stChatMessage {
        border-radius: 15px;
        padding: 1rem;
        margin-bottom: 1rem;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    [data-testid="chatAvatarIcon-user"] {
        background-color: #4a90e2;
    }

    [data-testid="chatAvatarIcon-assistant"] {
        background: linear-gradient(135deg, #6e8efb, #a777e3);
    }

    .download-btn {
        display: inline-block;
        padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #00b09b, #96c93d);
        color: white !important;
        text-decoration: none;
        border-radius: 20px;
        font-weight: bold;
        margin-top: 10px;
        transition: transform 0.2s;
    }
    .download-btn:hover {
        transform: scale(1.05);
    }
</style>
"""
