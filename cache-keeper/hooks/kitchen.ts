import { textWidth } from './i18n'

// The cache kitchen, drawn in the band above the prompt while warming is on.
// The cache kitchen: a chef at a pot on a fire, and a row of guests.
// Plain functions that return SVG text; the mod draws it as an Svg element.
// The look: flat rounded shapes in one colour, like the pot icon. Orange on a
// dark theme, light grays on a light one (the fire stays orange).

/** The height the shapes are drawn at; the band shows them scaled to BAND_H. */
const H = 44
/** The band's own height. */
export const BAND_H = 36
const S = BAND_H / H
const SCALE = `scale(${S})`
// Layout, in CSS pixels. The scene is as wide as the band: the pot and the
// chef at its left end, the queue against its right end, so every serving is
// a walk across the band and back.
const POT_X = 3
/** The chef stands a step away from the pot: the ladle hovers between them, at his side, touching nothing. */
const CHEF_X = POT_X + 38
const SLOT = 22
const BODY_W = 18
const RIGHT_PAD = 4

/**
 * Serving, in milliseconds from its start. The walk with the bowl is slow
 * (5.88 s); the rest keeps the pace of the other runs.
 */
const SERVE = {
  lidOpen: 420,
  toPot: 980,
  leavePot: 1330,
  home: 1680,
  walkStart: 1540,
  arrive: 1540 + 5880,
  handedOver: 1540 + 5880 + 420,
  backHome: 1540 + 5880 + 420 + 2100,
}
export const SERVE_MS = SERVE.backHome + 1060
const pct = (ms: number): number => Math.round((ms / SERVE_MS) * 10000) / 100
export const TASTE_MS = 5600
export const LEAVE_MS = 4200

/** A waypoint: at `at` % of the run, translate (x, y) px and rotate r degrees. */
type Way = [at: number, x: number, y: number, r: number]

/**
 * Keyframes through the waypoints along a smooth curve (a Hermite spline with
 * Catmull-Rom tangents), sampled every 1%, so a move flows through its middle
 * points without stopping. A waypoint repeated in place is a pause, which the
 * curve eases into and out of. Played with a linear timing function.
 */
function curve(name: string, ways: Way[]): string {
  const same = (a: Way, b: Way): boolean => a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
  const slope = (i: number, k: 1 | 2 | 3): number => {
    const prev = ways[i - 1]
    const next = ways[i + 1]
    if (prev === undefined || next === undefined || same(prev, ways[i]) || same(next, ways[i])) return 0
    return (next[k] - prev[k]) / (next[0] - prev[0])
  }
  const fmt = (v: number): string => String(Math.round(v * 100) / 100)
  const frame = (at: number, x: number, y: number, r: number): string =>
    `${fmt(at)}%{transform:translate(${fmt(x)}px,${fmt(y)}px) rotate(${fmt(r)}deg)}`
  let out = `@keyframes ${name}{`
  for (let i = 0; i < ways.length - 1; i++) {
    const a = ways[i]
    const b = ways[i + 1]
    const dt = b[0] - a[0]
    out += frame(a[0], a[1], a[2], a[3])
    if (same(a, b) || dt <= 0) continue
    for (let at = Math.floor(a[0]) + 1; at < b[0]; at++) {
      const u = (at - a[0]) / dt
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1
      const h10 = u ** 3 - 2 * u ** 2 + u
      const h01 = -2 * u ** 3 + 3 * u ** 2
      const h11 = u ** 3 - u ** 2
      const v = (k: 1 | 2 | 3): number => h00 * a[k] + h10 * dt * slope(i, k) + h01 * b[k] + h11 * dt * slope(i + 1, k)
      out += frame(at, v(1), v(2), v(3))
    }
  }
  const z = ways[ways.length - 1]
  return out + frame(z[0], z[1], z[2], z[3]) + '}'
}

/**
 * The lid's keyframes for a run of `total` ms: shut until `shut1`, lifted off by
 * `open1`, hovering in the air and bobbing slowly up and down (with a slight
 * tilt) until `open2`, back on the pot by `shut2`.
 */
function lidCurve(name: string, total: number, shut1: number, open1: number, open2: number, shut2: number): string {
  const at = (ms: number): number => Math.round((ms / total) * 10000) / 100
  // Lifted almost straight up with a light tilt: fully inside the picture and
  // clear of the ladle even at the top and bottom of its sway.
  const OPEN: [number, number, number] = [-1.8, -16, -12]
  const half = 1200
  const ways: Way[] = [[0, 0, 0, 0], [at(shut1), 0, 0, 0], [at(open1), ...OPEN]]
  let up = true
  for (let t = open1 + half; t < open2 - half * 0.6; t += half) {
    ways.push([at(t), -1.8, up ? -17.5 : -14.5, up ? -10 : -14])
    up = !up
  }
  ways.push([at(open2), ...OPEN], [at(shut2), 0, 0, 0])
  if (shut2 < total) ways.push([100, 0, 0, 0])
  return curve(name, ways)
}

/** CSS ease-in-out, cubic-bezier(.42, 0, .58, 1), at progress t. */
function easeInOut(t: number): number {
  const bez = (u: number, p1: number, p2: number): number => 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u ** 2 * p2 + u ** 3
  let lo = 0
  let hi = 1
  let u = t
  for (let n = 0; n < 30; n++) {
    u = (lo + hi) / 2
    if (bez(u, 0.42, 0.58) < t) lo = u
    else hi = u
  }
  return bez(u, 0, 1)
}

/** Where a floating guest is (px up from rest, negative) at `sec` into the float: as `.bob` draws it. */
function floatAt(sec: number): number {
  const u = ((((sec % 3.6) + 3.6) % 3.6) / 3.6)
  return u < 0.5 ? -6 * easeInOut(u * 2) : -6 * (1 - easeInOut((u - 0.5) * 2))
}

// --- Animations ----------------------------------------------------------------

/**
 * The never-ending loops (fire, steam, floating, bobbing, hearts) are timed
 * from the clock, not from when the picture loaded: each scene is drawn with
 * the time it began, so when one scene gives way to the next every loop goes
 * on from where it was.
 */
let phaseSeconds = 0
function delay(period: number, offset = 0): string {
  const p = (((phaseSeconds + offset) % period) + period) % period
  return `animation-delay:-${p.toFixed(2)}s`
}


const BASE_CSS =
  '.fl{transform-box:fill-box;transform-origin:50% 100%;animation:fl .5s ease-in-out infinite alternate}' +
  '@keyframes fl{from{transform:scaleY(.65) scaleX(.9)}to{transform:scaleY(1.1) scaleX(1.05)}}' +
  '.st{opacity:0;animation:rise 2.6s ease-in infinite}' +
  '@keyframes rise{0%{transform:translateY(2px);opacity:0}35%{opacity:.8}100%{transform:translateY(-6px);opacity:0}}' +
  '.st.open{animation-duration:1.5s}' +
  // Guests in the queue float, as in water: slowly up and down, each on its own beat.
  '.bob{animation:bob 3.6s ease-in-out infinite}' +
  '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
  // Now and then a heart floats up over a diner; the diners themselves sit still.
  '.love{opacity:0;animation:love 6.5s ease-in-out infinite}' +
  // One unbroken rise from start to end, slowing gently at the top (ease-out circ);
  // the fade in and out runs on its own keyframes and does not break the motion.
  '@keyframes love{0%,60%{opacity:0;transform:translateY(2px);animation-timing-function:cubic-bezier(0,.55,.45,1)}72%{opacity:.95}86%{opacity:.95}100%{opacity:0;transform:translateY(-8.5px)}}' +
  // The chef's idle round, 9 s: lid off; chef and ladle go to the pot together;
  // the ladle stirs deep; they come back together; lid on.
  // The chef always bobs a little, as slowly as the guests float.
  '.waddle{animation:waddle 3.4s ease-in-out infinite}' +
  '@keyframes waddle{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}' +
  '.lid-idle{transform-box:fill-box;transform-origin:50% 100%;animation:lididle 9s linear infinite}' +
  lidCurve('lididle', 9000, 540, 1080, 6120, 6660) +
  '.ladle-idle{transform-box:fill-box;transform-origin:31% 90%;animation:stir 9s linear infinite}' +
  '.hover{transform-box:fill-box;transform-origin:40% 90%;animation:hover 2.6s ease-in-out infinite}' +
  '@keyframes hover{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-1px) rotate(2deg)}}' +
  '.chef-idle{transform-box:fill-box;transform-origin:50% 100%;animation:approach 9s linear infinite}' +
  curve('approach', [[0, 0, 0, 0], [12, 0, 0, 0], [18, -5, -2, 0], [24, -10, -4, 0], [54, -10, -4, 0], [60, -5, -2, 0], [66, 0, 0, 0], [100, 0, 0, 0]]) +
  curve('stir', [[0, 14.5, 10.5, 0], [12, 14.5, 10.5, 0], [17, 12.5, -2, -5], [24, 2, 0, 0], [28, 0, 6, 0], [33, -4, 6.5, 8], [38, 0, 6, 0], [43, -4, 6.5, 8], [48, 0, 6, 0], [54, 2, 0, 0], [60, 12.5, -2, 5], [66, 14.5, 10.5, 0], [100, 14.5, 10.5, 0]])

/** The run that feeds one guest: to the queue and back, bobbing on the way. */
function serveCss(): string {
  const S = SERVE
  const B = S.backHome
  // Bobbing steps while walking: out with the bowl, and back.
  let bob = '@keyframes walkbob{0%{transform:translateY(0)}'
  let up = true
  for (const [from, to] of [[S.walkStart, S.arrive], [S.handedOver, S.backHome]]) {
    for (let t = from; t <= to; t += 140) {
      bob += `${pct(t)}%{transform:translateY(${up ? -1.5 : 0}px)}`
      up = !up
    }
    bob += `${pct(to + 1)}%{transform:translateY(0)}`
  }
  bob += '100%{transform:translateY(0)}}'
  const HAND: [number, number, number] = [14.5, 10.5, 0]
  const ms = SERVE_MS
  return (
    bob +
    `@keyframes carry{0%,${pct(1470)}%{opacity:0}${pct(1480)}%,${pct(S.arrive)}%{opacity:1}${pct(S.arrive + 70)}%,100%{opacity:0}}` +
    // The bowl is handed over on arrival: the table with it fades in, and the
    // same guest glides down to it from wherever they were floating (lander).
    `@keyframes tablein{0%,${pct(S.arrive - 140)}%{opacity:0}${pct(S.arrive + 900)}%,100%{opacity:1}}` +
    `@keyframes tuck{0%,${pct(S.arrive + 300)}%{opacity:1}${pct(S.arrive + 1300)}%,100%{opacity:0}}` +
    lidCurve('lidserve', SERVE_MS, 0, S.lidOpen, B + 640, SERVE_MS) +
    curve('ladleserve', [
      [0, ...HAND], [pct(S.lidOpen), ...HAND], [pct(700), 12.5, -2, -5], [pct(S.toPot), 2, 0, 0], [pct(1260), 0, 6, 0],
      [pct(B), 0, 6, 0], [pct(B + 350), 2, 0, 0], [pct(B + 560), 12.5, -2, 5], [pct(B + 770), ...HAND], [100, ...HAND],
    ]) +
    curve('chefserve', [
      [0, 0, 0, 0], [pct(S.lidOpen), 0, 0, 0], [pct(700), -4, -2, 0], [pct(S.toPot), -8, -4, 0], [pct(S.leavePot), -8, -4, 0],
      [pct(S.home), 0, 0, 0], [pct(B), 0, 0, 0], [pct(B + 175), -4, -2, 0], [pct(B + 350), -8, -4, 0], [pct(B + 560), -4, -2, 0],
      [pct(B + 770), 0, 0, 0], [100, 0, 0, 0],
    ]) +
    `.walkbob{animation:walkbob ${ms}ms linear 1 forwards}` +
    `.carry{opacity:0;animation:carry ${ms}ms linear 1 forwards}` +
    `.tablein{opacity:0;animation:tablein ${ms}ms ease-in-out 1 forwards}` +
    `.tuck{animation:tuck ${ms}ms ease-in-out 1 forwards}` +
    `.lid-run{transform-box:fill-box;transform-origin:50% 100%;animation:lidserve ${ms}ms linear 1 forwards}` +
    `.ladle-run{transform-box:fill-box;transform-origin:31% 90%;animation:ladleserve ${ms}ms linear 1 forwards}` +
    `.chef-serve{transform-box:fill-box;transform-origin:50% 100%;animation:chefserve ${ms}ms linear 1 forwards}`
  )
}

/**
 * The chef's walk to the queue and back. The band's width is not known here,
 * so the walk is two SMIL animations kept in step: a nested svg moves from 0%
 * to 100% of the width, and a group inside it moves back by the queue's
 * width, so he stops just before the first guest.
 */
function walkSmil(back: number, inner: string): string {
  const ms = SERVE_MS
  const S = SERVE
  // Each leg: a gentle start (speed rising evenly), a steady pace, a gentle stop,
  // with no jump in speed between them. `ramp` is how long the start and the stop
  // take; `f` is the share of the way covered while speeding up (and slowing down).
  const legs = [
    { from: S.walkStart, to: S.arrive, ramp: 1000, out: true },
    { from: S.handedOver, to: S.backHome, ramp: 600, out: false },
  ]
  const times: number[] = [0]
  const share: number[] = [0] // how far along the walk out (0) to the queue (1)
  const HOLD = '0 0 1 1'
  const splines: string[] = []
  for (const leg of legs) {
    const f = leg.ramp / (2 * (leg.to - leg.from - leg.ramp))
    const along = leg.out ? [f, 1 - f, 1] : [1 - f, f, 0]
    times.push(leg.from, leg.from + leg.ramp, leg.to - leg.ramp, leg.to)
    share.push(share[share.length - 1], ...along)
    // A hold before the leg, then: speeding up (s = u squared), steady, slowing down.
    splines.push(HOLD, '.3333 0 .6667 .3333', HOLD, '.3333 .6667 .6667 1')
  }
  times.push(ms)
  share.push(0)
  splines.push(HOLD)
  const k = (t: number): string => String(Math.round((t / ms) * 100000) / 100000)
  const timing = `keyTimes="${times.map(k).join(';')}" calcMode="spline" keySplines="${splines.join(';')}"`
  const xs = share.map(v => `${Math.round(v * 10000) / 100}%`).join(';')
  const backs = share.map(v => `${Math.round(-v * back * 100) / 100} 0`).join(';')
  return (
    `<svg x="0" y="0" width="1" height="${BAND_H}" overflow="visible">` +
    `<animate attributeName="x" values="${xs}" ${timing} dur="${ms}ms" fill="freeze"/>` +
    `<g><animateTransform attributeName="transform" type="translate" values="${backs}" ${timing} dur="${ms}ms" fill="freeze"/>` +
    inner +
    `</g></svg>`
  )
}

/**
 * A guest who was not fed in time leaves: the last in the queue walks off past
 * the right end, then the rest of the row closes up towards it by one place.
 */
function leaveCss(): string {
  const ms = LEAVE_MS
  return (
    '@keyframes goaway{0%,8%{transform:translateX(0);opacity:1}50%{opacity:1}62%,100%{transform:translateX(30px);opacity:0}}' +
    `@keyframes closeup{0%,58%{transform:translateX(0)}92%,100%{transform:translateX(${SLOT}px)}}` +
    `.goaway{animation:goaway ${ms}ms ease-in 1 forwards}` +
    `.closeup{animation:closeup ${ms}ms ease-in-out 1 forwards}`
  )
}

/** The chef's own taste, when the person sends a message while warming is on. */
function tasteCss(): string {
  const ms = TASTE_MS
  return (
    lidCurve('lidtaste', TASTE_MS, 0, 336, 4480, 5040) +
    // Chef and ladle go to the pot together; the ladle dips, then comes up
    // tipped towards him a little way from his mouth as he rises to it; they
    // come back together and end in the idle pose.
    curve('ladletaste', [[0, 14.5, 10.5, 0], [6, 14.5, 10.5, 0], [11, 12.5, -2, -5], [16, 2, 0, 0], [21, 0, 6, 0], [26, 2, 0, 0], [38, 12, -4, -20], [62, 12, -4, -20], [71, 15, 1.5, -8], [80, 14.5, 10.5, 0], [100, 14.5, 10.5, 0]]) +
    curve('chew', [[0, 0, 0, 0], [6, 0, 0, 0], [11, -4, -2, 0], [16, -8, -4, 0], [26, -8, -4, 0], [38, -6, -10, 0], [44, -6, -8.5, 0], [50, -6, -10, 0], [56, -6, -8.5, 0], [62, -6, -10, 0], [71, -3, -5, 0], [80, 0, 0, 0], [100, 0, 0, 0]]) +
    '@keyframes yum{0%,46%{opacity:0;transform:translateY(2px)}54%{opacity:1}72%{opacity:1;transform:translateY(-4px)}80%,100%{opacity:0;transform:translateY(-6px)}}' +
    `.lid-run{transform-box:fill-box;transform-origin:50% 100%;animation:lidtaste ${ms}ms linear 1 forwards}` +
    `.ladle-run{transform-box:fill-box;transform-origin:31% 90%;animation:ladletaste ${ms}ms linear 1 forwards}` +
    `.taster{transform-box:fill-box;transform-origin:50% 100%;animation:chew ${ms}ms linear 1 forwards}` +
    `.yum{opacity:0;animation:yum ${ms}ms ease-out 1 forwards}`
  )
}

// --- The shapes ----------------------------------------------------------------

const DARK_CSS =
  '.m{fill:#f2a65e}.p{fill:#f6c99c}.e{fill:#30302e}.sk{fill:none;stroke:#f2a65e;stroke-width:2;stroke-linecap:round}' +
  '.g0{fill:#f2a65e}.g1{fill:#e8955a}.g2{fill:#f5b67e}.g3{fill:#eda068}' +
  '.tb{fill:#c98a5a}.sw{fill:none;stroke:#f6bf8c;stroke-width:1.3;stroke-linecap:round}.hr{fill:#f39a86}'

// The light theme's grays: main (pot, lid, ladle, chef), the
// guests' four tints, the toque and bowls, the tables, the steam.
const LIGHT = { main: '#b5b2ab', guests: ['#b5b2ab', '#bebbb4', '#c7c4bd', '#aca9a2'], pale: '#dad7cf', table: '#c2bfb8', steam: '#d3d0c9' }

function lineCss(): string {
  const L = LIGHT
  return (
    DARK_CSS +
    '@media (prefers-color-scheme:light){' +
    `.m{fill:${L.main}}.sk{stroke:${L.main}}.p{fill:${L.pale}}.e{fill:#f0eee6}` +
    L.guests.map((g, i) => `.g${i}{fill:${g}}`).join('') +
    `.tb{fill:${L.table}}.sw{stroke:${L.steam}}.hr{fill:#d9a497}}`
  )
}

const LINE_GUESTS = ['g0', 'g1', 'g2', 'g3']

/** The body: a rounded block with two eyes, arm nubs and four short legs. */
function lineBody(x: number, y: number, cls: string, legs = true, legsClass = ''): string {
  let out =
    `<rect class="${cls}" x="${x + 2}" y="${y}" width="14" height="10" rx="3.5"/>` +
    `<rect class="${cls}" x="${x}" y="${y + 4.5}" width="4" height="2.6" rx="1.3"/>` +
    `<rect class="${cls}" x="${x + 14}" y="${y + 4.5}" width="4" height="2.6" rx="1.3"/>` +
    `<rect class="e" x="${x + 5.6}" y="${y + 2.6}" width="1.8" height="3.2" rx=".9"/>` +
    `<rect class="e" x="${x + 10.6}" y="${y + 2.6}" width="1.8" height="3.2" rx=".9"/>`
  if (legs) {
    let feet = ''
    for (const lx of [4.5, 7.8, 10.2, 13.5]) {
      feet += `<rect class="${cls}" x="${x + lx - 0.9}" y="${y + 9}" width="1.8" height="5" rx=".9"/>`
    }
    out += legsClass === '' ? feet : `<g class="${legsClass}">${feet}</g>`
  }
  return out
}

function lineBowl(x: number, y: number): string {
  return (
    `<path class="p" d="M${x} ${y}h7a3.5 3.2 0 0 1-7 0z"/>` +
    `<rect class="m" x="${x + 0.6}" y="${y - 1}" width="5.8" height="1.2" rx=".6"/>`
  )
}

const LINE = {
  fire(): string {
    const t = (x: number, h: number, w: number, d: number, cls: string): string =>
      `<path class="fl" style="${delay(1, -d)}" fill="${cls}" d="M${x} 43.5q-${w} -${h * 0.45} 0 -${h}q${w} ${h * 0.55} 0 ${h}z"/>`
    return t(POT_X + 7, 5, 2.2, 0, '#ff7a2f') + t(POT_X + 11, 7, 2.8, 0.17, '#ffb03a') + t(POT_X + 15, 5, 2.2, 0.34, '#ff7a2f')
  },
  pot(): string {
    const x = POT_X
    return (
      `<path class="m" d="M${x + 1} 26h20v6a5 5 0 0 1-5 5h-10a5 5 0 0 1-5-5z"/>` +
      `<rect class="m" x="${x - 2.5}" y="27.5" width="4" height="2" rx="1"/>` +
      `<rect class="m" x="${x + 20.5}" y="27.5" width="4" height="2" rx="1"/>`
    )
  },
  lid(cls: string): string {
    const x = POT_X
    return `<g class="${cls}"><rect class="m" x="${x}" y="23" width="22" height="2.4" rx="1.2"/><rect class="m" x="${x + 9.4}" y="20.8" width="3.2" height="2.4" rx="1.2"/></g>`
  },
  ladle(cls: string): string {
    // A round bowl at the bottom of the handle. It is drawn before the pot, so
    // deep in the pot only the handle shows; between stirs it hovers beside
    // the chef (the animations move it there).
    return (
      `<g class="hover" style="${delay(2.6)}"><g class="${cls}">` +
      `<path class="m" d="M${POT_X + 11.8} 25a3.2 3.2 0 0 0 6.4 0z"/>` +
      `<path class="sk" d="M${POT_X + 18} 25.2L${POT_X + 19.5} 12.5"/><path class="sk" d="M${POT_X + 19.5} 12.5l2.5 .6"/>` +
      `</g></g>`
    )
  },
  steam(cls: string): string {
    const w = (x: number, d: number): string =>
      `<path class="st sw ${cls}" style="${delay(2.6, 2.6 - d)}" d="M${x} 19c-1.6-1.3 1.6-2.2 0-3.6s1.6-2.2 0-3.6"/>`
    return w(POT_X + 6, 0) + w(POT_X + 11, 0.85) + w(POT_X + 16, 1.7)
  },
  chef(inner: string): string {
    const x = CHEF_X
    return (
      // The toque: three puffs over a band.
      `<circle class="p" cx="${x + 5.5}" cy="19.5" r="3.6"/><circle class="p" cx="${x + 9}" cy="18" r="4"/><circle class="p" cx="${x + 12.5}" cy="19.5" r="3.6"/>` +
      `<rect class="p" x="${x + 4}" y="19.5" width="10" height="7" rx="1"/>` +
      lineBody(x, 28, 'm') +
      inner
    )
  },
  /** The chef, waddling. */
  waddler(inner: string): string {
    return `<g class="waddle" style="${delay(3.4)}">${this.chef(inner)}</g>`
  },
  carried(): string {
    return lineBowl(CHEF_X + 15, 33)
  },
  yum(): string {
    // A small heart beside the head; it rises with the chef.
    const x = CHEF_X + 20
    return `<path class="yum hr" d="M${x} 22c-1.6-1.6-4-.4-3 1.6l3 3 3-3c1-2-1.4-3.2-3-1.6z"/>`
  },
  /** The guest about to be fed. */
  lander(i: number, x: number): string {
    // Floats on exactly as the queue does (from the same clock) until the bowl
    // arrives, then glides from wherever it is down to its seat at the table,
    // carrying on with the speed it had, while its legs tuck away.
    const body = lineBody(x, 28, LINE_GUESTS[i % LINE_GUESTS.length], true, 'tuck')
    const off = (i * 1.27) % 3.6
    const y = (ms: number): number => floatAt(phaseSeconds + off + ms / 1000)
    const g0 = SERVE.arrive + 200
    const g1 = SERVE.arrive + 1500
    const seat = -1
    const step = SERVE_MS / 200
    const v0 = (y(g0 + 10) - y(g0 - 10)) / 20
    let kf = `@keyframes land${i}{`
    for (let ms = 0; ms < g0; ms += step) kf += `${pct(ms)}%{transform:translateY(${y(ms).toFixed(2)}px)}`
    const d = g1 - g0
    for (let ms = g0; ms < g1; ms += step) {
      const u = (ms - g0) / d
      const v = (2 * u ** 3 - 3 * u ** 2 + 1) * y(g0) + (u ** 3 - 2 * u ** 2 + u) * d * v0 + (-2 * u ** 3 + 3 * u ** 2) * seat
      kf += `${pct(ms)}%{transform:translateY(${v.toFixed(2)}px)}`
    }
    kf += `${pct(g1)}%,100%{transform:translateY(${seat}px)}}`
    return `<style>${kf}.land${i}{animation:land${i} ${SERVE_MS}ms linear 1 forwards}</style><g class="land${i}">${body}</g>`
  },
  standing(i: number, x: number): string {
    return `<g class="bob" style="${delay(3.6, (i * 1.27) % 3.6)}">${lineBody(x, 28, LINE_GUESTS[i % LINE_GUESTS.length])}</g>`
  },
  seated(i: number, x: number): string {
    return this.diner(i, x) + this.table(i, x)
  },
  /** A guest sitting at the table to eat, still. */
  diner(i: number, x: number): string {
    return lineBody(x, 27, LINE_GUESTS[i % LINE_GUESTS.length], false)
  },
  /** The guest's table with a bowl of soup, and the heart that floats up now and then. */
  table(i: number, x: number): string {
    return (
      `<rect class="tb" x="${x - 1}" y="36.5" width="20" height="1.8" rx=".9"/>` +
      `<rect class="tb" x="${x + 1}" y="37.5" width="1.6" height="6" rx=".8"/>` +
      `<rect class="tb" x="${x + 15.4}" y="37.5" width="1.6" height="6" rx=".8"/>` +
      lineBowl(x + 5.5, 34.5) +
      `<path class="love hr" style="${delay(6.5, (i * 2.3) % 6.5)}" d="M${x + 9} 20.6c-1.4-1.5-3.6-.4-2.7 1.4l2.7 2.7 2.7-2.7c.9-1.8-1.3-2.9-2.7-1.4z"/>`
    )
  },
}



/**
 * The scene. `guests`: how many are still here (one for each hour of warming,
 * less those who left). `served`: how many of them sit and eat. `mode`:
 * 'idle'; 'serving', the run that feeds guest number `served` (the mod draws
 * `served + 1` once it ends); 'taste', the chef tasting it himself (the person
 * sent a message); 'leaving', the last in the queue leaves unfed (the mod
 * draws one guest fewer once it ends).
 */
export type KitchenMode = 'idle' | 'serving' | 'taste' | 'leaving'

export function kitchenSvg({
  guests,
  served,
  mode = 'idle',
  epoch = 0,
}: {
  guests: number
  served: number
  mode?: KitchenMode
  /** When this scene began (ms): the loops are timed from it. */
  epoch?: number
}) {
  phaseSeconds = epoch / 1000
  const L = LINE
  const n = Math.max(0, Math.min(24, guests))
  const fed = Math.max(0, Math.min(n, served))
  const run: KitchenMode =
    mode === 'serving' && fed < n
      ? 'serving'
      : mode === 'leaving' && fed < n
        ? 'leaving'
        : mode === 'taste'
          ? 'taste'
          : 'idle'
  // The queue stands against the right end: its first guest (the leftmost,
  // the one the chef walks up to) is served first, then the next to the right.
  const queueW = n * SLOT + RIGHT_PAD
  /** The narrowest the band can be with the whole queue still clear of the chef. */
  const minWidth = Math.ceil((CHEF_X + BODY_W + 24 + queueW) * S)

  let people = ''
  for (let i = 0; i < n; i++) {
    const x = 2 + i * SLOT
    if (i < fed) people += L.seated(i, x)
    else if (run === 'serving' && i === fed) {
      people += `${L.lander(i, x)}<g class="tablein">${L.table(i, x)}</g>`
    }
    else if (run === 'leaving' && i === n - 1) continue
    else people += L.standing(i, x)
  }
  if (run === 'leaving') {
    people = `<g class="closeup">${people}</g><g class="goaway">${L.standing(n - 1, 2 + (n - 1) * SLOT)}</g>`
  }
  const queue = `<svg x="100%" y="0" width="1" height="${BAND_H}" overflow="visible"><g transform="translate(${-queueW * S} 0) ${SCALE}">${people}</g></svg>`

  let chefDrawn: string
  if (run === 'serving') {
    const back = (queueW + CHEF_X + BODY_W + 2) * S
    chefDrawn = walkSmil(back, `<g transform="${SCALE}"><g class="walkbob"><g class="chef-serve">${L.waddler(`<g class="carry">${L.carried()}</g>`)}</g></g></g>`)
  }
  else if (run === 'taste') chefDrawn = `<g transform="${SCALE}"><g class="taster">${L.waddler('')}${L.yum()}</g></g>`
  else chefDrawn = `<g transform="${SCALE}"><g class="chef-idle">${L.waddler('')}</g></g>`

  const css =
    BASE_CSS +
    lineCss() +
    (run === 'serving' ? serveCss() : run === 'taste' ? tasteCss() : run === 'leaving' ? leaveCss() : '')
  const isRun = run === 'serving' || run === 'taste'
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${BAND_H}">` +
    `<style>${css}</style>` +
    `<g transform="${SCALE}">` +
    L.steam(isRun ? 'open' : '') +
    L.fire() +
    L.ladle(isRun ? 'ladle-run' : 'ladle-idle') +
    L.pot() +
    L.lid(isRun ? 'lid-run' : 'lid-idle') +
    `</g>` +
    queue +
    chefDrawn +
    `</svg>`
  const runMs = run === 'serving' ? SERVE_MS : run === 'taste' ? TASTE_MS : run === 'leaving' ? LEAVE_MS : 0
  return { source, minWidth, height: BAND_H, runMs }
}

/** The two lines at the start of the band: the title, and under it the time left. */
export function labelSvg(title: string, sub: string) {
  // The title ends in three dots that light up in turn.
  // The title is drawn at 12 px semibold with three dots after it, the time at 10 px.
  const w1 = textWidth(`${title}...`, 12, 600)
  const w2 = textWidth(sub, 10)
  const width = Math.ceil(Math.max(w1, w2))
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BAND_H}" viewBox="0 0 ${width} ${BAND_H}">` +
    `<style>.a{font:600 12px 'Segoe UI',system-ui,sans-serif;fill:#f2a65e}.b{font:400 10px 'Segoe UI',system-ui,sans-serif;fill:#f2a65e;fill-opacity:.6}` +
    `.d{fill-opacity:.2;animation:dot 1.4s ease-in-out infinite}.d2{animation-delay:.23s}.d3{animation-delay:.46s}` +
    `@keyframes dot{0%,70%,100%{fill-opacity:.2}30%{fill-opacity:1}}` +
    `@media (prefers-color-scheme:light){.a,.b{fill:#73726c}}</style>` +
    `<text class="a" x="0" y="15">${title}<tspan class="d">.</tspan><tspan class="d d2">.</tspan><tspan class="d d3">.</tspan></text>` +
    `<text class="b" x="0" y="29">${sub}</text></svg>`
  return { source, width, height: BAND_H }
}
