const express = require("express");
const cors = require("cors");
const { runCityChunkStream, runAllCitiesStream } = require("./runner");
const { initDb, getAllEvents, updateEvent, clearAllEvents } = require("./db");
const { DEFAULT_DAYS } = require("./agentConfig");
const { getTitleFingerprint, normalizeDateKey } = require("./utils");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize PostgreSQL schema on startup (non-blocking)
initDb().catch((e) => console.error("⚠️ [DB Init Warning]:", e.message));

const router = express.Router();

router.get("/health", (_, res) => res.json({ status: "ok", message: "Events Agent API is running!" }));

/**
 * 📥 Fetch saved events from PostgreSQL
 */
router.all("/events", async (_, res) => {
  try {
    const saved = await getAllEvents();
    return res.status(200).json({
      success: true,
      count: saved.length,
      events: saved,
      fromDb: true,
      lastFetchedAt: saved[0]?.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ [Events Fetch Error]:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve events." });
  }
});

/**
 * ✏️ Update single event fields
 */
router.patch("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await updateEvent(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Event not found or no valid fields to update" });
    }
    return res.status(200).json({ success: true, event: updated });
  } catch (err) {
    console.error("❌ [Event Update Error]:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ⚡ Real-Time SSE Streaming:
 * Clears DB on every run, discovers fresh events for the date range, and streams them live
 */
router.all("/events/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  const p = { ...req.query, ...req.body };
  const city = String(p.city || "").trim();
  const startDate = p.startDate || p.date || null;
  const endDate = p.endDate || null;
  const days = p.endDate && p.startDate
    ? Math.max(1, Math.round((new Date(p.endDate) - new Date(p.startDate)) / 86400000))
    : (parseInt(p.days, 10) || DEFAULT_DAYS);

  try {
    // 1. Clean DB on every agent run so only fresh data is kept
    await clearAllEvents();

    // 2. Stream fresh live AI events as they are discovered
    const onLiveEvent = (ev) => {
      sendEvent("event", { ...ev, isNew: true });
    };

    if (city) {
      await runCityChunkStream({
        city,
        types: p.types || p.eventTypes,
        startDate,
        endDate,
        days,
        onEvent: onLiveEvent,
      });
    } else {
      await runAllCitiesStream({
        types: p.types || p.eventTypes,
        startDate,
        endDate,
        days,
        onEvent: onLiveEvent,
      });
    }

    sendEvent("done", { success: true });
  } catch (err) {
    console.error("❌ [SSE Stream Error]:", err.message);
    sendEvent("error", { message: err.message });
  } finally {
    res.end();
  }
});

app.use("/api", router);
app.use(router);

module.exports = app;
