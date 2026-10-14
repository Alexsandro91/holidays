import { act } from '@testing-library/react'

/**
 * Lascia il tempo a un'eventuale richiesta in più di arrivare al server finto, prima di contare le richieste.
 * L'assenza di una richiesta non ha un segnale da attendere: 100 ms bastano con MSW in memoria (una richiesta impiega
 * pochi millisecondi) e i test che la usano falliscono davvero se il secondo invio parte.
 */
export const waitForStrayRequests = (): Promise<void> => act(() => new Promise<void>((resolve) => window.setTimeout(resolve, 100)))
