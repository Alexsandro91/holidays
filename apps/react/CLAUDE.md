# Holidays — frontend React

## Ambiente
- React + TypeScript + **Vite**. Comandi: `npm run dev`, `npm run build`, `npm run lint`, `npm test` (Vitest),
  `npm run test:e2e` (Playwright: richiede Sail acceso con `queue`, `migrate:fresh --seed` e `cache:clear`; gli E2E del recupero password usano `reset@holidays.test` e richiedono `cache:clear`, limite di 3 richieste di link ogni 15 minuti e di 5 link l’ora per account; `admin-users.spec.ts` crea a ogni esecuzione un utente `e2e-<timestamp>@holidays.test`, che resta disattivato, e un admin invitato `e2e-admin-<timestamp>@holidays.test`, la cui email viene cambiata in `e2e-admin-<timestamp>-bis@holidays.test` con la Modifica e il cui invito viene annullato a fine test; la Modifica di un utente attivo salva gli stessi dati; invia dalla tabella Utenti il link di reset della password a `employee@holidays.test` (la sua password non cambia; tra due esecuzioni servono almeno 60 secondi e al massimo 5 link l’ora per account, contati insieme a “Password dimenticata”, altrimenti 429); entra anche come `manager@holidays.test` ed `employee@holidays.test` (codice da Mailpit), presuppone i dati di `DevUserSeeder` con nome e cognome separati (Sara Colombo tra i primi per cognome) e richiede `sail artisan migrate` dopo la fase 3; `profile.spec.ts` entra come `profile@holidays.test` (Paolo Ferri, aggiunto a `DevUserSeeder` nella fase 4: serve `migrate:fresh --seed`), cambia la password e la rimette, porta la lingua dell’account in inglese e la rimette in italiano; se un’esecuzione precedente si è interrotta prova prima `holidays-dev-password` e poi la nuova password e ripristina lo stato iniziale; fa da 3 a 4 accessi, sotto il limite di 5 al minuto per email e IP; `locations.spec.ts` crea a ogni esecuzione una sede `E2E <timestamp>`, ci sposta `manager@holidays.test`, `employee@holidays.test` (Sara diventa responsabile) e `reset@holidays.test` (Paolo Greco, resta Utente), entra come admin, responsabile e Sara (un accesso ciascuno), poi rimette persone e ruolo come prima e archivia la sede (ne resta una archiviata per esecuzione; la pulizia gira anche dopo un errore); l’admin naviga dentro la SPA invece di ricaricare le pagine per restare sotto il limite di 60 richieste API al minuto per utente; il primo test si salta se nel database ci sono già più sedi attive; dopo la fase 1 del sotto-progetto 2 serve `sail artisan migrate`).
- Porta del dev server da `DEV_SERVER_PORT` nel `.env` (default 5173, `strictPort`).
- Backend: API Laravel in `../laravel` (Sail). In sviluppo il proxy di Vite inoltra `/api` e `/sanctum` a
  `API_PROXY_TARGET`: il codice chiama solo percorsi relativi, sempre tramite `src/lib/api.ts`.
- Le variabili `VITE_*` finiscono nel bundle del browser: sono pubbliche, mai segreti.
  Ogni nuova variabile va aggiunta a `.env.example` e tipizzata in `src/env.d.ts`.
- Sedi: con una sola sede attiva (`meta.multiple_locations = false` in `/api/auth/user`, hook `useMultipleLocations`) colonna, filtro e campi Sede non compaiono; il tipo di rapporto invece c'è sempre. Il ruolo `employee` si mostra come "Utente": "Dipendente" è un tipo di rapporto. Giorni e ore degli orari passano da `features/locations/scheduleFormat.ts`, le date del calendario (YYYY-MM-DD) da `features/locations/dateFormat.ts` (formattate in UTC, mai con il fuso del dispositivo).

## Approccio
Questo progetto segue le **best practice React/Vite**, non lo scaffolding del template Dieffetech.
Delle convenzioni Dieffetech valgono **solo** le regole elencate sotto: se una guida `dieffetech-docs`
dice altro, vince questo file.

## Regole di progetto
- **Identificatori in inglese** (variabili, funzioni, componenti, hook, tipi, props). In italiano solo
  le stringhe rivolte all'utente. **Commenti in italiano**, mai misti.
- **Styling con Tailwind**: niente `style={{}}` per layout/spacing; classi condizionali con `cn` da `@/lib/utils`
  (sostituisce `clsx` + `tailwind-merge`). Componenti base shadcn in `src/components/ui/` (generati con
  `npx shadcn@4.21.0 add …`, modificabili).
- **TypeScript rigoroso**: mai `any` (usare `unknown` + type guard), niente type assertion `as`
  (preferire type guard), `interface` per le props.
- **`erasableSyntaxOnly`**: niente `enum` TypeScript né parameter properties nei costruttori; usare unioni di stringhe.
- **Componenti**: solo funzionali, arrow function tipizzate, un componente per file.
- **Data fetching con TanStack Query**: `useQuery` per le letture, `useMutation` per le scritture
  (con invalidazione delle query). Mai `useEffect` + `useState` per caricare dati dal server.
  Il `QueryClient` unico e le sue opzioni di default stanno in `src/lib/queryClient.ts`.
- **Stato globale**: niente Redux/Zustand. Stato server in TanStack Query, il resto con Context API.
- **Hook**: array di dipendenze sempre esplicito; mai `eslint-disable` per zittire i warning.
- **Pulizia**: niente `console.*`, import inutilizzati o codice commentato nel codice committato.

## Da NON seguire (regole Dieffetech escluse in questo progetto)
- Ant Design, ProComponents e componenti DF: `CrudDataTable`, `DataTable`, `DfProForm`, `Section.*`,
  campi `Df*`, `ApiSelect`, `FilesUploader`, `ExcelUploader`, `NotificationIcon`.
- Hook del template: `useApi`, `usePolicy`, `useTranslation` da `@/hooks/useTranslation`.
- SWR come libreria di fetching (qui si usa TanStack Query).
- Stato dei form CRUD via query params dell'URL e struttura `page.tsx` / `table.tsx` / `form.tsx`.
- Guide `docs/ui-ux/` legate ai componenti DF/antd (`layout.md`, `components.md`, `design-system.md`).
