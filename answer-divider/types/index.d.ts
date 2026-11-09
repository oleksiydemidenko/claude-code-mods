/** A final answer's text, reduced to its plain letters, as the mod compares it. Held in memory only. */
export type AnswerKey = string

/** How the line above the answer is drawn. */
export type LineStyle = 'wave' | 'triangles'

/** The end of a final answer, and how long its turn took. */
export type AnswerEnd = {
  /** The last characters of the answer, reduced to plain letters. */
  tail: string
  /** The turn's length, from the prompt to the end of the answer, in ms. */
  ms: number
}

declare module 'claude-code' {
  interface PluginState {
    'answer-divider': { answers: AnswerKey[]; line: LineStyle; ends: AnswerEnd[] }
  }
}
