import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheWarm, Demo, Display, Note, Run } from '../types'
import { detectLang, fromLocale, hm, isLang, thousands } from './i18n'
import type { Lang } from './i18n'
import { STRINGS } from './strings'
import { kitchenSvg, labelSvg, LEAVE_MS, SERVE_MS, TASTE_MS } from './kitchen'

// Two things in one mod:
//  1. /cache-warm: in the session where it is switched on, a short side
//     question over the session's own history (a fork) runs before the cache
//     goes cold. The fork reads the cached history, which keeps the cache
//     alive, and adds nothing to the chat.
//  2. A guard, in every session: the first message after the cache went cold
//     in a large session is held back once with a warning and put back in the
//     input box; Enter again sends it.
// While warming is on, an indicator shows it: a kitchen in the band above the
// prompt, the gray status line under it, or both (/cache-warm вид). In the
// kitchen a guest waits for each hour of warming; every warm-up the chef carries
// a bowl to the queue and the next guest sits down to eat; when the person sends
// a message, the chef tastes the soup himself; each hour that passes with no
// guest fed, the last in the queue leaves hungry. /cache-warm демо plays a quick
// pretend shift. Every word it shows is in the person's language (strings.ts).

const lastActivity = atom({ plugin: 'cache-keeper', key: 'lastActivity' } as const, 0)
const warm = atom({ plugin: 'cache-keeper', key: 'warm' } as const, null as CacheWarm | null)
const heldAt = atom({ plugin: 'cache-keeper', key: 'heldAt' } as const, 0)
const run = atom({ plugin: 'cache-keeper', key: 'run' } as const, null as Run | null)
const demo = atom({ plugin: 'cache-keeper', key: 'demo' } as const, null as Demo | null)
const clockAt = atom({ plugin: 'cache-keeper', key: 'clockAt' } as const, 0)
const display = atom({ plugin: 'cache-keeper', key: 'display' } as const, 'band' as Display)

const MIN = 60_000
const HOUR = 60 * MIN
/** How long the cache lives with no request (this setup's sessions: one hour). */
const TTL = HOUR
/** Warm when the session has been quiet this long: ten minutes to spare. */
const WARM_AFTER = 50 * MIN
/** After a failed warm-up, try again this much later. */
const RETRY_AFTER = 5 * MIN
const DEFAULT_HOURS = 8
const MAX_HOURS = 24
/** Below this many context tokens a cold cache is cheap: no warning. */
const GUARD_MIN_TOKENS = 30_000
/** A second Enter within this long after a warning sends the message. */
const HOLD_WINDOW = 10 * MIN
const STORE_KEY = 'lastActivity'
const DISPLAY_KEY = 'display'
const STORE_MAX_SESSIONS = 100
const MAX_GUESTS = 24
const DEMO_GUESTS = 6
/** A demo step: longer than a serving run, so they never overlap. */
const DEMO_EVERY = 9000

const LANG_KEY = 'lang'

const WARM_PROMPT =
  'A service check that only keeps this session\'s prompt cache warm. Do nothing and answer with one word: ok.'

// Module variables start over on a reload; nothing here needs to outlive one.
let isBusy = false
let isWarming = false
let retryAt = 0
/** Numbers the kitchen's runs, so a late end of an old one changes nothing. */
let runSeq = 0
/** Stops the demo's timer. */
let stopDemo: (() => void) | null = null
/** The language the mod speaks, chosen at session start; `auto` may change it after the first message. */
let lang: Lang = 'en'
/** The `language` option: a language, or `auto`. */
let langOption = 'auto'

function S() {
  return STRINGS[lang]
}

/** The option's language; else the one learned from the person's words; else the system's; else English. */
async function pickLang($: Dollar): Promise<Lang> {
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

/** With the option on `auto`, the person's own message tells the language; kept for next time. */
async function learnLang($: Dollar, text: string): Promise<void> {
  if (isLang(langOption)) return
  const found = detectLang(text)
  if (found === undefined || found === lang) return
  lang = found
  try {
    await $.store.set(LANG_KEY, found)
  } catch {
    // Kept for this session at least.
  }
}

const ORANGE = '#f2a65e'

/** The words /cache-warm show takes for each display: English everywhere, Russian and Ukrainian too. */
const DISPLAY_WORDS: Record<Display, string[]> = {
  band: ['band', 'card', 'kitchen', 'плашка', 'плашкой', 'кухня'],
  status: ['status', 'line', 'строка', 'строкой', 'рядок'],
  both: ['both', 'all', 'оба', 'обе', 'обидва'],
}

function parseDisplay(word: string): Display | undefined {
  return (Object.keys(DISPLAY_WORDS) as Display[]).find(d => DISPLAY_WORDS[d].includes(word))
}

type Dollar = EngineInterface

function duration(ms: number): string {
  return hm(lang, ms)
}

function kilo(tokens: number): string {
  return thousands(lang, tokens)
}

/** A warm-up's note in the person's words (an older version's note is shown as it was kept). */
function noteText(note: Note | string | null): string | null {
  if (note === null || typeof note === 'string') return note
  if (note.kind === 'read') return S().noteRead(kilo(note.tokens))
  if (note.kind === 'cold') return S().noteCold(kilo(note.tokens))
  if (note.kind === 'nothing') return S().noteNothing
  return S().noteFailed(note.reason, duration(RETRY_AFTER))
}

async function contextTokens($: Dollar): Promise<number> {
  try {
    return (await $.session.usage()).context.tokens ?? 0
  } catch {
    return 0
  }
}

/** Records that the main thread just talked to the model, here and across restarts. */
async function remember($: Dollar, at: number): Promise<void> {
  await update($, lastActivity, () => at)
  try {
    const id = await $.session.id()
    const stored = await $.store.get(STORE_KEY)
    const map: Record<string, number> =
      stored !== null && typeof stored === 'object' ? { ...(stored as Record<string, number>) } : {}
    map[id] = at
    const kept = Object.entries(map)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .sort((a, b) => b[1] - a[1])
      .slice(0, STORE_MAX_SESSIONS)
    await $.store.set(STORE_KEY, Object.fromEntries(kept))
  } catch {
    // The store is a convenience for restarts; the session's own state is enough.
  }
}

async function showStatus($: Dollar): Promise<void> {
  const w = await read($, warm)
  if (w === null) {
    $.ui.status(undefined)
    return
  }
  if ((await read($, display)) === 'band') {
    $.ui.status(undefined)
    return
  }
  const now = await $.clock.now()
  $.ui.status(S().statusLine(duration(w.until - now)))
}

async function stopWarming($: Dollar, why: string): Promise<void> {
  await update($, warm, () => null)
  $.ui.status(undefined)
  $.ui.toast(why)
}

async function tick($: Dollar): Promise<void> {
  const w = await read($, warm)
  if (w === null) return
  const now = await $.clock.now()
  await update($, clockAt, () => now)

  if (now >= w.until) {
    await stopWarming($, S().toastEnded(duration(w.until - w.startedAt), warmTally(w)))
    return
  }
  await showStatus($)

  // Each hour at least one guest is done with: fed, or gone hungry. When an
  // hour passed with nobody fed, the last in the queue leaves (unless a
  // warm-up, which feeds one, is due right now).
  const lastAt = await read($, lastActivity)
  const isWarmUpDue = !isBusy && !isWarming && now >= retryAt && (lastAt === 0 || now - lastAt >= WARM_AFTER)
  if (!isWarmUpDue) {
    const f = await feast($)
    const hoursGone = Math.floor((now - w.startedAt) / HOUR)
    if (f !== null && !f.isDemo && f.served < f.guests && f.served + f.left < hoursGone) {
      await startRun($, 'leaving')
    }
  }

  if (isBusy || isWarming || now < retryAt) return
  const last = await read($, lastActivity)
  if (last !== 0 && now - last < WARM_AFTER) return

  isWarming = true
  await feed($)
  try {
    const tokens = await contextTokens($)
    const r = await $.model.fork({ prompt: WARM_PROMPT })
    const at = await $.clock.now()

    let note: Note
    if (r.isAnswered || ('usage' in r && r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens > 0)) {
      // A request went out over the history: the cache is fresh again.
      await remember($, at)
      const usage = r.usage
      const wasCold = tokens > 0 && usage.cache_read_input_tokens < tokens * 0.5
      note = wasCold
        ? { kind: 'cold', tokens: usage.cache_creation_input_tokens }
        : { kind: 'read', tokens: usage.cache_read_input_tokens }
      if (wasCold) $.ui.toast(S().toastCold)
    } else if (r.reason === 'nothing-to-fork') {
      note = { kind: 'nothing' }
      retryAt = at + RETRY_AFTER
    } else {
      note = { kind: 'failed', reason: String(r.reason) }
      retryAt = at + RETRY_AFTER
    }
    await update($, warm, cur => (cur === null ? null : { ...cur, count: cur.count + 1, last: note }))
  } finally {
    isWarming = false
  }
}

// ---- The kitchen ----

function guestsFor(hours: number): number {
  return Math.max(1, Math.min(MAX_GUESTS, Math.ceil(hours)))
}

type Feast = {
  /** Guests still here: seated or in the queue. */
  guests: number
  /** Guests at the start: one for each hour. */
  total: number
  served: number
  left: number
  isDemo: boolean
}

/** The kitchen as it stands: the demo's while one plays, else warming's, else null. */
async function feast($: Dollar): Promise<Feast | null> {
  const d = await read($, demo)
  if (d !== null) {
    const left = d.left ?? 0
    return { guests: d.guests - left, total: d.guests, served: d.served, left, isDemo: true }
  }
  const w = await read($, warm)
  if (w === null) return null
  const total = w.guests ?? guestsFor((w.until - w.startedAt) / HOUR)
  const left = w.left ?? 0
  return { guests: total - left, total, served: w.served ?? 0, left, isDemo: false }
}

/** "fed 2 of 6, 1 left hungry", in the person's language. */
function tally(f: { total: number; served: number; left: number }): string {
  return S().tally(f.served, f.total, f.left)
}

/** The same, for the warming record itself. */
function warmTally(w: CacheWarm): string {
  return tally({ total: w.guests ?? guestsFor((w.until - w.startedAt) / HOUR), served: w.served ?? 0, left: w.left ?? 0 })
}

/** Plays a run in the kitchen, unless one is playing. */
async function startRun($: Dollar, kind: Run['kind']): Promise<void> {
  if ((await read($, run)) !== null) return
  runSeq += 1
  const id = runSeq
  await update($, run, () => ({ kind, id }))
  $.clock.after(kind === 'serving' ? SERVE_MS : kind === 'taste' ? TASTE_MS : LEAVE_MS, () => {
    finishRun($, id).catch(() => undefined)
  })
}

/** A run ended: after a serving, one more guest eats; after a leaving, one fewer is here. */
async function finishRun($: Dollar, id: number): Promise<void> {
  const r = await read($, run)
  if (r === null || r.id !== id) return
  if (r.kind === 'serving') {
    if ((await read($, demo)) !== null) {
      await update($, demo, d => (d === null ? null : { ...d, served: Math.min(d.guests, d.served + 1) }))
    } else {
      await update($, warm, w =>
        w === null ? null : { ...w, served: Math.min(w.guests ?? MAX_GUESTS, (w.served ?? 0) + 1) },
      )
    }
  }
  if (r.kind === 'leaving') {
    if ((await read($, demo)) !== null) {
      await update($, demo, d => (d === null ? null : { ...d, left: (d.left ?? 0) + 1 }))
    } else {
      await update($, warm, w => (w === null ? null : { ...w, left: (w.left ?? 0) + 1 }))
    }
  }
  await update($, run, () => null)
}

/** A warm-up went out: the chef feeds the next guest, or tastes it himself once all are fed. */
async function feed($: Dollar): Promise<void> {
  const f = await feast($)
  if (f === null) return
  await startRun($, f.served < f.guests ? 'serving' : 'taste')
}

function stopDemoTimer(): void {
  stopDemo?.()
  stopDemo = null
}

async function endDemo($: Dollar, why: string): Promise<void> {
  await update($, demo, () => null)
  await update($, run, () => null)
  $.ui.toast(why)
  // Last: this may run inside the demo's own timer.
  stopDemoTimer()
}

/** One step of the demo: feed the next guest, or every third step one leaves unfed; then end. */
async function demoStep($: Dollar): Promise<void> {
  const f = await feast($)
  const d = await read($, demo)
  if (d === null || f === null || !f.isDemo) {
    stopDemoTimer()
    return
  }
  if ((await read($, run)) !== null) return
  if (f.served >= f.guests) {
    await endDemo($, S().demoEnded(tally(f)))
    return
  }
  const step = d.step ?? 0
  await update($, demo, cur => (cur === null ? null : { ...cur, step: step + 1 }))
  await startRun($, step % 3 === 2 ? 'leaving' : 'serving')
}

function parseHours(word: string): number | undefined {
  const n = Number(word.replace(',', '.').replace(/[^\d.]+$/u, ''))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(MAX_HOURS, n)
}

async function describe($: Dollar): Promise<string> {
  const w = await read($, warm)
  const now = await $.clock.now()
  const last = await read($, lastActivity)
  const t = S()
  const since = last === 0 ? t.unknown : t.ago(duration(now - last))
  const cache = last === 0 ? t.unknown : now - last < TTL ? t.warmFor(duration(TTL - (now - last))) : t.cold
  const lines = [w === null ? t.offState : t.onState(duration(w.until - now)), t.lastRequest(since, cache)]
  if (w !== null) {
    lines.push(t.warmUps(w.count, noteText(w.last)))
    lines.push(t.guests(warmTally(w)))
  }
  lines.push(t.indicator(t.displayNames[await read($, display)]))
  lines.push(t.commands)
  return lines.join('\n')
}

/** What the indicator shows now, or null while neither warming nor the demo is on. */
async function indicator($: Dollar) {
  const f = await feast($)
  if (f === null) return null
  const r = await read($, run)
  let sub: string
  if (f.isDemo) {
    sub = S().demoSub(tally(f))
  } else {
    const w = await read($, warm)
    const startedAt = w?.startedAt ?? 0
    const now = Math.max(await read($, clockAt), startedAt)
    sub = S().timeLeft(duration((w?.until ?? now) - now))
  }
  return { ...f, sub, mode: r === null ? ('idle' as const) : r.kind }
}

export const register: Register = (on, options) => {
  langOption = typeof options.language === 'string' ? options.language : 'auto'
  lang = isLang(langOption) ? langOption : 'en'

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = await pickLang($)

    await $.command.register({
      name: 'cache-warm',
      description: S().cmdDescription,
      argumentHint: S().argHint,
    })

    // A resumed session: when it last talked to the model, from the store.
    if ((await read($, lastActivity)) === 0) {
      try {
        const id = await $.session.id()
        const stored = (await $.store.get(STORE_KEY)) as Record<string, unknown> | undefined
        const at = stored?.[id]
        if (typeof at === 'number') await update($, lastActivity, () => at)
      } catch {
        // Nothing stored: the time stays unknown and the guard stays quiet.
      }
    }

    // Where the indicator shows: the person's choice, kept across sessions.
    try {
      const chosen = await $.store.get(DISPLAY_KEY)
      const d = typeof chosen === 'string' ? parseDisplay(chosen) : undefined
      if (d !== undefined) await update($, display, () => d)
    } catch {
      // Nothing stored: the default, the band.
    }

    // A reload leaves no run playing and no demo timer: start clean.
    await update($, run, () => null)
    await update($, demo, () => null)
    const startedAt = await $.clock.now()
    await update($, clockAt, () => startedAt)

    $.clock.every(MIN, () => {
      tick($).catch(() => undefined)
    })
    await showStatus($)

    return result
  })

  // The band above the prompt, while warming is on and the display has it (the
  // demo always). The desktop draws the band in a gray card of its own. The
  // words and the kitchen are two pictures: the words change every minute, the
  // kitchen only when its state does, so its animation is not restarted.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const it = await indicator($)
    if (it === null) return next(e)
    if (!it.isDemo && (await read($, display)) === 'status') return next(e)

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box>
          <Text color={ORANGE}>
            ♨ {S().title} <Text dimColor>· {it.sub} · {tally(it)}</Text>
          </Text>
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const label = labelSvg(S().title, it.sub)
    const scene = kitchenSvg({ guests: it.guests, served: it.served, mode: it.mode })
    return (
      <Box flexDirection="row" alignItems="center" gap="md">
        <Svg source={label.source} alt={`${S().title}, ${it.sub}`} width={label.width} height={label.height} />
        <Box flexGrow={1} minWidth={0}>
          <Svg
            source={scene.source}
            alt={S().kitchenAlt(tally(it))}
            width={4096}
            height={scene.height}
          />
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'cache-warm' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(w => w !== '')
    const [first = '', second = ''] = words

    if (first === '' || first === 'status' || first === 'статус') {
      return { text: await describe($) }
    }

    if (['show', 'display', 'вид', 'индикатор', 'вигляд'].includes(first)) {
      const current = await read($, display)
      if (second === '') {
        return { text: S().displayNow(S().displayNames[current]) }
      }
      const d = parseDisplay(second)
      if (d === undefined) {
        return { text: S().displayWrong(second) }
      }
      await update($, display, () => d)
      try {
        await $.store.set(DISPLAY_KEY, d)
      } catch {
        // Kept for this session at least.
      }
      await showStatus($)
      return { text: S().displaySet(S().displayNames[d]) }
    }

    if (['демо', 'demo'].includes(first)) {
      if (['stop', 'off', 'стоп', 'выкл', 'вимк'].includes(second)) {
        if ((await read($, demo)) === null) return { text: S().demoNotRunning }
        await endDemo($, S().demoStopped)
        return { text: S().demoStopped }
      }
      const asked = Math.round(Number(second))
      const n = second === '' || !Number.isFinite(asked) ? DEMO_GUESTS : Math.max(1, Math.min(MAX_GUESTS, asked))
      stopDemoTimer()
      await update($, run, () => null)
      await update($, demo, () => ({ guests: n, served: 0, left: 0, step: 0 }))
      stopDemo = $.clock.every(DEMO_EVERY, () => {
        demoStep($).catch(() => undefined)
      })
      $.clock.after(1500, () => {
        demoStep($).catch(() => undefined)
      })
      return { text: S().demoStarted(n, DEMO_EVERY / 1000) }
    }

    if (['off', 'stop', 'выкл', 'стоп', 'выключить', 'вимкнути'].includes(first)) {
      const was = await read($, warm)
      await update($, warm, () => null)
      $.ui.status(undefined)
      return { text: was === null ? S().alreadyOff : S().turnedOff }
    }

    const isOn = ['on', 'start', 'вкл', 'включить', 'старт', 'увімкнути'].includes(first)
    const hours = parseHours(isOn ? second : first) ?? (isOn && second === '' ? DEFAULT_HOURS : undefined)
    if (!isOn && hours === undefined) {
      return { text: S().notUnderstood(e.args.trim()) }
    }
    if (hours === undefined) {
      return { text: S().badHours(second) }
    }

    const now = await $.clock.now()
    await update($, warm, cur => ({
      until: now + hours * HOUR,
      startedAt: now,
      count: cur?.count ?? 0,
      last: cur?.last ?? null,
      guests: guestsFor(hours),
      served: 0,
      left: 0,
    }))
    retryAt = 0
    await update($, clockAt, () => now)
    await showStatus($)

    const last = await read($, lastActivity)
    const lines = [S().turnedOn(duration(hours * HOUR), duration(WARM_AFTER))]
    if (last !== 0 && now - last >= TTL) lines.push(S().alreadyCold)
    lines.push(S().howToOff)
    return { text: lines.join('\n') }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) isBusy = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isBusy = false
      await remember($, await $.clock.now())
    }
    return next(e)
  })

  // The person's messages: the kitchen's chef tastes the soup, and the guard
  // holds back, once, the first message into a large session whose
  // cache has gone cold.
  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta === true || e.turnId !== undefined) return next(e)
    if (e.origin !== undefined && e.origin.kind !== 'composer') return next(e)

    await learnLang($, e.text)

    // The person's own message while warming is on: the chef tastes the soup.
    if ((await feast($)) !== null) await startRun($, 'taste')

    const now = await $.clock.now()
    const last = await read($, lastActivity)
    if (last === 0 || now - last < TTL) return next(e)

    const tokens = await contextTokens($)
    if (tokens < GUARD_MIN_TOKENS) return next(e)

    const held = await read($, heldAt)
    if (held !== 0 && now - held < HOLD_WINDOW) {
      await update($, heldAt, () => 0)
      return next(e)
    }

    const warning = S().guardWarning(duration(now - last), kilo(tokens))

    // A message with pictures is not held back (they could not be put back).
    if ((e.attachments?.length ?? 0) > 0) {
      $.ui.toast(warning)
      return next(e)
    }

    await update($, heldAt, () => now)
    const text = e.text
    $.clock.after(150, () => {
      $.prompt.fill({ text, mode: 'replace' }).catch(() => undefined)
    })
    return {
      drop: S().guardDrop(warning),
    }
  }).catch(($, e, next) => next(e)) // a warning, not a lock: if it fails, the message goes
}
