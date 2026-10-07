const crypto = require("node:crypto");
const { getProviders } = require("./agentService");
const { extractEventsWithClaude } = require("./claudeService");
const { enrichContacts } = require("./enrichmentService");
const { isValidKey, getDateWindow } = require("./utils");
const {
  upsertEvents,
  markRunCellStarted,
  markRunCellDone,
  markRunCellFailed,
} = require("./db");
const {
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
  BROAD_QUERY_KEYWORDS,
} = require("./agentConfig");

/**
 * 🧩 COVERAGE MATRIX (pure function):
 * Every city × every event type becomes an explicit cell, so a run can
 * never silently skip a city or an event type. Execution is grouped per
 * city (one broad chunk each); the matrix is the coverage contract.
 */
function buildRunMatrix(cities, types, startDate, days) {
  const cityList = [cities].flat().map((s) => String(s).trim()).filter(Boolean);
  const typeList = [types].flat().map((s) => String(s).trim()).filter(Boolean);
  const dateWindow = getDateWindow(days, startDate);
  const runId = `run-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  const cells = [];
  for (const city of cityList) {
    for (const type of typeList) {
      cells.push({
        city,
        type,
        startDate: dateWindow.startDate,
        endDate: dateWindow.endDate,
      });
    }
  }

  return {
    runId,
    cities: cityList,
    types: typeList,
    startDate: dateWindow.startDate,
    endDate: dateWindow.endDate,
    days: parseInt(days, 10) || DEFAULT_DAYS,
    totalCells: cells.length,
    cells,
  };
}

/**
 * 🏙️ CITY CHUNK RUN:
 * ONE broad query per provider per city → Claude classifies every event
 * into an exact agentConfig type → contact enrichment → upsert → ledger.
 * Sized to fit comfortably inside one Vercel serverless invocation.
 */
async function runCityChunk({ city, runId, types, startDate, days } = {}) {
  const cleanCity = String(city || "").trim();
  if (!cleanCity) throw new Error("city is required");

  const typeList = [types].flat().map((s) => String(s).trim()).filter(Boolean);
  const finalTypes = typeList.length ? typeList : DEFAULT_EVENT_TYPES;
  const dateWindow = getDateWindow(days, startDate);
  const finalRunId =
    runId || `run-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  await markRunCellStarted(finalRunId, cleanCity);

  try {
    const active = getProviders().filter((p) => isValidKey(p.key));
    console.log(
      `🔍 [Chunk] City: ${cleanCity} | Providers: ${active.map((a) => a.name).join(", ") || "none"}`
    );

    // ONE broad query per provider per city (Claude classifies into exact types)
    const searchTasks = active.map((p) =>
      p.fn(cleanCity, BROAD_QUERY_KEYWORDS, dateWindow, p.key).catch(() => [])
    );
    const rawEvents = (await Promise.all(searchTasks)).flat();

    let events = [];
    if (rawEvents.length) {
      events = await extractEventsWithClaude(
        [cleanCity],
        finalTypes,
        rawEvents,
        dateWindow
      );
      events = await enrichContacts(events);
    }

    try {
      if (events.length) await upsertEvents(events);
    } catch (dbErr) {
      console.error("⚠️ [Chunk DB Save Warning]:", dbErr.message);
    }

    await markRunCellDone(finalRunId, cleanCity, events.length);
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
  } catch (err) {
    await markRunCellFailed(finalRunId, cleanCity, err.message);
    throw err;
  }
}

module.exports = { buildRunMatrix, runCityChunk };
