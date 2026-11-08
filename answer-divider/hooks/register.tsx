import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AnswerEnd, AnswerKey, LineStyle } from '../types'
import { detectLang, fromLocale, hms, isLang, textWidth } from './i18n'
import type { Lang } from './i18n'
import { STRINGS } from './strings'

// The final answers of past turns, reduced to plain letters. Kept in $.state
// for drawing and in $.store so a resumed session still knows its answers.
const answers = atom({ plugin: 'answer-divider', key: 'answers' } as const, [] as AnswerKey[])
// Which line is drawn above the answer; /answer-line switches it.
const style = atom({ plugin: 'answer-divider', key: 'line' } as const, 'wave' as LineStyle)
// The end of each final answer and how long its turn took: drawn under it.
const ends = atom({ plugin: 'answer-divider', key: 'ends' } as const, [] as AnswerEnd[])

const STORE_ANSWERS = 'answers'
const STORE_STYLE = 'line'
const STORE_ENDS = 'ends'
const LANG_KEY = 'lang'
const MAX_KEPT = 150
const MAX_LENGTH = 8000
const HEAD = 160

// The mods' orange, the same as cache-keeper's; gray on the light
// theme. Both live in each picture's own style: a picture's
// prefers-color-scheme follows the app's theme (the desktop app sets the
// system theme to its own), while a Text's raw color cannot change with it.
const ORANGE = '#f2a65e'
const GRAY = '#73726c'
const INK = `<style>.f{fill:${ORANGE}}.s{stroke:${ORANGE}}@media (prefers-color-scheme:light){.f{fill:${GRAY}}.s{stroke:${GRAY}}}</style>`
const HEIGHT = 24

// --- The two lines -----------------------------------------------------------
// Each is drawn wider than any window and cropped around its centre
// (xMidYMid slice), so its marks keep their size and the word stays centred
// whatever the width.

const WIDTH = 4000
const MID = HEIGHT / 2
const CENTRE = WIDTH / 2

/** The gap left in the line for the word: wide enough for it, never narrower than the Russian's. */
function gapFor(label: string, less: number): number {
  return Math.max(46, Math.ceil((textWidth(label, 14) + 1.5 * [...label].length) / 2 + 21)) - less
}

function svg(label: string, gap: number, marks: (from: number, to: number) => string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid slice">` +
    INK +
    marks(0, CENTRE - gap) +
    marks(CENTRE + gap, WIDTH) +
    `<text x="${CENTRE}" y="${MID}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="14" font-weight="400" ` +
    `letter-spacing="1.5" class="f">${label}</text>` +
    `</svg>`
  )
}

// A thin wavy line, broken in the middle for the word.
function waveSvg(label: string): string {
  const period = 24
  const amp = 4
  let id = 0
  return svg(label, gapFor(label, 0), (from, to) => {
    const start = from - (from % period)
    let d = `M${start} ${MID} Q${start + period / 4} ${MID - amp} ${start + period / 2} ${MID}`
    for (let x = start + period; x <= to; x += period / 2) d += ` T${x} ${MID}`
    const clip = `c${id++}`
    return (
      `<clipPath id="${clip}"><rect x="${from}" y="0" width="${to - from}" height="${HEIGHT}"/></clipPath>` +
      `<path d="${d}" fill="none" class="s" stroke-width="1" stroke-linecap="round" clip-path="url(#${clip})"/>`
    )
  })
}

// A row of small triangles pointing down, broken in the middle for the word.
function trianglesSvg(label: string): string {
  const step = 14
  const half = 3
  const rise = 2.5
  return svg(label, gapFor(label, 2), (from, to) => {
    let points = ''
    // Placed from the centre outwards, so both sides mirror each other.
    const xs: number[] = []
    if (from < CENTRE) for (let x = to - half; x - half >= from; x -= step) xs.push(x)
    else for (let x = from + half; x + half <= to; x += step) xs.push(x)
    for (const x of xs) {
      points += `<polygon points="${x - half},${MID - rise} ${x + half},${MID - rise} ${x},${MID + rise}" class="f"/>`
    }
    return points
  })
}

/** The line for a style in the current language, drawn once and kept. */
const lines = new Map<string, string>()
function lineSvg(kind: LineStyle): string {
  const label = S().label
  const key = `${kind}:${label}`
  let drawn = lines.get(key)
  if (drawn === undefined) {
    drawn = kind === 'triangles' ? trianglesSvg(label) : waveSvg(label)
    lines.set(key, drawn)
  }
  return drawn
}

const FOOT_HEIGHT = 20

/** "Response time: …" as a picture, so it turns gray on the light theme too. */
function footSvg(text: string): { source: string; width: number } {
  const width = Math.ceil(textWidth(text, 14) + 6)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${FOOT_HEIGHT}" viewBox="0 0 ${width} ${FOOT_HEIGHT}">` +
    INK +
    `<text x="0" y="15" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="14" class="f">${text}</text>` +
    `</svg>`
  return { source, width }
}

// The terminal draws no Svg: the same line in characters, sized to the width.
function lineText(kind: LineStyle, columns: number): string {
  const LABEL = S().label
  if (kind === 'triangles') {
    const count = Math.max(2, Math.floor((columns - LABEL.length - 2) / 4))
    const side = Array.from({ length: count }, () => '▾').join(' ')
    return `${side} ${LABEL} ${side}`
  }
  const side = Math.max(3, Math.floor((columns - LABEL.length - 2) / 2))
  return `${'∿'.repeat(side)} ${LABEL} ${'∿'.repeat(side)}`
}

// --- Matching answers --------------------------------------------------------

// Whitespace and markdown markers differ between the stored answer and the
// text a surface draws, so both sides are compared by their plain letters.
function plainOf(text: string): string {
  return text
    .replace(/[`*_#>|~\-\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function keyOf(text: string): string {
  return plainOf(text).slice(0, MAX_LENGTH)
}

function asKeys(value: unknown): AnswerKey[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function asEnds(value: unknown): AnswerEnd[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (v): v is AnswerEnd =>
      v !== null && typeof v === 'object' && typeof v.tail === 'string' && typeof v.ms === 'number',
  )
}

/** The entry whose answer ends with this block, the latest first. */
function endOf(blockText: string, list: readonly AnswerEnd[]): AnswerEnd | undefined {
  const block = plainOf(blockText)
  if (block.length < 12) return undefined
  for (let i = list.length - 1; i >= 0; i--) {
    const end = list[i]!
    const matches = block.length >= end.tail.length ? block.endsWith(end.tail) : end.tail.endsWith(block)
    if (matches) return end
  }
  return undefined
}

/** 12 s, 3 min 5 s, 1 h 12 min, in the person's language. */
function took(ms: number): string {
  return hms(lang, ms)
}

function asStyle(value: unknown): LineStyle | undefined {
  return value === 'wave' || value === 'triangles' ? value : undefined
}

function styleFromArgs(args: string, current: LineStyle): LineStyle | undefined {
  const word = args.trim().toLowerCase()
  if (word === '') return current === 'wave' ? 'triangles' : 'wave'
  if (['wave', 'waves', 'волна', 'волны', 'волнистая'].includes(word)) return 'wave'
  if (['triangles', 'triangle', 'треугольники', 'треугольник', 'стрелки'].includes(word)) return 'triangles'
  return undefined
}

// ---- Language ----

/** The language the mod speaks; with the option on `auto`, learned from the answers. */
let lang: Lang = 'en'
let langOption = 'auto'

function S() {
  return STRINGS[lang]
}

/** The option's language; else the one learned before; else the system's; else English. */
async function pickLang($: EngineInterface): Promise<Lang> {
  if (isLang(langOption)) return langOption
  try {
    const stored = await $.store.get(LANG_KEY)
    if (isLang(stored)) return stored
  } catch {
    // No store: go on.
  }
  try {
    const found =
      fromLocale(await $.env.get('LC_ALL')) ??
      fromLocale(await $.env.get('LC_MESSAGES')) ??
      fromLocale(await $.env.get('LANG')) ??
      fromLocale(await $.env.get('LANGUAGE'))
    if (found !== undefined) return found
  } catch {
    // No environment to read.
  }
  return 'en'
}

/** With the option on `auto`, an answer's language becomes the mod's (Claude answers in the person's). */
async function learnLang($: EngineInterface, text: string): Promise<void> {
  if (isLang(langOption)) return
  const found = detectLang(text)
  if (found === undefined || found === lang) return
  lang = found
  await $.store.set(LANG_KEY, found).catch(() => undefined)
}

// --- Hooks -------------------------------------------------------------------

export const register: Register = (on, options) => {
  langOption = typeof options.language === 'string' ? options.language : 'auto'
  lang = isLang(langOption) ? langOption : 'en'

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = await pickLang($)

    await $.command.register({
      name: 'answer-line',
      description: S().cmdDescription,
      argumentHint: 'wave | triangles',
    })

    const stored = asKeys(await $.store.get(STORE_ANSWERS))
    if (stored.length > 0) {
      await update($, answers, list => {
        const current = asKeys(list)
        return [...stored.filter(k => !current.includes(k)), ...current].slice(-MAX_KEPT)
      })
    }

    const storedStyle = asStyle(await $.store.get(STORE_STYLE))
    if (storedStyle !== undefined) await update($, style, () => storedStyle)

    const storedEnds = asEnds(await $.store.get(STORE_ENDS))
    if (storedEnds.length > 0) {
      await update($, ends, list => {
        const current = asEnds(list)
        const known = new Set(current.map(end => end.tail))
        return [...storedEnds.filter(end => !known.has(end.tail)), ...current].slice(-MAX_KEPT)
      })
    }

    return result
  })

  on('command.run', { command: 'answer-line' }, async ($, e) => {
    const current = asStyle(await read($, style)) ?? 'wave'
    const chosen = styleFromArgs(e.args, current)
    if (chosen === undefined) {
      return { text: S().notUnderstood(e.args.trim()) }
    }
    await update($, style, () => chosen)
    await $.store.set(STORE_STYLE, chosen).catch(() => undefined)
    return { text: S().lineSet(S().styleNames[chosen]) }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.answer.trim() !== '') {
      await learnLang($, e.answer)
      const key = keyOf(e.answer)
      const kept = await update($, answers, list => {
        const rest = asKeys(list).filter(k => k !== key)
        rest.push(key)
        return rest.slice(-MAX_KEPT)
      })
      await $.store.set(STORE_ANSWERS, kept).catch(() => undefined)

      const end: AnswerEnd = { tail: plainOf(e.answer).slice(-HEAD), ms: e.durationMs }
      const keptEnds = await update($, ends, list => {
        const rest = asEnds(list).filter(one => one.tail !== end.tail)
        rest.push(end)
        return rest.slice(-MAX_KEPT)
      })
      await $.store.set(STORE_ENDS, keptEnds).catch(() => undefined)
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const block = keyOf(e.props.text)
    if (block === '') return next(e)

    const keys = asKeys(await read($, answers))
    const isAnswerStart = keys.some(answer => answer.startsWith(block.slice(0, HEAD)))
    const isInAnswer = isAnswerStart || keys.some(answer => answer.includes(block))

    const { Box, Text, Markdown } = $.ui.resolve(e)

    // Interim text (thoughts out loud between tool calls): drawn dim.
    if (!isInAnswer) {
      return <Markdown text={e.props.text} dimColor />
    }

    // The block that ends the answer gets the turn's time under it.
    const end = endOf(e.props.text, asEnds(await read($, ends)))

    // A middle part of the final answer: drawn as the engine draws it.
    if (!isAnswerStart && end === undefined) return next(e)

    const kind = asStyle(await read($, style)) ?? 'wave'
    const engine = await next(e)
    const isTerminal = e.surface === 'terminal'

    // Above the start: the chosen line with the word in its middle.
    const header = (() => {
      if (isTerminal) {
        return (
          <Box marginBottom={1}>
            <Text color="claude">{lineText(kind, e.viewport?.columns ?? 60)}</Text>
          </Box>
        )
      }
      const { Svg } = $.ui.resolve(e)
      return (
        <Box marginBottom={1}>
          <Svg source={lineSvg(kind)} alt={S().label} height={HEIGHT} />
        </Box>
      )
    })()

    // Under the end: how long the answer took, from the prompt to its end.
    const footer = (() => {
      if (end === undefined) return undefined
      const text = S().responseTime(took(end.ms))
      if (isTerminal) {
        return (
          <Box marginTop={1}>
            <Text color="claude">{text}</Text>
          </Box>
        )
      }
      const { Svg } = $.ui.resolve(e)
      const foot = footSvg(text)
      return (
        <Box marginTop={1}>
          <Svg source={foot.source} alt={text} width={foot.width} height={FOOT_HEIGHT} />
        </Box>
      )
    })()

    if (isAnswerStart && footer !== undefined) {
      return (
        <Box flexDirection="column" marginTop={1}>
          {header}
          {engine}
          {footer}
        </Box>
      )
    }
    if (isAnswerStart) {
      return (
        <Box flexDirection="column" marginTop={1}>
          {header}
          {engine}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        {engine}
        {footer}
      </Box>
    )
  })
}
