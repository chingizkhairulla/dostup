/**
 * Seed demo catalogue rows (is_demo = true).
 * Usage:
 *   npm run seed:demo        — upsert demo sellers + products
 *   npm run seed:demo:clean  — delete all is_demo rows
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (or environment).
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const demoDir = join(rootDir, "public", "demo");

const PROFILE_IDS = {
  tutor: "11111111-1111-4111-8111-111111111101",
  school: "11111111-1111-4111-8111-111111111102",
  ent: "11111111-1111-4111-8111-111111111103",
  coach: "11111111-1111-4111-8111-111111111104",
} as const;

const ACCOUNT_IDS = {
  tutor: "22222222-2222-4222-8222-222222222201",
  school: "22222222-2222-4222-8222-222222222202",
  ent: "22222222-2222-4222-8222-222222222203",
  coach: "22222222-2222-4222-8222-222222222204",
} as const;

type SellerKey = keyof typeof PROFILE_IDS;

const SELLERS: Array<{
  key: SellerKey;
  type: "creator" | "school";
  accountType: "course_creator" | "online_school";
  displayName: string;
  handle: string;
  bio: string;
  login: string;
  avatarFile: string;
  avatarTint: string;
}> = [
  {
    key: "tutor",
    type: "creator",
    accountType: "course_creator",
    displayName: "Айгерім Нұрланова",
    handle: "aygerim-tutor",
    bio: "Репетитор математики. 8 жыл тәжірибе — ЕНТ, олимпиадалар және мектеп бағдарламасы.",
    login: "demo-aygerim-tutor",
    avatarFile: "avatar-aygerim.png",
    avatarTint: "#FF6B00",
  },
  {
    key: "school",
    type: "school",
    accountType: "online_school",
    displayName: "Til Akademiyasy",
    handle: "til-akademiya",
    bio: "Онлайн-мектеп: қазақ, орыс және ағылшын тілдері. 500+ оқушы, сертифицированные педагоги.",
    login: "demo-til-akademiya",
    avatarFile: "avatar-til-akademiya.png",
    avatarTint: "#4A90D9",
  },
  {
    key: "ent",
    type: "school",
    accountType: "online_school",
    displayName: "ЕНТ Орталығы",
    handle: "ent-ortalyk",
    bio: "ЕНТ-ге 11 жылдық тәжірибе. Математика, физика, қазақ тілі — топ репетиторлар тобы.",
    login: "demo-ent-ortalyk",
    avatarFile: "avatar-ent.png",
    avatarTint: "#7B68EE",
  },
  {
    key: "coach",
    type: "creator",
    accountType: "course_creator",
    displayName: "Арман Бекенов",
    handle: "coach-arman",
    bio: "Кариералық коуч. Жетекшілік, мотивация және шетелге оқуға түсу стратегиясы.",
    login: "demo-coach-arman",
    avatarFile: "avatar-arman.png",
    avatarTint: "#2ECC71",
  },
];

const COVER_SPECS = [
  { file: "cover-ent-math.png", tint: "#E6E8EB" },
  { file: "cover-english-group.png", tint: "#E4E9E6" },
  { file: "cover-community.png", tint: "#E7E5EA" },
  { file: "cover-webinar.png", tint: "#E8E7E2" },
] as const;

type ProductSeed = {
  id: string;
  seller: SellerKey;
  categorySlug: string;
  subcategorySlug: string;
  title: string;
  headline: string | null;
  price: number;
  imagePath: string | null;
  lessonFormat?: "individual" | "group";
  billingPeriod?: "month" | "quarter" | "year";
  eventOffsetDays?: number;
  capacity?: number;
  slug: string;
};

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    id: "33333333-3333-4333-8333-333333333301",
    seller: "ent",
    categorySlug: "courses",
    subcategorySlug: "video-courses",
    title: "Подготовка к ЕНТ по математике",
    headline: "Полный курс с тестами и разбором типовых заданий",
    price: 45000,
    imagePath: null,
    slug: "demo-ent-matematika",
  },
  {
    id: "33333333-3333-4333-8333-333333333302",
    seller: "school",
    categorySlug: "courses",
    subcategorySlug: "mini-courses",
    title: "IELTS Writing интенсив",
    headline: "5 дней — структура эссе и типичные ошибки",
    price: 12000,
    imagePath: null,
    slug: "demo-ielts-writing",
  },
  {
    id: "33333333-3333-4333-8333-333333333303",
    seller: "ent",
    categorySlug: "courses",
    subcategorySlug: "education-programs",
    title:
      "Комплексная подготовка к поступлению в топовые университеты Казахстана и зарубежом с индивидуальным планом",
    headline: "12 месяцев сопровождения и консультации",
    price: 250000,
    imagePath: null,
    slug: "demo-kompleks-postuplenie",
  },
  {
    id: "33333333-3333-4333-8333-333333333304",
    seller: "tutor",
    categorySlug: "courses",
    subcategorySlug: "mini-courses",
    title: "Курс казахского языка",
    headline: "С нуля до разговорного уровня",
    price: 8500,
    imagePath: null,
    slug: "demo-kazakh-beginners",
  },
  {
    id: "33333333-3333-4333-8333-333333333305",
    seller: "tutor",
    categorySlug: "online-lessons",
    subcategorySlug: "exam-prep",
    title: "Подготовка к ЕНТ по математике (индивидуально)",
    headline: "Персональный план и домашние задания",
    price: 15000,
    imagePath: null,
    lessonFormat: "individual",
    slug: "demo-ent-math-1on1",
  },
  {
    id: "33333333-3333-4333-8333-333333333306",
    seller: "school",
    categorySlug: "online-lessons",
    subcategorySlug: "conversation-clubs",
    title: "Разговорный английский в группе",
    headline: "2 раза в неделю, 8 участников",
    price: 9900,
    imagePath: null,
    lessonFormat: "group",
    slug: "demo-english-group",
  },
  {
    id: "33333333-3333-4333-8333-333333333307",
    seller: "school",
    categorySlug: "online-lessons",
    subcategorySlug: "exam-prep",
    title: "IELTS Speaking",
    headline: "Практика с носителем и разбор критериев",
    price: 18000,
    imagePath: null,
    lessonFormat: "individual",
    slug: "demo-ielts-speaking",
  },
  {
    id: "33333333-3333-4333-8333-333333333308",
    seller: "coach",
    categorySlug: "online-lessons",
    subcategorySlug: "coaching",
    title: "Коучинг: поступление за рубеж",
    headline: "Группа 6 человек, стратегия и мотивация",
    price: 22000,
    imagePath: null,
    lessonFormat: "group",
    slug: "demo-coaching-abroad",
  },
  {
    id: "33333333-3333-4333-8333-333333333309",
    seller: "coach",
    categorySlug: "subscriptions",
    subcategorySlug: "telegram-channels",
    title: "Telegram: советы коуча",
    headline: "Ежедневные короткие практики",
    price: 990,
    imagePath: null,
    billingPeriod: "month",
    slug: "demo-telegram-coach",
  },
  {
    id: "33333333-3333-4333-8333-333333333310",
    seller: "school",
    categorySlug: "subscriptions",
    subcategorySlug: "paid-newsletters",
    title: "Рассылка: английский каждый день",
    headline: "Слова, аудио и мини-задания",
    price: 4990,
    imagePath: null,
    billingPeriod: "quarter",
    slug: "demo-newsletter-english",
  },
  {
    id: "33333333-3333-4333-8333-333333333311",
    seller: "ent",
    categorySlug: "subscriptions",
    subcategorySlug: "private-communities",
    title: "Закрытое сообщество ЕНТ",
    headline: "Чат, материалы и еженедельные стримы",
    price: 25000,
    imagePath: null,
    billingPeriod: "year",
    slug: "demo-ent-community",
  },
  {
    id: "33333333-3333-4333-8333-333333333312",
    seller: "ent",
    categorySlug: "materials",
    subcategorySlug: "notes",
    title: "Конспекты по физике",
    headline: "PDF: механика, оптика, электродинамика",
    price: 2500,
    imagePath: null,
    slug: "demo-physics-notes",
  },
  {
    id: "33333333-3333-4333-8333-333333333313",
    seller: "tutor",
    categorySlug: "materials",
    subcategorySlug: "guides",
    title: "Гайд по олимпиадной математике",
    headline: "Методы и типовые подходы",
    price: 3500,
    imagePath: null,
    slug: "demo-olympiad-guide",
  },
  {
    id: "33333333-3333-4333-8333-333333333314",
    seller: "ent",
    categorySlug: "materials",
    subcategorySlug: "webinar-recordings",
    title: "Вебинар о поступлении за рубеж",
    headline: "Запись + чек-лист документов",
    price: 5900,
    imagePath: null,
    slug: "demo-webinar-abroad",
  },
  {
    id: "33333333-3333-4333-8333-333333333315",
    seller: "ent",
    categorySlug: "events",
    subcategorySlug: "webinars",
    title: "Вебинар: как выбрать вуз в 2026",
    headline: "Живой Q&A с кураторами",
    price: 7500,
    imagePath: null,
    eventOffsetDays: 7,
    capacity: 120,
    slug: "demo-webinar-vuz-2026",
  },
  {
    id: "33333333-3333-4333-8333-333333333316",
    seller: "tutor",
    categorySlug: "events",
    subcategorySlug: "masterclasses",
    title: "Мастер-класс олимпиадная математика",
    headline: "Запись прошедшего интенсива",
    price: 9900,
    imagePath: null,
    eventOffsetDays: 14,
    capacity: 40,
    slug: "demo-olympiad-masterclass",
  },
];

async function loadEnvFile() {
  try {
    const raw = await readFile(join(rootDir, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional .env
  }
}

function supabaseUrl() {
  return (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function ensureDemoAssets() {
  await mkdir(demoDir, { recursive: true });

  for (const seller of SELLERS) {
    const outPath = join(demoDir, seller.avatarFile);
    try {
      await access(outPath);
    } catch {
      const [r, g, b] = hexToRgb(seller.avatarTint);
      const svg = `
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="rgb(${r},${g},${b})"/>
        </svg>`;
      await sharp(Buffer.from(svg)).png().toFile(outPath);
      console.log(`  created ${seller.avatarFile}`);
    }
  }

  for (const cover of COVER_SPECS) {
    const outPath = join(demoDir, cover.file);
    try {
      await access(outPath);
    } catch {
      const [r, g, b] = hexToRgb(cover.tint);
      const svg = `
        <svg width="1600" height="1000" xmlns="http://www.w3.org/2000/svg">
          <rect width="1600" height="1000" fill="rgb(${r},${g},${b})"/>
        </svg>`;
      await sharp(Buffer.from(svg)).png().toFile(outPath);
      console.log(`  created ${cover.file}`);
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

async function fetchTaxonomyIds(
  supabase: ReturnType<typeof createClient>,
) {
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, slug");
  if (catError) throw catError;

  const { data: subcategories, error: subError } = await supabase
    .from("subcategories")
    .select("id, slug, category_id");
  if (subError) throw subError;

  const categoryBySlug = new Map(
    (categories ?? []).map((row) => [row.slug as string, row.id as string]),
  );
  const subcategoryByKey = new Map(
    (subcategories ?? []).map((row) => [
      `${row.category_id}:${row.slug}`,
      row.id as string,
    ]),
  );

  return { categoryBySlug, subcategoryByKey, categories: categories ?? [] };
}

const DEMO_PAYMENT_METHODS: Array<{
  id: string;
  seller: SellerKey;
  type: "link" | "phone" | "card";
  bank: "kaspi" | "halyk" | "freedom" | "other" | null;
  bankName: string | null;
  value: string;
  recipientName: string | null;
  sortOrder: number;
}> = [
  {
    id: "44444444-4444-4444-8444-444444444401",
    seller: "tutor",
    type: "phone",
    bank: "kaspi",
    bankName: null,
    value: "+7 777 123 45 67",
    recipientName: "Айгерім Н.",
    sortOrder: 0,
  },
  {
    id: "44444444-4444-4444-8444-444444444402",
    seller: "school",
    type: "link",
    bank: null,
    bankName: null,
    value: "https://pay.kaspi.kz/pay/demo-til-akademiya",
    recipientName: null,
    sortOrder: 0,
  },
  {
    id: "44444444-4444-4444-8444-444444444403",
    seller: "ent",
    type: "card",
    bank: "kaspi",
    bankName: null,
    value: "4400430123456789",
    recipientName: "ЕНТ Орталығы",
    sortOrder: 0,
  },
  {
    id: "44444444-4444-4444-8444-444444444404",
    seller: "coach",
    type: "phone",
    bank: "kaspi",
    bankName: null,
    value: "+7 701 987 65 43",
    recipientName: "Арман Б.",
    sortOrder: 0,
  },
];

async function cleanDemo(supabase: ReturnType<typeof createClient>) {
  const { error: productError } = await supabase
    .from("products")
    .delete()
    .eq("is_demo", true);
  if (productError) throw productError;

  const demoProfileIds = Object.values(PROFILE_IDS);
  const { error: pmError } = await supabase
    .from("payment_methods")
    .delete()
    .in("profile_id", demoProfileIds);
  if (pmError) throw pmError;

  const { error: accountError } = await supabase
    .from("creator_accounts")
    .delete()
    .in("profile_id", demoProfileIds);
  if (accountError) throw accountError;

  const { error: profileError } = await supabase
    .from("profiles")
    .delete()
    .eq("is_demo", true);
  if (profileError) throw profileError;

  console.log("Removed all is_demo profiles, accounts, products, and payment methods.");
}

async function seedDemo(supabase: ReturnType<typeof createClient>) {
  console.log("Generating demo assets in public/demo/ …");
  await ensureDemoAssets();

  const { categoryBySlug, subcategoryByKey } = await fetchTaxonomyIds(supabase);

  console.log("Upserting demo seller profiles …");
  for (const seller of SELLERS) {
    const profileId = PROFILE_IDS[seller.key];
    const accountId = ACCOUNT_IDS[seller.key];
    const avatarUrl = `/demo/${seller.avatarFile}`;

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: profileId,
        auth_user_id: null,
        type: seller.type,
        display_name: seller.displayName,
        handle: seller.handle,
        bio: seller.bio,
        avatar_url: avatarUrl,
        is_demo: true,
        last_used_at: null,
      },
      { onConflict: "id" },
    );
    if (profileError) throw profileError;

    const { error: accountError } = await supabase.from("creator_accounts").upsert(
      {
        id: accountId,
        login: seller.login,
        display_name: seller.displayName,
        password_hash: null,
        account_type: seller.accountType,
        profile_id: profileId,
        is_blocked: false,
      },
      { onConflict: "id" },
    );
    if (accountError) throw accountError;
  }

  console.log("Upserting demo payment methods …");
  for (const pm of DEMO_PAYMENT_METHODS) {
    const profileId = PROFILE_IDS[pm.seller];
    const { error: pmError } = await supabase.from("payment_methods").upsert(
      {
        id: pm.id,
        profile_id: profileId,
        type: pm.type,
        bank: pm.bank,
        bank_name: pm.bankName,
        value: pm.value,
        recipient_name: pm.recipientName,
        sort_order: pm.sortOrder,
      },
      { onConflict: "id" }
    );
    if (pmError) throw pmError;
  }

  console.log("Upserting demo products …");
  for (const seed of PRODUCT_SEEDS) {
    const categoryId = categoryBySlug.get(seed.categorySlug);
    if (!categoryId) {
      throw new Error(`Missing category slug: ${seed.categorySlug}`);
    }
    const subcategoryId = subcategoryByKey.get(`${categoryId}:${seed.subcategorySlug}`);
    if (!subcategoryId) {
      throw new Error(
        `Missing subcategory: ${seed.categorySlug}/${seed.subcategorySlug}`,
      );
    }

    const seller = SELLERS.find((s) => s.key === seed.seller)!;
    const accountId = ACCOUNT_IDS[seed.seller];

    let eventStartsAt: string | null = null;
    if (seed.eventOffsetDays != null) {
      const d = new Date();
      d.setDate(d.getDate() + seed.eventOffsetDays);
      d.setHours(18, 0, 0, 0);
      eventStartsAt = d.toISOString();
    }

    const row = {
      id: seed.id,
      creator_id: seller.login,
      creator_account_id: accountId,
      title: seed.title,
      headline: seed.headline,
      description: seed.headline,
      price: seed.price,
      image_url: seed.imagePath,
      has_schedule: false,
      is_active: true,
      is_paused: false,
      slug: seed.slug,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      lesson_format: seed.lessonFormat ?? null,
      billing_period: seed.billingPeriod ?? null,
      event_starts_at: eventStartsAt,
      capacity: seed.capacity ?? null,
      is_demo: true,
    };

    const { error } = await supabase.from("products").upsert(row, { onConflict: "id" });
    if (error) throw error;

    const sellerPms = DEMO_PAYMENT_METHODS.filter((m) => m.seller === seed.seller);
    for (const pm of sellerPms) {
      const { error: ppmError } = await supabase.from("product_payment_methods").upsert(
        {
          product_id: seed.id,
          payment_method_id: pm.id,
        },
        { onConflict: "product_id,payment_method_id" }
      );
      if (ppmError) throw ppmError;
    }
  }

  console.log(`Seeded ${SELLERS.length} sellers, payment methods, and ${PRODUCT_SEEDS.length} products.`);
}

async function main() {
  await loadEnvFile();
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) {
    console.error(
      "Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or VITE_SUPABASE_URL) in .env",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const clean = process.argv.includes("--clean");
  if (clean) {
    await cleanDemo(supabase);
    return;
  }

  await seedDemo(supabase);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
