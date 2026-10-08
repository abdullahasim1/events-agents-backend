const {
  isValidKey,
  getProximityRank,
  isJunkEvent,
  isMinnesotaOrVirtual,
  isProfessionalEvent,
  deduplicateEventList,
} = require("./utils");

// 1. Ultra-Strict Professional AI Prompt Template
const PROMPT = (locs, types, text, { startDate, endDate }) => `
You are an expert conference intelligence agent filtering events for an executive outreach dashboard.
Target: Strictly upcoming professional conferences, summits, symposiums, expos, and structured professional training workshops matching categories [${types}] in [${locs}] between ${startDate} and ${endDate}.

Raw Data:
${text}

=========================================
🚨 ZERO-TOLERANCE EXCLUSION RULES (DISCARD IMMEDIATELY):
=========================================
1. NO SPORTS / RACES / FITNESS:
   - Discard all 5K, 10K, marathons, sprints, running races, fun runs, walks, triathlons, tournaments, open gyms, sports camps (e.g. "Spooky Sprint").
2. NO PHOTOSHOOTS OR PRIVATE CLINICAL SESSIONS:
   - Discard all photography mini-sessions, photoshoots, portrait sessions, open houses for photography (e.g. "Fall Motherhood Mini Sessions").
3. NO CRAFTS, ARTS & HOBBY WORKSHOPS:
   - Discard pottery classes, painting classes, ceramics workshops, sample classes, wine & paint, DIY crafts, knitting (e.g. "Come Sample What We Do!").
4. NO SOCIAL GATHERINGS, PARTIES, OR CONSUMER POP-UPS:
   - Discard happy hours, pub crawls, baby showers, market stalls, craft fairs, costume parties, flea markets, festivals.
5. MUST BE A LEGITIMATE PROFESSIONAL EVENT:
   - Must be a professional, academic, medical, educational, healthcare, or corporate conference, summit, symposium, convention, forum, expo, or structured professional training/workshop.

=========================================
🗺️ STRICT MINNESOTA GEO-FENCE (MINNESOTA ONLY):
=========================================
- The physical event venue or host city MUST be located in Minnesota (MN).
- IMMEDIATELY DISCARD any event located in Washington D.C., Chicago, New York, California, Texas, Florida, or ANY city/state outside Minnesota, EVEN IF a Minnesota organization, chapter, or speaker is mentioned.
- Virtual/online events are permitted ONLY if hosted by a recognized Minnesota or national professional association.

=========================================
📅 STRICT DATE WINDOW RULE:
=========================================
- Every event MUST fall strictly between ${startDate} and ${endDate} (inclusive).
- Discard any event outside this range.

=========================================
🔄 DEDUPLICATION & TITLE NORMALIZATION:
=========================================
- Merge duplicate variants of the same conference into ONE canonical entry.
- Clean up promotional noise: strip prefixes like "Join us at...", "Register now for...", "Annual...", or redundant year prefixes like "2026 ...".
- Use the official, professional title (e.g. "Minnesota OCD Conference 2026", "Self-Direction Connection Conference 2026", "Ellie Mental Health Franchise Conference 2026").
- Do NOT output multiple entries for the same event on the same date.

=========================================
🏷️ FIELD REQUIREMENTS:
=========================================
- "category": Choose EXACTLY ONE of [${types}], copied VERBATIM. Do not invent or reword categories.
- "ticketUrl": MUST be the actual event or ticket URL from the matching "Link" field. Never return "-" if a link is present.
- "source": Website name or platform domain (e.g. "Eventbrite", "PredictHQ", "NACAC.org"). Never use bracketed citations like "[11]".
- "venue": Exact physical venue inside the city (e.g. "Minneapolis Convention Center", "Saint Paul RiverCentre", or "Online").
- "city": Host city with state (e.g. "Minneapolis, MN", "St. Paul, MN", "Bloomington, MN", "Online").
- "time": Real start/end time (e.g. "09:00 AM - 04:00 PM"). If none found, leave empty string "".

Return ONLY a valid JSON array (no markdown code blocks, no backticks, no preamble):
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

  const locStr = [locations].flat().join(", ") || "Minnesota";
  const typeStr = [eventTypes].flat().join(", ") || "Conferences";

  // Pre-filter raw events to remove exact title duplicates before sending to Claude
  const seenRaw = new Set();
  const dedupedRaw = rawEvents
    .filter((e) => {
      const k = (e.title || "").trim().toLowerCase();
      return k && !seenRaw.has(k) && seenRaw.add(k);
    })
    .slice(0, 350);

  const rawText = dedupedRaw
    .map(
      (e, i) =>
        `Item #${i + 1} | Source: ${e.source || "Web"} | Title: ${e.title} | Date: ${e.date || ""} | Time: ${e.time || ""} | Venue: ${e.venue || ""} | Link: ${e.ticketUrl || e.url || ""} | Info: ${e.description || e.snippet || ""}`,
    )
    .join("\n");

  console.log(
    `   🤖 [Claude AI] Verifying & Extracting ${dedupedRaw.length} candidate items for [${locStr}]...`,
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

  // 🛡️ MULTI-LAYER CODE SAFETY SHIELD:
  // 1. Strict Date Window Filter
  // 2. Junk Blacklist Filter (No races, photoshoots, crafts)
  // 3. Strict Minnesota Geo-Fence Filter (No D.C., Chicago, etc.)
  // 4. Professional Event Type Validator
  const validList = rawList.filter((e) => {
    // 1. Date window verification
    if (!e.date) return false;
    const match = String(e.date).match(/\d{4}-\d{2}-\d{2}/);
    const dateStr = match ? match[0] : "";
    if (dateStr && dateWindow.startDate && dateWindow.endDate) {
      if (dateStr < dateWindow.startDate || dateStr > dateWindow.endDate) return false;
    }

    // 2. Junk rejection (races, sports, photoshoots, crafts, pottery)
    if (isJunkEvent(e.title || "", `${e.description || ""} ${e.venue || ""}`)) {
      console.log(`   ⛔ [Shield Dropped Junk]: "${e.title}"`);
      return false;
    }

    // 3. Minnesota State & City Geo-fence verification
    if (!isMinnesotaOrVirtual(e.city || "", e.venue || "")) {
      console.log(`   ⛔ [Shield Dropped Out-Of-State]: "${e.title}" in (${e.city || e.venue})`);
      return false;
    }

    // 4. Professional Event Validator
    if (!isProfessionalEvent(e.title || "", e.category || "", e.description || "")) {
      console.log(`   ⛔ [Shield Dropped Non-Conference]: "${e.title}"`);
      return false;
    }

    return true;
  });

  const mappedEvents = validList.map((e, idx) => {
    let contact = (e.contactInfo || "").trim();
    if (!contact || /not available|n\/a|^-$/i.test(contact)) {
      const textSnippet = `${e.description || ""} ${e.snippet || ""}`;
      const email = textSnippet.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0];
      const phone = textSnippet.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g)?.[0];
      contact = [email, phone].filter(Boolean).join(" | ") || (
        e.ticketUrl && !e.ticketUrl.includes("google.com/search") ? e.ticketUrl : (e.ticketUrl || "")
      );
    }

    let time = (e.time || "").trim();
    if (/^(tba|tbh|-)$/i.test(time)) {
      time = "";
    }

    const rawCategory = (e.category || e.opportunityType || e.type || "Conference / Summit").trim();
    const finalCategory = !rawCategory || rawCategory === "undefined" ? "Conference / Summit" : rawCategory;

    const city = e.city || e.location || "Minnesota";
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

  // 🛡️ IN-MEMORY FUZZY DEDUPLICATION (Merges near-duplicate variants into one entry)
  const dedupedEvents = deduplicateEventList(mappedEvents);

  // 📍 SORT NEAREST FIRST (Core Metro Hub -> Suburbs -> Regional -> Minnesota General), then by Date
  dedupedEvents.sort((a, b) => {
    const tierDiff = (a.proximityTier || 99) - (b.proximityTier || 99);
    if (tierDiff !== 0) return tierDiff;
    return String(a.date || "").localeCompare(String(b.date || ""));
  });

  return dedupedEvents;
}

module.exports = { extractEventsWithClaude };
