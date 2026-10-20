# Dependency audit — 2026-10-20

Audit in sola lettura delle dipendenze di `apps/laravel` (Laravel 13, Sail, solo API) e `apps/react` (SPA React + Vite, npm
sull'host). Branch analizzato: `feature/sp2-fase-2-saldi`. All'avvio HEAD era `bba4155`; durante l'audit un altro processo ha
committato `e424d37` e `3d9263c`, poi ha lasciato nuove modifiche non committate in `apps/react` (vedi §12). La baseline del §10
vale per HEAD `3d9263c` con working tree pulito. Oltre a questo report non ho modificato nessun file del progetto: la build
ha rigenerato `apps/react/dist/`, che è in `.gitignore`.

Manifest trovati (esclusi `vendor/` e `node_modules/`): `apps/laravel/composer.json` + `composer.lock`,
`apps/react/package.json` + `package-lock.json`, `apps/laravel/package.json` (skeleton, senza lockfile né `node_modules`).
Nella root non ci sono manifest.

---

## 1. Sintesi

| Area | Verdetto |
|---|---|
| Runtime | PHP 8.5.11 in Sail aggiornato e supportato. Node sull'host 26.11.1, con `.nvmrc` ed `engines` (risolto il 14/10); 26.12.0 disponibile, ma senza security release dopo la 26.5.1. Node 26 diventa LTS il 28/10/2026. Resta aperto il vincolo `php: ^8.3`, più largo dell'ambiente reale. |
| Backend (Composer) | Sano: 0 advisory, 0 pacchetti abbandonati (verificato su Packagist per tutti i 140 pacchetti del lock). Disponibili Laravel 13.37.0 (minor) e PHPUnit 13 (major dev). |
| Frontend (npm) | Solo patch/minor nel vincolo, più tre salti fuori vincolo a basso rischio: `@hookform/resolvers` 6 (breaking solo per Effect), `cn` 0.5 e `@types/node` 26. TypeScript 7 resta **bloccato** da `typescript-eslint` 8.72.0. `axe-core` 4.14 adesso è sbloccato. |
| Deprecazioni nel codice | PHP: 0 (842 test, Larastan 0 errori). TS: **27 usi di API deprecate**, trovati con `@typescript-eslint/no-deprecated`: `FormEvent` di `@types/react` (19, D-04) e `QueryClient.fetchQuery` di TanStack Query (1 in produzione e 7 nei test, D-05/D-06). Non bloccano upgrade disponibili oggi. |
| Sicurezza | Composer: 0 CVE. npm: **0 vulnerabilità in produzione** (`--omit=dev`). Con le dev restano **6 high**, tutte da un unico advisory: `braces` (CVE-2026-93687), raggiunto via `shadcn` CLI. Fix non disponibile, rischio già accettato. |
| SEO/GEO | Solo pagine funzionali: SEO/GEO non applicabile. Manca ancora ogni misura `noindex` (robots, meta, `X-Robots-Tag`), come il 14/10. |
| Baseline | **Verde**: PHPUnit 842 test / 3944 asserzioni con 0 deprecazioni; Larastan 0 errori; Pint ok; Vitest 46 file / 511 test; lint 0 problemi; build ok. |

**Interventi più importanti**
1. **Laravel 13.37.0** (G1): corregge [#62007](https://github.com/laravel/framework/pull/62007). Con lo scheduler su più
   server, un task con `withoutOverlapping()->onOneServer()` può essere saltato da tutti i server. Il progetto ha 4 task così,
   compreso `balances:accrue` (maturazione dei saldi, `routes/console.php:19`).
2. **Aggiornamenti npm nel vincolo** (G2), con un'avvertenza: `shadcn ^4.21.0` ammette la 4.22.1. Un `npm update` senza
   argomenti violerebbe quindi la versione voluta da `CLAUDE.md` (`npx shadcn@4.21.0`): i pacchetti vanno elencati per nome.
3. **Deprecazioni TS** (G4): `FormEvent` → `SubmitEvent` in 19 file e `fetchQuery` → `query` in `src/features/auth/api.ts:95`.
   `fetchQuery` sparirà con TanStack Query 6, che non è ancora uscito.
4. **`noindex` per SPA e staging** (fuori dalle dipendenze, aperto dal 14/10): lo richiede `apps/laravel/CLAUDE.md`.
5. Decisioni ancora aperte dal 14/10: versione PHP di produzione → vincolo `^8.4` e PHPUnit 13 (G10), radix-ui 1.8 (G5),
   pulizia dello skeleton frontend di Laravel (G12).

---

## 2. Cosa è cambiato rispetto al report del 2026-10-14

### Stato del branch `chore/deps-2026-10-14`

**È già integrato** in `develop` e quindi nel branch corrente. Fonti: `git branch -a --contains 93e4ddd` e
`git branch -a --contains e896358` elencano `develop`, `origin/develop` e `feature/sp2-fase-2-saldi`;
`git merge-base --is-ancestor develop HEAD` è vero. L'integrazione è un fast-forward: la history è lineare, senza merge
commit, e il branch locale non esiste più. Comprende i 7 commit dei gruppi (`201a317` … `93e4ddd`), il report `fc06e5e`,
`20a907b` (`config/boost.php`: linee guida di Boost solo in `AGENTS.md`) ed `e896358` (`boost:update` accettato). Mergiare
quel branch oggi **non risolverebbe nient'altro**. Questi cambi **non sono ancora in `main` né in `staging`**: entrambi hanno
solo i 3 commit iniziali (`git log --oneline main`), quindi in produzione arriveranno con la promozione di `develop`.

### Già risolto (verificato su HEAD)

| Voce del 14/10 | Esito oggi | Verifica |
|---|---|---|
| R-04 Node host senza security release, R-08 versione Node non dichiarata | risolto | `node -v` 26.11.1; `apps/react/.nvmrc` = `26.11.1`; `engines.node` = `>=26.5.1` |
| CVE critical/high `seroval`, `solid-js`, `source-map-js` | risolto | `npm audit --json`: non compaiono più |
| C-01, C-02, C-06, C-08, C-12 (Laravel 13.36, Fortify 1.41, Larastan 3.13, Boost 2.10.3, Sail 1.69) | risolto | `composer show --direct` |
| npm patch/minor del G4 | risolto | `npm outdated`: restano solo uscite successive al 14/10 |
| N-21 `shadcn` in `dependencies` | risolto, ora in `devDependencies` | `package.json`; `npm audit --omit=dev` = 0 |
| C-07 `laravel-lang/common` e gli abbandonati C-16/C-17 (`dragon-code/*`), C-18 | risolto, rimossi | `grep -c "laravel-lang\|dragon-code" composer.lock` = 0; `composer audit` exit 0 |
| D-01…D-03 parametro `message` di Zod | risolto | nessun `.refine(…, { message })` in `src/` |
| N-37 peer `@testing-library/dom` non dichiarata | risolto | dichiarata `^10.4.2` (qui N-52) |
| `boost:update` da decidere | risolto | commit `e896358` + `20a907b` |

### Ancora aperto

- G5 del 14/10 radix-ui 1.6 → 1.8 (qui **G5**), G8 vincolo PHP + PHPUnit 13 (qui **G10**), G9 `@types/node` 26 (qui **G9**),
  G10 TypeScript 7 (qui **G11**, ancora bloccato), G11 skeleton frontend di Laravel (qui **G12**).
- `noindex`/robots per SPA e staging (§9).
- Tag flottanti `redis:alpine` e `axllent/mailpit:latest` in `compose.yaml` (R-12).
- Catena `braces` di `shadcn` (rischio accettato, nessun fix).
- Pin di `@tanstack/react-table` 9.2.4 (voluto).
- `fsevents@2.3.3` senza approvazione degli install script (`npm ls` lo mostra sotto `vite`); non è un errore.
- Controllo a vista su Mailpit delle email con nomi che contengono caratteri Markdown: **non verificabile** da questo audit.

### Novità dal 14/10

- Laravel **13.37.0** (16/10), con il fix dello scheduler citato sopra.
- `@hookform/resolvers` **6.0.0** (19/10), `cn` **0.5.0** (16/10), `shadcn` **4.22.1** (18/10), `react`/`react-dom`
  **19.3.1** (14/10), `react-router` **8.5.0** (19/10, che depreca le API di view transition; il progetto non le usa).
- `@axe-core/playwright` **4.14.0** (15/10) dichiara `axe-core ~4.14.0`: si sblocca l'aggiornamento di `axe-core` rimandato nel G4.
- **Deprecazioni TS non viste il 14/10**: `FormEvent` era già deprecato in `@types/react` 19.3.0, la stessa versione
  installata allora (assente in 19.2.0, presente in 19.2.18 e 19.3.0, verificato con `npm pack`); `fetchQuery` è deprecato da
  `@tanstack/query-core` 5.104.0 (assente in 5.100.0). Il 14/10 la ricerca era stata fatta a mano solo sui tipi di Zod.
  Stavolta ho usato la regola type-aware `@typescript-eslint/no-deprecated`.
- Node 24 (container Sail) entra in maintenance **oggi**, 20/10/2026; Node 26 diventa LTS il 28/10/2026.
- L'advisory di `braces` ora ha un CVE: CVE-2026-93687 (CVSS 7.5, pubblicato il 18/09/2026, nessuna versione corretta).
- Test: PHP da 590 a 842, Vitest da 360 a 511 (sotto-progetto 2: sedi, tipi di assenza, saldi).

---

## 3. Runtime e framework

| ID | Componente | In uso | Ultima disponibile | Fine bug fix | Fine security fix | Stato | Prio | Fonte / note |
|---|---|---|---|---|---|---|---|---|
| R-01 | PHP (container Sail `sail-8.5/app`) | 8.5.11 | 8.5.11 (24/09/2026) | 31/12/2027 | 31/12/2029 | ok | — | `vendor/bin/sail php -v`; php.net/releases JSON; php.net/supported-versions. Sull'host c'è PHP 8.5.7, che il progetto non usa. |
| R-02 | Vincolo PHP in `composer.json` | `"php": "^8.3"`, nessun `config.platform` | — | 8.3: già finito (31/12/2025) | 8.3: 31/12/2027 | da allineare (aperto) | P2 | PHPUnit 13 richiede PHP ≥ 8.4.1 (Packagist p2 `phpunit/phpunit` 13.4.3). La versione PHP di produzione **non è documentata** (`docs/deploy/README.md` non la cita). |
| R-03 | Laravel | 13.36.0 | 13.37.0 (16/10/2026) | Q3 2027 | 17/03/2028 | minor disponibile | P3 (consigliato presto, vedi C-01) | laravel.com/docs/13.x/releases ("Support Policy"). Laravel 14 non è uscito; la pagina indica rilasci annuali "~Q1". |
| R-04 | Node sull'host (React: dev, test, build) | 26.11.1 | 26.12.0 (14/10/2026, non security) | LTS dal 28/10/2026; maintenance dal 20/10/2027 | 30/04/2029 | ok | — | `node -v`; nodejs.org/dist/index.json: ultima security release della 26 è la 26.5.1 (28/07/2026); schedule.json di nodejs/Release. |
| R-05 | Node nel container Sail | 24.21.0 | 24.22.0 (14/10/2026, non security) | **maintenance da oggi (20/10/2026)** | 30/04/2028 | ok, info | P3 | `vendor/bin/sail node -v`; `docker/8.5/Dockerfile` `ARG NODE_VERSION=24`. L'app React non lo usa (le istruzioni dicono npm sull'host). |
| R-06 | npm | host 11.20.0 / Sail 12.1.0 | — | — | — | info | — | `npm -v`, `vendor/bin/sail npm -v`. |
| R-07 | Composer | Sail 2.10.3 | 2.10.3 | — | — | ok | — | `vendor/bin/sail composer --version`; getcomposer.org/versions. |
| R-08 | Versione di Node dichiarata | `.nvmrc` `26.11.1`, `engines.node >=26.5.1` | — | — | — | ok (risolto il 14/10) | — | `apps/react/.nvmrc`, `package.json`. |
| R-09 | React | 19.3.0 | 19.3.1 (14/10/2026) | nessuna policy pubblicata | nessuna policy pubblicata | patch disponibile | P3 | Release v19.3.1 su GitHub: solo "React Server Components – Improve transport protocol", che non riguarda una SPA. |
| R-10 | TypeScript | 6.0.3 (`~6.0.2`) | 7.0.2 (08/07/2026); 7.1 solo `next` (`7.1.0-dev.20261020.3`) | nessuna policy | nessuna policy | major disponibile, **bloccata** | P2 | `npm view typescript dist-tags`; `typescript-eslint@8.72.0` (latest) e `@canary` dichiarano ancora peer `typescript >=4.8.4 <6.1.0`. |
| R-11 | Vite | 8.3.4 | 8.3.4 | — | — | ok | — | `npm view vite dist-tags`. |
| R-12 | Servizi Sail | `mysql:8.4`, `redis:alpine`, `axllent/mailpit:latest` | — | non verificato | non verificato | info (aperto) | P3 | `compose.yaml`: i tag flottanti rendono l'ambiente non riproducibile. |

---

## 4. Dipendenze Composer (`apps/laravel`, via Sail)

Fonti: `vendor/bin/sail composer show --direct --format=json`, `composer outdated [--direct] [--major-only] --format=json`,
`composer audit --format=json` (exit 0), `https://repo.packagist.org/p2/<pkg>.json` per **tutti** i 140 pacchetti del lock.
`composer validate --no-check-publish`: valido. `composer check-platform-reqs`: tutto `success`.

| ID | Pacchetto | Gruppo | Installata | Ultima nel vincolo | Ultima assoluta | Salto | Stato | Rischio | Prio | Note / changelog |
|---|---|---|---|---|---|---|---|---|---|---|
| C-01 | laravel/framework | require | 13.36.0 | 13.37.0 | 13.37.0 (16/10/2026) | minor | minor disponibile | basso | P3, da fare presto | Contiene [#62007](https://github.com/laravel/framework/pull/62007): `CacheEventMutex::exists()` usa `Lock::isLocked()` invece di acquisire e rilasciare il lock, cosa che con più server faceva saltare a tutti i task con `onOneServer()` + `withoutOverlapping()` (1–3% dei casi secondo la PR). Ci riguarda: `routes/console.php:14-19` (`model:prune`, `auth:clear-resets`, `queue:prune-failed`, `balances:accrue`). Su un solo server il problema non si presenta; `balances:accrue` comunque recupera dallo storico al giro successivo. Altri fix: lock unique rilasciati se il push in coda fallisce, accessor `Attribute` in cache, `latest()`/`oldest()` qualificati nelle join. [Release](https://github.com/laravel/framework/releases/tag/v13.37.0) |
| C-02 | laravel/fortify | require | 1.41.0 | 1.41.0 | 1.41.0 | — | ok | — | — | |
| C-03 | laravel/sanctum | require | 4.3.3 | 4.3.3 | 4.3.3 | — | ok | — | — | Ultima release 23/06/2026. |
| C-04 | laravel/tinker | require | 3.0.2 | 3.0.2 | 3.0.2 | — | ok | — | — | Tool CLI che lo skeleton ufficiale mette in `require`: lo lascio lì. |
| C-05 | fakerphp/faker | require-dev | 1.24.1 | 1.24.1 | 1.24.1 | — | **fermo** (21/11/2024, circa 23 mesi) | — | P3 | Non abbandonato su Packagist (`abandoned` assente). Lo usano factory e test. Da monitorare. |
| C-06 | larastan/larastan | require-dev | 3.13.0 | 3.13.0 | 3.13.0 | — | ok | — | — | Livello 6 (`phpstan.neon`). |
| C-07 | laravel-lang/common | — | rimosso il 14/10 (G7) | — | — | — | risolto | — | — | |
| C-08 | laravel/boost | require-dev | 2.10.3 | 2.10.3 | 2.10.3 | — | ok | — | — | |
| C-09 | laravel/pail | require-dev | 1.2.7 | 1.2.7 | 1.2.7 | — | ok | — | — | |
| C-10 | laravel/pao | require-dev | 1.1.5 | 1.1.5 | 1.1.5 | — | ok | — | — | Riassume l'output per gli agent; per l'output completo vedi §10. |
| C-11 | laravel/pint | require-dev | 1.32.1 | 1.32.1 | 1.32.1 | — | ok | — | — | |
| C-12 | laravel/sail | require-dev | 1.69.0 | 1.69.0 | 1.69.0 | — | ok | — | — | |
| C-13 | mockery/mockery | require-dev | 1.6.15 | 1.6.15 | 1.6.15 | — | ok | — | — | |
| C-14 | nunomaduro/collision | require-dev | 8.9.5 | 8.9.5 | 8.9.5 | — | ok | — | — | Ammette PHPUnit 13. |
| C-15 | phpunit/phpunit | require-dev | 12.5.39 | 12.5.39 | **13.4.3** (16/10/2026) | **major** | major disponibile | medio | P2 | Richiede PHP ≥ 8.4.1 (R-02). PHPUnit 12 riceve bug fix fino al 05/02/2027, PHPUnit 13 fino al 04/02/2028 (phpunit.de/supported-versions). Nei test non risultano `$this->any()`, `expectExceptionMessage`, `createMock`/`createStub`/`getMockBuilder`, `->expects(` o `cacheResult`/`executionOrder` (grep su `tests/` e `phpunit.xml`); la suite ha 0 deprecazioni PHPUnit con `--display-phpunit-deprecations`. [Announcement](https://phpunit.de/announcements/phpunit-13.html) |
| C-16…C-18 | dragon-code/support, dragon-code/pretty-array, laravel-lang/config | — | rimossi il 14/10 (G7) | — | — | — | risolto | — | — | |
| C-19 | Transitive patch/minor | — | guzzlehttp/guzzle 8.2.0, promises 3.0.2, psr7 3.1.0, nesbot/carbon 3.14.2, league/commonmark 2.10.3, league/uri(-interfaces) 7.8.1, filp/whoops 2.18.6, dragonmantank/cron-expression 3.6.0 | 8.3.0, 3.1.0, 3.2.0, 3.15.0, 2.10.4, 7.9.0, 2.18.7, 3.6.1 | idem | patch/minor | patch/minor | basso | P3 | Salgono con C-01 nel `composer update`. |
| C-20 | Transitive di PHPUnit (php-code-coverage 12.5.8 → 14.4.1, sebastian/* ecc.) | dev | — | — | major | major | con C-15 | — | P2 | Seguono C-15. |
| C-21 | Transitive ferme da oltre 18 mesi: `psr/*` (container, log, clock, simple-cache, http-*, event-dispatcher), `league/config` 1.2.0 (2022), `dflydev/dot-access-data` 3.0.3 (2024), `egulias/email-validator` 4.0.4 (03/2025), `ramsey/collection` 2.1.1 (03/2025), `phar-io/*`, `staabm/side-effects-detector` | — | ultima | ultima | ultima | — | ferme, non abbandonate | — | — | Sono interfacce o librerie stabili richieste dal framework. Nessuna ha `abandoned` su Packagist. Nessuna azione. |

`composer audit` dà `"advisories": []` e `"abandoned": []`. Il controllo diretto su Packagist conferma 0 abbandonati: stavolta
il lock non nasconde niente, a differenza del 14/10.

---

## 5. Dipendenze npm

### 5a. `apps/react` (npm sull'host, `node_modules` presente)

Fonti: `npm outdated --json`, `npm audit [--omit=dev] --json`, `npm ls --depth=0` (exit 0, nessun `invalid`/`extraneous`/
`missing`), `npm view <pkg> version deprecated time repository.url peerDependencies engines --json`. Nessuna dipendenza diretta
è `deprecated` sul registro. Uso nel codice: conteggio dei file che importano il pacchetto in `src/`, `e2e/` e nelle config.

| ID | Pacchetto | Gruppo | Installata | Ultima nel vincolo | Ultima assoluta | Salto | Stato | Rischio | Prio | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| N-01 | react | dep | 19.3.0 | 19.3.1 | 19.3.1 | patch | patch | basso | P3 | Solo RSC (R-09). 91 file. |
| N-02 | react-dom | dep | 19.3.0 | 19.3.1 | 19.3.1 | patch | patch | basso | P3 | Peer `react ^19.3.1`: va aggiornato insieme a N-01. |
| N-03 | react-router | dep | 8.4.0 | 8.5.0 | 8.5.0 | minor | minor | basso | P3 | La 8.5.0 depreca `viewTransition`, `useViewTransitionState` e `NavLink isTransitioning` (rimozione in v9): il progetto **non li usa** (grep 0). Altri fix: `fetcher.reset()`, `matchPath`. [CHANGELOG v8.5.0](https://github.com/remix-run/react-router/blob/main/CHANGELOG.md#v850). 44 file. |
| N-04 | @tanstack/react-query | dep | 5.104.2 | 5.104.5 | 5.104.5 | patch | patch | basso | P3 | Vedi D-05/D-06 (`fetchQuery` deprecato). |
| N-05 | @tanstack/react-query-devtools | dep | 5.104.2 | 5.104.5 | 5.104.5 | patch | patch | basso | P3 | Peer `@tanstack/react-query ^5.104.5`: va aggiornato insieme a N-04. Non entra nel bundle (grep su `dist/assets` di `seroval`, `solid-js`, `tsqd`: 0). |
| N-06 | @tanstack/react-table | dep | **9.2.4 (pinnata)** | 9.2.4 | 9.3.1 | minor | minor disponibile; **pin voluto** | basso | P3 | Pin intenzionale (commit `4081b0d`). Invariato rispetto al 14/10. |
| N-07 | @hookform/resolvers | dep | 5.9.1 | 5.9.2 | **6.0.0** (19/10/2026) | **major** | major disponibile | basso | P3 | Unico breaking change della 6.0.0: il resolver **effect-ts** richiede Effect v4. Il progetto usa solo il resolver zod (12 file). La 5.9.2 corregge solo il resolver ajv. [Release v6.0.0](https://github.com/react-hook-form/resolvers/releases/tag/v6.0.0). Uscita da un giorno: conviene attendere qualche patch (§12). |
| N-08 | react-hook-form | dep | 7.90.0 | 7.90.0 | 7.90.0 | — | ok | — | — | |
| N-09 | zod | dep | 4.6.7 | 4.6.7 | 4.6.7 | — | ok | — | — | 33 file. |
| N-10 | i18next | dep | 26.4.5 | 26.5.3 | 26.5.3 | minor | minor | basso | P3 | |
| N-11 | react-i18next | dep | 17.0.16 | 17.1.0 | 17.1.0 | minor | minor | basso | P3 | |
| N-12 | radix-ui | dep | 1.6.7 | 1.8.1 | 1.8.1 | minor (2) | minor con **cambi di comportamento** | medio | P3 | Aperto dal 14/10 (Dialog ARIA, Checkbox/RadioGroup senza click sintetici, Tooltip, DismissableLayer, reset dei form). 14 file. [Releases](https://www.radix-ui.com/primitives/docs/overview/releases) |
| N-13 | lucide-react | dep | 1.57.0 | 1.60.0 | 1.60.0 | minor | minor | basso | P3 | 56 file. |
| N-14 | class-variance-authority | dep | 0.7.1 | 0.7.1 | 0.7.1 | — | **fermo** (26/11/2024, circa 23 mesi) | — | P3 | Standard dei componenti shadcn (6 file). Da monitorare. |
| N-15 | cn | dep | 0.4.0 | 0.4.0 | **0.5.0** (16/10/2026) | minor 0.x (fuori dal caret `^0.4.0`) | da aggiornare a mano | basso | P3 | Regola di progetto: `cn` sostituisce `clsx` + `tailwind-merge`. Usato solo come `export { cn } from "cn"` in `src/lib/utils.ts` (importato da 22 file). La 0.5.0 toglie il supporto a Node 20 (`engines >=22`; noi usiamo 26) e cambia solo `cn build`, che il progetto non usa. [Release](https://github.com/shadcn-ui/cn/releases/tag/cn%400.5.0) |
| N-16 | next-themes | dep | 0.4.6 | 0.4.6 | 0.4.6 | — | **fermo** (11/03/2025, circa 19 mesi) | — | P3 | Peer React 19 ok, nessuna CVE. Da monitorare (§6). |
| N-17 | input-otp | dep | 1.5.0 | 1.5.0 | 1.5.0 | — | ok | — | — | |
| N-18 | sonner | dep | 2.0.8 | 2.0.8 | 2.0.8 | — | ok | — | — | |
| N-19 | @fontsource-variable/inter | dep | 5.3.0 | 5.3.0 | 5.3.0 | — | ok | — | — | Import CSS. |
| N-20 | tw-animate-css | dep | 1.4.0 | 1.4.0 | 1.4.0 | — | ok | — | — | Import CSS. |
| N-21 | shadcn | dev | 4.21.0 | **4.22.1** | 4.22.1 | minor | minor disponibile; **versione voluta 4.21.0** | basso | P3 | `CLAUDE.md` prescrive `npx shadcn@4.21.0 add …`. Il caret `^4.21.0` ammette la 4.22.1, quindi `npm update` senza argomenti la installerebbe. La 4.22 passa internamente a Zod 4 ma **dipende ancora** da `ts-morph ^26` e `fast-glob ^3.3.3` (`npm view shadcn@4.22.1 dependencies`): non chiude le CVE della catena `braces`. In runtime serve solo `@import "shadcn/tailwind.css"`. [CHANGELOG](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/CHANGELOG.md) |
| N-22 | vite | dev | 8.3.4 | 8.3.4 | 8.3.4 | — | ok | — | — | |
| N-23 | @vitejs/plugin-react | dev | 6.1.2 | 6.1.2 | 6.1.2 | — | ok | — | — | |
| N-24 | @tailwindcss/vite | dev | 4.3.3 | 4.3.3 | 4.3.3 | — | ok | — | — | |
| N-25 | tailwindcss | dev | 4.3.3 | 4.3.3 | 4.3.3 | — | ok | — | — | |
| N-26 | typescript | dev | 6.0.3 (`~6.0.2`) | 6.0.3 | **7.0.2** | **major** | major disponibile, **bloccata** | alto | P2 | Bloccata da N-27. Il tilde è una scelta voluta. |
| N-27 | typescript-eslint | dev | 8.71.2 | 8.72.0 | 8.72.0 | minor | minor | basso | P3 | Peer `typescript >=4.8.4 <6.1.0` anche in 8.72.0 e in `canary`. |
| N-28 | eslint | dev | 10.12.0 | 10.13.0 | 10.13.0 | minor | minor | basso | P3 | |
| N-29 | @eslint/js | dev | 10.0.1 | 10.0.1 | 10.0.1 | — | ok | — | — | |
| N-30 | eslint-plugin-react-hooks | dev | 7.1.1 | 7.1.1 | 7.1.1 | — | ok | — | — | |
| N-31 | eslint-plugin-react-refresh | dev | 0.5.7 | 0.5.7 | 0.5.7 | — | ok | — | — | |
| N-32 | @tanstack/eslint-plugin-query | dev | 5.104.2 | 5.104.5 | 5.104.5 | patch | patch | basso | P3 | |
| N-33 | globals | dev | 17.13.0 | 17.13.0 | 17.13.0 | — | ok | — | — | |
| N-34 | vitest | dev | 5.0.4 | 5.0.5 | 5.0.5 | patch | patch | basso | P3 | |
| N-35 | jsdom | dev | 30.1.2 | 30.1.3 | 30.1.3 | patch | patch | basso | P3 | Usato come ambiente di Vitest (nessun import diretto). |
| N-36 | msw | dev | 3.0.3 | 3.0.3 | 3.0.3 | — | ok | — | — | |
| N-37 | @testing-library/react | dev | 16.3.3 | 16.3.3 | 16.3.3 | — | ok | — | — | |
| N-38 | @testing-library/jest-dom | dev | 7.0.1 | 7.0.1 | 7.0.1 | — | ok | — | — | |
| N-39 | @testing-library/user-event | dev | 14.6.8 | 14.6.8 | 14.6.8 | — | ok | — | — | |
| N-40 | @playwright/test | dev | 1.64.1 | 1.64.1 | 1.64.1 | — | ok | — | — | |
| N-41 | @axe-core/playwright | dev | 4.13.0 | 4.14.0 | 4.14.0 (15/10/2026) | minor | minor | basso-medio | P3 | La 4.14.0 dipende da `axe-core ~4.14.0`: sblocca N-42. |
| N-42 | axe-core | dev | 4.13.0 | 4.14.0 | 4.14.0 | minor | minor, **sbloccato** | basso-medio | P3 | Rimandato il 14/10 per tenere una sola copia allineata a N-41. Va aggiornato **insieme** a N-41. Secondo il report del 14/10 la 4.14 attiva `label-content-name-mismatch`, che può far fallire i test a11y (`src/test/axe.ts`, E2E con axe). |
| N-43 | @types/node | dev | 24.19.2 | 24.19.2 | **26.6.5** | major | major disponibile | basso | P3 | Con Node 26 scelto (R-04) va allineato alla 26. Peer di vite/vitest soddisfatte. |
| N-44 | @types/react | dev | 19.3.0 | 19.3.0 | 19.3.0 | — | ok | — | — | Depreca `FormEvent`: vedi D-04. |
| N-45 | @types/react-dom | dev | 19.3.0 | 19.3.0 | 19.3.0 | — | ok | — | — | |
| N-52 | @testing-library/dom | dev | 10.4.2 | 10.4.2 | 10.4.2 | — | ok | — | — | Dichiarata nel G12 del 14/10. |

### 5b. `apps/laravel/package.json` (skeleton)

`node_modules` e lockfile mancano: `vendor/bin/sail npm audit` fallisce con `ENOLOCK`, `sail npm outdated --json` riporta
solo `@laravel/multiplex` (0.4.5). La situazione è identica al 14/10: **tutto inutilizzato** in un'app solo API.

| ID | Pacchetto | Gruppo | Vincolo | Ultima | Stato | Prio | Note |
|---|---|---|---|---|---|---|---|
| N-46 | vite | dev | ^8.0.0 | 8.3.4 | inutilizzato | P3 | Lo usano solo `vite.config.js`, `resources/css/app.css`, `resources/js/app.js` e `welcome.blade.php`. |
| N-47 | laravel-vite-plugin | dev | ^3.1 | 3.2.0 | inutilizzato | P3 | Come sopra. |
| N-48 | @tailwindcss/vite | dev | ^4.0.0 | 4.3.3 | inutilizzato | P3 | Come sopra. |
| N-49 | tailwindcss | dev | ^4.0.0 | 4.3.3 | inutilizzato | P3 | Come sopra. |
| N-50 | concurrently | dev | ^10.0.3 | 10.0.6 | inutilizzato | P3 | Nessuno script lo richiama. |
| N-51 | @laravel/multiplex | optional | ^0.4.1 | 0.4.5 | inutilizzato di fatto | P3 | Lo usa solo `artisan dev`. |

---

## 6. Pacchetti da sostituire, inutilizzati o nel gruppo sbagliato

| Voce | Problema | Proposta | Motivo | File da toccare |
|---|---|---|---|---|
| N-46…N-51, frontend dello skeleton Laravel | Pacchetti e asset Vite/Tailwind inutilizzati; lo script `setup` di `composer.json` lancia ancora `npm install` e `npm run build` | **Rimuovere** `package.json`, `vite.config.js`, `resources/css/app.css`, `resources/js/app.js`, `resources/views/welcome.blade.php`, la rotta `/` in `routes/web.php:10-12`, `tests/Feature/ExampleTest.php` e i due passi npm di `setup` | `CLAUDE.md`: "Laravel espone solo API". Aperto dal 14/10 (decisione dell'utente) | 8 file |
| `composer.json` `allow-plugins.pestphp/pest-plugin` | Plugin di Pest non installato (il progetto usa PHPUnit) | Pulizia facoltativa, insieme alla voce sopra | Residuo dello skeleton | `composer.json` |
| N-16 `next-themes` | Fermo da 19 mesi | **Nessuna sostituzione ora**, solo monitoraggio. Se servirà, un `ThemeProvider` con Context come nella guida "Dark mode → Vite" di shadcn, coerente con la regola "Context API" | Funziona, peer React 19, nessuna CVE | circa 7 file (vedi report del 14/10) |
| N-14 `class-variance-authority`, C-05 `fakerphp/faker` | Fermi da circa 23 mesi | Nessuna azione: si monitorano | Repo attivi e standard di fatto (shadcn, skeleton Laravel) | — |
| N-21 `shadcn` | CLI con catena vulnerabile senza fix | Nessuna sostituzione: è la CLI ufficiale dei componenti in `src/components/ui/`. Già in `devDependencies` | Rischio accettato il 14/10 | — |

Duplicati funzionali: **nessuno**. `axe-core` serve a Vitest, `@axe-core/playwright` agli E2E. `clsx` arriva solo come
transitiva. Pacchetti coperti da framework o piattaforma: nessuno. `@types/*` superflui: nessuno, perché React 19.3 non include
i propri tipi. Nessun pacchetto runtime in `require-dev`/`devDependencies` né tool CLI in `require`/`dependencies`, a parte
`laravel/tinker`, che è il default ufficiale dello skeleton.

---

## 7. API deprecate nel nostro codice

**PHP**: `vendor/bin/sail artisan test --compact --display-deprecations` e PHPUnit completo con
`--display-deprecations --display-phpunit-deprecations --display-warnings --display-notices` danno **0 deprecazioni**
(842 test). Larastan livello 6: 0 errori.

**TS/JS**: build e lint senza avvisi. In più ho eseguito una scansione type-aware con `@typescript-eslint/no-deprecated`,
usando una config temporanea fuori dal repo (comando nel §10), su `src`, `e2e` e le config: 27 segnalazioni in 223 file.

| ID | `file:riga` | API | Fonte | Sostituto | Bloccante per |
|---|---|---|---|---|---|
| D-01…D-03 | — | `.refine(…, { message })` di Zod | report del 14/10 | — | **risolto** (G12, commit `93e4ddd`) |
| D-04 | 19 occorrenze, elencate sotto | `React.FormEvent<HTMLFormElement>` | `node_modules/@types/react/index.d.ts:2172-2177`: "`@deprecated` FormEvent doesn't actually exist. You probably meant to use ChangeEvent, InputEvent, SubmitEvent, or just SyntheticEvent" | `SubmitEvent<HTMLFormElement>` (`index.d.ts:2263`), che esiste già in `@types/react` 19.3.0 | Nessun upgrade oggi. È solo un tipo: nessun effetto a runtime |
| D-05 | `apps/react/src/features/auth/api.ts:95` (codice di produzione) | `queryClient.fetchQuery({ … staleTime: 0 })` | `@tanstack/query-core` `hydration-*.d.ts:1926`: "`@deprecated` Use queryClient.query(options) instead. This method will be removed in the next major version." Deprecato da 5.104.0 | `queryClient.query({ queryKey, queryFn, staleTime: 0 })` (`QueryClient.query`, d.ts:1918) | **TanStack Query 6**, non ancora uscito (`npm view @tanstack/react-query dist-tags`: latest 5.104.5) |
| D-06 | `apps/react/src/features/auth/routeGuards.test.tsx:94`; `apps/react/src/lib/queryClient.test.ts:13, 27, 45, 53, 64, 74` (test) | `fetchQuery` | come D-05 | `query` | come D-05 |

Occorrenze di D-04 (in ogni file c'è anche l'import `type FormEvent` da `react`):

| File | Riga |
|---|---|
| `apps/react/src/features/absenceTypes/components/AbsenceTypeFormDialog.tsx` | 221 |
| `apps/react/src/features/administrators/components/InviteAdminForm.tsx` | 115 |
| `apps/react/src/features/administrators/components/PromoteExistingForm.tsx` | 91 |
| `apps/react/src/features/administrators/components/RevokeAdminDialog.tsx` | 82 |
| `apps/react/src/features/auth/pages/ForgotPasswordPage.tsx` | 87 |
| `apps/react/src/features/auth/pages/LoginPage.tsx` | 95 |
| `apps/react/src/features/auth/pages/ResetPasswordPage.tsx` | 93 |
| `apps/react/src/features/invitations/pages/AcceptInvitationPage.tsx` | 136 |
| `apps/react/src/features/locations/components/ClosureDialog.tsx` | 104 |
| `apps/react/src/features/locations/components/LocationFormDialog.tsx` | 99 |
| `apps/react/src/features/locations/components/ScheduleDialog.tsx` | 42 |
| `apps/react/src/features/profile/components/PasswordCard.tsx` | 90 |
| `apps/react/src/features/profile/components/PersonalDetailsCard.tsx` | 71 |
| `apps/react/src/features/profile/components/ProfileCard.tsx` | 11 (prop `onSubmit` dell'interfaccia) |
| `apps/react/src/features/users/components/ChangeRoleDialog.tsx` | 43 |
| `apps/react/src/features/users/components/ConfirmUserActionDialog.tsx` | 98 |
| `apps/react/src/features/users/components/EditUserDialog.tsx` | 150 |
| `apps/react/src/features/users/components/InviteUserDialog.tsx` | 110 |
| `apps/react/src/features/users/components/UserScheduleForm.tsx` | 54 |

(19 file, una segnalazione ciascuno; in `ProfileCard.tsx` è la prop `onSubmit` dell'interfaccia. Totale della scansione: 19 + 8 `fetchQuery` = 27.) Le righe valgono per HEAD
`3d9263c`; le modifiche non committate comparse dopo (§12) potrebbero spostarle.

Verifiche sulle major disponibili:
- **react-router 8.5** (N-03): le API di view transition deprecate non sono usate.
- **@hookform/resolvers 6** (N-07): il breaking change riguarda solo `@hookform/resolvers/effect-ts`; il progetto importa solo
  `@hookform/resolvers/zod`.
- **cn 0.5** (N-15): cambiano solo `engines` e `cn build`; l'API `cn()` non cambia.
- **PHPUnit 13** (C-15): nessuna API rimossa o deprecata in uso (§4).
- **TypeScript 7** (N-26): come il 14/10, l'unico blocco è `typescript-eslint`.
- **Zod**: `.superRefine` (`ClosureDialog.tsx:30`, `AbsenceTypeFormDialog.tsx:47`) **non** è marcato `@deprecated` nei tipi di
  Zod 4.6.7 (`v4/classic/schemas.d.ts:42`). La scansione non lo segnala, quindi nessuna azione.

---

## 8. Sicurezza

### Composer
`vendor/bin/sail composer audit --format=json`: **0 advisory**, `abandoned: []`, exit 0. Confermato su Packagist: nessun
pacchetto del lock è abbandonato.

### npm (`apps/react`)

| | critical | high | moderate | low | totale |
|---|---|---|---|---|---|
| `npm audit --omit=dev` (produzione) | 0 | 0 | 0 | 0 | **0** |
| `npm audit` (tutto) | 0 | 6 | 0 | 0 | 6 |

Le 6 high sono **un solo advisory** propagato lungo la catena di dipendenze:

| Pacchetto vulnerabile | Severità | Advisory | Catena | Prod/dev | Fix | Compatibile coi vincoli |
|---|---|---|---|---|---|---|
| braces ≤ 3.0.3 | high (CVSS 7.5) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) / CVE-2026-93687, DoS per stack exhaustion con pattern annidati (pubblicato il 18/09/2026) | `shadcn` (dev) → `fast-glob@3.3.3` → `micromatch@4.0.8` → `braces@3.0.3` | solo dev (CLI) | **nessuno**: `first_patched_version: null`; 3.0.3 è l'ultima versione di `braces` | No. `npm audit fix` propone `shadcn@1.0.0` (downgrade semver-major): **da non applicare**. Anche `shadcn@4.22.1` dipende ancora da `fast-glob` |
| micromatch, fast-glob, ts-morph, @ts-morph/common, shadcn | high (derivate) | come sopra | come sopra | solo dev | come sopra | come sopra |

Il codice vulnerabile non arriva nel bundle: grep su `dist/assets/*.js` di `micromatch`, `ts-morph`, `seroval`, `solid-js`:
0 risultati. Il rischio è quello già accettato il 14/10 (CLI eseguita in locale su pattern nostri).

`apps/laravel/package.json`: senza lockfile `npm audit` non si può eseguire (`ENOLOCK`). I pacchetti sono inutilizzati (§5b).

### Raccomandazione
Questo audit non copre la logica applicativa. Si consiglia di lanciare **`/dieffetech-security:security-audit-code`** (lo
avvia l'utente). Il branch corrente aggiunge API nuove con permessi per sede e ruolo (saldi, rettifiche, tipi di assenza,
abilitazioni per persona), che vale la pena controllare prima della promozione.

---

## 9. SEO / GEO

**Pagine senza login** (`apps/react/src/routes.tsx`, fuori da `ProtectedRoute`): `/login`, `/login/verify`,
`/forgot-password`, `/reset-password/:token` (dentro `GuestRoute`), `/invitation/:token`, `/privacy`, 404. Tutte funzionali
(accesso, recupero password, invito, informativa). Le nuove pagine (`/admin/absence-types` e le altre di `/admin/*`) sono
dietro `ProtectedRoute`. In Laravel c'è anche `GET /` (`welcome.blade.php`), residuo dello skeleton.

**Indicizzabilità** (invariata dal 14/10): `apps/react/public/` contiene solo `favicon.svg`, quindi **niente `robots.txt`**;
`index.html` ha `lang="it"` e `title` `%VITE_APP_NAME%`, ma **niente `<meta name="robots">`**;
`apps/laravel/public/robots.txt` ha `Disallow:` vuoto, cioè consente tutto; `X-Robots-Tag` non compare né in `app/`, né in
`config/`, né in `docs/deploy`.

**Verdetto: SEO/GEO non applicabile**: `dieffetech-seo:seo-audit` e `geo-audit` non servono. Resta da fare l'esclusione
dall'indicizzazione richiesta da `apps/laravel/CLAUDE.md`: `robots.txt` con `Disallow: /` nella SPA, oppure
`X-Robots-Tag: noindex` documentato in `docs/deploy/README.md`, che copre anche i link con token di reset e invito. Va
valutato anche `Disallow: /` in `apps/laravel/public/robots.txt`.

---

## 10. Baseline di qualità

Tutto **verde**: si può partire con gli upgrade. Container Sail già **attivi** (`app`, `mysql`, `redis`, `mailpit`, `queue`,
`scheduler`): non è servito `sail up -d`.

| Controllo | Comando esatto | Esito |
|---|---|---|
| Test backend | `cd apps/laravel && vendor/bin/sail artisan test --compact --display-deprecations` | verde: 842 test passati, 3944 asserzioni (riassunto PAO) |
| Test backend, output completo | `docker exec -e PAO_DISABLE=1 -u sail holidays-app php vendor/bin/phpunit --display-deprecations --display-phpunit-deprecations --display-warnings --display-notices --colors=never` | verde: `OK (842 tests, 3944 assertions)`, 0 deprecazioni/warning/notice, PHPUnit 12.5.39 su PHP 8.5.11 |
| Analisi statica | `vendor/bin/sail composer analyse` (Larastan livello 6) | verde: 0 errori |
| Stile | `vendor/bin/sail bin pint --test` | verde |
| Composer | `vendor/bin/sail composer validate --no-check-publish`; `vendor/bin/sail composer check-platform-reqs`; `vendor/bin/sail composer audit --format=json` | valido; requisiti ok; 0 advisory |
| Test frontend | `cd apps/react && npm test` | verde: 46 file, 511 test (Vitest 5.0.4) |
| Lint | `npm run lint` | verde: 0 problemi |
| Build | `npm run build` (`tsc -b && vite build`) | verde, nessun warning; chunk più grande `react-*.js` 313.06 kB (98.71 kB gzip) |
| API deprecate (TS) | `npx eslint -c <scratchpad>/eslint.deprecated.mjs --no-warn-ignored -f json src e2e vite.config.ts vitest.config.ts playwright.config.ts` (config temporanea fuori dal repo: parser `typescript-eslint` con `projectService` e la sola regola `@typescript-eslint/no-deprecated`) | 27 segnalazioni (§7) |
| npm | `npm outdated --json`; `npm audit --json`; `npm audit --omit=dev --json`; `npm ls --depth=0` | vedi §5 e §8; `npm ls` exit 0 |
| E2E | non eseguiti (modificano il DB di sviluppo; si fanno nella fase di upgrade) | — |

---

## 11. Piano di upgrade

Ordine consigliato: **G1 → G2 → G3 → G4**, poi G5, G6, G7, G8 e G9 a scelta. G10 richiede una decisione, G11 resta in attesa,
G12 è una decisione dell'utente. Un commit per gruppo. Gli E2E richiedono Sail acceso con `queue`,
`migrate:fresh --seed` e `cache:clear` (vedi `apps/react/CLAUDE.md`), con `DEV_SERVER_PORT=5173 npx playwright test` come
nell'esecuzione del 14/10.

Nessun P0: non ci sono CVE in produzione e tutti i runtime ricevono security fix.

| Gruppo | Prio | Rischio | Voci | Comando indicativo | Nostro codice da toccare | Verifica dopo | Dipende da |
|---|---|---|---|---|---|---|---|
| **G1** Composer patch/minor | P3, da fare presto (fix dello scheduler) | basso | C-01, C-19 | `cd apps/laravel && vendor/bin/sail composer update` (resta nei vincoli; aggiorna solo il lock) | nessuno previsto | `sail artisan test --compact`; `sail composer analyse`; `sail bin pint --test`; `sail composer audit`; `sail artisan schedule:list` (4 task con `withoutOverlapping`/`onOneServer`); test della maturazione dei saldi; E2E `login`, `locations` | — |
| **G2** npm patch/minor nel vincolo | P3 | basso | N-01…N-05, N-10, N-11, N-13, N-27, N-28, N-32, N-34, N-35, N-07 (solo 5.9.2) | `cd apps/react && npm update react react-dom react-router @tanstack/react-query @tanstack/react-query-devtools @tanstack/eslint-plugin-query i18next react-i18next lucide-react typescript-eslint eslint vitest jsdom @hookform/resolvers` (**pacchetti elencati per nome**, per non portare `shadcn` a 4.22.1 né sbloccare il pin di `@tanstack/react-table`) | nessuno previsto (solo `package-lock.json`) | `npm test`, `npm run lint`, `npm run build`; `npm ls shadcn` deve restare 4.21.0; E2E completi | — |
| **G3** axe-core 4.14 | P3 | basso-medio | N-41, N-42 | `npm install -D @axe-core/playwright@^4.14.0 axe-core@^4.14.0` | eventuali correzioni di accessibilità se la regola `label-content-name-mismatch` segnala qualcosa (etichette `aria-label` diverse dal testo visibile) | `npm test` (test axe in `src/test/axe.ts`); E2E con axe; `npm ls axe-core` con una sola copia | G2 |
| **G4** Deprecazioni TS | P3 | basso | D-04, D-05, D-06 | Nessun comando di pacchetti: `type FormEvent` → `type SubmitEvent` (stesso generico `<HTMLFormElement>`); `fetchQuery(…)` → `query(…)` | 19 file di D-04; `src/features/auth/api.ts`; `src/features/auth/routeGuards.test.tsx`; `src/lib/queryClient.test.ts` | rieseguire la scansione `no-deprecated` (§10) fino a 0; `npm test` (route guard, queryClient, form); `npm run lint`; `npm run build`; E2E `login`, `password-reset`, `profile` | G2 (consigliato) |
| **G5** radix-ui 1.6 → 1.8 | P3 | medio | N-12 | `npm update radix-ui` | `src/components/ui/*` solo se cambiano ARIA o focus | `npm test` (inclusi i test axe); E2E completi, con attenzione a dialog, alert-dialog, select, radio-group, checkbox e tooltip; prova manuale di tastiera e focus | G3 |
| **G6** @hookform/resolvers 6 | P3 | basso | N-07 (major) | `npm install @hookform/resolvers@^6.0.0`, meglio dopo qualche patch della 6.0 | nessuno previsto (si usa solo `@hookform/resolvers/zod`) | `npm test` (12 file con `zodResolver`); `npm run build`; E2E `admin-users`, `profile`, `locations` | G2 |
| **G7** cn 0.5 | P3 | basso | N-15 | `npm install cn@^0.5.0` | nessuno previsto (`src/lib/utils.ts` riesporta `cn`) | `npm test`, `npm run build`, controllo visivo di qualche componente con classi condizionali | G2 |
| **G8** shadcn CLI 4.22 (facoltativo) | P3 | basso | N-21 | Solo se si decide di superare la 4.21.0: `npm install -D shadcn@4.22.1` **e** aggiornare il comando `npx shadcn@…` in `apps/react/CLAUDE.md`. Non chiude le CVE. In alternativa, fissare `"shadcn": "4.21.0"` (senza caret) per rendere esplicito il pin | `package.json`, `apps/react/CLAUDE.md` | `npm run build` (`shadcn/tailwind.css` risolto); `npx shadcn@<versione> --version` | decisione dell'utente |
| **G9** @types/node 26 | P3 | basso | N-43 | `npm install -D @types/node@^26` | eventuali tipi Node in `*.config.ts` ed `e2e/` | `npm run build`, `npm run lint` | — |
| **G10** Vincolo PHP + PHPUnit 13 | P2 | medio | R-02, C-15, C-20 | Prima di tutto confermare la versione PHP di produzione. Poi `"php": "^8.4"` (o `^8.5`) con `config.platform.php`, e `vendor/bin/sail composer require --dev phpunit/phpunit:^13.4 -W` | `composer.json`, eventualmente `phpunit.xml` | PHPUnit completo con `PAO_DISABLE=1` e `--display-phpunit-deprecations`; `sail composer analyse`; `sail bin pint --test` | G1; versione PHP di produzione |
| **G11** TypeScript 7 | P2 | alto | N-26, R-10 | **Rimandare** finché `typescript-eslint` non dichiara il supporto (oggi peer `<6.1.0`, TS 7.1 ancora solo `next`) | `tsconfig*.json`, script `build` | `npm run build`, `npm run lint`, `npm test`, E2E | supporto in `typescript-eslint` |
| **G12** Pulizia dello skeleton frontend di Laravel | P3 | basso | N-46…N-51, `allow-plugins.pestphp` | Rimuovere i file elencati in §6 e i passi npm di `setup` | 8 file (§6) | `sail artisan test --compact`, `sail composer analyse`, `sail artisan route:list` | decisione dell'utente |

Fuori dal piano dipendenze:
- **Laravel 14**: non ancora disponibile (rilasci annuali "~Q1", laravel.com/docs/13.x/releases). Quando esce, l'upgrade va
  affidato all'agent **`dieffetech-dev:laravel-upgrade`** (versione per versione con la guida ufficiale), insieme a Fortify,
  Sanctum, Boost e agli altri pacchetti Laravel. Conviene arrivarci con G10 già fatto.
- **SEO**: `robots.txt`/`noindex` per SPA e staging (§9).
- **Sail**: fissare i tag di `redis` e `mailpit` (R-12). Valutare `NODE_VERSION=26` nel `Dockerfile` di Sail quando la 26
  sarà LTS (28/10), per allinearlo all'host; oggi il Node del container non è usato.
- **Pin di `@tanstack/react-table`** (N-06): invariato. Se si sblocca, a versione esatta `9.3.1`, con l'E2E `admin-users`.

---

## 12. Assunzioni e cose non verificate

- **Lavoro in parallelo sul repo.** All'avvio il working tree aveva modifiche non committate in `apps/react`. Alle
  10:32 e alle 10:34 un altro processo le ha committate (`e424d37`, `3d9263c`). Vitest, lint e build sono partiti alle 10:35,
  con HEAD `3d9263c` e working tree pulito (verificato con `git status` alle 10:36). I test PHP, Larastan e Pint riguardano
  file backend che quei commit non toccano. Dopo la baseline sono comparse **nuove modifiche non committate che non ho fatto
  io**: `AppShell.tsx`, `LocationDetailPage.tsx`, `users/actions(.test).ts`, `UsersAdminPage.tsx`, `routes.tsx`,
  `test/balancesFixtures.ts` e i file nuovi `features/balances/components/`, `features/settings/`, due test. La baseline non
  le comprende.
- **Merge di `chore/deps-2026-10-14`**: dedotto da `git branch --contains` e dalla history lineare. Il branch non esiste più
  né in locale né su `origin`, quindi non ho potuto confrontarne la punta; i suoi commit (citati nel report del 14/10) sono
  tutti in `develop`.
- **Versione PHP e Node di produzione**: **non verificate**, non sono nel repo né in `docs/deploy`. G10 presuppone che si
  possa salire almeno a PHP 8.4.
- **`@hookform/resolvers` 6.0.0**: è uscita il 19/10, un giorno prima dell'audit. Le note di rilascio indicano breaking change
  solo per effect-ts. Il resto non l'ho verificato installandola: proporre di attendere qualche patch è una scelta prudente.
- **axe-core 4.14 e `label-content-name-mismatch`**: l'informazione viene dal report del 14/10. Non ho riletto le note di
  axe-core 4.14.
- **React 19.3.1**: le note della release su GitHub citano solo RSC. Che non cambi nulla per la SPA è dedotto da lì.
- **Fix di Laravel #62007**: il bug si presenta con lo scheduler su più server. La topologia di produzione (uno o più server)
  non è documentata nel repo, quindi l'impatto reale non è verificato.
- **Scansione `no-deprecated`**: copre i file TS raggiunti dai tsconfig del progetto (`src`, `e2e`, config). Non copre i
  file PHP, per cui fanno fede PHPUnit e Larastan.
- **Date di deprecazione**: per `FormEvent` ho confrontato i pacchetti `@types/react` 19.2.0 (assente) e 19.2.18/19.3.0
  (presente); per `fetchQuery`, `@tanstack/query-core` 5.100.0 (assente) e 5.104.0 (presente). La versione esatta in cui
  sono comparse non è verificata.
- **Fine supporto di MySQL 8.4, Redis e Mailpit**: non verificata.
- **Skill `dieffetech-docs`**: non consultata, perché questo è un audit in sola lettura e non sviluppo. Le regole di
  `apps/*/CLAUDE.md` hanno precedenza.
- **GitHub API senza autenticazione** (limite di 60 richieste l'ora): ho letto solo le release necessarie (laravel/framework
  v13.37.0 e PR #62007, react-hook-form/resolvers, shadcn-ui/cn, react-router, react, advisory GHSA-vfj7-8cjw-p6xm).
- **Fonti principali**: php.net/supported-versions e php.net/releases (JSON); laravel.com/docs/13.x/releases;
  nodejs.org/dist/index.json e github.com/nodejs/Release (schedule.json); phpunit.de/supported-versions; registro npm
  (`npm view`, `npm pack`); repo.packagist.org/p2; GitHub releases e CHANGELOG di laravel/framework, react-router, react,
  react-hook-form/resolvers, shadcn-ui/cn, shadcn-ui/ui.
