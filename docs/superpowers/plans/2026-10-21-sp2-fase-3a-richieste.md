# Sotto-progetto 2, fase 3 — Tappa 1: richieste e approvazioni — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ognuno chiede ferie e permessi dal proprio calendario (giorni, mezze giornate, ore); responsabili e admin approvano, rifiutano e gestiscono gli annullamenti; il saldo scala con movimenti `usage`; arrivano le email; la Home diventa la dashboard dei saldi.

**Architecture:**
- **Backend:**
  - nuovi model `LeaveRequest` e `LeaveRequestDay`;
  - un calcolatore puro dei minuti (`LeaveCalculator`, su `WorkCalendar`);
  - un servizio degli avvisi (`LeaveAvailability`);
  - un unico servizio delle transizioni (`LeaveRequestService`), che scrive i movimenti tramite `LeaveUsageWriter` sotto lock;
  - policy senza query (`LeaveRequestPolicy`), destinatari delle email in `LeaveApprovers`, email in coda dopo il commit.
- **Frontend:**
  - nuova feature `leave` (calendario mensile, richiesta con anteprima, dettaglio, Le mie richieste, Da approvare);
  - la pagina dei saldi diventa la Home;
  - contatore "Da approvare" nella sidebar.

**Tech Stack:** Laravel 13 · PHP 8.5 · Sail · Sanctum · PHPUnit · Larastan · React 19 · React Router · TanStack Query 5 · react-hook-form + zod · shadcn 4.21 (Radix) · i18next · Vitest + MSW · Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-21-sp2-fase-3-richieste-approvazioni-design.md` — questo piano copre **solo la tappa 1** (§1–§7, test §10.1). La tappa 2 (§8–§9) avrà un piano e un branch suoi. Si appoggia sulle spec di fase 1 e fase 2 nella stessa cartella.

## Global Constraints

- **Branch e commit:**
  - branch `feature/sp2-fase-3a-richieste`, già creato e attivo (spec committata);
  - commit piccoli in Conventional Commits in italiano, senza riga di attribuzione;
  - mai push, mai toccare lo stash `stash@{0}`;
  - mai toccare i file non tracciati dell'utente (`.claude/agents/dependency-*.md`, `docs/audits/`, `.impeccable/`).
- **Processi:** mai `pkill`, `killall` o `kill` su un pattern; si termina solo il PID avviato da sé. Mai fermare Docker, Sail o il server Vite dell'utente.
- **Database di sviluppo:** mai `migrate:fresh`, `db:wipe`, `db:seed` o altro che lo svuoti o lo ripopoli. Le nuove migration si applicano con `sail artisan migrate`.
- **Comandi:** Laravel da `apps/laravel` con `./vendor/bin/sail …` (qui `sail`); frontend da `apps/react`.
- **Regole di progetto** (`apps/laravel/CLAUDE.md`, `apps/react/CLAUDE.md`): valgono quelle, **non** le guide Dieffetech escluse. Prima di scrivere codice si consulta la skill `dieffetech-docs` per la guida pertinente, che cede alle regole di progetto.
- **Lingua:** identificatori in inglese, **commenti in italiano**, testi per l'utente solo da traduzioni (`lang/{it,en}`, `src/locales/{it,en}.json`).
- **Laravel:**
  - FormRequest per ogni input, output solo tramite API Resource, Policy native bool senza query;
  - colonne di stato e di appartenenza (`status`, `user_id`, `location_id`, `decided_by`, `cancelled_by`, `source`, `minutes`, `working_days`) solo nei service con `forceFill`;
  - email `ShouldQueue` inviate **dopo il commit**, nella lingua del destinatario (`Mail::to($user)->locale($user->preferredLocale())` o equivalente usato da `AdminChangeMail`);
  - log con context array, mai `catch` silenziosi;
  - migration con valori letterali;
  - `sail bin pint <file> --format agent` dopo ogni modifica PHP.
- **Saldi (fase 2):**
  - il saldo è la somma dei movimenti;
  - i movimenti sono immutabili;
  - le scritture di saldo di questa fase passano solo da `LeaveUsageWriter`, chiamato da `LeaveRequestService` sotto lock della riga dell'utente.
- **React:**
  - niente `any`, niente `as` (né `as const`), `interface` per le props, componenti arrow function;
  - niente `console.*`, niente `style={{}}` nel codice di progetto, `cn` per le classi condizionali, niente `enum` TS;
  - dati server solo con TanStack Query e zod;
  - componenti interni (Form/Body/Cell) nello stesso file del loro dialog o tabella sono ammessi (ruling R7 di fase 2).
- **Nessuna nuova dipendenza** npm o composer. Componenti shadcn mancanti solo con `npx shadcn@4.21.0 add <nome>`.
- **Valori della spec:**
  - minimo **30 minuti**, orari a multipli di **30 minuti**;
  - mezza giornata = metà dei minuti del giorno, arrotondata al minuto;
  - `working_days`: 1 per giornata, 0,5 per mezza giornata, minuti ÷ minuti del giorno per le ore (2 decimali); giorni di calendario per i tipi `day_count = calendar`;
  - intervallo massimo **366** giorni;
  - note al massimo **500** caratteri;
  - "oggi" e l'ora **nel fuso della sede** (`WorkScheduleService::today`);
  - un movimento `usage` per richiesta e per mese, `effective_on` = primo giorno di assenza di quel mese;
  - Le mie richieste paginate a **20**; Prossime assenze in Home al massimo **5**.
- **Gate a fine di ogni task:**
  - backend: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint --test`;
  - frontend: `npm test`, `npm run lint`, `npm run build`.
- **Test Laravel:**
  - il client di test manda `Accept-Language: en-us`, ma `SetLocale` dà la precedenza alla `locale` dell'utente (factory: `it`); per testi inglesi usare un utente con `locale = en`;
  - `travelTo(...)` **prima** di creare utenti e richieste quando il risultato dipende da "oggi".

## Review Focus

1. **Richiesta a cavallo di mesi e di anni** (28/12 → 05/01):
   - due movimenti `usage`, dicembre su 28/12 e gennaio su 04/01 (l'1/1 è festivo, il 2 e il 3 sono weekend);
   - il riepilogo "usato" della fase 2 li mette negli anni giusti.

   Test in Task 5 (`test_usage_is_split_by_month_and_year`).
2. **Due approvatori cliccano insieme** (o doppio clic): una sola approvazione, un solo movimento, l'altro riceve 409 `leave.state_changed`. Test in Task 5 (`test_concurrent_decision_writes_once`).
3. **Ore di oggi vicino alla mezzanotte e al fuso:** un permesso a ore per oggi alle 23:30 UTC (già domani a Roma) segue il giorno di Roma; `starts_at` già passato a Roma → 422. Test in Task 2 (`test_today_follows_location_timezone`).
4. **Intervallo fatto solo di giorni non lavorativi** (sabato, domenica, festivo):
   - 422 `leave.no_working_days`;
   - un intervallo che contiene un festivo lo esclude dai minuti ma lo lascia nei giorni a 0.

   Test in Task 2.
5. **Responsabile che approva sé stesso e destinatari delle email:**
   - la richiesta di un responsabile manda l'email agli altri responsabili della sede, non a lui;
   - una sede senza altri responsabili la manda agli admin;
   - la sua auto-approvazione non gli manda l'email di esito.

   Test in Task 7.

## Struttura dei file

**Laravel (`apps/laravel`)**

| File | Responsabilità |
|---|---|
| `database/migrations/2026_10_21_100000_create_leave_requests_table.php` | `leave_requests`, `leave_request_days`, `balance_movements.leave_request_id`, archiviazione di `sickness` e `injury` |
| `app/Enums/{LeaveRequestStatus,LeaveUnit,DayHalf,LeaveSource}.php` | Enum |
| `app/Models/{LeaveRequest,LeaveRequestDay}.php` (+ `User`, `BalanceMovement`) | Model |
| `database/factories/LeaveRequestFactory.php` | Factory |
| `app/Support/{LeaveDraft,LeaveComputation}.php` | Valori immutabili |
| `app/Services/{LeaveCalculator,LeaveAvailability,LeaveUsageWriter,LeaveRequestService,LeaveApprovers}.php` | Logica |
| `app/Policies/LeaveRequestPolicy.php` | Permessi |
| `app/Http/Controllers/Leave/{LeaveRequestController,LeaveDecisionController,ApprovalController,ProfileCalendarController}.php` | Controller |
| `app/Http/Requests/Leave/*.php` | Validazione |
| `app/Http/Resources/{LeaveRequestResource,LeavePreviewResource,ProfileCalendarResource}.php` (+ `AbsenceTypeOptionResource`, `BalanceSummaryResource`, `BalanceMovementResource`, `CurrentUserResource`) | Output |
| `app/Mail/{LeaveRequestSubmittedMail,LeaveRequestDecidedMail}.php`, `resources/views/mail/leave/*.blade.php` | Email |
| `app/Services/UserManagementService.php` | Disattivazione → richieste future annullate |
| `routes/api.php`, `lang/{it,en}/leave.php` (+ `enums.php`, `mail` se esiste) | Rotte e testi |

**React (`apps/react/src`)**

| File | Responsabilità |
|---|---|
| `features/leave/api.ts` | Schemi e hook delle richieste, del calendario e delle approvazioni |
| `features/leave/components/*.tsx` | Calendario mensile, richiesta, dettaglio, Le mie richieste, Da approvare, badge di stato |
| `features/leave/pages/LeavePage.tsx` | Ferie e permessi con le schede |
| `features/home/components/{MyBalancesSection,UpcomingLeave,PendingApprovalsCard}.tsx`, `pages/HomePage.tsx` | Home dashboard |
| `features/balances/**` | Pianificate, in attesa, disponibili; descrizione dei movimenti `usage` |
| `lib/queryKeys.ts`, `routes.tsx`, `components/layout/AppShell.tsx`, `locales/{it,en}.json` | Chiavi, rotte, contatore nel menu, testi |
| `e2e/leave.spec.ts` | E2E |

## Contratti tra i task

**PHP**
- `App\Enums\LeaveRequestStatus: string`: `Pending = 'pending'`, `Approved = 'approved'`, `Rejected = 'rejected'`, `Withdrawn = 'withdrawn'`, `CancellationRequested = 'cancellation_requested'`, `Cancelled = 'cancelled'`.
  - `label(): string` (`enums.leave_request_status.*`);
  - `isActive(): bool`, vero per `Pending`, `Approved` e `CancellationRequested`;
  - `chargesBalance(): bool`, vero per `Approved` e `CancellationRequested`.
- `App\Enums\LeaveUnit: string`: `Days = 'days'`, `HalfDay = 'half_day'`, `Hours = 'hours'`. `App\Enums\DayHalf: string`: `Morning = 'morning'`, `Afternoon = 'afternoon'`. `App\Enums\LeaveSource: string`: `Request = 'request'`, `Closure = 'closure'`.
- `App\Models\LeaveRequest`:
  - colonne di spec §3.1 con i cast agli enum; date `immutable_date`; `starts_at` e `ends_at` stringhe `H:i`; `working_days` `decimal:2`;
  - relazioni `user()`, `absenceType()`, `location()`, `days(): HasMany<LeaveRequestDay>`, `decider()`, `canceller()`, `movements(): HasMany<BalanceMovement>`;
  - scope `active()`.
- `App\Models\LeaveRequestDay`: niente timestamps, `date` immutable_date.
- `User::leaveRequests(): HasMany`. `BalanceMovement::leaveRequest(): BelongsTo`.
- `App\Support\LeaveDraft` (readonly): `User $user`, `AbsenceType $type`, `LeaveUnit $unit`, `CarbonImmutable $startsOn`, `CarbonImmutable $endsOn`, `?DayHalf $half`, `?string $startsAt`, `?string $endsAt`.
- `App\Support\LeaveComputation` (readonly): `list<array{date: string, minutes: int}> $days`, `int $minutes`, `float $workingDays`; `minutesByMonth(): array<string, array{first_day: string, minutes: int}>` (chiave `YYYY-MM`, solo mesi con minuti > 0).
- `App\Services\LeaveCalculator::compute(LeaveDraft $draft): LeaveComputation`:
  - lancia `ValidationException` per le regole che dipendono dal calendario o dall'ora;
  - le chiavi d'errore sono: `leave.past`, `leave.range_too_long`, `leave.no_working_days`, `leave.not_working_day`, `leave.single_day`, `leave.hours_step`, `leave.hours_too_long`, `leave.hours_past`.
- `App\Services\LeaveAvailability`:
  - `planned(User $user, BalanceType $balance, CarbonImmutable $today): int`, cioè usato approvato con `effective_on > today` (valore positivo);
  - `pending(User $user, BalanceType $balance, ?int $excludeRequestId = null): int`;
  - `available(User $user, BalanceType $balance, CarbonImmutable $today, ?int $excludeRequestId = null): int`;
  - `warnings(LeaveDraft $draft, LeaveComputation $computation, ?int $excludeRequestId = null): list<array{code: string, params: array<string, int|float|string>}>`, con i codici `balance_insufficient` (`after_minutes`) e `limit_exceeded` (`limit`, `unit`, `period`, `total`).
- `App\Services\LeaveUsageWriter`:
  - `charge(LeaveRequest $request, ?User $actor): void` scrive un `usage` negativo per mese;
  - `refund(LeaveRequest $request, ?User $actor, ?CarbonImmutable $fromDay = null): void` scrive `usage` positivi per mese, solo per i giorni ≥ `$fromDay` se dato;
  - entrambi solo per i tipi con `balance`.
- `App\Services\LeaveRequestService`:
  - `preview(LeaveDraft $draft): array{computation: LeaveComputation, balance: ?array{balance: string, current_minutes: int, available_minutes: int, after_minutes: int}, warnings: list<array>}`;
  - `create(LeaveDraft $draft, ?string $note): LeaveRequest`, con gli avvisi in `$request->warnings` (attributo non persistito);
  - `withdraw(LeaveRequest $r, User $actor): LeaveRequest`;
  - `requestCancellation(LeaveRequest $r, User $actor): LeaveRequest`;
  - `approve(LeaveRequest $r, User $actor): LeaveRequest`;
  - `reject(LeaveRequest $r, User $actor, ?string $note): LeaveRequest`;
  - `approveCancellation(LeaveRequest $r, User $actor): LeaveRequest`;
  - `rejectCancellation(LeaveRequest $r, User $actor): LeaveRequest`;
  - `cancel(LeaveRequest $r, User $actor): LeaveRequest`;
  - `cancelFutureFor(User $user, User $actor): void`.
- `App\Policies\LeaveRequestPolicy`, bool e senza query (servono `user` e il ruolo e la sede dell'attore già caricati):
  - `view` = proprietario o `decide`;
  - `decide` = admin su chiunque; responsabile su persone non admin con `user.location_id === actor.location_id`, sé compreso;
  - `withdraw` e `requestCancellation` = proprietario.
- `App\Services\LeaveApprovers`:
  - `notifyRecipients(LeaveRequest $r): Collection<int, User>` (spec §7.4);
  - `pendingQuery(User $actor): Builder<LeaveRequest>`, le richieste `pending` e `cancellation_requested` di `source = request` che l'attore può decidere;
  - `pendingCount(User $actor): int`.
- Mail: `LeaveRequestSubmittedMail(LeaveRequest $r, string $event)` con `event` tra `submitted`, `cancellation_requested`, `auto_approved`; `LeaveRequestDecidedMail(LeaveRequest $r, string $event)` con `event` tra `approved`, `rejected`, `cancellation_approved`, `cancellation_rejected`, `cancelled`. Entrambe `ShouldQueue`.
- Errori: 409 `leave.state_changed`, 409 `leave.already_started`, 422 `leave.overlap`, `leave.unit_not_allowed`, `leave.type_not_requestable`, più quelli del calcolatore.

**JSON**
- `LeaveRequestResource`:
  - `{id, user: {id, name}, absence_type: {id, name, balance}, unit, starts_on, ends_on, half, starts_at, ends_at, minutes, working_days, status, status_label, note, decision_note, decided_by_name, decided_at, cancellation_requested_at, cancelled_by_name, cancelled_at, source}`;
  - in più `can: {withdraw, request_cancellation, approve, reject, approve_cancellation, reject_cancellation, cancel}` (policy più stato più "prima che inizi");
  - `days: [{date, minutes}]` solo nel dettaglio;
  - `warnings` solo in creazione e in Da approvare.
- Anteprima: `{data: {days, minutes, working_days, balance: {balance, current_minutes, available_minutes, after_minutes} | null, warnings: [{code, params}]}}`.
- `GET /api/profile/calendar`: `{data: {days: [{date, minutes, reasons: [{type, label}]}], requests: LeaveRequest[]}}`.
- `GET /api/approvals`: `{data: LeaveRequest[] (con warnings), meta: {count}}`, al massimo 200, dalla più vecchia.
- `CurrentUserResource.meta.pending_approvals`: numero per responsabili e admin, `null` per gli altri.
- Riepilogo dei saldi: ogni saldo aggiunge `planned_minutes`, `pending_minutes`, `available_minutes`.
- `BalanceMovementResource`: aggiunge `leave_request: {id, absence_type_name, starts_on, ends_on, source} | null`.
- `GET /api/profile/absence-types`: aggiunge `allows_days`, `allows_half_days`, `allows_hours`, `balance`, `day_count`, `limit`.

**React**
- `lib/queryKeys.ts` aggiunge `leaveQueryKey: readonly ['leave']`. Ogni mutation delle richieste invalida `leaveQueryKey`, `balancesQueryKey` e `userQueryKey` (per il contatore).
- `features/leave/api.ts` esporta:
  - schemi: `leaveRequestSchema`, `leavePreviewSchema`, `profileCalendarSchema`;
  - letture: `useProfileCalendar(from, to)`, `useMyLeaveRequests(year)` (infinite, 20), `useLeaveRequest(id)`, `useLeavePreview(draft: LeaveDraftInput | null)` (query, abilitata solo con una bozza completa), `useApprovals(locationId?)`;
  - scritture: `useCreateLeaveRequest()`, `useLeaveAction()`, con `action` tra `'withdraw' | 'cancellation' | 'approve' | 'reject' | 'approve_cancellation' | 'reject_cancellation' | 'cancel'` e `note` facoltativa.
- `LeaveDraftInput`: `{absence_type_id, unit, starts_on, ends_on, half?, starts_at?, ends_at?, note?}`.
- `features/leave/components/LeaveStatusBadge.tsx`: `interface LeaveStatusBadgeProps { status: LeaveRequestStatus }`, con i colori della spec (giallo, verde, rosso, righe) da token tema con contrasto verificato.

### Precisazioni emerse scrivendo i task
Valgono come parte della spec.
- **Validazione in due punti.** Le regole che dipendono solo dall'input (date, unità, formato delle ore, nota) stanno nella FormRequest. Quelle che dipendono da calendario, ora o dati (giorni lavorativi, oggi, sovrapposizione, tipo richiedibile) stanno nel servizio, sotto lock dell'utente, e lanciano `ValidationException` sul campo giusto.
- **Sovrapposizione** (spec §5.1): si confrontano i giorni con minuti > 0 delle richieste attive. Due unità `half_day` con `half` diverso, o due `hours` con fasce disgiunte, possono condividere un giorno; tutto il resto no.
- **"Prima che inizi":** `starts_on > today`, oppure `starts_on == today` e unità `hours` con `starts_at > ora` (fuso della sede). Altrimenti 409 `leave.already_started`.
- **Ferie e Home:** il contenuto attuale di `LeavePage` (fase 2) diventa `features/home/components/MyBalancesSection.tsx`, usato dalla Home; `features/balances/pages/LeavePage.tsx` sparisce e `/leave` monta la nuova `features/leave/pages/LeavePage.tsx`.
- **Tappa 2 non inclusa:** nessuna colonna `deducts_vacation`, nessun ricalcolo, nessuna scheda Team. `closure_id` e `source = closure` esistono già nello schema, ma questa tappa non li scrive.

---

## Task 1: Dati — tabelle, enum, model e tipi archiviati

**Files:**
- Create: la migration, i 4 enum, `LeaveRequest`, `LeaveRequestDay`, `LeaveRequestFactory`, `lang/{it,en}/leave.php` (con le chiavi d'errore del contratto)
- Modify: `User`, `BalanceMovement`, `lang/{it,en}/enums.php`
- Test: `tests/Feature/Leave/LeaveModelsTest.php`, `tests/Feature/Migrations/SubProject2Phase3MigrationTest.php`

**Interfaces:**
- Consumes: `AbsenceType`, `BalanceMovement`, `Location`, `User` (fasi 1–2).
- Produces:
  - le tabelle di spec §3.1–§3.3, compreso `closure_id` `nullOnDelete` verso `closures`;
  - enum e model del contratto;
  - `LeaveRequest::factory()` (ferie, `days`, `pending`, giorni da domani) con gli stati `approved()`, `rejected()`, `withdrawn()`, `cancellationRequested()`, `cancelled()`, `for(User)`, `ofType(AbsenceType)`, `between(string, string)`, `hours(string $day, string $from, string $to)`, `halfDay(string $day, DayHalf)`. La factory crea anche le righe `leave_request_days` coerenti con i minuti dichiarati.

- [ ] **Step 1: Test che falliscono**
  - `SubProject2Phase3MigrationTest::test_sickness_and_injury_are_archived`: `archived_at` non null per i codici `sickness` e `injury`; gli altri 14 tipi restano attivi.
  - `LeaveModelsTest`:
    - `test_status_helpers`: `isActive()` vero solo per pending, approved e cancellation_requested; `chargesBalance()` vero solo per approved e cancellation_requested;
    - `test_days_cascade_with_request`;
    - `test_closure_delete_keeps_request` (`closure_id` diventa null);
    - `test_movement_links_request` (`leave_request_id` nullOnDelete).
- [ ] **Step 2: rossi.**
- [ ] **Step 3: implementazione.** La migration fa `UPDATE absence_types SET archived_at = NOW() WHERE code IN ('sickness','injury') AND archived_at IS NULL`.
- [ ] **Step 4: verdi + gate; `sail artisan migrate` sul DB di sviluppo.**
- [ ] **Step 5: commit** `feat(richieste): tabelle e model delle richieste di assenza`.

---

## Task 2: Calcolo dei minuti

**Files:**
- Create: `app/Support/{LeaveDraft,LeaveComputation}.php`, `app/Services/LeaveCalculator.php`
- Test: `tests/Feature/Leave/LeaveCalculatorTest.php`

**Interfaces:**
- Consumes: `WorkCalendar::forUser`, `WorkScheduleService::today(Location)`.
- Produces: `LeaveCalculator::compute` del contratto.

- [ ] **Step 1: Test che falliscono** (`travelTo('2026-10-21 09:00', 'Europe/Rome')`, sede lun-ven 480, persona a tempo pieno salvo dove indicato)
  - `test_days_sum_working_days_only`: 26/10–01/11 (lun–dom) → 5 giorni con 480, due a 0; `minutes` 2400, `working_days` 5.0.
  - `test_holiday_inside_range_is_zero`: 07/12–09/12/2026 → l'8/12 (Immacolata, martedì) resta tra i giorni con 0 minuti; `minutes` 960, `working_days` 2.0.
  - `test_part_time_day_minutes`: orario personale lun-ven 240 → una giornata 240, mezza 120.
  - `test_half_day`: un giorno, `half` mattina → minuti 240, `working_days` 0.5; su due giorni → 422 `starts_on` `leave.single_day`; su un sabato → 422 `leave.not_working_day`.
  - `test_hours`: 22/10 09:00–11:30 → 150 minuti, `working_days` 0.31 (150/480 arrotondato a 2 decimali); `09:15` → 422 `starts_at` `leave.hours_step`; 08:00–17:30 (570 > 480) → 422 `ends_at` `leave.hours_too_long`; 09:00–09:00 → 422.
  - `test_today_follows_location_timezone` (Review Focus 3): `travelTo('2026-10-21 23:30 UTC')` (a Roma è già il 22, 01:30) → `starts_on` 21/10 → 422 `leave.past`; ore il 22/10 dalle 01:00 → 422 `leave.hours_past`; dalle 09:00 → valido.
  - `test_no_working_days` (Review Focus 4): sabato–domenica → 422 `leave.no_working_days`.
  - `test_calendar_day_count_type`: congedo matrimoniale (`day_count = calendar`) 26/10–08/11 → `working_days` 14.0, minuti = somma dell'orario (10 × 480).
  - `test_range_limit`: 367 giorni → 422 `ends_on` `leave.range_too_long`.
  - `test_minutes_by_month`: 28/12/2026–05/01/2027 → chiavi `2026-12` (`first_day` 2026-12-28) e `2027-01` (`first_day` 2027-01-04, perché 1/1 è festivo, 2–3 weekend).
- [ ] **Step 2: rossi.** **Step 3:** implementazione su `WorkCalendar::forUser` (una chiamata per bozza); arrotondamento della mezza giornata con `intdiv`-half-up al minuto. **Step 4:** verdi + gate. **Step 5:** commit `feat(richieste): calcolo di giorni e minuti delle richieste`.

---

## Task 3: Disponibile e avvisi

**Files:**
- Create: `app/Services/LeaveAvailability.php`
- Modify: `app/Services/BalanceSummaryService.php`, `app/Http/Resources/BalanceSummaryResource.php`
- Test: `tests/Feature/Leave/LeaveAvailabilityTest.php`, `tests/Feature/Balances/BalanceSummaryApiTest.php` (estensione)

**Interfaces:**
- Consumes: Task 1–2, `BalanceLedger`.
- Produces: `LeaveAvailability` del contratto; riepilogo dei saldi con `planned_minutes`, `pending_minutes`, `available_minutes`.

- [ ] **Step 1: Test che falliscono**
  - `test_available_subtracts_planned_and_pending`: saldo a oggi 4800; approvata futura 960 (`usage` −960 con data futura); in attesa 480 → `planned` 960, `pending` 480, `available` 3360; con `excludeRequestId` della in attesa → 3840.
  - `test_balance_warning`: `available` 400 e richiesta di 480 → `balance_insufficient` con `after_minutes` −80; con 400 → nessun avviso.
  - `test_types_without_balance_have_no_balance_warning`.
  - `test_limit_warning_month_days`: legge 104 (3 giorni al mese), già approvati 2 giorni e in attesa 0,5 a ottobre; nuova di 1 giorno a ottobre → `limit_exceeded` (`total` 3.5, `limit` 3); la stessa a novembre → nessun avviso.
  - `test_limit_counts_hours_as_fraction`: 4 ore su un giorno da 8 contano 0,5 giorni.
  - `test_limit_per_request`: congedo matrimoniale 16 giorni di calendario con limite 15 per richiesta → avviso.
  - `test_limit_in_hours`: limite in ore per anno, con somma in minuti.
  - `BalanceSummaryApiTest::test_summary_includes_planned_pending_available`.
- [ ] **Step 2–4** (gate). **Step 5:** commit `feat(richieste): saldo disponibile e avvisi su saldo e limiti`.

---

## Task 4: Creazione, anteprima e letture per sé

**Files:**
- Create: `app/Services/LeaveRequestService.php` (`preview`, `create`), `app/Http/Controllers/Leave/{LeaveRequestController,ProfileCalendarController}.php`, `app/Http/Requests/Leave/{LeaveDraftRequest,ProfileCalendarRequest,MyLeaveRequestsRequest}.php`, `app/Http/Resources/{LeaveRequestResource,LeavePreviewResource,ProfileCalendarResource}.php`, `app/Policies/LeaveRequestPolicy.php` (`view`)
- Modify: `routes/api.php`, `app/Http/Resources/AbsenceTypeOptionResource.php` (campi del contratto), `app/Http/Controllers/Auth/ProfileAbsenceTypeController.php` se serve
- Test: `tests/Feature/Leave/CreateLeaveRequestTest.php`, `tests/Feature/Leave/ProfileCalendarTest.php`

**Interfaces:**
- Consumes: Task 1–3, `AbsenceTypeEnablementService` (tipi utilizzabili), `WorkCalendar`.
- Produces: rotte `profile.calendar`, `leave-requests.index|preview|store|show`; `LeaveRequestResource` (con `can` del contratto; le azioni di decisione arrivano nel Task 5 ma il campo esiste già, per ora tutto `false` salvo `withdraw`); `LeaveRequestService::preview|create`.

- [ ] **Step 1: Test che falliscono**
  - `test_create_days_request`: 201, `status` `pending`, `minutes` 2400, righe in `leave_request_days`, `location_id` = sede attuale, nessun movimento.
  - `test_preview_has_balance_and_warnings_and_writes_nothing`.
  - `test_unit_must_be_allowed_by_type`: ROL a giornate → 422 `unit` `leave.unit_not_allowed`.
  - `test_type_must_be_requestable`: tipo archiviato (malattia), tipo non valido per uno stagista (ferie), legge 104 non abilitata → 422 `absence_type_id` `leave.type_not_requestable`; dopo l'abilitazione 201.
  - `test_overlap`:
    - un'altra richiesta attiva sugli stessi giorni → 422 `starts_on` `leave.overlap`;
    - mattina + pomeriggio dello stesso giorno → 201;
    - ore 09–11 + 11–13 → 201;
    - una richiesta rifiutata o ritirata non conta.
  - `test_note_max_500`; `test_validation_shapes` (data provider: `ends_on < starts_on`, `half` mancante per `half_day`, orari mancanti per `hours`, formato `H:i`).
  - `test_requestable_type_without_approval_is_born_approved`: tipo personalizzato con saldo `rol`, `requires_approval = false`, valido per i dipendenti → `approved`, `decided_by` null, movimento `usage` scritto.
  - `test_my_requests`: solo le mie, filtro `year`, 20 per pagina, ordine `starts_on` decrescente.
  - `test_show`: proprietario 200 con `days`; un altro dipendente 403; responsabile di un'altra sede 404.
  - `ProfileCalendarTest`:
    - giorni con minuti e motivi (festivo, patrono, chiusura, riposo);
    - le mie richieste dell'intervallo, escluse le `withdrawn`;
    - intervallo oltre 366 giorni → 422.
  - `test_profile_absence_types_expose_units_and_limits`.
- [ ] **Step 2: rossi.**
- [ ] **Step 3:** il servizio blocca la riga dell'utente (`lockForUpdate`) prima di controllare la sovrapposizione e di inserire, come da Precisazione "Validazione in due punti". Log `Leave request created`.
- [ ] **Step 4:** verdi + gate.
- [ ] **Step 5:** commit `feat(richieste): creazione, anteprima e calendario personale`.

---

## Task 5: Transizioni, saldo e disattivazione

**Files:**
- Create: `app/Services/LeaveUsageWriter.php`, `app/Http/Controllers/Leave/LeaveDecisionController.php`, `app/Http/Requests/Leave/RejectLeaveRequest.php`
- Modify: `LeaveRequestService` (tutte le transizioni e `cancelFutureFor`), `LeaveRequestPolicy` (`decide`, `withdraw`, `requestCancellation`), `LeaveRequestResource` (`can` completo), `routes/api.php`, `app/Services/UserManagementService.php` (`disable` → `cancelFutureFor` nella stessa transazione), `app/Http/Resources/BalanceMovementResource.php` (`leave_request`)
- Test: `tests/Feature/Leave/LeaveTransitionsTest.php`, `tests/Feature/Leave/LeaveUsageTest.php`, `tests/Feature/Leave/LeavePermissionsTest.php`

**Interfaces:**
- Consumes: Task 1–4, `BalanceLedger`, `UserManagementService::disable`.
- Produces: le transizioni e le rotte `withdraw`, `cancellation`, `approve`, `reject`, `cancellation/approve`, `cancellation/reject`, `cancel` (spec §6); `LeaveUsageWriter`.

- [ ] **Step 1: Test che falliscono**
  - `LeaveTransitionsTest`, data provider su ogni coppia stato × azione:
    - le transizioni permesse portano allo stato atteso con `decided_by`, `decided_at`, `cancelled_by` e `cancelled_at` corretti;
    - tutte le altre danno 409 `leave.state_changed`.
  - `test_cancellation_only_before_start`: richiesta che inizia oggi → `cancellation` 409 `leave.already_started`; a ore oggi alle 15 con ora 10 → permesso; alle 16 → 409. Vale anche per `cancel` diretto.
  - `test_approve_after_start_is_allowed`.
  - `test_reject_note_optional_max_500`.
  - `LeaveUsageTest`:
    - `test_approve_charges_by_month`: ferie 26–30/10 → un `usage` −2400 con `effective_on` 26/10 e `leave_request_id`;
    - `test_usage_is_split_by_month_and_year` (Review Focus 1);
    - `test_cancellation_refunds`: dopo `cancellation/approve` la somma dei `usage` della richiesta è 0, con movimenti positivi per gli stessi mesi;
    - `test_rejected_cancellation_keeps_charge`;
    - `test_types_without_balance_write_nothing`;
    - `test_concurrent_decision_writes_once` (Review Focus 2): due `approve` → uno 200, uno 409, un solo movimento. Per simulare la corsa si aggiorna lo stato tra il caricamento e il lock, come nei test di fase 1.
    - `test_disable_cancels_future_requests`: alla disattivazione di una persona con una in attesa futura, una approvata futura e una approvata iniziata ieri → la prima `withdrawn`, la seconda `cancelled` con il saldo restituito, la terza invariata; nessuna email.
  - `LeavePermissionsTest`, matrice:
    - dipendente su una richiesta altrui → 403;
    - responsabile della stessa sede su un dipendente → 200;
    - responsabile su sé stesso → 200 (auto-approvazione);
    - responsabile su un altro responsabile della sede → 200;
    - responsabile su un admin della sede → 403;
    - responsabile di un'altra sede → 404;
    - admin su chiunque, sé compreso → 200;
    - ospite → 401;
    - `withdraw` e `cancellation` solo dal proprietario.
  - `test_movement_resource_exposes_leave_request`.
- [ ] **Step 2: rossi.**
- [ ] **Step 3:** ogni transizione in `DB::transaction` con `lockForUpdate` sulla richiesta e, quando scrive movimenti, prima sull'utente proprietario (ordine fisso utente → richiesta, per evitare deadlock). Log strutturato per ogni transizione.
- [ ] **Step 4:** verdi + gate.
- [ ] **Step 5:** commit `feat(richieste): approvazioni, annullamenti e saldo usato`.

---

## Task 6: Da approvare e contatore

**Files:**
- Create: `app/Services/LeaveApprovers.php` (`pendingQuery`, `pendingCount`), `app/Http/Controllers/Leave/ApprovalController.php`, `app/Http/Requests/Leave/ListApprovalsRequest.php`
- Modify: `app/Http/Resources/CurrentUserResource.php` (`meta.pending_approvals`), `routes/api.php`
- Test: `tests/Feature/Leave/ApprovalsTest.php`, `tests/Feature/Auth/CurrentUserTest.php` (estensione)

**Interfaces:**
- Consumes: Task 3 (avvisi), Task 5 (policy `decide`).
- Produces: `GET /api/approvals` (`can:viewBalanceOverview,App\Models\User`, cioè responsabile o admin); `meta.pending_approvals`.

- [ ] **Step 1: Test che falliscono**
  - `test_manager_sees_his_location_pending_and_cancellations`: le sue, quelle dei dipendenti e degli altri responsabili della sede; non gli admin, non le altre sedi, non le `approved`; ordine dalla più vecchia.
  - `test_admin_sees_all_with_location_filter`; `filter[location]` dal responsabile → 422.
  - `test_rows_include_fresh_warnings`.
  - `test_query_count_constant` (5 e 30 richieste).
  - `test_pending_approvals_meta`: 3 per il responsabile, `null` per il dipendente; una query in più al massimo.
  - `test_employee_gets_403`.
- [ ] **Step 2–4** (gate). **Step 5:** commit `feat(richieste): elenco da approvare e contatore`.

---

## Task 7: Email

**Files:**
- Create: `app/Mail/{LeaveRequestSubmittedMail,LeaveRequestDecidedMail}.php`, `resources/views/mail/leave/{submitted,decided}.blade.php`, testi in `lang/{it,en}/leave.php`
- Modify: `LeaveApprovers` (`notifyRecipients`), `LeaveRequestService` (invio dopo il commit per ogni evento della spec §7.4)
- Test: `tests/Feature/Leave/LeaveMailTest.php`

**Interfaces:**
- Consumes: Task 4–6.
- Produces: le due Mailable del contratto.

- [ ] **Step 1: Test che falliscono** (`Mail::fake()`)
  - `test_new_request_goes_to_location_managers`: due responsabili attivi della sede ricevono `submitted`; un responsabile disattivato no; la persona no.
  - `test_location_without_managers_goes_to_admins`.
  - `test_manager_request_goes_to_other_managers_not_self` (Review Focus 5); senza altri responsabili → admin.
  - `test_admin_request_goes_to_other_admins`.
  - `test_auto_approved_type_sends_notice`.
  - `test_cancellation_requested_goes_to_approvers`.
  - `test_decisions_go_to_requester`: `approved`, `rejected` (col motivo nel corpo), `cancellation_approved`, `cancellation_rejected`, `cancelled`; quando la persona ha deciso da sola, nessuna email di esito.
  - `test_withdraw_sends_nothing`.
  - `test_mail_is_queued_after_commit_and_localized`: destinatario con `locale = en` → oggetto in inglese.
  - `test_failed_transaction_sends_nothing`.
- [ ] **Step 2–4** (gate). **Step 5:** commit `feat(richieste): email a responsabili e dipendenti`.

---

## Task 8: Frontend — schemi, hook, saldi e movimenti

**Files:**
- Create: `apps/react/src/features/leave/api.ts` (+ `api.test.tsx`), `features/leave/components/LeaveStatusBadge.tsx` (+ test di contrasto)
- Modify: `lib/queryKeys.ts`, `features/auth/api.ts` (`meta.pending_approvals`), `features/balances/api.ts` (campi del riepilogo e `leave_request` nei movimenti), `features/balances/describeMovement.ts` (+ test), `features/balances/components/BalanceCards.tsx` (Pianificate, In attesa, Disponibili), `features/absenceTypes/api.ts` (campi del profilo), fixture dei test, `locales/{it,en}.json`

**Interfaces:**
- Consumes: JSON del contratto (Task 3–6).
- Produces: hook e schemi del contratto React.

- [ ] **Step 1: Test che falliscono**
  - ogni hook chiama la rotta giusta e valida la risposta;
  - le mutation invalidano `leaveQueryKey`, `balancesQueryKey` e `userQueryKey`;
  - `useLeavePreview(null)` non parte;
  - `describeMovement` per `usage`: "Ferie 26–30 ottobre 2026"; positivo → "Annullate: Ferie 26–30 ottobre 2026";
  - `BalanceCards` mostra Pianificate, In attesa e Disponibili in ore;
  - `LeaveStatusBadge`: etichette dei 6 stati e contrasto AA dei 4 colori in chiaro e scuro (come i test di contrasto esistenti).
- [ ] **Step 2–4** (gate). **Step 5:** commit `feat(richieste): hook delle richieste e saldi pianificati nel frontend`.

---

## Task 9: Frontend — Home dashboard

**Files:**
- Create: `features/home/components/{MyBalancesSection,UpcomingLeave,PendingApprovalsCard}.tsx`, `features/home/pages/HomePage.tsx` (+ test)
- Modify: `routes.tsx` (Home dalla nuova pagina), rimuovere `pages/HomePage.tsx` e `features/balances/pages/LeavePage.tsx` spostandone il contenuto (i loro test migrano), `locales`

**Interfaces:**
- Consumes: Task 8, i componenti dei saldi di fase 2 (`BalanceCards`, `BalanceYearSelect`, `BalanceMovementsSection`).
- Produces: Home di spec §7.1. `/leave` resta temporaneamente con un segnaposto fino al Task 10.

- [ ] **Step 1: Test che falliscono**
  - la Home mostra i saldi (come la vecchia `/leave`, senza autore dei movimenti), i tipi utilizzabili e le Prossime assenze (al massimo 5, future, attive, con badge e link a `/leave`);
  - stagista senza saldi: testo e tipi, come prima;
  - responsabile o admin con `pending_approvals > 0`: riquadro "N richieste da approvare" con link a `/leave?tab=approvals`; con 0 o per un dipendente nessun riquadro;
  - axe senza violazioni.
- [ ] **Step 2–4** (gate). **Step 5:** commit `feat(home): dashboard con saldi, prossime assenze e richieste da approvare`.

---

## Task 10: Frontend — Il mio calendario e la richiesta

**Files:**
- Create: `features/leave/pages/LeavePage.tsx` (schede con `?tab=` nell'URL: `calendar`, `approvals`), `features/leave/components/{LeaveMonthCalendar,LeaveRequestDialog,LeaveRequestDetailDialog,MyLeaveRequestsList}.tsx` (+ test)
- Modify: `routes.tsx` (`/leave`), `locales`

**Interfaces:**
- Consumes: Task 8.
- Produces: scheda "Il mio calendario" di spec §7.2.

- [ ] **Step 1: Test che falliscono**
  - `LeaveMonthCalendar`:
    - griglia del mese con lunedì primo;
    - giorni non lavorativi in grigio con il motivo (accessibile nel nome della cella);
    - richieste colorate per stato con `LeaveStatusBadge` e senza `withdrawn` e `cancelled`;
    - mese precedente e successivo cambiano l'intervallo richiesto;
    - selezione con clic sul primo e sull'ultimo giorno, e da tastiera (frecce, Invio, Esc annulla).
  - `LeaveRequestDialog`:
    - il tipo offre solo i tipi del profilo; le unità seguono `allows_*` del tipo;
    - mezza giornata con mattina o pomeriggio; ore con dalle–alle a passi di 30 minuti;
    - l'anteprima mostra ore, giorni, saldo dopo e avvisi (testo dell'avviso di saldo e di limite), e l'invio resta possibile con gli avvisi;
    - i 422 del server compaiono sul campo, compreso `leave.overlap`;
    - alla fine compare un toast e il calendario si aggiorna;
    - in alternativa alla selezione ci sono due campi data.
  - `LeaveRequestDetailDialog`:
    - mostra stato, chi ha deciso e quando, nota e motivo del rifiuto, giorni;
    - azioni secondo `can`: Ritira, Chiedi annullamento (con conferma).
  - `MyLeaveRequestsList`: anno, "Carica altre", tutti gli stati.
  - `LeavePage`: scheda Da approvare visibile solo con `pending_approvals !== null`; ritorno del focus dopo i dialog; axe.
- [ ] **Step 2–4** (gate). **Step 5:** commit `feat(richieste): calendario personale e richiesta con anteprima`.

---

## Task 11: Frontend — Da approvare e contatore nel menu

**Files:**
- Create: `features/leave/components/{ApprovalsList,RejectDialog}.tsx` (+ test)
- Modify: `features/leave/pages/LeavePage.tsx` (scheda `approvals`), `features/leave/components/LeaveRequestDetailDialog.tsx` (azioni dell'approvatore, compreso Annulla diretto), `components/layout/AppShell.tsx` (badge con `pending_approvals` sulla voce Ferie e permessi), `locales`

**Interfaces:**
- Consumes: Task 8, Task 10.
- Produces: scheda Da approvare di spec §7.2.

- [ ] **Step 1: Test che falliscono**
  - `ApprovalsList`:
    - righe con persona, tipo, date, ore, nota e avvisi (avviso di saldo evidenziato);
    - azioni per richiesta (Approva, Rifiuta) e per annullamento (Approva annullamento, Rifiuta annullamento);
    - filtro sede solo per l'admin con più sedi;
    - stato vuoto;
    - il 409 `leave.state_changed` mostra un messaggio e aggiorna l'elenco.
  - `RejectDialog`: motivo facoltativo, al massimo 500 caratteri.
  - Dettaglio aperto da un approvatore su una richiesta approvata non iniziata → "Annulla" con conferma.
  - `AppShell`: badge con il numero quando `pending_approvals > 0`, nome accessibile ("Ferie e permessi, 3 da approvare"); nessun badge per il dipendente.
- [ ] **Step 2–4** (gate). **Step 5:** commit `feat(richieste): approvazioni dal frontend e contatore nel menu`.

---

## Task 12: E2E e documentazione

**Files:**
- Create: `apps/react/e2e/leave.spec.ts`
- Modify: `apps/react/CLAUDE.md`, `apps/laravel/CLAUDE.md` (voce "Richieste": stati, scritture solo da `LeaveRequestService`/`LeaveUsageWriter`, un `usage` per mese), `e2e/balances.spec.ts` se il riposizionamento dei saldi in Home cambia le sue navigazioni

**Interfaces:**
- Consumes: tutto.
- Produces: E2E di spec §10.1.

- [ ] **Step 1: Scenari** (stessi helper e regole di rate limit degli E2E esistenti, navigazione nella SPA, pulizia in `afterAll` anche dopo un errore)
  - **Sara chiede ferie.** Sara (`employee@`) chiede 2 giorni di ferie in un mese futuro senza festivi, scelti dal test. Il responsabile (`manager@`) li approva da Da approvare. Sara vede la richiesta verde con il nome del responsabile e "Pianificate" sale di 16 h in Home.
  - **Annullamento.** Sara chiede l'annullamento, il responsabile lo approva e "Pianificate" torna come prima.
  - **ROL a ore del responsabile.** Il responsabile chiede un ROL di 2 ore e se lo approva da solo.
  - **Rifiuto.** Una richiesta rifiutata con motivo arriva a Sara su Mailpit.
  - **Pulizia.** Le richieste di prova restano annullate o rifiutate: sono storia del DB di sviluppo, come gli allineamenti; documentarlo.
  - **Accessibilità.** axe sulla Home, su Ferie e permessi (calendario) e su Da approvare.
- [ ] **Step 2:** `sail artisan migrate`, poi `npm run test:e2e -- leave`, poi la suite completa: tutto verde.
- [ ] **Step 3:** aggiornare i due `CLAUDE.md`.
- [ ] **Step 4:** commit `test(e2e): richieste, approvazioni e annullamenti`.

---

## Verifica finale (dopo i task)

- [ ] Backend: test, Larastan, Pint verdi.
- [ ] Frontend: test, lint, build verdi.
- [ ] E2E completi verdi.
- [ ] Controllo visivo a 1280 e 390 px di Home, calendario, richiesta, dettaglio e Da approvare: niente scroll orizzontale della pagina, piede dei dialog visibile, colori leggibili in chiaro e scuro.
