const {
  isValidKey,
  getProximityRank,
  isJunkEvent,
  isMinnesotaOrVirtual,
  isProfessionalEvent,
  deduplicateEventList,
  getTitleFingerprint,
  normalizeDateKey,
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

  const mappedEvents = validList.map((e, idx) => formatSingleEvent(e, idx));
  const dedupedEvents = deduplicateEventList(mappedEvents);
  dedupedEvents.sort((a, b) => {
    const tierDiff = (a.proximityTier || 99) - (b.proximityTier || 99);
    if (tierDiff !== 0) return tierDiff;
    return String(a.date || "").localeCompare(String(b.date || ""));
  });
  return dedupedEvents;
}

function formatSingleEvent(e, idx = 0) {
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
  const normDate = normalizeDateKey(e.date) || e.date || "";
  return {
    ...e,
    id: e.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx + 1}`,
    date: normDate,
    category: finalCategory,
    city,
    location: city,
    contactInfo: contact,
    time,
    proximityTier: getProximityRank(city),
  };
}

function validateSingleEvent(e, dateWindow) {
  if (!e || !e.title || !e.date) return false;
  const match = String(e.date).match(/\d{4}-\d{2}-\d{2}/);
  const dateStr = match ? match[0] : "";
  if (dateStr && dateWindow?.startDate && dateWindow?.endDate) {
    if (dateStr < dateWindow.startDate || dateStr > dateWindow.endDate) return false;
  }
  if (isJunkEvent(e.title || "", `${e.description || ""} ${e.venue || ""}`)) return false;
  if (!isMinnesotaOrVirtual(e.city || "", e.venue || "")) return false;
  if (!isProfessionalEvent(e.title || "", e.category || "", e.description || "")) return false;
  return true;
}

/**
 * ⚡ STREAMING CLAUDE EXTRACTION:
 * Calls Claude with stream: true. Emits events via onEvent as soon as each JSON object completes.
 */
async function streamEventsWithClaude(
  locations,
  eventTypes,
  rawEvents,
  dateWindow,
  { onEvent, onStatus } = {},
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!isValidKey(apiKey))
    throw new Error("ANTHROPIC_API_KEY is missing or invalid.");

  const locStr = [locations].flat().join(", ") || "Minnesota";
  const typeStr = [eventTypes].flat().join(", ") || "Conferences";

  // Pre-filter raw candidates to top 60 clean candidates for 3x speed boost
  const seenRaw = new Set();
  const dedupedRaw = rawEvents
    .filter((e) => {
      const k = (e.title || "").trim().toLowerCase();
      if (!k || seenRaw.has(k)) return false;
      seenRaw.add(k);
      if (isJunkEvent(e.title || "", e.snippet || e.description || "")) return false;
      return true;
    })
    .slice(0, 60);

  if (!dedupedRaw.length) return [];

  const rawText = dedupedRaw
    .map(
      (e, i) =>
        `Item #${i + 1} | Source: ${e.source || "Web"} | Title: ${e.title} | Date: ${e.date || ""} | Time: ${e.time || ""} | Venue: ${e.venue || ""} | Link: ${e.ticketUrl || e.url || ""} | Info: ${e.description || e.snippet || ""}`,
    )
    .join("\n");

  if (onStatus) {
    onStatus({ message: `Claude AI analyzing ${dedupedRaw.length} candidates in real-time...` });
  }

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
      stream: true,
      messages: [
        { role: "user", content: PROMPT(locStr, typeStr, rawText, dateWindow) },
      ],
    }),
    signal: AbortSignal.timeout(50000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude (${res.status}): ${errText}`);
  }

  const collectedEvents = [];
  let jsonBuffer = "";

  const extractJsonObjects = () => {
    let depth = 0;
    let inString = false;
    let isEscaped = false;
    let startIndex = -1;
    let lastEnd = 0;

    for (let i = 0; i < jsonBuffer.length; i++) {
      const char = jsonBuffer[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === "\\") {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        if (depth === 0) startIndex = i;
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0 && startIndex !== -1) {
          const jsonSub = jsonBuffer.slice(startIndex, i + 1);
          try {
            const parsed = JSON.parse(jsonSub);
            if (parsed && typeof parsed === "object") {
              if (validateSingleEvent(parsed, dateWindow)) {
                const formatted = formatSingleEvent(parsed, collectedEvents.length);
                const fp = getTitleFingerprint(formatted.title);
                const normDate = normalizeDateKey(formatted.date);

                // Deduplicate within the same Claude stream
                const alreadySeen = collectedEvents.some((c) => {
                  const cFp = getTitleFingerprint(c.title);
                  const cDate = normalizeDateKey(c.date);
                  if (normDate && cDate && normDate !== cDate) return false;
                  if (fp && cFp && fp === cFp) return true;
                  if (fp && cFp && (fp.includes(cFp) || cFp.includes(fp))) {
                    const minLen = Math.min(fp.length, cFp.length);
                    const maxLen = Math.max(fp.length, cFp.length);
                    if (minLen / maxLen >= 0.6) return true;
                  }
                  return false;
                });

                if (!alreadySeen) {
                  collectedEvents.push(formatted);
                  if (onEvent) onEvent(formatted);
                }
              }
            }
            lastEnd = i + 1;
          } catch (_) {}
          startIndex = -1;
        }
      }
    }

    if (lastEnd > 0) {
      jsonBuffer = jsonBuffer.slice(lastEnd);
    }
  };

  const decoder = new TextDecoder();
  let sseChunkBuffer = "";

  for await (const chunk of res.body) {
    sseChunkBuffer += decoder.decode(chunk, { stream: true });
    const lines = sseChunkBuffer.split("\n");
    sseChunkBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === "[DONE]") continue;

      try {
        const payload = JSON.parse(jsonStr);
        if (payload.type === "content_block_delta" && payload.delta?.text) {
          jsonBuffer += payload.delta.text;
          extractJsonObjects();
        }
      } catch (_) {}
    }
  }

  if (jsonBuffer.trim()) {
    extractJsonObjects();
  }

  return collectedEvents;
}

module.exports = {
  extractEventsWithClaude,
  streamEventsWithClaude,
  formatSingleEvent,
  validateSingleEvent,
};
