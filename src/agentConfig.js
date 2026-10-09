/**
 * 🎯 EXACT SHEET CONFIGURATION (Outreach & Conferences):
 * Extracted directly from every single tab & row of the user's Google Sheet.
 * Covers every specific city and every conference/event type listed in the sheet.
 */

// All cities extracted directly from the sheet's event locations
const DEFAULT_LOCATIONS = [
  "Minneapolis, MN",
  "St. Paul, MN",
  "Bloomington, MN",
  "Edina, MN",
  "Roseville, MN",
  "Maple Grove, MN",
  "Minnetonka, MN",
  "Plymouth, MN",
  "St. Cloud, MN",
  "Minnesota",
];

// All distinct event types extracted directly from the sheet
const DEFAULT_EVENT_TYPES = [
  "Mental Health / Counseling Professional Conference",
  "Education / School Counseling / National Conference",
  "Intellectual & Developmental Disabilities / Autism / Research Conference",
  "Sleep medicine professional conference",
  "Neuroscience / Psychiatry / Research",
  "Neuroscience / Healthcare Leadership",
  "School-Based Health / Youth Mental Health / Healthcare-Education Summit",
  "Brain injury and stroke education/support conference",
  "Health & Fitness Expo / Healthcare Summit",
  "Medical Healthcare Conference / Summit",
];

const DEFAULT_DAYS = 7; // Exactly next 7 days

// 🎯 EXACT 1-TO-1 QUERIES:
// Derived directly from the 10 categories above.
// Slashes ('/') are converted to spaces for clean Google & Tavily search syntax.
const BROAD_QUERIES = DEFAULT_EVENT_TYPES.map((t) =>
  t.replace(/\//g, " ").replace(/\s+/g, " ").trim()
);

module.exports = {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
  BROAD_QUERIES,
};
