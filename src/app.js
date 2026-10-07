const express = require("express");
const cors = require("cors");
const { findEvents } = require("./agentService");
const { runCityChunk } = require("./runner");
const { initDb, upsertEvents, getAllEvents, clearAllEvents } = require("./db");
const { DEFAULT_LOCATIONS, DEFAULT_EVENT_TYPES, DEFAULT_DAYS } = require("./agentConfig");

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

/**
 * 📋 RUN CONFIG: cities + event types the agent covers.
 * Single source of truth for the UI — no duplicate hardcoding in the frontend.
 */
router.get("/events/run/cities", (_, res) => {
  res.json({
    success: true,
    cities: DEFAULT_LOCATIONS,
    types: DEFAULT_EVENT_TYPES,
    defaultDays: DEFAULT_DAYS,
    totalCells: DEFAULT_LOCATIONS.length * DEFAULT_EVENT_TYPES.length,
  });
});

/**
 * 🧩 CHUNKED RUN: process ONE city (broad provider queries → Claude
 * classifies into exact types → enrichment → upsert → ledger).
 * The UI loops cities sequentially with per-city progress; every city
 * is ledger-tracked, so no city or event type is ever silently missed.
 */
router.post("/events/run", async (req, res) => {
  const start = Date.now();
  try {
    const p = { ...req.query, ...req.body };
    const city = String(p.city || "").trim();
    if (!city) {
      return res.status(400).json({ success: false, message: "city is required" });
    }

    const result = await runCityChunk({
      city,
      runId: p.runId || undefined,
      types: p.types || p.eventTypes || undefined,
      startDate: p.startDate || p.date || null,
      days: parseInt(p.days, 10) || DEFAULT_DAYS,
    });

    const sec = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [Chunk Run] ${city} done in ${sec}s`);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("❌ [Chunk Run Error]:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "City chunk run failed.", error: err.message });
  }
});

app.use("/api", router);
app.use("/", router);

module.exports = app;
