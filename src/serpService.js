const { FETCH_TIMEOUT_MS, buildSearchQuery } = require("./utils");

const extractTime = (str = "") =>
  str.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b(?:\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b)?/i)?.[0]?.trim() || "";

function parseSerpDate(rawDate, defaultYear = 2026) {
  if (!rawDate) return "";
  if (typeof rawDate === "object") return rawDate.start_date || rawDate.when || "";
  const str = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const m = str.match(/([a-z]{3,9})[\s,]+(\d{1,2})/i);
  if (m) {
    const mm = months[m[1].toLowerCase().slice(0, 3)];
    if (mm) return `${defaultYear}-${mm}-${String(m[2]).padStart(2, "0")}`;
  }
  return str;
}

/**
 * 🚀 SERPAPI GOOGLE SEARCH:
 * Queries Google Search & Google Events widget for upcoming live events
 */
async function fetchSerpApiEvents(
  location,
  eventType,
  dateWindow = {},
  apiKey = process.env.SERPAPI_KEY,
) {
  const timeQualifier = String(eventType).includes("this week") ? "" : "this week";
  const searchStr = buildSearchQuery(eventType, location, timeQualifier);
  const query = encodeURIComponent(searchStr);

  const res = await fetch(
    `https://serpapi.com/search.json?engine=google&q=${query}&num=100&api_key=${apiKey}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  const data = await res.json();
  if (data.error) throw new Error(`SerpApi: ${data.error}`);

  const results = [];

  // 1. Process Google Events 10-pack widget (highest accuracy for live dates/times)
  if (Array.isArray(data.events_results)) {
    for (const e of data.events_results) {
      if (!e.title) continue;
      results.push({
        title: e.title,
        date: parseSerpDate(e.date),
        time: e.time || extractTime(e.date?.when || e.description || ""),
        venue: e.venue?.name || e.address?.[0] || "",
        city: e.address?.[1] || location,
        category: e.type || "Conference / Summit",
        snippet: e.description || `${e.title} in ${location}`,
        url: e.link || e.ticket_info?.[0]?.link || `https://www.google.com/search?q=${encodeURIComponent(e.title + " " + location)}`,
        source: "Google Events",
      });
    }
  }

  // 2. Process organic search results (Eventbrite, 10times, directories, associations)
  if (Array.isArray(data.organic_results)) {
    for (const e of data.organic_results) {
      if (!e.title) continue;
      results.push({
        title: e.title,
        date: parseSerpDate(e.date),
        time: extractTime(e.snippet || e.date || ""),
        venue: "",
        city: location,
        snippet: e.snippet || "",
        url: e.link || "",
        source: "Google Search",
      });
    }
  }

  return results;
}

module.exports = { fetchSerpApiEvents };
