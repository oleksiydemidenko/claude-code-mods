/** Warming of this session's cache: on until `until` (ms since the epoch). */
export type CacheWarm = {
  until: number
  /** When the warming was switched on. */
  startedAt: number
  /** How many warm-ups ran. */
  count: number
  /** What the last warm-up came to (older versions kept it in words). */
  last: Note | string | null
  /** Guests in the kitchen's queue: one for each hour of warming (absent in older state). */
  guests?: number
  /** How many of them were fed: one for each warm-up. */
  served?: number
  /** How many left unfed: each hour that passed with nobody fed, one leaves. */
  left?: number
  /** How many times the session's process stopped and started again while warming was on (whatever the cause). */
  pauses?: number
}

/** What a warm-up came to: tokens read, the cache rewritten, nothing to warm yet, or a failure. */
export type Note =
  | { kind: 'read'; tokens: number }
  | { kind: 'cold'; tokens: number }
  | { kind: 'nothing' }
  | { kind: 'failed'; reason: string }

/** A one-off run the kitchen is playing: feeding the next guest, or the chef tasting. */
export type Run = { kind: 'serving' | 'taste' | 'leaving'; id: number }

/**
 * What the kitchen picture shows, written in one go whenever it changes, so
 * the picture changes once; `at` is when this scene began.
 */
export type Stage = { mode: 'idle' | 'serving' | 'taste' | 'leaving'; guests: number; served: number; at: number }

/** /cache-warm демо: a pretend shift; every third step a guest leaves unfed. */
export type Demo = { guests: number; served: number; left: number; step: number }

/** Where the indicator shows: the band above the prompt, the gray status line, or both. */
export type Display = 'band' | 'status' | 'both'

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': {
      /** When the main thread last talked to the model (ms), or 0 if unknown. */
      lastActivity: number
      /** Warming, or null while off (kept per session in the store, so a restarted process keeps it). */
      warm: CacheWarm | null
      /** When the guard last held a message back (ms), or 0. */
      heldAt: number
      /** The run the kitchen is playing, or null. */
      run: Run | null
      /** What the kitchen picture shows, or null while there is no kitchen. */
      stage: Stage | null
      /** The demo shift, or null. */
      demo: Demo | null
      /** The clock at the last minute tick (ms), so the band's time left redraws. */
      clockAt: number
      /** Where the indicator shows while warming is on (kept across sessions in the store). */
      display: Display
    }
  }
}
