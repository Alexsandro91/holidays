# Holidays — frontend React

## Ambiente
- React + TypeScript + **Vite**. Comandi: `npm run dev`, `npm run build`, `npm run lint`, `npm test` (Vitest),
  `npm run test:e2e` (Playwright: richiede Sail acceso con `queue`, `migrate:fresh --seed` e `cache:clear`).
- Porta del dev server da `DEV_SERVER_PORT` nel `.env` (default 5173, `strictPort`).
- Backend: API Laravel in `../laravel` (Sail). In sviluppo il proxy di Vite inoltra `/api` e `/sanctum` a
  `API_PROXY_TARGET`: il codice chiama solo percorsi relativi, sempre tramite `src/lib/api.ts`.
- Le variabili `VITE_*` finiscono nel bundle del browser: sono pubbliche, mai segreti.
  Ogni nuova variabile va aggiunta a `.env.example` e tipizzata in `src/env.d.ts`.

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
