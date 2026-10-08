/**
 * ⚡ 2-STEP CONTACT ENRICHMENT SERVICE:
 * Batch extracts full-page content via Tavily /extract and pulls real emails and phones.
 * Fallback to event ticketUrl if direct phone/email is not found.
 */
async function enrichContacts(events) {
  // Zero-cost contact extraction: Regex match emails and phones from event text/snippet
  for (const event of events) {
    if (!event.contactInfo || !event.contactInfo.includes("@")) {
      const text = `${event.description || ""} ${event.snippet || ""}`;
      const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0];
      const phone = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g)?.[0];

      if (email || phone) {
        event.contactInfo = [email, phone].filter(Boolean).join(" | ");
      }
    }
  }

  // Final normalization: Fallback contactInfo to ticketUrl if missing, clean up TBA time
  for (const ev of events) {
    if (!ev.contactInfo || /not available|n\/a|^-$/i.test(String(ev.contactInfo).trim())) {
      ev.contactInfo = ev.ticketUrl && !ev.ticketUrl.includes("google.com/search")
        ? ev.ticketUrl
        : (ev.ticketUrl || "");
    }

    if (/^(tba|tbh|-)$/i.test(String(ev.time || "").trim())) {
      ev.time = "";
    }
  }

  return events;
}

module.exports = { enrichContacts };
