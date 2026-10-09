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

const {
  getTitleFingerprint,
  normalizeDateKey,
  getProximityRank,
  deduplicateEventList,
} = require("./utils");

async function cleanupDbDuplicates() {
  if (!pool || !process.env.DATABASE_URL) return;
  try {
    const res = await pool.query(
      "SELECT id, title, date, created_at FROM events ORDER BY created_at ASC"
    );
    if (!res.rows.length) return;
    const seen = new Map();
    const idsToDelete = [];
    const updates = [];

    for (const r of res.rows) {
      const fp = getTitleFingerprint(r.title);
      const normDate = normalizeDateKey(r.date);
      const key = `${fp}|${normDate}`;
      if (seen.has(key)) {
        idsToDelete.push(r.id);
      } else {
        seen.set(key, r.id);
        updates.push({ id: r.id, fp, date: normDate });
      }
    }

    if (idsToDelete.length) {
      console.log(`🧹 [DB Cleanup] Removing ${idsToDelete.length} duplicate rows from PostgreSQL...`);
      await pool.query("DELETE FROM events WHERE id = ANY($1::varchar[])", [idsToDelete]);
    }

    for (const u of updates) {
      await pool.query(
        "UPDATE events SET title_fingerprint = $1, date = $2 WHERE id = $3",
        [u.fp, u.date, u.id]
      );
    }
    console.log(`✅ [DB Cleanup] Database deduplicated & synchronized (${seen.size} unique events).`);
  } catch (err) {
    console.warn("⚠️ [DB Cleanup Notice]:", err.message);
  }
}

async function initDb() {
  if (!process.env.DATABASE_URL) return;
  const query = `
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
      electricity_ordered VARCHAR(50) DEFAULT 'No',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE events ADD COLUMN IF NOT EXISTS title_fingerprint TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS electricity_ordered VARCHAR(50) DEFAULT 'No';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_title_date ON events (LOWER(title), LOWER(COALESCE(date, '')));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_fingerprint_date ON events (title_fingerprint, LOWER(COALESCE(date, '')));
  `;
  try {
    await pool.query(query);
    await cleanupDbDuplicates();
  } catch (err) {
    console.error("❌ [DB Init Error]:", err.message);
  }
}

async function upsertEvents(events = []) {
  if (!process.env.DATABASE_URL || !events.length) return events;

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const insertQuery = `
      INSERT INTO events (
        id, title, title_fingerprint, organization, category, opportunity_type, audience_type,
        date, time, venue, city, registration_deadline, proposal_deadline,
        contact_info, status, description, ticket_url, source, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, NOW()
      )
      ON CONFLICT (title_fingerprint, LOWER(COALESCE(date, '')))
      DO UPDATE SET
        title = CASE WHEN LENGTH(EXCLUDED.title) >= LENGTH(events.title) AND EXCLUDED.title NOT ILIKE 'join us%' THEN EXCLUDED.title ELSE events.title END,
        organization = COALESCE(NULLIF(EXCLUDED.organization, ''), events.organization),
        category = COALESCE(NULLIF(EXCLUDED.category, ''), events.category),
        opportunity_type = COALESCE(NULLIF(EXCLUDED.opportunity_type, ''), events.opportunity_type),
        audience_type = COALESCE(NULLIF(EXCLUDED.audience_type, ''), events.audience_type),
        time = COALESCE(NULLIF(EXCLUDED.time, ''), events.time),
        venue = CASE WHEN EXCLUDED.venue NOT ILIKE '%venue' THEN EXCLUDED.venue ELSE events.venue END,
        city = CASE WHEN EXCLUDED.city != 'Minnesota' AND EXCLUDED.city != '' THEN EXCLUDED.city ELSE events.city END,
        registration_deadline = COALESCE(NULLIF(EXCLUDED.registration_deadline, '-'), events.registration_deadline),
        proposal_deadline = COALESCE(NULLIF(EXCLUDED.proposal_deadline, '-'), events.proposal_deadline),
        contact_info = CASE WHEN EXCLUDED.contact_info != '' AND EXCLUDED.contact_info != '-' THEN EXCLUDED.contact_info ELSE events.contact_info END,
        description = CASE WHEN LENGTH(EXCLUDED.description) > LENGTH(COALESCE(events.description, '')) THEN EXCLUDED.description ELSE events.description END,
        ticket_url = CASE WHEN EXCLUDED.ticket_url != '#' AND EXCLUDED.ticket_url NOT ILIKE '%eventbrite.com/d/%' THEN EXCLUDED.ticket_url ELSE events.ticket_url END,
        source = COALESCE(NULLIF(EXCLUDED.source, ''), events.source),
        updated_at = NOW()
      RETURNING *;
    `;

    for (const e of events) {
      const id =
        e.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const title = e.title || e.name || "Untitled Event";
      const titleFp =
        getTitleFingerprint(title) ||
        title.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "event";
      const org = e.organization || e.organizer || "";
      const rawCat = (
        e.category ||
        e.type ||
        e.opportunityType ||
        e.opportunity_type ||
        "Conference / Summit"
      ).trim();
      const cat =
        !rawCat || rawCat === "undefined"
          ? e.opportunityType || "Conference / Summit"
          : rawCat;
      const oppType = e.opportunityType || e.opportunity_type || cat;
      const audType = e.audienceType || e.audience_type || "";
      const date = normalizeDateKey(e.date) || e.date || "";
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
        id,
        title,
        titleFp,
        org,
        cat,
        oppType,
        audType,
        date,
        time,
        venue,
        city,
        regDl,
        propDl,
        contact,
        status,
        desc,
        ticketUrl,
        source,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    // Guard: client may be undefined if pool.connect() itself threw —
    // never let the ROLLBACK mask the real error.
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore rollback failure */
      }
    }
    console.error("❌ [DB Save Error]:", err.message);
  } finally {
    if (client) client.release();
  }
}

async function getAllEvents() {
  if (!pool || !process.env.DATABASE_URL) return [];
  const res = await pool.query(`
    SELECT
      id,
      title,
      organization,
      category,
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
      ticket_url AS "ticketUrl",
      source,
      COALESCE(outreach_timing, '-') AS "outreachTiming",
      COALESCE(exhibit_registered, 'No') AS "exhibitRegistered",
      COALESCE(payment_completed, 'No') AS "paymentCompleted",
      COALESCE(set_up_time, time, 'TBD') AS "setUpTime",
      COALESCE(electricity_ordered, 'No') AS "electricityOrdered",
      COALESCE(electricity_ordered, 'No') AS "electricity_ordered",
      COALESCE(misc_info, '-') AS "miscInfo",
      COALESCE(notes, description, '-') AS "notes",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM events
    ORDER BY created_at DESC;
  `);

  const mapped = res.rows.map((r) => {
    const city = r.city || r.location || "Minnesota";
    return {
      ...r,
      city,
      location: city,
      proximityTier: getProximityRank(city),
    };
  });

  return deduplicateEventList(mapped);
}

async function updateEvent(id, fields = {}) {
  if (!pool || !process.env.DATABASE_URL || !id) return null;
  const setClauses = [];
  const values = [];
  let idx = 1;

  const allowedCols = {
    status: fields.status,
    outreach_timing: fields.outreach_timing ?? fields.outreachTiming,
    proposal_deadline: fields.proposal_deadline ?? fields.proposalDeadline,
    registration_deadline: fields.registration_deadline ?? fields.registrationDeadline,
    exhibit_registered: fields.exhibit_registered ?? fields.exhibitRegistered,
    payment_completed: fields.payment_completed ?? fields.paymentCompleted,
    set_up_time: fields.set_up_time ?? fields.setUpTime,
    electricity_ordered: fields.electricity_ordered ?? fields.electricityOrdered,
    misc_info: fields.misc_info ?? fields.miscInfo,
    notes: fields.notes,
  };

  for (const [col, val] of Object.entries(allowedCols)) {
    if (val !== undefined && val !== null) {
      setClauses.push(`${col} = $${idx++}`);
      const cleanVal = typeof val === "boolean" ? (val ? "Yes" : "No") : String(val).trim();
      values.push(cleanVal);
    }
  }

  if (!setClauses.length) return null;
  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const query = `
    UPDATE events
    SET ${setClauses.join(", ")}
    WHERE id = $${idx}
    RETURNING
      id, title, organization, category,
      opportunity_type AS "opportunityType",
      audience_type AS "audienceType",
      date, time, venue, city, city AS location,
      COALESCE(registration_deadline, '-') AS "registrationDeadline",
      COALESCE(proposal_deadline, '-') AS "proposalDeadline",
      contact_info AS "contactInfo",
      status, description,
      ticket_url AS "ticketUrl",
      source,
      COALESCE(outreach_timing, '-') AS "outreachTiming",
      COALESCE(exhibit_registered, 'No') AS "exhibitRegistered",
      COALESCE(payment_completed, 'No') AS "paymentCompleted",
      COALESCE(set_up_time, time, 'TBD') AS "setUpTime",
      COALESCE(electricity_ordered, 'No') AS "electricityOrdered",
      COALESCE(electricity_ordered, 'No') AS "electricity_ordered",
      COALESCE(misc_info, '-') AS "miscInfo",
      COALESCE(notes, description, '-') AS "notes",
      created_at AS "createdAt",
      updated_at AS "updatedAt";
  `;
  const res = await pool.query(query, values);
  return res.rows[0] || null;
}

async function clearAllEvents() {
  if (!pool || !process.env.DATABASE_URL) return;
  await pool.query("TRUNCATE TABLE events;");
}

module.exports = {
  pool,
  initDb,
  upsertEvents,
  getAllEvents,
  updateEvent,
  clearAllEvents,
};
