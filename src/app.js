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

/**
 * 🚀 SEARCH & FETCH CONTROLLER:
 * Handles incoming search requests and DB retrieval
 */
const handleEvents = async (req, res) => {
  const start = Date.now();
  try {
    const p = { ...req.query, ...req.body };

    const locations = [p.locations || p.cities || p.location || p.city || ""]
      .flat()
      .join(",")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const eventTypes = [p.eventTypes || p.types || p.eventType || p.type || ""]
      .flat()
      .join(",")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // If no search parameters provided on GET, return saved events from DB
    if (!locations.length && !eventTypes.length && req.method === "GET") {
      const saved = await getAllEvents();
      return res.status(200).json({ success: true, count: saved.length, events: saved, fromDb: true });
    }

    if (!locations.length || !eventTypes.length) {
      return res.status(400).json({ success: false, message: 'Both "location" and "eventType" are required.' });
    }

    // Run parallel search agents + Claude AI
    const events = await findEvents(locations, eventTypes, {
      startDate: p.startDate || p.date || null,
      days: parseInt(p.days, 10) || DEFAULT_DAYS,
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
