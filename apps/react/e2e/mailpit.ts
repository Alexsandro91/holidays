import { z } from 'zod'

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:8025'

const listSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), To: z.array(z.object({ Address: z.string() })) })),
})
const messageSchema = z.object({ Text: z.string() })

export const clearInbox = async (): Promise<void> => {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
}

/** Attende un'email per `email` il cui testo contiene `pattern` e restituisce il primo gruppo catturato. */
const waitForMatch = async (email: string, pattern: RegExp, timeoutMs: number): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const list = listSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json())
    for (const message of list.messages.filter((item) => item.To.some((to) => to.Address === email))) {
      const detail = messageSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json())
      const match = pattern.exec(detail.Text)
      if (match) return match[1]
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Nessuna email attesa ricevuta per ${email}`)
}

/** Attende l'email di login (la coda la invia in pochi secondi) e ne estrae il codice. */
export const waitForLoginCode = (email: string, timeoutMs = 20_000): Promise<string> => waitForMatch(email, /\b(\d{6})\b/, timeoutMs)

/** Attende l'email di recupero e ne estrae percorso e query del link (l'host dipende da FRONTEND_URL). */
export const waitForResetLink = (email: string, timeoutMs = 20_000): Promise<string> =>
  waitForMatch(email, /https?:\/\/[^/\s]+(\/reset-password\/[A-Za-z0-9]+\?email=[^\s)\]]+)/, timeoutMs)
