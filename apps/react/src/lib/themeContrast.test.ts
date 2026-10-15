/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Letto da disco: con `css: false` (vitest.config.ts) un import `?raw` del CSS arriva vuoto
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

/** Token `--nome: hsl(h s% l%)` di un blocco del tema (`:root` o `.dark`). */
const readTokens = (selector: ':root' | '.dark'): Map<string, [number, number, number]> => {
  const start = indexCss.indexOf(`${selector} {`)
  const block = indexCss.slice(start, indexCss.indexOf('}', start))
  const tokens = new Map<string, [number, number, number]>()
  for (const match of block.matchAll(/--([\w-]+):\s*hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)/g)) {
    tokens.set(match[1] ?? '', [Number(match[2]), Number(match[3]), Number(match[4])])
  }
  return tokens
}

const toRgb = ([h, s, l]: [number, number, number]): [number, number, number] => {
  const saturation = s / 100
  const lightness = l / 100
  const a = saturation * Math.min(lightness, 1 - lightness)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [channel(0), channel(8), channel(4)]
}

const luminance = (color: [number, number, number]): number => {
  const [r, g, b] = toRgb(color).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

const contrast = (tokens: Map<string, [number, number, number]>, foreground: string, background: string): number => {
  const fg = tokens.get(foreground)
  const bg = tokens.get(background)
  if (!fg || !bg) throw new Error(`Token mancante: ${fg ? background : foreground}`)
  const [light, dark] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

// Testo (badge e voce attiva): 4,5:1. Barra della voce attiva, elemento grafico: 3:1 (WCAG 1.4.11)
const PAIRS: [string, string, number][] = [
  ['sidebar-active-foreground', 'sidebar-active', 4.5],
  ['sidebar-primary', 'sidebar-active', 3],
  ['status-active-foreground', 'status-active', 4.5],
  ['status-invited-foreground', 'status-invited', 4.5],
  ['status-disabled-foreground', 'status-disabled', 4.5],
  // Badge "Principale" e "Tutte le sedi" (Nessun responsabile e Archiviata riusano i badge di stato qui sopra)
  ['primary-soft-foreground', 'primary-soft', 4.5],
  // Toast di errore (quelli riusciti e di avviso usano i token dei badge qui sopra)
  ['danger-soft-foreground', 'danger-soft', 4.5],
  ['danger-soft-foreground', 'background', 4.5],
  // Testo colorato dei pulsanti di riga degli amministratori sullo sfondo della pagina
  ['status-invited-foreground', 'background', 4.5],
  ['primary-soft-foreground', 'background', 4.5],
  ['status-active-foreground', 'background', 4.5],
]

const THEMES: (':root' | '.dark')[] = [':root', '.dark']

describe('colori di significato del tema', () => {
  it.each(THEMES)('meet WCAG AA contrast in %s', (selector) => {
    const tokens = readTokens(selector)
    for (const [foreground, background, minimum] of PAIRS) {
      expect(contrast(tokens, foreground, background), `${foreground} su ${background}`).toBeGreaterThanOrEqual(minimum)
    }
  })
})
