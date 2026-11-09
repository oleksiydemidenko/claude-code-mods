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

/**
 * Character widths of 'Segoe UI' (the font the pictures ask for), measured in a
 * browser, in hundredths of an em rounded up: [character, semibold, regular].
 */
const WIDTH_TABLE: readonly (readonly [string, number, number])[] = [
  [' ', 28, 28], ['!', 31, 29], ['"', 44, 40], ['#', 60, 60], ['$', 56, 54], ['%', 85, 82],
  ['&', 72, 81], ["'", 26, 23], ['(', 34, 31], [')', 34, 31], ['*', 44, 42], ['+', 70, 69],
  [',', 25, 22], ['-', 41, 40], ['.', 25, 22], ['/', 42, 39], ['0', 56, 54], ['1', 41, 54],
  ['2', 56, 54], ['3', 56, 54], ['4', 58, 54], ['5', 56, 54], ['6', 56, 54], ['7', 54, 54],
  ['8', 56, 54], ['9', 56, 54], [':', 25, 22], [';', 25, 22], ['<', 70, 69], ['=', 70, 69],
  ['>', 70, 69], ['?', 45, 45], ['@', 96, 96], ['A', 68, 65], ['B', 61, 58], ['C', 63, 62],
  ['D', 72, 71], ['E', 52, 51], ['F', 51, 49], ['G', 70, 69], ['H', 74, 71], ['I', 30, 27],
  ['J', 40, 36], ['K', 62, 59], ['L', 49, 48], ['M', 93, 90], ['N', 77, 75], ['O', 76, 76],
  ['P', 59, 57], ['Q', 76, 76], ['R', 63, 60], ['S', 55, 54], ['T', 56, 53], ['U', 71, 69],
  ['V', 65, 63], ['W', 97, 94], ['X', 62, 59], ['Y', 58, 56], ['Z', 59, 58], ['[', 34, 31],
  ['\\', 41, 38], [']', 34, 31], ['^', 70, 69], ['_', 42, 42], ['`', 29, 27], ['a', 53, 51],
  ['b', 61, 59], ['c', 48, 47], ['d', 61, 59], ['e', 54, 53], ['f', 35, 32], ['g', 61, 59],
  ['h', 59, 57], ['i', 27, 25], ['j', 27, 25], ['k', 53, 50], ['l', 27, 25], ['m', 89, 87],
  ['n', 59, 57], ['o', 60, 59], ['p', 61, 59], ['q', 61, 59], ['r', 38, 35], ['s', 44, 43],
  ['t', 37, 34], ['u', 59, 57], ['v', 51, 48], ['w', 76, 73], ['x', 51, 46], ['y', 51, 49],
  ['z', 47, 46], ['{', 34, 31], ['|', 28, 24], ['}', 34, 31], ['~', 70, 69], ['À', 68, 65],
  ['Á', 68, 65], ['Â', 68, 65], ['Ã', 68, 65], ['Ä', 68, 65], ['Å', 68, 65], ['Æ', 90, 87],
  ['Ç', 63, 62], ['È', 52, 51], ['É', 52, 51], ['Ê', 52, 51], ['Ë', 52, 51], ['Ì', 30, 27],
  ['Í', 30, 27], ['Î', 30, 27], ['Ï', 30, 27], ['Ð', 72, 71], ['Ñ', 77, 75], ['Ò', 76, 76],
  ['Ó', 76, 76], ['Ô', 76, 76], ['Õ', 76, 76], ['Ö', 76, 76], ['×', 70, 69], ['Ø', 76, 76],
  ['Ù', 71, 69], ['Ú', 71, 69], ['Û', 71, 69], ['Ü', 71, 69], ['Ý', 58, 56], ['Þ', 59, 57],
  ['ß', 59, 55], ['à', 53, 51], ['á', 53, 51], ['â', 53, 51], ['ã', 53, 51], ['ä', 53, 51],
  ['å', 53, 51], ['æ', 84, 84], ['ç', 48, 47], ['è', 54, 53], ['é', 54, 53], ['ê', 54, 53],
  ['ë', 54, 53], ['ì', 27, 25], ['í', 27, 25], ['î', 27, 25], ['ï', 27, 25], ['ð', 58, 56],
  ['ñ', 59, 57], ['ò', 60, 59], ['ó', 60, 59], ['ô', 60, 59], ['õ', 60, 59], ['ö', 60, 59],
  ['÷', 70, 69], ['ø', 60, 59], ['ù', 59, 57], ['ú', 59, 57], ['û', 59, 57], ['ü', 59, 57],
  ['ý', 51, 49], ['þ', 61, 59], ['ÿ', 51, 49], ['Ā', 68, 65], ['ā', 53, 51], ['Ă', 68, 65],
  ['ă', 53, 51], ['Ą', 68, 65], ['ą', 53, 51], ['Ć', 63, 62], ['ć', 48, 47], ['Ĉ', 63, 62],
  ['ĉ', 48, 47], ['Ċ', 63, 62], ['ċ', 48, 47], ['Č', 63, 62], ['č', 48, 47], ['Ď', 72, 71],
  ['ď', 71, 68], ['Đ', 72, 71], ['đ', 61, 59], ['Ē', 52, 51], ['ē', 54, 53], ['Ĕ', 52, 51],
  ['ĕ', 54, 53], ['Ė', 52, 51], ['ė', 54, 53], ['Ę', 52, 51], ['ę', 54, 53], ['Ě', 52, 51],
  ['ě', 54, 53], ['Ĝ', 70, 69], ['ĝ', 61, 59], ['Ğ', 70, 69], ['ğ', 61, 59], ['Ġ', 70, 69],
  ['ġ', 61, 59], ['Ģ', 70, 69], ['ģ', 61, 59], ['Ĥ', 74, 71], ['ĥ', 59, 57], ['Ħ', 74, 71],
  ['ħ', 59, 57], ['Ĩ', 30, 27], ['ĩ', 27, 25], ['Ī', 30, 27], ['ī', 27, 25], ['Ĭ', 30, 27],
  ['ĭ', 27, 25], ['Į', 30, 27], ['į', 27, 25], ['İ', 30, 27], ['ı', 27, 25], ['Ĳ', 69, 63],
  ['ĳ', 55, 50], ['Ĵ', 40, 36], ['ĵ', 27, 25], ['Ķ', 62, 59], ['ķ', 53, 50], ['ĸ', 53, 50],
  ['Ĺ', 49, 48], ['ĺ', 27, 25], ['Ļ', 49, 48], ['ļ', 27, 25], ['Ľ', 49, 48], ['ľ', 34, 31],
  ['Ŀ', 49, 48], ['ŀ', 37, 32], ['Ł', 49, 48], ['ł', 30, 28], ['Ń', 77, 75], ['ń', 59, 57],
  ['Ņ', 77, 75], ['ņ', 59, 57], ['Ň', 77, 75], ['ň', 59, 57], ['ŉ', 61, 61], ['Ŋ', 77, 75],
  ['ŋ', 59, 57], ['Ō', 76, 76], ['ō', 60, 59], ['Ŏ', 76, 76], ['ŏ', 60, 59], ['Ő', 76, 76],
  ['ő', 60, 59], ['Œ', 94, 94], ['œ', 93, 93], ['Ŕ', 63, 60], ['ŕ', 38, 35], ['Ŗ', 63, 60],
  ['ŗ', 38, 35], ['Ř', 63, 60], ['ř', 38, 35], ['Ś', 55, 54], ['ś', 44, 43], ['Ŝ', 55, 54],
  ['ŝ', 44, 43], ['Ş', 55, 54], ['ş', 44, 43], ['Š', 55, 54], ['š', 44, 43], ['Ţ', 56, 53],
  ['ţ', 37, 34], ['Ť', 56, 53], ['ť', 42, 44], ['Ŧ', 56, 53], ['ŧ', 37, 34], ['Ũ', 71, 69],
  ['ũ', 59, 57], ['Ū', 71, 69], ['ū', 59, 57], ['Ŭ', 71, 69], ['ŭ', 59, 57], ['Ů', 71, 69],
  ['ů', 59, 57], ['Ű', 71, 69], ['ű', 59, 57], ['Ų', 71, 69], ['ų', 59, 57], ['Ŵ', 97, 94],
  ['ŵ', 76, 73], ['Ŷ', 58, 56], ['ŷ', 51, 49], ['Ÿ', 58, 56], ['Ź', 59, 58], ['ź', 47, 46],
  ['Ż', 59, 58], ['ż', 47, 46], ['Ž', 59, 58], ['ž', 47, 46], ['ſ', 27, 25], ['Ѐ', 52, 51],
  ['Ё', 52, 51], ['Ђ', 73, 71], ['Ѓ', 49, 48], ['Є', 63, 62], ['Ѕ', 55, 54], ['І', 30, 27],
  ['Ї', 30, 27], ['Ј', 40, 36], ['Љ', 101, 99], ['Њ', 102, 99], ['Ћ', 76, 73], ['Ќ', 62, 59],
  ['Ѝ', 77, 75], ['Ў', 59, 57], ['Џ', 74, 71], ['А', 68, 65], ['Б', 61, 58], ['В', 61, 58],
  ['Г', 49, 48], ['Д', 73, 70], ['Е', 52, 51], ['Ж', 93, 87], ['З', 55, 55], ['И', 77, 75],
  ['Й', 77, 75], ['К', 62, 59], ['Л', 70, 68], ['М', 93, 90], ['Н', 74, 71], ['О', 76, 76],
  ['П', 74, 72], ['Р', 59, 57], ['С', 63, 62], ['Т', 56, 53], ['У', 59, 57], ['Ф', 78, 73],
  ['Х', 62, 59], ['Ц', 78, 75], ['Ч', 70, 67], ['Ш', 98, 95], ['Щ', 102, 98], ['Ъ', 73, 71],
  ['Ы', 84, 79], ['Ь', 60, 58], ['Э', 62, 62], ['Ю', 104, 102], ['Я', 62, 60], ['а', 53, 51],
  ['б', 60, 58], ['в', 56, 53], ['г', 40, 39], ['д', 58, 55], ['е', 54, 53], ['ж', 80, 75],
  ['з', 47, 45], ['и', 61, 59], ['й', 61, 59], ['к', 53, 50], ['л', 57, 53], ['м', 74, 71],
  ['н', 60, 58], ['о', 60, 59], ['п', 60, 58], ['р', 61, 59], ['с', 48, 47], ['т', 44, 42],
  ['у', 51, 49], ['ф', 73, 69], ['х', 51, 46], ['ц', 63, 61], ['ч', 59, 57], ['ш', 83, 80],
  ['щ', 86, 83], ['ъ', 62, 60], ['ы', 76, 71], ['ь', 53, 51], ['э', 47, 47], ['ю', 85, 82],
  ['я', 54, 51], ['ѐ', 54, 53], ['ё', 54, 53], ['ђ', 60, 58], ['ѓ', 40, 39], ['є', 48, 47],
  ['ѕ', 44, 43], ['і', 27, 25], ['ї', 27, 25], ['ј', 27, 25], ['љ', 83, 80], ['њ', 84, 81],
  ['ћ', 59, 57], ['ќ', 53, 50], ['ѝ', 61, 59], ['ў', 51, 49], ['џ', 60, 58], ['Ґ', 50, 47],
  ['ґ', 42, 40], ['Ў', 59, 57], ['ў', 51, 49], ['·', 25, 22], ['…', 82, 74], ['–', 50, 50],
  ['—', 100, 100], ['«', 54, 51], ['»', 54, 51], ['„', 43, 38], ['“', 43, 38], ['”', 43, 38],
  ['’', 26, 23], ['‘', 26, 23],
]

const WIDTHS = new Map<string, [number, number]>(
  WIDTH_TABLE.map(([ch, semi, regular]): [string, [number, number]] => [ch, [semi / 100, regular / 100]]),
)

/**
 * The width of text in CSS pixels at a font size and weight: from the measured
 * table, wide scripts at one em, anything else at a generous 0.62 em; with a
 * little room for systems that draw it in another font.
 */
export function textWidth(text: string, size: number, weight = 400): number {
  let w = 0
  for (const ch of text) {
    const known = WIDTHS.get(ch)
    if (known !== undefined) {
      w += known[weight >= 600 ? 0 : 1] * size
      continue
    }
    w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? size * 1.02 : size * 0.62
  }
  return w * 1.03 + 1
}
