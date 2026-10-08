const FETCH_TIMEOUT_MS = 16000;
const CLAUDE_TIMEOUT_MS = 35000;
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

/**
 * 📍 PROXIMITY RANKING (Nearest First):
 * Calculates location distance tier relative to Twin Cities Hub:
 * - Tier 1: Core Metro Hub (Minneapolis, St. Paul, Bloomington, Edina, Roseville)
 * - Tier 2: Outer Metro Suburbs (Maple Grove, Minnetonka, Plymouth)
 * - Tier 3: Regional Minnesota (St. Cloud, Hinckley, Rochester, Duluth)
 * - Tier 4: Rest of USA
 */
function getProximityRank(cityOrLocation = "") {
  const loc = String(cityOrLocation || "").toLowerCase();

  // Tier 1: Core Metro (0 - 10 miles)
  if (/minneapolis|st\.?\s*paul|saint paul|downtown|edina|bloomington|roseville/i.test(loc)) {
    return 1;
  }

  // Tier 2: Outer Metro Suburbs (10 - 25 miles)
  if (/maple grove|minnetonka|plymouth|wayzata|eden prairie|eagan/i.test(loc)) {
    return 2;
  }

  // Tier 3: Regional Minnesota (25 - 80 miles)
  if (/st\.?\s*cloud|saint cloud|hinckley|mankato|duluth|rochester|bemidji/i.test(loc)) {
    return 3;
  }

  // Tier 4: Minnesota General
  if (/minnesota|\bmn\b/i.test(loc)) {
    return 4;
  }

  // Tier 5: Rest of USA (Far)
  return 5;
}

module.exports = {
  FETCH_TIMEOUT_MS,
  CLAUDE_TIMEOUT_MS,
  DEFAULT_DAYS,
  isValidKey,
  buildSearchQuery,
  getDateWindow,
  getProximityRank,
};
