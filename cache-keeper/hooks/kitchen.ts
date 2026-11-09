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
const POT_X = 4
const CHEF_X = 30
const SLOT = 22
const BODY_W = 18
const RIGHT_PAD = 4

export const SERVE_MS = 7000
export const TASTE_MS = 3600
export const LEAVE_MS = 4200

// --- Animations ----------------------------------------------------------------

const BASE_CSS =
  '.fl{transform-box:fill-box;transform-origin:50% 100%;animation:fl .5s ease-in-out infinite alternate}' +
  '@keyframes fl{from{transform:scaleY(.65) scaleX(.9)}to{transform:scaleY(1.1) scaleX(1.05)}}' +
  '.st{opacity:0;animation:rise 2.6s ease-in infinite}' +
  '@keyframes rise{0%{transform:translateY(2px);opacity:0}35%{opacity:.8}100%{transform:translateY(-6px);opacity:0}}' +
  '.st.open{animation-duration:1.5s}' +
  // Diners lean to their bowls.
  // Guests in the queue float, as in water: slowly up and down, each on its own beat.
  '.bob{animation:bob 3.6s ease-in-out infinite}' +
  '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
  '.eat{animation:eat 1.9s ease-in-out infinite}' +
  '.love{opacity:0;animation:love 6.5s ease-in-out infinite}' +
  '@keyframes love{0%,60%{opacity:0;transform:translateY(2px)}72%{opacity:.95;transform:translateY(-1px)}88%{opacity:.95;transform:translateY(-3px)}100%{opacity:0;transform:translateY(-5px)}}' +
  '@keyframes eat{0%,40%,100%{transform:translateY(0)}58%{transform:translateY(2px)}}' +
  // The chef's idle round, 9 s: lid off, stir, lid on, wait.
  '.lid-idle{transform-box:fill-box;transform-origin:50% 100%;animation:lididle 9s ease-in-out infinite}' +
  '@keyframes lididle{0%,8%{transform:translate(0,0) rotate(0)}14%,62%{transform:translate(-6px,-8px) rotate(-25deg)}68%,100%{transform:translate(0,0) rotate(0)}}' +
  '.ladle-idle{animation:stir 9s ease-in-out infinite}' +
  '@keyframes stir{0%,16%{transform:translate(0,0)}20%{transform:translate(-6px,1px)}24%{transform:translate(0,0)}28%{transform:translate(-6px,1px)}32%{transform:translate(0,0)}36%{transform:translate(-6px,1px)}40%{transform:translate(0,0)}44%{transform:translate(-6px,1px)}48%,100%{transform:translate(0,0)}}'

/** The run that feeds one guest: to the queue and back, bobbing on the way. */
function serveCss(): string {
  let bob = '@keyframes walkbob{0%{transform:translateY(0)}'
  for (let t = 24; t <= 86; t += 2) {
    if (t > 50 && t < 57) continue
    bob += `${t}%{transform:translateY(${(t / 2) % 2 < 1 ? -1.5 : 0}px)}`
  }
  bob += '87%,100%{transform:translateY(0)}}'
  const ms = SERVE_MS
  return (
    bob +
    '@keyframes carry{0%,20%{opacity:0}21%,52%{opacity:1}53%,100%{opacity:0}}' +
    // The bowl is handed over (53%): the table with it fades in, the guest
    // stops floating and settles down to it.
    '@keyframes tablein{0%,48%{opacity:0}58%,100%{opacity:1}}' +
    '@keyframes leave{0%,56%{opacity:1}68%,100%{opacity:0}}' +
    '@keyframes arrive{0%,56%{opacity:0;transform:translateY(-6px)}74%,100%{opacity:1;transform:translateY(0)}}' +
    '@keyframes lidserve{0%{transform:translate(0,0) rotate(0)}6%,90%{transform:translate(-6px,-8px) rotate(-25deg)}96%,100%{transform:translate(0,0) rotate(0)}}' +
    '@keyframes ladleserve{0%,6%{transform:translate(0,0)}10%{transform:translate(-3px,3px)}16%,20%{transform:translate(1px,-9px)}26%,100%{transform:translate(0,0)}}' +
    `.walkbob{animation:walkbob ${ms}ms linear 1 forwards}` +
    `.carry{opacity:0;animation:carry ${ms}ms linear 1 forwards}` +
    `.tablein{opacity:0;animation:tablein ${ms}ms ease-in-out 1 forwards}` +
    `.leave{animation:leave ${ms}ms ease-in-out 1 forwards}` +
    `.arrive{opacity:0;animation:arrive ${ms}ms ease-in-out 1 forwards}` +
    `.lid-run{transform-box:fill-box;transform-origin:50% 100%;animation:lidserve ${ms}ms ease-in-out 1 forwards}` +
    `.ladle-run{animation:ladleserve ${ms}ms ease-in-out 1 forwards}`
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
  const times = 'keyTimes="0;.22;.5;.56;.86;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1"'
  return (
    `<svg x="0" y="0" width="1" height="${BAND_H}" overflow="visible">` +
    `<animate attributeName="x" values="0%;0%;100%;100%;0%;0%" ${times} dur="${ms}ms" fill="freeze"/>` +
    `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;${-back} 0;${-back} 0;0 0;0 0" ${times} dur="${ms}ms" fill="freeze"/>` +
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
    '@keyframes lidtaste{0%{transform:translate(0,0) rotate(0)}10%,82%{transform:translate(-6px,-8px) rotate(-25deg)}92%,100%{transform:translate(0,0) rotate(0)}}' +
    // The ladle rises straight up out of the pot and towards the chef, so its
    // bowl comes up beside his face as he floats up to meet it.
    '@keyframes ladletaste{0%,14%{transform:translate(0,0)}30%,62%{transform:translate(8px,-7px)}76%,100%{transform:translate(0,0)}}' +
    // The chef floats up to the ladle, takes it, chews twice and floats back down.
    '@keyframes chew{0%,16%{transform:translate(0,0)}28%{transform:translate(-3px,-10px)}36%{transform:translate(-3px,-8.5px)}44%{transform:translate(-3px,-10px)}52%{transform:translate(-3px,-8.5px)}60%{transform:translate(-3px,-10px)}76%,100%{transform:translate(0,0)}}' +
    '@keyframes yum{0%,44%{opacity:0;transform:translateY(2px)}52%{opacity:1}74%{opacity:1;transform:translateY(-4px)}84%,100%{opacity:0;transform:translateY(-6px)}}' +
    `.lid-run{transform-box:fill-box;transform-origin:50% 100%;animation:lidtaste ${ms}ms ease-in-out 1 forwards}` +
    `.ladle-run{animation:ladletaste ${ms}ms ease-in-out 1 forwards}` +
    `.taster{animation:chew ${ms}ms ease-in-out 1 forwards}` +
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
function lineBody(x: number, y: number, cls: string, legs = true): string {
  let out =
    `<rect class="${cls}" x="${x + 2}" y="${y}" width="14" height="10" rx="3.5"/>` +
    `<rect class="${cls}" x="${x}" y="${y + 4.5}" width="4" height="2.6" rx="1.3"/>` +
    `<rect class="${cls}" x="${x + 14}" y="${y + 4.5}" width="4" height="2.6" rx="1.3"/>` +
    `<rect class="e" x="${x + 5.6}" y="${y + 2.6}" width="1.8" height="3.2" rx=".9"/>` +
    `<rect class="e" x="${x + 10.6}" y="${y + 2.6}" width="1.8" height="3.2" rx=".9"/>`
  if (legs) {
    for (const lx of [4.5, 7.8, 10.2, 13.5]) {
      out += `<rect class="${cls}" x="${x + lx - 0.9}" y="${y + 9}" width="1.8" height="5" rx=".9"/>`
    }
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
      `<path class="fl" style="animation-delay:${d}s" fill="${cls}" d="M${x} 43.5q-${w} -${h * 0.45} 0 -${h}q${w} ${h * 0.55} 0 ${h}z"/>`
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
    // A round bowl at the bottom of the handle; drawn before the pot, so it is
    // hidden inside while the ladle rests there.
    return (
      `<g class="${cls}">` +
      `<path class="m" d="M${POT_X + 11.8} 25a3.2 3.2 0 0 0 6.4 0z"/>` +
      `<path class="sk" d="M${POT_X + 18} 25.2L${POT_X + 19.5} 12.5"/><path class="sk" d="M${POT_X + 19.5} 12.5l2.5 .6"/>` +
      `</g>`
    )
  },
  steam(cls: string): string {
    const w = (x: number, d: number): string =>
      `<path class="st sw ${cls}" style="animation-delay:${d}s" d="M${x} 19c-1.6-1.3 1.6-2.2 0-3.6s1.6-2.2 0-3.6"/>`
    return w(POT_X + 6, 0) + w(POT_X + 11, 0.85) + w(POT_X + 16, 1.7)
  },
  chef(inner: string): string {
    const x = CHEF_X
    return (
      // The toque: three puffs over a band.
      `<circle class="p" cx="${x + 5.5}" cy="18.5" r="3.6"/><circle class="p" cx="${x + 9}" cy="17" r="4"/><circle class="p" cx="${x + 12.5}" cy="18.5" r="3.6"/>` +
      `<rect class="p" x="${x + 4}" y="18.5" width="10" height="7" rx="1"/>` +
      lineBody(x, 28, 'm') +
      inner
    )
  },
  carried(): string {
    return lineBowl(CHEF_X + 15, 33)
  },
  yum(): string {
    // A small heart beside the head; it rises with the chef.
    const x = CHEF_X + 20
    return `<path class="yum hr" d="M${x} 22c-1.6-1.6-4-.4-3 1.6l3 3 3-3c1-2-1.4-3.2-3-1.6z"/>`
  },
  standing(i: number, x: number): string {
    const delay = ((i * 1.27) % 3.6).toFixed(2)
    return `<g class="bob" style="animation-delay:-${delay}s">${lineBody(x, 28, LINE_GUESTS[i % LINE_GUESTS.length])}</g>`
  },
  seated(i: number, x: number): string {
    return this.diner(i, x) + this.table(i, x)
  },
  /** A guest sitting to eat, leaning to the bowl now and then. */
  diner(i: number, x: number): string {
    const delay = ((i * 0.57) % 1.9).toFixed(2)
    return `<g class="eat" style="animation-delay:-${delay}s">${lineBody(x, 27, LINE_GUESTS[i % LINE_GUESTS.length], false)}</g>`
  },
  /** The guest's table with a bowl of soup, and the heart that floats up now and then. */
  table(i: number, x: number): string {
    return (
      `<rect class="tb" x="${x - 1}" y="36.5" width="20" height="1.8" rx=".9"/>` +
      `<rect class="tb" x="${x + 1}" y="37.5" width="1.6" height="6" rx=".8"/>` +
      `<rect class="tb" x="${x + 15.4}" y="37.5" width="1.6" height="6" rx=".8"/>` +
      lineBowl(x + 5.5, 34.5) +
      `<path class="love hr" style="animation-delay:-${((i * 2.3) % 6.5).toFixed(2)}s" d="M${x + 9} 20.6c-1.4-1.5-3.6-.4-2.7 1.4l2.7 2.7 2.7-2.7c.9-1.8-1.3-2.9-2.7-1.4z"/>`
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

export function kitchenSvg({ guests, served, mode = 'idle' }: { guests: number; served: number; mode?: KitchenMode }) {
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
      people += `<g class="tablein">${L.table(i, x)}</g><g class="leave">${L.standing(i, x)}</g><g class="arrive">${L.diner(i, x)}</g>`
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
    chefDrawn = walkSmil(back, `<g transform="${SCALE}"><g class="walkbob">${L.chef(`<g class="carry">${L.carried()}</g>`)}</g></g>`)
  }
  else if (run === 'taste') chefDrawn = `<g transform="${SCALE}"><g class="taster">${L.chef('')}${L.yum()}</g></g>`
  else chefDrawn = `<g transform="${SCALE}">${L.chef('')}</g>`

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
  const w1 = textWidth(title, 12.6) + 3 * 4.2
  const w2 = textWidth(sub, 9.8)
  const width = Math.ceil(Math.max(w1, w2) + 6)
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
