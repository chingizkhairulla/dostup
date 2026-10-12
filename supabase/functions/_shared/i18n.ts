// Server-side language support for text the platform writes on a user's
// behalf: push notifications, emails and error messages a screen shows as-is.
//
// Edge functions cannot import from src/, so the language list is repeated
// here from src/lib/language.ts; src/test/serverI18n.test.ts fails if the two
// ever disagree. Adding a fourth language means adding it to LANGUAGES below,
// after which every Localized<…> in this file stops compiling until it has
// that language too — the same guarantee the client has.
//
// This module has no imports on purpose: it is plain TypeScript that both
// Deno (the edge functions) and vitest (the tests) can load.

export const LANGUAGES = ['ru', 'kk', 'en'] as const
export type Lang = (typeof LANGUAGES)[number]
export const DEFAULT_LANG: Lang = 'ru'

export type Localized<T> = Record<Lang, T>
export type Push = { title: string; body: string }
export type Email = { subject: string; html: string }

const LOCALE_TAG: Localized<string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }

export function isLanguage(raw: unknown): raw is Lang {
  return typeof raw === 'string' && (LANGUAGES as readonly string[]).includes(raw)
}

/** Anything unrecognised — a missing column, an old row, junk — is Russian. */
export function toLang(raw: unknown): Lang {
  return isLanguage(raw) ? raw : DEFAULT_LANG
}

/** The variant for one recipient, chosen by their stored language. */
export function localize<T>(value: Localized<T>, rawLang: unknown): T {
  return value[toLang(rawLang)]
}

/** Builds a value once per language. */
export function inEveryLanguage<T>(build: (lang: Lang) => T): Localized<T> {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, build(lang)])) as Localized<T>
}

/** "5 октября" / "5 қазан" / "5 October" — for a YYYY-MM-DD slot date. */
export function formatDayMonth(date: string | null | undefined, lang: Lang): string {
  if (!date) return ''
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(LOCALE_TAG[lang], { day: 'numeric', month: 'long' })
}

/** "5 октября 2026 г." / "5 October 2026". */
export function formatLongDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

/** "14:30:00" → "14:30". */
export function shortTime(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : ''
}

/** Russian needs three noun forms after a number: 1 материал, 2 материала, 5 материалов. */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const STUDENT: Localized<string> = { ru: 'Ученик', kk: 'Оқушы', en: 'A student' }
const PRODUCT: Localized<string> = { ru: 'продукт', kk: 'өнім', en: 'the product' }

/** A display name, or "a student" in the reader's language when there is none. */
function studentName(name: string | null | undefined, lang: Lang): string {
  return name?.trim() || STUDENT[lang]
}

/** A product title, or "the product" in the reader's language when there is none. */
function productName(title: string | null | undefined, lang: Lang): string {
  return title?.trim() || PRODUCT[lang]
}

type Slot = { product: string | null | undefined; date: string; time: string }
type Move = {
  product: string | null | undefined
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
}

// ---------------------------------------------------------------------------
// Push notifications. Each builder returns all three languages; the sender
// picks one per device from push_tokens.language, so two devices of the same
// person can each read their own.
// ---------------------------------------------------------------------------

export const push = {
  newBooking: ({ student, product, date, time }: Slot & { student: string | null | undefined }) =>
    inEveryLanguage<Push>((lang) => {
      const s = studentName(student, lang)
      const p = productName(product, lang)
      return {
        ru: { title: 'Новая запись!', body: `${s} записался на "${p}" на ${date} в ${time}` },
        kk: { title: 'Жаңа жазылу!', body: `${s} "${p}" сабағына жазылды: ${date}, ${time}` },
        en: { title: 'New booking!', body: `${s} booked "${p}" for ${date} at ${time}` },
      }[lang]
    }),

  bookingCancelled: ({ student, product, date, time, note }: Slot & {
    student: string | null | undefined
    note?: string
  }) =>
    inEveryLanguage<Push>((lang) => {
      const s = studentName(student, lang)
      const p = productName(product, lang)
      const extra = note ? `\n${note}` : ''
      return {
        ru: { title: 'Запись отменена', body: `${s} отменил запись на "${p}" на ${date} в ${time}${extra}` },
        kk: { title: 'Жазылу болдырмалды', body: `${s} "${p}" сабағына жазылуды болдырмады: ${date}, ${time}${extra}` },
        en: { title: 'Booking cancelled', body: `${s} cancelled their booking for "${p}" on ${date} at ${time}${extra}` },
      }[lang]
    }),

  lessonCancelledByStaff: ({ by, product, date, time }: Slot & { by: 'teacher' | 'creator' }) =>
    inEveryLanguage<Push>((lang) => {
      const p = productName(product, lang)
      const teacher = by === 'teacher'
      return {
        ru: {
          title: `${teacher ? 'Учитель' : 'Автор'} отменил занятие`,
          body: `Занятие "${p}" на ${date} в ${time} отменено`,
        },
        kk: {
          title: `${teacher ? 'Мұғалім' : 'Автор'} сабақты болдырмады`,
          body: `"${p}" сабағы (${date}, ${time}) болдырылмады`,
        },
        en: {
          title: `The ${teacher ? 'teacher' : 'author'} cancelled the lesson`,
          body: `The lesson "${p}" on ${date} at ${time} has been cancelled`,
        },
      }[lang]
    }),

  newPayment: ({ student, product, amount }: {
    student: string | null | undefined
    product: string | null | undefined
    amount: number
  }) =>
    inEveryLanguage<Push>((lang) => {
      const s = studentName(student, lang)
      const p = productName(product, lang)
      return {
        ru: { title: 'Новая оплата!', body: `${s} оплатил "${p}" (${amount}₸)` },
        kk: { title: 'Жаңа төлем!', body: `${s} "${p}" үшін төледі (${amount}₸)` },
        en: { title: 'New payment!', body: `${s} paid for "${p}" (${amount}₸)` },
      }[lang]
    }),

  paymentConfirmed: ({ product }: { product: string | null | undefined }) =>
    inEveryLanguage<Push>((lang) => {
      const p = productName(product, lang)
      return {
        ru: {
          title: 'Оплата подтверждена!',
          body: `Ваша оплата за "${p}" подтверждена. Теперь вы можете записаться на занятия.`,
        },
        kk: {
          title: 'Төлем расталды!',
          body: `"${p}" үшін төлеміңіз расталды. Енді сабақтарға жазыла аласыз.`,
        },
        en: {
          title: 'Payment confirmed!',
          body: `Your payment for "${p}" is confirmed. You can now book lessons.`,
        },
      }[lang]
    }),

  lessonRescheduled: ({ product, oldDate, oldTime, newDate, newTime, reason }: Move & { reason?: string }) =>
    inEveryLanguage<Push>((lang) => {
      const p = productName(product, lang)
      return {
        ru: {
          title: 'Урок перенесён',
          body: `Урок "${p}" перенесён с ${oldDate} ${oldTime} на ${newDate} ${newTime}${reason ? `. Причина: ${reason}` : ''}`,
        },
        kk: {
          title: 'Сабақ ауыстырылды',
          body: `"${p}" сабағы ${oldDate} ${oldTime} уақытынан ${newDate} ${newTime} уақытына ауыстырылды${reason ? `. Себебі: ${reason}` : ''}`,
        },
        en: {
          title: 'Lesson rescheduled',
          body: `The lesson "${p}" has moved from ${oldDate} ${oldTime} to ${newDate} ${newTime}${reason ? `. Reason: ${reason}` : ''}`,
        },
      }[lang]
    }),

  rescheduleRequestFromStudent: ({ student, product, oldDate, oldTime, newDate, newTime }: Move & {
    student: string | null | undefined
  }) =>
    inEveryLanguage<Push>((lang) => {
      const s = studentName(student, lang)
      const p = productName(product, lang)
      return {
        ru: {
          title: 'Запрос на перенос',
          body: `${s} просит перенести "${p}" с ${oldDate} ${oldTime} на ${newDate} ${newTime}`,
        },
        kk: {
          title: 'Ауыстыру сұрауы',
          body: `${s} "${p}" сабағын ${oldDate} ${oldTime} уақытынан ${newDate} ${newTime} уақытына ауыстыруды сұрайды`,
        },
        en: {
          title: 'Reschedule request',
          body: `${s} asks to move "${p}" from ${oldDate} ${oldTime} to ${newDate} ${newTime}`,
        },
      }[lang]
    }),

  rescheduleRequestFromTeacher: ({ product, oldDate, oldTime, newDate, newTime }: Move) =>
    inEveryLanguage<Push>((lang) => {
      const p = productName(product, lang)
      return {
        ru: {
          title: 'Запрос на перенос от преподавателя',
          body: `Преподаватель просит перенести "${p}" с ${oldDate} ${oldTime} на ${newDate} ${newTime}`,
        },
        kk: {
          title: 'Оқытушыдан ауыстыру сұрауы',
          body: `Оқытушы "${p}" сабағын ${oldDate} ${oldTime} уақытынан ${newDate} ${newTime} уақытына ауыстыруды сұрайды`,
        },
        en: {
          title: 'Reschedule request from your teacher',
          body: `Your teacher asks to move "${p}" from ${oldDate} ${oldTime} to ${newDate} ${newTime}`,
        },
      }[lang]
    }),

  /** The student's own request was answered by the teacher/author. */
  rescheduleAnswered: ({ approved, product, newDate, newTime, comment }: {
    approved: boolean
    product: string | null | undefined
    newDate: string
    newTime: string
    comment?: string
  }) =>
    inEveryLanguage<Push>((lang) => {
      const p = productName(product, lang)
      const extra = comment ? `. ${comment}` : ''
      return {
        ru: approved
          ? { title: 'Перенос подтверждён ✅', body: `Урок "${p}" перенесён на ${newDate} ${newTime}${extra}` }
          : { title: 'Перенос отклонён ❌', body: `Запрос на перенос "${p}" отклонён${extra}` },
        kk: approved
          ? { title: 'Ауыстыру расталды ✅', body: `"${p}" сабағы ${newDate} ${newTime} уақытына ауыстырылды${extra}` }
          : { title: 'Ауыстыру қабылданбады ❌', body: `"${p}" сабағын ауыстыру сұрауы қабылданбады${extra}` },
        en: approved
          ? { title: 'Reschedule confirmed ✅', body: `The lesson "${p}" has moved to ${newDate} ${newTime}${extra}` }
          : { title: 'Reschedule declined ❌', body: `Your request to move "${p}" was declined${extra}` },
      }[lang]
    }),

  /** The teacher's/author's request was answered by the student. */
  rescheduleAnsweredByStudent: ({ approved, student, product, newDate, newTime, comment }: {
    approved: boolean
    student: string | null | undefined
    product: string | null | undefined
    newDate: string
    newTime: string
    comment?: string
  }) =>
    inEveryLanguage<Push>((lang) => {
      const s = studentName(student, lang)
      const p = productName(product, lang)
      const extra = comment ? `. ${comment}` : ''
      return {
        ru: approved
          ? { title: 'Перенос подтверждён учеником ✅', body: `${s} подтвердил перенос "${p}" на ${newDate} ${newTime}${extra}` }
          : { title: 'Перенос отклонён учеником ❌', body: `${s} отклонил запрос на перенос "${p}"${extra}` },
        kk: approved
          ? { title: 'Оқушы ауыстыруды растады ✅', body: `${s} "${p}" сабағын ${newDate} ${newTime} уақытына ауыстыруды растады${extra}` }
          : { title: 'Оқушы ауыстыруды қабылдамады ❌', body: `${s} "${p}" сабағын ауыстыру сұрауын қабылдамады${extra}` },
        en: approved
          ? { title: 'Student confirmed the reschedule ✅', body: `${s} confirmed moving "${p}" to ${newDate} ${newTime}${extra}` }
          : { title: 'Student declined the reschedule ❌', body: `${s} declined the request to move "${p}"${extra}` },
      }[lang]
    }),

  materialsUnlocked: ({ product, titles }: { product: string | null | undefined; titles: string[] }) =>
    inEveryLanguage<Push>((lang) => {
      const p = productName(product, lang)
      const n = titles.length
      if (n === 1) {
        return {
          ru: { title: 'Новый материал доступен! 📚', body: `Материал "${titles[0]}" теперь доступен в "${p}"` },
          kk: { title: 'Жаңа материал қолжетімді! 📚', body: `"${titles[0]}" материалы енді "${p}" ішінде қолжетімді` },
          en: { title: 'New material available! 📚', body: `"${titles[0]}" is now available in "${p}"` },
        }[lang]
      }
      return {
        ru: {
          title: 'Новый материал доступен! 📚',
          body: `${n} ${ruPlural(n, 'новый материал доступен', 'новых материала доступны', 'новых материалов доступны')} в "${p}"`,
        },
        kk: { title: 'Жаңа материал қолжетімді! 📚', body: `"${p}" ішінде ${n} жаңа материал қолжетімді` },
        en: { title: 'New material available! 📚', body: `${n} new materials are available in "${p}"` },
      }[lang]
    }),

  /**
   * Lesson reminders. `staff` is the teacher/author, who teach a "урок";
   * the student attends a "занятие" — the Russian wording already drew that line.
   */
  reminder: ({ kind, staff, product, date, time }: {
    kind: '24h' | '2h'
    staff: boolean
    product: string | null | undefined
    date: string | null
    time: string | null
  }) =>
    inEveryLanguage<Push>((lang) => {
      const p = productName(product, lang)
      const day = formatDayMonth(date, lang)
      const at = shortTime(time)
      if (kind === '24h') {
        return {
          ru: { title: staff ? 'Завтра урок!' : 'Завтра занятие!', body: `"${p}" состоится ${day} в ${at}` },
          kk: { title: 'Ертең сабақ бар!', body: `"${p}" ${day}, ${at} уақытында өтеді` },
          en: { title: 'Lesson tomorrow!', body: `"${p}" is on ${day} at ${at}` },
        }[lang]
      }
      return {
        ru: {
          title: staff ? 'Скоро урок!' : 'Скоро занятие!',
          body: staff ? `"${p}" через 2 часа` : `"${p}" начнётся через 2 часа`,
        },
        kk: { title: 'Сабақ жақында!', body: `"${p}" 2 сағаттан кейін басталады` },
        en: { title: 'Lesson soon!', body: `"${p}" starts in 2 hours` },
      }[lang]
    }),

  subscriptionRenewal: ({ product, periodEnd }: { product: string; periodEnd: string }) =>
    inEveryLanguage<Push>((lang) => {
      const end = formatLongDate(periodEnd, lang)
      return {
        ru: { title: 'Скоро продление подписки', body: `${product}: оплатите следующий период до ${end}` },
        kk: { title: 'Жазылымды жақында ұзарту керек', body: `${product}: келесі кезеңді ${end} дейін төлеңіз` },
        en: { title: 'Subscription renewal coming up', body: `${product}: pay for the next period by ${end}` },
      }[lang]
    }),
}

// ---------------------------------------------------------------------------
// Emails. One language per message: the recipient's (profiles.language), or
// for the login code, the language the person was using when they asked.
// ---------------------------------------------------------------------------

/** User-supplied text going into HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const email = {
  loginCode: (otp: string, lang: Lang): Email => {
    const code = `<p style="font-size:28px;letter-spacing:8px;font-weight:700">${otp}</p>`
    return {
      ru: {
        subject: `${otp} — код входа`,
        html: `<p>Ваш код для входа:</p>${code}<p>Код действует несколько минут. Если вы не запрашивали вход, просто игнорируйте письмо.</p>`,
      },
      kk: {
        subject: `${otp} — кіру коды`,
        html: `<p>Кіру кодыңыз:</p>${code}<p>Код бірнеше минут жарамды. Егер кіруді сұрамаған болсаңыз, бұл хатты елемеңіз.</p>`,
      },
      en: {
        subject: `${otp} — your sign-in code`,
        html: `<p>Your sign-in code:</p>${code}<p>The code is valid for a few minutes. If you did not try to sign in, just ignore this email.</p>`,
      },
    }[lang]
  },

  subscriptionRenewal: (
    { product, periodEnd, paymentUrl }: { product: string; periodEnd: string; paymentUrl: string },
    lang: Lang,
  ): Email => {
    const p = escapeHtml(product)
    const end = formatLongDate(periodEnd, lang)
    const link = `<p><a href="${paymentUrl}">${paymentUrl}</a></p>`
    const subject = push.subscriptionRenewal({ product, periodEnd })[lang].title
    return {
      ru: {
        subject,
        html: `<p>Здравствуйте!</p><p>Подписка на «${p}» заканчивается ${end}.</p><p>Оплатите следующий период, чтобы сохранить доступ:</p>${link}<p>Доступ продолжается, пока вы оплачиваете подписку.</p>`,
      },
      kk: {
        subject,
        html: `<p>Сәлеметсіз бе!</p><p>«${p}» жазылымы ${end} аяқталады.</p><p>Қол жеткізуді сақтау үшін келесі кезеңді төлеңіз:</p>${link}<p>Төлемді жалғастырсаңыз, қол жеткізу сақталады.</p>`,
      },
      en: {
        subject,
        html: `<p>Hello!</p><p>Your subscription to “${p}” ends on ${end}.</p><p>Pay for the next period to keep your access:</p>${link}<p>Access continues for as long as you keep paying for the subscription.</p>`,
      },
    }[lang]
  },
}

// ---------------------------------------------------------------------------
// Errors a screen shows as-is. Keyed by the code the function already returns,
// so the client can keep branching on the code while the reader gets words in
// their own language.
// ---------------------------------------------------------------------------

export const receiptErrors = {
  UNAUTHORIZED: {
    ru: 'Войдите в аккаунт, чтобы загрузить чек.',
    kk: 'Чекті жүктеу үшін аккаунтқа кіріңіз.',
    en: 'Sign in to upload a receipt.',
  },
  PURCHASE_NOT_FOUND: {
    ru: 'Заказ не найден.',
    kk: 'Тапсырыс табылмады.',
    en: 'Order not found.',
  },
  FORBIDDEN: {
    ru: 'Этот заказ принадлежит другому пользователю.',
    kk: 'Бұл тапсырыс басқа пайдаланушыға тиесілі.',
    en: 'This order belongs to another user.',
  },
  PURCHASE_NOT_PENDING: {
    ru: 'Этот заказ уже нельзя подтвердить чеком.',
    kk: 'Бұл тапсырысты енді чекпен растау мүмкін емес.',
    en: 'This order can no longer be confirmed with a receipt.',
  },
  UNSUPPORTED_TYPE: {
    ru: 'Нужен файл JPG, PNG, WEBP или PDF.',
    kk: 'JPG, PNG, WEBP немесе PDF файлы қажет.',
    en: 'Please use a JPG, PNG, WEBP or PDF file.',
  },
  EMPTY_FILE: {
    ru: 'Файл пустой. Выберите другой чек.',
    kk: 'Файл бос. Басқа чек таңдаңыз.',
    en: 'The file is empty. Choose another receipt.',
  },
  FILE_TOO_LARGE: {
    ru: 'Файл слишком большой (макс. 4 МБ).',
    kk: 'Файл тым үлкен (ең көбі 4 МБ).',
    en: 'The file is too large (max 4 MB).',
  },
  STORAGE_UPLOAD_FAILED: {
    ru: 'Не удалось сохранить файл чека. Попробуйте ещё раз.',
    kk: 'Чек файлын сақтау мүмкін болмады. Қайта көріңіз.',
    en: 'Could not save the receipt file. Please try again.',
  },
  DB_BAD_TEXT: {
    ru: 'Не удалось сохранить данные чека. Попробуйте другое фото.',
    kk: 'Чек деректерін сақтау мүмкін болмады. Басқа фото жүктеп көріңіз.',
    en: 'Could not save the receipt details. Try another photo.',
  },
  DB_SAVE_FAILED: {
    ru: 'Не удалось сохранить запись о чеке. Попробуйте ещё раз.',
    kk: 'Чек туралы жазбаны сақтау мүмкін болмады. Қайта көріңіз.',
    en: 'Could not save the receipt record. Please try again.',
  },
  INTERNAL_ERROR: {
    ru: 'Не удалось обработать чек. Попробуйте ещё раз.',
    kk: 'Чекті өңдеу мүмкін болмады. Қайта көріңіз.',
    en: 'Could not process the receipt. Please try again.',
  },
  MULTIPART_PARSE_FAILED: {
    ru: 'Не удалось прочитать файл. Попробуйте другой формат.',
    kk: 'Файлды оқу мүмкін болмады. Басқа форматты қолданып көріңіз.',
    en: 'Could not read the file. Try a different format.',
  },
  MISSING_FILE: {
    ru: 'Файл не выбран.',
    kk: 'Файл таңдалмады.',
    en: 'No file selected.',
  },
  UNSUPPORTED_CONTENT_TYPE: {
    ru: 'Нужно отправить файл как multipart/form-data.',
    kk: 'Файлды multipart/form-data ретінде жіберу керек.',
    en: 'The file must be sent as multipart/form-data.',
  },
  MISSING_SESSION: {
    ru: 'Войдите в аккаунт, чтобы загрузить чек.',
    kk: 'Чекті жүктеу үшін аккаунтқа кіріңіз.',
    en: 'Sign in to upload a receipt.',
  },
  MISSING_PURCHASE: {
    ru: 'Не указан заказ.',
    kk: 'Тапсырыс көрсетілмеген.',
    en: 'No order specified.',
  },
} satisfies Record<string, Localized<string>>

export type ReceiptErrorKey = keyof typeof receiptErrors
