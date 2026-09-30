/**
 * Seed a demo login with a filled inbox: a seller whose buyers wrote to them,
 * the «Покупатели» list, announcements, and a buyer side that chats with another seller.
 *
 * Usage:
 *   DEMO_INBOX_EMAIL=demo@example.com npm run seed:demo-inbox   — create / refresh everything
 *   npm run seed:demo-inbox:clean                               — delete everything it created
 *   (the email can also be passed as --email=demo@example.com)
 *
 * Sign in on the site with that email: the login code arrives in its inbox, so use an
 * address you can read and that has no real Dostup profiles (the script refuses otherwise).
 * Products are is_demo and unpublished, so they never show in the catalog.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (or environment).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

/** Marks the auth user so --clean only ever deletes an identity this script created. */
const AUTH_MARKER = "demo_inbox";

const PROFILE_IDS = {
  academy: "55555555-5555-4555-8555-555555555501",
  tutor: "55555555-5555-4555-8555-555555555502",
  me: "55555555-5555-4555-8555-555555555503",
  aidana: "55555555-5555-4555-8555-555555555511",
  daniyar: "55555555-5555-4555-8555-555555555512",
  madina: "55555555-5555-4555-8555-555555555513",
  timur: "55555555-5555-4555-8555-555555555514",
  aliya: "55555555-5555-4555-8555-555555555515",
  yerlan: "55555555-5555-4555-8555-555555555516",
} as const;

type BuyerKey = "aidana" | "daniyar" | "madina" | "timur" | "aliya" | "yerlan";

const BUYER_NAMES: Record<BuyerKey, string> = {
  aidana: "Айдана Серикова",
  daniyar: "Данияр Касымов",
  madina: "Мадина Ахметова",
  timur: "Тимур Жумабаев",
  aliya: "Алия Нурланова",
  yerlan: "Ерлан Садыков",
};

const SELLERS = {
  academy: {
    accountId: "66666666-6666-4666-8666-666666666601",
    profileId: PROFILE_IDS.academy,
    login: "demo-inbox-academy",
    displayName: "Demo English Academy",
    handle: "demo-inbox-academy",
    bio: "Демо-аккаунт для проверки сообщений, покупателей и объявлений.",
  },
  tutor: {
    accountId: "66666666-6666-4666-8666-666666666602",
    profileId: PROFILE_IDS.tutor,
    login: "demo-inbox-tutor",
    displayName: "Demo Math Tutor",
    handle: "demo-inbox-tutor",
    bio: "Демо-репетитор: продавец, у которого купил демо-покупатель.",
  },
} as const;

type SellerKey = keyof typeof SELLERS;

// Subcategory ids are fixed by 20260904204500_clean_new_taxonomy.sql; categories are read from them.
const SUBCATEGORY = {
  videoCourses: "c2000000-0000-0000-0000-000000000001",
  individual: "c1000000-0000-0000-0000-000000000001",
  group: "c1000000-0000-0000-0000-000000000002",
} as const;

const PRODUCTS = {
  ielts: {
    id: "77777777-7777-4777-8777-777777777701",
    seller: "academy",
    subcategoryId: SUBCATEGORY.videoCourses,
    title: "IELTS за 3 месяца",
    headline: "Видеокурс: все 4 части экзамена и пробные тесты",
    price: 45000,
    slug: "demo-inbox-ielts",
  },
  speaking: {
    id: "77777777-7777-4777-8777-777777777702",
    seller: "academy",
    subcategoryId: SUBCATEGORY.group,
    title: "Разговорный английский в группе",
    headline: "2 раза в неделю, до 8 человек",
    price: 15000,
    lessonFormat: "group",
    slug: "demo-inbox-speaking",
  },
  sat: {
    id: "77777777-7777-4777-8777-777777777703",
    seller: "academy",
    subcategoryId: SUBCATEGORY.individual,
    title: "SAT Math индивидуально",
    headline: "Персональный план и разбор ошибок",
    price: 20000,
    lessonFormat: "individual",
    slug: "demo-inbox-sat",
  },
  ent: {
    id: "77777777-7777-4777-8777-777777777704",
    seller: "tutor",
    subcategoryId: SUBCATEGORY.videoCourses,
    title: "Математика для ЕНТ: 10 уроков",
    headline: "Типовые задачи и разбор ошибок",
    price: 12000,
    slug: "demo-inbox-ent",
  },
} as const satisfies Record<
  string,
  {
    id: string;
    seller: SellerKey;
    subcategoryId: string;
    title: string;
    headline: string;
    price: number;
    lessonFormat?: "individual" | "group";
    slug: string;
  }
>;

type ProductKey = keyof typeof PRODUCTS;

type PurchaseSeed = {
  id: string;
  product: ProductKey;
  buyer: BuyerKey | "me";
  status: "completed" | "pending" | "revoked";
  daysAgo: number;
  accessExpiredDaysAgo?: number;
};

const PURCHASES: PurchaseSeed[] = [
  { id: "88888888-8888-4888-8888-888888888801", product: "ielts", buyer: "aidana", status: "completed", daysAgo: 21 },
  { id: "88888888-8888-4888-8888-888888888802", product: "speaking", buyer: "aidana", status: "completed", daysAgo: 12 },
  { id: "88888888-8888-4888-8888-888888888803", product: "speaking", buyer: "daniyar", status: "completed", daysAgo: 9 },
  {
    id: "88888888-8888-4888-8888-888888888804",
    product: "sat",
    buyer: "madina",
    status: "completed",
    daysAgo: 60,
    accessExpiredDaysAgo: 3,
  },
  { id: "88888888-8888-4888-8888-888888888805", product: "ielts", buyer: "timur", status: "completed", daysAgo: 4 },
  { id: "88888888-8888-4888-8888-888888888806", product: "ielts", buyer: "aliya", status: "pending", daysAgo: 0 },
  { id: "88888888-8888-4888-8888-888888888807", product: "speaking", buyer: "yerlan", status: "revoked", daysAgo: 40 },
  { id: "88888888-8888-4888-8888-888888888808", product: "ent", buyer: "me", status: "completed", daysAgo: 6 },
];

/** [who wrote it, text, minutes ago] — oldest first. */
type MessageSeed = ["creator" | "buyer", string, number];

type ThreadSeed = {
  seller: SellerKey;
  buyer: BuyerKey | "me";
  /** The side that has already opened the chat; the other one sees trailing messages as unread. */
  readBy?: "creator" | "buyer" | "both";
  messages: MessageSeed[];
};

const DAY = 24 * 60;

const THREADS: ThreadSeed[] = [
  {
    seller: "academy",
    buyer: "aidana",
    messages: [
      ["buyer", "Здравствуйте! Оплатила курс IELTS, с какого урока лучше начать?", 20 * DAY],
      ["creator", "Здравствуйте, Айдана! Начните с вводного урока и пробного теста — по нему поймём ваш уровень.", 20 * DAY - 45],
      ["buyer", "Прошла тест, получилось 5.5 😅", 19 * DAY],
      ["creator", "Хороший старт! Цель 7.0 реальна за 3 месяца. Делайте по 2 урока в неделю и присылайте эссе сюда.", 19 * DAY - 30],
      ["buyer", "Отправила первое эссе на проверку, посмотрите, пожалуйста", 2 * DAY],
      ["creator", "Посмотрела: структура хорошая, но во втором абзаце мало примеров. Оценка примерно 6.0.", 2 * DAY - 120],
      ["buyer", "Спасибо! А групповое занятие в четверг будет?", 95],
      ["buyer", "И можно ли прийти на 10 минут позже?", 90],
    ],
  },
  {
    seller: "academy",
    buyer: "daniyar",
    readBy: "both",
    messages: [
      ["buyer", "Добрый день, во сколько сегодня занятие?", 3 * DAY],
      ["creator", "Добрый! В 19:00, ссылка придёт за 15 минут до начала.", 3 * DAY - 10],
      ["buyer", "Спасибо, буду", 3 * DAY - 5],
      ["creator", "Данияр, на следующей неделе занятие переносим на среду, 19:00. Ок?", DAY],
      ["buyer", "Да, удобно 👍", DAY - 20],
    ],
  },
  {
    seller: "academy",
    buyer: "madina",
    messages: [
      ["buyer", "Здравствуйте! У меня закончился доступ к занятиям SAT, можно продлить ещё на месяц?", 2 * DAY],
      ["creator", "Здравствуйте, Мадина! Да, конечно. Оплатите продление, и я открою доступ.", 2 * DAY - 60],
      ["buyer", "Оплатила, чек прикрепила в заказе", 40],
    ],
  },
  {
    seller: "academy",
    buyer: "timur",
    messages: [
      ["buyer", "Здравствуйте, в уроке 3 не открывается видео. Это у меня проблема?", 25],
    ],
  },
  {
    seller: "academy",
    buyer: "yerlan",
    readBy: "both",
    messages: [
      ["buyer", "Здравствуйте, я больше не смогу ходить на занятия, переезжаю в другой город.", 35 * DAY],
      ["creator", "Понимаю, Ерлан. Закрою доступ к группе. Будем рады видеть вас снова!", 35 * DAY - 90],
    ],
  },
  {
    seller: "tutor",
    buyer: "me",
    readBy: "creator",
    messages: [
      ["creator", "Привет! Видел, что ты купил курс по математике. Если будут вопросы по задачам — пиши сюда.", 6 * DAY],
      ["buyer", "Спасибо! Не понимаю задачу 7 в уроке 2, можно разбор?", 5 * DAY],
      ["creator", "Конечно. Там нужно сначала найти общий знаменатель, а потом решить уравнение как квадратное.", 5 * DAY - 30],
      ["creator", "Кстати, в пятницу будет разбор пробного ЕНТ — в объявлениях есть ссылка.", 180],
    ],
  },
];

const ANNOUNCEMENTS: Record<ProductKey, string[]> = {
  ielts: [
    "<p>Добро пожаловать на курс! Начните с вводного урока и пройдите пробный тест.</p>",
    "<p>Добавила новый урок по Writing Task 2 — разбор 5 реальных эссе.</p>",
  ],
  speaking: [
    "<p>Расписание: вторник и четверг, 19:00. Ссылка на занятие приходит за 15 минут.</p>",
    "<p>На следующей неделе занятие переносится со вторника на среду, 19:00.</p>",
  ],
  sat: ["<p>Перед каждым занятием решайте 10 задач из плана — разберём ошибки вместе.</p>"],
  ent: [
    "<p>Привет! Уроки открываются по одному в неделю, домашние задания — в конце каждого урока.</p>",
    "<p>В пятницу в 18:00 — разбор пробного ЕНТ в прямом эфире. Ссылка появится здесь.</p>",
  ],
};

const OUR_PROFILE_IDS: string[] = Object.values(PROFILE_IDS);
const OUR_ACCOUNT_IDS: string[] = Object.values(SELLERS).map((s) => s.accountId);
const OUR_LOGINS: string[] = Object.values(SELLERS).map((s) => s.login);
const OUR_PRODUCT_IDS: string[] = Object.values(PRODUCTS).map((p) => p.id);

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

function demoEmail(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--email="));
  const raw = arg ? arg.slice("--email=".length) : process.env.DEMO_INBOX_EMAIL;
  const email = raw?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return minutesAgo(days * DAY);
}

function check<T>(result: { data: T; error: unknown }, what: string): T {
  if (result.error) {
    const message = (result.error as { message?: string }).message ?? String(result.error);
    throw new Error(`${what}: ${message}`);
  }
  return result.data;
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
}

async function ensureAuthUser(supabase: SupabaseClient, email: string) {
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) return existing;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { [AUTH_MARKER]: true, name: SELLERS.academy.displayName },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  console.log(`  created auth user ${email}`);
  return data.user;
}

/** Refuses to attach demo profiles to an identity or email that real profiles already use. */
async function assertEmailIsFree(supabase: SupabaseClient, email: string, authUserId: string) {
  const profiles = check(
    await supabase.from("profiles").select("id").eq("auth_user_id", authUserId),
    "read profiles",
  ) as { id: string }[];
  const foreignProfiles = profiles.filter((p) => !OUR_PROFILE_IDS.includes(p.id));

  const accounts = check(
    await supabase.from("creator_accounts").select("id").ilike("email", email),
    "read creator_accounts",
  ) as { id: string }[];
  const foreignAccounts = accounts.filter((a) => !OUR_ACCOUNT_IDS.includes(a.id));

  if (foreignProfiles.length || foreignAccounts.length) {
    throw new Error(
      `${email} already belongs to a real Dostup account. Use a separate email for the demo login.`,
    );
  }
}

/** Chats, announcements and purchases are rebuilt on every run, so re-seeding resets them. */
async function clearActivity(supabase: SupabaseClient) {
  check(
    await supabase.from("direct_threads").delete().in("creator_account_id", OUR_ACCOUNT_IDS),
    "delete threads",
  );
  check(
    await supabase.from("direct_threads").delete().in("buyer_profile_id", OUR_PROFILE_IDS),
    "delete buyer threads",
  );
  check(
    await supabase.from("announcements").delete().in("product_id", OUR_PRODUCT_IDS),
    "delete announcements",
  );
  check(
    await supabase.from("simple_purchases").delete().in("product_id", OUR_PRODUCT_IDS),
    "delete purchases",
  );
  check(
    await supabase.from("simple_purchases").delete().in("buyer_profile_id", OUR_PROFILE_IDS),
    "delete buyer purchases",
  );
}

async function cleanDemoInbox(supabase: SupabaseClient) {
  const { data: owner } = await supabase
    .from("profiles")
    .select("auth_user_id")
    .eq("id", PROFILE_IDS.academy)
    .maybeSingle();
  const authUserId = (owner as { auth_user_id: string | null } | null)?.auth_user_id ?? null;

  await clearActivity(supabase);
  check(await supabase.from("creator_sessions").delete().in("profile_id", OUR_PROFILE_IDS), "delete sessions");
  check(await supabase.from("creator_sessions").delete().in("creator_name", OUR_LOGINS), "delete login sessions");
  check(await supabase.from("products").delete().in("id", OUR_PRODUCT_IDS), "delete products");
  check(await supabase.from("creator_accounts").delete().in("id", OUR_ACCOUNT_IDS), "delete accounts");
  check(await supabase.from("profiles").delete().in("id", OUR_PROFILE_IDS), "delete profiles");

  if (authUserId) {
    const { data } = await supabase.auth.admin.getUserById(authUserId);
    if (data.user?.user_metadata?.[AUTH_MARKER] === true) {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) throw error;
      console.log(`  deleted auth user ${data.user.email}`);
    } else if (data.user) {
      console.log(`  kept auth user ${data.user.email} (not created by this script)`);
    }
  }

  console.log("Removed the demo inbox: profiles, products, purchases, chats and announcements.");
}

async function seedDemoInbox(supabase: SupabaseClient, email: string) {
  console.log(`Preparing login ${email} …`);
  const user = await ensureAuthUser(supabase, email);
  await assertEmailIsFree(supabase, email, user.id);

  const subcategories = check(
    await supabase
      .from("subcategories")
      .select("id, category_id")
      .in("id", Object.values(SUBCATEGORY)),
    "read subcategories",
  ) as { id: string; category_id: string }[];
  const categoryBySubcategory = new Map(subcategories.map((s) => [s.id, s.category_id]));
  for (const id of Object.values(SUBCATEGORY)) {
    if (!categoryBySubcategory.has(id)) throw new Error(`Missing subcategory ${id}`);
  }

  await clearActivity(supabase);

  console.log("Upserting profiles …");
  const now = Date.now();
  const profileRows = [
    // The seller profile is the most recently used, so signing in opens it first.
    {
      id: SELLERS.academy.profileId,
      auth_user_id: user.id,
      type: "school",
      display_name: SELLERS.academy.displayName,
      handle: SELLERS.academy.handle,
      bio: SELLERS.academy.bio,
      is_demo: true,
      last_used_at: new Date(now).toISOString(),
    },
    {
      id: PROFILE_IDS.me,
      auth_user_id: user.id,
      type: "buyer",
      display_name: "Demo Покупатель",
      is_demo: true,
      last_used_at: new Date(now - 60 * 60 * 1000).toISOString(),
    },
    {
      id: SELLERS.tutor.profileId,
      auth_user_id: null,
      type: "creator",
      display_name: SELLERS.tutor.displayName,
      handle: SELLERS.tutor.handle,
      bio: SELLERS.tutor.bio,
      is_demo: true,
      last_used_at: null,
    },
    ...(Object.keys(BUYER_NAMES) as BuyerKey[]).map((key) => ({
      id: PROFILE_IDS[key],
      auth_user_id: null,
      type: "buyer",
      display_name: BUYER_NAMES[key],
      is_demo: true,
      last_used_at: null,
    })),
  ];
  for (const row of profileRows) {
    check(await supabase.from("profiles").upsert(row, { onConflict: "id" }), `upsert profile ${row.display_name}`);
  }

  console.log("Upserting seller accounts …");
  check(
    await supabase.from("creator_accounts").upsert(
      [
        {
          id: SELLERS.academy.accountId,
          login: SELLERS.academy.login,
          display_name: SELLERS.academy.displayName,
          password_hash: null,
          account_type: "online_school",
          email,
          auth_user_id: user.id,
          profile_id: SELLERS.academy.profileId,
          is_blocked: false,
        },
        {
          id: SELLERS.tutor.accountId,
          login: SELLERS.tutor.login,
          display_name: SELLERS.tutor.displayName,
          password_hash: null,
          account_type: "course_creator",
          email: null,
          auth_user_id: null,
          profile_id: SELLERS.tutor.profileId,
          is_blocked: false,
        },
      ],
      { onConflict: "id" },
    ),
    "upsert creator_accounts",
  );

  console.log("Upserting products …");
  for (const product of Object.values(PRODUCTS)) {
    const seller = SELLERS[product.seller];
    check(
      await supabase.from("products").upsert(
        {
          id: product.id,
          creator_id: seller.login,
          creator_account_id: seller.accountId,
          title: product.title,
          headline: product.headline,
          description: product.headline,
          price: product.price,
          image_url: null,
          has_schedule: false,
          is_active: true,
          is_paused: false,
          is_published: false,
          slug: product.slug,
          category_id: categoryBySubcategory.get(product.subcategoryId),
          subcategory_id: product.subcategoryId,
          lesson_format: "lessonFormat" in product ? product.lessonFormat : null,
          is_demo: true,
        },
        { onConflict: "id" },
      ),
      `upsert product ${product.title}`,
    );
  }

  console.log("Inserting purchases …");
  check(
    await supabase.from("simple_purchases").insert(
      PURCHASES.map((p) => ({
        id: p.id,
        product_id: PRODUCTS[p.product].id,
        buyer_profile_id: PROFILE_IDS[p.buyer],
        amount: PRODUCTS[p.product].price,
        status: p.status,
        created_at: daysAgo(p.daysAgo),
        confirmed_at: p.status === "pending" ? null : daysAgo(p.daysAgo),
        access_expires_at: p.accessExpiredDaysAgo != null ? daysAgo(p.accessExpiredDaysAgo) : null,
      })),
    ),
    "insert purchases",
  );

  console.log("Inserting announcements …");
  const announcementRows = (Object.keys(ANNOUNCEMENTS) as ProductKey[]).flatMap((key) => {
    const product = PRODUCTS[key];
    const items = ANNOUNCEMENTS[key];
    return items.map((contentHtml, index) => ({
      product_id: product.id,
      creator_id: SELLERS[product.seller].login,
      content_html: contentHtml,
      order_index: index,
      created_at: daysAgo(items.length - index),
    }));
  });
  check(await supabase.from("announcements").insert(announcementRows), "insert announcements");

  console.log("Inserting chats …");
  let messageCount = 0;
  for (const thread of THREADS) {
    const last = thread.messages[thread.messages.length - 1];
    const trailing = (side: "creator" | "buyer") => {
      let n = 0;
      for (let i = thread.messages.length - 1; i >= 0 && thread.messages[i][0] === side; i--) n++;
      return n;
    };
    const readBy = thread.readBy;
    const row = check(
      await supabase
        .from("direct_threads")
        .insert({
          creator_account_id: SELLERS[thread.seller].accountId,
          buyer_profile_id: PROFILE_IDS[thread.buyer],
          created_at: minutesAgo(thread.messages[0][2]),
          last_message_at: minutesAgo(last[2]),
          last_message_preview: last[1].slice(0, 200),
          unread_for_creator: readBy === "creator" || readBy === "both" ? 0 : trailing("buyer"),
          unread_for_buyer: readBy === "buyer" || readBy === "both" ? 0 : trailing("creator"),
        })
        .select("id")
        .single(),
      "insert thread",
    ) as { id: string };

    check(
      await supabase.from("direct_messages").insert(
        thread.messages.map(([sender, text, ago]) => ({
          thread_id: row.id,
          sender,
          text,
          attachments: [],
          created_at: minutesAgo(ago),
        })),
      ),
      "insert messages",
    );
    messageCount += thread.messages.length;
  }

  console.log(
    `Seeded ${profileRows.length} profiles, ${Object.keys(PRODUCTS).length} products, ` +
      `${PURCHASES.length} purchases, ${announcementRows.length} announcements, ` +
      `${THREADS.length} chats (${messageCount} messages).`,
  );
  console.log(`\nSign in with ${email} (code arrives in that inbox).`);
  console.log(`It opens «${SELLERS.academy.displayName}»; switch to «Demo Покупатель» for the buyer side.`);
}

async function main() {
  await loadEnvFile();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or VITE_SUPABASE_URL) in .env");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (process.argv.includes("--clean")) {
    await cleanDemoInbox(supabase);
    return;
  }

  const email = demoEmail();
  if (!email) {
    console.error("Set DEMO_INBOX_EMAIL in .env or pass --email=you+demo@example.com");
    process.exit(1);
  }
  await seedDemoInbox(supabase, email);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
