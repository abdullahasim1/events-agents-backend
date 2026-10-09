const { Pool } = require("pg");
const {
  getTitleFingerprint,
  normalizeDateKey,
  getProximityRank,
  generateEventSlug,
} = require("./utils");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => console.error("❌ [PostgreSQL Pool Error]:", err.message));

async function initDb() {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(100) PRIMARY KEY,
        title TEXT NOT NULL,
        title_fingerprint TEXT,
        organization TEXT,
        category TEXT,
        opportunity_type TEXT,
        audience_type TEXT,
        date VARCHAR(50),
        time VARCHAR(50),
        venue TEXT,
        city TEXT,
        registration_deadline TEXT,
        proposal_deadline TEXT,
        contact_info TEXT,
        status VARCHAR(50) DEFAULT 'Confirmed',
        description TEXT,
        ticket_url TEXT,
        source TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_fingerprint_date 
      ON events (title_fingerprint, LOWER(COALESCE(date, '')));
    `);
  } catch (err) {
    console.error("❌ [DB Init Error]:", err.message);
  }
}

const UPSERT_QUERY = `
  INSERT INTO events (
    id, title, title_fingerprint, organization, category, opportunity_type, audience_type,
    date, time, venue, city, registration_deadline, proposal_deadline,
    contact_info, status, description, ticket_url, source, updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
  )
  ON CONFLICT (title_fingerprint, LOWER(COALESCE(date, '')))
  DO UPDATE SET
    id = CASE WHEN events.id LIKE 'ev-%' THEN EXCLUDED.id ELSE events.id END,
    title = CASE WHEN LENGTH(EXCLUDED.title) >= LENGTH(events.title) THEN EXCLUDED.title ELSE events.title END,
    venue = COALESCE(NULLIF(EXCLUDED.venue, ''), events.venue),
    ticket_url = CASE WHEN EXCLUDED.ticket_url != '#' AND EXCLUDED.ticket_url != '' THEN EXCLUDED.ticket_url ELSE events.ticket_url END,
    contact_info = CASE WHEN EXCLUDED.contact_info != '' AND EXCLUDED.contact_info != '-' THEN EXCLUDED.contact_info ELSE events.contact_info END,
    audience_type = COALESCE(NULLIF(EXCLUDED.audience_type, ''), events.audience_type),
    description = CASE WHEN LENGTH(EXCLUDED.description) > LENGTH(COALESCE(events.description, '')) THEN EXCLUDED.description ELSE events.description END,
    updated_at = NOW();
`;

async function upsertEvents(events = []) {
  if (!process.env.DATABASE_URL || !events.length) return events;
  try {
    await Promise.all(
      events.map((e) => {
        const title = e.title || "Untitled Event";
        const id = e.id && !e.id.startsWith("ev-1") && !e.id.startsWith("Item")
          ? e.id
          : generateEventSlug(title, e.date);
        const contact = e.contactInfo || e.contact_info || e.ticketUrl || e.ticket_url || e.url || "";
        const audience = e.audienceType || e.audience_type || "";
        return pool.query(UPSERT_QUERY, [
          id,
          title,
          getTitleFingerprint(title) || "event",
          e.organization || "",
          e.category || "Conference / Summit",
          e.opportunityType || e.opportunity_type || "Conference",
          audience,
          normalizeDateKey(e.date) || e.date || "",
          e.time || "",
          e.venue || "Venue TBA",
          e.city || "Minnesota",
          e.registrationDeadline || e.registration_deadline || "-",
          e.proposalDeadline || e.proposal_deadline || "-",
          contact,
          e.status || "Confirmed",
          e.description || e.notes || "",
          e.ticketUrl || e.ticket_url || e.url || "#",
          e.source || "Web",
        ]);
      })
    );
  } catch (err) {
    console.error("❌ [DB Save Error]:", err.message);
  }
}

async function getAllEvents() {
  if (!pool || !process.env.DATABASE_URL) return [];
  const res = await pool.query(`
    SELECT
      id, title, organization, category,
      opportunity_type AS "opportunityType",
      opportunity_type AS "opportunity_type",
      audience_type AS "audienceType",
      audience_type AS "audience_type",
      date, time, venue, city, city AS location,
      registration_deadline AS "registrationDeadline",
      registration_deadline AS "registration_deadline",
      proposal_deadline AS "proposalDeadline",
      proposal_deadline AS "proposal_deadline",
      contact_info AS "contactInfo",
      contact_info AS "contact_info",
      status, description, description AS notes,
      ticket_url AS "ticketUrl",
      ticket_url AS "ticket_url",
      source,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM events
    ORDER BY created_at DESC;
  `);

  return res.rows.map((r) => ({
    ...r,
    proximityTier: getProximityRank(r.city),
  }));
}

module.exports = {
  pool,
  initDb,
  upsertEvents,
  getAllEvents,
};
