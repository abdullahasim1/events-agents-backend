const https = require("node:https");

const get = (url, key) =>
  new Promise((res, rej) =>
    https.get(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, family: 4 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => res(JSON.parse(d || "{}")));
    }).on("error", rej)
  );

function formatIsoTime(isoStr) {
  if (!isoStr || !isoStr.includes("T")) return "";
  const timePart = isoStr.split("T")[1];
  if (!timePart) return "";
  const [h, m] = timePart.split(":");
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return "";
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${period}`;
}

/**
 * 🚀 PREDICTHQ EVENTS SEARCH:
 * Queries PredictHQ for live conferences, expos, and summits
 */
async function fetchPredictHQEvents(
  location,
  eventType,
  { startDate, endDate } = {},
  key = process.env.PREDICTHQ_API_KEY
) {
  if (!key) return [];
  const city = String(location || "").split(",")[0].trim();
  const typeStr = String(eventType || "").toLowerCase();

  let topic = "conference";
  if (typeStr.includes("health") || typeStr.includes("mental")) topic = "health conference";
  else if (typeStr.includes("education") || typeStr.includes("school")) topic = "education conference";

  const q = `${city} ${topic}`.trim();
  const dateParams =
    startDate && endDate ? `&active.gte=${startDate}&active.lte=${endDate}` : "";

  const url = `https://api.predicthq.com/v1/events/?q=${encodeURIComponent(q)}&category=conferences,expos,community${dateParams}&limit=50`;
  const data = await get(url, key);

  return (data.results || []).map((e) => {
    const startTime = formatIsoTime(e.start_local || e.start);
    const endTime = formatIsoTime(e.end_local || e.end);
    const realTime =
      startTime && endTime && startTime !== endTime
        ? `${startTime} - ${endTime}`
        : startTime || "";

    const hostCity = e.geo?.address?.locality
      ? `${e.geo.address.locality}, MN`
      : location;

    return {
      title: e.title,
      category: e.category || "Conference / Summit",
      date: e.start_local ? e.start_local.slice(0, 10) : (e.start ? e.start.slice(0, 10) : ""),
      time: realTime,
      venue:
        (e.entities || []).find((x) => x.type === "venue")?.name ||
        e.geo?.address?.formatted_address ||
        "",
      city: hostCity,
      snippet: e.description || `Event in ${hostCity}`,
      url: `https://www.predicthq.com/events/${e.id}`,
      source: "PredictHQ",
    };
  });
}

module.exports = { fetchPredictHQEvents };
