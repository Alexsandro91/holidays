/**
 * Destinazione dopo il login: solo percorsi interni. Blocca URL esterni, `//host`, schemi come
 * `javascript:` e il ritorno alla pagina di login (evita i loop).
 */
export const safeRedirect = (target: string | null | undefined, fallback = '/'): string => {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback
  if (target === '/login' || target.startsWith('/login?') || target.startsWith('/login/')) return fallback
  return target
}
