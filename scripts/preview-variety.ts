/**
 * Extra Preview data on top of seed-preview.sql: products, purchases, subscriptions,
 * trials and reviews in every state the «Покупки» tab, the product page and the seller's
 * «Покупатели» can show. Dates are relative to the moment the script runs.
 *
 * Buyer login (test-buyer@test.dostup.local) is «Алихан Смагулов»; his purchases cover:
 *   paid forever, access until a date, free trial, subscription far / soon / overdue,
 *   with and without a review. Seller login (test-seller@test.dostup.local) sees the buyers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const CAT = {
  materials: "b61a33a3-003b-4909-8951-5540d7867f56",
  lessons: "09653df8-e6e8-4aae-8ac7-11c3e0eadee1",
  subscriptions: "6f871e1e-f090-47de-8a64-246d2c394a20",
};
const SUB = {
  videoCourses: "c2000000-0000-0000-0000-000000000001",
  files: "c2000000-0000-0000-0000-000000000003",
  group: "c1000000-0000-0000-0000-000000000002",
  subOnline: "c3000000-0000-0000-0000-000000000001",
};

const SELLER = { profile: "11111111-1111-1111-1111-111111111111", account: "22222222-2222-2222-2222-222222222222" };
const SELLER2 = { profile: "11111111-1111-1111-1111-111111111112", account: "22222222-2222-2222-2222-222222222223" };

const B = {
  alikhan: "44444444-4444-4444-4444-444444444441",
  dinara: "44444444-4444-4444-4444-444444444442",
  erlan: "44444444-4444-4444-4444-444444444443",
  aigerim: "44444444-4444-4444-4444-444444444444",
  timur: "44444444-4444-4444-4444-444444444445",
  madina: "44444444-4444-4444-4444-444444444446",
  sanzhar: "44444444-4444-4444-4444-444444444447",
  assel: "44444444-4444-4444-4444-444444444448",
  nurlan: "44444444-4444-4444-4444-444444444449",
};

const P = {
  webClub: "33333333-3333-3333-3333-333333333341",
  mentoring: "33333333-3333-3333-3333-333333333342",
  dailyEnglish: "33333333-3333-3333-3333-333333333343",
  resume: "33333333-3333-3333-3333-333333333344",
  python: "33333333-3333-3333-3333-333333333345",
  sql: "33333333-3333-3333-3333-333333333346",
  ielts: "33333333-3333-3333-3333-333333333351",
  speakClub: "33333333-3333-3333-3333-333333333352",
  marathon: "33333333-3333-3333-3333-333333333347",
};
const WEB_COURSE = "33333333-3333-3333-3333-333333333331";
const ENGLISH_LESSON = "33333333-3333-3333-3333-333333333332";

const profiles = [
  { id: SELLER2.profile, type: "school", display_name: "Speak Up School", handle: "speak-up-school", is_demo: true },
  { id: B.sanzhar, type: "buyer", display_name: "Санжар Нурланов", handle: "sanzhar-nurlanov", is_demo: true },
  { id: B.assel, type: "buyer", display_name: "Асель Жумабаева", handle: "assel-zhumabaeva", is_demo: true },
  { id: B.nurlan, type: "buyer", display_name: "Нурлан Ермеков", handle: "nurlan-ermekov", is_demo: true },
];

const creatorAccounts = [
  {
    id: SELLER2.account,
    profile_id: SELLER2.profile,
    display_name: "Speak Up School",
    login: "speakupschool",
    email: "speak-up@test.dostup.local",
    account_type: "online_school",
  },
];

type ProductSeed = {
  id: string;
  seller: typeof SELLER;
  title: string;
  headline: string;
  price: number;
  slug: string;
  category: string;
  subcategory: string;
  billing?: "month" | "quarter" | "year";
  trialDays?: number;
  /** «Период оплаты» outside «Подписки»: an interval like «14d» or «custom» with its number of days. */
  period?: { interval: string; days: number };
  lessonFormat?: string;
};

const productSeeds: ProductSeed[] = [
  { id: P.webClub, seller: SELLER, title: "Клуб веб-разработчиков", headline: "Еженедельные разборы кода и закрытый чат", price: 7000, slug: "test-web-club", category: CAT.subscriptions, subcategory: SUB.subOnline, billing: "month" },
  { id: P.mentoring, seller: SELLER, title: "Менторство: первая работа в IT", headline: "Созвон раз в неделю, резюме и подготовка к собеседованиям", price: 30000, slug: "test-it-mentoring", category: CAT.subscriptions, subcategory: SUB.subOnline, billing: "quarter" },
  { id: P.dailyEnglish, seller: SELLER, title: "Английский каждый день", headline: "10 минут практики в день с проверкой", price: 5000, slug: "test-daily-english", category: CAT.subscriptions, subcategory: SUB.subOnline, billing: "month" },
  { id: P.resume, seller: SELLER, title: "Шаблоны резюме и портфолио", headline: "12 шаблонов для Figma и Google Docs", price: 3000, slug: "test-resume-templates", category: CAT.materials, subcategory: SUB.files, period: { interval: "custom", days: 60 } },
  { id: P.marathon, seller: SELLER, title: "Марафон английского: 14 дней", headline: "Каждый день задание и разбор от преподавателя", price: 4000, slug: "test-english-marathon", category: CAT.materials, subcategory: SUB.videoCourses, period: { interval: "14d", days: 14 } },
  { id: P.python, seller: SELLER, title: "Python для начинающих", headline: "От переменных до первого бота за 6 недель", price: 18000, slug: "test-python-basics", category: CAT.materials, subcategory: SUB.videoCourses, trialDays: 7 },
  { id: P.sql, seller: SELLER, title: "SQL с нуля", headline: "Запросы, джойны и аналитика на реальных данных", price: 12000, slug: "test-sql-basics", category: CAT.materials, subcategory: SUB.videoCourses },
  { id: P.ielts, seller: SELLER2, title: "IELTS Speaking: интенсив", headline: "8 занятий в мини-группе с носителем", price: 25000, slug: "test-ielts-speaking", category: CAT.lessons, subcategory: SUB.group, lessonFormat: "group" },
  { id: P.speakClub, seller: SELLER2, title: "Разговорный клуб Speak Up", headline: "Встречи два раза в неделю круглый год", price: 60000, slug: "test-speak-club", category: CAT.subscriptions, subcategory: SUB.subOnline, billing: "year" },
];

const products = productSeeds.map((p, i) => ({
  id: p.id,
  creator_account_id: p.seller.account,
  creator_id: p.seller.profile,
  title: p.title,
  headline: p.headline,
  description: `${p.headline}. Тестовый продукт для проверки покупок, оплаты и отзывов.`,
  price: p.price,
  slug: p.slug,
  is_active: true,
  is_paused: false,
  is_demo: true,
  is_published: true,
  category_id: p.category,
  subcategory_id: p.subcategory,
  lesson_format: p.lessonFormat ?? null,
  billing_period: p.billing ?? null,
  payment_type: p.billing || p.period ? "recurring" : "one_time",
  recurring_interval: p.billing ?? p.period?.interval ?? null,
  access_duration_days: p.period?.days ?? null,
  // Kaspi transfer by phone, so the checkout page offers a way to pay and upload a receipt.
  kaspi_phone: "+7 700 000 00 00",
  has_free_trial: Boolean(p.trialDays),
  trial_days: p.trialDays ?? null,
  faq: [
    { question: "Как получить доступ?", answer: "Сразу после подтверждения оплаты продукт появится в «Покупках»." },
    { question: "Можно ли вернуть деньги?", answer: "Да, в течение 3 дней, если вы не открывали материалы." },
  ],
  created_at: at(-60 + i * 6),
}));

// Purchase ids: 5555…-55555555556x. One row per product and buyer.
let purchaseSeq = 0;
const purchaseId = () => `55555555-5555-5555-5555-5555555556${String(++purchaseSeq).padStart(2, "0")}`;
type PurchaseSeed = {
  product: string;
  buyer: string;
  amount: number;
  boughtDaysAgo: number;
  status?: string;
  accessEndsInDays?: number;
  trialEndsInDays?: number;
};
const purchaseSeeds: PurchaseSeed[] = [
  // Алихан: every state of the «Оплата» and «Доступ» columns.
  { product: P.webClub, buyer: B.alikhan, amount: 7000, boughtDaysAgo: 66 },
  { product: P.mentoring, buyer: B.alikhan, amount: 30000, boughtDaysAgo: 87 },
  { product: P.dailyEnglish, buyer: B.alikhan, amount: 5000, boughtDaysAgo: 32 },
  // Period products: 60 days paid 10 days ago (Далеко), 14 days that ran out (Просрочено).
  { product: P.resume, buyer: B.alikhan, amount: 3000, boughtDaysAgo: 10, accessEndsInDays: 50 },
  { product: P.marathon, buyer: B.alikhan, amount: 4000, boughtDaysAgo: 20, accessEndsInDays: -6 },
  { product: P.python, buyer: B.alikhan, amount: 0, boughtDaysAgo: 2, trialEndsInDays: 5 },
  { product: P.ielts, buyer: B.alikhan, amount: 25000, boughtDaysAgo: 14 },
  { product: P.speakClub, buyer: B.alikhan, amount: 60000, boughtDaysAgo: 120 },
  // Other buyers, for the seller's «Покупатели» and for reviews.
  { product: P.webClub, buyer: B.dinara, amount: 7000, boughtDaysAgo: 28 },
  { product: P.webClub, buyer: B.timur, amount: 7000, boughtDaysAgo: 45 },
  { product: P.webClub, buyer: B.sanzhar, amount: 7000, boughtDaysAgo: 12 },
  { product: P.mentoring, buyer: B.aigerim, amount: 30000, boughtDaysAgo: 20 },
  { product: P.dailyEnglish, buyer: B.assel, amount: 5000, boughtDaysAgo: 40 },
  { product: P.resume, buyer: B.madina, amount: 3000, boughtDaysAgo: 30, accessEndsInDays: -3 },
  { product: P.resume, buyer: B.nurlan, amount: 3000, boughtDaysAgo: 4 },
  { product: P.python, buyer: B.erlan, amount: 18000, boughtDaysAgo: 25 },
  { product: P.python, buyer: B.sanzhar, amount: 18000, boughtDaysAgo: 18 },
  { product: P.python, buyer: B.timur, amount: 0, boughtDaysAgo: 1, trialEndsInDays: 6 },
  { product: P.python, buyer: B.assel, amount: 18000, boughtDaysAgo: 3, status: "pending" },
  { product: P.sql, buyer: B.dinara, amount: 12000, boughtDaysAgo: 50 },
  { product: P.sql, buyer: B.aigerim, amount: 12000, boughtDaysAgo: 35 },
  { product: P.sql, buyer: B.nurlan, amount: 12000, boughtDaysAgo: 22 },
  { product: P.sql, buyer: B.erlan, amount: 12000, boughtDaysAgo: 9 },
  { product: WEB_COURSE, buyer: B.sanzhar, amount: 15000, boughtDaysAgo: 16 },
  { product: WEB_COURSE, buyer: B.nurlan, amount: 15000, boughtDaysAgo: 7 },
  { product: ENGLISH_LESSON, buyer: B.assel, amount: 5000, boughtDaysAgo: 11 },
  { product: P.ielts, buyer: B.madina, amount: 25000, boughtDaysAgo: 19 },
  { product: P.ielts, buyer: B.dinara, amount: 25000, boughtDaysAgo: 8 },
  { product: P.speakClub, buyer: B.aigerim, amount: 60000, boughtDaysAgo: 200 },
];

const purchases = purchaseSeeds.map((p) => {
  const status = p.status ?? "completed";
  const trial = p.trialEndsInDays !== undefined;
  return {
    id: purchaseId(),
    product_id: p.product,
    buyer_profile_id: p.buyer,
    status,
    amount: p.amount,
    created_at: at(-p.boughtDaysAgo),
    confirmed_at: status === "completed" ? at(-p.boughtDaysAgo) : null,
    is_trial: trial,
    trial_ends_at: trial ? at(p.trialEndsInDays!) : null,
    access_expires_at: p.accessEndsInDays !== undefined ? at(p.accessEndsInDays) : null,
  };
});

const trials = purchaseSeeds
  .filter((p) => p.trialEndsInDays !== undefined)
  .map((p, i) => ({
    id: `88888888-0000-0000-0000-0000000000${String(i + 1).padStart(2, "0")}`,
    product_id: p.product,
    buyer_profile_id: p.buyer,
    trial_days: 7,
    starts_at: at(-p.boughtDaysAgo),
    ends_at: at(p.trialEndsInDays!),
  }));

// Subscriptions: the end date decides «Далеко» (> 7 days), «Скоро» (≤ 7 days), «Просрочено».
type SubSeed = { product: string; buyer: string; period: "month" | "quarter" | "year"; price: number; endsInDays: number };
const subSeeds: SubSeed[] = [
  { product: P.webClub, buyer: B.alikhan, period: "month", price: 7000, endsInDays: 24 },
  { product: P.mentoring, buyer: B.alikhan, period: "quarter", price: 30000, endsInDays: 3 },
  { product: P.dailyEnglish, buyer: B.alikhan, period: "month", price: 5000, endsInDays: -2 },
  { product: P.speakClub, buyer: B.alikhan, period: "year", price: 60000, endsInDays: 245 },
  { product: P.webClub, buyer: B.dinara, period: "month", price: 7000, endsInDays: 2 },
  { product: P.webClub, buyer: B.timur, period: "month", price: 7000, endsInDays: -15 },
  { product: P.webClub, buyer: B.sanzhar, period: "month", price: 7000, endsInDays: 18 },
  { product: P.mentoring, buyer: B.aigerim, period: "quarter", price: 30000, endsInDays: 70 },
  { product: P.dailyEnglish, buyer: B.assel, period: "month", price: 5000, endsInDays: 20 },
  { product: P.speakClub, buyer: B.aigerim, period: "year", price: 60000, endsInDays: 165 },
];
const periodDays = { month: 30, quarter: 91, year: 365 };
const subscriptions = subSeeds.map((s, i) => ({
  id: `aaaaaaaa-0000-0000-0000-0000000000${String(i + 1).padStart(2, "0")}`,
  product_id: s.product,
  buyer_profile_id: s.buyer,
  billing_period: s.period,
  price: s.price,
  current_period_start: at(s.endsInDays - periodDays[s.period]),
  current_period_end: at(s.endsInDays),
  status: s.endsInDays > 0 ? "active" : "past_due",
  auto_renew: false,
  created_at: at(s.endsInDays - periodDays[s.period] * 2),
}));

// Reviews: every star count appears somewhere, a few without text.
type ReviewSeed = { product: string; buyer: string; rating: number; comment: string | null; daysAgo: number };
const reviewSeeds: ReviewSeed[] = [
  { product: P.webClub, buyer: B.alikhan, rating: 4, comment: "Разборы полезные, но хотелось бы чаще.", daysAgo: 20 },
  { product: P.webClub, buyer: B.dinara, rating: 5, comment: "Лучшее сообщество, на вопросы отвечают в течение часа.", daysAgo: 15 },
  { product: P.webClub, buyer: B.sanzhar, rating: 5, comment: null, daysAgo: 6 },
  { product: P.webClub, buyer: B.timur, rating: 2, comment: "Мало новых материалов за последний месяц.", daysAgo: 18 },
  { product: P.mentoring, buyer: B.aigerim, rating: 5, comment: "Через два месяца получила оффер. Спасибо!", daysAgo: 5 },
  { product: P.dailyEnglish, buyer: B.alikhan, rating: 3, comment: "Задания однообразные, но привычка появилась.", daysAgo: 12 },
  { product: P.dailyEnglish, buyer: B.assel, rating: 4, comment: "Удобно заниматься по дороге на работу.", daysAgo: 9 },
  { product: P.resume, buyer: B.madina, rating: 1, comment: "Шаблоны устарели, половина не открывается в Google Docs.", daysAgo: 25 },
  { product: P.resume, buyer: B.nurlan, rating: 4, comment: "Взял два шаблона, остальные не пригодились.", daysAgo: 2 },
  { product: P.python, buyer: B.erlan, rating: 5, comment: "Понятно даже без опыта программирования.", daysAgo: 16 },
  { product: P.python, buyer: B.sanzhar, rating: 4, comment: null, daysAgo: 10 },
  { product: P.sql, buyer: B.dinara, rating: 5, comment: "Сразу применила на работе, отчёты строю сама.", daysAgo: 40 },
  { product: P.sql, buyer: B.aigerim, rating: 5, comment: "Отличные задачи на реальных данных.", daysAgo: 30 },
  { product: P.sql, buyer: B.nurlan, rating: 3, comment: "Темп слишком быстрый в последних модулях.", daysAgo: 14 },
  { product: P.sql, buyer: B.erlan, rating: 4, comment: "Хорошо, но не хватает разбора оконных функций.", daysAgo: 4 },
  { product: WEB_COURSE, buyer: B.aigerim, rating: 5, comment: "Сделала первый сайт за три недели.", daysAgo: 4 },
  { product: WEB_COURSE, buyer: B.sanzhar, rating: 4, comment: "Хорошая база, CSS-сетки объяснены лучше всего.", daysAgo: 9 },
  { product: WEB_COURSE, buyer: B.nurlan, rating: 3, comment: null, daysAgo: 3 },
  { product: WEB_COURSE, buyer: B.erlan, rating: 2, comment: "Домашние задания проверяют долго.", daysAgo: 1 },
  { product: ENGLISH_LESSON, buyer: B.dinara, rating: 5, comment: "Преподаватель очень терпеливый.", daysAgo: 1 },
  { product: ENGLISH_LESSON, buyer: B.assel, rating: 4, comment: "Хорошо, но 45 минут мало.", daysAgo: 8 },
  { product: P.ielts, buyer: B.madina, rating: 5, comment: "Подняла Speaking с 6.0 до 7.0.", daysAgo: 6 },
  { product: P.ielts, buyer: B.dinara, rating: 4, comment: null, daysAgo: 3 },
  { product: P.speakClub, buyer: B.aigerim, rating: 5, comment: "Хожу полгода, перестала бояться говорить.", daysAgo: 30 },
];
const reviews = reviewSeeds.map((r, i) => ({
  id: `bbbbbbbb-0000-0000-0000-0000000000${String(i + 1).padStart(2, "0")}`,
  product_id: r.product,
  buyer_profile_id: r.buyer,
  rating: r.rating,
  comment: r.comment,
  created_at: at(-r.daysAgo),
  updated_at: at(-r.daysAgo),
}));

async function upsert(supabase: SupabaseClient, table: string, rows: object[], onConflict = "id") {
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`[Preview variety] ${table}: ${rows.length}`);
}

async function remove(supabase: SupabaseClient, table: string, ids: string[]) {
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function seedVariety(supabase: SupabaseClient) {
  await upsert(supabase, "profiles", profiles);
  await upsert(supabase, "creator_accounts", creatorAccounts);
  await upsert(supabase, "products", products);
  await upsert(supabase, "simple_purchases", purchases);
  await upsert(supabase, "product_trials", trials, "product_id,buyer_profile_id");
  await upsert(supabase, "subscriptions", subscriptions, "product_id,buyer_profile_id");
  await upsert(supabase, "product_reviews", reviews, "product_id,buyer_profile_id");
}

export async function cleanVariety(supabase: SupabaseClient) {
  await remove(supabase, "product_reviews", reviews.map((r) => r.id));
  await remove(supabase, "subscriptions", subscriptions.map((s) => s.id));
  await remove(supabase, "product_trials", trials.map((t) => t.id));
  await remove(supabase, "simple_purchases", purchases.map((p) => p.id));
  await remove(supabase, "products", products.map((p) => p.id));
  await remove(supabase, "creator_accounts", creatorAccounts.map((a) => a.id));
  await remove(supabase, "profiles", profiles.map((p) => p.id));
  console.log("[Preview variety] removed");
}
