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
  "Conference / Summit",
];

const DEFAULT_DAYS = 7; // Exactly next 7 days

// 4 Targeted High-Yield Sector Queries per city chunk (run concurrently):
// 1. Mental Health, Counseling, Youth & School Conferences
// 2. Intellectual & Developmental Disabilities, Autism, OCD & Special Ed
// 3. Sleep Medicine, Neuroscience, Psychiatry, Brain Injury & Stroke
// 4. Healthcare Leadership, Health & Fitness Expo, Healthcare Summit
const BROAD_QUERIES = [
  "mental health counseling youth school conference summit",
  "intellectual developmental disabilities autism OCD special education conference",
  "sleep medicine neuroscience psychiatry brain injury stroke conference",
  "healthcare leadership medical wellness conference summit expo",
];

module.exports = {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
  BROAD_QUERIES,
};
