const { DEFAULT_DAYS } = require("./agentConfig");

const FETCH_TIMEOUT_MS = 25000;

const isValidKey = (k) => Boolean(k && !k.startsWith("your_"));

const buildSearchQuery = (type, loc, time = "") =>
  `${[type].flat().join(" ")} ${loc ? `in ${loc}` : ""} ${time}`.replace(/\s+/g, " ").trim();

function getDateWindow(days = DEFAULT_DAYS, customStart, customEnd) {
  const now = new Date();
  const start = customStart && !isNaN(new Date(customStart))
    ? new Date(customStart)
    : new Date(now.getTime() - 86400000);
  const end = customEnd && !isNaN(new Date(customEnd))
    ? new Date(customEnd)
    : new Date(start.getTime() + (parseInt(days, 10) || DEFAULT_DAYS) * 86400000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

const getProximityRank = (city = "") => (/minneapolis|paul|bloomington/i.test(city) ? 1 : 2);

const getTitleFingerprint = (t = "") =>
  String(t).toLowerCase().replace(/\b(202[0-9]|mn|minnesota|annual)\b/g, "").replace(/[^a-z0-9]/g, "");

const normalizeDateKey = (d = "") => {
  if (!d) return "";
  const match = String(d).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(d);
  if (isNaN(parsed) || parsed.getFullYear() <= 2020) return String(d).slice(0, 10);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

function generateEventSlug(title = "", date = "") {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const year = String(date).match(/\d{4}/)?.[0] || "";
  return (year && !slug.includes(year) ? `${slug}-${year}` : slug) || `event-${Date.now()}`;
}

module.exports = {
  FETCH_TIMEOUT_MS,
  isValidKey,
  buildSearchQuery,
  getDateWindow,
  getProximityRank,
  getTitleFingerprint,
  normalizeDateKey,
  generateEventSlug,
};
