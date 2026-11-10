import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

/** These tests read the Russian texts. */
const RU = { options: { language: 'ru' } } as const

const START = 1_800_000_000_000
const MIN = 60_000

function engine(on: On, tokens: number) {
  const calls = { forks: 0, fills: [] as string[], submitted: [] as string[], origins: [] as string[], toasts: [] as string[] }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'cache-warm' } }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.usage', () => ({
    value: { startedAt: START, context: { tokens, window: 200_000 }, rateLimits: [] },
  }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    calls.toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.start', () => ({}))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.fill', (_, e) => {
    calls.fills.push(e.text)
    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    calls.submitted.push(e.text)
    calls.origins.push(e.origin?.kind ?? 'none')
    return { text: e.text }
  })
  on('model.fork', () => {
    calls.forks += 1
    return {
      value: {
        isAnswered: true,
        text: 'ок',
        usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: tokens, cache_creation_input_tokens: 5 },
      },
    }
  })
  return calls
}

async function finishTurn($: Parameters<Parameters<typeof test>[1]>[0]) {
  await $.turn.complete({ answer: 'готово', durationMs: 1000, isAborted: false, turnId: 't', reason: 'answer' })
}

test('the guard holds back the first message into a cold large session, once', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await finishTurn($)

  await clock.advance(61 * MIN)
  const first = await $.prompt.submit({ text: 'вопрос' })
  expect(first.drop).toContain('Кэш этой сессии остыл')
  expect(first.drop).toContain('120 тыс.')
  expect(calls.submitted).toEqual([])
  await clock.advance(1000)
  expect(calls.fills).toEqual(['вопрос'])

  const second = await $.prompt.submit({ text: 'вопрос' })
  expect(second.drop).toBeUndefined()
  expect(calls.submitted).toEqual(['вопрос'])
})

test('the guard stays quiet in a small session and while the cache is warm', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const calls = engine(on, 10_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await finishTurn($)
  await clock.advance(90 * MIN)
  expect((await $.prompt.submit({ text: 'маленькая' })).drop).toBeUndefined()
  expect(calls.submitted).toEqual(['маленькая'])
})

test('the guard stays quiet while the cache is warm', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await finishTurn($)
  await clock.advance(30 * MIN)
  expect((await $.prompt.submit({ text: 'тёплый' })).drop).toBeUndefined()
  expect(calls.submitted).toEqual(['тёплый'])
})

test('/cache-warm on keeps the cache warm while quiet, then switches itself off', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await finishTurn($)

  const started = await $.command.run({ command: 'cache-warm', args: 'on 2' })
  expect(started.text).toContain('включён на 2 ч')

  await clock.advance(49 * MIN)
  expect(calls.forks).toBe(0)
  await clock.advance(2 * MIN)
  expect(calls.forks).toBe(1)
  await clock.advance(50 * MIN)
  expect(calls.forks).toBe(2)

  // Warming kept the cache fresh, so the guard lets a message straight through.
  expect((await $.prompt.submit({ text: 'после прогрева' })).drop).toBeUndefined()

  await clock.advance(3 * 60 * MIN)
  const forksAtEnd = calls.forks
  await clock.advance(2 * 60 * MIN)
  expect(calls.forks).toBe(forksAtEnd)

  const status = await $.command.run({ command: 'cache-warm', args: '' })
  expect(status.text).toContain('Прогрев кэша выключен.')
})

test('/cache-warm off stops it, and a wrong word is explained', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await finishTurn($)

  await $.command.run({ command: 'cache-warm', args: 'вкл' })
  const off = await $.command.run({ command: 'cache-warm', args: 'off' })
  expect(off.text).toBe('Прогрев кэша выключен.')
  await clock.advance(3 * 60 * MIN)
  expect(calls.forks).toBe(0)

  const wrong = await $.command.run({ command: 'cache-warm', args: 'завтра' })
  expect(wrong.text).toContain('Не понял')
})

/** A store the test can look into: the same hooks mock.store answers. */
function memoryStore(on: On, entries: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...entries }
  on('store.get', (_, e) => ({ value: data[e.key] }))
  on('store.set', (_, e) => {
    data[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete data[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(data) }))
  return data
}

const WARM_3H = { until: START + 3 * 60 * MIN, startedAt: START, count: 0, last: null, guests: 3, served: 0, left: 0 }

test('/cache-warm on is kept in the store for the session, and off removes it', RU, async ($, on) => {
  mock.clock(on, { now: START })
  const store = memoryStore(on)
  engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await finishTurn($)

  await $.command.run({ command: 'cache-warm', args: 'on 3' })
  const kept = store.warm as Record<string, { until: number }>
  expect(kept['session-1']?.until).toBe(START + 3 * 60 * MIN)

  await $.command.run({ command: 'cache-warm', args: 'off' })
  const after = store.warm as Record<string, unknown>
  expect(after['session-1']).toBeUndefined()
})

test('warming comes back on when the app starts a paused session again', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START + 20 * MIN })
  mock.store(on, { lastActivity: { 'session-1': START }, warm: { 'session-1': WARM_3H } })
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(calls.toasts.join('\n')).toContain('Прогрев кэша снова включён')
  expect(calls.toasts.join('\n')).toContain('кэш ещё тёплый')
  const status = await $.command.run({ command: 'cache-warm', args: '' })
  expect(status.text).toContain('Прогрев кэша включён')
  expect(status.text).toContain('Пауз от приложения: 1')

  // Quiet for 50 minutes since the last request: the warm-up runs again.
  await clock.advance(31 * MIN)
  expect(calls.forks).toBe(1)
})

test('after a long pause the person is told the cache went cold', RU, async ($, on) => {
  mock.clock(on, { now: START + 90 * MIN })
  mock.store(on, { lastActivity: { 'session-1': START }, warm: { 'session-1': WARM_3H } })
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls.toasts.join('\n')).toContain('кэш остыл')
})

test('warming that ran out during a pause ends with its note', RU, async ($, on) => {
  mock.clock(on, { now: START + 5 * 60 * MIN })
  const store = memoryStore(on, { lastActivity: { 'session-1': START }, warm: { 'session-1': WARM_3H } })
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(calls.toasts.join('\n')).toContain('Прогрев кэша выключен: прошло 3 ч')
  const status = await $.command.run({ command: 'cache-warm', args: '' })
  expect(status.text).toContain('Прогрев кэша выключен.')
  expect((store.warm as Record<string, unknown>)['session-1']).toBeUndefined()
})

test('a resumed session knows when it last talked to the model', RU, async ($, on) => {
  const clock = mock.clock(on, { now: START + 3 * 60 * MIN })
  mock.store(on, { lastActivity: { 'session-1': START } })
  const calls = engine(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const held = await $.prompt.submit({ text: 'снова здесь' })
  expect(held.drop).toContain('3 ч назад')
  expect(calls.submitted).toEqual([])
  void clock
})
