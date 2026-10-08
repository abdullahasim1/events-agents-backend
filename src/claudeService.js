const { isValidKey, CLAUDE_TIMEOUT_MS, getProximityRank } = require("./utils");

// 1. Enhanced AI Prompt Template: Enforces clean sources, dynamic real time, and STRICT DATE WINDOW
const PROMPT = (locs, types, text, { startDate, endDate }) => `
Target: Upcoming events matching categories [${types}] in [${locs}] between ${startDate} and ${endDate}.
Data:
${text}

CRITICAL DATE RULE:
- Every event MUST fall strictly between ${startDate} and ${endDate} (inclusive).
- If an event is scheduled after ${endDate} (e.g. October 15, October 26, October 29) or before ${startDate}, YOU MUST REJECT AND DISCARD IT. DO NOT INCLUDE IT.

Instructions:
1. Filter: Keep ONLY verified upcoming events whose dates fall STRICTLY within ${startDate} to ${endDate}.
2. Category (STRICT): Set each event's "category" to EXACTLY ONE of the listed types, copied VERBATIM — [${types}]. Do not invent, merge, or reword type names. If an event does not clearly match ANY listed type, REJECT AND DISCARD IT.
3. STRICT DEDUPLICATION & MERGING:
   - Each real-world event must appear EXACTLY ONCE. NEVER output duplicate or near-duplicate events.
   - If one source has a shortened title and another has full title, MERGE them into ONE entry using the official title.
   - Always choose the most specific host city (e.g. use "Islamabad" instead of "Pakistan", use "Minneapolis, MN" instead of "Minneapolis").
4. REAL TICKET URL & CLEAN SOURCE (CRITICAL):
   - "ticketUrl": MUST be the actual event or ticket URL from the matching "Link" field. Never return "-" if a link is present.
   - "source": Write the actual website name or platform domain (e.g. "Eventbrite", "Google Events", "PredictHQ", "NACAC.org"). NEVER use numbers, brackets, or citations like "[11]" or "[12]".
5. CONTACT INFO:
   - "contactInfo": Extract organizer email or phone number if explicitly found in the text.
   - FALLBACK: If no explicit email or phone number is found, SET "contactInfo" TO THE EVENT'S TICKET / OFFICIAL PAGE URL ("ticketUrl"). The user will open this link to retrieve contact details directly.
6. Venue & Location:
   - "venue": Extract the exact physical venue where the event is happening inside the city (e.g. "Minneapolis Convention Center", "Saint Paul College", "River’s Edge Convention Center", "Graduate by Hilton", or "Online").
   - "city": The specific host city (e.g. "Minneapolis, MN", "St. Paul, MN", "St. Cloud, MN").
7. Opportunity: Identify organization, opportunityType, audienceType, deadlines.
8. REAL DYNAMIC TIME (NO HARDCODING):
   - Extract the real event start and end time (e.g. "10:00 AM", "01:00 PM - 05:00 PM", "08:30 AM EST", "19:00") directly from the Date, Time, or Info snippets.
   - DO NOT make up or hardcode fake times. If no time is found in the source, leave "time" as an empty string "".
9. Return ONLY valid JSON array (no markdown code blocks, no backticks, no preamble):
[{"id":"ev-1","title":"","organization":"","category":"","opportunityType":"","audienceType":"","date":"YYYY-MM-DD","time":"","venue":"","city":"","registrationDeadline":"-","proposalDeadline":"-","contactInfo":"https://...","status":"Confirmed","description":"","ticketUrl":"","source":""}]`;

/**
 * 🚀 MAIN AI EXTRACTION:
 * Calls Claude Haiku Messages API to verify, deduplicate, and extract clean events from raw data
 */
async function extractEventsWithClaude(
  locations,
  eventTypes,
  rawEvents,
  dateWindow,
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!isValidKey(apiKey))
    throw new Error("ANTHROPIC_API_KEY is missing or invalid.");

  const locStr = [locations].flat().join(", ") || "Global";
  const typeStr = [eventTypes].flat().join(", ") || "General";

  // Pre-filter raw events to remove exact title duplicates before sending to Claude
  const seenRaw = new Set();
  const dedupedRaw = rawEvents
    .filter((e) => {
      const k = (e.title || "").trim().toLowerCase();
      return k && !seenRaw.has(k) && seenRaw.add(k);
    })
    .slice(0, 350); // High safety cap: covers 100% of real candidate events without timeout

  const rawText = dedupedRaw
    .map(
      (e, i) =>
        `Item #${i + 1} | Source: ${e.source || "Web"} | Title: ${e.title} | Date: ${e.date || ""} | Time: ${e.time || ""} | Venue: ${e.venue || ""} | Link: ${e.ticketUrl || e.url || ""} | Info: ${e.description || e.snippet || ""}`,
    )
    .join("\n");

  console.log(
    `   🤖 [Claude AI] Verifying & Extracting ${dedupedRaw.length} unique items for [${locStr}]...`,
  );

  // Anthropic Claude Messages API call
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [
        { role: "user", content: PROMPT(locStr, typeStr, rawText, dateWindow) },
      ],
    }),
    signal: AbortSignal.timeout(50000),
  });

  const data = await res.json();
  if (!res.ok)
    throw new Error(`Claude (${res.status}): ${data.error?.message || ""}`);

  // Response text se valid JSON array extract karein
  const text = (data.content || []).map((c) => c.text || "").join("");
  const start = text.indexOf("[");
  if (start === -1) return [];

  let parsed = [];
  // Scan backwards for the matching closing bracket
  for (let end = text.lastIndexOf("]"); end > start; end = text.lastIndexOf("]", end - 1)) {
    try {
      const candidate = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(candidate)) {
        parsed = candidate;
        break;
      }
    } catch {
      // continue scanning backwards
    }
  }

  const rawList = Array.isArray(parsed) ? parsed : [];

  // 🛡️ STRICT CODE-LEVEL DATE FILTER:
  // Discard any event that does not fall strictly between startDate and endDate
  const validList = rawList.filter((e) => {
    if (!e.date) return false;
    // Normalize date to YYYY-MM-DD
    const match = String(e.date).match(/\d{4}-\d{2}-\d{2}/);
    const dateStr = match ? match[0] : "";
    if (dateStr && dateWindow.startDate && dateWindow.endDate) {
      return dateStr >= dateWindow.startDate && dateStr <= dateWindow.endDate;
    }
    return true;
  });

  const mappedEvents = validList.map((e, idx) => {
    let contact = (e.contactInfo || "").trim();
    if (!contact || /not available|n\/a|^-$/i.test(contact)) {
      contact =
        e.ticketUrl && !e.ticketUrl.includes("google.com/search")
          ? e.ticketUrl
          : e.ticketUrl || "";
    }

    let time = (e.time || "").trim();
    if (/^(tba|tbh|-)$/i.test(time)) {
      time = "";
    }

    const rawCategory = (e.category || e.opportunityType || e.type || "Conference / Summit").trim();
    const finalCategory = !rawCategory || rawCategory === "undefined" ? "Conference / Summit" : rawCategory;

    const city = e.city || e.location || "";
    return {
      ...e,
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx + 1}`,
      category: finalCategory,
      city,
      location: city,
      contactInfo: contact,
      time,
      proximityTier: getProximityRank(city),
    };
  });

  // 📍 SORT NEAREST FIRST (Core Metro Hub -> Suburbs -> Regional -> Rest of USA), then by Date
  mappedEvents.sort((a, b) => {
    const tierDiff = (a.proximityTier || 99) - (b.proximityTier || 99);
    if (tierDiff !== 0) return tierDiff;
    return String(a.date || "").localeCompare(String(b.date || ""));
  });

  return mappedEvents;
}

module.exports = { extractEventsWithClaude };
