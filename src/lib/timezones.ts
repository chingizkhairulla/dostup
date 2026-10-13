export interface WorldTimezone {
  id: string; // IANA identifier, e.g. "Asia/Almaty"
  offset: number; // in hours, e.g. 5 or 3 or -5 or 5.5
  offsetLabel: string; // e.g. "UTC+5", "UTC-4", "UTC+5:30"
  city: string; // primary display city, e.g. "Астана, Алматы"
  cityKk?: string; // primary display city in Kazakh
  label: string; // full display label, e.g. "(UTC+5) Астана, Алматы, Ташкент"
  region: string; // region category
  searchTerms: string; // comma-separated keywords for search
}

export const BASE_PLATFORM_OFFSET = 5; // Base timezone for Dostup slots (Kazakhstan UTC+5)
export const DEFAULT_TIMEZONE_ID = "Asia/Almaty";

export const WORLD_TIMEZONES: WorldTimezone[] = [
  // UTC-12 to UTC-09
  {
    id: "Etc/GMT+12",
    offset: -12,
    offsetLabel: "UTC-12",
    city: "Линия перемены дат (Бейкер)",
    label: "(UTC-12) Линия перемены дат (Бейкер)",
    region: "Океания",
    searchTerms: "бейкер baker etc gmt-12",
  },
  {
    id: "Pacific/Pago_Pago",
    offset: -11,
    offsetLabel: "UTC-11",
    city: "Паго-Паго, Американское Самоа",
    label: "(UTC-11) Паго-Паго, Американское Самоа",
    region: "Океания",
    searchTerms: "паго-паго американское самоа pago pago samoa",
  },
  {
    id: "Pacific/Honolulu",
    offset: -10,
    offsetLabel: "UTC-10",
    city: "Гонолулу, Гавайи, Таити",
    label: "(UTC-10) Гонолулу, Гавайи, Таити",
    region: "Америка",
    searchTerms: "гонолулу гавайи таити honolulu hawaii tahiti",
  },
  {
    id: "Pacific/Marquesas",
    offset: -9.5,
    offsetLabel: "UTC-9:30",
    city: "Маркизские острова",
    label: "(UTC-9:30) Маркизские острова",
    region: "Океания",
    searchTerms: "маркизские острова marquesas",
  },
  {
    id: "America/Anchorage",
    offset: -9,
    offsetLabel: "UTC-9",
    city: "Анкоридж, Аляска",
    label: "(UTC-9) Анкоридж, Аляска",
    region: "Америка",
    searchTerms: "анкоридж аляска anchorage alaska",
  },

  // UTC-08 to UTC-05 (North & South America)
  {
    id: "America/Los_Angeles",
    offset: -8,
    offsetLabel: "UTC-8",
    city: "Лос-Анджелес, Сан-Франциско, Ванкувер, Сиэтл",
    label: "(UTC-8) Лос-Анджелес, Сан-Франциско, Ванкувер",
    region: "Америка",
    searchTerms: "лос-анджелес сан-франциско ванкувер сиэтл лас-вегас los angeles san francisco vancouver seattle",
  },
  {
    id: "America/Denver",
    offset: -7,
    offsetLabel: "UTC-7",
    city: "Денвер, Финикс, Солт-Лейк-Сити, Калгари",
    label: "(UTC-7) Денвер, Финикс, Солт-Лейк-Сити, Калгари",
    region: "Америка",
    searchTerms: "денвер финикс солт-лейк-сити калгари denver phoenix salt lake calgary",
  },
  {
    id: "America/Chicago",
    offset: -6,
    offsetLabel: "UTC-6",
    city: "Чикаго, Мехико, Даллас, Хьюстон, Виннипег",
    label: "(UTC-6) Чикаго, Мехико, Даллас, Хьюстон",
    region: "Америка",
    searchTerms: "чикаго мехико даллас хьюстон виннипег chicago mexico dallas houston",
  },
  {
    id: "America/New_York",
    offset: -5,
    offsetLabel: "UTC-5",
    city: "Нью-Йорк, Вашингтон, Торонто, Майами, Бостон, Лима, Богота",
    label: "(UTC-5) Нью-Йорк, Вашингтон, Торонто, Майами",
    region: "Америка",
    searchTerms: "нью-йорк вашингтон торонто майами бостон лима богота new york washington toronto miami",
  },
  {
    id: "America/Santiago",
    offset: -4,
    offsetLabel: "UTC-4",
    city: "Сантьяго, Каракас, Ла-Пас, Санто-Доминго, Галифакс",
    label: "(UTC-4) Сантьяго, Каракас, Ла-Пас, Галифакс",
    region: "Америка",
    searchTerms: "сантьяго каракас ла-пас галифакс santiago caracas halifax",
  },
  {
    id: "America/St_Johns",
    offset: -3.5,
    offsetLabel: "UTC-3:30",
    city: "Сент-Джонс, Ньюфаундленд",
    label: "(UTC-3:30) Сент-Джонс, Ньюфаундленд",
    region: "Америка",
    searchTerms: "сент-джонс ньюфаундленд st johns newfoundland",
  },
  {
    id: "America/Sao_Paulo",
    offset: -3,
    offsetLabel: "UTC-3",
    city: "Буэнос-Айрес, Сан-Паулу, Рио-де-Жанейро, Монтевидео",
    label: "(UTC-3) Буэнос-Айрес, Сан-Паулу, Рио-де-Жанейро",
    region: "Америка",
    searchTerms: "буэнос-айрес сан-паулу рио-де-жанейро монтевидео buenos aires sao paulo rio",
  },
  {
    id: "Atlantic/South_Georgia",
    offset: -2,
    offsetLabel: "UTC-2",
    city: "Южная Георгия, Фернанду-ди-Норонья",
    label: "(UTC-2) Южная Георгия, Фернанду-ди-Норонья",
    region: "Атлантика",
    searchTerms: "южная георгия фернанду south georgia noronha",
  },
  {
    id: "Atlantic/Azores",
    offset: -1,
    offsetLabel: "UTC-1",
    city: "Азорские острова, Кабо-Верде",
    label: "(UTC-1) Азорские острова, Кабо-Верде",
    region: "Атлантика",
    searchTerms: "азорские острова кабо-верде azores cape verde",
  },

  // UTC+00 to UTC+04 (Europe, Africa, Middle East)
  {
    id: "Europe/London",
    offset: 0,
    offsetLabel: "UTC+0",
    city: "Лондон, Дублин, Лиссабон, Рейкьявик, Касабланка",
    label: "(UTC+0) Лондон, Дублин, Лиссабон, Рейкьявик",
    region: "Европа",
    searchTerms: "лондон дублин лиссабон рейкьявик касабланка гринвич london dublin lisbon reykjavik gmt",
  },
  {
    id: "Europe/Paris",
    offset: 1,
    offsetLabel: "UTC+1",
    city: "Берлин, Париж, Рим, Мадрид, Варшава, Амстердам, Вена, Прага, Брюссель",
    label: "(UTC+1) Берлин, Париж, Рим, Мадрид, Варшава",
    region: "Европа",
    searchTerms: "берлин париж рим мадрид варшава амстердам вена прага брюссель berlin paris rome madrid warsaw amsterdam vienna prague",
  },
  {
    id: "Europe/Kyiv",
    offset: 2,
    offsetLabel: "UTC+2",
    city: "Киев, Афины, Бухарест, Хельсинки, Каир, Иерусалим, Бейрут, София, Таллин, Рига, Вильнюс",
    label: "(UTC+2) Киев, Афины, Каир, Иерусалим, Хельсинки",
    region: "Европа / Ближний Восток",
    searchTerms: "киев афины бухарест хельсинки каир иерусалим бейрут софия таллин рига вильнюс kyiv athens cairo jerusalem helsinki riga tallinn vilnius",
  },
  {
    id: "Europe/Moscow",
    offset: 3,
    offsetLabel: "UTC+3",
    city: "Москва, Санкт-Петербург, Стамбул, Минск, Багдад, Эр-Рияд, Доха, Найроби",
    label: "(UTC+3) Москва, Санкт-Петербург, Стамбул, Минск",
    region: "Европа / Ближний Восток",
    searchTerms: "москва санкт-петербург стамбул минск багдад эр-рияд доха найроби moscow saint petersburg istanbul minsk riyadh",
  },
  {
    id: "Asia/Tehran",
    offset: 3.5,
    offsetLabel: "UTC+3:30",
    city: "Тегеран",
    label: "(UTC+3:30) Тегеран",
    region: "Ближний Восток",
    searchTerms: "тегеран tehran iran",
  },
  {
    id: "Asia/Dubai",
    offset: 4,
    offsetLabel: "UTC+4",
    city: "Дубай, Абу-Даби, Баку, Тбилиси, Ереван, Самара, Маскат",
    label: "(UTC+4) Дубай, Баку, Тбилиси, Ереван, Самара",
    region: "Ближний Восток / Кавказ",
    searchTerms: "дубай абу-даби баку тбилиси ереван самара маскат dubai baku tbilisi yerevan samara",
  },
  {
    id: "Asia/Kabul",
    offset: 4.5,
    offsetLabel: "UTC+4:30",
    city: "Кабул",
    label: "(UTC+4:30) Кабул",
    region: "Азия",
    searchTerms: "кабул kabul afghanistan",
  },

  // UTC+05 (Central Asia & Kazakhstan default)
  {
    id: "Asia/Almaty",
    offset: 5,
    offsetLabel: "UTC+5",
    city: "Астана, Алматы, Шымкент, Актобе, Ташкент, Самарканд, Бишкек, Ашхабад, Душанбе, Екатеринбург",
    cityKk: "Астана, Алматы, Шымкент, Ақтөбе, Ташкент, Бішкек",
    label: "(UTC+5) Астана, Алматы, Ташкент, Бишкек",
    region: "Центральная Азия",
    searchTerms: "казахстан астана алматы шымкент актобе ташкент самарканд бишкек ашхабад душанбе екатеринбург мальдивы astana almaty shymkent aktobe tashkent bishkek dushanbe yekaterinburg kz",
  },
  {
    id: "Asia/Kolkata",
    offset: 5.5,
    offsetLabel: "UTC+5:30",
    city: "Нью-Дели, Мумбаи, Колката, Бангалор, Коломбо",
    label: "(UTC+5:30) Нью-Дели, Мумбаи, Коломбо",
    region: "Азия",
    searchTerms: "нью-дели мумбаи колката бангалор коломбо индия new delhi mumbai kolkata bangalore colombo india",
  },
  {
    id: "Asia/Kathmandu",
    offset: 5.75,
    offsetLabel: "UTC+5:45",
    city: "Катманду, Непал",
    label: "(UTC+5:45) Катманду, Непал",
    region: "Азия",
    searchTerms: "катманду непал kathmandu nepal",
  },

  // UTC+06 to UTC+09
  {
    id: "Asia/Omsk",
    offset: 6,
    offsetLabel: "UTC+6",
    city: "Омск, Дакка, Тхимпху",
    label: "(UTC+6) Омск, Дакка, Тхимпху",
    region: "Азия",
    searchTerms: "омск дакка тхимпху omsk dhaka thimphu",
  },
  {
    id: "Asia/Yangon",
    offset: 6.5,
    offsetLabel: "UTC+6:30",
    city: "Янгон, Мьянма",
    label: "(UTC+6:30) Янгон, Мьянма",
    region: "Азия",
    searchTerms: "янгон мьянма yangon myanmar",
  },
  {
    id: "Asia/Bangkok",
    offset: 7,
    offsetLabel: "UTC+7",
    city: "Бангкок, Джакарта, Ханой, Хошимин, Новосибирск, Красноярск",
    label: "(UTC+7) Бангкок, Джакарта, Ханой, Новосибирск",
    region: "Азия",
    searchTerms: "бангкок джакарта ханой хошимин новосибирск красноярск bangkok jakarta hanoi novosibirsk krasnoyarsk",
  },
  {
    id: "Asia/Singapore",
    offset: 8,
    offsetLabel: "UTC+8",
    city: "Сингапур, Пекин, Шанхай, Гонконг, Куала-Лумпур, Тайбэй, Манила, Перт, Иркутск, Улан-Батор",
    label: "(UTC+8) Сингапур, Пекин, Гонконг, Куала-Лумпур",
    region: "Азия",
    searchTerms: "сингапур пекин шанхай гонконг куала-лумпур тайбэй манила перт иркутск улан-батор singapore beijing shanghai hong kong kuala lumpur manila perth",
  },
  {
    id: "Australia/Eucla",
    offset: 8.75,
    offsetLabel: "UTC+8:45",
    city: "Юкла, Австралия",
    label: "(UTC+8:45) Юкла, Австралия",
    region: "Австралия",
    searchTerms: "юкла eucla australia",
  },
  {
    id: "Asia/Tokyo",
    offset: 9,
    offsetLabel: "UTC+9",
    city: "Токио, Сеул, Осака, Якутск",
    label: "(UTC+9) Токио, Сеул, Осака, Якутск",
    region: "Азия",
    searchTerms: "токио сеул осака якутск tokyo seoul osaka yakutsk japan korea",
  },
  {
    id: "Australia/Adelaide",
    offset: 9.5,
    offsetLabel: "UTC+9:30",
    city: "Аделаида, Дарвин",
    label: "(UTC+9:30) Аделаида, Дарвин",
    region: "Австралия",
    searchTerms: "аделаида дарвин adelaide darwin australia",
  },

  // UTC+10 to UTC+14
  {
    id: "Australia/Sydney",
    offset: 10,
    offsetLabel: "UTC+10",
    city: "Сидней, Мельбурн, Брисбен, Канберра, Владивосток, Порт-Морсби",
    label: "(UTC+10) Сидней, Мельбурн, Брисбен, Владивосток",
    region: "Австралия / Океания",
    searchTerms: "сидней мельбурн брисбен канберра владивосток порт-морсби sydney melbourne brisbane vladivostok",
  },
  {
    id: "Australia/Lord_Howe",
    offset: 10.5,
    offsetLabel: "UTC+10:30",
    city: "Лорд-Хау",
    label: "(UTC+10:30) Лорд-Хау",
    region: "Австралия",
    searchTerms: "лорд-хау lord howe",
  },
  {
    id: "Asia/Magadan",
    offset: 11,
    offsetLabel: "UTC+11",
    city: "Магадан, Сахалин, Соломоновы Острова, Новая Каледония",
    label: "(UTC+11) Магадан, Сахалин, Соломоновы Острова",
    region: "Азия / Океания",
    searchTerms: "магадан сахалин соломоновы острова новая каледония magadan sakhalin solomon islands",
  },
  {
    id: "Pacific/Auckland",
    offset: 12,
    offsetLabel: "UTC+12",
    city: "Окленд, Веллингтон, Фиджи, Петропавловск-Камчатский",
    label: "(UTC+12) Окленд, Веллингтон, Фиджи, Камчатка",
    region: "Океания",
    searchTerms: "окленд веллингтон фиджи петропавловск-камчатский камчатка auckland wellington fiji kamchatka",
  },
  {
    id: "Pacific/Chatham",
    offset: 12.75,
    offsetLabel: "UTC+12:45",
    city: "Чатем, Новая Зеландия",
    label: "(UTC+12:45) Чатем, Новая Зеландия",
    region: "Океания",
    searchTerms: "чатем chatham new zealand",
  },
  {
    id: "Pacific/Tongatapu",
    offset: 13,
    offsetLabel: "UTC+13",
    city: "Апиа, Самоа, Тонга",
    label: "(UTC+13) Апиа, Самоа, Тонга",
    region: "Океания",
    searchTerms: "апиа самоа тонга apia samoa tonga",
  },
  {
    id: "Pacific/Kiritimati",
    offset: 14,
    offsetLabel: "UTC+14",
    city: "Киритимати, Остров Рождества",
    label: "(UTC+14) Киритимати, Остров Рождества",
    region: "Океания",
    searchTerms: "киритимати остров рождества kiritimati line islands",
  },
];

/**
 * Finds a timezone by its IANA id, or falls back to Asia/Almaty
 */
export function getTimezoneById(id?: string | null): WorldTimezone {
  if (!id) return WORLD_TIMEZONES.find((t) => t.id === DEFAULT_TIMEZONE_ID) || WORLD_TIMEZONES[0];
  const found = WORLD_TIMEZONES.find((t) => t.id === id);
  if (found) return found;

  const normalized = id.toLowerCase();
  const aliasMatch = WORLD_TIMEZONES.find((t) =>
    t.id.toLowerCase().includes(normalized) || normalized.includes(t.id.toLowerCase())
  );
  if (aliasMatch) return aliasMatch;

  return WORLD_TIMEZONES.find((t) => t.id === DEFAULT_TIMEZONE_ID) || WORLD_TIMEZONES[0];
}

/**
 * Automatically detects the user's browser timezone
 */
export function detectBrowserTimezone(): WorldTimezone {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      const match = getTimezoneById(tz);
      if (match) return match;
    }
  } catch {
    // ignore
  }

  // Fallback: estimate from getTimezoneOffset()
  try {
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    const closest = WORLD_TIMEZONES.find((t) => Math.abs(t.offset - offsetHours) < 0.25);
    if (closest) return closest;
  } catch {
    // ignore
  }

  return getTimezoneById(DEFAULT_TIMEZONE_ID);
}

/**
 * Converts a slot date and time from the platform base timezone (UTC+5) to the user's selected timezone
 */
export function convertSlotToUserTimezone(
  dateStr: string,
  timeStr: string,
  userOffset: number,
  baseOffset: number = BASE_PLATFORM_OFFSET
): { date: string; time: string } {
  if (!timeStr) return { date: dateStr, time: "" };

  const [h = 0, m = 0] = timeStr.slice(0, 5).split(":").map(Number);
  const diffMinutes = Math.round((userOffset - baseOffset) * 60);
  if (diffMinutes === 0) {
    return { date: dateStr, time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
  }

  let totalMinutes = h * 60 + m + diffMinutes;
  let d = new Date(`${dateStr}T00:00:00Z`);

  if (totalMinutes < 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    totalMinutes += 1440;
  } else if (totalMinutes >= 1440) {
    d.setUTCDate(d.getUTCDate() + 1);
    totalMinutes -= 1440;
  }

  const newDate = d.toISOString().slice(0, 10);
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  const newTime = `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;

  return { date: newDate, time: newTime };
}

/**
 * Converts user's selected time to platform base timezone (UTC+5) for database storage
 */
export function convertUserTimeToSlotTime(
  dateStr: string,
  timeStr: string,
  userOffset: number,
  baseOffset: number = BASE_PLATFORM_OFFSET
): { date: string; time: string } {
  if (!timeStr) return { date: dateStr, time: "" };
  return convertSlotToUserTimezone(dateStr, timeStr, baseOffset, userOffset);
}

/**
 * Formats a slot's time range for display in the user's timezone
 */
export function formatSlotTimeRange(
  dateStr: string,
  startTime: string,
  endTime: string,
  userOffset: number,
  baseOffset: number = BASE_PLATFORM_OFFSET
): { date: string; timeRange: string } {
  const convertedStart = convertSlotToUserTimezone(dateStr, startTime, userOffset, baseOffset);
  const convertedEnd = convertSlotToUserTimezone(dateStr, endTime, userOffset, baseOffset);
  return {
    date: convertedStart.date,
    timeRange: `${convertedStart.time} – ${convertedEnd.time}`,
  };
}

export interface CityTimezoneItem {
  city: string;
  timezoneId: string;
  offset: number;
  offsetLabel: string;
  gmtLabel: string;
  displayLabel: string;
}

/**
 * Automatically ensures the user's timezone is detected and saved in localStorage.
 * Used on first registration or app visit.
 */
export function ensureUserTimezoneDetected(): WorldTimezone {
  if (typeof window === "undefined") {
    return getTimezoneById(DEFAULT_TIMEZONE_ID);
  }
  try {
    const saved = localStorage.getItem("app_user_timezone");
    if (saved) {
      return getTimezoneById(saved);
    }
    const detected = detectBrowserTimezone();
    localStorage.setItem("app_user_timezone", detected.id);
    const primaryCity = detected.city.split(",")[0].trim();
    localStorage.setItem("app_user_city", primaryCity);
    return detected;
  } catch {
    return getTimezoneById(DEFAULT_TIMEZONE_ID);
  }
}

/**
 * Returns a list of distinct city items with their GMT offsets.
 */
export function getAllCityTimezones(language: string = "ru"): CityTimezoneItem[] {
  const items: CityTimezoneItem[] = [];
  const seen = new Set<string>();

  for (const tz of WORLD_TIMEZONES) {
    const gmtLabel = tz.offsetLabel.replace("UTC", "GMT");
    const cityList = (language === "kk" && tz.cityKk ? `${tz.cityKk}, ${tz.city}` : tz.city)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    for (const rawCity of cityList) {
      const city = rawCity.replace(/\s*\([^)]*\)/g, "").trim();
      if (!city) continue;
      const key = `${city.toLowerCase()}_${tz.offset}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        city,
        timezoneId: tz.id,
        offset: tz.offset,
        offsetLabel: tz.offsetLabel,
        gmtLabel,
        displayLabel: `${city} (${gmtLabel})`,
      });
    }
  }

  return items;
}

/**
 * Searches cities or offsets (e.g. "Астана", "Москва", "+5", "UTC+5", "GMT+3", "3").
 */
export function searchCityTimezones(query: string, language: string = "ru"): CityTimezoneItem[] {
  const all = getAllCityTimezones(language);
  const q = query.trim().toLowerCase();

  if (!q) {
    // Kazakhstan / Central Asia (offset 5) first, then sorted by offset
    return [...all].sort((a, b) => {
      const aIsPlatform = a.offset === 5 ? 1 : 0;
      const bIsPlatform = b.offset === 5 ? 1 : 0;
      if (aIsPlatform !== bIsPlatform) return bIsPlatform - aIsPlatform;
      if (a.offset !== b.offset) return a.offset - b.offset;
      return a.city.localeCompare(b.city);
    });
  }

  const cleanQ = q.replace(/^(utc|gmt)\s*/i, "").trim();
  const isNumeric = /^[+-]?\d+(\.\d+)?$/.test(cleanQ) || /^[+-]?\d+:\d+$/.test(cleanQ);

  return all
    .filter((item) => {
      const cityMatch = item.city.toLowerCase().includes(q);
      const gmtMatch = item.gmtLabel.toLowerCase().includes(q);
      const utcMatch = item.offsetLabel.toLowerCase().includes(q);

      let numberMatch = false;
      if (isNumeric) {
        const numVal = parseFloat(cleanQ);
        numberMatch =
          item.offset === numVal ||
          String(item.offset) === cleanQ ||
          `+${item.offset}` === cleanQ ||
          item.offsetLabel.toLowerCase().includes(cleanQ);
      }

      const tz = getTimezoneById(item.timezoneId);
      const termMatch = tz?.searchTerms.toLowerCase().includes(q);

      return cityMatch || gmtMatch || utcMatch || numberMatch || Boolean(termMatch);
    })
    .sort((a, b) => {
      const aStarts = a.city.toLowerCase().startsWith(q) ? 1 : 0;
      const bStarts = b.city.toLowerCase().startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      if (a.offset !== b.offset) return a.offset - b.offset;
      return a.city.localeCompare(b.city);
    });
}
