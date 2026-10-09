const { fetchSerpApiEvents } = require("./serpService");
const { fetchTavilyEvents } = require("./tavilyService");
const { fetchPredictHQEvents } = require("./predictHQService");
const { streamEventsWithClaude } = require("./claudeService");
const { isValidKey, getDateWindow } = require("./utils");
const { upsertEvents } = require("./db");
const {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  BROAD_QUERIES,
} = require("./agentConfig");

const PROVIDERS = [
  { name: "SerpApi", key: process.env.SERPAPI_KEY, fn: fetchSerpApiEvents },
  { name: "Tavily", key: process.env.TAVILY_API_KEY, fn: fetchTavilyEvents },
  { name: "PredictHQ", key: process.env.PREDICTHQ_API_KEY, fn: fetchPredictHQEvents },
];

/**
 * 🔍 Queries all active search providers in parallel for broad city queries
 */
async function searchCityCandidates(city, dateWindow) {
  const active = PROVIDERS.filter((p) => isValidKey(p.key));
  const tasks = [];

  // 1. PredictHQ is city-level (call once per city to avoid duplicate API calls)
  const phq = active.find((p) => p.name === "PredictHQ");
  if (phq) {
    tasks.push(phq.fn(city, "", dateWindow, phq.key).catch(() => []));
  }

  // 2. Web search engines (SerpApi & Tavily) run for each sharp sector query
  const webProviders = active.filter((p) => p.name !== "PredictHQ");
  for (const q of BROAD_QUERIES) {
    for (const p of webProviders) {
      tasks.push(p.fn(city, q, dateWindow, p.key).catch(() => []));
    }
  }

  const results = await Promise.all(tasks);
  return results.flat();
}

/**
 * ⚡ REAL-TIME CITY CHUNK STREAM:
 * Searches providers and streams events progressively through Claude AI & PostgreSQL
 */
async function runCityChunkStream({
  city,
  types,
  startDate,
  endDate,
  days,
  onEvent = () => {},
  onStatus = () => {},
} = {}) {
  const cleanCity = String(city || "").trim();
  if (!cleanCity) throw new Error("city is required");

  const typeList = [types].flat().map((s) => String(s).trim()).filter(Boolean);
  const finalTypes = typeList.length ? typeList : DEFAULT_EVENT_TYPES;
  const dateWindow = getDateWindow(days, startDate, endDate);

  onStatus({ step: "search", message: `Searching providers for ${cleanCity}...`, city: cleanCity });
  const rawEvents = await searchCityCandidates(cleanCity, dateWindow);

  onStatus({ step: "ai", message: `Found candidates. Claude AI analyzing in real-time...`, city: cleanCity });

  let events = [];
  if (rawEvents.length) {
    events = await streamEventsWithClaude(
      [cleanCity],
      finalTypes,
      rawEvents,
      dateWindow,
      {
        onEvent: async (ev) => {
          upsertEvents([ev]).catch((e) => console.error("⚠️ [DB Save]:", e.message));
          onEvent(ev);
        },
        onStatus,
      }
    );
  }

  onStatus({ step: "done", message: `Completed ${cleanCity}: ${events.length} events verified`, city: cleanCity });
  return events;
}

/**
 * 🚀 ALL CITIES STREAM:
 * Runs all target cities with concurrency of 3 and streams events progressively
 */
async function runAllCitiesStream({
  cities = DEFAULT_LOCATIONS,
  types,
  startDate,
  endDate,
  days,
  onEvent = () => {},
  onStatus = () => {},
} = {}) {
  const cityList = [cities].flat().filter(Boolean);
  const CONCURRENCY = 3;

  for (let i = 0; i < cityList.length; i += CONCURRENCY) {
    const batch = cityList.slice(i, i + CONCURRENCY);
    onStatus({ message: `Searching ${batch.join(", ")}...` });
    await Promise.all(
      batch.map((city) =>
        runCityChunkStream({ city, types, startDate, endDate, days, onEvent, onStatus }).catch((err) =>
          console.warn(`[Stream Error] ${city}:`, err.message)
        )
      )
    );
  }
}

// Minimal aliases for backward compatibility
const runCityChunk = (opts) => runCityChunkStream(opts);
const findEvents = async (locations, types, opts) => {
  const list = [];
  await runAllCitiesStream({ cities: locations, types, ...opts, onEvent: (e) => list.push(e) });
  return list;
};

module.exports = {
  searchCityCandidates,
  runCityChunkStream,
  runAllCitiesStream,
  runCityChunk,
  findEvents,
};
