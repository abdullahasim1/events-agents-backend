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

// All distinct event categories covering client's exact 4 pillars across October, November & December
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
  "School Social Work / Youth Behavioral Health Conference",
  "Early Childhood / Infant Mental Health Conference",
  "Medical Healthcare Conference / Summit",
  "Public Health / Community Health Conference",

  // Pillar 2: Local Gatherings & Community Expos (Vendor Table)
  "Health & Fitness Expo / Marathon Expo / 5k race",
  "Community Wellness Event / Holistic Wellness Fair",
  "Senior Health / Healthy Aging / Caregiver Expo",
  "Employee Health Fair / Workplace Wellness Conference",
  "Farmers Market / Local Vendor Community Gathering",
  "Art fair / Community festival vendor booth",

  // Pillar 3: Silent Auctions
  "School / Education Silent Auction Fundraiser",
  "Children's Mental Health Online Silent Auction Benefit",
  "Charity / Non-Profit Silent Auction Benefit",

  // Pillar 4: Charitable Events & Sponsorship
  "Charity Gala / Benefit Gala / Philanthropy Sponsorship",
  "Charity Golf Tournament / Fundraiser Sponsorship",
];

const DEFAULT_DAYS = 7;

const BROAD_QUERIES = [
  // 1. Clinical Conferences & Brain Health (Oct, Nov, Dec)
  "Mental Health Counseling Conference",
  "School Counseling Education Conference",
  "School Behavioral Health Conference",
  "Autism Developmental Disabilities Conference",
  "Sleep Medicine Conference",
  "Neuroscience Psychiatry Summit",
  "Brain Injury Stroke Conference",
  "Early Childhood Mental Health Conference",
  "Healthcare Leadership Conference",
  "Public Health Conference",
  "Medical Healthcare Summit",
  "Biohacking Peak Performance Summit",

  // 2. Community & Vendor Expos (Senior, Employee, Health Fairs)
  "Health Fitness Marathon Expo",
  "Senior Health Aging Resource Expo",
  "Caregiver Community Wellness Conference",
  "Employee Health Fair Workplace Wellness",
  "Community Wellness Fair",
  "Holistic Health Expo",
  "Farmers Market Vendor Gathering",
  "Art Fair Community Festival",

  // 3. Auctions & Charitable Sponsorships (Galas & Auctions)
  "Silent Auction Fundraiser",
  "Children Mental Health Fundraiser Auction",
  "Charity Gala Sponsorship",
  "Charity Golf Tournament",
  "Community Health Sponsorship",
];

module.exports = {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
  BROAD_QUERIES,
};
