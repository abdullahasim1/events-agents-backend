const FETCH_TIMEOUT_MS = 12000;
const CLAUDE_TIMEOUT_MS = 25000;
const DEFAULT_DAYS = 7;

// API key verification helper
const isValidKey = (k) => Boolean(k && !k.startsWith('your_'));

/**
 * 🚀 SEARCH QUERY BUILDER (Natural & High-Yield):
 * Creates high-precision natural search queries for Google & Tavily
 * e.g. "Mental Health & Counseling Conference in Minneapolis, MN October 2026"
 */
function buildSearchQuery(eventType, location, timeQualifier = "") {
  const typeStr = [eventType].flat().join(" ").trim();
  const locPart = location ? `in ${location}` : "";
  const timePart = timeQualifier || "";

  // Natural query format triggers Google Events widget & official organization conference listings
  return `${typeStr} ${locPart} ${timePart}`.replace(/\s+/g, " ").trim();
}

/**
 * 📅 DATE WINDOW CALCULATOR:
 * Calculates ISO start and end date range (e.g. next 14 days)
 */
function getDateWindow(days = DEFAULT_DAYS, customStartDate) {
  const start = customStartDate && !isNaN(new Date(customStartDate)) ? new Date(customStartDate) : new Date();
  const future = new Date(start.getTime() + (parseInt(days, 10) || DEFAULT_DAYS) * 86400000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: future.toISOString().slice(0, 10),
    year: start.getFullYear(),
    monthName: start.toLocaleString('en-US', { month: 'long' }),
  };
}

module.exports = {
  FETCH_TIMEOUT_MS,
  CLAUDE_TIMEOUT_MS,
  DEFAULT_DAYS,
  isValidKey,
  buildSearchQuery,
  getDateWindow,
};
