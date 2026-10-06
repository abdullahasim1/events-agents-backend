const https = require("node:https");

const get = (url, key) =>
  new Promise((res, rej) =>
    https.get(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, family: 4 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => res(JSON.parse(d || "{}")));
    }).on("error", rej)
  );

/**
 * 🚀 PREDICTHQ SEARCH (Direct 1 Single Call):
 * Queries PredictHQ Events directly with location & categories (No Places API overhead)
 */
async function fetchPredictHQEvents(location, eventType, { startDate, endDate } = {}, key = process.env.PREDICTHQ_API_KEY) {
  const q = `${[eventType].flat().join(" ")} in ${location}`.trim();
  const dateParams = startDate && endDate ? `&active.gte=${startDate}T00:00:00Z&active.lte=${endDate}T23:59:59Z` : "";

  // 1 single direct API call to PredictHQ Events
  const data = await get(`https://api.predicthq.com/v1/events/?q=${encodeURIComponent(q)}${dateParams}&limit=50`, key);

  return (data.results || []).map((e) => ({
    title: e.title,
    category: e.category || "General",
    date: e.start_local || "",
    venue: (e.entities || []).find((x) => x.type === "venue")?.name || e.geo?.address?.formatted_address || "",
    city: location,
    snippet: e.description || `Event in ${location}`,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${e.title} ${location}`)}`,
    source: "PredictHQ",
  }));
}

module.exports = { fetchPredictHQEvents };
