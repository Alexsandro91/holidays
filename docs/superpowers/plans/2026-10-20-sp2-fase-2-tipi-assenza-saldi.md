# Sotto-progetto 2, fase 2 — Tipi di assenza e saldi: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** l'admin configura i tipi di assenza e i valori annui di maturazione. L'app fa maturare ogni mese i saldi di ferie, ROL ed ex festività dei dipendenti. Admin e responsabili li vedono, li rettificano e li allineano alla busta paga. Ognuno vede i propri in "Ferie e permessi".

**Architecture:**
- **Backend:**
  - nuovi model `AbsenceType`, `AccrualSetting`, `BalanceMovement`, `BalanceAlignment`;
  - il saldo è sempre la somma dei movimenti: lo calcola un solo servizio di lettura (`BalanceLedger`), le scritture passano da `BalanceAccrualService` (job mensile) e da `BalanceCorrectionService` (rettifiche e allineamenti), sempre sotto lock della riga dell'utente;
  - il diritto alla maturazione si ricostruisce dallo storico di fase 1 (`EmploymentTimeline`);
  - le rotte con `{user}` riusano lo scope e la risoluzione di fase 1 (fuori sede: 404).
- **Frontend:**
  - nuove feature `absenceTypes` (pagina admin, abilitazioni) e `balances` (pagina Saldi, scheda saldi, Allinea, Rettifica, Ferie e permessi, valori annui);
  - Utenti, dettaglio sede, sidebar e rotte si estendono.

**Tech Stack:** Laravel 13 · PHP 8.5 · Sail · Sanctum · PHPUnit · Larastan · React 19 · React Router · TanStack Query 5 · react-hook-form + zod · shadcn 4.21 (Radix) · i18next · Vitest + MSW · Playwright + axe.

**Spec:**
- `docs/superpowers/specs/2026-10-20-sp2-fase-2-tipi-assenza-saldi-design.md` (questa fase, prevale);
- `docs/superpowers/specs/2026-10-15-sp2-fase-1-sedi-calendario-design.md` (sedi, orari, scope, storico).

## Global Constraints

- **Branch e commit:**
  - branch `feature/sp2-fase-2-saldi`, già creato e attivo (la spec è già committata);
  - commit piccoli in Conventional Commits in italiano, senza riga di attribuzione;
  - mai push, mai toccare lo stash `stash@{0}`;
  - mai toccare i file non tracciati dell'utente (`.claude/agents/dependency-*.md`, `docs/audits/`).
- **Processi:** mai `pkill`, `killall` o `kill` su un pattern. Si termina solo il PID di un processo avviato da sé.
- **Comandi:** Laravel da `apps/laravel` con `./vendor/bin/sail …` (qui `sail`); frontend da `apps/react`.
- **Regole di progetto** (`apps/laravel/CLAUDE.md`, `apps/react/CLAUDE.md`): valgono quelle, **non** le guide Dieffetech escluse (niente antd/DF, `useApi`, SWR, Spatie QueryBuilder, classi base del template). Prima di scrivere codice si consulta la skill `dieffetech-docs` per la guida pertinente, che cede alle regole di progetto.
- **Lingua:** identificatori in inglese, **commenti in italiano**, testi per l'utente solo da traduzioni (`lang/{it,en}`, `src/locales/{it,en}.json`).
- **Laravel:**
  - `env()` solo in `config/`;
  - FormRequest per ogni input, output solo tramite API Resource, Policy native con metodi bool e senza query;
  - colonne di stato e di appartenenza (`balance`, `kind`, `actor_id`, `user_id`, `location_id`, `code`, `archived_at`, `position`) impostate solo nei service con `forceFill`;
  - log con context array, mai `catch` silenziosi; `Translate::text()` per i testi PHP;
  - nelle migration valori letterali, niente Enum né servizi;
  - dopo ogni modifica PHP `sail bin pint <file> --format agent`.
- **React:**
  - niente `any`, niente `as` (né `as const`), `interface` per le props, componenti arrow function, un componente per file;
  - niente `console.*`, classi condizionali con `cn` da `@/lib/utils`, niente `style={{}}` (la larghezza delle barre passa da una classe o da un attributo `value` di un componente progress, vedi Task 13);
  - dati server solo con TanStack Query, risposte validate con zod;
  - `erasableSyntaxOnly`: niente `enum` TS né parameter properties;
  - React Hooks v7: niente lettura o scrittura di `ref.current` durante il render, niente `setState` sincrono nel corpo di un `useEffect`.
- **Componenti shadcn mancanti:** solo con `npx shadcn@4.21.0 add <nome>`. Nessuna nuova dipendenza npm o composer. Le date si inseriscono con `<Input type="date">`.
- **Valori della spec:**
  - saldi in **minuti interi**; in interfaccia ore decimali con al massimo **2 cifre** ("87,5", "74,42"), input arrotondato al minuto;
  - giorni equivalenti solo per le ferie, con **1** cifra decimale;
  - valori annui di partenza: ferie **9600** minuti, ROL **0**, ex festività **0**;
  - quota mensile `round(annuo × settimanali_persona ÷ settimanali_sede ÷ 12)`, half-up;
  - regola della maturazione: dipendente attivo **il 1° oppure il 16** del mese;
  - job `balances:accrue` **ogni giorno**, fuso `Europe/Rome`;
  - nota della rettifica obbligatoria, nota dei movimenti al massimo **255** caratteri;
  - nome di un tipo al massimo **100** caratteri, unico senza distinzione tra maiuscole e minuscole, archiviati compresi;
  - lista Saldi paginata a **25**, movimenti **20** per pagina;
  - **16** tipi di partenza (spec §3.2).
- **Gate a fine di ogni task:**
  - backend: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint --test`;
  - frontend: `npm test`, `npm run lint`, `npm run build`.
- **Test Laravel:**
  - il client di test manda `Accept-Language: en-us`; i test che controllano testi italiani aggiungono `withHeader('Accept-Language', 'it')`;
  - le chiamate autenticate usano `$this->actingAs($user)`;
  - il tempo si fissa con `$this->travelTo(...)` quando il risultato dipende da "oggi". Attenzione: `travelTo` va fatto **prima** di creare utenti e storico, perché la maturazione legge `created_at`.
- **Database di sviluppo:** mai `migrate:fresh` o altro che lo svuoti. Le nuove migration si applicano con `sail artisan migrate`.

## Review Focus

1. **Allineamento e maturazione nello stesso mese:** l'utente allinea alla busta paga del 30/09 il 3 ottobre, dopo che ottobre è già maturato il 1°. Il saldo attuale deve essere valore della busta paga + quota di ottobre, non solo il valore della busta paga. Test in Task 7 (`test_alignment_keeps_later_movements`).
2. **Server fermo o rilascio a metà mese:** il job gira per la prima volta il 20 del mese. Chi era dipendente attivo il 1° o il 16 matura, chi è entrato il 18 no, e nessuno matura due volte se il job gira di nuovo il giorno dopo. Test in Task 6.
3. **Part-time:** una persona con orario personale di 20 ore in una sede da 40 matura metà quota; una persona che segue l'orario della sede (`follows_location`) matura la quota piena. Test in Task 6.
4. **Il responsabile corregge i propri saldi o quelli di un admin**, anche chiamando direttamente l'API: risponde 403 e non scrive nulla; un responsabile di un'altra sede riceve 404. Test in Task 7.
5. **Ore decimali con la virgola e saldi negativi:** "74,42", "-4", "−4" (segno meno tipografico), "4.5" vengono letti correttamente; un valore non numerico non invia nulla. Test in Task 9 (`hoursFormat`).

## Struttura dei file

**Laravel (`apps/laravel`)**

| File | Responsabilità |
|---|---|
| `database/migrations/2026_10_20_100000_create_absence_types_table.php` | `absence_types`, `absence_type_user`, 16 tipi di partenza |
| `database/migrations/2026_10_20_100100_create_balances_tables.php` | `accrual_settings` (riga azienda), `balance_movements`, `balance_alignments` |
| `app/Enums/{BalanceType,BalanceMovementKind,AbsenceDayCount,AbsenceLimitUnit,AbsenceLimitPeriod}.php` | Enum |
| `app/Models/{AbsenceType,AccrualSetting,BalanceMovement,BalanceAlignment}.php` (+ `User`) | Model |
| `database/factories/{AbsenceType,BalanceMovement}Factory.php` | Factory |
| `app/Support/{EmploymentTimeline,EffectiveAccrual,YearSummary}.php` | Valori e calcoli puri |
| `app/Services/{AbsenceTypeService,AccrualSettingsService,WeeklyMinutes,BalanceLedger,BalanceAccrualService,BalanceCorrectionService,AbsenceTypeEnablementService}.php` | Logica |
| `app/Console/Commands/AccrueBalances.php`, `routes/console.php` | Job mensile |
| `app/Policies/{AbsenceTypePolicy,AccrualSettingPolicy}.php`, `app/Policies/UserPolicy.php` | Permessi |
| `app/Http/Controllers/Admin/{AbsenceTypeController,AccrualSettingController,LocationAccrualController,UserAccrualController,UserAbsenceTypeController,BalanceOverviewController,UserBalanceController}.php` | Controller admin/responsabile |
| `app/Http/Controllers/Auth/{ProfileBalanceController,ProfileAbsenceTypeController}.php` | Profilo |
| `app/Http/Requests/AbsenceTypes/*.php`, `app/Http/Requests/Balances/*.php` | Validazione |
| `app/Http/Resources/{AbsenceTypeResource,BalanceMovementResource,BalanceSummaryResource,BalanceOverviewResource,AccrualResource}.php` (+ `ManagedUserResource`) | Output |
| `routes/api.php` | Rotte |
| `lang/{it,en}/{absence_types,balances}.php` (+ `enums.php`) | Testi |

**React (`apps/react/src`)**

| File | Responsabilità |
|---|---|
| `features/balances/hoursFormat.ts` | Ore decimali e giorni |
| `features/balances/api.ts` | Hook di saldi, movimenti, correzioni e valori annui |
| `features/absenceTypes/api.ts` | Hook dei tipi e delle abilitazioni |
| `features/absenceTypes/pages/AbsenceTypesPage.tsx`, `features/absenceTypes/components/*.tsx` | Pagina Tipi di assenza |
| `features/absenceTypes/components/UserAbsenceTypesDialog.tsx` | Abilitazioni di una persona |
| `features/settings/pages/SettingsPage.tsx`, `features/balances/components/AccrualValuesForm.tsx` | Impostazioni e valori annui |
| `features/locations/components/LocationAccrualCard.tsx` | Card nel dettaglio sede |
| `features/balances/components/{BalanceCards,BalanceMovementsList,UserBalancesDialog,AlignBalancesDialog,AdjustBalanceDialog,UserAccrualSection}.tsx` | Scheda saldi |
| `features/balances/pages/{BalancesPage,LeavePage}.tsx`, `features/balances/components/{BalancesTable,BalanceBar}.tsx` | Pagina Saldi e Ferie e permessi |
| `features/users/**` | Voci Saldi e Tipi di assenza |
| `routes.tsx`, `components/layout/AppShell.tsx`, `lib/queryKeys.ts` | Rotte, sidebar, chiavi |
| `locales/{it,en}.json` | Testi |
| `e2e/balances.spec.ts` | E2E |

## Contratti tra i task

Ogni task li rispetta alla lettera: sono i nomi e le forme che i task vicini usano.

**PHP**
- `App\Enums\BalanceType: string` — `Vacation = 'vacation'`, `Rol = 'rol'`, `ExHolidays = 'ex_holidays'`; `label(): string` (`enums.balance_type.*`); `settingColumn(): string` (`vacation_minutes`, `rol_minutes`, `ex_holidays_minutes`).
- `App\Enums\BalanceMovementKind: string` — `Accrual = 'accrual'`, `Adjustment = 'adjustment'`, `Alignment = 'alignment'`, `Usage = 'usage'`.
- `App\Enums\AbsenceDayCount: string` — `Working = 'working'`, `Calendar = 'calendar'`.
- `App\Enums\AbsenceLimitUnit: string` — `Days = 'days'`, `Hours = 'hours'`.
- `App\Enums\AbsenceLimitPeriod: string` — `Month = 'month'`, `Year = 'year'`, `Request = 'request'`.
- `App\Models\AbsenceType` — colonne di spec §3.1; cast `balance` → `?BalanceType`, `employment_types` → `array` (valori stringa), `day_count`, `limit_unit`, `limit_period` → enum, `archived_at` → `immutable_datetime`; `isSystem(): bool`, `isArchived(): bool`, `displayName(): string` (`name` se valorizzato, altrimenti `Translate::text("absence_types.names.{$code}")`), `appliesTo(EmploymentType $type): bool`; scope `active()`, `ordered()`; `enabledUsers(): BelongsToMany<User>` (tabella `absence_type_user`).
- `App\Models\AccrualSetting` — `static company(): self` (riga con `location_id` e `user_id` null, `firstOrFail`); `valueFor(BalanceType $balance): ?int`.
- `App\Models\BalanceMovement` — `UPDATED_AT = null`; cast `balance` → `BalanceType`, `kind` → `BalanceMovementKind`, `effective_on` → `immutable_date`; `user()`, `actor()`.
- `App\Models\BalanceAlignment` — `UPDATED_AT = null`; cast `aligned_on` → `immutable_date`.
- `App\Models\User` aggiunge `balanceMovements(): HasMany`, `accrualSetting(): HasOne<AccrualSetting>`, `enabledAbsenceTypes(): BelongsToMany<AbsenceType>`, `isEmployee(): bool` (`employment_type === EmploymentType::Employee`).
- `App\Support\EffectiveAccrual` (readonly) — `array<string, array{minutes: int, source: 'company'|'location'|'user'}> $values` indicizzato per `BalanceType->value`; `minutes(BalanceType): int`, `source(BalanceType): string`.
- `App\Services\AccrualSettingsService` — `forUser(User $user): EffectiveAccrual`, `forUsers(Collection<int, User> $users): array<int, EffectiveAccrual>` (query costanti), `forLocation(Location $location): EffectiveAccrual`, `updateCompany(array<string, int> $values, User $actor): AccrualSetting`, `updateLocation(Location $location, array<string, ?int> $values, User $actor): AccrualSetting`, `updateUser(User $user, array<string, ?int> $values, User $actor): AccrualSetting` (chiavi = colonne `*_minutes`).
- `App\Services\WeeklyMinutes` — `forUser(User $user, CarbonImmutable $day): int`, `forLocation(Location $location, CarbonImmutable $day): int`, `averageDayMinutes(User $user, CarbonImmutable $day): int` (settimanali ÷ giorni con minuti > 0, arrotondato).
- `App\Support\EmploymentTimeline` — `static for(User $user, Collection<int, UserHistory> $events): self`; `isActiveEmployeeAt(CarbonImmutable $instant): bool`. `App\Services\BalanceAccrualService::timelines(Collection<int, User>): array<int, EmploymentTimeline>` carica gli eventi in una query.
- `App\Services\BalanceAccrualService` — `accrue(CarbonImmutable $month, CarbonImmutable $now): int` (numero di movimenti scritti); `eligibility(EmploymentTimeline $timeline, CarbonImmutable $month, CarbonImmutable $now): ?CarbonImmutable` (giorno di riferimento, `null` = non matura); `static monthlyQuota(int $annual, int $weekly, int $locationWeekly): int` (formula di spec §4.2, usata anche dal Task 7).
- `App\Services\BalanceLedger` — `balanceAt(User $user, BalanceType $balance, CarbonImmutable $date): int`; `balancesAt(User $user, CarbonImmutable $date): array<string, int>`; `currentFor(Collection<int, User> $users, CarbonImmutable $today): array<int, array<string, int>>` (una query `SUM … GROUP BY`); `yearSummary(User $user, int $year, CarbonImmutable $today): array<string, YearSummary>`; `lastAlignedOn(Collection<int, User> $users): array<int, ?string>`; `lastAlignmentFor(User $user, BalanceType $balance): ?CarbonImmutable`; `applies(User $user): bool` (dipendente non invitato, oppure con movimenti).
- `App\Support\YearSummary` (readonly) — `int $opening`, `int $accrued`, `int $used`, `int $corrections`, `int $closing`.
- `App\Services\BalanceCorrectionService` — `adjust(User $target, BalanceType $balance, int $minutes, string $note, User $actor): BalanceMovement`; `align(User $target, CarbonImmutable $alignedOn, array<string, int> $values, ?string $note, User $actor): array<string, int>` (delta per saldo indicato, anche 0).
- `App\Services\AbsenceTypeService` — `create(array $attributes, User $actor): AbsenceType`, `update(AbsenceType $type, array $attributes, User $actor): AbsenceType`, `archive(AbsenceType $type, User $actor): AbsenceType`, `restore(AbsenceType $type, User $actor): AbsenceType`, `reorder(list<int> $ids, User $actor): void`.
- `App\Services\AbsenceTypeEnablementService` — `forUser(User $user): Collection<int, AbsenceType>` (attivi che valgono per il tipo di rapporto della persona, ordinati, con `enabled` calcolato); `sync(User $target, list<int> $typeIds, User $actor): void`.
- `UserPolicy` aggiunge `viewBalances(User $actor, User $target)` (= `mayActOn`), `adjustBalances(User $actor, User $target)` (= `mayActOn` e non sé stessi), `manageAccrual(User $actor, User $target)` (admin), `manageAbsenceTypes(User $actor, User $target)` (admin), `viewBalanceOverview(User $actor)` (responsabile o admin).
- Chiavi di errore nuove: `balances.not_applicable` (409), `balances.alignment_before_last` (422 su `aligned_on`), `balances.alignment_future` (422), `balances.alignment_empty` (422 su `values`), `absence_types.name_taken`, `absence_types.unit_required`, `absence_types.half_days_need_days`, `absence_types.balance_employees_only`, `absence_types.limit_incomplete` (422 sul campo), `absence_types.order_mismatch` (422 su `ids`), `absence_types.not_enablement` (422 su `absence_type_ids`).

**JSON** (forme che il frontend valida con zod)
- `AbsenceTypeResource`: `{id, code: string|null, name: string, custom_name: string|null, is_system: bool, allows_days, allows_half_days, allows_hours, balance: BalanceType|null, requires_approval, employment_types: string[], requires_enablement, day_count, requires_certificate, limit: {amount: number, unit, period}|null, position, archived_at: string|null}`; nella lista admin anche `enabled_users_count: number|null` (solo per i tipi con abilitazione).
- Lista tipi: `{data: AbsenceType[], meta: {counts: {active, archived}}}` (non paginata, al massimo 200).
- `GET /api/users/{id}/absence-types` e `GET /api/profile/absence-types`: `{data: [{id, name, requires_enablement, enabled: bool}]}`; il profilo restituisce solo i tipi che la persona può usare (senza abilitazione, o abilitati).
- `AccrualResource`: `{values: {vacation_minutes: number|null, rol_minutes, ex_holidays_minutes}, effective: {vacation: {minutes, source}, rol: {…}, ex_holidays: {…}}}`; per l'azienda `values` sono numeri e `source` è sempre `company`.
- `BalanceSummaryResource` (`GET /api/users/{id}/balances?year=` e `GET /api/profile/balances?year=`): `{applicable: bool, year, weekly_minutes, location_weekly_minutes, average_day_minutes, last_aligned_on: string|null, balances: [{balance, label, current_minutes, summary: {opening, accrued, used, corrections, closing}, annual: {minutes, source}, monthly_quota_minutes}], can: {adjust: bool, manage_accrual: bool}}` (nel profilo `can` è tutto `false`).
- `GET /api/users/{id}/balances/at?date=`: `{data: {date, balances: {vacation: number, rol, ex_holidays}, last_alignment: {vacation: string|null, rol, ex_holidays}}}`.
- `BalanceMovementResource`: `{id, balance, kind, minutes, effective_on, period: string|null, target_minutes: number|null, note: string|null, actor_name: string|null, created_at}`; `actor_name` sempre `null` nel profilo. La descrizione la compone il frontend.
- `BalanceOverviewResource` (righe di `GET /api/balances`): `{user: {id, name, role, role_label, location: {id, name}}, weekly_minutes, location_weekly_minutes, average_day_minutes, balances: {vacation: {current_minutes, annual_minutes}, rol: {…}, ex_holidays: {…}}, last_aligned_on: string|null, can: {adjust: bool}}`; `annual_minutes` è il valore annuo effettivo già proporzionato all'orario. Meta di paginazione come Utenti.
- `POST /api/users/{id}/balance-alignments` risponde `{data: {aligned_on, deltas: {vacation?: number, rol?: number, ex_holidays?: number}}}`.
- `ManagedUserResource.can` aggiunge `view_balances`, `adjust_balances`, `manage_absence_types`.

**React**
- `lib/queryKeys.ts` aggiunge `balancesQueryKey: readonly ['balances']` (fuori dall'area admin: anche il dipendente lo usa; il logout lo cancella con `clearSessionData`) e `absenceTypesQueryKey: readonly ['admin', 'absence-types']`.
- `features/balances/hoursFormat.ts`: `formatHours(minutes: number, locale: string): string` (`5250` → `"87,5"` in it, `"87.5"` in en; al massimo 2 decimali, niente zeri finali; negativo con il segno `−`), `parseHours(text: string): number | null` (minuti arrotondati; accetta virgola o punto, segno `-` o `−`, spazi; `null` se non numerico), `formatDays(minutes: number, averageDayMinutes: number, locale: string): string | null` (1 decimale; `null` se `averageDayMinutes` è 0).
- `features/balances/api.ts` esporta: `balanceTypeSchema`, `balanceSummarySchema`, `balanceMovementSchema`, `balanceOverviewRowSchema`, `accrualSchema`; `useBalanceOverview(params)`, `useUserBalances(userId, year)`, `useUserBalanceMovements(userId, filters)`, `useProfileBalances(year)`, `useProfileBalanceMovements(filters)`, `useBalancesAt(userId, date)`, `useAdjustBalance(userId)`, `useAlignBalances(userId)`, `useCompanyAccrual()`, `useUpdateCompanyAccrual()`, `useLocationAccrual(locationId)`, `useUpdateLocationAccrual(locationId)`, `useUserAccrual(userId)`, `useUpdateUserAccrual(userId)`. `filters = {balance?: BalanceType; year: number}`; i movimenti sono infinite query a 20.
- `features/absenceTypes/api.ts` esporta: `absenceTypeSchema`, `useAbsenceTypes(status)`, `useCreateAbsenceType()`, `useUpdateAbsenceType()`, `useArchiveAbsenceType()`, `useRestoreAbsenceType()`, `useReorderAbsenceTypes()`, `useUserAbsenceTypes(userId)`, `useUpdateUserEnablements(userId)`, `useProfileAbsenceTypes()`.
- `features/balances/components/UserBalancesDialog.tsx`: `interface UserBalancesDialogProps { userId: number | null; userName: string; onClose: () => void }`, usato da Utenti e dalla pagina Saldi.
- `features/balances/components/BalanceCards.tsx`: `interface BalanceCardsProps { summary: BalanceSummary }`, usato dalla scheda e da Ferie e permessi.
- `features/balances/components/BalanceMovementsList.tsx`: `interface BalanceMovementsListProps { movements: BalanceMovement[]; showActor: boolean }`.

### Precisazioni emerse scrivendo i task
Valgono come parte della spec.
- **Punti di controllo della maturazione** (spec §4.3): per il mese M e l'istante `now`, una persona matura se è dipendente attiva alla **fine del giorno 1** di M (fuso `Europe/Rome`), oppure alla fine del giorno `min(16, giorno di oggi)` (per un mese passato: il 16). Giorno di riferimento per l'orario (spec §4.2): il 1° se vale la prima condizione, altrimenti quel secondo giorno. Con un orario personale valido dal giorno di ingresso il risultato è lo stesso della spec.
- **Storico all'indietro:** `EmploymentTimeline` parte dallo stato attuale dell'utente (`status`, `employment_type`) e annulla gli eventi successivi all'istante richiesto, dal più recente: `employment_type_changed` → torna a `old_value`; `activated` → invitato; `disabled` → attivo; `enabled` → disattivato. Prima di `users.created_at` la persona non esiste (non matura). Così funziona anche per gli utenti `imported` e per quelli creati dalle factory senza storico.
- **Niente maturazione prima di un allineamento:** la regola del §4.3 per `--month` vale per ogni maturazione. Un saldo con un allineamento datato uguale o dopo il 1° di M non matura M.
- **Responsabile sui saldi di un admin della sua sede:** 403 (la persona è nello scope, la policy la rifiuta), come lo storico di fase 1. La spec §8.1 dice 404: vale il comportamento di fase 1. Fuori sede: 404.
- **Rotte in più rispetto alla spec §6.2:**
  - `GET /api/users/{user}/balances/at?date=` per l'anteprima di "Allinea alla busta paga" (il valore nell'app a quella data);
  - `GET /api/profile/absence-types` per l'elenco dei tipi in Ferie e permessi.
- **Descrizione dei movimenti:** la compone il frontend da `kind`, `period`, `effective_on`, `target_minutes`, `minutes` e `note`, con il formato delle ore della lingua: "Maturazione ottobre 2026", "Allineata alla busta paga del 30/09/2026: da 82 a 74,2 h", "Rettifica: <motivo>".
- **Voce Saldi in Utenti:** compare con `can.view_balances`, `employment_type = employee` e stato diverso da invitato (nessuna query per riga). Gli ex dipendenti con movimenti si aprono dalla pagina Saldi.
- **E2E:** Playwright non può lanciare comandi artisan. La maturazione e le quote del part-time sono coperte dai test backend; l'E2E copre valori annui, allineamento, vista del dipendente, permessi del responsabile e abilitazioni (spec §8.3 ridotta di conseguenza).
- **Valori annui:** da 0 a **60000** minuti (1000 h) per saldo. Valori della rettifica e dell'allineamento: da **−600000** a **600000** minuti.

---

## Task 1: Enum, tabelle, model e dati di partenza

**Files:**
- Create: `apps/laravel/app/Enums/{BalanceType,BalanceMovementKind,AbsenceDayCount,AbsenceLimitUnit,AbsenceLimitPeriod}.php`
- Create: `apps/laravel/database/migrations/2026_10_20_100000_create_absence_types_table.php`, `apps/laravel/database/migrations/2026_10_20_100100_create_balances_tables.php`
- Create: `apps/laravel/app/Models/{AbsenceType,AccrualSetting,BalanceMovement,BalanceAlignment}.php`, `apps/laravel/database/factories/{AbsenceTypeFactory,BalanceMovementFactory}.php`
- Create: `apps/laravel/lang/{it,en}/absence_types.php` (nomi dei 16 tipi in `names.<code>`), `apps/laravel/lang/{it,en}/balances.php` (vuoto per ora, con le chiavi di errore del contratto)
- Modify: `apps/laravel/app/Models/User.php`, `apps/laravel/lang/{it,en}/enums.php` (`balance_type`, `balance_movement_kind`)
- Test: `apps/laravel/tests/Feature/Balances/BalanceModelsTest.php`, `apps/laravel/tests/Feature/Migrations/SubProject2Phase2MigrationTest.php`

**Interfaces:**
- Consumes: `User`, `Location`, `EmploymentType`, `Translate` (fase 1).
- Produces: enum e model del contratto; tabelle di spec §3.1, §3.4, §4.1, §5, §5.2; factory `AbsenceType::factory()` (tipo personalizzato senza `code`, giorni, nessun saldo, approvazione, vale per tutti) con stati `system(string $code)`, `withBalance(BalanceType)`, `requiringEnablement()`, `archived()`; `BalanceMovement::factory()` con stati `for(User)`, `accrual(string $period, int $minutes)`, `adjustment(int $minutes)`, `alignment(string $date, int $minutes, int $target)`.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Migrations/SubProject2Phase2MigrationTest.php` (usa `RefreshDatabase`, le migration girano davvero):
```php
public function test_seeds_the_sixteen_default_absence_types_in_order(): void
{
    $codes = AbsenceType::query()->ordered()->pluck('code')->all();
    $this->assertSame(['vacation', 'rol', 'ex_holidays', 'sickness', 'injury', 'medical_visit', 'law_104', 'bereavement',
        'marriage_leave', 'blood_donation', 'maternity_leave', 'paternity_leave', 'parental_leave', 'election_leave',
        'study_leave', 'unpaid_leave'], $codes);
}

public function test_default_types_follow_the_spec_table(): void
{
    $vacation = AbsenceType::query()->where('code', 'vacation')->sole();
    $this->assertTrue($vacation->allows_days && $vacation->allows_half_days && ! $vacation->allows_hours);
    $this->assertSame(BalanceType::Vacation, $vacation->balance);
    $this->assertSame(['employee'], $vacation->employment_types);

    $sickness = AbsenceType::query()->where('code', 'sickness')->sole();
    $this->assertFalse($sickness->requires_approval);
    $this->assertTrue($sickness->requires_certificate);
    $this->assertSame(AbsenceDayCount::Calendar, $sickness->day_count);
    $this->assertSame(['employee', 'contractor', 'intern'], $sickness->employment_types);

    $this->assertTrue(AbsenceType::query()->where('code', 'blood_donation')->sole()->requires_approval);

    $law104 = AbsenceType::query()->where('code', 'law_104')->sole();
    $this->assertTrue($law104->requires_enablement);
    $this->assertSame([3, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Month], [$law104->limit_amount, $law104->limit_unit, $law104->limit_period]);

    $marriage = AbsenceType::query()->where('code', 'marriage_leave')->sole();
    $this->assertSame([15, AbsenceLimitPeriod::Request, AbsenceDayCount::Calendar], [$marriage->limit_amount, $marriage->limit_period, $marriage->day_count]);
    $this->assertSame([3, AbsenceLimitPeriod::Year], [AbsenceType::query()->where('code', 'bereavement')->sole()->limit_amount, AbsenceType::query()->where('code', 'bereavement')->sole()->limit_period]);
}

public function test_creates_the_company_accrual_row(): void
{
    $company = AccrualSetting::company();
    $this->assertSame([9600, 0, 0], [$company->vacation_minutes, $company->rol_minutes, $company->ex_holidays_minutes]);
    $this->assertSame(1, AccrualSetting::query()->whereNull('location_id')->whereNull('user_id')->count());
}
```
Le altre righe della tabella di spec §3.2 si controllano con un data provider `defaultTypes()` (code → giorni/mezze/ore, saldo, approvazione, vale per, `day_count`, certificato, limite), una riga per tipo.

`tests/Feature/Balances/BalanceModelsTest.php`:
- `test_display_name_uses_translation_until_renamed` (con `Accept-Language` it: "Ferie"; dopo `forceFill(['name' => 'Vacanze'])` → "Vacanze");
- `test_applies_to_checks_employment_types`;
- `test_unique_accrual_period_per_user_and_balance` (seconda `accrual` stesso `user_id`/`balance`/`period` → `UniqueConstraintViolationException`; due `adjustment` con `period` null passano);
- `test_user_cascade_deletes_movements_and_settings`.

- [ ] **Step 2: `sail artisan test --compact --filter='SubProject2Phase2MigrationTest|BalanceModelsTest'`** — FAIL (classi mancanti).

- [ ] **Step 3: Enum, migration, model, factory e traduzioni**

Migration con valori letterali; `absence_types.name` con collation case-insensitive come `locations.name`; `employment_types` JSON; unico su `code`. `accrual_settings`: unico su `location_id` e su `user_id` (FK `cascadeOnDelete`); la migration inserisce la riga azienda `(9600, 0, 0)`. `balance_movements` e `balance_alignments` come spec §5 e §5.2, con gli indici indicati. `position` dei tipi di partenza da 1 a 16 nell'ordine della tabella.

- [ ] **Step 4: test verdi, gate backend** — PASS.

- [ ] **Step 5: `sail artisan migrate`** sul database di sviluppo (mai `migrate:fresh`), poi commit: `feat(saldi): tabelle, enum e tipi di assenza di partenza`.

---

## Task 2: API dei tipi di assenza

**Files:**
- Create: `apps/laravel/app/Policies/AbsenceTypePolicy.php`, `apps/laravel/app/Services/AbsenceTypeService.php`, `apps/laravel/app/Http/Controllers/Admin/AbsenceTypeController.php`, `apps/laravel/app/Http/Requests/AbsenceTypes/{ListAbsenceTypesRequest,AbsenceTypeRequest,ReorderAbsenceTypesRequest}.php`, `apps/laravel/app/Http/Resources/AbsenceTypeResource.php`
- Modify: `apps/laravel/routes/api.php`, `apps/laravel/lang/{it,en}/absence_types.php`
- Test: `apps/laravel/tests/Feature/AbsenceTypes/AbsenceTypeApiTest.php`

**Interfaces:**
- Consumes: Task 1.
- Produces: rotte di spec §3.3 (`absence-types.index|store|update|archive|restore|order`), `AbsenceTypeResource`, `AbsenceTypeService` del contratto. `PUT /api/absence-types/order` sta **prima** di `/{absenceType}`.

- [ ] **Step 1: Test che falliscono** (`AbsenceTypeApiTest`, `travelTo('2026-10-20 10:00')`):
- `test_route_matrix` (data provider su ogni rotta): ospite 401; dipendente e responsabile 403; tipo inesistente 404.
- `test_index_lists_active_types_by_position_with_counts`: `assertJsonCount(16, 'data')`, `meta.counts` = `{active: 16, archived: 0}`; `data.0.name` = "Ferie" con `it`; `data.6.enabled_users_count` = 0 per `law_104`, `null` per `vacation`.
- `test_store_appends_a_custom_type`: POST con nome "Corso sicurezza", ore, nessun saldo → 201, `position` 17, `is_system` false, `code` null.
- `test_validation_rules` (data provider, 422 sul campo): nessuna unità → `allows_days` con `absence_types.unit_required`; mezze senza giorni → `allows_half_days`; saldo con `employment_types` `['employee','intern']` → `employment_types` con `absence_types.balance_employees_only`; limite incompleto → `limit.amount`; nome già usato in maiuscolo ("FERIE", nome tradotto di un tipo di partenza) → `name` con `absence_types.name_taken`; nome di un tipo archiviato → `name`; `name` mancante per un tipo personalizzato → `name`.
- `test_system_type_can_be_renamed_and_reset`: PATCH `name: "Vacanze"` → `data.name` "Vacanze", `custom_name` "Vacanze"; PATCH `name: null` → `data.name` "Ferie", `custom_name` null; `code` nel body ignorato (resta `vacation`).
- `test_archive_and_restore`: archivia → non più in `filter[status]=active`, `meta.counts.archived` 1; ripristina.
- `test_reorder_requires_the_full_active_list`: lista completa in ordine inverso → 204 e `position` aggiornate; lista con un id in meno o un id archiviato → 422 `ids` con `absence_types.order_mismatch`.
- `test_changes_are_logged`: `Log::spy()`, `Log::shouldHaveReceived('info')->with('Absence type created', \Mockery::on(fn (array $c) => $c['actor_id'] === $admin->id && isset($c['absence_type_id'])))`.

- [ ] **Step 2: Test rossi** — FAIL.
- [ ] **Step 3: Implementazione**
- `AbsenceTypePolicy`: `viewAny`, `create`, `update` → `$actor->isAdmin()`.
- `AbsenceTypeRequest`: regole di spec §3.1; `limit` come oggetto `{amount, unit, period}` o `null`; nome unico con `Rule::unique` case-insensitive più il confronto con `displayName()` dei tipi di partenza senza nome personalizzato nella lingua della richiesta (in `after()`).
- `AbsenceTypeService`: `forceFill` di `code` mai dal body; `reorder` in transazione con `lockForUpdate` sui tipi attivi; log `Absence type created|updated|archived|restored|reordered`.
- Errori 422 dell'indice unico in corsa: stesso schema del nome della sede (fase 1).
- [ ] **Step 4: Test verdi, gate backend.**
- [ ] **Step 5: Commit** `feat(tipi-assenza): API per creare, modificare, archiviare e ordinare i tipi`.

---

## Task 3: Abilitazioni per persona

**Files:**
- Create: `apps/laravel/app/Services/AbsenceTypeEnablementService.php`, `apps/laravel/app/Http/Controllers/Admin/UserAbsenceTypeController.php`, `apps/laravel/app/Http/Controllers/Auth/ProfileAbsenceTypeController.php`, `apps/laravel/app/Http/Requests/AbsenceTypes/SyncEnablementsRequest.php`
- Modify: `apps/laravel/app/Policies/UserPolicy.php` (`manageAbsenceTypes`), `apps/laravel/app/Http/Resources/ManagedUserResource.php` (`can.manage_absence_types`), `apps/laravel/routes/api.php`
- Test: `apps/laravel/tests/Feature/AbsenceTypes/EnablementApiTest.php`

**Interfaces:**
- Consumes: Task 1–2; `Route::bind('user')` e scope `visibleTo` di fase 1.
- Produces: `GET /api/users/{user}/absence-types` e `PUT /api/users/{user}/absence-type-enablements` (`can:manageAbsenceTypes,user`), `GET /api/profile/absence-types`; `AbsenceTypeEnablementService` del contratto.

- [ ] **Step 1: Test che falliscono**
- `test_admin_lists_types_for_the_person`: per uno stagista l'elenco contiene `sickness` e `law_104` ma non `vacation` né `marriage_leave`; `law_104` con `enabled` false.
- `test_admin_enables_and_disables`: PUT `[law_104]` → `enabled` true, riga in `absence_type_user` con `actor_id`; PUT `[]` → nessuna riga.
- `test_only_enablement_types_are_accepted`: PUT con l'id di `vacation` o di un tipo archiviato → 422 `absence_type_ids.0` con `absence_types.not_enablement`.
- `test_managers_and_employees_cannot_manage_enablements`: responsabile della stessa sede 403, di un'altra sede 404, dipendente 403.
- `test_profile_lists_usable_types_only`: un dipendente non abilitato non vede `law_104`; abilitato sì; i tipi archiviati non compaiono.
- `test_managed_user_resource_exposes_manage_absence_types`: `can.manage_absence_types` true per l'admin, false per il responsabile in `GET /api/users`.
- `test_employment_type_change_keeps_enablements`.
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione** — `sync` in transazione con `lockForUpdate` sull'utente; log `Absence type enablements changed` con `before`/`after` (id).
- [ ] **Step 4: Test verdi, gate backend.**
- [ ] **Step 5: Commit** `feat(tipi-assenza): abilitazioni per persona e tipi disponibili nel profilo`.

---

## Task 4: Valori annui (azienda, sede, persona)

**Files:**
- Create: `apps/laravel/app/Support/EffectiveAccrual.php`, `apps/laravel/app/Services/AccrualSettingsService.php`, `apps/laravel/app/Policies/AccrualSettingPolicy.php`, `apps/laravel/app/Http/Controllers/Admin/{AccrualSettingController,LocationAccrualController,UserAccrualController}.php`, `apps/laravel/app/Http/Requests/Balances/{UpdateCompanyAccrualRequest,UpdateAccrualOverrideRequest}.php`, `apps/laravel/app/Http/Resources/AccrualResource.php`
- Modify: `apps/laravel/app/Policies/UserPolicy.php` (`manageAccrual`), `apps/laravel/routes/api.php`
- Test: `apps/laravel/tests/Feature/Balances/AccrualSettingsTest.php`

**Interfaces:**
- Consumes: Task 1.
- Produces: `AccrualSettingsService` e `EffectiveAccrual` del contratto; rotte `GET|PATCH /api/settings/accrual` (`can:manage,App\Models\AccrualSetting`), `GET|PUT /api/locations/{location}/accrual` (`can:update,location`), `GET|PUT /api/users/{user}/accrual` (`can:manageAccrual,user`).

- [ ] **Step 1: Test che falliscono**
- `test_effective_values_inherit_user_location_company`: azienda 9600/0/0; sede Milano `rol_minutes` 4320; persona a Milano con `vacation_minutes` 12000 → `effective` = vacation 12000 `user`, rol 4320 `location`, ex_holidays 0 `company`.
- `test_null_restores_inheritance`: PUT persona con `vacation_minutes: null` → `source` `location` o `company`.
- `test_company_values_are_required`: PATCH azienda con `vacation_minutes: null` → 422; con 60001 → 422; con -1 → 422.
- `test_override_payload_requires_all_three_keys_present` (PUT con chiave mancante → 422 `present`).
- `test_for_users_uses_constant_queries`: 3 e 30 utenti in sedi diverse → stesso numero di query (`DB::enableQueryLog`).
- `test_route_matrix`: solo admin (responsabile e dipendente 403; responsabile su persona di altra sede 404).
- `test_changes_are_logged` con `before` e `after`.
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione** — riga di sede o persona creata alla prima PUT (`firstOrNew` sotto lock); una riga con tutti e tre `null` si cancella. `forUsers` carica in una query le righe delle persone e delle loro sedi più la riga azienda.
- [ ] **Step 4: Test verdi, gate backend.**
- [ ] **Step 5: Commit** `feat(saldi): valori annui di maturazione per azienda, sede e persona`.

---

## Task 5: Ore settimanali e storico del rapporto

**Files:**
- Create: `apps/laravel/app/Services/WeeklyMinutes.php`, `apps/laravel/app/Support/EmploymentTimeline.php`
- Test: `apps/laravel/tests/Feature/Balances/WeeklyMinutesTest.php`, `apps/laravel/tests/Feature/Balances/EmploymentTimelineTest.php`

**Interfaces:**
- Consumes: `WorkScheduleService::currentForLocation`, `WorkSchedule`, `UserHistory`, `UserHistoryEvent` (fase 1).
- Produces: `WeeklyMinutes` ed `EmploymentTimeline` del contratto.

- [ ] **Step 1: Test che falliscono**

`WeeklyMinutesTest`:
- `test_location_week`: sede lun-ven 480 → 2400.
- `test_personal_schedule_wins`: orario personale lun-ven 240 valido dal 2026-10-10 → al 2026-10-09 2400, al 2026-10-10 1200.
- `test_follows_location_returns_to_location_week`.
- `test_average_day_minutes`: lun-mer 480 (3 giorni) → 480; lun-ven 240 → 240.

`EmploymentTimelineTest` (istanti UTC, giorni pensati in `Europe/Rome`):
- `test_current_state_without_events`: dipendente attivo creato il 2026-09-01 → attivo il 2026-10-01; il 2026-08-31 no (prima di `created_at`).
- `test_activation_is_undone_before_it_happened`: evento `activated` il 2026-10-10 09:00 → al 2026-10-05 non attivo, al 2026-10-10 23:59 Rome attivo.
- `test_disabled_and_enabled`: disattivato il 10, riattivato il 20 → il 15 non attivo, il 25 attivo, il 5 attivo.
- `test_employment_type_change`: `employment_type_changed` intern → employee il 2026-10-12 → al 2026-10-01 non dipendente, al 2026-10-16 sì.
- `test_imported_users_use_current_state_from_creation`.
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione** — `EmploymentTimeline` è puro (nessuna query): riceve gli eventi della persona ordinati, applica le regole della precisazione "Storico all'indietro". `WeeklyMinutes` riusa la scelta della versione valida di `WorkCalendar`/`WorkScheduleService` (personale se c'è e non `follows_location`, altrimenti sede; la versione più vecchia della sede vale anche prima della sua `valid_from`, come in fase 1).
- [ ] **Step 4: Test verdi, gate backend.**
- [ ] **Step 5: Commit** `feat(saldi): ore settimanali e stato del rapporto a una data dallo storico`.

---

## Task 6: Maturazione mensile

**Files:**
- Create: `apps/laravel/app/Services/BalanceAccrualService.php`, `apps/laravel/app/Console/Commands/AccrueBalances.php`
- Modify: `apps/laravel/routes/console.php`, `apps/laravel/tests/Feature/Maintenance/ScheduleTest.php`
- Test: `apps/laravel/tests/Feature/Balances/BalanceAccrualTest.php`

**Interfaces:**
- Consumes: Task 4 (`AccrualSettingsService::forUsers`), Task 5.
- Produces: `BalanceAccrualService` del contratto; comando `balances:accrue {--month=}` schedulato `dailyAt('00:30')->timezone('Europe/Rome')->withoutOverlapping()->onOneServer()`.

- [ ] **Step 1: Test che falliscono** (`BalanceAccrualTest`; azienda ferie 9600, ROL 4320, ex festività 1920; sede lun-ven 480)
- `test_full_time_employee_accrues_one_twelfth`: `travelTo('2026-10-01 00:30', Rome)` → movimenti `accrual` periodo `2026-10`, `effective_on` 2026-10-01: ferie 800, ROL 360, ex festività 160; `actor_id` null.
- `test_horizontal_part_time_accrues_half`: orario personale lun-ven 240 → ferie 400.
- `test_vertical_part_time`: lun-mer 480 (1440 su 2400) → ferie `round(9600 × 1440 / 2400 / 12)` = 480.
- `test_follows_location_accrues_full`.
- `test_zero_annual_value_writes_nothing`: ex festività 0 → nessun movimento per quel saldo.
- `test_rounding_half_up`: annuo 1000 → `round(83.33)` = 83; annuo 1002 → `round(83.5)` = 84.
- `test_excluded_people` (data provider): collaboratore, stagista, invitato, disattivato da prima del mese → nessun movimento.
- `test_joiner_by_the_16th_accrues`: attivato il 2026-10-12, job il 2026-10-13 → matura ottobre; con orario personale lun-ven 240 valido dal 2026-10-12 → ferie 400.
- `test_joiner_after_the_16th_waits`: attivato il 2026-10-18, job il 18, il 20 e il 31 → nulla per ottobre; job del 2026-11-01 → novembre.
- `test_leaver_keeps_the_month`: disattivato il 2026-10-05 dopo la maturazione del 1° → il movimento resta, il job del 6 non scrive nulla.
- `test_late_first_run_recovers_from_history`: nessun giro fino al 2026-10-20 → chi era attivo il 1° o il 16 matura, chi è entrato il 18 no.
- `test_idempotent_runs`: due giri lo stesso giorno e il giorno dopo → un solo movimento per saldo e periodo.
- `test_no_accrual_before_an_alignment`: allineamento ferie con data 2026-10-01 → il giro di ottobre non scrive ferie ma scrive ROL.
- `test_month_option_recovers_a_past_month`: `artisan balances:accrue --month=2026-09` il 2026-10-20 → periodo `2026-09`, `effective_on` 2026-09-01; `--month=2026-11` → errore (`FAILURE`); `--month=2026-9` → errore di formato.
- `test_location_timezone_defines_the_month`: `travelTo('2026-09-30 22:30 UTC')` (= 1/10 00:30 a Roma) → periodo `2026-10`.

`ScheduleTest::test_balances_accrue_daily`: comando `balances:accrue`, espressione `30 0 * * *`, `timezone` `Europe/Rome`, `withoutOverlapping`, `onOneServer`.

- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione**
- `accrue($month, $now)`: candidati = utenti con `created_at` ≤ fine del controllo, in blocchi da 200; per ogni blocco una query per lo storico (`timelines`), una per i valori annui (`forUsers`), una per i periodi già maturati e una per gli ultimi allineamenti per saldo. Per ogni persona con giorno di riferimento e saldo con annuo > 0: transazione, `lockForUpdate` sulla riga dell'utente, ricontrollo dell'esistenza del periodo, insert; `UniqueConstraintViolationException` → si salta con `Log::info('Balance accrual skipped', …)`.
- `eligibility()`: regola della precisazione "Punti di controllo".
- Comando: mese corrente nel fuso `Europe/Rome` senza opzione; con `--month` valida `YYYY-MM`, non futuro; stampa il numero di movimenti scritti; log `Balances accrued` con `period` e `count`.
- [ ] **Step 4: Test verdi, gate backend.**
- [ ] **Step 5: Commit** `feat(saldi): maturazione mensile automatica con recupero dallo storico`.

---

## Task 7: Saldi di una persona, rettifiche e allineamenti

**Files:**
- Create: `apps/laravel/app/Support/YearSummary.php`, `apps/laravel/app/Services/{BalanceLedger,BalanceCorrectionService}.php`, `apps/laravel/app/Http/Controllers/Admin/UserBalanceController.php`, `apps/laravel/app/Http/Controllers/Auth/ProfileBalanceController.php`, `apps/laravel/app/Http/Requests/Balances/{BalanceYearRequest,BalanceMovementsRequest,BalancesAtRequest,AdjustBalanceRequest,AlignBalancesRequest}.php`, `apps/laravel/app/Http/Resources/{BalanceSummaryResource,BalanceMovementResource}.php`
- Modify: `apps/laravel/app/Policies/UserPolicy.php` (`viewBalances`, `adjustBalances`), `apps/laravel/app/Http/Resources/ManagedUserResource.php` (`can.view_balances`, `can.adjust_balances`), `apps/laravel/routes/api.php`, `apps/laravel/lang/{it,en}/balances.php`
- Test: `apps/laravel/tests/Feature/Balances/BalanceLedgerTest.php`, `apps/laravel/tests/Feature/Balances/BalanceCorrectionApiTest.php`, `apps/laravel/tests/Feature/Balances/BalanceSummaryApiTest.php`

**Interfaces:**
- Consumes: Task 4, Task 5 (`WeeklyMinutes`), Task 6 (quota mensile: `BalanceAccrualService` espone la stessa formula come `monthlyQuota(int $annual, int $weekly, int $locationWeekly): int` pubblico e statico, da usare anche qui).
- Produces: `BalanceLedger`, `YearSummary`, `BalanceCorrectionService` del contratto; rotte:
  - `GET /api/users/{user}/balances` (`can:viewBalances,user`), `GET /api/users/{user}/balances/at`, `GET /api/users/{user}/balance-movements`;
  - `POST /api/users/{user}/balance-adjustments`, `POST /api/users/{user}/balance-alignments` (`can:adjustBalances,user`);
  - `GET /api/profile/balances`, `GET /api/profile/balance-movements`.

- [ ] **Step 1: Test che falliscono**

`BalanceLedgerTest`:
- `test_balance_at_sums_movements_up_to_the_date`.
- `test_year_summary_adds_up`: residuo 2400 (movimenti 2025), maturato 2026 8000, rettifica −300, allineamento +120 → `opening` 2400, `accrued` 8000, `used` 0, `corrections` −180, `closing` 10220 e `opening + accrued + used + corrections === closing`.
- `test_past_year_closes_at_december_31`.
- `test_current_for_uses_one_query` (5 e 50 utenti, stesso numero di query).

`BalanceCorrectionApiTest` (`travelTo('2026-10-03 10:00')`, maturazione di ottobre già scritta):
- `test_adjustment_requires_a_note`: senza `note` → 422; con `minutes: 0` → 422; con −240 e nota → 201, movimento `adjustment`, `effective_on` 2026-10-03, `actor_id` dell'admin.
- `test_alignment_writes_the_delta`: saldo al 30/09 = 4920; allinea ferie a 4452 al 2026-09-30 → `deltas.vacation` −468, movimento `alignment` con `target_minutes` 4452, riga in `balance_alignments`.
- `test_alignment_keeps_later_movements` (Review Focus 1): saldo attuale = 4452 + 800 (ottobre).
- `test_alignment_with_zero_delta_records_the_date`: nessun movimento, riga in `balance_alignments`, `deltas.vacation` 0.
- `test_alignment_rules`: data futura → 422 `aligned_on` `balances.alignment_future`; nessun valore → 422 `values` `balances.alignment_empty`; data prima dell'ultimo allineamento dello stesso saldo → 422 `aligned_on` `balances.alignment_before_last`; stessa data → accettato; prima dell'ultimo allineamento di un **altro** saldo → accettato.
- `test_negative_values_are_allowed`: allinea ex festività a −240.
- `test_permission_matrix` (data provider): admin su dipendente 201; admin su sé stesso 403; responsabile su dipendente della sua sede 201; su sé stesso 403; su un altro responsabile della sua sede 201; su un admin della sua sede 403; su persona di altra sede 404; dipendente 403; ospite 401.
- `test_not_applicable`: collaboratore senza movimenti → 409 `balances.not_applicable`; invitato → 409; collaboratore ex dipendente con movimenti → 201.
- `test_location_changed_meanwhile`: il destinatario cambia sede tra il binding e il lock (simulato aggiornando `location_id` prima della chiamata al servizio) → 409 `users.state_changed`.
- `test_corrections_are_logged`.

`BalanceSummaryApiTest`:
- `test_summary_shape`: `applicable` true, `weekly_minutes` 2400, `average_day_minutes` 480, per ferie `annual.minutes` 9600 `annual.source` `company`, `monthly_quota_minutes` 800, `can.adjust` secondo la policy, `can.manage_accrual` true solo per l'admin.
- `test_year_parameter`: `year=2025` restituisce il riepilogo chiuso al 31/12/2025; `year=2027` (futuro) → 422; `year=1999` → 422.
- `test_balances_at`: `date=2026-09-30` → saldi a quella data e `last_alignment` per saldo.
- `test_movements_are_paginated_and_filtered`: 25 movimenti → 20 + pagina 2; `balance=rol` e `year=2026` filtrano; ordine `effective_on` desc, poi `id` desc; `actor_name` valorizzato.
- `test_profile_hides_the_actor`: `GET /api/profile/balance-movements` → `actor_name` null; `GET /api/profile/balances` → `can` tutto false.
- `test_profile_of_an_intern`: `applicable` false e `balances` con zeri.
- `test_managed_user_resource_permissions`: `can.view_balances` e `can.adjust_balances` in `GET /api/users`.

- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione**
- "Oggi" e l'anno corrente nel fuso della sede della persona (`WorkScheduleService::today`).
- `BalanceCorrectionService`: transazione, `lockForUpdate` sull'utente; ricontrolla sotto lock `applies()` e che il responsabile sia ancora nella stessa sede del destinatario (altrimenti `users.state_changed`, come `UserManagementService`); per l'allineamento calcola `balanceAt` dentro il lock; scrive `balance_alignments` sempre e un movimento per ogni delta ≠ 0; log `Balance adjusted` / `Balances aligned` con `user_id`, `actor_id`, saldi e delta.
- `AlignBalancesRequest`: `aligned_on` `date_format:Y-m-d`, `after_or_equal:2000-01-01`; il controllo "non futura" e "non prima dell'ultimo allineamento" stanno nel servizio (servono il fuso e il lock) e lanciano `ValidationException` sul campo `aligned_on`.
- [ ] **Step 4: Test verdi, gate backend.**
- [ ] **Step 5: Commit** `feat(saldi): saldi della persona, rettifiche e allineamento alla busta paga`.

---

## Task 8: Pagina Saldi (API)

**Files:**
- Create: `apps/laravel/app/Http/Controllers/Admin/BalanceOverviewController.php`, `apps/laravel/app/Http/Requests/Balances/ListBalancesRequest.php`, `apps/laravel/app/Http/Resources/BalanceOverviewResource.php`
- Modify: `apps/laravel/app/Policies/UserPolicy.php` (`viewBalanceOverview`), `apps/laravel/routes/api.php`, `apps/laravel/CLAUDE.md` (voce "Saldi": il saldo è la somma dei movimenti, scritture solo da `BalanceAccrualService` e `BalanceCorrectionService`, letture da `BalanceLedger`, movimenti immutabili)
- Test: `apps/laravel/tests/Feature/Balances/BalanceOverviewApiTest.php`

**Interfaces:**
- Consumes: Task 4, 5, 7.
- Produces: `GET /api/balances` (`can:viewBalanceOverview,App\Models\User`), `BalanceOverviewResource`.

- [ ] **Step 1: Test che falliscono**
- `test_manager_sees_active_people_of_his_location`: dipendenti attivi della sua sede (lui compreso); niente altre sedi, invitati, disattivati, collaboratori senza movimenti; un collaboratore ex dipendente con movimenti compare.
- `test_row_shape`: `balances.vacation.current_minutes`, `balances.vacation.annual_minutes` = 4800 per un part-time 20/40 con annuo 9600, `last_aligned_on`, `can.adjust` false sulla propria riga del responsabile.
- `test_filters`: `filter[search]` su nome ed email; `filter[negative]=1` solo chi ha almeno un saldo sotto zero; `filter[location]` dall'admin filtra, dal responsabile → 422; `sort=-name`.
- `test_pagination_25`.
- `test_constant_queries`: 5 e 25 righe, stesso numero di query.
- `test_employee_gets_403_guest_401`.
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione** — query su `User::visibleTo($actor)` con `status = active` e (`employment_type = employee` oppure `whereExists` movimenti); `filter[negative]` con `whereIn('id', …)` su una sottoquery `GROUP BY user_id, balance HAVING SUM(minutes) < 0` con `effective_on ≤ oggi`; per la pagina: `BalanceLedger::currentFor`, `lastAlignedOn`, `AccrualSettingsService::forUsers` e orari caricati in blocco (stessa scelta di versione di `WeeklyMinutes`, senza una query per riga).
- [ ] **Step 4: Test verdi, gate backend.**
- [ ] **Step 5: Commit** `feat(saldi): API della pagina Saldi con filtri e barre`.

---

## Task 9: Frontend — formati, schemi, hook e chiavi

**Files:**
- Create: `apps/react/src/features/balances/hoursFormat.ts` (+ `.test.ts`), `apps/react/src/features/balances/api.ts` (+ `api.test.tsx`), `apps/react/src/features/absenceTypes/api.ts` (+ `api.test.tsx`)
- Modify: `apps/react/src/lib/queryKeys.ts`, `apps/react/src/features/users/api.ts` (schema `can` con `view_balances`, `adjust_balances`, `manage_absence_types`), fixture MSW dei test esistenti che costruiscono `ManagedUser`
- Test: i file sopra

**Interfaces:**
- Consumes: JSON del contratto (Task 2–8).
- Produces: formati, schemi e hook del contratto React.

- [ ] **Step 1: Test che falliscono**

`hoursFormat.test.ts`:
```ts
it.each([
  [5250, 'it', '87,5'], [4465, 'it', '74,42'], [480, 'it', '8'], [-240, 'it', '−4'], [5250, 'en', '87.5'], [0, 'it', '0'],
])('formatHours(%i, %s) = %s', (minutes, locale, expected) => expect(formatHours(minutes, locale)).toBe(expected))

it.each([
  ['74,42', 4465], ['74.42', 4465], ['-4', -240], ['−4', -240], [' 8 ', 480], ['4,5', 270], ['abc', null], ['', null], ['1,2,3', null],
])('parseHours(%s) = %s', (text, expected) => expect(parseHours(text)).toBe(expected))

it('formatDays', () => {
  expect(formatDays(5250, 480, 'it')).toBe('10,9')
  expect(formatDays(2400, 240, 'it')).toBe('10')
  expect(formatDays(100, 0, 'it')).toBeNull()
})
```
`api.test.tsx` (MSW): ogni hook chiama la rotta giusta con i parametri giusti e valida la risposta; `useAlignBalances` e `useAdjustBalance` invalidano `balancesQueryKey`; `useUpdate*Accrual` invalidano `balancesQueryKey` e la query dei valori annui; le mutation dei tipi invalidano `absenceTypesQueryKey`; una risposta con un campo mancante fa fallire la query (errore zod).
- [ ] **Step 2: `npm test -- hoursFormat api`** — FAIL.
- [ ] **Step 3: Implementazione** — `formatHours` con `Intl.NumberFormat(locale, {maximumFractionDigits: 2})` e segno `−` (U+2212); `parseHours` normalizza segno e separatore e rifiuta più di un separatore.
- [ ] **Step 4: Test verdi, gate frontend.**
- [ ] **Step 5: Commit** `feat(saldi): formati delle ore, schemi e hook di saldi e tipi di assenza`.

---

## Task 10: Frontend — pagina Tipi di assenza

**Files:**
- Create: `apps/react/src/features/absenceTypes/pages/AbsenceTypesPage.tsx` (+ test), `apps/react/src/features/absenceTypes/components/{AbsenceTypesTable,AbsenceTypeActionsMenu,AbsenceTypeFormDialog,AbsenceTypeConfirmDialog}.tsx`
- Modify: `apps/react/src/routes.tsx` (`/admin/absence-types`, solo admin, `titles.absenceTypes`), `apps/react/src/components/layout/AppShell.tsx` (voce **Tipi di assenza** accanto a Sedi), `apps/react/src/locales/{it,en}.json`
- Test: `AbsenceTypesPage.test.tsx`, `AbsenceTypeFormDialog.test.tsx`

**Interfaces:**
- Consumes: Task 9 (`useAbsenceTypes`, mutation).
- Produces: pagina di spec §7.7.

- [ ] **Step 1: Test che falliscono**
- la tabella mostra nome con badge "Predefinito", "Giorni, Mezze giornate", saldo, approvazione, vale per, limite ("3 giorni al mese");
- schede Attivi/Archiviati con i conteggi;
- "Nuovo tipo": senza unità il form mostra l'errore e non invia; scegliendo un saldo "Vale per" diventa solo Dipendenti, disabilitato, con la nota;
- "Ripristina nome predefinito" solo per un tipo di partenza rinominato, invia `name: null`;
- "Sposta giù" sulla prima riga invia `PUT /api/absence-types/order` con i primi due id scambiati; "Sposta su" assente sulla prima riga e "Sposta giù" sull'ultima;
- archiviare chiede conferma;
- errori 422 del server mostrati sul campo (`name` già usato).
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione** — tabella come `LocationsTable` (lista su mobile); trascinamento con gli eventi HTML5 nativi (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) su una maniglia con `aria-hidden`, più le voci di menu per la tastiera; il riordino è ottimistico e torna indietro se il server risponde errore.
- [ ] **Step 4: Test verdi, gate frontend.**
- [ ] **Step 5: Commit** `feat(tipi-assenza): pagina per gestire e ordinare i tipi di assenza`.

---

## Task 11: Frontend — Impostazioni, card della sede e abilitazioni

**Files:**
- Create: `apps/react/src/features/settings/pages/SettingsPage.tsx` (+ test), `apps/react/src/features/balances/components/AccrualValuesForm.tsx` (+ test), `apps/react/src/features/locations/components/LocationAccrualCard.tsx`, `apps/react/src/features/absenceTypes/components/UserAbsenceTypesDialog.tsx` (+ test)
- Modify: `apps/react/src/routes.tsx` (`/admin/settings`), `AppShell.tsx` (voce **Impostazioni**), `features/locations/pages/LocationDetailPage.tsx` (card dopo l'orario standard), `features/users/actions.ts` (azione `absenceTypes` con `can.manage_absence_types`), `features/users/pages/UsersAdminPage.tsx`, `locales/{it,en}.json`

**Interfaces:**
- Consumes: Task 9.
- Produces: `AccrualValuesForm` con `interface AccrualValuesFormProps { values: AccrualValues; effective: EffectiveAccrual; inheritable: boolean; onSubmit: (values: AccrualValues) => void; pending: boolean }` (con `inheritable` ogni saldo ha "Come la sede/l'azienda (160 h)" oppure "Valore proprio"); riusato dal Task 12 per la persona.

- [ ] **Step 1: Test che falliscono**
- Impostazioni: tre campi in ore (`160`, `72`, `32`), quota mensile mostrata ("13,33 h al mese"), salva in minuti (`9600`, `4320`, `1920`), testo che spiega ereditarietà e decorrenza;
- card della sede: "Come l'azienda (160 h)" di default; passare a "Valore della sede" e salvare invia `vacation_minutes: 10800`, gli altri `null`;
- `AccrualValuesForm` rifiuta "abc" e valori oltre 1000 h;
- `UserAbsenceTypesDialog`: elenca i tipi della persona, le caselle solo per quelli con abilitazione, salva gli id selezionati;
- `availableActions` aggiunge `absenceTypes` in ogni stato quando `can.manage_absence_types` è true.
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione.**
- [ ] **Step 4: Test verdi, gate frontend.**
- [ ] **Step 5: Commit** `feat(saldi): impostazioni di maturazione, card della sede e abilitazioni in Utenti`.

---

## Task 12: Frontend — scheda saldi, Allinea e Rettifica

**Files:**
- Create: `apps/react/src/features/balances/components/{BalanceCards,BalanceMovementsList,UserBalancesDialog,AlignBalancesDialog,AdjustBalanceDialog,UserAccrualSection}.tsx`, `apps/react/src/features/balances/describeMovement.ts` (+ test)
- Modify: `features/users/actions.ts` (azione `balances`: `can.view_balances`, `employment_type === 'employee'`, stato diverso da `invited`), `features/users/pages/UsersAdminPage.tsx`, `locales/{it,en}.json`
- Test: `UserBalancesDialog.test.tsx`, `AlignBalancesDialog.test.tsx`, `AdjustBalanceDialog.test.tsx`, `describeMovement.test.ts`

**Interfaces:**
- Consumes: Task 9, Task 11 (`AccrualValuesForm`).
- Produces: `UserBalancesDialog`, `BalanceCards`, `BalanceMovementsList` del contratto React; `describeMovement(movement: BalanceMovement, t: TFunction, locale: string): string`.

- [ ] **Step 1: Test che falliscono**
- `describeMovement`: `accrual` periodo `2026-10` → "Maturazione ottobre 2026"; `alignment` del 2026-09-30, `target_minutes` 4452, `minutes` −468 → "Allineata alla busta paga del 30/09/2026: da 82 a 74,2 h"; `adjustment` con nota → "Rettifica: ore di agosto non scalate".
- `UserBalancesDialog`: tre riquadri con saldo, giorni per le ferie ("≈ 10,9 gg"), residuo, maturato, usato, correzioni; saldo negativo con la classe del colore di errore; selettore dell'anno che rilegge; movimenti con autore e ore con segno; "Carica altre"; pulsanti Allinea e Rettifica solo con `can.adjust`; sezione Valori annui modificabile solo con `can.manage_accrual`, altrimenti in sola lettura con la provenienza ("Come la sede: 160 h").
- `AlignBalancesDialog`: data di default l'ultimo giorno del mese precedente; per ogni saldo "Nell'app al <data>" da `useBalancesAt`; scrivendo `74,2` mostra "verrà registrato un movimento di −7,8 h"; campi vuoti non inviati; nessun campo compilato → errore e niente invio; 422 `aligned_on` mostrato sul campo data; a fine operazione toast con i saldi.
- `AdjustBalanceDialog`: "Aggiungi"/"Togli", motivo obbligatorio, anteprima del saldo risultante; invia minuti con il segno giusto.
- `availableActions` aggiunge `balances` per un dipendente attivo o disattivato, non per un invitato né per un collaboratore.
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione** — modale grande con lo stesso `Dialog` di fase 1 (piede sticky); mesi con `Intl.DateTimeFormat(locale, {month: 'long', year: 'numeric'})`; date `YYYY-MM-DD` con `features/locations/dateFormat.ts`.
- [ ] **Step 4: Test verdi, gate frontend.**
- [ ] **Step 5: Commit** `feat(saldi): scheda saldi della persona con allineamento e rettifica`.

---

## Task 13: Frontend — pagina Saldi

**Files:**
- Create: `apps/react/src/features/balances/pages/BalancesPage.tsx` (+ test), `apps/react/src/features/balances/components/{BalancesTable,BalanceBar,BalancesFilters}.tsx`, `apps/react/src/features/balances/useBalanceListParams.ts` (+ test)
- Modify: `routes.tsx` (`/balances`, responsabili e admin, `titles.balances`), `AppShell.tsx` (voce **Saldi** in Gestione), `locales/{it,en}.json`

**Interfaces:**
- Consumes: Task 9, Task 12 (`UserBalancesDialog`, `AlignBalancesDialog`, `AdjustBalanceDialog`).
- Produces: pagina di spec §7.2.

- [ ] **Step 1: Test che falliscono**
- righe con nome, ruolo e ore settimanali ("part-time" se meno della sede); ferie in ore e giorni; ROL ed ex festività in ore;
- `BalanceBar`: `value` = saldo ÷ annuo limitato a 0–100; variante di errore se negativo; nessuna barra con annuo 0; nome accessibile ("Ferie: 87,5 h su 160 h");
- "Ultimo allineamento" con la data o "mai" evidenziato;
- filtri nell'URL (`search`, `location` solo admin con più sedi, `negative`), come `useUserListParams`;
- click sul nome apre `UserBalancesDialog`; menu di riga con Allinea e Rettifica solo con `can.adjust`;
- titolo con la sede per il responsabile ("Saldi · Milano") quando ci sono più sedi;
- stato vuoto e stato di errore con "Riprova".
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione** — `BalanceBar` con il componente shadcn `progress` (`npx shadcn@4.21.0 add progress` se manca) e una variante per il negativo; niente `style` scritto a mano nel codice di progetto.
- [ ] **Step 4: Test verdi, gate frontend.**
- [ ] **Step 5: Commit** `feat(saldi): pagina Saldi con barre, filtri e azioni di riga`.

---

## Task 14: Frontend — Ferie e permessi

**Files:**
- Create: `apps/react/src/features/balances/pages/LeavePage.tsx` (+ test)
- Modify: `routes.tsx` (`/leave` per tutti, `titles.leave`), `AppShell.tsx` (la voce "Ferie e permessi" si attiva e perde il badge "presto"), `locales/{it,en}.json`

**Interfaces:**
- Consumes: Task 9 (`useProfileBalances`, `useProfileBalanceMovements`, `useProfileAbsenceTypes`), Task 12 (`BalanceCards`, `BalanceMovementsList`).
- Produces: pagina di spec §7.6.

- [ ] **Step 1: Test che falliscono**
- dipendente: riquadri e movimenti senza autore, nessun pulsante, nessuna sezione Valori annui, elenco dei tipi utilizzabili;
- stagista senza movimenti (`applicable: false`): testo "Non hai saldi…" e l'elenco dei tipi;
- la voce della sidebar porta a `/leave` e non è più disabilitata (aggiorna i test di `AppShell`).
- [ ] **Step 2: Test rossi.**
- [ ] **Step 3: Implementazione.**
- [ ] **Step 4: Test verdi, gate frontend.**
- [ ] **Step 5: Commit** `feat(saldi): pagina Ferie e permessi con i propri saldi`.

---

## Task 15: E2E e documentazione

**Files:**
- Create: `apps/react/e2e/balances.spec.ts`
- Modify: `apps/react/CLAUDE.md` (cosa crea e lascia `balances.spec.ts`; ore decimali da `features/balances/hoursFormat.ts`)

**Interfaces:**
- Consumes: tutto.
- Produces: E2E di spec §8.3, ridotti come da precisazione.

- [ ] **Step 1: Scenari** (stessi helper di accesso di `locations.spec.ts`, navigazione dentro la SPA, cleanup in `afterAll` anche dopo un errore)
- **Admin, valori annui:** in Impostazioni imposta ferie 160 h e ROL 72 h, li vede salvati, alla fine rimette i valori letti all'inizio.
- **Admin, abilitazioni:** da Utenti apre "Tipi di assenza" di `employee@holidays.test`, abilita Legge 104, la disabilita alla fine.
- **Responsabile, allineamento:** apre Saldi, vede Sara Colombo, "Allinea alla busta paga" con le ferie a un valore fisso (es. 80 h) alla data proposta, vede il movimento nella scheda con il suo nome.
- **Dipendente:** Sara apre Ferie e permessi e vede lo stesso saldo ferie che il responsabile vede nella pagina Saldi (80 h più l'eventuale maturazione con data successiva) e il movimento di allineamento senza autore.
- **Permessi del responsabile:** nella propria riga di Saldi non c'è Rettifica; la voce Tipi di assenza non c'è nella sidebar e `/admin/absence-types` mostra la pagina "Non hai i permessi".
- **Accessibilità:** axe sulle pagine Saldi, Tipi di assenza, Impostazioni e Ferie e permessi, senza violazioni serie.
- [ ] **Step 2: `sail artisan migrate`, poi `npm run test:e2e -- balances`** — PASS. Poi l'intera suite E2E — PASS.
- [ ] **Step 3: `CLAUDE.md`**: gli allineamenti degli E2E restano nei movimenti di Sara Colombo (immutabili, come lo storico); un'esecuzione allinea alla stessa data delle precedenti nello stesso mese.
- [ ] **Step 4: Commit** `test(e2e): saldi, allineamento, abilitazioni e permessi del responsabile`.

---

## Verifica finale (dopo i task)

- [ ] Backend: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint --test` — tutto verde.
- [ ] Frontend: `npm test`, `npm run lint`, `npm run build` — tutto verde.
- [ ] E2E completi verdi.
- [ ] `sail artisan balances:accrue` sul database di sviluppo: scrive la maturazione del mese corrente per i dipendenti attivi; un secondo giro scrive 0 movimenti.
- [ ] Controllo visivo a 1280 e 390 px di Saldi, scheda saldi, Allinea, Tipi di assenza, Impostazioni e Ferie e permessi (niente scroll orizzontale della pagina, piede dei dialog visibile).
