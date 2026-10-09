/**
 * 🎯 EXACT SHEET CONFIGURATION (Outreach & Conferences):
 * Covers all Minnesota event locations and healthcare conference types.
 */

// All cities where Minnesota healthcare & medical events take place
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
  "Rochester, MN",
  "Duluth, MN",
  "Minnesota",
];

// All distinct event categories covering client's exact 4 pillars
const DEFAULT_EVENT_TYPES = [
  // Pillar 1: Professional Conferences & Biohacking / Brain Health
  "Mental Health / Counseling Professional Conference",
  "Brain Health / Peak Performance / Biohacking Conference",
  "Neuroscience / Psychiatry / Research",
  "Intellectual & Developmental Disabilities / Autism / Research Conference",
  "Sleep medicine professional conference",
  "Brain injury and stroke education/support conference",
  "Education / School Counseling / National Conference",
  "School-Based Health / Youth Mental Health / Healthcare-Education Summit",
  "Medical Healthcare Conference / Summit",

  // Pillar 2: Local Gatherings & Community Expos (Vendor Table)
  "Health & Fitness Expo / Marathon Expo / 5k race",
  "Community Wellness Event / Holistic Wellness Fair",
  "Farmers Market / Local Vendor Community Gathering",
  "Art fair / Community festival vendor booth",

  // Pillar 3: Silent Auctions
  "School / Education Silent Auction Fundraiser",
  "Charity / Non-Profit Silent Auction Benefit",

  // Pillar 4: Charitable Events & Sponsorship
  "Charity Gala / Benefit Gala / Philanthropy Sponsorship",
  "Charity Golf Tournament / Fundraiser Sponsorship",
];

const DEFAULT_DAYS = 7;

const BROAD_QUERIES = [
  // 1. Conferences & Brain Health
  "mental health counseling professional conference",
  "brain health peak performance biohacking conference summit",
  "neuroscience psychiatry research summit",
  "intellectual developmental disabilities autism conference",
  "sleep medicine professional conference",
  "brain injury stroke education support conference",
  "education school counseling conference",
  "school based youth mental health summit",
  "medical healthcare leadership conference",

  // 2. Local Gatherings & Vendor Tables
  "health fitness expo marathon expo 5k race",
  "community wellness event holistic wellness fair",
  "farmers market local community vendor gathering",
  "art fair community festival vendor table",

  // 3. Silent Auctions
  "school silent auction fundraiser benefit",
  "charity nonprofit silent auction fundraiser",

  // 4. Charitable & Sponsorships
  "charity gala benefit gala dinner sponsorship",
  "charity golf tournament fundraiser sponsorship",
];

module.exports = {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
  BROAD_QUERIES,
};
