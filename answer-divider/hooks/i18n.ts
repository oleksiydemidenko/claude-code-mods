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
 * browser, in hundredths of an em rounded up: two base-36 digits per character,
 * semibold and regular, for the characters WIDTH_CHARS lists in order.
 */
const WIDTH_SEMI =
  '0s0v181o1k2d200q0y0y181y0p150p161k151k1k1m1k1k1i1k1k0p0p1y1y1y192o1w1p1r201g1f1y220u141q1d2l25241n241r1j1k1z1t2p1q1m1n0y150y1y160t1h1p1c1p1i0z1p1n0r0r1h0r2h1n1o1p1p1218111n1f241f1f1b0y0s0y1y1w1w1w1w1w1w2i1r1g1g1g1g0u0u0u0u202524242424241y241z1z1z1z1m1n1n1h1h1h1h1h1h2c1c1i1i1i1i0r0r0r0r1m1n1o1o1o1o1o1y1o1n1n1n1n1f1p1f1w1h1w1h1w1h1r1c1r1c1r1c1r1c201z201p1g1i1g1i1g1i1g1i1g1i1y1p1y1p1y1p1y1p221n221n0u0r0u0r0u0r0u0r0u0r1x1j140r1q1h1h1d0r1d0r1d0y1d111d0u251n251n251n1p251n241o241o241o2m2l1r121r121r121j181j181j181j181k111k161k111z1n1z1n1z1n1z1n1z1n1z1n2p241m1f1m1n1b1n1b1n1b0r1g1g211d1r1j0u0u142t2u241q251n221w1p1p1d211g2l1j25251q1y2l2224221n1r1k1n261q261y2q2u212c1o1q2w1q1h1o1k141m1i281b1p1p1h1l221o1o1o1p1c181f211f1r1n2b2e1q241h1b2d1i1i1i1o141c180r0r0r2b2c1n1h1p1f1o1e161n1f0p2a1e2s1i1i1717170q0q'
const WIDTH_REG =
  '0s0t141o1i2a290n0v0v161x0m140m131i1i1i1i1i1i1i1i1i1i0m0m1x1x1x192o1t1m1q1z1f1d1x1z0r101n1c2i23241l241o1i1h1x1r2m1n1k1m0v120v1x160r1f1n1b1n1h0w1n1l0p0p1e0p2f1l1n1n1n0z170y1l1c211a1d1a0v0o0v1x1t1t1t1t1t1t2f1q1f1f1f1f0r0r0r0r1z2324242424241x241x1x1x1x1k1l1j1f1f1f1f1f1f2c1b1h1h1h1h0p0p0p0p1k1l1n1n1n1n1n1x1n1l1l1l1l1d1n1d1t1f1t1f1t1f1q1b1q1b1q1b1q1b1z1w1z1n1f1h1f1h1f1h1f1h1f1h1x1n1x1n1x1n1x1n1z1l1z1l0r0p0r0p0r0p0r0p0r0p1r1e100p1n1e1e1c0p1c0p1c0v1c0w1c0s231l231l231l1p231l241n241n241n2m2l1o0z1o0z1o0z1i171i171i171i171h0y1h181h0y1x1l1x1l1x1l1x1l1x1l1x1l2m211k1d1k1m1a1m1a1m1a0p1f1f1z1c1q1i0r0r102r2r211n231l1z1t1m1m1c1y1f2f1j23231n1w2i1z24201l1q1h1l211n231v2n2q1z271m1q2u1o1f1m1h131j1h23191n1n1e1h1z1m1n1m1n1b161d1x1a1p1l282b1o1z1f1b2a1f1h1h1m131b170p0p0p28291l1e1n1d1m1b141l1d0m221e2s1f1f1212120n0n'

function widthChars(): string[] {
  let s = ''
  for (let c = 32; c <= 126; c++) s += String.fromCodePoint(c)
  for (let c = 0xc0; c <= 0x17f; c++) s += String.fromCodePoint(c)
  for (let c = 0x400; c <= 0x45f; c++) s += String.fromCodePoint(c)
  return [...(s + '\u0490\u0491\u040e\u045e\u00b7\u2026\u2013\u2014\u00ab\u00bb\u201e\u201c\u201d\u2019\u2018')]
}

const WIDTHS = new Map<string, [number, number]>()
widthChars().forEach((ch, i) => {
  WIDTHS.set(ch, [parseInt(WIDTH_SEMI.slice(2 * i, 2 * i + 2), 36) / 100, parseInt(WIDTH_REG.slice(2 * i, 2 * i + 2), 36) / 100])
})

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
