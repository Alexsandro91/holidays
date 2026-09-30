import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import i18n from '@/lib/i18n'
import { server } from '@/test/server'

// jsdom non implementa queste API, usate da Radix, input-otp e dal layout responsive
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub })
Element.prototype.scrollIntoView = () => undefined
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => undefined

// jsdom dichiara en-US: i test partono sempre dall'italiano, come da lingua predefinita dell'app
beforeAll(async () => {
  await i18n.changeLanguage('it')
})

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(async () => {
  cleanup()
  server.resetHandlers()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  document.documentElement.className = ''
  window.localStorage.clear()
  await i18n.changeLanguage('it')
})

afterAll(() => server.close())
