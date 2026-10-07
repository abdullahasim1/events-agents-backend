const { fetchSerpApiEvents } = require("./serpService");
const { fetchTavilyEvents } = require("./tavilyService");
const { fetchPredictHQEvents } = require("./predictHQService");
const { extractEventsWithClaude } = require("./claudeService");
const { isValidKey, getDateWindow } = require("./utils");
const { enrichContacts } = require("./enrichmentService");

// 1. Search Providers Registry getter
function getProviders() {
  return [
    { name: "SerpApi", key: process.env.SERPAPI_KEY, fn: fetchSerpApiEvents },
    { name: "Tavily", key: process.env.TAVILY_API_KEY, fn: fetchTavilyEvents },
    { name: "PredictHQ", key: process.env.PREDICTHQ_API_KEY, fn: fetchPredictHQEvents },
  ];
}

/**
 * 🚀 MAIN ORCHESTRATOR: Parallel Search + Claude AI Extraction
 */
async function findEvents(locationsInput, eventTypesInput, { days, startDate } = {}) {
  const dateWindow = getDateWindow(days, startDate);
  const locations = [locationsInput].flat().map((s) => String(s).trim()).filter(Boolean);
  const eventTypes = [eventTypesInput].flat().map((s) => String(s).trim()).filter(Boolean);

  const active = getProviders().filter((p) => isValidKey(p.key));
  console.log(`🔍 [Agent] Providers: ${active.length} (${active.map(a => a.name).join(", ")}) | Locations: ${locations.join(", ")}`);

  // 1. Parallel raw search: build high-yield queries per location and provider
  const searchTasks = [];
  for (const loc of locations) {
    // Group categories into high-impact pairs to balance precision and speed
    for (let i = 0; i < eventTypes.length; i += 2) {
      const typePair = eventTypes.slice(i, i + 2).join(" ");
      for (const p of active) {
        searchTasks.push(p.fn(loc, typePair, dateWindow, p.key).catch(() => []));
      }
    }
  }

  const rawEvents = (await Promise.all(searchTasks)).flat();

  if (!rawEvents.length) return [];

  // 2. Claude AI verification, deduplication, clean sources
  const events = await extractEventsWithClaude(locations, eventTypes, rawEvents, dateWindow);

  // 3. 2-Step Agent Enrichment (Real email and phone extraction)
  return await enrichContacts(events);
}

module.exports = { findEvents, getProviders };
