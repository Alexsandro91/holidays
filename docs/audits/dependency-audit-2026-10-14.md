# Dependency audit — 2026-10-14

Audit in sola lettura delle dipendenze di `apps/laravel` (Laravel 13, Sail, solo API) e `apps/react` (SPA React + Vite, npm
sull'host). Branch analizzato: `feature/fase-4-profilo` (HEAD `436bc4c`). Nessun file del progetto è stato modificato oltre a
questo report (la build ha rigenerato `apps/react/dist/`, che è in `.gitignore`).

---

## 1. Sintesi

| Area | Verdetto |
|---|---|
| Runtime | PHP 8.5.11 in Sail aggiornato e supportato; **Node sull'host 26.3.0 senza due security release** (26.3.1, 26.5.1); nessun `engines`/`.nvmrc`; vincolo `php: ^8.3` più largo dell'ambiente reale. |
| Backend (Composer) | Sano: 0 advisory, solo patch/minor nel vincolo (framework 13.34 → 13.36, Fortify 1.40 → 1.41); una major dev (PHPUnit 13). Due transitive **abbandonate** (`dragon-code/*`, solo dev, via `laravel-lang/common`). |
| Frontend (npm) | Quasi tutto aggiornato; minor/patch nel vincolo. Major disponibili: TypeScript 7 (**bloccata** da `typescript-eslint`) e `@types/node` 26. `shadcn` (CLI) sta in `dependencies`. |
| Deprecazioni nel codice | PHP: nessuna (0 deprecazioni in 567 test, Larastan pulito). TS: 3 usi del parametro `message` di Zod 4, deprecato a favore di `error`. Nessuna è bloccante. |
| Sicurezza | Composer: 0 CVE. npm: 9 vulnerabilità (2 critical, 7 high) segnalate anche con `--omit=dev`, ma **nessuna arriva nel bundle di produzione** (verificato su `dist/`). Correzione nel vincolo per 4 su 9; la catena `braces` di `shadcn` non ha fix. |
| SEO/GEO | Solo pagine funzionali (login, recupero password, invito, privacy, 404): SEO/GEO non applicabile. Manca però ogni misura `noindex` (robots, meta, `X-Robots-Tag`). |
| Baseline | **Verde**: 567 test PHP, Larastan 0 errori, Pint ok, 328 test Vitest, lint 0 problemi, build ok. |

**Interventi più importanti**
1. Aggiornare Node sull'host (≥ 26.5.1, oggi 26.11.1) e fissare la versione con `.nvmrc` + `engines` (G1).
2. Aggiornare nel lockfile `solid-js` / `seroval` / `source-map-js` per chiudere le CVE critical/high correggibili (G2).
3. `composer update` nel vincolo: Laravel 13.36.0 include anche la correzione dell'escape nelle email Markdown (G3).
4. Spostare `shadcn` in `devDependencies` e decidere su `laravel-lang/common`, che porta dentro i pacchetti abbandonati (G6, G7).
5. Rimandare TypeScript 7 finché `typescript-eslint` non lo supporta (G10).

---

## 2. Cosa è cambiato

Primo audit: in `docs/audits/` non c'erano report precedenti, quindi non c'è un confronto da fare.

---

## 3. Runtime e framework

| ID | Componente | In uso | Ultima disponibile | Fine bug fix | Fine security fix | Stato | Prio | Fonte / note |
|---|---|---|---|---|---|---|---|---|
| R-01 | PHP (container Sail `sail-8.5/app`) | 8.5.11 | 8.5.11 (24/09/2026) | 31/12/2027 | 31/12/2029 | ok | — | `sail php -v`; php.net/supported-versions. Sull'host c'è PHP 8.5.7, che il progetto non usa. |
| R-02 | Vincolo PHP in `composer.json` | `"php": "^8.3"`, nessun `config.platform` | — | 8.3: finito il 31/12/2025 | 8.3: 31/12/2027 | da allineare | P2 | Lo sviluppo gira su 8.5, mentre il vincolo ammette 8.3. **PHPUnit 13 richiede PHP ≥ 8.4** (phpunit.de). La versione PHP di produzione non è verificata (manca nel repo e in `docs/deploy`). |
| R-03 | Laravel | 13.34.0 | 13.36.0 (13/10/2026) | Q3 2027 | 17/03/2028 | minor disponibile | P3 | laravel.com/docs/13.x/releases. Laravel 14 non è ancora uscito: la cadenza annuale lo colloca intorno al Q1. |
| R-04 | Node sull'host (React: dev, test, build) | **26.3.0** | 26.11.1 (07/10/2026) | 26 diventa LTS il 28/10/2026; maintenance dal 20/10/2027 | 30/04/2029 | **security release mancanti** | **P1** | `node -v`; nodejs.org/dist/index.json segnala come security le release **26.3.1** (17/06/2026) e **26.5.1** (28/07/2026). Il ramo è supportato, ma l'installazione locale è indietro. |
| R-05 | Node nel container Sail | 24.21.0 | 24.21.0 | maintenance dal 20/10/2026 | 30/04/2028 | ok | — | `sail node -v`; schedule.json di nodejs/Release. Le istruzioni del progetto non lo usano per l'app React. |
| R-06 | npm | host 11.16.0 / Sail 12.1.0 | 12.2.0 (avviso npm in Sail) | — | — | info | — | `npm -v`, `sail npm -v`. |
| R-07 | Composer | Sail 2.10.3 (host 2.10.1) | 2.10.3 | — | — | ok | — | `sail composer --version`, getcomposer.org/versions. |
| R-08 | Versione di Node dichiarata | **nessuna**: niente `engines`, `.nvmrc` o `.node-version` | — | — | — | mancante | P1 (con R-04) | Minimo di fatto richiesto dalle dipendenze: `jsdom@30` `^22.22.2 \|\| ^24.15.0 \|\| >=26`, `react-router@8` `>=22.22.0`, `vitest@5` `^22.12 \|\| ^24 \|\| >=26`. |
| R-09 | React | 19.3.0 | 19.3.0 (09/09/2026) | nessuna policy pubblicata | nessuna policy pubblicata | ok | — | react.dev/versions. |
| R-10 | TypeScript | 6.0.3 (`~6.0.2`) | 7.0.2 (08/07/2026); 7.1 solo `next` | nessuna policy | nessuna policy | major disponibile, bloccata | P2 | Annuncio di TS 7.0: 7.0 non ha API programmatica e per gli strumenti come typescript-eslint indica di restare su 6.0. `typescript-eslint@8.71.2` dichiara peer `typescript >=4.8.4 <6.1.0`. |
| R-11 | Vite | 8.3.1 | 8.3.4 | 8.3 riceve patch regolari | 8.2/7.3 fix importanti; 8.1/6.4 solo security | patch disponibile | P3 | vite.dev/releases. |
| R-12 | Servizi Sail | `mysql:8.4`, `redis:alpine`, `axllent/mailpit:latest` | — | non verificato | non verificato | info | P3 | `compose.yaml`. I tag `latest`/`alpine` sono flottanti, quindi l'ambiente di sviluppo non è riproducibile. Fine supporto di MySQL 8.4 non verificata. |

---

## 4. Dipendenze Composer (`apps/laravel`)

Fonti: `sail composer show --direct --format=json`, `sail composer outdated [--direct] [--major-only] --format=json`,
`sail composer audit --format=json`, `https://repo.packagist.org/p2/<pkg>.json`.
`composer validate --no-check-publish`: valido. `composer check-platform-reqs`: tutto `success`.

| ID | Pacchetto | Gruppo | Installata | Ultima nel vincolo | Ultima assoluta | Salto | Stato | Rischio | Prio | Note / changelog |
|---|---|---|---|---|---|---|---|---|---|---|
| C-01 | laravel/framework | require | 13.34.0 | 13.36.0 | 13.36.0 | minor | minor disponibile | basso | P3 (da fare per primo nel G3) | La 13.36.0 contiene [#61755](https://github.com/laravel/framework/pull/61755) "Prevent escaping from bypassing protection", che corregge l'escape mancante del Markdown inline sull'input utente nelle email Markdown. Il progetto usa 5 mailable `markdown:` con i nomi delle persone, ma il rischio è già **mitigato** da `PersonRules::NAME_FORBIDDEN_CHARACTERS` (vieta `[ ] < >`). C'è anche "Address query issues" (#61837/#61838), di cui non ho verificato il contenuto. Nessun advisory pubblicato in `composer audit`. [Release](https://github.com/laravel/framework/releases) |
| C-02 | laravel/fortify | require | 1.40.0 | 1.41.0 | 1.41.0 | minor | minor disponibile | basso-medio | P3 | La 1.41.0 passa i test interni da Mockery a Double e corregge l'interfaccia di `TwoFactorEnabledResponse`/`TwoFactorDisabledResponse`. I `require` non cambiano. Rischio un po' più alto del normale perché il login è una pipeline Fortify personalizzata (`StartEmailLoginChallenge`). [Release](https://github.com/laravel/fortify/releases) |
| C-03 | laravel/sanctum | require | 4.3.3 | 4.3.3 | 4.3.3 | — | ok | — | — | Ultima release 23/06/2026. |
| C-04 | laravel/tinker | require | 3.0.2 | 3.0.2 | 3.0.2 | — | ok | — | — | Tool CLI che lo skeleton Laravel mette in `require`: lo lascio dov'è perché è il default ufficiale. |
| C-05 | fakerphp/faker | require-dev | 1.24.1 | 1.24.1 | 1.24.1 | — | **fermo** (ultima release 21/11/2024, circa 23 mesi) | — | P3 | Non è abbandonato su Packagist; il repo ha ricevuto commit fino al 02/05/2026. Lo usano 21 file in factory e test. Va solo monitorato: Laravel non indica alternative. |
| C-06 | larastan/larastan | require-dev | 3.12.2 | 3.13.0 | 3.13.0 | minor | minor disponibile | basso-medio | P3 | Porta `phpstan/phpstan` da 2.2.16 a 2.3.1; nuove regole potrebbero segnalare errori. Laravel 13.36 dichiara il supporto a phpstan 2.3.1. |
| C-07 | laravel-lang/common | require-dev | 6.8.0 | 6.8.0 | 6.8.0 | — | ok, ma **porta dentro pacchetti abbandonati** | — | P2 | Serve a pubblicare/aggiornare `lang/it/*` (`lang:update`); nel codice non c'è nessun riferimento `LaravelLang`. Tramite `laravel-lang/publisher` 16.8.0 (l'ultima) richiede C-16 e C-17. Blocca anche `laravel-lang/config` su 1.x (C-18). Vedi §6. |
| C-08 | laravel/boost | require-dev | 2.10.0 | 2.10.3 | 2.10.3 | patch | patch disponibile | basso | P3 | Dopo l'update `boost:update` rigenera `AGENTS.md`: non modificarlo a mano (regola di `CLAUDE.md`). |
| C-09 | laravel/pail | require-dev | 1.2.7 | 1.2.7 | 1.2.7 | — | ok | — | — | |
| C-10 | laravel/pao | require-dev | 1.1.5 | 1.1.5 | 1.1.5 | — | ok | — | — | Riassume l'output di PHPUnit/PHPStan per gli agent: per vedere l'output completo serve `PAO_DISABLE=1` (§10). |
| C-11 | laravel/pint | require-dev | 1.32.1 | 1.32.1 | 1.32.1 | — | ok | — | — | |
| C-12 | laravel/sail | require-dev | 1.68.0 | 1.69.0 | 1.69.0 | minor | minor disponibile | basso | P3 | Il `Dockerfile` in `docker/8.5` è stato pubblicato nel repo: l'update non lo cambia da solo. |
| C-13 | mockery/mockery | require-dev | 1.6.15 | 1.6.15 | 1.6.15 | — | ok | — | — | Usato per `Log::shouldReceive` in `tests/Feature/Auth/ResetPasswordTest.php`. |
| C-14 | nunomaduro/collision | require-dev | 8.9.5 | 8.9.5 | 8.9.5 | — | ok | — | — | Ammette anche PHPUnit 13 (conflict `<11.5.50 \|\| >=14.0.0`). |
| C-15 | phpunit/phpunit | require-dev | 12.5.37 | 12.5.37 | **13.4.2** | **major** | major disponibile | medio | P2 | Richiede PHP ≥ 8.4 (vedi R-02). PHPUnit 12 riceve bug fix fino al 05/02/2027. Nella suite non ho trovato API rimosse o deprecate (`any()`, `expectExceptionMessage()`, `with*()` senza `expects()`, `cacheResult`): le occorrenze di `->with()`/`atLeast()` sono di Mockery. Lo trascinano su: sebastian/*, php-code-coverage 14, ecc. [Announcement](https://phpunit.de/announcements/phpunit-13.html), [DEPRECATIONS.md](https://github.com/sebastianbergmann/phpunit/blob/main/DEPRECATIONS.md) |
| C-16 | dragon-code/support (transitiva) | dev | 6.17.1 | — | 6.17.1 | — | **abbandonato**, sostituto indicato: `illuminate/support` | — | P2 | Packagist p2 `abandoned: "illuminate/support"`. È richiesto da 8 pacchetti `laravel-lang/*`. |
| C-17 | dragon-code/pretty-array (transitiva) | dev | 4.2.0 | — | 4.2.0 | — | **abbandonato** senza sostituto; fermo dal 24/02/2025 | — | P2 | Packagist p2 `abandoned: true`. Lo richiede `laravel-lang/publisher`. |
| C-18 | laravel-lang/config (transitiva) | dev | 1.17.1 | — | 2.3.1 | major | bloccata | — | P3 | Bloccata da `laravel-lang/{locales,models,publisher,routes}` (`^1.12`/`^1.13`). |
| C-19 | symfony/* 8.1.x, polyfill 1.43, nesbot/carbon, phpstan, laravel/prompts, laravel/mcp, ecc. (transitive) | — | — | patch | — | patch | patch disponibili | basso | P3 | Salgono insieme a C-01/C-06 con `composer update`. |

**Nota su `composer audit`.** L'audit risponde `"abandoned": []` anche se Packagist segna come abbandonati C-16 e C-17: nel
`composer.lock` entrambi hanno `abandoned: null`, perché il lock è stato scritto prima dell'abbandono. La config effettiva è
`audit.abandoned = "fail"`. Al prossimo `composer update` il lock prenderà il nuovo stato e **`composer audit` potrebbe
uscire in errore**. Non l'ho verificato perché richiede un update.

---

## 5. Dipendenze npm

### 5a. `apps/react` (npm sull'host, `node_modules` presente)

Fonti: `npm outdated --json`, `npm audit [--omit=dev] --json`, `npm ls --depth=0` (nessun `invalid`, `extraneous` o `missing`),
`npm view <pkg> version deprecated time repository.url peerDependencies engines --json`. Nessuna dipendenza diretta è
marcata `deprecated`.

| ID | Pacchetto | Gruppo | Installata | Ultima nel vincolo | Ultima assoluta | Salto | Stato | Rischio | Prio | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| N-01 | react | dep | 19.3.0 | 19.3.0 | 19.3.0 | — | ok | — | — | |
| N-02 | react-dom | dep | 19.3.0 | 19.3.0 | 19.3.0 | — | ok | — | — | |
| N-03 | react-router | dep | 8.4.0 | 8.4.0 | 8.4.0 | — | ok | — | — | engines `node >=22.22.0`. |
| N-04 | @tanstack/react-query | dep | 5.104.0 | 5.104.2 | 5.104.2 | patch | patch | basso | P3 | |
| N-05 | @tanstack/react-query-devtools | dep | 5.104.0 | 5.104.2 | 5.104.2 | patch | **CVE transitiva** (solid-js → seroval) | basso | **P1** | Si corregge nel lockfile (vedi §8). In produzione `ReactQueryDevtools` è una funzione vuota (`process.env.NODE_ENV !== "development"`): in `dist/assets/*.js` non risultano `solid-js`, `seroval`, `kobalte` né `tsqd`. Tenerlo in `dependencies` è la pratica indicata da TanStack. |
| N-06 | @tanstack/react-table | dep | **9.2.4 (pinnata)** | 9.2.4 | 9.3.1 | minor | minor disponibile; **pin voluto** | basso | P3 | Il pin è intenzionale: commit `4081b0d`, "TanStack Table 9.2.4 (versione esatta)". Il motivo non è documentato. Tra 9.2.5 e 9.3.1 ci sono solo patch di `table-core` e il fix del contesto `AppTable` (che il progetto non usa). |
| N-07 | @hookform/resolvers | dep | 5.9.1 | 5.9.1 | 5.9.1 | — | ok | — | — | Peer zod `^3.25 \|\| ^4`. |
| N-08 | react-hook-form | dep | 7.89.0 | 7.90.0 | 7.90.0 | minor | minor | basso | P3 | |
| N-09 | zod | dep | 4.6.5 | 4.6.7 | 4.6.7 | patch | patch | basso | P3 | Vedi D-01..D-03. |
| N-10 | i18next | dep | 26.4.2 | 26.4.4 | 26.4.4 | patch | patch | basso | P3 | |
| N-11 | react-i18next | dep | 17.0.15 | 17.0.16 | 17.0.16 | patch | patch | basso | P3 | |
| N-12 | radix-ui | dep | 1.6.7 | 1.8.1 | 1.8.1 | minor (2) | minor con **cambi di comportamento** | medio | P3 | Note di rilascio di luglio 2026: ARIA di Dialog quando titolo o descrizione mancano; Checkbox e RadioGroup non generano più `click` sintetici; Tooltip monta il contenuto una volta sola; DismissableLayer annidati; roving focus; reset dei form per RadioGroup e Select. 14 file la importano. [Releases](https://www.radix-ui.com/primitives/docs/overview/releases) |
| N-13 | lucide-react | dep | 1.49.0 | 1.57.0 | 1.57.0 | minor | minor | basso | P3 | 40 file la usano. |
| N-14 | class-variance-authority | dep | 0.7.1 | 0.7.1 | 0.7.1 | — | **fermo** (26/11/2024, circa 23 mesi) | — | P3 | Il repo `joe-bell/cva` è attivo (push del 14/10/2026, 1.0.0-beta.12). È lo standard dei componenti shadcn (6 file): da monitorare, non da sostituire. |
| N-15 | cn | dep | 0.4.0 | 0.4.0 | 0.4.0 | — | ok | — | — | Regola di progetto: `cn` da `@/lib/utils` sostituisce `clsx` + `tailwind-merge`. Il pacchetto è `shadcn-ui/cn`. |
| N-16 | next-themes | dep | 0.4.6 | 0.4.6 | 0.4.6 | — | **fermo** (11/03/2025, circa 19 mesi) | — | P3 | Repo non archiviato, ultimo push 25/02/2026. Peer React 19 ok. 6 file. Da monitorare (§6). |
| N-17 | input-otp | dep | 1.5.0 | 1.5.0 | 1.5.0 | — | ok | — | — | |
| N-18 | sonner | dep | 2.0.8 | 2.0.8 | 2.0.8 | — | ok | — | — | |
| N-19 | @fontsource-variable/inter | dep | 5.3.0 | 5.3.0 | 5.3.0 | — | ok | — | — | |
| N-20 | tw-animate-css | dep | 1.4.0 | 1.4.0 | 1.4.0 | — | ok | — | — | |
| N-21 | shadcn | dep | 4.21.0 | 4.21.5 | 4.21.5 | patch | **gruppo sbagliato** + **CVE transitive senza fix** | basso | P2 | Il runtime ne usa solo `@import "shadcn/tailwind.css"` in `src/index.css`, che si risolve in build. Il resto è la CLI (`ts-morph`, `fast-glob`, `postcss`), che porta 5 delle 9 vulnerabilità "prod". La versione 4.21.0 è voluta: `CLAUDE.md` prescrive `npx shadcn@4.21.0 add …`. |
| N-22 | vite | dev | 8.3.1 | 8.3.4 | 8.3.4 | patch | patch | basso | P3 | |
| N-23 | @vitejs/plugin-react | dev | 6.1.1 | 6.1.2 | 6.1.2 | patch | patch | basso | P3 | |
| N-24 | @tailwindcss/vite | dev | 4.3.3 | 4.3.3 | 4.3.3 | — | ok (CVE transitiva `source-map-js`) | — | P1 (lockfile) | Vedi §8. |
| N-25 | tailwindcss | dev | 4.3.3 | 4.3.3 | 4.3.3 | — | ok | — | — | |
| N-26 | typescript | dev | 6.0.3 (`~6.0.2`) | 6.0.3 | **7.0.2** | **major** | major disponibile, **bloccata** | alto | P2 | Bloccata da N-27 (peer `<6.1.0`). Il tilde `~` sembra una scelta voluta. Lato configurazione la 7.0 è già compatibile: `types` è esplicito in entrambi i tsconfig, `baseUrl` non c'è, `strict` è già attivo di default. Microsoft propone in alternativa gli alias npm (`typescript` → `@typescript/typescript6`, `@typescript/native` → 7.x). |
| N-27 | typescript-eslint | dev | 8.71.0 | 8.71.2 | 8.71.2 | patch | patch | basso | P3 | Peer `typescript >=4.8.4 <6.1.0`. |
| N-28 | eslint | dev | 10.11.0 | 10.12.0 | 10.12.0 | minor | minor | basso | P3 | |
| N-29 | @eslint/js | dev | 10.0.1 | 10.0.1 | 10.0.1 | — | ok | — | — | |
| N-30 | eslint-plugin-react-hooks | dev | 7.1.1 | 7.1.1 | 7.1.1 | — | ok | — | — | |
| N-31 | eslint-plugin-react-refresh | dev | 0.5.7 | 0.5.7 | 0.5.7 | — | ok | — | — | |
| N-32 | @tanstack/eslint-plugin-query | dev | 5.104.0 | 5.104.2 | 5.104.2 | patch | patch | basso | P3 | Peer TS fino a `^7`. |
| N-33 | globals | dev | 17.12.0 | 17.13.0 | 17.13.0 | minor | minor | basso | P3 | |
| N-34 | vitest | dev | 5.0.3 | 5.0.4 | 5.0.4 | patch | patch | basso | P3 | |
| N-35 | jsdom | dev | 30.1.1 | 30.1.2 | 30.1.2 | patch | patch | basso | P3 | engines `^22.22.2 \|\| ^24.15.0 \|\| >=26`. |
| N-36 | msw | dev | 3.0.1 | 3.0.3 | 3.0.3 | patch | patch | basso | P3 | |
| N-37 | @testing-library/react | dev | 16.3.3 | 16.3.3 | 16.3.3 | — | ok | — | P3 | La peer `@testing-library/dom` non è dichiarata: npm l'ha installata in automatico (10.4.2). Conviene dichiararla in `devDependencies`. |
| N-38 | @testing-library/jest-dom | dev | 7.0.1 | 7.0.1 | 7.0.1 | — | ok | — | — | |
| N-39 | @testing-library/user-event | dev | 14.6.7 | 14.6.8 | 14.6.8 | patch | patch | basso | P3 | |
| N-40 | @playwright/test | dev | 1.63.0 | 1.64.1 | 1.64.1 | minor | minor | basso | P3 | Dopo l'update serve `npx playwright install`. |
| N-41 | @axe-core/playwright | dev | 4.13.0 | 4.13.0 | 4.13.0 | — | ok | — | — | |
| N-42 | axe-core | dev | 4.13.0 | 4.14.0 | 4.14.0 | minor | minor | basso-medio | P3 | Nuove regole possono far fallire i test a11y (`src/test/axe.ts`). |
| N-43 | @types/node | dev | 24.19.0 | 24.19.2 | **26.6.5** | major | major disponibile | basso | P3 | Va allineata alla versione di Node scelta (R-04/R-08). Peer di vitest `^22 \|\| >=24`. |
| N-44 | @types/react | dev | 19.3.0 | 19.3.0 | 19.3.0 | — | ok | — | — | React 19 non include i propri tipi, quindi resta necessaria. |
| N-45 | @types/react-dom | dev | 19.3.0 | 19.3.0 | 19.3.0 | — | ok | — | — | Come sopra. |

### 5b. `apps/laravel/package.json` (skeleton)

`node_modules` e lockfile mancano, quindi `sail npm audit` fallisce con `ENOLOCK`. `sail npm outdated --json` riporta solo
`@laravel/multiplex` (wanted/latest 0.4.5). Le ultime versioni vengono da `npm view`.

| ID | Pacchetto | Gruppo | Vincolo | Ultima | Stato | Prio | Note |
|---|---|---|---|---|---|---|---|
| N-46 | vite | dev | ^8.0.0 | 8.3.4 | **inutilizzato** | P3 | Laravel è solo API: la UI è `apps/react`. Lo usano solo `vite.config.js`, `resources/css/app.css`, `resources/js/app.js` e `welcome.blade.php`. |
| N-47 | laravel-vite-plugin | dev | ^3.1 | 3.2.0 | **inutilizzato** | P3 | Come sopra. |
| N-48 | @tailwindcss/vite | dev | ^4.0.0 | 4.3.3 | **inutilizzato** | P3 | Come sopra. |
| N-49 | tailwindcss | dev | ^4.0.0 | 4.3.3 | **inutilizzato** | P3 | Come sopra. |
| N-50 | concurrently | dev | ^10.0.3 | 10.0.6 | **inutilizzato** | P3 | Nessuno script lo richiama: `composer dev` usa `artisan dev`. |
| N-51 | @laravel/multiplex | optional | ^0.4.1 | 0.4.5 | inutilizzato di fatto | P3 | Lo usa `artisan dev` (`DevCommand`) tramite npx. Il workflow del progetto (Sail + Vite React sull'host) non lo prevede. |

---

## 6. Pacchetti da sostituire, inutilizzati o nel gruppo sbagliato

| Voce | Problema | Proposta | Motivo | File da toccare |
|---|---|---|---|---|
| N-21 `shadcn` | CLI in `dependencies`; porta in "prod" `fast-glob` → `micromatch` → `braces` (high, senza fix) e `ts-morph` | Spostarlo in **`devDependencies`** tenendo la 4.21.0 (`npm install -D shadcn@4.21.0`) | In una SPA tutto passa dalla build; il pacchetto serve solo per `shadcn/tailwind.css` in build e per la CLI via npx. Così `npm audit --omit=dev` torna a descrivere ciò che va davvero agli utenti. | `package.json`, `package-lock.json` (0 file di codice) |
| C-07 `laravel-lang/common` → C-16/C-17 abbandonati | Dipendenze transitive abbandonate (solo dev) e `laravel-lang/config` bloccato su 1.x | **Decisione da prendere.** Opzione A, prudente e senza costi: tenerlo e monitorare `laravel-lang/publisher` finché non sostituisce `dragon-code/*`. Opzione B: rimuoverlo (`composer remove --dev laravel-lang/common`), perché i file `lang/it/*` sono già nel repo e il codice non lo referenzia | Il runtime non ne ha bisogno: serve solo a `lang:update`. Con B si perde l'aggiornamento automatico delle traduzioni di framework e pacchetti. | `composer.json`, `composer.lock` (0 file di codice) |
| N-46…N-51 frontend skeleton di Laravel | Pacchetti e asset Vite/Tailwind inutilizzati in un'app solo API | **Rimuovere** `package.json`, `vite.config.js`, `resources/css/app.css`, `resources/js/app.js`, `resources/views/welcome.blade.php`, la rotta `/` in `routes/web.php`, `tests/Feature/ExampleTest.php` e i passi `npm install`/`npm run build` dello script `setup` di `composer.json` | Coerente con `CLAUDE.md` ("Laravel espone solo API"); lo script `setup` oggi installa e builda asset che nessuno usa | 7–8 file |
| N-37 `@testing-library/dom` | Peer di Testing Library non dichiarata | Aggiungerla in `devDependencies` | La documentazione di RTL 16 chiede di installarla esplicitamente; oggi arriva solo per auto-install della peer | `package.json` |
| N-16 `next-themes` | Fermo da 19 mesi | **Nessuna sostituzione ora**, solo monitoraggio. Se diventa necessario, un `ThemeProvider` con Context (la guida "Dark mode → Vite" di shadcn usa questo schema, coerente con la regola "Context API") | Funziona, ha la peer React 19, nessuna CVE | circa 7 file: `main.tsx`, `test/render.tsx`, `ui/sonner.tsx`, `ThemeMenu.tsx`, `PreferencesCard.tsx`, `preferences.test.tsx`, poi `index.html` e l'hash CSP in `docs/deploy` se cambia lo script inline |
| N-14 `class-variance-authority`, C-05 `fakerphp/faker` | Fermi da più di 18 mesi | Nessuna azione: si monitorano | Repo attivi e standard di fatto (shadcn, skeleton Laravel) | — |
| `composer.json` `allow-plugins.pestphp/pest-plugin` | Plugin di Pest non installato (il progetto usa PHPUnit) | Pulizia facoltativa | Residuo dello skeleton | `composer.json` |

Duplicati funzionali: **nessuno**. `axe-core` e `@axe-core/playwright` servono a cose diverse (Vitest e E2E); `clsx`
arriva solo come transitiva di cva e devtools. Pacchetti già coperti da framework o piattaforma: nessuno. Pacchetti `@types/*`
superflui: nessuno.

---

## 7. API deprecate nel nostro codice

PHP: `artisan test --display-deprecations` e `phpunit --display-deprecations --display-phpunit-deprecations`
riportano **0 deprecazioni** di PHP, Laravel, pacchetti e PHPUnit; Larastan livello 6 riporta 0 errori. JS/TS: build e lint
non danno avvisi. Le uniche deprecazioni trovate vengono dalle definizioni di tipo di Zod.

| ID | `file:riga` | API | Fonte | Sostituto | Bloccante per |
|---|---|---|---|---|---|
| D-01 | `apps/react/src/features/auth/pages/ResetPasswordPage.tsx:26` | `.refine(fn, { message })` | `node_modules/zod/v4/core/api.d.ts:9`: "`@deprecated` This parameter is deprecated. Use `error` instead." | `{ error: …, path: [...] }` | Nessuno: Zod 5 non esiste ancora (dist-tag `latest` 4.6.7) |
| D-02 | `apps/react/src/features/profile/components/PasswordCard.tsx:28` | `.refine(fn, { message })` | come sopra | `{ error: … }` | Nessuno |
| D-03 | `apps/react/src/features/invitations/pages/AcceptInvitationPage.tsx:36` | `.refine(fn, { message, path, when })` | come sopra | `{ error: …, path, when }` | Nessuno |

Verifiche di compatibilità per le major disponibili:
- **PHPUnit 13** (C-15): la suite non usa `TestCase::any()`, `expectExceptionMessage()`, `with*()` senza `expects()`,
  `atLeast()` di PHPUnit, `cacheResult` o `executionOrder`. Nessun punto da toccare.
- **TypeScript 7** (N-26): `tsconfig.app.json` e `tsconfig.node.json` hanno già `types` esplicito e non usano `baseUrl`;
  `strict` è attivo di default (con `--strict false` compaiono errori, quindi oggi è implicito). L'unico blocco è
  `typescript-eslint`. Conviene dichiarare `"strict": true` esplicitamente: è facoltativo ma rende chiaro il comportamento.

---

## 8. Sicurezza

### Composer
`sail composer audit --format=json`: **0 advisory**, `abandoned: []`. Il risultato su `abandoned` è falsato dal lock non
aggiornato (vedi la nota in §4): C-16 e C-17 sono abbandonati su Packagist. Sono solo dev e non hanno advisory.

### npm (`apps/react`)
`npm audit --json` e `npm audit --omit=dev --json` danno lo **stesso risultato**: 9 vulnerabilità (2 critical, 7 high). Tutte
arrivano da pacchetti in `dependencies`, ma **nessuna finisce nel bundle servito agli utenti** (verificato con grep su
`dist/assets/*.js` dopo `npm run build`).

| Pacchetto vulnerabile | Severità | Advisory | Catena | Prod/dev effettivo | Fix | Compatibile coi vincoli |
|---|---|---|---|---|---|---|
| seroval ≤1.6.2 | **critical** + high | [GHSA-p6vx-979v-rg4c](https://github.com/advisories/GHSA-p6vx-979v-rg4c) (CVSS 9.8), [GHSA-jp82-f5mq-hwhp](https://github.com/advisories/GHSA-jp82-f5mq-hwhp) | `@tanstack/react-query-devtools` → `@tanstack/query-devtools` → `solid-js@1.9.15` → `seroval@1.5.6` | solo dev: i devtools sono no-op in produzione | `solid-js@1.9.17` (richiede `seroval ~1.6.8`) | **Sì**: `solid-js ^1.9.15` lo ammette; basta aggiornare il lockfile |
| solid-js 1.9.7–1.9.15 | critical (tramite seroval) | come sopra | come sopra | solo dev | 1.9.17 | Sì |
| source-map-js 1.0.0–1.2.1 | high | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | `@tailwindcss/node`, `jsdom/css-tree`, `shadcn/postcss` | build/test | 1.2.2 | **Sì** (`^1.2.1`) |
| braces ≤3.0.3 | high | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `shadcn` → `fast-glob@3.3.3` → `micromatch@4.0.8` → `braces@3.0.3` | solo CLI, mai a runtime | **nessuno**: 3.0.3 è l'ultima | No. L'unica mitigazione è spostare `shadcn` in dev (G6) e accettare il rischio per la CLI |
| micromatch, fast-glob, @ts-morph/common, ts-morph, shadcn | high (derivate) | come sopra | come sopra | solo CLI | `npm audit fix` propone `shadcn@1.0.0` (downgrade semver-major): **da non applicare** | No |

`apps/laravel`: niente lockfile, quindi `npm audit` non si può eseguire (ENOLOCK). I pacchetti sono inutilizzati (§5b).

### Raccomandazione
Questo audit non copre la logica applicativa. Si consiglia di lanciare **`/dieffetech-security:security-audit-code`** (lo
avvia l'utente), anche perché il ramo corrente introduce profilo e cambio password.

---

## 9. SEO / GEO

**Pagine raggiungibili senza login** (`apps/react/src/routes.tsx`, fuori da `ProtectedRoute`):

| URL | Tipo |
|---|---|
| `/login`, `/login/verify` | funzionale (accesso) |
| `/forgot-password`, `/reset-password/:token` | funzionale (recupero password) |
| `/invitation/:token` | funzionale (attivazione invito) |
| `/privacy` | informativa privacy (testo legale, oggi segnaposto `privacy.placeholder`), funzionale al flusso di attivazione |
| `*` (404) | funzionale |
| Laravel `GET /` (`welcome.blade.php`) | skeleton residuo; in produzione è raggiungibile solo se il web server inoltra `/` a Laravel (configurazione non presente nel repo) |

**Indicizzabilità**
- `apps/react/public/`: contiene solo `favicon.svg`. **Mancano `robots.txt` e `sitemap.xml`** (la sitemap non serve).
- `apps/react/index.html`: `lang="it"` (aggiornato a runtime da `src/lib/i18n.ts:34`), `title` = `%VITE_APP_NAME%`, **nessun
  `<meta name="robots">`**.
- `apps/laravel/public/robots.txt`: `User-agent: *` / `Disallow:` vuoto, quindi **consente tutto**.
- `X-Robots-Tag`: assente sia nel middleware `SecurityHeaders` sia in `docs/deploy/README.md`. La configurazione del web
  server non è nel repo.

**Verdetto: SEO/GEO non applicabile** (solo pagine funzionali), quindi `dieffetech-seo:seo-audit`/`geo-audit` non servono.
**Manca però l'esclusione dall'indicizzazione**, richiesta da `apps/laravel/CLAUDE.md` almeno per lo staging:
- aggiungere `apps/react/public/robots.txt` con `Disallow: /` (o almeno `noindex` su staging);
- `<meta name="robots" content="noindex, nofollow">` in `index.html`, oppure `X-Robots-Tag: noindex` documentato in
  `docs/deploy/README.md` per il web server della SPA, che copre anche i link con token di reset e invito;
- valutare `Disallow: /` anche in `apps/laravel/public/robots.txt`.

---

## 10. Baseline di qualità

Tutto **verde**: si può partire con gli upgrade.

| Controllo | Comando esatto | Esito |
|---|---|---|
| Test backend | `cd apps/laravel && vendor/bin/sail artisan test --compact --display-deprecations` | verde: 567 test, 2095 asserzioni (output riassunto da PAO) |
| Test backend, output completo | `docker exec -e PAO_DISABLE=1 -u sail holidays-app php vendor/bin/phpunit --display-deprecations --display-phpunit-deprecations --display-warnings --display-notices --colors=never` | verde: `OK (567 tests, 2095 assertions)`, 0 deprecazioni/warning/notice |
| Analisi statica | `vendor/bin/sail composer analyse` (Larastan, livello 6) | verde: 0 errori |
| Stile | `vendor/bin/sail bin pint --test` | verde |
| Composer | `vendor/bin/sail composer validate --no-check-publish`; `vendor/bin/sail composer check-platform-reqs` | valido; requisiti di piattaforma ok |
| Test frontend | `cd apps/react && npm test` | verde: 30 file, 328 test |
| Lint | `npm run lint` | verde: 0 problemi |
| Build | `npm run build` (`tsc -b && vite build`) | verde: nessun warning, chunk più grande `react-*.js` 312.88 kB (98.65 kB gzip) |
| E2E | non eseguiti (modificano il DB di sviluppo; si fanno nella fase di upgrade) | — |

Container Sail: già **attivi** (`app`, `mysql`, `redis`, `mailpit`, `queue`, `scheduler`); non è servito `sail up -d`.

---

## 11. Piano di upgrade

Ordine consigliato: G1 → G2 → G3 → G4 → G5 → G6 → G7 → G12, poi G8, G9, G11. G10 resta in attesa. Un commit per gruppo,
con la verifica indicata. Gli E2E richiedono Sail acceso con `queue`, `migrate:fresh --seed` e `cache:clear` (vedi
`apps/react/CLAUDE.md`).

| Gruppo | Prio | Rischio | Voci | Comando indicativo | Nostro codice da toccare | Verifica dopo | Dipende da |
|---|---|---|---|---|---|---|---|
| **G1** Runtime Node | P1 | basso | R-04, R-08 | Aggiornare Node sull'host a ≥ 26.5.1 (oggi 26.11.1, LTS dal 28/10/2026) **oppure** passare alla 24 LTS; poi aggiungere `apps/react/.nvmrc` e `"engines": { "node": ">=24.15.0" }` (o `>=26`) | `.nvmrc`, `package.json` (engines) | `node -v`; `npm ci`; `npm test`, `npm run lint`, `npm run build`; E2E smoke (`login.spec.ts`) | — |
| **G2** CVE npm nel lockfile | P1 | basso | N-05, N-24 (solid-js, seroval, source-map-js) | `npm update @tanstack/react-query-devtools solid-js seroval seroval-plugins source-map-js` (cambia solo il lockfile) | nessuno | `npm audit --omit=dev`: devono restare solo `braces`/`shadcn`; `npm test`, `npm run build`; in sviluppo aprire i devtools | G1 |
| **G3** Composer patch/minor | P3 (da fare presto: fix delle email Markdown) | basso-medio | C-01, C-02, C-06, C-08, C-12, C-19 | `vendor/bin/sail composer update` (resta nei vincoli), poi `vendor/bin/sail artisan boost:update` se serve | nessuno previsto; eventuali errori nuovi di Larastan 3.13 | `sail artisan test --compact`; `sail composer analyse`; `sail bin pint --test`; `sail composer audit`, che potrebbe fallire per C-16/C-17 (vedi G7); E2E `login`, `password-reset`, `admin-users`, `profile`; controllo a vista delle email su Mailpit | — (meglio decidere G7 prima o insieme) |
| **G4** npm patch/minor a basso rischio | P3 | basso | N-04, N-08…N-11, N-13, N-22, N-23, N-27, N-28, N-32…N-36, N-39, N-40, N-42, N-43 (solo nel range 24.x) | `npm update @tanstack/react-query @tanstack/eslint-plugin-query react-hook-form zod i18next react-i18next lucide-react vite @vitejs/plugin-react typescript-eslint eslint globals vitest jsdom msw @testing-library/user-event @playwright/test axe-core @types/node` e `npx playwright install` | nessuno previsto | `npm test`, `npm run lint`, `npm run build`, E2E completi (`npm run test:e2e`) | G1 |
| **G5** radix-ui 1.6 → 1.8 | P3 | medio | N-12 | `npm update radix-ui` | `src/components/ui/*` solo se cambiano ARIA o focus | `npm test` (inclusi i test axe); E2E completi, con attenzione a dialog, alert-dialog, select, radio-group e tooltip; prova manuale di tastiera e focus | G4 |
| **G6** shadcn in dev | P2 | basso | N-21 | `npm install -D shadcn@4.21.0` (sposta il pacchetto senza cambiare versione). L'eventuale salto a 4.21.5 va fatto insieme al comando `npx shadcn@…` in `apps/react/CLAUDE.md` | `package.json` | `npm run build` (l'import `shadcn/tailwind.css` deve risolversi); `npm audit --omit=dev` deve tornare a 0 | G2 |
| **G7** laravel-lang / pacchetti abbandonati | P2 | basso | C-07, C-16, C-17, C-18 | Decisione A (tenere e accettare) oppure B: `vendor/bin/sail composer remove --dev laravel-lang/common` | nessuno (i file `lang/` restano) | `sail artisan test --compact` (messaggi di validazione in italiano); `sail composer audit` | — |
| **G8** Vincolo PHP + PHPUnit 13 | P2 | medio | R-02, C-15 | Decidere la versione PHP di produzione; portare `"php"` a `^8.4` (o `^8.5`) con `config.platform.php`; poi `vendor/bin/sail composer require --dev phpunit/phpunit:^13.4 -W` | `composer.json`, eventualmente `phpunit.xml` | `sail artisan test --compact` e `phpunit --display-phpunit-deprecations` con `PAO_DISABLE=1`; `sail composer analyse` | G3; conferma della PHP di produzione |
| **G9** `@types/node` 26 | P3 | basso | N-43 (major) | `npm install -D @types/node@^26` solo se G1 sceglie Node 26 | eventuali tipi Node in `*.config.ts` ed `e2e/` | `npm run build`, `npm run lint` | G1 (Node 26) |
| **G10** TypeScript 7 | P2 | alto | N-26, R-10 | **Rimandare** finché `typescript-eslint` non dichiara il supporto (API attesa con TS 7.1). In alternativa gli alias npm suggeriti da Microsoft (`typescript: npm:@typescript/typescript6@^6.0.2`, `@typescript/native: npm:typescript@^7.0.2`) | `tsconfig*.json` (`"strict": true` esplicito), script `build` | `npm run build`, `npm run lint`, `npm test`, E2E | uscita di TS 7.1 e supporto di typescript-eslint |
| **G11** Pulizia dello skeleton frontend Laravel | P3 | basso | N-46…N-51, `allow-plugins.pestphp` | Rimuovere i file elencati in §6 e i passi npm dello script `setup` | `package.json`, `vite.config.js`, `resources/css/app.css`, `resources/js/app.js`, `resources/views/welcome.blade.php`, `routes/web.php` (rotta `/`), `tests/Feature/ExampleTest.php`, `composer.json` | `sail artisan test --compact`, `sail composer analyse`, `sail artisan route:list` | — (decisione dell'utente) |
| **G12** Deprecazioni Zod e peer di test | P3 | basso | D-01…D-03, N-37 | Sostituire `message:` con `error:` nei tre `.refine`; `npm install -D @testing-library/dom@^10` | 3 file in §7, `package.json` | `npm test` (test di ResetPassword, Profile e AcceptInvitation), `npm run lint`, `npm run build` | G4 |

Fuori dal piano dipendenze, ma emersi dall'audit:
- **Pin di `@tanstack/react-table`** (N-06): resta a 9.2.4 per scelta. Se si decide di aggiornarlo, conviene farlo a
  versione esatta (`9.3.1`) dentro G4, con il test della tabella utenti e l'E2E `admin-users`.
- **Laravel 14**: non ancora disponibile. Quando esce, l'upgrade va affidato all'agent **`dieffetech-dev:laravel-upgrade`**
  (versione per versione, con la guida ufficiale), insieme a Fortify, Sanctum, Boost e gli altri pacchetti Laravel.
- **SEO**: `robots.txt`/`noindex` per SPA e staging (§9).
- **Sail**: fissare i tag di `redis` e `mailpit` (R-12), facoltativo.

---

## 12. Assunzioni e cose non verificate

- **Report scritto da agent**: l'unico file creato è questo report (con la cartella `docs/audits/`). `npm run build` ha
  rigenerato `apps/react/dist/` e i test hanno aggiornato file ignorati (`.phpunit.result.cache`, viste compilate): niente
  di tracciato è cambiato durante l'audit (`git status`, eseguito dopo test e build, mostrava solo `?? .claude/`, che c'era già).
  **Attenzione**: alle 15:57:55, dopo la baseline e la stesura del report, sono comparse modifiche non committate che non
  ho fatto io, in 5 file di `apps/react/src` (`components/layout/AppShell.tsx`, `features/profile/api.ts`,
  `features/profile/useAccountLocale.ts`, `features/profile/accountLocale.test.tsx`,
  `features/profile/components/PreferencesCard.tsx`). Probabilmente le ha fatte un altro processo in parallelo. La
  baseline del §10 vale per HEAD `436bc4c` senza quelle modifiche.
- **PAO**: `laravel/pao` riassume l'output di PHPUnit quando rileva un agent, e Sail non permette di passare variabili
  d'ambiente al comando. Per vedere l'output completo ho usato `docker exec -e PAO_DISABLE=1 -u sail holidays-app …`
  sullo stesso container di Sail.
- **Versione PHP e Node di produzione**: **non verificate**, non sono nel repo né in `docs/deploy`. R-02 e G8 presuppongono
  che si possa salire almeno a PHP 8.4.
- **CVE npm come P1 invece di P0**: npm le classifica "prod", ma ho verificato che il codice vulnerabile non entra nel
  bundle (`dist/`). Le ho quindi trattate come dev/build. Se il deploy installasse ed eseguisse `node_modules` sul server
  (con una SPA statica non succede), andrebbero considerate P0.
- **`shadcn` in `dependencies`**: è dove lo mette `shadcn init` per l'import CSS. Proporre `devDependencies` è una scelta
  di pulizia, non la correzione di un errore. La versione `4.21.0` è considerata voluta (`CLAUDE.md`).
- **Pin voluti**: `@tanstack/react-table` 9.2.4 (versione esatta, commit `4081b0d`) e `typescript ~6.0.2` (tilde,
  coerente con il limite di typescript-eslint). Li ho segnalati senza trattarli come errori.
- **Laravel 13.36.0, fix #61755 e #61837**: il primo l'ho letto (descrizione della PR); il contenuto di "Address query
  issues" non è descritto e non è verificato. Non risultano advisory GHSA collegati in `composer audit`.
- **`composer audit` dopo l'update**: che fallisca per `audit.abandoned = fail` una volta aggiornato il lock è una
  deduzione dalla config, **non verificata** (servirebbe un `composer update`, vietato in questa fase).
- **TypeScript 7.1 e typescript-eslint**: lo stato viene dall'annuncio ufficiale di TS 7.0, dai dist-tag npm (7.1 solo
  `next`) e dalla peer di `typescript-eslint@8.71.2`. Su eventuali piani di supporto successivi ho trovato solo blog e
  thread di terzi.
- **radix-ui**: le note di rilascio sono per primitive e per data, non per versione del pacchetto `radix-ui`. Il legame
  tra cambi di comportamento e 1.7/1.8 è dedotto dalle date (luglio 2026), non verificato.
- **MySQL 8.4, Redis e Mailpit**: fine supporto non verificata.
- **Skill `dieffetech-docs`**: non consultata, perché questa fase è un audit in sola lettura e non sviluppo. Le regole di
  `apps/*/CLAUDE.md` hanno precedenza.
- **Fonti principali**: php.net/supported-versions; laravel.com/docs/13.x/releases; nodejs.org/en/about/previous-releases e
  github.com/nodejs/Release (schedule.json); nodejs.org/dist/index.json; vite.dev/releases; react.dev/versions;
  devblogs.microsoft.com/typescript/announcing-typescript-7-0; phpunit.de (announcement 13 e supported versions);
  github.com/sebastianbergmann/phpunit/DEPRECATIONS.md; radix-ui.com/primitives/docs/overview/releases; GitHub releases
  di laravel/framework, laravel/fortify e TanStack/table; repo.packagist.org/p2; registro npm.

---

## Esecuzione 2026-10-14

Agent `dependency-upgrade`. Branch **`chore/deps-2026-10-14`**, creato da `develop` (`f6e1d61`, fase 4 già mergiata).
Gruppi richiesti, in quest'ordine: G1, G2, G3, G4, G6, G7, G12. Nessun push.

### Ambiente e baseline

- Rispetto all'audit: Node sull'host **26.11.1** (npm 11.20.0), aggiornato dall'utente prima del giro; PHP 8.5.11 e
  Composer 2.10.3 in Sail, container attivi (`app`, `mysql`, `redis`, `mailpit`, `queue`, `scheduler`).
- Baseline rieseguita su `develop` (`f6e1d61`), tutta **verde**: PHPUnit 590 test, 2206 asserzioni, 0
  deprecazioni/warning/notice (con la fase 4 i test sono saliti da 567); Larastan 0 errori; Pint `--test` ok;
  `composer audit` 0 advisory; Vitest 30 file, 360 test; lint 0 problemi; build ok; `npm audit --omit=dev` 9 vulnerabilità
  (2 critical, 7 high), come nell'audit; E2E completi 23/23.
- E2E: ogni esecuzione dopo `sail artisan migrate:fresh --seed` e `sail artisan cache:clear`, con
  `DEV_SERVER_PORT=5173 npx playwright test`, così Playwright avvia un dev server nuovo con le dipendenze aggiornate invece
  di riusare quello già acceso sulla 5174 (5173 è tra gli `SANCTUM_STATEFUL_DOMAINS`, i link delle email sono letti come
  percorsi). Il warning `Encountered a script tag while rendering React component` nei log del dev server c'era già nella
  baseline.

### Gruppi eseguiti

| Gruppo | Esito | Commit | Versioni da → a | File di codice | Controlli |
|---|---|---|---|---|---|
| G1 Runtime Node | fatto | `201a317` | Node host 26.3.0 → 26.11.1 (utente); `.nvmrc` `26.11.1`; `engines.node` `>=26.5.1` | `apps/react/.nvmrc`, `package.json`, `package-lock.json` (solo `engines` della radice) | `npm ci`, Vitest 360/360, lint, build, E2E `login.spec.ts` 4/4 |
| G2 CVE npm nel lockfile | fatto | `11929a3` | solid-js 1.9.15 → 1.9.17, seroval/seroval-plugins 1.5.6 → 1.6.9, source-map-js 1.2.1 → 1.2.2 | solo `package-lock.json` | `npm audit --omit=dev` da 9 (2 critical, 7 high) a 6 high (catena `braces`); Vitest, lint, build; niente solid-js/seroval in `dist/`; devtools aperti nel dev server senza errori |
| G3 Composer patch/minor | fatto | `817de6f` | framework 13.34.0 → 13.36.0, Fortify 1.40.0 → 1.41.0, Larastan 3.12.2 → 3.13.0 (phpstan 2.3.1), Boost 2.10.0 → 2.10.3, Sail 1.68.0 → 1.69.0, PHPUnit 12.5.37 → 12.5.39, symfony 8.1.9 e altre patch | solo `composer.lock` | PHPUnit 590/2206 senza deprecazioni; Larastan 0; Pint ok; validate e platform-reqs ok; `composer audit` 0 advisory ma **exit 1** per `dragon-code/*` abbandonati (previsto, chiuso dal G7); E2E 23/23; email di accesso su Mailpit corretta |
| G4 npm patch/minor | fatto | `c592c98` | react-query (+ devtools, eslint-plugin) 5.104.0 → 5.104.2, react-hook-form 7.89.0 → 7.90.0, zod 4.6.5 → 4.6.7, i18next 26.4.2 → 26.4.5, react-i18next → 17.0.16, lucide-react 1.49.0 → 1.57.0, vite 8.3.1 → 8.3.4, plugin-react → 6.1.2, typescript-eslint → 8.71.2, eslint 10.11.0 → 10.12.0, globals → 17.13.0, vitest → 5.0.4, jsdom → 30.1.2, msw → 3.0.3, user-event → 14.6.8, @playwright/test 1.63.0 → 1.64.1 (+ Chromium 156), @types/node 24.19.0 → 24.19.2 | solo `package-lock.json` | Vitest 360/360, lint, build senza warning, audit invariato, E2E 23/23 |
| G6 shadcn in dev | fatto | `6f0dcdf` | shadcn 4.21.0 (invariata) da `dependencies` a `devDependencies` | `package.json`, `package-lock.json` | `npm audit --omit=dev` **0 vulnerabilità**; build ok (`shadcn/tailwind.css` risolto); Vitest, lint; `npx shadcn@4.21.0 --version` |
| G7 laravel-lang (opzione B) | fatto | `67a8239` | rimosso `laravel-lang/common` 6.8.0 con 23 dipendenze transitive (16 altri `laravel-lang/*`, `dragon-code/{support,pretty-array,contracts}`, `archtechx/enums`, `codezero/browser-locale`, `composer/{class-map-generator,pcre}`) | `composer.json`, `composer.lock`; `lang/` invariata | `composer audit` 0 advisory, **exit 0**; PHPUnit 590/2206; Larastan 0; Pint ok; messaggi di validazione in italiano invariati |
| G12 Zod e peer di test | fatto | `93e4ddd` | `@testing-library/dom` dichiarata `^10.4.2` (installata 10.4.2, invariata) | `ResetPasswordPage.tsx`, `PasswordCard.tsx`, `AcceptInvitationPage.tsx` (`message` → `error` nei `.refine`), `package.json`, `package-lock.json` | test di ResetPassword, Profile e AcceptInvitation verdi; Vitest 360/360; lint; build; audit `--omit=dev` 0 |

Controllo finale sul branch completo: E2E 23/23 dopo `migrate:fresh --seed` e `cache:clear`.

### Scostamenti dal piano

- **G1**: `.nvmrc` con la versione esatta `26.11.1` (con `26` `nvm use` sceglierebbe una 26.x già installata, anche senza
  le security release). Nel lockfile ho aggiunto solo `engines`: npm 11.20 riscrive anche le voci bundle di
  `@tailwindcss/oxide-wasm32-wasi`, rumore di formato rimandato al primo aggiornamento vero.
- **G2**: tolto `@tanstack/react-query-devtools` dal comando. La 5.104.2 richiede `@tanstack/react-query ^5.104.2`, che
  sale nel G4; per chiudere le CVE bastava aggiornare le transitive. I devtools sono saliti nel G4.
- **G3**: `boost:update` lanciato e poi **annullato**. Con Boost 2.10.3 aggiunge circa 170 righe di guideline in coda a
  `apps/laravel/CLAUDE.md` (oltre ad `AGENTS.md`), aggiunge la skill `fortify-development` e modifica `boost.json` e
  13 file in `.claude/skills/`. Non serve all'upgrade e cambia il file delle regole di progetto: decide l'utente.
- **G4**: **axe-core resta a 4.13.0**. `@axe-core/playwright` 4.13.0 (l'ultima) dichiara `axe-core ~4.13.0` e npm tiene
  una sola copia. Così Vitest ed E2E usano le stesse regole. La 4.14 (attiva `label-content-name-mismatch`) arriverà
  con `@axe-core/playwright` 4.14.
- **G7**: Composer ha stampato per ogni pacchetto rimosso `There was an error dispatching or handling the
  [composer_package.*:pre_uninstall] event. Continuing with package removal...`. La rimozione è comunque completa:
  `vendor/laravel-lang` e `vendor/dragon-code` assenti, `composer install --dry-run` senza modifiche,
  `package:discover` ok. Nota: il corpo del commit `67a8239` dice "laravel-lang/* 17 pacchetti", ma sono 16 più
  `laravel-lang/common` (non ho corretto il commit per non riscrivere la history).

### Gruppi non eseguiti

- **G5** (radix-ui 1.8), **G8** (vincolo PHP e PHPUnit 13), **G9** (`@types/node` 26), **G11** (pulizia dello skeleton
  frontend Laravel): esclusi dall'utente in questo giro.
- **G10** (TypeScript 7): da rimandare, come da piano.

### Da decidere o fare dopo

- **G9** è ora sbloccato: con Node 26 scelto nel G1, `@types/node` va allineato alla 26 (oggi 24.19.2).
- **`boost:update`** (vedi G3): decidere se accettare le guideline in coda a `CLAUDE.md` e la skill `fortify-development`.
- **npm 11.20** segnala `fsevents@2.3.3` con install script non coperti da `allowScripts`. Non serve intervenire,
  perché fsevents ha già il binario precompilato e watcher e test funzionano. Si può approvare con
  `npm install-scripts approve fsevents`.
- `npm audit` completo: restano 6 high della catena `shadcn` → `fast-glob` → `micromatch` → `braces`, senza fix e
  solo per la CLI (rischio accettato, vedi §8).

### Controlli manuali consigliati

- Riavviare il dev server Vite già acceso sulla 5174 (avviato alle 10:23 con le dipendenze precedenti) ed eseguire
  `nvm use` / `npm ci` sulle altre macchine.
- Email su Mailpit: aprire una per tipo (codice di accesso, invito, reset, password cambiata, avvisi admin) e controllare
  che nomi con caratteri Markdown si vedano bene dopo il fix di escape di Laravel 13.36. Gli E2E ripuliscono Mailpit:
  qui ho controllato solo l'email di accesso.
- React Query Devtools in sviluppo: apertura e lista delle query (verificata solo in headless).
