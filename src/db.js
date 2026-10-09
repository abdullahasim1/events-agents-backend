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
      ALTER TABLE events ADD COLUMN IF NOT EXISTS electricity_ordered VARCHAR(50) DEFAULT 'No';
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
  ON CONFLICT (id)
  DO UPDATE SET
    title = CASE WHEN LENGTH(EXCLUDED.title) >= LENGTH(events.title) THEN EXCLUDED.title ELSE events.title END,
    venue = COALESCE(NULLIF(EXCLUDED.venue, ''), events.venue),
    ticket_url = CASE WHEN EXCLUDED.ticket_url != '#' AND EXCLUDED.ticket_url != '' THEN EXCLUDED.ticket_url ELSE events.ticket_url END,
    contact_info = CASE WHEN EXCLUDED.contact_info != '' AND EXCLUDED.contact_info != '-' THEN EXCLUDED.contact_info ELSE events.contact_info END,
    audience_type = COALESCE(NULLIF(EXCLUDED.audience_type, ''), events.audience_type),
    description = CASE WHEN LENGTH(EXCLUDED.description) > LENGTH(COALESCE(events.description, '')) THEN EXCLUDED.description ELSE events.description END,
    updated_at = NOW();
`;

async function upsertEvents(events = []) {
  if (!pool || !process.env.DATABASE_URL || !events.length) return events;
  try {
    for (const e of events) {
      try {
        const title = e.title || "Untitled Event";
        const id = e.id && !e.id.startsWith("ev-1") && !e.id.startsWith("Item")
          ? e.id
          : generateEventSlug(title, e.date);
        const contact = e.contactInfo || e.contact_info || e.ticketUrl || e.ticket_url || e.url || "";
        const audience = e.audienceType || e.audience_type || "";
        await pool.query(UPSERT_QUERY, [
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
      } catch (singleErr) {
        // If unique constraint violation on fingerprint+date (code 23505), ignore duplicate variant
        if (singleErr.code === "23505") {
          // Already saved canonical version
          continue;
        }
        console.warn(`⚠️ [DB Item Warning]: ${singleErr.message}`);
      }
    }
  } catch (err) {
    console.error("❌ [DB Save Error]:", err.message);
  }
}

const EDITABLE_COLS = new Set([
  "status", "outreach_timing", "proposal_deadline", "registration_deadline",
  "exhibit_registered", "payment_completed", "set_up_time", "electricity_ordered",
  "misc_info", "notes"
]);

async function getAllEvents() {
  if (!pool || !process.env.DATABASE_URL) return [];
  const res = await pool.query(`
    SELECT *,
      city AS location,
      COALESCE(set_up_time, time, 'TBD') AS "setUpTime",
      COALESCE(outreach_timing, '-') AS "outreachTiming",
      COALESCE(proposal_deadline, '-') AS "proposalDeadline",
      COALESCE(registration_deadline, '-') AS "registrationDeadline",
      COALESCE(exhibit_registered, 'No') AS "exhibitRegistered",
      COALESCE(payment_completed, 'No') AS "paymentCompleted",
      COALESCE(electricity_ordered, 'No') AS "electricityOrdered",
      COALESCE(misc_info, '-') AS "miscInfo",
      COALESCE(notes, description, '-') AS notes
    FROM events
    ORDER BY created_at DESC;
  `);

  return res.rows.map((r) => ({
    ...r,
    proximityTier: getProximityRank(r.city),
  }));
}

async function updateEvent(id, fields = {}) {
  if (!pool || !id) return null;
  const entries = Object.entries(fields)
    .map(([k, v]) => [k.replace(/([A-Z])/g, "_$1").toLowerCase(), v])
    .filter(([col]) => EDITABLE_COLS.has(col));

  if (!entries.length) return null;

  const setClauses = entries.map(([col], idx) => `${col} = $${idx + 1}`);
  const values = entries.map(([, val]) => typeof val === "boolean" ? (val ? "Yes" : "No") : String(val).trim());
  values.push(id);

  const res = await pool.query(
    `UPDATE events SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *;`,
    values
  );
  return res.rows[0] || null;
}

async function clearAllEvents() {
  if (!pool || !process.env.DATABASE_URL) return;
  try {
    await pool.query("DELETE FROM events;");
    console.log("🧹 [DB Cleared] All events removed for fresh run.");
  } catch (err) {
    console.error("❌ [Clear DB Error]:", err.message);
  }
}

module.exports = {
  pool,
  initDb,
  upsertEvents,
  getAllEvents,
  updateEvent,
  clearAllEvents,
};
