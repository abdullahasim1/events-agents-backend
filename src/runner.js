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
  BROAD_QUERIES,
} = require("./agentConfig");

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
    runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  await markRunCellStarted(finalRunId, cleanCity);

  try {
    const active = getProviders().filter((p) => isValidKey(p.key));
    console.log(
      `🔍 [Chunk] City: ${cleanCity} | Providers: ${active.map((a) => a.name).join(", ") || "none"}`
    );

    const searchTasks = [];
    for (const q of BROAD_QUERIES) {
      for (const p of active) {
        // Execute provider search with 1 automatic retry on empty/fail
        searchTasks.push(
          p.fn(cleanCity, q, dateWindow, p.key)
            .catch(async () => {
              // Quick 800ms backoff and retry once
              await new Promise((r) => setTimeout(r, 800));
              return p.fn(cleanCity, q, dateWindow, p.key).catch(() => []);
            })
        );
      }
    }
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

module.exports = { runCityChunk };
