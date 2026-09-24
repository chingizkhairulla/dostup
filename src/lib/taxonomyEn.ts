// English names for the catalog taxonomy, keyed by slug.
//
// The names live here rather than in a `name_en` column because nothing on the
// server reads them: `search_catalog` matches only title, headline and seller
// name, and every filter keys off the slug. Adding the column would have meant
// recreating four views and three functions on the production database for
// forty strings that only ever get displayed. See
// memory-bank/creative/creative-taxonomy-english.md for the full reasoning and
// for when to revisit this (the first time server-generated text — an email,
// a push — needs a category name).
//
// Categories and subcategories are seeded by migration and nothing inserts
// into them at runtime, so this map cannot drift on its own; a test checks it
// against the seed migration in case a future migration adds a row.

export const CATEGORY_NAMES_EN: Record<string, string> = {
  courses: "Courses",
  "online-lessons": "Online lessons",
  subscriptions: "Subscriptions",
  materials: "Materials",
  events: "Events",
};

export const SUBCATEGORY_NAMES_EN: Record<string, string> = {
  // Courses
  "video-courses": "video courses",
  "mini-courses": "mini courses",
  professions: "professions",
  "education-programs": "education programs",
  practicums: "practicums",
  "recorded-intensives": "recorded intensives",

  // Online lessons
  tutoring: "tutoring",
  consultations: "consultations",
  coaching: "coaching",
  mentoring: "mentoring",
  "conversation-clubs": "conversation clubs",
  "exam-prep": "exam preparation",

  // Subscriptions
  "telegram-channels": "Telegram channels",
  "private-communities": "private communities",
  "subscription-clubs": "subscription clubs",
  "ai-services": "AI services",
  "regular-content-access": "regular content access",
  "paid-newsletters": "paid newsletters",

  // Materials
  ebooks: "e-books",
  "pdf-files": "PDF files",
  templates: "templates",
  checklists: "checklists",
  presentations: "presentations",
  guides: "guides",
  "webinar-recordings": "webinar recordings",
  notes: "notes",
  "spreadsheets-and-documents": "spreadsheets and documents",

  // Events
  webinars: "webinars",
  masterclasses: "masterclasses",
  intensives: "intensives",
  marathons: "marathons",
  workshops: "workshops",
  "online-conferences": "online conferences",
  "online-seminars": "online seminars",
  challenges: "challenges",
};
