const {
  isValidKey,
  getProximityRank,
  getTitleFingerprint,
  normalizeDateKey,
  generateEventSlug,
} = require("./utils");

// 1. Crisp, High-Density System Instructions (Anthropic Prompt Caching enabled)
const SYSTEM_INSTRUCTIONS = `You are an expert conference intelligence agent filtering executive events.
Target: Strictly upcoming professional conferences, summits, symposiums, expos, and clinical workshops in Medical, Healthcare, Mental Health, Psychiatry, Psychology, Counseling, Neuroscience, and Developmental Disabilities.

=========================================
🚨 ZERO-TOLERANCE EXCLUSIONS (DISCARD IMMEDIATELY):
=========================================
1. NO SPORTS/FITNESS: Discard all 5K, 10K, marathons, races, fun runs, walks, tournaments, open gyms.
2. NO PHOTOSHOOTS: Discard photography sessions, mini-sessions, open houses.
3. NO CRAFTS/HOBBIES: Discard pottery, ceramics, wine & paint, DIY crafts, cooking classes.
4. NO SOCIAL PARTIES: Discard happy hours, pub crawls, flea markets, craft fairs, costume parties.
5. NO YOUTH/K-12: Discard school science fairs, student recitals, day camps, general parent meetings.
6. NO GENERAL BUSINESS/SALES: Discard chamber of commerce, business breakfasts, buying roadshows, retail, corporate forums.
7. NO GENERAL TECH/IT: Discard general software, tech summits, telecom unless explicitly medical/health IT.
8. NO RELIGIOUS/POLITICAL: Discard pastor summits, church conferences, ministry meetings, international diplomacy.
9. NO ENVIRONMENTAL/NATURAL: Discard water resources, agriculture, forestry, climate conventions.
10. MUST BE HEALTHCARE / MEDICAL: Must be clinical medicine, nursing, mental health, psychiatry, psychology, counseling, neurology, or disabilities.

=========================================
🗺️ STRICT MINNESOTA GEO-FENCE:
=========================================
- Physical venue MUST be located in Minnesota (Minneapolis, St. Paul, Bloomington, Rochester, Duluth, etc.).
- Immediately discard any out-of-state events (Chicago, DC, NY, CA, TX, FL, etc.).
- Virtual/online events are permitted ONLY if hosted by a recognized Minnesota or national professional association.

=========================================
🔄 DEDUPLICATION & SCHEMA:
=========================================
- Merge duplicate variants into ONE canonical official conference title.
- Return ONLY a valid JSON array of objects with schema:
  [{"id":"ev-1","title":"","organization":"","category":"","opportunityType":"","audienceType":"","date":"YYYY-MM-DD","time":"","venue":"","city":"","registrationDeadline":"-","proposalDeadline":"-","contactInfo":"","status":"Confirmed","description":"","ticketUrl":"","source":""}]
- Output ONLY the raw JSON array (no markdown code blocks, no backticks, no conversational preamble).`;

function buildUserPrompt(locStr, typeStr, rawText, dateWindow) {
  const start = dateWindow?.startDate || "upcoming";
  const end = dateWindow?.endDate || "upcoming";
  return `Target Criteria:
- Location: ${locStr} (Venue MUST be in Minnesota or Online)
- Date Window: strictly between ${start} and ${end} (inclusive)
- Preferred Categories: [${typeStr}]

Candidate Raw Items:
${rawText}

Instructions:
Evaluate candidates against exclusion rules and Minnesota geo-fence. Return ONLY a valid JSON array matching the schema.`;
}

function formatSingleEvent(e, idx = 0) {
  const city = e.city || e.location || "Minnesota";
  const id = generateEventSlug(e.title, e.date);
  return {
    ...e,
    id,
    date: normalizeDateKey(e.date) || e.date || "",
    category: e.category || "Conference / Summit",
    city,
    location: city,
    contactInfo: (e.contactInfo || "").trim() || e.ticketUrl || "",
    time: /^(tba|tbh|-)$/i.test(e.time || "") ? "" : (e.time || "").trim(),
    proximityTier: getProximityRank(city),
  };
}

function validateSingleEvent(e, dateWindow) {
  if (!e?.title) return false;
  const d = normalizeDateKey(e.date);
  if (dateWindow?.startDate && dateWindow?.endDate && d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    if (d < dateWindow.startDate || d > dateWindow.endDate) return false;
  }
  return true;
}

/**
 * ⚡ REAL-TIME STREAMING CLAUDE EXTRACTION (with Anthropic Prompt Caching)
 */
async function streamEventsWithClaude(locations, eventTypes, rawEvents, dateWindow, { onEvent, onStatus } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!isValidKey(apiKey)) throw new Error("ANTHROPIC_API_KEY missing");

  const locStr = [locations].flat().join(", ") || "Minnesota";
  const typeStr = [eventTypes].flat().join(", ") || "Conferences";

  const dedupedRaw = rawEvents
    .filter((e, i, arr) => e.title && arr.findIndex((x) => x.title.toLowerCase() === e.title.toLowerCase()) === i)
    .slice(0, 150);

  if (!dedupedRaw.length) return [];
  onStatus?.({ message: `Claude analyzing ${dedupedRaw.length} candidates in real-time...` });

  const rawText = dedupedRaw
    .map((e, i) => `#${i + 1} | Source: ${e.source || "Web"} | Title: ${e.title} | Date: ${e.date || ""} | Venue: ${e.venue || ""} | Link: ${e.ticketUrl || e.url || ""} | Info: ${e.description || ""}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      stream: true,
      system: [{ type: "text", text: SYSTEM_INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserPrompt(locStr, typeStr, rawText, dateWindow) }],
    }),
    signal: AbortSignal.timeout(50000),
  });

  if (!res.ok) throw new Error(`Claude (${res.status}): ${await res.text()}`);

  const collected = [];
  const seenKeys = new Set();
  let buffer = "";

  const processBuffer = () => {
    let start = -1, depth = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === "{" && depth++ === 0) start = i;
      if (buffer[i] === "}" && --depth === 0 && start !== -1) {
        try {
          const item = JSON.parse(buffer.slice(start, i + 1));
          if (validateSingleEvent(item, dateWindow)) {
            const ev = formatSingleEvent(item, collected.length);
            const key = `${getTitleFingerprint(ev.title)}|${normalizeDateKey(ev.date)}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              collected.push(ev);
              onEvent?.(ev);
            }
          }
        } catch (_) {}
        buffer = buffer.slice(i + 1);
        i = -1;
        start = -1;
      }
    }
  };

  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    const text = decoder.decode(chunk, { stream: true });
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:") || trimmed.includes("[DONE]")) continue;
      try {
        const payload = JSON.parse(trimmed.slice(5));
        if (payload.type === "message_start" && payload.message?.usage) {
          const u = payload.message.usage;
          if (u.cache_read_input_tokens > 0) {
            console.log(`   ⚡ [Claude Cache HIT] ${u.cache_read_input_tokens} cached tokens (~90% cost cut)`);
          }
        }
        if (payload.type === "content_block_delta" && payload.delta?.text) {
          buffer += payload.delta.text;
          processBuffer();
        }
      } catch (_) {}
    }
  }

  processBuffer();
  return collected;
}

// Minimal alias for backward compatibility
const extractEventsWithClaude = (locs, types, raw, dates) =>
  streamEventsWithClaude(locs, types, raw, dates);

module.exports = {
  extractEventsWithClaude,
  streamEventsWithClaude,
  formatSingleEvent,
  validateSingleEvent,
};
