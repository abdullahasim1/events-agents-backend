const { fetchSerpApiEvents } = require("./serpService");
const { fetchTavilyEvents } = require("./tavilyService");
const { fetchPredictHQEvents } = require("./predictHQService");
const { extractEventsWithClaude } = require("./claudeService");
const { isValidKey, getDateWindow } = require("./utils");
const { upsertEvents } = require("./db");
const {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
  BROAD_QUERIES,
} = require("./agentConfig");

const PROVIDERS = [
  { name: "SerpApi", key: process.env.SERPAPI_KEY, fn: fetchSerpApiEvents },
  { name: "Tavily", key: process.env.TAVILY_API_KEY, fn: fetchTavilyEvents },
  { name: "PredictHQ", key: process.env.PREDICTHQ_API_KEY, fn: fetchPredictHQEvents },
];

/**
 * 🏙️ CITY CHUNK RUN:
 * Executes 4 sector queries across active providers in parallel,
 * verifies with Claude AI, and saves directly to Neon PostgreSQL.
 */
async function runCityChunk({ city, runId, types, startDate, days } = {}) {
  const cleanCity = String(city || "").trim();
  if (!cleanCity) throw new Error("city is required");

  const typeList = [types].flat().map((s) => String(s).trim()).filter(Boolean);
  const finalTypes = typeList.length ? typeList : DEFAULT_EVENT_TYPES;
  const dateWindow = getDateWindow(days, startDate);
  const finalRunId =
    runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const active = PROVIDERS.filter((p) => isValidKey(p.key));
  console.log(
    `🔍 [Chunk] City: ${cleanCity} | Providers: ${active.map((a) => a.name).join(", ") || "none"}`
  );

  // 1. Parallel search across active providers for all 4 sectors
  const searchTasks = [];
  for (const q of BROAD_QUERIES) {
    for (const p of active) {
      searchTasks.push(p.fn(cleanCity, q, dateWindow, p.key).catch(() => []));
    }
  }
  const rawEvents = (await Promise.all(searchTasks)).flat();

  // 2. Claude AI verification & strict 7-day date filter
  let events = [];
  if (rawEvents.length) {
    events = await extractEventsWithClaude(
      [cleanCity],
      finalTypes,
      rawEvents,
      dateWindow
    );
  }

  // 3. Save to Neon PostgreSQL
  try {
    if (events.length) await upsertEvents(events);
  } catch (dbErr) {
    console.error("⚠️ [Chunk DB Save Warning]:", dbErr.message);
  }

  console.log(`✅ [Chunk] ${cleanCity}: ${events.length} events`);
  return {
    runId: finalRunId,
    city: cleanCity,
    status: "done",
    eventsFound: events.length,
    startDate: dateWindow.startDate,
    endDate: dateWindow.endDate,
    events,
  };
}

/**
 * 🚀 MULTI-CITY RUN (Used if monolithic /events endpoint is triggered):
 */
async function findEvents(
  locations = DEFAULT_LOCATIONS,
  types = DEFAULT_EVENT_TYPES,
  { days, startDate } = {}
) {
  const locList = [locations].flat().filter(Boolean);
  const results = await Promise.all(
    locList.map((city) =>
      runCityChunk({ city, types, startDate, days }).catch(() => ({ events: [] }))
    )
  );
  return results.flatMap((r) => r.events || []);
}

module.exports = { runCityChunk, findEvents };
