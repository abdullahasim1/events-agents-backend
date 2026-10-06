# Events Discovery Agent Backend (Node.js & Claude AI)

An autonomous, multi-source Events Discovery Agent backend built with **Node.js**, **Express**, and **Anthropic Claude AI**. It aggregates real-time event data in parallel from **SerpApi (Google Search)**, **Tavily (AI Web Search)**, and **PredictHQ (Structured Events)**, with dynamic time window filtering and intelligent deduplication powered by Claude.

---

## 🏗️ Architecture Pipeline

```text
User Request: { location: "Pakistan", eventType: "Mental Health", startDate: "2026-10-01", days: 7 }
               │
               ▼
       agentService.js (Centralized Date Window & Orchestrator)
               │
   ┌───────────┼───────────┐ (Parallel Fetching)
   ▼           ▼           ▼
SerpApi      Tavily     PredictHQ
(Google)   (AI Web)   (Structured)
   │           │           │
   └───────────┼───────────┘
               ▼
       Raw Search Data (Aggregated)
               │
               ▼
   filterOutConfirmedPastEvents (Dynamic Past Years Stripping)
               │
               ▼
   extractEventsWithClaude (Anthropic Claude AI)
   • Strict Date Window Filter (startDate to endDate)
   • Multi-Source Deduplication
   • Structured Clean JSON Output
   • Graceful Fallback if AI unavailable
               │
               ▼
   Clean Verified Events List (Returned to Client / UI)
```

---

## 📁 File Structure

```text
events-agent-backend/
├── .env                     # API Keys & Configuration
├── package.json             # Scripts & dependencies
├── README.md                # Documentation & Architecture
├── public/
│   └── index.html           # Modern Responsive Tailwind UI
└── src/
    ├── server.js            # Express Server (Health check, POST & GET routes)
    ├── agentService.js      # Main Multi-API Orchestrator with Claude Fallback
    ├── claudeService.js     # Anthropic Claude dynamic prompt & JSON extraction
    ├── serpService.js       # Live Google Search via SerpApi
    ├── tavilyService.js     # Live Web Search via Tavily
    ├── predictHQService.js  # Verified Event Intelligence via PredictHQ
    └── utils.js             # Centralized Date Window, Query Builder, and Factory
```

---

## ⚙️ Environment Configuration (`.env`)

```env
PORT=5000
SERPAPI_KEY=your_serpapi_key
TAVILY_API_KEY=your_tavily_key
PREDICTHQ_API_KEY=your_predicthq_key
ANTHROPIC_API_KEY=your_claude_key
CLAUDE_MODEL=claude-haiku-4-5-20251001
```

---

## 🚀 Running the Project

```bash
# 1. Start the server
npm start

# 2. Or run with auto-reload (development mode)
npm run dev
```

* Backend URL: `http://localhost:5000`
* Frontend UI: Open `http://localhost:5000` in any browser.

---

## 📡 API Endpoints

### 1. Health Check (`GET /api/health`)
Returns live server status and dynamic sample query payload.
* **URL:** `http://localhost:5000/api/health`

### 2. Search Events (`POST /api/events`)
* **Headers:** `Content-Type: application/json`
* **Body:**
```json
{
  "location": "Lahore",
  "eventType": "Music",
  "startDate": "2026-10-15",
  "days": 7
}
```

* **Response:**
```json
{
  "success": true,
  "count": 2,
  "location": "Lahore",
  "eventType": "Music",
  "dateOptions": {
    "startDate": "2026-10-15",
    "days": 7
  },
  "events": [
    {
      "id": "event-1",
      "title": "Lahore Music Festival 2026",
      "category": "Music",
      "date": "2026-10-18",
      "time": "06:00 PM",
      "venue": "Alhamra Arts Council",
      "city": "Lahore",
      "description": "Annual live acoustic and indie music festival.",
      "ticketUrl": "https://...",
      "source": "Google Events (via SerpApi)"
    }
  ]
}
```

### 3. Quick Browser Search (`GET /api/events`)
```text
http://localhost:5000/api/events?location=Lahore&eventType=Music&startDate=2026-10-15&days=7
```
