const FETCH_TIMEOUT_MS = 12000;
const CLAUDE_TIMEOUT_MS = 25000;
const DEFAULT_DAYS = 7;

// API key verification helper
const isValidKey = (k) => Boolean(k && !k.startsWith('your_'));

// 1. Intent Rules: Client ki 4 categories (Auctions, Galas, Vendor Booths, Conferences) ke intent keywords
const INTENT_RULES = [
  { match: /auction|silent/i, q: '("silent auction" OR "benefit auction" OR "fundraiser")' },
  { match: /gala|golf|charity/i, q: '("sponsorship" OR "charity gala" OR "sponsor packet")' },
  { match: /fair|market|5k|race/i, q: '("vendor booth" OR "exhibitor" OR "5k race")' },
  { match: /conference|summit|brain|mental|wellness/i, q: '("conference" OR "call for speakers" OR "vendor table")' },
];

/**
 * 🚀 SEARCH QUERY BUILDER:
 * Combines categories, location, intent keywords, and year into an optimized search query string
 */
function buildSearchQuery(eventType, location, timeQualifier = '') {
  const types = [eventType].flat().join(' ').toLowerCase();
  const intents = INTENT_RULES.filter((r) => r.match.test(types)).map((r) => r.q);
  const locPart = location ? `in ${location}` : '';
  const intentStr = intents.length ? `(${intents.join(' OR ')})` : '';

  return `upcoming events ${locPart} ${intentStr} ${timeQualifier}`.replace(/\s+/g, ' ').trim();
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
