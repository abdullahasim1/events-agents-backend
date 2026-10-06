const { FETCH_TIMEOUT_MS, buildSearchQuery } = require("./utils");

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
  // 1. Google search query build karein
  const query = encodeURIComponent(
    buildSearchQuery(
      eventType,
      location,
      dateWindow.year || new Date().getFullYear(),
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
    return data.events_results.map((e) => ({
      title: e.title,
      date: e.date?.when || e.date?.start_date || "",
      venue: e.venue?.name || e.address?.join(", ") || "",
      snippet: e.description || "",
      url: e.ticket_info?.[0]?.link || e.link || "",
      source: "Google Events",
    }));
  }

  // 4. Widget na hone par standard organic search results map karein
  return (data.organic_results || []).map((e) => ({
    title: e.title,
    date: e.date || "",
    snippet: e.snippet || "",
    url: e.link || "",
    source: "Google Search",
  }));
}

module.exports = { fetchSerpApiEvents };
