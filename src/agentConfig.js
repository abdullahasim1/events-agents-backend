/**
 * 🎯 CENTRALIZED AGENT CONFIGURATION
 * Derived from Google Sheet (Outreach & Conferences):
 * Covers Twin Cities Metro (Minneapolis, St. Paul) + State-level (Minnesota)
 * to catch all local events (Roseville, Minnetonka, Maple Grove, St. Cloud, etc.)
 * with zero-miss conference categories and next 7-day default window.
 */

const DEFAULT_LOCATIONS = [
  "Minneapolis Convention Center, MN",
  "St. Cloud River’s Edge Convention Center, MN",
  "Saint Paul RiverCentre, MN",
  "Minneapolis, MN",
  "St. Paul, MN",
  "Minnesota",
];

const DEFAULT_EVENT_TYPES = [
  "Mental Health & Counseling Conference",
  "Education & School Counseling Conference",
  "Neuroscience, Psychiatry & Autism Conference",
  "Sleep Medicine Conference",
  "Wellness Summit & Community Health Expo",
  "Healthcare & Brain Injury Support Conference",
];

const DEFAULT_DAYS = 7; // Exactly next 7 days

module.exports = {
  DEFAULT_LOCATIONS,
  DEFAULT_EVENT_TYPES,
  DEFAULT_DAYS,
};

