// Структура категорий, подкатегорий и тем Dostup

export interface SubcategoryDef {
  slug: string;
  name_ru: string;
  name_kk: string;
  topics: string[];
}

export interface CategoryDef {
  slug: string;
  name_ru: string;
  name_kk: string;
  subcategories: SubcategoryDef[];
}

const ONLINE_LESSONS_TOPICS = [
  "🇬🇧 Английский язык",
  "🇰🇿 Казахский язык",
  "🇨🇳 Китайский язык",
  "🇹🇷 Турецкий язык",
  "🇰🇷 Корейский язык",
  "📜 IELTS",
  "📜 TOEFL",
  "🎓 SAT",
  "🇰🇿 ЕНТ",
  "🏫 НИШ",
  "🏫 КТЛ",
  "📐 РФМШ",
  "🔢 Математика",
  "🧲 Физика",
  "🧪 Химия",
  "🧬 Биология",
  "💻 Программирование",
  "🎨 Дизайн",
  "📈 Маркетинг",
  "📱 SMM",
  "💼 Бизнес",
  "💳 Финансы и инвестиции",
  "📊 Трейдинг",
  "🧠 Психология",
  "🎤 Вокал",
  "🎸 Игра на музыкальных инструментах",
  "♟️ Шахматы",
  "🏋️ Фитнес",
  "🧘 Йога",
  "🥗 Здоровье",
];

const MATERIALS_TOPICS = [
  "🇬🇧 Английский язык",
  "🇰🇿 Казахский язык",
  "📜 IELTS",
  "📜 TOEFL",
  "🎓 SAT",
  "🇰🇿 ЕНТ",
  "🏫 НИШ",
  "🏫 КТЛ",
  "🔢 Математика",
  "🎓 Поступление",
  "💻 Программирование",
  "🎨 Дизайн",
  "📈 Маркетинг",
  "📱 SMM",
  "💼 Бизнес",
  "💳 Финансы",
  "📊 Инвестиции",
  "📈 Трейдинг",
  "🤖 AI",
  "🧠 Психология",
  "🏋️ Фитнес",
  "🥗 Здоровье и программы тренировок",
];

const SUBSCRIPTIONS_ONLINE_TOPICS = [
  "🤖 AI",
  "🎵 Музыка",
  "🎬 Кино и сериалы",
  "💼 Работа и продуктивность",
  "☁️ Облачные сервисы",
  "📚 Образование",
  "🎮 Игры",
  "🧠 Саморазвитие",
  "📊 Инвестиции и крипта",
];

const SUBSCRIPTIONS_OFFLINE_TOPICS = [
  "🏋️ Спортзалы и бассейны",
  "🧘 Фитнес / Йога / Пилатес",
  "💃 Танцы",
  "☕ Развлечения",
];

const EVENTS_ONLINE_TOPICS = [
  "🎓 Английский язык",
  "📖 Подготовка к IELTS / ЕНТ / SAT",
  "💻 Программирование",
  "🤖 AI и нейросети",
  "💼 Предпринимательство",
  "📈 Маркетинг и продажи",
  "💳 Финансы и инвестиции",
  "🧠 Психология",
  "🚀 Лидерство",
  "🎤 Публичные выступления",
  "🏋️ Фитнес и йога",
  "🥗 Нутрициология",
  "🎨 Рисование",
  "📷 Фотография и видеомонтаж",
  "🎵 Музыка и танцы",
  "🍳 Кулинария",
  "🤝 Нетворкинг",
  "👨‍💻 IT и стартапы",
  "🎮 Киберспорт",
];

const EVENTS_OFFLINE_TOPICS = [
  "📝 Пробные тесты",
  "🎬 Кино-вечера",
  "🎭 Театр",
  "🎪 Шоу",
  "🎤 Концерты",
  "🎉 Фестивали",
  "🖼️ Выставки",
  "😂 Стендап",
  "🎧 Вечеринки",
  "💃 Дискотеки",
  "🎢 Парки развлечений",
  "🧩 Квесты",
  "🚶 Экскурсии",
];

export const TAXONOMY_DEFINITIONS: CategoryDef[] = [
  {
    slug: "online-lessons",
    name_ru: "Онлайн-уроки",
    name_kk: "Онлайн сабақтар",
    subcategories: [
      {
        slug: "individual",
        name_ru: "Индивидуально",
        name_kk: "Жеке",
        topics: ONLINE_LESSONS_TOPICS,
      },
      {
        slug: "group",
        name_ru: "В группе",
        name_kk: "Топта",
        topics: ONLINE_LESSONS_TOPICS,
      },
    ],
  },
  {
    slug: "materials",
    name_ru: "Материалы",
    name_kk: "Материалдар",
    subcategories: [
      {
        slug: "video-courses",
        name_ru: "🎥 Видеокурсы",
        name_kk: "🎥 Бейнекурстар",
        topics: MATERIALS_TOPICS,
      },
      {
        slug: "ebooks",
        name_ru: "📚 Электронные книги",
        name_kk: "📚 Электронды кітаптар",
        topics: MATERIALS_TOPICS,
      },
      {
        slug: "files",
        name_ru: "📁 Файлы",
        name_kk: "📁 Файлдар",
        topics: MATERIALS_TOPICS,
      },
    ],
  },
  {
    slug: "subscriptions",
    name_ru: "Подписки",
    name_kk: "Жазылымдар",
    subcategories: [
      {
        slug: "online",
        name_ru: "🌐 Онлайн",
        name_kk: "🌐 Онлайн",
        topics: SUBSCRIPTIONS_ONLINE_TOPICS,
      },
      {
        slug: "offline",
        name_ru: "📍 Офлайн",
        name_kk: "📍 Офлайн",
        topics: SUBSCRIPTIONS_OFFLINE_TOPICS,
      },
    ],
  },
  {
    slug: "events",
    name_ru: "Мероприятия",
    name_kk: "Іс-шаралар",
    subcategories: [
      {
        slug: "online",
        name_ru: "🌐 Онлайн",
        name_kk: "🌐 Онлайн",
        topics: EVENTS_ONLINE_TOPICS,
      },
      {
        slug: "offline",
        name_ru: "📍 Офлайн",
        name_kk: "📍 Офлайн",
        topics: EVENTS_OFFLINE_TOPICS,
      },
    ],
  },
];

/**
 * Получить список тем по слагу категории и подкатегории
 */
export function getPresetTopics(categorySlug: string, subcategorySlug?: string): string[] {
  const cat = TAXONOMY_DEFINITIONS.find((c) => c.slug === categorySlug);
  if (!cat) return [];

  if (subcategorySlug) {
    const sub = cat.subcategories.find((s) => s.slug === subcategorySlug);
    if (sub && sub.topics.length > 0) return sub.topics;
  }

  // Если подкатегория не указана или у всех подкатегорий общие темы:
  const allCatTopics = cat.subcategories.flatMap((s) => s.topics);
  return Array.from(new Set(allCatTopics));
}

export function getPresetTopicsForCategory(categorySlug: string): string[] {
  return getPresetTopics(categorySlug);
}
