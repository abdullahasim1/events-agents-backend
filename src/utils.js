const FETCH_TIMEOUT_MS = 16000;
const DEFAULT_DAYS = 7;

const isValidKey = (k) => Boolean(k && !k.startsWith("your_"));

const buildSearchQuery = (type, loc, time = "") =>
  `${[type].flat().join(" ")} ${loc ? `in ${loc}` : ""} ${time}`.replace(/\s+/g, " ").trim();

function getDateWindow(days = DEFAULT_DAYS, customStart) {
  const now = new Date();
  // 1-day buffer before today to include ongoing conferences and timezone variance
  const start = customStart && !isNaN(new Date(customStart))
    ? new Date(customStart)
    : new Date(now.getTime() - 86400000);
  const end = new Date(now.getTime() + (parseInt(days, 10) || DEFAULT_DAYS) * 86400000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    year: now.getFullYear(),
    monthName: now.toLocaleString("en-US", { month: "long" }),
  };
}

const getProximityRank = (city = "") => (/minneapolis|paul|bloomington/i.test(city) ? 1 : 2);

const getTitleFingerprint = (t = "") =>
  String(t).toLowerCase().replace(/\b(202[0-9]|mn|minnesota|annual)\b/g, "").replace(/[^a-z0-9]/g, "");

const normalizeDateKey = (d = "", defaultYear = new Date().getFullYear()) => {
  if (!d) return "";
  const match = String(d).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const m = String(d).match(/([a-z]{3,9})[\s,]+(\d{1,2})/i);
  if (m) {
    const mm = months[m[1].toLowerCase().slice(0, 3)];
    if (mm) return `${defaultYear}-${mm}-${String(m[2]).padStart(2, "0")}`;
  }
  const parsed = new Date(d);
  if (!isNaN(parsed) && parsed.getFullYear() > 2020) {
    return parsed.toISOString().slice(0, 10);
  }
  return String(d).slice(0, 10);
};

const getEventKey = (e = {}) => `${getTitleFingerprint(e.title || e.name)}|${normalizeDateKey(e.date)}`;

const deduplicateEventList = (events = []) =>
  Array.from(new Map(events.map((e) => [getEventKey(e), e])).values());

function generateEventSlug(title = "", date = "") {
  const cleanTitle = String(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 65)
    .replace(/-+$/, "");

  const yearMatch = String(date).match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : "";

  let slug = cleanTitle;
  if (year && !slug.endsWith(year)) {
    slug = `${slug}-${year}`;
  }
  return slug || `event-${Date.now()}`;
}

module.exports = {
  FETCH_TIMEOUT_MS,
  DEFAULT_DAYS,
  isValidKey,
  buildSearchQuery,
  getDateWindow,
  getProximityRank,
  getTitleFingerprint,
  normalizeDateKey,
  getEventKey,
  deduplicateEventList,
  generateEventSlug,
};
