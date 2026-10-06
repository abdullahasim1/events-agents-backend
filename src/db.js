const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("❌ [PostgreSQL Pool Error]:", err.message);
});

/**
 * Initialize table if not exists
 */
async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL not set; skipping DB init.");
    return;
  }
  const query = `
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(100) PRIMARY KEY,
      title TEXT NOT NULL,
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
      status VARCHAR(50) DEFAULT 'Need to contact',
      description TEXT,
      ticket_url TEXT,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_title_date ON events (LOWER(title), LOWER(COALESCE(date, '')));
  `;
  try {
    await pool.query(query);
    console.log("✅ [DB] PostgreSQL tables verified.");
  } catch (err) {
    console.error("❌ [DB Init Error]:", err.message);
  }
}

/**
 * Upsert events into PostgreSQL
 */
async function upsertEvents(events = []) {
  if (!process.env.DATABASE_URL || !events.length) return events;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insertQuery = `
      INSERT INTO events (
        id, title, organization, category, opportunity_type, audience_type,
        date, time, venue, city, registration_deadline, proposal_deadline,
        contact_info, status, description, ticket_url, source, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, NOW()
      )
      ON CONFLICT (LOWER(title), LOWER(COALESCE(date, '')))
      DO UPDATE SET
        organization = COALESCE(EXCLUDED.organization, events.organization),
        category = COALESCE(EXCLUDED.category, events.category),
        opportunity_type = COALESCE(EXCLUDED.opportunity_type, events.opportunity_type),
        audience_type = COALESCE(EXCLUDED.audience_type, events.audience_type),
        time = COALESCE(EXCLUDED.time, events.time),
        venue = COALESCE(EXCLUDED.venue, events.venue),
        city = COALESCE(EXCLUDED.city, events.city),
        registration_deadline = COALESCE(EXCLUDED.registration_deadline, events.registration_deadline),
        proposal_deadline = COALESCE(EXCLUDED.proposal_deadline, events.proposal_deadline),
        contact_info = CASE WHEN EXCLUDED.contact_info != 'Not available' AND EXCLUDED.contact_info != '' THEN EXCLUDED.contact_info ELSE events.contact_info END,
        description = COALESCE(EXCLUDED.description, events.description),
        ticket_url = COALESCE(EXCLUDED.ticket_url, events.ticket_url),
        source = COALESCE(EXCLUDED.source, events.source),
        updated_at = NOW()
      RETURNING *;
    `;

    for (const e of events) {
      const id = e.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const title = e.title || e.name || "Untitled Event";
      const org = e.organization || e.organizer || "";
      const cat = e.category || e.type || "General";
      const oppType = e.opportunityType || e.opportunity_type || "";
      const audType = e.audienceType || e.audience_type || "";
      const date = e.date || "";
      const time = e.time || "";
      const venue = e.venue || (e.city ? `${e.city} Venue` : "Venue TBA");
      const city = e.city || e.location || "";
      const regDl = e.registrationDeadline || e.registration_deadline || "-";
      const propDl = e.proposalDeadline || e.proposal_deadline || "-";
      const contact = e.contactInfo || e.ticketUrl || "";
      const status = e.status || "Confirmed";
      const desc = e.notes || e.description || "";
      const ticketUrl = e.ticketUrl || e.ticket_url || e.link || "#";
      const source = e.source || "Agent Scraper";

      await client.query(insertQuery, [
        id, title, org, cat, oppType, audType,
        date, time, venue, city, regDl, propDl,
        contact, status, desc, ticketUrl, source
      ]);
    }
    await client.query("COMMIT");
    console.log(`💾 [DB] Successfully saved/updated ${events.length} events in PostgreSQL.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ [DB Save Error]:", err.message);
  } finally {
    client.release();
  }
}

/**
 * Fetch all saved events from PostgreSQL
 */
async function getAllEvents() {
  if (!process.env.DATABASE_URL) return [];
  const res = await pool.query(`
    SELECT
      id,
      title,
      title AS name,
      organization,
      category,
      category AS type,
      opportunity_type AS "opportunityType",
      audience_type AS "audienceType",
      date,
      time,
      venue,
      city,
      city AS location,
      registration_deadline AS "registrationDeadline",
      proposal_deadline AS "proposalDeadline",
      contact_info AS "contactInfo",
      status,
      description,
      description AS notes,
      ticket_url AS "ticketUrl",
      ticket_url AS link,
      source,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM events
    ORDER BY created_at DESC;
  `);
  return res.rows;
}

/**
 * Update event status
 */
async function updateEventStatus(id, status) {
  if (!process.env.DATABASE_URL) return;
  await pool.query("UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2;", [status, id]);
}

/**
 * Delete single event
 */
async function deleteEvent(id) {
  if (!process.env.DATABASE_URL) return;
  await pool.query("DELETE FROM events WHERE id = $1;", [id]);
}

/**
 * Delete all events from PostgreSQL
 */
async function clearAllEvents() {
  if (!process.env.DATABASE_URL) return;
  await pool.query("TRUNCATE TABLE events;");
}

module.exports = {
  pool,
  initDb,
  upsertEvents,
  getAllEvents,
  updateEventStatus,
  deleteEvent,
  clearAllEvents,
};

