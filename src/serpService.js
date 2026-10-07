const { FETCH_TIMEOUT_MS, buildSearchQuery } = require("./utils");

const extractTime = (str = "") => {
  if (!str) return "";
  const m = str.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b(?:\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b)?/i);
  return m ? m[0].trim() : "";
};

/**
 * 🚀 SERPAPI GOOGLE SEARCH:
 * Queries Google Search & Google Events for upcoming live events
 */
async function fetchSerpApiEvents(
  location,
  eventType,
  dateWindow = {},
  apiKey = process.env.SERPAPI_KEY,
) {
  const timeQualifier = [dateWindow.monthName, dateWindow.year].filter(Boolean).join(" ");
  const query = encodeURIComponent(
    buildSearchQuery(
      eventType,
      location,
      timeQualifier || new Date().getFullYear(),
    ),
  );

  // 2. SerpApi Google engine call karein
  const res = await fetch(
    `https://serpapi.com/search.json?engine=google&q=${query}&num=50&api_key=${apiKey}`,
    {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(`SerpApi: ${data.error}`);

  // 3. Agar Google Events ka widget mojood ho to structured data lein
  if (data.events_results?.length) {
    return data.events_results.map((e) => {
      const timeStr = extractTime(e.date?.when || "") || extractTime(e.description || "");
      return {
        title: e.title,
        date: e.date?.start_date || e.date?.when || "",
        time: timeStr,
        venue: e.venue?.name || e.address?.join(", ") || "",
        snippet: e.description || "",
        url: e.ticket_info?.[0]?.link || e.link || "",
        source: "Google Events",
      };
    });
  }

  // 4. Widget na hone par standard organic search results map karein
  return (data.organic_results || []).map((e) => {
    const timeStr = extractTime(e.snippet || "") || extractTime(e.date || "");
    return {
      title: e.title,
      date: e.date || "",
      time: timeStr,
      snippet: e.snippet || "",
      url: e.link || "",
      source: "Google Search",
    };
  });
}

module.exports = { fetchSerpApiEvents };
