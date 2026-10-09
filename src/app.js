const express = require("express");
const cors = require("cors");
const { runCityChunkStream, runAllCitiesStream } = require("./runner");
const { initDb, getAllEvents } = require("./db");
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
 * ⚡ Real-Time SSE Streaming:
 * Streams DB events smoothly at ~160ms intervals, while running live AI searches concurrently
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
  const days = parseInt(p.days, 10) || DEFAULT_DAYS;

  try {
    const saved = await getAllEvents();
    const existingKeys = new Set(
      saved.map((e) => `${getTitleFingerprint(e.title)}|${normalizeDateKey(e.date)}`)
    );

    // 1. Stream DB events smoothly at a readable natural pace (~320ms per row)
    const streamDbEvents = async () => {
      for (const ev of saved) {
        sendEvent("event", { ...ev, fromDb: true });
        await new Promise((r) => setTimeout(r, 320));
      }
    };

    // 2. Concurrently run live AI searches across cities - only stream TRULY new events
    const onLiveEvent = (ev) => {
      const key = `${getTitleFingerprint(ev.title)}|${normalizeDateKey(ev.date)}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        sendEvent("event", { ...ev, isNew: true });
      }
    };

    const streamLiveAi = async () => {
      if (city) {
        return runCityChunkStream({
          city,
          types: p.types || p.eventTypes,
          startDate,
          days,
          onEvent: onLiveEvent,
        });
      } else {
        return runAllCitiesStream({
          types: p.types || p.eventTypes,
          startDate,
          days,
          onEvent: onLiveEvent,
        });
      }
    };

    // Execute both in parallel
    await Promise.all([streamDbEvents(), streamLiveAi()]);
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
