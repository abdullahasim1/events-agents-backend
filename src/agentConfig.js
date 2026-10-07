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
  "Health & Fitness Expo / Community Wellness Event",
  "Conference / Summit",
];

const DEFAULT_DAYS = 7; // Exactly next 7 days

// High-yield search queries per city chunk:
// 1. Core health, education, and disabilities conference search
// 2. Specialized outreach (OCD, law enforcement wellness, youth mental health, autism, admissions)
const BROAD_QUERIES = [
  "health education mental counseling disabilities conference summit expo",
  "OCD autism wellness summit law enforcement college admission conference",
];

module.exports = {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
  BROAD_QUERIES,
  BROAD_QUERY_KEYWORDS: BROAD_QUERIES.join(" "),
};
