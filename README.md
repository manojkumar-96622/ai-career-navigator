# AI Career Navigator

AI-powered career navigation platform

## Overview
AI Career Navigator is a comprehensive platform designed to help users navigate their career paths with AI-powered insights, guidance, and support.

## Features
- **Career Rescue Agent**: Crisis intervention for career-related challenges
- **Finance Guard Agent**: Financial planning and guidance
- **Health Navigator Agent**: Wellness and health support
- **Mind Support Agent**: Mental health and stress management
- **Legal Shield Agent**: Legal guidance and compliance support
- **Orchestrator Agent**: Unified coordination of all services

## Project Structure
```
├── frontend/          # Next.js TypeScript frontend
├── core/              # Core AI agents and configuration
├── tools/             # API and utility tools
├── utils/             # Helper utilities
└── app_backend.py     # FastAPI backend
```

## Tech Stack
- **Backend**: FastAPI, Python
- **Frontend**: Next.js, TypeScript, React
- **AI**: Google Genai
- **Styling**: Tailwind CSS
- **Database**: JSON-based (history.json, feedback_log.json)

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- pip, npm/yarn

### Installation

1. **Backend Setup**
   ```bash
   pip install -r requirements.txt
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   ```

3. **Environment Configuration**
   - Create `.env` file with required API keys
   - Configure Google Genai credentials

### Running the Application

**Start Backend**
```bash
python app_backend.py
```

**Start Frontend**
```bash
cd frontend
npm run dev
```

Access the application at `http://localhost:3000`

## Configuration
- Backend runs on port 8000 (FastAPI/Uvicorn)
- Frontend runs on port 3000 (Next.js dev server)
- All configuration in `core/config.py`

## License
[Add your license here]

## Author
[Your Name]

## Support
For issues and questions, please open an issue on GitHub.
