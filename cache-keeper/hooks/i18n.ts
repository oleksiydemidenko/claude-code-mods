// Languages: which one to speak, guessed from the person's own words when the
// mod's `language` option is left on `auto`, and how numbers and times read.
// The same file ships with each mod of this repository.

export const LANGS = ['en', 'ru', 'uk', 'be', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'zh', 'ko'] as const
export type Lang = (typeof LANGS)[number]

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/** `ru_RU.UTF-8`, `pt-BR`, `zh_CN` and the like: the language part, if it is one of ours. */
export function fromLocale(value: string | undefined): Lang | undefined {
  if (value === undefined || value === '') return undefined
  const code = value.toLowerCase().split(/[-_.@]/)[0]
  return isLang(code) ? code : undefined
}

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length
}

/**
 * The language a piece of the person's text is written in, or undefined when
 * it is too short to tell. Scripts decide first; Latin text by its letters and
 * most common small words.
 */
export function detectLang(text: string): Lang | undefined {
  const t = text.toLowerCase()
  const letters = t.replace(/[^\p{L}]/gu, '')
  if (letters.length < 8) return undefined
  if (/[぀-ヿ]/.test(t)) return 'ja'
  if (/[가-힯]/.test(t)) return 'ko'
  if (count(t, /[一-鿿]/g) >= 3) return 'zh'

  const cyrillic = count(letters, /[Ѐ-ӿ]/g)
  const latin = count(letters, /[a-zÀ-ɏ]/g)
  if (cyrillic > latin) {
    if (/ў/.test(t)) return 'be'
    if (/[їєґ]/.test(t)) return 'uk'
    if (/і/.test(t)) return /[ыэё]/.test(t) ? 'be' : 'uk'
    return 'ru'
  }
  if (latin === 0) return undefined

  const words = ` ${t.replace(/[^\p{L}]+/gu, ' ')} `
  const score = (letterRe: RegExp, list: string[]): number =>
    count(t, letterRe) * 2 + list.reduce((n, w) => n + count(words, new RegExp(` ${w} `, 'g')), 0)
  const scores: [Lang, number][] = [
    ['en', score(/(?!)/g, ['the', 'and', 'is', 'to', 'of', 'you', 'it', 'this', 'that', 'what', 'with', 'for'])],
    ['pl', score(/[ąęłńśźż]/g, ['jest', 'nie', 'się', 'że', 'to', 'na', 'co', 'jak', 'czy'])],
    ['de', score(/[äöüß]/g, ['und', 'ich', 'nicht', 'ist', 'das', 'die', 'der', 'mit', 'ein', 'wie'])],
    ['fr', score(/[éèêàçœù]/g, ['le', 'la', 'les', 'est', 'et', 'je', 'pas', 'une', 'des', 'pour', 'que'])],
    ['es', score(/[ñ¿¡]/g, ['el', 'los', 'las', 'es', 'y', 'que', 'por', 'para', 'una', 'con', 'cómo', 'qué'])],
    ['it', score(/(?!)/g, ['il', 'gli', 'che', 'è', 'non', 'per', 'una', 'sono', 'come', 'della', 'questo'])],
    ['pt', score(/[ãõ]/g, ['o', 'os', 'não', 'que', 'para', 'uma', 'com', 'você', 'está', 'isso', 'como'])],
  ]
  scores.sort((a, b) => b[1] - a[1])
  return scores[0][1] > 0 ? scores[0][0] : 'en'
}

// ---- Times and numbers ----

type Units = { h: string; min: string; s: string; join: '' | ' ' | 'ko' }

const UNITS: Record<Lang, Units> = {
  en: { h: 'h', min: 'min', s: 's', join: ' ' },
  ru: { h: 'ч', min: 'мин', s: 'с', join: ' ' },
  uk: { h: 'год', min: 'хв', s: 'с', join: ' ' },
  be: { h: 'гадз', min: 'хв', s: 'с', join: ' ' },
  pl: { h: 'godz.', min: 'min', s: 's', join: ' ' },
  de: { h: 'Std.', min: 'Min.', s: 's', join: ' ' },
  fr: { h: 'h', min: 'min', s: 's', join: ' ' },
  es: { h: 'h', min: 'min', s: 's', join: ' ' },
  it: { h: 'h', min: 'min', s: 's', join: ' ' },
  pt: { h: 'h', min: 'min', s: 's', join: ' ' },
  ja: { h: '時間', min: '分', s: '秒', join: '' },
  zh: { h: '小时', min: '分钟', s: '秒', join: '' },
  ko: { h: '시간', min: '분', s: '초', join: 'ko' },
}

function part(lang: Lang, n: number, unit: string): string {
  return UNITS[lang].join === ' ' ? `${n} ${unit}` : `${n}${unit}`
}

function joinParts(lang: Lang, parts: string[]): string {
  return parts.join(UNITS[lang].join === '' ? '' : ' ')
}

/** Hours and minutes: "5 h 35 min", "5 ч 35 мин", "5時間35分". */
export function hm(lang: Lang, ms: number): string {
  const u = UNITS[lang]
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return part(lang, m, u.min)
  return m === 0 ? part(lang, h, u.h) : joinParts(lang, [part(lang, h, u.h), part(lang, m, u.min)])
}

/** Like hm, with seconds under an hour: "12 s", "3 min 5 s", "1 h 12 min". */
export function hms(lang: Lang, ms: number): string {
  const u = UNITS[lang]
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return part(lang, s, u.s)
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 === 0 ? part(lang, m, u.min) : joinParts(lang, [part(lang, m, u.min), part(lang, s % 60, u.s)])
  return hm(lang, ms)
}

const THOUSANDS: Record<Lang, (n: number) => string> = {
  en: n => `${n}k`,
  ru: n => `${n} тыс.`,
  uk: n => `${n} тис.`,
  be: n => `${n} тыс.`,
  pl: n => `${n} tys.`,
  de: n => `${n} Tsd.`,
  fr: n => `${n} k`,
  es: n => `${n} mil`,
  it: n => `${n} mila`,
  pt: n => `${n} mil`,
  ja: n => `${n}K`,
  zh: n => `${n}K`,
  ko: n => `${n}K`,
}

/** Tokens in thousands: "120k", "120 тыс.". */
export function thousands(lang: Lang, tokens: number): string {
  return THOUSANDS[lang](Math.round(tokens / 1000))
}

/** A rough width of text in CSS pixels at a font size, wide scripts counted wide. */
export function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    w += ch === ' ' ? size * 0.3 : ch === '.' || ch === '·' ? size * 0.33 : c >= 0x2e80 ? size * 1.02 : size * 0.6
  }
  return w
}
