import { z } from 'zod'

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:8025'

const listSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), To: z.array(z.object({ Address: z.string() })) })),
})
const messageSchema = z.object({ Text: z.string() })

export const clearInbox = async (): Promise<void> => {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
}

/** Attende l'email di login (la coda la invia in pochi secondi) e ne estrae il codice. */
export const waitForLoginCode = async (email: string, timeoutMs = 20_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const list = listSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json())
    const message = list.messages.find((item) => item.To.some((to) => to.Address === email))
    if (message) {
      const detail = messageSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json())
      const match = /\b(\d{6})\b/.exec(detail.Text)
      if (match) return match[1]
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Nessun codice ricevuto per ${email}`)
}
