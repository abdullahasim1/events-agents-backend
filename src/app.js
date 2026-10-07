const express = require("express");
const cors = require("cors");
const { findEvents } = require("./agentService");
const { DEFAULT_DAYS } = require("./utils");
const { initDb, upsertEvents, getAllEvents, clearAllEvents } = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// Initialize DB schema on cold start (non-blocking)
initDb().catch((e) => console.error("⚠️ [DB Init Warning]:", e.message));

const { DEFAULT_LOCATIONS, DEFAULT_EVENT_TYPES, DEFAULT_DAYS } = require("./agentConfig");

/**
 * 🚀 SEARCH & FETCH CONTROLLER:
 * Handles incoming search requests and DB retrieval
 */
const handleEvents = async (req, res) => {
  const start = Date.now();
  try {
    const p = { ...req.query, ...req.body };

    let locations = [p.locations || p.cities || p.location || p.city || ""]
      .flat()
      .join(",")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let eventTypes = [p.eventTypes || p.types || p.eventType || p.type || ""]
      .flat()
      .join(",")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // If pure GET with no params and not an explicit run trigger, return saved events from DB
    if (!locations.length && !eventTypes.length && req.method === "GET" && !p.run) {
      const saved = await getAllEvents();
      return res.status(200).json({ success: true, count: saved.length, events: saved, fromDb: true });
    }

    // Default to Hardcoded Centralized Config if triggered with 1-click (e.g. POST /events or ?run=true)
    if (!locations.length) locations = DEFAULT_LOCATIONS;
    if (!eventTypes.length) eventTypes = DEFAULT_EVENT_TYPES;

    const days = parseInt(p.days, 10) || DEFAULT_DAYS;

    // Run parallel search agents + Claude AI
    const events = await findEvents(locations, eventTypes, {
      startDate: p.startDate || p.date || null,
      days,
    });

    // Save/upsert to PostgreSQL
    try {
      if (events && events.length) {
        await upsertEvents(events);
      }
    } catch (dbErr) {
      console.error("⚠️ [DB Save Warning]:", dbErr.message);
    }

    const sec = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [Search] Returned & Saved ${events.length} events in ${sec}s`);

    return res.status(200).json({ success: true, count: events.length, events });
  } catch (error) {
    console.error("❌ [Server Error]:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve events." });
  }
};

const router = express.Router();

router.get("/health", (_, res) => res.json({ status: "ok", message: "Events Agent API is running!" }));
router.get("/events", handleEvents);
router.post("/events", handleEvents);
router.delete("/events", async (_, res) => {
  try {
    await clearAllEvents();
    res.json({ success: true, message: "All events cleared from database." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use("/api", router);
app.use("/", router);

module.exports = app;
