import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import deployReadme from '../../../../docs/deploy/README.md?raw'

// Hash CSP di uno script inline: SHA-256 del contenuto esatto tra <script> e </script>, in base64
const cspHash = async (source: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))
  return `sha256-${btoa(String.fromCharCode(...digest))}`
}

describe('Content-Security-Policy della SPA', () => {
  it('authorizes the inline theme script with the hash documented for the web server', async () => {
    const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    // Un solo script inline: ogni altro andrebbe aggiunto alla CSP
    expect(scripts).toHaveLength(1)
    const hash = await cspHash(scripts[0]?.[1] ?? '')

    // Se fallisce: lo script del tema in index.html è cambiato, va aggiornato l'hash in docs/deploy/README.md
    expect(deployReadme).toContain(`script-src 'self' '${hash}'`)
  })
})
