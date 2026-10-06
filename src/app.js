const express = require("express");
const cors = require("cors");
const { findEvents } = require("./agentService");
const { DEFAULT_DAYS } = require("./utils");

const app = express();

app.use(cors());
app.use(express.json());

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

    if (!locations.length || !eventTypes.length) {
      return res.status(400).json({ success: false, message: 'Both "location" and "eventType" are required.' });
    }

    console.log(`📥 [Search] Locations (${locations.length}): ${locations.join(", ")} | Types (${eventTypes.length}): ${eventTypes.join(", ")}`);

    // 2. MAIN WORK: Agent orchestrator ko call karein (Search APIs + Claude AI)
    const events = await findEvents(locations, eventTypes, { startDate: p.startDate || p.date || null, days: parseInt(p.days, 10) || DEFAULT_DAYS });

    const sec = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [Search] Returned ${events.length} events in ${sec}s`);

    // 3. Verified events client ko return karein
    return res.status(200).json({ success: true, count: events.length, events });
  } catch (error) {
    console.error("❌ [Server Error]:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve events." });
  }
};

// Router setup: Handles both `/api/*` and root paths for seamless local and AWS Lambda support
const router = express.Router();
router.get("/health", (_, res) => res.json({ status: "ok", message: "Events Agent API is running!" }));
router.post("/events", handleSearch);
router.get("/events", handleSearch);

app.use("/api", router);
app.use("/", router);

module.exports = app;

