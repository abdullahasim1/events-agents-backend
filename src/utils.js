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

/**
 * 🏷️ TITLE FINGERPRINT GENERATOR:
 * Normalizes event titles so variations like "2026 Minnesota OCD Conference",
 * "Minnesota OCD Conference 2026", and "Annual Minnesota OCD Conference"
 * map to the EXACT same fingerprint string for deduplication.
 */
function getTitleFingerprint(title = "") {
  return String(title || "")
    .toLowerCase()
    .replace(/^(join us at|register (now )?for|welcome to|announcing)\s+/i, "")
    .replace(/\b(202[4-9]|203[0-9])\b/g, "") // remove years like 2025, 2026, 2027
    .replace(/\b(national|state|statewide|annual|biannual|biennial|the|1st|2nd|3rd|4th|5th|fall|spring|summer|winter)\b/g, "")
    .replace(/[^a-z0-9]/g, "") // remove punctuation & whitespace
    .trim();
}

/**
 * 🚫 ZERO-TOLERANCE JUNK FILTER:
 * Catches running races, 5Ks/10Ks, photoshoots, pottery/craft workshops,
 * social mixers, blood drives, and non-conference junk.
 */
const JUNK_EVENT_REGEX = /\b(5k|10k|marathon|half marathon|sprint|running race|fun run|turkey trot|walkathon|triathlon|photoshoot|photo session|mini sessions?|portrait session|pottery|ceramics class|craft fair|craft workshop|art crawl|paint and sip|paint night|wine tasting|beer festival|pub crawl|bar crawl|blood drive|flea market|farmers market|vendor market|trunk or treat|costume party|speed dating|singles mixer|yoga in the park|open gym|zumba|pottery\/craft|gala dinner|fundraiser dinner|charity golf|benefit gala)\b/i;

function isJunkEvent(title = "", description = "") {
  const text = `${title} ${description}`;
  return JUNK_EVENT_REGEX.test(text);
}

/**
 * 🗺️ STRICT MINNESOTA GEO-FENCE:
 * Strictly permits Minnesota venues / host cities or verified Online/Virtual events.
 * Immediately rejects events hosted in other states (D.C., Chicago, NY, CA, TX, FL, etc.).
 */
const OUT_OF_STATE_REGEX = /\b(washington,\s*d\.?c\.?|district of columbia|chicago|illinois|\bil\b|california|\bca\b|texas|\btx\b|florida|\bfl\b|new york|\bny\b|nevada|\bnv\b|las vegas|georgia|\bga\b|atlanta|massachusetts|\bma\b|boston|colorado|\bco\b|denver|arizona|\baz\b|phoenix|pennsylvania|\bpa\b|philadelphia|ohio|\boh\b|wisconsin|\bwi\b|milwaukee|madison|iowa|\bia\b|des moines|north dakota|\bnd\b|fargo|south dakota|\bsd\b|sioux falls)\b/i;

const MN_LOCATION_REGEX = /\b(mn|minnesota|minneapolis|st\.?\s*paul|saint\s*paul|bloomington|edina|roseville|maple\s*grove|minnetonka|plymouth|st\.?\s*cloud|duluth|rochester|eagan|woodbury|brooklyn\s*park|coon\s*rapids|burnsville|blaine|lakeville|eden\s*prairie|apple\s*valley|mankato|moorhead|worthington|le\s*sueur|hinckley|bemidji)\b/i;

const VIRTUAL_REGEX = /\b(online|virtual|webinar|zoom|remote)\b/i;

function isMinnesotaOrVirtual(city = "", venue = "") {
  const combined = `${city} ${venue}`.toLowerCase();
  const isOut = OUT_OF_STATE_REGEX.test(combined);
  const isMN = MN_LOCATION_REGEX.test(combined);
  const isVirt = VIRTUAL_REGEX.test(combined);

  // If explicitly out-of-state and not in MN
  if (isOut && !isMN) return false;

  // Must either be in MN or Online/Virtual
  return isMN || isVirt;
}

/**
 * 🏛️ PROFESSIONAL EVENT VALIDATOR:
 * Ensures event is a conference, summit, symposium, forum, expo, seminar, workshop, or professional training.
 */
const PROFESSIONAL_EVENT_REGEX = /\b(conference|summit|symposium|forum|expo|exposition|convention|seminar|workshop|institute|congress|conclave|panel|roundtable|training|assembly|meeting|grand rounds|lecture|colloquium|retreat)\b/i;

function isProfessionalEvent(title = "", category = "", description = "") {
  const combined = `${title} ${category} ${description}`;
  return PROFESSIONAL_EVENT_REGEX.test(combined);
}

/**
 * 🛡️ IN-MEMORY FUZZY DEDUPLICATION:
 * Merges duplicate title variants, shared ticket URLs, and same-venue events.
 */
function deduplicateEventList(events = []) {
  const result = [];

  for (const event of events) {
    const fp = getTitleFingerprint(event.title);
    const date = String(event.date || "").trim();
    const url = String(event.ticketUrl || "").toLowerCase().split("?")[0].replace(/\/$/, "");
    const venue = String(event.venue || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const existingIndex = result.findIndex((existing) => {
      const existingFp = getTitleFingerprint(existing.title);
      const existingDate = String(existing.date || "").trim();
      const existingUrl = String(existing.ticketUrl || "").toLowerCase().split("?")[0].replace(/\/$/, "");
      const existingVenue = String(existing.venue || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      // Must be same date to merge
      if (date && existingDate && date !== existingDate) return false;

      // 1. Exact title fingerprint match
      if (fp && existingFp && fp === existingFp) return true;

      // 2. Fuzzy title containment
      if (fp && existingFp && (fp.includes(existingFp) || existingFp.includes(fp))) {
        const minLen = Math.min(fp.length, existingFp.length);
        const maxLen = Math.max(fp.length, existingFp.length);
        if (minLen / maxLen >= 0.6) return true;
      }

      // 3. Same specific ticket URL
      const isRealUrl = (u) => u && !u.includes("eventbrite.com/d/") && !u.includes("google.com") && !u.includes("facebook.com/events");
      if (isRealUrl(url) && isRealUrl(existingUrl) && url === existingUrl) return true;

      // 4. Same physical venue on the same date
      const isRealVenue = (v) => v && v.length > 5 && !/venue|online|virtual|tba|tbd|minnesota/i.test(v);
      if (isRealVenue(venue) && isRealVenue(existingVenue) && venue === existingVenue) return true;

      return false;
    });

    if (existingIndex !== -1) {
      const existing = result[existingIndex];
      result[existingIndex] = {
        ...existing,
        title: (event.title || "").length > (existing.title || "").length && !(event.title || "").toLowerCase().startsWith("join us") ? event.title : existing.title,
        venue: (existing.venue && !/venue tba|venue$/i.test(existing.venue)) ? existing.venue : (event.venue || existing.venue),
        city: (existing.city && existing.city !== "Minnesota") ? existing.city : (event.city || existing.city),
        description: (event.description || "").length > (existing.description || "").length ? event.description : existing.description,
        ticketUrl: (existing.ticketUrl && !existing.ticketUrl.includes("eventbrite.com/d/")) ? existing.ticketUrl : (event.ticketUrl || existing.ticketUrl),
        time: existing.time || event.time || "",
        contactInfo: existing.contactInfo || event.contactInfo || "",
      };
    } else {
      result.push(event);
    }
  }

  return result;
}

module.exports = {
  FETCH_TIMEOUT_MS,
  CLAUDE_TIMEOUT_MS,
  DEFAULT_DAYS,
  isValidKey,
  buildSearchQuery,
  getDateWindow,
  getProximityRank,
  getTitleFingerprint,
  isJunkEvent,
  isMinnesotaOrVirtual,
  isProfessionalEvent,
  deduplicateEventList,
};
