const express = require("express");
const cors = require("cors");
const { findEvents } = require("./agentService");
const { DEFAULT_DAYS } = require("./utils");
const {
  initDb,
  upsertEvents,
  getAllEvents,
  updateEventStatus,
  deleteEvent,
  clearAllEvents,
} = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// Initialize DB schema on cold start (non-blocking)
initDb().catch((e) => console.error("⚠️ [DB Init Warning]:", e.message));

/**
 * 🚀 MAIN SEARCH CONTROLLER:
 * Handles incoming search requests (single or multi-location/category)
 */
const handleSearch = async (req, res) => {
  const start = Date.now();
  try {
    const p = { ...req.query, ...req.body };

    // 1. Inputs normalize karein (handles both array and comma-separated string)
    const locations = [p.locations || p.cities || p.location || p.city || ""].flat().join(",").split(",").map((s) => s.trim()).filter(Boolean);
    const eventTypes = [p.eventTypes || p.types || p.eventType || p.type || ""].flat().join(",").split(",").map((s) => s.trim()).filter(Boolean);

    // Agar search parameters nahi diye gaye aur yeh GET request hai, to database se saved events return karein
    if (!locations.length && !eventTypes.length && req.method === "GET") {
      const saved = await getAllEvents();
      return res.status(200).json({ success: true, count: saved.length, events: saved, fromDb: true });
    }

    if (!locations.length || !eventTypes.length) {
      return res.status(400).json({ success: false, message: 'Both "location" and "eventType" are required.' });
    }

    console.log(`📥 [Search] Locations (${locations.length}): ${locations.join(", ")} | Types (${eventTypes.length}): ${eventTypes.join(", ")}`);

    // 2. MAIN WORK: Agent orchestrator ko call karein (Search APIs + Claude AI)
    const events = await findEvents(locations, eventTypes, { startDate: p.startDate || p.date || null, days: parseInt(p.days, 10) || DEFAULT_DAYS });

    // 3. PostgreSQL Database mein events save/upsert karein
    try {
      if (events && events.length) {
        await upsertEvents(events);
      }
    } catch (dbErr) {
      console.error("⚠️ [DB Save Warning]:", dbErr.message);
    }

    const sec = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [Search] Returned & Saved ${events.length} events in ${sec}s`);

    // 4. Return verified events
    return res.status(200).json({ success: true, count: events.length, events });
  } catch (error) {
    console.error("❌ [Server Error]:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve events." });
  }
};

// Router setup: Handles both `/api/*` and root paths
const router = express.Router();
router.get("/health", (_, res) => res.json({ status: "ok", message: "Events Agent API is running!" }));

// Saved events routes
router.get("/events/saved", async (_, res) => {
  try {
    const events = await getAllEvents();
    res.json({ success: true, count: events.length, events });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/events", async (_, res) => {
  try {
    await clearAllEvents();
    res.json({ success: true, message: "All events cleared from database." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/events/:id", async (req, res) => {
  try {
    await deleteEvent(req.params.id);
    res.json({ success: true, message: `Event ${req.params.id} deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/events/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    await updateEventStatus(req.params.id, status || "Need to contact");
    res.json({ success: true, message: "Event status updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/events", handleSearch);
router.get("/events", handleSearch);

app.use("/api", router);
app.use("/", router);

module.exports = app;
