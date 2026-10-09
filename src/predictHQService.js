const https = require("node:https");

const formatIsoTime = (iso) => {
  if (!iso || !iso.includes("T")) return "";
  const [h, m] = iso.split("T")[1].slice(0, 5).split(":");
  const hr = parseInt(h, 10);
  return isNaN(hr) ? "" : `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};

const getJson = (url, key) =>
  new Promise((resolve, reject) => {
    https.get(
      url,
      { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, family: 4 },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data || "{}"));
          } catch (_) {
            resolve({});
          }
        });
      }
    ).on("error", reject);
  });

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
  const dateParams = startDate && endDate ? `&active.gte=${startDate}&active.lte=${endDate}` : "";
  const url = `https://api.predicthq.com/v1/events/?q=${encodeURIComponent(city)}&category=conferences,expos&limit=50${dateParams}`;
  const data = await getJson(url, key);

  return (data.results || []).map((e) => {
    const startTime = formatIsoTime(e.start_local || e.start);
    const endTime = formatIsoTime(e.end_local || e.end);
    const hostCity = e.geo?.address?.locality ? `${e.geo.address.locality}, MN` : location;

    return {
      title: e.title,
      category: e.category || "Conference / Summit",
      date: (e.start_local || e.start || "").slice(0, 10),
      time: startTime && endTime && startTime !== endTime ? `${startTime} - ${endTime}` : startTime || "",
      venue: (e.entities || []).find((x) => x.type === "venue")?.name || e.geo?.address?.formatted_address || "",
      city: hostCity,
      snippet: e.description || `Event in ${hostCity}`,
      url: `https://www.predicthq.com/events/${e.id}`,
      source: "PredictHQ",
    };
  });
}

module.exports = { fetchPredictHQEvents };
