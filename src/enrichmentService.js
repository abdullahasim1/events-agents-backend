/**
 * ⚡ 2-STEP CONTACT ENRICHMENT SERVICE:
 * Batch extracts full-page content via Tavily /extract and pulls real emails and phones.
 * Fallback to event ticketUrl if direct phone/email is not found.
 */
async function enrichContacts(events) {
  const apiKey = process.env.TAVILY_API_KEY;

  const targets = events
    .filter((e) => e.ticketUrl?.startsWith("http") && !e.contactInfo?.includes("@"))
    .slice(0, 5);

  if (targets.length && apiKey) {
    try {
      const res = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          urls: targets.map((e) => e.ticketUrl),
        }),
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json();
      const pages = new Map((data.results || []).map((r) => [r.url, r.raw_content || ""]));

      for (const event of targets) {
        const text = pages.get(event.ticketUrl) || "";

        const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0];
        const phone = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g)?.[0];

        if (email || phone) {
          event.contactInfo = [email, phone].filter(Boolean).join(" | ");
        }
      }
    } catch (err) {
      console.warn("⚠️ [Enrichment] Contact enrichment skipped:", err.message);
    }
  }

  // Final normalization: If contactInfo is still missing or "Not available", fallback to ticketUrl
  for (const ev of events) {
    if (!ev.contactInfo || /not available|n\/a|^-$/i.test(String(ev.contactInfo).trim())) {
      ev.contactInfo = ev.ticketUrl && !ev.ticketUrl.includes("google.com/search")
        ? ev.ticketUrl
        : (ev.ticketUrl || "Check Event Page");
    }

    if (!ev.time || /^(tba|tbh|-)$/i.test(String(ev.time).trim())) {
      ev.time = "09:00 AM - 05:00 PM";
    }
  }

  return events;
}

module.exports = { enrichContacts };
