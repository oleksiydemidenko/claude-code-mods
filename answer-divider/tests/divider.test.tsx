import type { FoundElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

/** These tests read the Russian texts. */
const RU = { options: { language: 'ru' } } as const

/** The answer's time: a Text on the terminal, a picture's alt on the desktop. */
async function timeOf(ui: { findAll: (q: { type: string }) => Promise<FoundElement[]> }): Promise<string | undefined> {
  for (const el of await ui.findAll({ type: 'Svg' })) {
    // The line's alt is the bare word; the time's has a colon.
    if (/[:：]/.test(String(el.props.alt))) return String(el.props.alt)
  }
  for (const el of await ui.findAll({ type: 'Text' })) {
    if (/^(Время ответа|Response time)/.test(el.text)) return el.text
  }
  return undefined
}

const ANSWER = 'Да, это можно сделать. Вот что я **сделал**:\n\n- мод рисует полосу\n\nВторой абзац ответа, отдельным блоком.'
const START = 'Да, это можно сделать. Вот что я сделал:\n\n- мод рисует полосу'
const INTERIM = 'Сейчас посмотрю, что умеют моды.'

function message(text: string, surface: 'desktop' | 'terminal') {
  return {
    plugin: 'answer-divider',
    component: 'AssistantMessage',
    requestId: `msg-${text.length}`,
    surface,
    props: { text, isFirstOfReply: false },
  } as const
}

async function finishTurn($: Parameters<Parameters<typeof test>[1]>[0]) {
  await $.turn.complete({ answer: ANSWER, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
}

test('final answer gets the line, interim text is dim, later parts are untouched', RU, async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('store.set', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await finishTurn($)

  for (const surface of ['desktop', 'terminal'] as const) {
    const start = await $.ui.mount(message(START, surface))
    if (surface === 'desktop') {
      const line = await start.find({ type: 'Svg' })
      expect(line?.props.alt).toBe('ОТВЕТ')
      // The wave by default.
      expect(String(line?.props.source)).toContain('<path')
      expect(String(line?.props.source)).not.toContain('<polygon')
    } else {
      expect((await start.find({ type: 'Text', text: /ОТВЕТ/ }))?.text).toContain('∿ ОТВЕТ ∿')
    }
    expect((await start.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    // The start of a two-block answer carries no time; the end carries it.
    expect(await timeOf(start)).toBeUndefined()
    await start.unmount()

    const later = await $.ui.mount(message('Второй абзац ответа, отдельным блоком.', surface))
    expect((await later.findAll({ type: 'Svg' })).some(svg => svg.props.alt === 'ОТВЕТ')).toBe(false)
    expect((await later.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    expect(await timeOf(later)).toBe('Время ответа: 1 с')
    await later.unmount()

    const interim = await $.ui.mount(message(INTERIM, surface))
    const dim = await interim.find({ type: 'Markdown' })
    expect(dim?.props.dimColor).toBe(true)
    expect(dim?.text).toBe(INTERIM)
    await interim.unmount()
  }
})

test('/answer-line switches between triangles and the wave', RU, async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('store.set', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await finishTurn($)

  const tri = await $.command.run({ command: 'answer-line', args: 'треугольники' })
  expect(tri.text).toBe('Линия над ответом: треугольники.')
  let ui = await $.ui.mount(message(START, 'desktop'))
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('<polygon')
  await ui.unmount()

  ui = await $.ui.mount(message(START, 'terminal'))
  expect((await ui.find({ type: 'Text', text: /ОТВЕТ/ }))?.text).toContain('▾ ОТВЕТ ▾')
  await ui.unmount()

  const toggled = await $.command.run({ command: 'answer-line', args: '' })
  expect(toggled.text).toBe('Линия над ответом: волнистая линия.')
  ui = await $.ui.mount(message(START, 'desktop'))
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('<path')
  await ui.unmount()

  const wrong = await $.command.run({ command: 'answer-line', args: 'круги' })
  expect(wrong.text).toContain('Не понял')
})

test('answers and the chosen line from an earlier session are read back', RU, async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'answer-line' } }))
  on('store.get', (_, e) => ({ value: e.key === 'line' ? 'triangles' : ['Старый ответ из прошлой сессии'] }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const old = await $.ui.mount(message('Старый ответ из прошлой сессии', 'desktop'))
  const line = await old.find({ type: 'Svg' })
  expect(line?.props.alt).toBe('ОТВЕТ')
  expect(String(line?.props.source)).toContain('<polygon')
  await old.unmount()
})

test('a one-block answer gets the line above and the time below', RU, async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('store.set', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.turn.complete({
    answer: 'Короткий ответ в одном блоке.',
    durationMs: 185_000,
    isAborted: false,
    turnId: 't2',
    reason: 'answer',
  })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(message('Короткий ответ в одном блоке.', surface))
    expect(await timeOf(ui)).toBe('Время ответа: 3 мин 5 с')
    if (surface === 'desktop') expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('ОТВЕТ')
    await ui.unmount()
  }
})

test('in English by default; an answer in another language switches the words', async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('store.set', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.turn.complete({ answer: 'A short answer in one block.', durationMs: 185_000, isAborted: false, turnId: 'e1', reason: 'answer' })
  const ui = await $.ui.mount(message('A short answer in one block.', 'desktop'))
  expect(await timeOf(ui)).toBe('Response time: 3 min 5 s')
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('ANSWER')
  await ui.unmount()

  await $.turn.complete({ answer: 'Kurze Antwort, und das ist nicht schwer.', durationMs: 12_000, isAborted: false, turnId: 'e2', reason: 'answer' })
  const de = await $.ui.mount(message('Kurze Antwort, und das ist nicht schwer.', 'desktop'))
  expect(await timeOf(de)).toBe('Antwortzeit: 12 s')
  expect((await de.find({ type: 'Svg' }))?.props.alt).toBe('ANTWORT')
  await de.unmount()
})
