import { TAXONOMY_DEFINITIONS } from "@/lib/taxonomyData";

// Stands in for src/integrations/supabase/client.ts. Every request the app
// makes goes through that one client, so replacing it is enough to cut the
// harness off from the network entirely.
//
// All sample text is in Latin script on purpose: anything Cyrillic the audit
// then finds on an English screen came from the interface, not from the data.

const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const categories = TAXONOMY_DEFINITIONS.map((category, index) => ({
  id: `cat-${category.slug}`,
  slug: category.slug,
  name_ru: category.name_ru,
  name_kk: category.name_kk,
  emoji: category.emoji,
  sort_order: index + 1,
  product_count: 3,
  subcategories: category.subcategories.map((sub) => ({
    id: `sub-${category.slug}-${sub.slug}`,
    slug: sub.slug,
    name_ru: sub.name_ru,
    name_kk: sub.name_kk,
  })),
}));

const products = [
  {
    id: "product-1",
    title: "SAT Math Bootcamp",
    headline: "Twelve weeks to a 750+",
    description: "<p>Weekly live lessons, homework review and two mock exams.</p>",
    price: 45000,
    kaspi_link: "https://kaspi.kz/pay/demo",
    telegram_link: null,
    has_schedule: true,
    is_active: true,
    is_published: true,
    image_url: null,
    media: [],
    faq: [{ question: "Are lessons recorded?", answer: "Yes, every lesson is recorded." }],
    payment_type: "recurring",
    recurring_interval: "1m",
    has_free_trial: true,
    trial_days: 7,
    pricing_options: [
      { id: "opt-1", price: 45000, payment_type: "recurring", recurring_interval: "1m", has_free_trial: true, trial_days: 7, kaspi_link: "https://kaspi.kz/pay/demo" },
      { id: "opt-2", price: 120000, payment_type: "one_time", kaspi_link: "https://kaspi.kz/pay/demo" },
    ],
    category_id: categories[0]?.id ?? null,
    subcategory_id: categories[0]?.subcategories[0]?.id ?? null,
    topic: null,
    slug: "sat-math-bootcamp",
    created_at: "2026-09-01T10:00:00Z",
  },
  {
    id: "product-2",
    title: "IELTS Writing Templates",
    headline: "Band 7 essays, step by step",
    description: "<p>Forty annotated essays and a checklist.</p>",
    price: 0,
    kaspi_link: null,
    telegram_link: null,
    has_schedule: false,
    is_active: true,
    is_published: false,
    image_url: null,
    media: [],
    faq: [],
    payment_type: "one_time",
    pricing_options: [],
    category_id: categories[1]?.id ?? null,
    subcategory_id: categories[1]?.subcategories[0]?.id ?? null,
    topic: null,
    slug: "ielts-writing-templates",
    created_at: "2026-09-10T10:00:00Z",
  },
];

const materials = [
  { id: "m-1", product_id: "product-1", title: "Week 1", type: "folder", content: null, file_url: null, order_index: 0, created_at: "2026-09-02T10:00:00Z", parent_id: null },
  { id: "m-2", product_id: "product-1", title: "Algebra worksheet.pdf", type: "file", content: null, file_url: "https://example.com/a.pdf", order_index: 1, created_at: "2026-09-02T10:00:00Z", parent_id: null, allow_download: true, teacher_allow_download: false, available_at: `${day(3)}T09:00:00Z`, file_size: 184000 },
  { id: "m-3", product_id: "product-1", title: "Formula sheet", type: "link", content: "https://example.com/formulas", file_url: null, order_index: 2, created_at: "2026-09-02T10:00:00Z", parent_id: null },
  { id: "m-4", product_id: "product-1", title: "How to use this course", type: "text", content: "Start with week 1.", file_url: null, order_index: 3, created_at: "2026-09-02T10:00:00Z", parent_id: null },
  { id: "m-5", product_id: "product-1", title: "Lesson recording.mp4", type: "file", content: null, file_url: "https://example.com/b.mp4", order_index: 0, created_at: "2026-09-02T10:00:00Z", parent_id: "m-1", allow_download: false, teacher_allow_download: true },
];

const announcements = [
  { id: "a-1", product_id: "product-1", creator_id: "user-1", content_html: "<p>The mock exam moves to Saturday.</p>", order_index: 0, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" },
];

const purchases = [
  { id: "pu-1", status: "completed", amount: 45000, created_at: "2026-09-20T10:00:00Z", product_id: "product-1", simple_user_id: "buyer-1", assigned_teacher_id: null, can_choose_teacher: null, user: { id: "buyer-1", name: "Aigerim Sadykova", phone: "+77010000001" }, latest_submission: null },
  { id: "pu-2", status: "completed", amount: 120000, created_at: "2026-09-25T10:00:00Z", product_id: "product-1", simple_user_id: "buyer-2", assigned_teacher_id: null, can_choose_teacher: null, user: { id: "buyer-2", name: "Daniyar Omarov", phone: "+77010000002" }, latest_submission: null },
];

const schedules = [
  { id: "s-1", product_id: "product-1", title: "Live lessons", event_type: "group", max_participants: 8, teacher_id: null, product: { title: "SAT Math Bootcamp" } },
];

const slots = [
  { id: "slot-1", schedule_id: "s-1", date: day(0), start_time: "10:00:00", end_time: "11:00:00", is_available: true, max_participants: 8, title: "Algebra review" },
  { id: "slot-2", schedule_id: "s-1", date: day(1), start_time: "15:00:00", end_time: "16:00:00", is_available: true, max_participants: 8 },
  { id: "slot-3", schedule_id: "s-1", date: day(2), start_time: "18:30:00", end_time: "19:30:00", is_available: false, max_participants: 1 },
];

const bookings = [
  { id: "b-1", time_slot_id: "slot-1", simple_user_id: "buyer-1", user: { name: "Aigerim Sadykova", phone: "+77010000001" } },
  { id: "b-2", time_slot_id: "slot-3", simple_user_id: "buyer-2", user: { name: "Daniyar Omarov", phone: "+77010000002" } },
];

// One booking changed by its buyer, one move asked for, and the buyer's side of
// the same story — so notification and schedule screens have something to say.
const cancellations = [
  { id: "c-1", user_name: "Aigerim Sadykova", product_title: "SAT Math Bootcamp", product_id: "product-1", schedule_id: "s-1", schedule_title: "Live lessons", slot_date: day(2), slot_time: "18:30:00", cancelled_at: `${day(-1)}T09:00:00Z`, cancelled_by: "student", cancellation_reasons: ["Schedule conflict"], cancellation_comment: null },
  // Written before the server stopped inventing a name: must read as "Student".
  { id: "c-2", user_name: "Ученик", product_title: "SAT Math Bootcamp", product_id: "product-1", schedule_id: "s-1", schedule_title: "Live lessons", slot_date: day(3), slot_time: "10:00:00", cancelled_at: `${day(-2)}T09:00:00Z`, cancelled_by: "student", cancellation_reasons: null, cancellation_comment: "Sorry, I am ill" },
];

const rescheduleRequests = [
  { id: "r-1", booking_id: "b-1", simple_user_id: "buyer-1", schedule_id: "s-1", product_id: "product-1", product_title: "SAT Math Bootcamp", old_date: day(0), old_time: "10:00:00", new_date: day(4), new_time: "12:00:00", reasons: ["Exam at school"], comment: null, status: "pending", response_comment: null, created_at: `${day(-1)}T12:00:00Z`, responded_at: null, user_name: null, requested_by: "student" },
];

const myPurchases = [
  { id: "mp-1", product_id: "product-1", status: "completed", amount: 45000, created_at: "2026-09-20T10:00:00Z", can_choose_teacher: false, assigned_teacher_id: null, product: { id: "product-1", title: "SAT Math Bootcamp", headline: "Twelve weeks to a 750+", telegram_link: null, group_link_label: null } },
];

const pendingPurchase = { id: "pu-3", status: "pending", amount: 45000, created_at: `${day(0)}T08:00:00Z`, product_id: "product-1", simple_user_id: "buyer-3", assigned_teacher_id: null, can_choose_teacher: null, user: { id: "buyer-3", name: "Timur Akhmetov", phone: "+77010000003" }, latest_submission: null };

/** What each edge function answers, by function and action. */
function respond(fn: string, body: Record<string, unknown>): unknown {
  switch (`${fn}:${String(body.action ?? "")}`) {
    case "manage-products:list":
      return { products };
    case "manage-products:list_purchases":
      return { purchases: [...purchases, pendingPurchase] };
    case "manage-bookings:list_cancellations":
      return { cancellations };
    case "manage-bookings:list_reschedule_requests":
      return { requests: rescheduleRequests };
    case "checkout:list_my_purchases":
      return { purchases: myPurchases };
    case "checkout:list_my_subscriptions":
      return { subscriptions: [] };
    case "manage-materials:list_unlocks":
      return { unlocks: [] };
    case "manage-materials:list_bookmarks":
      return { bookmarks: [] };
    case "manage-schedules:student_list_schedules":
      return { schedules: schedules.map((schedule) => ({ ...schedule, created_at: "2026-09-01T10:00:00Z", teacher_name: null })) };
    case "manage-schedules:student_list_slots":
      return { slots };
    case "manage-schedules:list_outgoing_reschedules":
      return { requests: [] };
    case "manage-materials:list_student":
      return {
        materials: materials.map((material) => ({
          ...material,
          teacher_id: null,
          teacher_name: null,
          is_teacher_material: false,
          product: { id: "product-1", title: "SAT Math Bootcamp", telegram_link: null },
        })),
      };
    case "manage-products:list_subscriptions":
      return { subscriptions: [] };
    case "manage-products:list_creator_teachers":
      return { teachers: [] };
    case "manage-profile:get_handle":
      return { handle: "demo-seller" };
    case "manage-schedules:me":
      return { userId: "teacher-1" };
    case "manage-schedules:list_products":
      return { products };
    case "manage-materials:list":
      return { materials };
    case "manage-materials:list_announcements":
      return { announcements };
    case "manage-schedules:list_schedules":
      return { schedules };
    case "manage-schedules:list_slots":
      return { slots };
    case "manage-schedules:list_bookings_for_slots":
      return { bookings };
    case "manage-bookings:list_outgoing_reschedules":
      return { requests: [] };
    case "manage-account:get_prefs":
      return { prefs: { reminder_24h: true, reminder_morning: true, morning_time: "08:00:00", reminder_2h: false } };
    default:
      // Visible in the console, so a screen that came out empty can be traced
      // to the request nobody answered.
      console.info(`[harness] unanswered: ${fn} ${String(body.action ?? "")}`);
      return {};
  }
}

const RPC: Record<string, unknown> = {
  get_catalog_taxonomy: categories,
};

type Result = { data: unknown; error: null; count?: number };

/** A query builder that accepts any chain of calls and resolves to `result`. */
function query(result: Result): unknown {
  const proxy: unknown = new Proxy(() => proxy, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: Result) => unknown) => resolve(result);
      if (property === "single" || property === "maybeSingle") {
        const first = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        return () => query({ data: first, error: null });
      }
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

const channel: unknown = new Proxy(() => channel, {
  get: () => () => channel,
  apply: () => channel,
});

export const supabase = {
  from: (_table: string) => query({ data: [], error: null, count: 0 }),
  rpc: (name: string) => query({ data: RPC[name] ?? [], error: null }),
  functions: {
    invoke: async (fn: string, options: { body?: Record<string, unknown> } = {}) => ({
      data: respond(fn, options.body ?? {}),
      error: null,
    }),
  },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
  channel: () => channel,
  removeChannel: () => {},
  storage: {
    from: () => ({
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }),
      upload: async () => ({ data: null, error: null }),
    }),
  },
};
