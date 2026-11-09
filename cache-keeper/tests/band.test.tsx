import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

/** These tests read the Russian texts. */
const RU = { options: { language: 'ru' } } as const

const START = 1_800_000_000_000
const MIN = 60_000

const BAND = {
  plugin: 'cache-keeper',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80 },
} as const

const toasts: string[] = []

/** The kitchen's alt: how many of the guests are fed. */
async function sceneAlt(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
  const all = await ui.findAll({ type: 'Svg' })
  // The band draws the words first, then the kitchen.
  return all.length > 1 ? String(all[1].props.alt) : undefined
}

async function sceneSource(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
  const all = await ui.findAll({ type: 'Svg' })
  return all.length > 1 ? String(all[1].props.source) : ''
}

function engine(on: On) {
  const statuses: (string | undefined)[] = []
  toasts.length = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'cache-warm' } }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.usage', () => ({
    value: { startedAt: START, context: { tokens: 50_000, window: 200_000 }, rateLimits: [] },
  }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'ок',
      usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 5 },
    },
  }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  // Stands for the engine's own (empty) band when the mod passes.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return statuses
}

test('by default the kitchen shows above the prompt, the status line stays empty', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const statuses = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const before = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await before.find({ type: 'Svg' })).toBeUndefined()
  await before.unmount()

  await $.command.run({ command: 'cache-warm', args: 'on 2' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const label = await ui.find({ type: 'Svg' })
  expect(label?.props.alt).toBe('Подогрев, ещё 2 ч')
  expect(String(label?.props.source)).toContain('Подогрев')
  expect(await sceneAlt(ui)).toBe('Кухня: накормлено 0 из 2')

  await clock.advance(15 * MIN)
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Подогрев, ещё 1 ч 45 мин')
  expect(statuses.filter(s => s !== undefined)).toEqual([])

  await $.command.run({ command: 'cache-warm', args: 'off' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('/cache-warm вид switches between the band, the status line and both, and is kept', RU, async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  const statuses = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'cache-warm', args: 'on 2' })

  const asked = await $.command.run({ command: 'cache-warm', args: 'вид' })
  expect(asked.text).toContain('плашка над полем ввода')

  const toLine = await $.command.run({ command: 'cache-warm', args: 'вид строка' })
  expect(toLine.text).toContain('серая строка под полем ввода')
  expect(statuses.at(-1)).toBe('Прогрев кэша: ещё 2 ч')
  const line = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await line.find({ type: 'Svg' })).toBeUndefined()
  await line.unmount()

  await $.command.run({ command: 'cache-warm', args: 'вид оба' })
  expect(statuses.at(-1)).toBe('Прогрев кэша: ещё 2 ч')
  const both = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await both.find({ type: 'Svg' })).toBeDefined()
  await both.unmount()

  await $.command.run({ command: 'cache-warm', args: 'вид плашка' })
  expect(statuses.at(-1)).toBeUndefined()

  const wrong = await $.command.run({ command: 'cache-warm', args: 'вид радуга' })
  expect(wrong.text).toContain('Варианты: плашка, строка, оба')
})

test('the choice of display comes back in a new session', RU, async ($, on) => {
  mock.clock(on, { now: START })
  on('store.get', (_, e) => ({ value: e.key === 'display' ? 'status' : undefined }))
  on('store.set', () => ({ value: undefined }))
  const statuses = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'cache-warm', args: 'on 2' })

  expect(statuses.at(-1)).toBe('Прогрев кэша: ещё 2 ч')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('the terminal gets a line of text instead of the picture', RU, async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'cache-warm', args: 'on' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const line = await ui.find({ type: 'Text', text: /Подогрев/ })
  expect(line?.text).toContain('ещё 8 ч')
  expect(line?.text).toContain('накормлено 0 из 8')
  await ui.unmount()
})

test('a warm-up feeds the next guest; a message of the person lets the chef taste', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'cache-warm', args: 'on 2' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await sceneAlt(ui)).toBe('Кухня: накормлено 0 из 2')

  // Nothing was ever said: the first minute's tick warms at once.
  await clock.advance(MIN)
  expect(await sceneSource(ui)).toContain('class="carry"')
  await clock.advance(7000)
  expect(await sceneAlt(ui)).toBe('Кухня: накормлено 1 из 2')
  expect(await sceneSource(ui)).not.toContain('class="carry"')

  await $.prompt.submit({ text: 'вопрос' })
  expect(await sceneSource(ui)).toContain('class="taster"')
  await clock.advance(3600)
  expect(await sceneSource(ui)).not.toContain('class="taster"')
  expect(await sceneAlt(ui)).toBe('Кухня: накормлено 1 из 2')

  const status = await $.command.run({ command: 'cache-warm', args: '' })
  expect(status.text).toContain('Гости: накормлено 1 из 2.')
  await ui.unmount()
})

test('/cache-warm демо feeds every guest in turn, then ends', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const started = await $.command.run({ command: 'cache-warm', args: 'демо 2' })
  expect(started.text).toContain('гостей — 2')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Подогрев, демо · накормлено 0 из 2')

  await clock.advance(1500)
  expect(await sceneSource(ui)).toContain('class="carry"')
  await clock.advance(7000)
  expect(await sceneAlt(ui)).toBe('Кухня: накормлено 1 из 2')

  for (let i = 0; i < 4; i++) await clock.advance(9000)
  expect(toasts).toContain('Демо окончено: накормлено 2 из 2.')
  expect(await sceneAlt(ui)).toBeUndefined()

  const again = await $.command.run({ command: 'cache-warm', args: 'демо стоп' })
  expect(again.text).toBe('Демо и так не идёт.')
  await ui.unmount()
})

test('each hour with nobody fed, the last in the queue leaves hungry', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'cache-warm', args: 'on 3' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  // The person keeps working: a turn every 20 minutes, so no warm-up is due.
  for (let t = 0; t < 2; t++) {
    await $.turn.complete({ answer: 'ответ', durationMs: 1000, isAborted: false, turnId: `t${t}`, reason: 'answer' })
    await clock.advance(20 * MIN)
  }
  await $.turn.complete({ answer: 'ответ', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(19 * MIN)
  expect(await sceneAlt(ui)).toBe('Кухня: накормлено 0 из 3')
  // The tick at the hour: one leaves.
  await clock.advance(MIN)
  expect(await sceneSource(ui)).toContain('class="goaway"')
  await clock.advance(4200)
  expect(await sceneAlt(ui)).toBe('Кухня: накормлено 0 из 3, ушли голодными 1')
  expect(await sceneSource(ui)).not.toContain('class="goaway"')

  const status = await $.command.run({ command: 'cache-warm', args: '' })
  expect(status.text).toContain('Гости: накормлено 0 из 3, ушли голодными 1.')
  await ui.unmount()
})

test('the demo lets every third guest leave hungry', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'cache-warm', args: 'демо 3' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  for (let i = 0; i < 6; i++) await clock.advance(9000)
  expect(toasts).toContain('Демо окончено: накормлено 2 из 3, ушли голодными 1.')
  await ui.unmount()
})

test('in English by default; with auto, the words the person types choose the language', { options: { language: 'auto' } }, async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const started = await $.command.run({ command: 'cache-warm', args: 'on 2' })
  expect(started.text).toContain('Cache warming is on for 2 h.')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Cooking, 2 h left')
  expect(await sceneAlt(ui)).toBe('Kitchen: fed 0 of 2')

  await $.prompt.submit({ text: 'Привіт, як справи? Що там із кешем?' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Булькає, ще 2 год')
  await ui.unmount()
})
