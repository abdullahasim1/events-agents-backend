const {
  isValidKey,
  getProximityRank,
  getTitleFingerprint,
  normalizeDateKey,
  generateEventSlug,
} = require("./utils");

// 1. Crisp, High-Density System Instructions (Anthropic Prompt Caching enabled)
// 1. Crisp, High-Density System Instructions (Anthropic Prompt Caching enabled)
const SYSTEM_INSTRUCTIONS = `You are an expert event intelligence agent filtering executive and community outreach events.
Target Opportunities:
1. Professional Conferences & Summits: Medical, Healthcare, Brain Health, Mental Health, Psychiatry, Psychology, Counseling, Neuroscience, Biohacking, Peak Performance, Disabilities, and Sleep Medicine. (Opportunities to present or set up a vendor table).
2. Community Gatherings & Vendor Expos: Health & Fitness Expos, Marathon Expos, 5K races, endurance sports, community wellness events, holistic wellness fairs, farmers markets, and art/community festivals where organizations can have a vendor table or booth.
3. Silent Auctions: Silent auctions hosted by schools, charitable foundations, non-profits, or community organizations.
4. Charitable & Sponsorship Events: Charity galas, benefit dinners, golf tournaments, and fundraising events offering corporate/community sponsorship opportunities.

=========================================
🚨 ZERO-TOLERANCE EXCLUSIONS (DISCARD IMMEDIATELY):
=========================================
1. NO PHOTOSHOOTS / MINI-SESSIONS: Discard photography sessions, studio mini-sessions.
2. NO BAR/CLUB PARTIES: Discard pub crawls, club nights, happy hours, general karaoke, singles mixers.
3. NO POP CULTURE / COMIC / SCI-FI / HORROR CONVENTIONS: Discard comic cons, gaming, anime, fantasy, or horror conventions (e.g. Crypticon).
4. NO HOME IMPROVEMENT / REMODELING SHOWS: Discard generic home improvement/construction/roofing expos.
5. NO GENERAL IT/TECH/CRYPTO: Discard generic IT/software/cloud/crypto conferences unless directly healthcare/biohacking related.
6. NO PURELY PARTISAN/POLITICAL: Discard political rallies or partisan campaign speeches.
7. MUST FIT AT LEAST ONE TARGET OPPORTUNITY: Professional conferences (health, brain, mental health, biohacking), community wellness & gatherings (health expos, marathon/5k, holistic fairs, farmers markets, art fairs), silent auctions, or charity sponsorship events (galas, golf tournaments).

=========================================
🗺️ STRICT MINNESOTA GEO-FENCE:
=========================================
- Physical venue MUST be located in Minnesota (Minneapolis, St. Paul, Bloomington, Rochester, Duluth, Edina, St. Cloud, Plymouth, Minnetonka, Twin Cities, etc.).
- Immediately discard any out-of-state events (Chicago, DC, NY, CA, TX, FL, etc.).
- Virtual/online events are permitted ONLY if hosted by a recognized Minnesota or national professional association.

=========================================
🔄 DEDUPLICATION & SCHEMA:
=========================================
- Merge duplicate variants into ONE canonical official event title.
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
  const titleLower = e.title.toLowerCase();
  if (/merriam-webster|thesaurus|wikipedia|dictionary|archives|schedule|hotel|flight/i.test(titleLower)) return false;
  if (/photoshoot|mini-session|pub crawl|bar crawl|happy hour|karaoke/i.test(titleLower)) return false;

  const d = normalizeDateKey(e.date);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;

  if (dateWindow?.startDate && d < dateWindow.startDate) return false;
  if (dateWindow?.endDate && d > dateWindow.endDate) return false;
  return true;
}

function fallbackParseEvents(rawEvents, dateWindow, onEvent) {
  const seen = new Set();
  const list = [];
  for (const raw of rawEvents) {
    if (!raw.title) continue;
    const titleLower = raw.title.toLowerCase();

    // 1. Strict Junk Exclusions (No dictionary, wikipedia, generic schedules)
    if (/merriam-webster|thesaurus|wikipedia|dictionary|archives|schedule|hotel|flight/i.test(titleLower)) continue;
    if (/photoshoot|mini-session|pub crawl|bar crawl|happy hour|karaoke/i.test(titleLower)) continue;

    // 2. Strict Valid Date Requirement (No TBA or missing dates)
    const dateKey = normalizeDateKey(raw.date);
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;

    // 3. Strict Date Window Filter
    if (dateWindow?.startDate && dateKey < dateWindow.startDate) continue;
    if (dateWindow?.endDate && dateKey > dateWindow.endDate) continue;

    const titleFp = getTitleFingerprint(raw.title);
    const key = `${titleFp}|${dateKey}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const ev = formatSingleEvent(
      {
        title: raw.title,
        organization: raw.organization || "",
        category: raw.category || "Conference / Summit",
        opportunityType: raw.opportunityType || "Professional Conference",
        audienceType: raw.audienceType || "General Audience",
        date: dateKey,
        time: raw.time || "",
        venue: raw.venue || raw.city || "Minnesota",
        city: raw.city || "Minnesota",
        registrationDeadline: "-",
        proposalDeadline: "-",
        contactInfo: raw.url || raw.ticketUrl || "",
        status: "Confirmed",
        description: raw.snippet || raw.description || raw.title,
        ticketUrl: raw.url || raw.ticketUrl || "",
        source: raw.source || "PredictHQ",
      },
      list.length,
    );

    list.push(ev);
    onEvent?.(ev);
  }
  return list;
}

/**
 * ⚡ REAL-TIME STREAMING CLAUDE EXTRACTION (with Anthropic Prompt Caching)
 */
async function streamEventsWithClaude(locations, eventTypes, rawEvents, dateWindow, { onEvent, onStatus } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const locStr = [locations].flat().join(", ") || "Minnesota";
  const typeStr = [eventTypes].flat().join(", ") || "Conferences";

  const dedupedRaw = rawEvents
    .filter((e, i, arr) => e.title && arr.findIndex((x) => x.title.toLowerCase() === e.title.toLowerCase()) === i)
    .slice(0, 150);

  if (!dedupedRaw.length) return [];

  if (!isValidKey(apiKey)) {
    console.warn("⚠️ [Claude AI]: ANTHROPIC_API_KEY missing. Using direct candidate parser.");
    return fallbackParseEvents(dedupedRaw, dateWindow, onEvent);
  }
  onStatus?.({ message: `Claude analyzing ${dedupedRaw.length} candidates in real-time...` });

  const rawText = dedupedRaw
    .map((e, i) => `#${i + 1} | Source: ${e.source || "Web"} | Title: ${e.title} | Date: ${e.date || ""} | Venue: ${e.venue || ""} | Link: ${e.ticketUrl || e.url || ""} | Info: ${e.description || ""}`)
    .join("\n");

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
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

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`⚠️ [Claude AI Fallback]: (${res.status}): ${errText}. Falling back to direct candidate parser.`);
      return fallbackParseEvents(dedupedRaw, dateWindow, onEvent);
    }
  } catch (fetchErr) {
    console.warn(`⚠️ [Claude AI Fallback]: ${fetchErr.message}. Falling back to direct candidate parser.`);
    return fallbackParseEvents(dedupedRaw, dateWindow, onEvent);
  }

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
