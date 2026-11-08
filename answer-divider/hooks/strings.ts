// Everything answer-divider says, in each language it speaks.

import type { LineStyle } from '../types'
import type { Lang } from './i18n'

export type Strings = {
  /** The word in the middle of the line above the answer. */
  label: string
  responseTime: (d: string) => string
  cmdDescription: string
  styleNames: Record<LineStyle, string>
  lineSet: (name: string) => string
  notUnderstood: (word: string) => string
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    label: 'ANSWER',
    responseTime: d => `Response time: ${d}`,
    cmdDescription: 'The line above the answer: wave or triangles (alone: switch)',
    styleNames: { wave: 'wavy line', triangles: 'triangles' },
    lineSet: n => `Line above the answer: ${n}.`,
    notUnderstood: w => `Didn't get "${w}". Options: wave or triangles.`,
  },
  ru: {
    label: 'ОТВЕТ',
    responseTime: d => `Время ответа: ${d}`,
    cmdDescription: 'Линия над ответом: волнистая или из треугольников (без слова — переключить)',
    styleNames: { wave: 'волнистая линия', triangles: 'треугольники' },
    lineSet: n => `Линия над ответом: ${n}.`,
    notUnderstood: w => `Не понял «${w}». Варианты: wave (волнистая) или triangles (треугольники).`,
  },
  uk: {
    label: 'ВІДПОВІДЬ',
    responseTime: d => `Час відповіді: ${d}`,
    cmdDescription: 'Лінія над відповіддю: хвиляста або з трикутників (без слова — перемкнути)',
    styleNames: { wave: 'хвиляста лінія', triangles: 'трикутники' },
    lineSet: n => `Лінія над відповіддю: ${n}.`,
    notUnderstood: w => `Не зрозумів «${w}». Варіанти: wave (хвиляста) або triangles (трикутники).`,
  },
  be: {
    label: 'АДКАЗ',
    responseTime: d => `Час адказу: ${d}`,
    cmdDescription: 'Лінія над адказам: хвалістая або з трохвугольнікаў (без слова — пераключыць)',
    styleNames: { wave: 'хвалістая лінія', triangles: 'трохвугольнікі' },
    lineSet: n => `Лінія над адказам: ${n}.`,
    notUnderstood: w => `Не зразумеў «${w}». Варыянты: wave (хвалістая) або triangles (трохвугольнікі).`,
  },
  pl: {
    label: 'ODPOWIEDŹ',
    responseTime: d => `Czas odpowiedzi: ${d}`,
    cmdDescription: 'Linia nad odpowiedzią: falista lub z trójkątów (bez słowa: przełącz)',
    styleNames: { wave: 'falista linia', triangles: 'trójkąty' },
    lineSet: n => `Linia nad odpowiedzią: ${n}.`,
    notUnderstood: w => `Nie rozumiem „${w}”. Opcje: wave (falista) lub triangles (trójkąty).`,
  },
  de: {
    label: 'ANTWORT',
    responseTime: d => `Antwortzeit: ${d}`,
    cmdDescription: 'Die Linie über der Antwort: Welle oder Dreiecke (ohne Wort: umschalten)',
    styleNames: { wave: 'Wellenlinie', triangles: 'Dreiecke' },
    lineSet: n => `Linie über der Antwort: ${n}.`,
    notUnderstood: w => `„${w}“ nicht verstanden. Möglich: wave (Welle) oder triangles (Dreiecke).`,
  },
  fr: {
    label: 'RÉPONSE',
    responseTime: d => `Temps de réponse : ${d}`,
    cmdDescription: 'La ligne au-dessus de la réponse : vague ou triangles (seul : bascule)',
    styleNames: { wave: 'ligne ondulée', triangles: 'triangles' },
    lineSet: n => `Ligne au-dessus de la réponse : ${n}.`,
    notUnderstood: w => `Je n’ai pas compris « ${w} ». Choix : wave (vague) ou triangles.`,
  },
  es: {
    label: 'RESPUESTA',
    responseTime: d => `Tiempo de respuesta: ${d}`,
    cmdDescription: 'La línea sobre la respuesta: ondulada o de triángulos (sola: alterna)',
    styleNames: { wave: 'línea ondulada', triangles: 'triángulos' },
    lineSet: n => `Línea sobre la respuesta: ${n}.`,
    notUnderstood: w => `No entendí «${w}». Opciones: wave (ondulada) o triangles (triángulos).`,
  },
  it: {
    label: 'RISPOSTA',
    responseTime: d => `Tempo di risposta: ${d}`,
    cmdDescription: 'La linea sopra la risposta: ondulata o a triangoli (da solo: alterna)',
    styleNames: { wave: 'linea ondulata', triangles: 'triangoli' },
    lineSet: n => `Linea sopra la risposta: ${n}.`,
    notUnderstood: w => `Non ho capito «${w}». Opzioni: wave (ondulata) o triangles (triangoli).`,
  },
  pt: {
    label: 'RESPOSTA',
    responseTime: d => `Tempo de resposta: ${d}`,
    cmdDescription: 'A linha acima da resposta: ondulada ou de triângulos (sozinho: alterna)',
    styleNames: { wave: 'linha ondulada', triangles: 'triângulos' },
    lineSet: n => `Linha acima da resposta: ${n}.`,
    notUnderstood: w => `Não entendi “${w}”. Opções: wave (ondulada) ou triangles (triângulos).`,
  },
  ja: {
    label: '回答',
    responseTime: d => `応答時間：${d}`,
    cmdDescription: '回答の上の線：波線または三角（単独で切り替え）',
    styleNames: { wave: '波線', triangles: '三角' },
    lineSet: n => `回答の上の線：${n}`,
    notUnderstood: w => `「${w}」がわかりません。選択肢：wave（波線）、triangles（三角）`,
  },
  zh: {
    label: '回答',
    responseTime: d => `响应时间：${d}`,
    cmdDescription: '回答上方的线：波浪线或三角形（单独使用则切换）',
    styleNames: { wave: '波浪线', triangles: '三角形' },
    lineSet: n => `回答上方的线：${n}`,
    notUnderstood: w => `没看懂“${w}”。可选：wave（波浪线）、triangles（三角形）`,
  },
  ko: {
    label: '답변',
    responseTime: d => `응답 시간: ${d}`,
    cmdDescription: '답변 위의 선: 물결선 또는 삼각형 (단독으로 전환)',
    styleNames: { wave: '물결선', triangles: '삼각형' },
    lineSet: n => `답변 위의 선: ${n}.`,
    notUnderstood: w => `"${w}"을(를) 이해하지 못했습니다. 선택: wave(물결선), triangles(삼각형)`,
  },
}
