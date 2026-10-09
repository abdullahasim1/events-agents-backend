const { FETCH_TIMEOUT_MS, buildSearchQuery } = require("./utils");

/**
 * 🚀 TAVILY AI WEB SEARCH:
 * Advanced crawler that searches live web pages for events, fairs, and conferences
 */
async function fetchTavilyEvents(
  location,
  eventType,
  dateWindow = {},
  apiKey = process.env.TAVILY_API_KEY,
) {
  const timeQualifier = String(eventType).includes("this week") ? "" : "2026";
  const searchStr = buildSearchQuery(eventType, location, timeQualifier);

  // 1. Tavily API call with advanced web search depth
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: searchStr,
      max_results: 100,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const data = await res.json();
  if (!res.ok)
    throw new Error(`Tavily (${res.status}): ${data.detail || res.statusText}`);

  // 2. Raw page snippets aur URLs map karein
  return (data.results || []).map((item) => ({
    title: item.title,
    snippet: item.content || "",
    url: item.url,
    source: "Tavily Search",
  }));
}

module.exports = { fetchTavilyEvents };
