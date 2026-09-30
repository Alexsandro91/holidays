/**
 * Destinazione dopo il login: solo percorsi interni. Il target viene risolto sull'origine corrente
 * (il parser URL ignora tab/CR/LF e tratta `\` come `/`), quindi URL esterni, `//host`, schemi come
 * `javascript:` e varianti con caratteri di controllo finiscono nel fallback. Blocca anche il
 * ritorno alla pagina di login (evita i loop).
 */
export const safeRedirect = (target: string | null | undefined, fallback = '/'): string => {
  if (!target || !target.startsWith('/')) return fallback

  let url: URL
  try {
    url = new URL(target, window.location.origin)
  } catch {
    return fallback
  }

  if (url.origin !== window.location.origin) return fallback
  if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return fallback

  return `${url.pathname}${url.search}${url.hash}`
}
