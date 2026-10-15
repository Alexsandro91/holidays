# Sotto-progetto 2, fase 1 — Sedi, calendario lavorativo, tipo di rapporto e storico: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni persona appartiene a una sede con i suoi festivi, le sue chiusure e il suo orario. Il responsabile vede e gestisce solo la sua sede, l'admin gestisce le sedi e vede tutto. Ogni persona ha un tipo di rapporto (dipendente, collaboratore esterno, stagista) e uno storico delle tappe del suo account.

**Architecture:**
- **Backend:**
  - nuovi model `Location`, `WorkSchedule`, `Closure` e `UserHistory`;
  - un calcolatore dei festivi per paese e un unico servizio `WorkCalendar` per i giorni lavorativi;
  - la visibilità per sede passa da un solo scope (`User::visibleTo`), usato anche per risolvere `{user}` nelle rotte (fuori sede: 404);
  - lo storico lo scrive un solo servizio (`UserHistoryRecorder`), dentro le transazioni che già esistono.
- **Frontend:**
  - nuove feature `locations` (lista, dettaglio, editor dell'orario, chiusure, calendario dell'anno) e `history`;
  - Utenti, Amministratori e Profilo si estendono con Sede, Tipo, Orario di lavoro e Storico;
  - con una sola sede i campi Sede non compaiono.

**Tech Stack:** Laravel 13 · PHP 8.5 · Sail · Sanctum · PHPUnit · Larastan · React 19 · React Router · TanStack Query 5 · react-hook-form + zod · shadcn 4.21 (Radix) · i18next · Vitest + MSW · Playwright + axe.

**Spec:**
- `docs/superpowers/specs/2026-10-15-sp2-fase-1-sedi-calendario-design.md` (questa fase, prevale);
- `docs/superpowers/specs/2026-10-14-utenti-tabella-permessi-design.md` (gestione utenti);
- `docs/superpowers/specs/2026-09-30-fondamenta-autenticazione-design.md` (spec principale).

## Global Constraints

- **Branch e commit:**
  - branch `feature/sp2-fase-1-sedi`, già creato e attivo;
  - commit piccoli in Conventional Commits in italiano, senza riga di attribuzione;
  - mai push, mai toccare lo stash `stash@{0}`;
  - mai toccare i file non tracciati dell'utente (`.claude/agents/dependency-*.md`, `docs/audits/`).
- **Comandi:** Laravel da `apps/laravel` con `./vendor/bin/sail …` (qui `sail`); frontend da `apps/react`.
- **Regole di progetto** (`apps/laravel/CLAUDE.md`, `apps/react/CLAUDE.md`): valgono quelle, **non** le guide Dieffetech escluse (niente antd/DF, `useApi`, SWR, Spatie QueryBuilder, classi base del template).
- **Lingua:** identificatori in inglese, **commenti in italiano**, testi per l'utente solo da traduzioni (`lang/{it,en}`, `src/locales/{it,en}.json`).
- **Laravel:**
  - `env()` solo in `config/`;
  - FormRequest per ogni input, output solo tramite API Resource, Policy native con metodi bool e senza query;
  - `role`, `status`, `location_id` ed `employment_type` impostati solo nei service con `forceFill`;
  - email **dopo il commit** (`DB::afterCommit`);
  - log con context array, mai `catch` silenziosi;
  - `Translate::text()` per i testi PHP;
  - nelle migration valori letterali, niente Enum né servizi;
  - dopo ogni modifica PHP `sail bin pint <file> --format agent`.
- **React:**
  - niente `any`, niente `as` (né `as const`), `interface` per le props, componenti arrow function, un componente per file;
  - niente `console.*`, classi condizionali con `cn` da `@/lib/utils`;
  - dati server solo con TanStack Query, risposte validate con zod;
  - `erasableSyntaxOnly`: niente `enum` TS né parameter properties;
  - React Hooks v7: niente lettura o scrittura di `ref.current` durante il render, niente `setState` sincrono nel corpo di un `useEffect`.
- **Componenti shadcn mancanti:** solo con `npx shadcn@4.21.0 add <nome>` (style già configurato). Le date si inseriscono con `<Input type="date">`: niente nuove librerie di date picker.
- **Valori della spec:**
  - orari a multipli di **15 minuti**, da **0 a 720** per giorno, almeno un giorno lavorativo;
  - `valid_from` oggi o dopo, **nel fuso della sede**;
  - chiusure di al massimo **31 giorni**, descrizione al massimo **100 caratteri**;
  - nome della sede al massimo **100 caratteri**, unico senza distinzione tra maiuscole e minuscole, archiviate comprese;
  - festivi calcolati per gli anni **2000–2100**; il **4 ottobre** è festivo **dal 2026**;
  - intervallo massimo di `WorkCalendar`: **366 giorni**;
  - `GET /api/locations/options`: al massimo **500** sedi;
  - storico: **20** tappe per pagina via API, **5** visibili nella card del profilo prima di "Mostra tutto".
- **Ruoli e tipi:**
  - il ruolo `employee` si mostra come **"Utente"** / **"User"**; nel codice e nell'API resta `employee`;
  - uno **stagista** (`intern`) può avere solo il ruolo `employee`.
- **Gate a fine di ogni task:**
  - backend: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint --test`;
  - frontend: `npm test`, `npm run lint`, `npm run build`.
- **Test Laravel:**
  - il client di test manda `Accept-Language: en-us`; i test che controllano testi italiani aggiungono `withHeader('Accept-Language', 'it')` in `setUp()`;
  - le chiamate autenticate usano `$this->actingAs($user)`;
  - il tempo si fissa con `$this->travelTo(...)` quando il risultato dipende da "oggi".
- **Database di sviluppo:** mai `migrate:fresh` o altro che lo svuoti. Le nuove migration si applicano con `sail artisan migrate`.

## Review Focus

1. **Un responsabile apre l'indirizzo di una persona di un'altra sede**, anche chiamando direttamente l'API su una rotta qualsiasi `/api/users/{user}/…`: risponde sempre `404`, mai `403` né dati. Test in Task 5, su ogni rotta con `{user}`.
2. **L'admin sposta una persona mentre un responsabile ci sta lavorando:** l'azione del responsabile riceve `409 users.state_changed`, non va a buon fine su una persona ormai fuori sede. Test in Task 5.
3. **Pasqua e festivi su anni "strani"** (Pasqua in marzo, 25 aprile che coincide con Pasquetta come nel 2011, patrono di domenica): il calendario non conta due volte e non perde giorni, e un giorno con più motivi li elenca tutti. Test in Task 4.
4. **Cambio di orario a metà di un intervallo e "oggi" vicino alla mezzanotte:** la versione giusta vale dal giorno giusto, e `valid_from = oggi` è accettato anche quando in UTC è già ieri o domani rispetto a `Europe/Rome`. Test in Task 4 e Task 7.
5. **Ogni flusso che cambia ruolo, tipo, sede o stato scrive esattamente una tappa dello storico**, e una modifica che salva gli stessi valori non ne scrive nessuna. Test in Task 3 (flussi esistenti) e Task 6 (tipo e sede).

## Struttura dei file

**Laravel (`apps/laravel`)**

| File | Responsabilità |
|---|---|
| `database/migrations/2026_10_15_100000_create_locations_table.php` | `locations`, sede principale, `work_schedules`, `closures`, `users.location_id` |
| `database/migrations/2026_10_15_100100_add_employment_type_to_users_table.php` | `users.employment_type` |
| `database/migrations/2026_10_15_100200_create_user_history_table.php` | `user_history` e righe `imported` |
| `app/Models/{Location,WorkSchedule,Closure,UserHistory}.php` (+ `User`) | Model |
| `database/factories/{Location,WorkSchedule,Closure}Factory.php` (+ `UserFactory`) | Factory |
| `app/Enums/{EmploymentType,UserHistoryEvent,NonWorkingReason}.php` (+ `AdminChange`, `UserSort`) | Enum |
| `app/Support/Holidays/{HolidayCalendar,ItalianHolidayCalendar,HolidayCalendars}.php` | Festivi nazionali per paese |
| `app/Support/{WorkDay,UserChanges}.php` | Valori immutabili |
| `app/Services/WorkCalendar.php` | Giorni lavorativi |
| `app/Services/{LocationService,WorkScheduleService,ClosureService,UserHistoryRecorder}.php` | Logica |
| `app/Services/{UserManagementService,InvitationService}.php`, `app/Console/Commands/CreateAdmin.php` | Sede, tipo e storico nei flussi esistenti |
| `app/Policies/{UserPolicy,LocationPolicy}.php` | Permessi |
| `app/Http/Controllers/Admin/{LocationController,LocationScheduleController,LocationCalendarController,ClosureController,UserScheduleController,UserHistoryController}.php` | Controller |
| `app/Http/Controllers/Auth/ProfileHistoryController.php` | Storico del profilo |
| `app/Http/Requests/Locations/*.php`, `app/Http/Requests/Users/*.php` | Validazione |
| `app/Http/Resources/{LocationResource,WorkScheduleResource,ClosureResource,UserHistoryResource}.php` (+ `ManagedUserResource`, `UserResource`, `CurrentUserResource`) | Output |
| `routes/api.php`, `app/Providers/AppServiceProvider.php` | Rotte e risoluzione di `{user}` |
| `lang/{it,en}/{enums,users,locations,holidays,history}.php` | Testi |

**React (`apps/react/src`)**

| File | Responsabilità |
|---|---|
| `features/auth/api.ts` | Utente corrente con `location`, `employment_type`, `meta.multiple_locations` |
| `features/locations/api.ts` | Hook di sedi, orari, chiusure e calendario |
| `features/locations/pages/{LocationsPage,LocationDetailPage}.tsx` | Pagine |
| `features/locations/components/*.tsx` | Tabella, modali, `WeeklyScheduleEditor`, chiusure, calendario dell'anno |
| `features/history/{api.ts,components/HistoryList.tsx,components/UserHistoryDialog.tsx}` | Storico |
| `features/users/**` | Sede, Tipo, Orario di lavoro, Storico |
| `features/administrators/**` | Sede e Tipo |
| `features/profile/components/{PersonalDetailsCard,HistoryCard}.tsx` | Profilo |
| `routes.tsx`, `components/layout/AppShell.tsx` | Rotte e voce Sedi |
| `locales/{it,en}.json` | Testi |
| `e2e/locations.spec.ts` | E2E |

## Contratti tra i task

Ogni task li rispetta alla lettera: sono i nomi e le forme che i task vicini usano.

**PHP**
- `App\Enums\EmploymentType: string` — `Employee = 'employee'`, `Contractor = 'contractor'`, `Intern = 'intern'`, con `label(): string` (`enums.employment_type.*`).
- `App\Enums\UserHistoryEvent: string` — `Imported = 'imported'`, `Invited = 'invited'`, `Activated = 'activated'`, `RoleChanged = 'role_changed'`, `EmploymentTypeChanged = 'employment_type_changed'`, `LocationChanged = 'location_changed'`, `Disabled = 'disabled'`, `Enabled = 'enabled'`.
- `App\Enums\NonWorkingReason: string` — `WeeklyRest = 'weekly_rest'`, `NationalHoliday = 'national_holiday'`, `Patron = 'patron'`, `Closure = 'closure'`.
- `App\Enums\AdminChange` aggiunge `LocationChanged = 'location_changed'` ed `EmploymentTypeChanged = 'employment_type_changed'`.
- `App\Enums\UserSort` aggiunge `Location = 'location'` e `LocationDesc = '-location'` (ordina per nome della sede).
- `App\Models\Location` — colonne di spec §2.1; `isPrimary(): bool`, `isArchived(): bool`, `static primary(): self` (la principale, `firstOrFail`), scope `active()`, relazioni `users(): HasMany`, `schedules(): HasMany<WorkSchedule>`.
- `App\Models\WorkSchedule` — colonne di spec §2.3, `valid_from` con cast `immutable_date`; `minutes(): list<int>` (7 valori, lunedì primo), `minutesOn(CarbonInterface $date): int`, `isStarted(CarbonInterface $today): bool`.
- `App\Models\Closure` — colonne di spec §2.4, date con cast `immutable_date`.
- `App\Models\UserHistory` — tabella `user_history`, solo `created_at` (`const UPDATED_AT = null`), cast `event` → `UserHistoryEvent`, `context` → `array`; relazioni `user()`, `actor()`.
- `App\Models\User` — `location(): BelongsTo`, cast `employment_type` → `EmploymentType`, scope `visibleTo(User $actor)`, `isIntern(): bool`.
- `App\Support\Holidays\HolidayCalendar` (interface) — `holidays(int $year): array<string, list<string>>` (data `Y-m-d` → chiavi di traduzione `holidays.<nome>`: due festivi nello stesso giorno, come il 25/4/2011, restano entrambi); `ItalianHolidayCalendar` la implementa; `HolidayCalendars::for(string $country): HolidayCalendar`. Anno fuori da 2000–2100: `InvalidArgumentException`.
- `App\Support\WorkDay` (readonly) — `CarbonImmutable $date`, `int $minutes`, `list<array{type: NonWorkingReason, label: string}> $reasons`; `isWorking(): bool` (minuti > 0 e nessun motivo).
- `App\Services\WorkCalendar` — `forUser(User $user, CarbonImmutable $from, CarbonImmutable $to): list<WorkDay>` e `forLocation(Location $location, CarbonImmutable $from, CarbonImmutable $to): list<WorkDay>`; oltre 366 giorni o `$to < $from`: `InvalidArgumentException`.
- `App\Services\UserHistoryRecorder` — `invited(User $user, ?User $actor)`, `activated(User $user)`, `roleChanged(User $user, Role $from, Role $to, ?User $actor)`, `employmentTypeChanged(User $user, EmploymentType $from, EmploymentType $to, ?User $actor)`, `locationChanged(User $user, int $fromLocationId, int $toLocationId, ?User $actor)`, `disabled(User $user, ?User $actor)`, `enabled(User $user, ?User $actor)`. Ogni metodo scrive una riga; con `$from === $to` non scrive nulla.
- `App\Support\UserChanges` (readonly) — `string $firstName`, `string $lastName`, `?string $email`, `?int $locationId`, `?EmploymentType $employmentType` (null = non cambia). `UserManagementService::update(User $target, UserChanges $changes, User $actor, Request $request, bool $passwordConfirmed = false): User`.
- `InvitationService::invite(string $firstName, string $lastName, string $email, Role $role, EmploymentType $employmentType, Location $location, User $inviter, Request $request): User`; `inviteAdmin` riceve gli stessi `EmploymentType $employmentType, Location $location` dopo `$email`; `UserManagementService::inviteAdmin` idem.
- Chiavi di errore nuove: `users.intern_role` (422), `locations.has_users` (409), `locations.primary` (409), `locations.archived` (409 e 422 su `location_id`), `locations.schedule_started` (409).

**JSON** (forme che il frontend valida con zod)
- `LocationResource`: `{id, name, city, country, timezone, patron_day, patron_month, is_primary, archived_at, users_count, managers_count}`; nel dettaglio anche `current_schedule` (`WorkSchedule` o `null`).
- `WorkScheduleResource`: `{id, valid_from: 'YYYY-MM-DD', follows_location: bool, minutes: number[7], is_started: bool}`.
- `ClosureResource`: `{id, location_id: number|null, location_name: string|null, starts_on, ends_on, description}`.
- `GET /api/locations/{id}/calendar?year=`: `{data: {year, schedules: WorkSchedule[], days: [{date, reasons: [{type, label}]}]}}`, solo i giorni con almeno un motivo diverso da `weekly_rest`.
- `GET /api/users/{id}/schedules`: `{data: {schedules: WorkSchedule[], location_schedule: WorkSchedule|null}}`.
- `UserHistoryResource`: `{id, event, summary: string (tradotto dal server), actor_name: string|null, occurred_at: ISO8601}`; `actor_name` sempre `null` in `GET /api/profile/history`.
- `ManagedUserResource` aggiunge `location: {id, name}`, `employment_type`, `employment_type_label` e, in `can`, `change_location`, `manage_schedule`, `view_history`.
- `UserResource`/`CurrentUserResource` aggiungono `location: {id, name}`, `employment_type`, `employment_type_label`; `CurrentUserResource` aggiunge `meta.multiple_locations: bool`.
- Lista utenti: `filter[location]`, `filter[employment_type]`, `sort=location|-location`.
- Lista sedi: `filter[status]=active|archived`, `sort=name|-name`, `meta.counts: {active, archived}`.

**React**
- `features/locations/api.ts` esporta: `locationSchema`, `workScheduleSchema`, `closureSchema`, `useLocations(params)`, `useLocationOptions()`, `useLocation(id)`, `useCreateLocation()`, `useUpdateLocation(id)`, `useMakePrimaryLocation()`, `useArchiveLocation()`, `useRestoreLocation()`, `useLocationSchedules(id)`, `useAddLocationSchedule(id)`, `useDeleteLocationSchedule(id)`, `useLocationCalendar(id, year)`, `useClosures(year, locationId)`, `useCreateClosure()`, `useUpdateClosure()`, `useDeleteClosure()`, `useUserSchedules(userId)`, `useAddUserSchedule(userId)`, `useDeleteUserSchedule(userId)`.
- `features/locations/components/WeeklyScheduleEditor.tsx`: `interface WeeklyScheduleEditorProps { value: number[]; onChange: (minutes: number[]) => void; disabled?: boolean }` (minuti, lunedì primo), usato da sedi e orario personale.
- `features/locations/scheduleFormat.ts`: `formatMinutes(minutes: number): string` (`480` → `8`, `270` → `4:30`) e `parseHours(text: string): number | null`.
- `features/history/api.ts`: `historyEntrySchema`, `useProfileHistory()`, `useUserHistory(userId)` (infinite query, 20 per pagina); `components/HistoryList.tsx` con `interface HistoryListProps { entries: HistoryEntry[]; showActor: boolean }`.
- `features/auth/api.ts`: lo schema dell'utente corrente aggiunge `location`, `employment_type`, `employment_type_label`; un hook `useMultipleLocations(): boolean` legge `meta.multiple_locations`.

### Precisazioni emerse scrivendo i task
- **Orario della sede prima del suo inizio:** la versione più vecchia vale anche per i giorni precedenti alla sua `valid_from` (la principale nasce "valida da oggi" e il calendario dell'anno copre anche i mesi passati).
- **`WorkDay::minutes`** vale `0` nei giorni non lavorativi; nel calendario dell'anno un giorno elencato riporta tutti i suoi motivi, `weekly_rest` compreso (Pasqua di domenica: `weekly_rest` e `national_holiday`).
- **Dipendente su `{user}`:** lo scope serve a chi gestisce gli utenti; il dipendente continua a ricevere il `403` della policy. Il responsabile riceve `404` fuori sede su tutte le rotte con `{user}`, `schedules` e `history` comprese.
- **`GET /api/locations/options`:** `{data: [{id, name, is_primary}]}`. Lista sedi paginata a 25 con `meta.counts`; `current_schedule` solo nel dettaglio e nelle risposte di create, update, primary, archive e restore.
- **Chiusure:** nella creazione `location_id` è `present` (`null` esplicito = tutte le sedi); `GET /api/closures` non è paginato (al massimo 500).
- **Errori 422 sugli stagisti:** campo `role` in invito e cambio ruolo, `employment_type` in invito admin e modifica, `user_id` nella promozione. Altri codici: `locations.schedule_exists`, `schedule_past`, `schedule_empty`, `patron_invalid` (sul campo `patron_day`), `characters`, `closure_order`, `closure_too_long`; `locations.archived` anche per rendere principale una sede archiviata.
- **`UserResource.location`** è `whenLoaded`: la caricano `/api/auth/user`, `PATCH /api/profile` e la risposta del codice di login.
- **Testi dello storico** neutri rispetto al genere: "Invito come Stagista, Utente, sede Milano", "Nell’app come …"; l'autore di `activated` è la persona stessa.
- **Frontend:** rotte e voce Sedi arrivano nei Task 11 e 12 (una rotta lazy verso una pagina che non esiste romperebbe la build); `useLocationOptions(enabled = true)`; "Archivia" non disponibile apre un dialog che spiega il motivo invece di essere una voce spenta; l'invito di un admin offre solo Dipendente o Collaboratore esterno.

---

## Task 1: Sedi — tabelle, model, sede principale e migrazione degli utenti

**Files:**
- Create: `apps/laravel/database/migrations/2026_10_15_100000_create_locations_table.php`
- Create: `apps/laravel/app/Models/Location.php`, `apps/laravel/app/Models/WorkSchedule.php`, `apps/laravel/app/Models/Closure.php`
- Create: `apps/laravel/database/factories/LocationFactory.php`, `apps/laravel/database/factories/WorkScheduleFactory.php`, `apps/laravel/database/factories/ClosureFactory.php`
- Modify: `apps/laravel/app/Models/User.php` (relazioni `location()` e `schedules()`), `apps/laravel/database/factories/UserFactory.php` (sede principale), `apps/laravel/app/Services/InvitationService.php` e `apps/laravel/app/Console/Commands/CreateAdmin.php` (gli invitati nascono nella principale: `users.location_id` diventa obbligatorio)
- Test: `apps/laravel/tests/Feature/Locations/LocationModelTest.php`, `apps/laravel/tests/Feature/Migrations/SubProject2MigrationTest.php`

**Interfaces:**
- Consumes: nulla (primo task).
- Produces:
  - tabelle `locations`, `work_schedules`, `closures` e la colonna obbligatoria `users.location_id` (spec §2.1–§2.4, §2.6);
  - `App\Models\Location`: `isPrimary(): bool`, `isArchived(): bool`, `hasPatron(): bool`, `static primary(): self`, scope `active()`, `users(): HasMany<User>`, `schedules(): HasMany<WorkSchedule>`; costanti `DEFAULT_COUNTRY = 'IT'`, `DEFAULT_TIMEZONE = 'Europe/Rome'`, `NAME_MAX_LENGTH = 100`;
  - `App\Models\WorkSchedule`: costanti `DAYS` (lunedì primo), `MAX_DAILY_MINUTES = 720`, `MINUTE_STEP = 15`; `minutes(): list<int>`, `minutesOn(CarbonInterface $date): int`, `isStarted(CarbonInterface $today): bool`, `location()`, `user()`;
  - `App\Models\Closure` (`location()`); nei file che usano anche `\Closure` di PHP si importa con alias `use App\Models\Closure as CompanyClosure;`;
  - `User::location(): BelongsTo<Location>`, `User::schedules(): HasMany<WorkSchedule>` (orari personali);
  - factory: `Location::factory()` (con un orario standard lunedì-venerdì 480 minuti valido dal 2000-01-01), stati `primary()`, `archived()`, `withPatron(int $day, int $month)`; `WorkSchedule::factory()` con stati `forUser(User)`, `forLocation(Location)`, `validFrom(string)`, `minutes(list<int>)`, `followsLocation()`; `Closure::factory()` con stati `forLocation(Location)`, `between(string, string)`; `User::factory()->at(Location $location)`;
  - classe di test `Tests\Feature\Migrations\SubProject2MigrationTest` con l'helper `legacyDatabaseWith(array $users)`, che i Task 2 e 3 estendono.

**Decisione di implementazione (precisa la spec §3.1):** la versione più vecchia dell'orario di una sede vale anche per i giorni prima della sua `valid_from`. La sede principale nasce con un orario "valido da oggi", ma il calendario dell'anno deve mostrare anche i mesi precedenti. Lo implementa il Task 4; qui serve solo sapere che la factory crea l'orario dal 2000-01-01.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Locations/LocationModelTest.php`:

```php
<?php

namespace Tests\Feature\Locations;

use App\Models\Closure;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocationModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_migration_creates_the_primary_location_with_a_monday_to_friday_schedule(): void
    {
        $primary = Location::primary();

        $this->assertSame('Sede principale', $primary->name);
        $this->assertSame('IT', $primary->country);
        $this->assertSame('Europe/Rome', $primary->timezone);
        $this->assertTrue($primary->isPrimary());
        $this->assertFalse($primary->isArchived());
        $this->assertFalse($primary->hasPatron());

        $schedule = $primary->schedules()->sole();
        $this->assertSame([480, 480, 480, 480, 480, 0, 0], $schedule->minutes());
        $this->assertNull($schedule->user_id);
        $this->assertFalse($schedule->follows_location);
    }

    public function test_only_one_location_can_be_primary(): void
    {
        $this->expectException(UniqueConstraintViolationException::class);

        Location::factory()->primary()->create();
    }

    public function test_users_are_created_in_the_primary_location_unless_told_otherwise(): void
    {
        $milano = Location::factory()->create(['name' => 'Milano']);

        $this->assertTrue(User::factory()->create()->location->is(Location::primary()));
        $this->assertTrue(User::factory()->at($milano)->create()->location->is($milano));
        $this->assertSame(1, $milano->users()->count());
    }

    public function test_the_factory_location_has_a_standard_schedule_and_the_patron_state(): void
    {
        $location = Location::factory()->withPatron(7, 12)->create();

        $this->assertTrue($location->hasPatron());
        $this->assertSame(7, $location->patron_day);
        $this->assertSame(12, $location->patron_month);
        $this->assertSame('2000-01-01', $location->schedules()->sole()->valid_from->toDateString());
        $this->assertTrue(Location::factory()->archived()->create()->isArchived());
        $this->assertSame(1, Location::query()->active()->where('name', $location->name)->count());
    }

    public function test_a_schedule_gives_the_minutes_of_each_weekday_and_knows_when_it_started(): void
    {
        $schedule = WorkSchedule::factory()
            ->forLocation(Location::factory()->create())
            ->minutes([480, 480, 480, 480, 240, 0, 0])
            ->validFrom('2026-10-20')
            ->create();

        // 2026-10-23 è un venerdì, 2026-10-25 una domenica
        $this->assertSame(240, $schedule->minutesOn(CarbonImmutable::parse('2026-10-23')));
        $this->assertSame(0, $schedule->minutesOn(CarbonImmutable::parse('2026-10-25')));
        $this->assertFalse($schedule->isStarted(CarbonImmutable::parse('2026-10-19')));
        $this->assertTrue($schedule->isStarted(CarbonImmutable::parse('2026-10-20')));
    }

    public function test_personal_schedules_and_closures_belong_to_their_owner(): void
    {
        $user = User::factory()->create();
        $personal = WorkSchedule::factory()->forUser($user)->create();
        $closure = Closure::factory()->forLocation(Location::primary())->between('2026-08-10', '2026-08-14')->create();
        $everywhere = Closure::factory()->create();

        $this->assertTrue($user->schedules()->sole()->is($personal));
        $this->assertNull($personal->location_id);
        $this->assertTrue($closure->location?->is(Location::primary()));
        $this->assertSame('2026-08-14', $closure->ends_on->toDateString());
        $this->assertNull($everywhere->location_id);
    }
}
```

`tests/Feature/Migrations/SubProject2MigrationTest.php` (con `DatabaseMigrations`: il test ricrea lo schema di prima della fase e poi applica le migration nuove, come in produzione. In teardown Laravel annulla l'ultimo batch e azzera lo stato, così i test con `RefreshDatabase` successivi rifanno lo schema da capo):

```php
<?php

namespace Tests\Feature\Migrations;

use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Migration del sotto-progetto 2 su un database che ha già utenti (spec §2.6): lo schema di prima della fase, gli
 * utenti di allora, poi le migration nuove.
 */
class SubProject2MigrationTest extends TestCase
{
    use DatabaseMigrations;

    /**
     * Prima migration del sotto-progetto 2: le precedenti formano lo schema "di prima".
     */
    private const FIRST_NEW_MIGRATION = '2026_10_15_100000';

    public function test_existing_users_move_to_the_new_primary_location(): void
    {
        $this->legacyDatabaseWith([
            ['first_name' => 'Giulia', 'last_name' => 'Rossi', 'email' => 'giulia@example.test', 'role' => 'admin'],
            ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara@example.test', 'role' => 'employee'],
        ]);

        $primary = Location::primary();
        $this->assertSame(['giulia@example.test', 'sara@example.test'], DB::table('users')->where('location_id', $primary->id)->orderBy('email')->pluck('email')->all());
        $this->assertFalse(collect(Schema::getColumns('users'))->firstWhere('name', 'location_id')['nullable']);
        $this->assertSame(1, Location::query()->count());
    }

    /**
     * Ricrea lo schema di prima della fase, inserisce gli utenti di allora e applica le migration nuove.
     *
     * @param  list<array{first_name: string, last_name: string, email: string, role: string}>  $users
     */
    private function legacyDatabaseWith(array $users): void
    {
        $before = collect(glob(database_path('migrations/*.php')) ?: [])
            ->filter(fn (string $path): bool => basename($path) < self::FIRST_NEW_MIGRATION)
            ->values()
            ->all();

        $this->artisan('migrate:fresh', ['--path' => $before, '--realpath' => true])->assertSuccessful();

        foreach ($users as $user) {
            DB::table('users')->insert([
                ...$user,
                'password' => null,
                'status' => 'active',
                'locale' => 'it',
                'created_at' => '2026-03-03 09:00:00',
                'updated_at' => '2026-03-03 09:00:00',
            ]);
        }

        $this->artisan('migrate')->assertSuccessful();
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Locations/LocationModelTest.php tests/Feature/Migrations/SubProject2MigrationTest.php`
Expected: FAIL. `Class "App\Models\Location" not found`.

- [ ] **Step 3: Migration**

`database/migrations/2026_10_15_100000_create_locations_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sedi, orari di lavoro e chiusure (sotto-progetto 2, fase 1, spec §2). Ogni ambiente nasce con la "Sede principale"
 * (lunedì-venerdì, 8 ore, valido da oggi) e ogni utente esistente ci viene associato. È l'unica migration che
 * inserisce dati: valori letterali, niente Enum né servizi.
 */
return new class extends Migration
{
    private const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    public function up(): void
    {
        Schema::create('locations', function (Blueprint $table): void {
            $table->id();
            // Collation case-insensitive (utf8mb4_unicode_ci): "Milano" e "milano" sono lo stesso nome
            $table->string('name', 100)->unique();
            $table->string('city', 100)->nullable();
            $table->char('country', 2);
            $table->string('timezone', 64);
            $table->unsignedTinyInteger('patron_day')->nullable();
            $table->unsignedTinyInteger('patron_month')->nullable();
            // 1 per la principale, NULL per le altre: l'indice unico ammette più NULL ma un solo 1
            $table->unsignedTinyInteger('primary_marker')->nullable()->unique();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });

        Schema::create('work_schedules', function (Blueprint $table): void {
            $table->id();
            // Esattamente uno dei due: orario standard della sede o orario personale (lo garantisce il servizio)
            $table->foreignId('location_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('valid_from');
            $table->boolean('follows_location')->default(false);

            foreach (self::DAYS as $day) {
                $table->unsignedSmallInteger("{$day}_minutes")->default(0);
            }

            $table->timestamps();
            $table->unique(['location_id', 'valid_from']);
            $table->unique(['user_id', 'valid_from']);
        });

        Schema::create('closures', function (Blueprint $table): void {
            $table->id();
            // NULL = tutte le sedi
            $table->foreignId('location_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('description', 100);
            $table->timestamps();
            $table->index(['starts_on', 'ends_on']);
        });

        $now = now();
        $primaryId = DB::table('locations')->insertGetId([
            'name' => 'Sede principale',
            'city' => null,
            'country' => 'IT',
            'timezone' => 'Europe/Rome',
            'primary_marker' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('work_schedules')->insert([
            'location_id' => $primaryId,
            'user_id' => null,
            // "Oggi" nel fuso della sede
            'valid_from' => $now->copy()->setTimezone('Europe/Rome')->toDateString(),
            'follows_location' => false,
            'monday_minutes' => 480,
            'tuesday_minutes' => 480,
            'wednesday_minutes' => 480,
            'thursday_minutes' => 480,
            'friday_minutes' => 480,
            'saturday_minutes' => 0,
            'sunday_minutes' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('location_id')->nullable()->after('role')->constrained()->restrictOnDelete();
        });

        DB::table('users')->update(['location_id' => $primaryId]);

        // Le sedi non si cancellano, si archiviano: la colonna diventa obbligatoria
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('location_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('location_id');
        });

        Schema::dropIfExists('closures');
        Schema::dropIfExists('work_schedules');
        Schema::dropIfExists('locations');
    }
};
```

- [ ] **Step 4: Model**

`app/Models/Location.php`:

```php
<?php

namespace App\Models;

use Database\Factories\LocationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Sede dell'azienda (spec §2.1): festivi del suo paese, patrono, chiusure e orario standard. Ce n'è sempre una e una
 * sola principale; le sedi non si cancellano, si archiviano.
 *
 * `primary_marker` e `archived_at` si impostano solo nei servizi con `forceFill`.
 */
#[Fillable(['name', 'city', 'patron_day', 'patron_month'])]
class Location extends Model
{
    /** @use HasFactory<LocationFactory> */
    use HasFactory;

    public const DEFAULT_COUNTRY = 'IT';

    public const DEFAULT_TIMEZONE = 'Europe/Rome';

    public const NAME_MAX_LENGTH = 100;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'patron_day' => 'integer',
            'patron_month' => 'integer',
            'primary_marker' => 'integer',
            'archived_at' => 'datetime',
        ];
    }

    /**
     * La sede principale: esiste sempre (la crea la migration, il servizio non la archivia mai).
     */
    public static function primary(): self
    {
        return self::query()->where('primary_marker', 1)->firstOrFail();
    }

    public function isPrimary(): bool
    {
        return $this->primary_marker === 1;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    public function hasPatron(): bool
    {
        return $this->patron_day !== null && $this->patron_month !== null;
    }

    /**
     * Sedi assegnabili: non archiviate.
     *
     * @param  Builder<self>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /**
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * Versioni dell'orario standard della sede.
     *
     * @return HasMany<WorkSchedule, $this>
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(WorkSchedule::class);
    }
}
```

`app/Models/WorkSchedule.php`:

```php
<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Database\Factories\WorkScheduleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una versione di orario (spec §2.3): standard di una sede (`location_id`) o personale (`user_id`), valida da
 * `valid_from` fino alla versione successiva. Una riga personale con `follows_location` riporta all'orario della sede.
 * Tutti i campi si impostano solo nei servizi con `forceFill`.
 *
 * @property CarbonImmutable $valid_from
 * @property bool $follows_location
 */
class WorkSchedule extends Model
{
    /** @use HasFactory<WorkScheduleFactory> */
    use HasFactory;

    /**
     * Giorni nell'ordine delle colonne `<giorno>_minutes`: lunedì primo, come `dayOfWeekIso`.
     */
    public const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    public const MAX_DAILY_MINUTES = 720;

    public const MINUTE_STEP = 15;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'valid_from' => 'immutable_date',
            'follows_location' => 'boolean',
            ...array_fill_keys(array_map(fn (string $day): string => "{$day}_minutes", self::DAYS), 'integer'),
        ];
    }

    /**
     * Minuti di ogni giorno della settimana, lunedì primo.
     *
     * @return list<int>
     */
    public function minutes(): array
    {
        return array_map(fn (string $day): int => (int) $this->getAttribute("{$day}_minutes"), self::DAYS);
    }

    public function minutesOn(CarbonInterface $date): int
    {
        return $this->minutes()[$date->dayOfWeekIso - 1];
    }

    /**
     * Già in vigore quel giorno: non si modifica né si cancella più (spec §2.3).
     */
    public function isStarted(CarbonInterface $today): bool
    {
        return $this->valid_from->toDateString() <= $today->toDateString();
    }

    /**
     * @return BelongsTo<Location, $this>
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

`app/Models/Closure.php`:

```php
<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ClosureFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Chiusura aziendale (spec §2.4): giorni non lavorativi per una sede o, con `location_id` NULL, per tutte.
 * Il nome coincide con `\Closure` di PHP: dove servono entrambi si importa con alias (`CompanyClosure`).
 *
 * @property CarbonImmutable $starts_on
 * @property CarbonImmutable $ends_on
 */
class Closure extends Model
{
    /** @use HasFactory<ClosureFactory> */
    use HasFactory;

    public const MAX_DAYS = 31;

    public const DESCRIPTION_MAX_LENGTH = 100;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_on' => 'immutable_date',
            'ends_on' => 'immutable_date',
        ];
    }

    /**
     * @return BelongsTo<Location, $this>
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
```

In `app/Models/User.php` aggiungi gli import `Illuminate\Database\Eloquent\Relations\BelongsTo` e `Illuminate\Database\Eloquent\Relations\HasMany` e, dopo `invitation()`:

```php
    /**
     * Sede della persona (spec §2.2): obbligatoria per ogni ruolo e stato.
     *
     * @return BelongsTo<Location, $this>
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /**
     * Versioni dell'orario personale (part-time e simili); senza, vale l'orario della sede.
     *
     * @return HasMany<WorkSchedule, $this>
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(WorkSchedule::class);
    }
```

`location_id` **non** va in `#[Fillable]`: si imposta solo nei servizi con `forceFill`.

- [ ] **Step 5: Factory**

`database/factories/LocationFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\Location;
use App\Models\WorkSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Location>
 */
class LocationFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->city().' '.fake()->unique()->numberBetween(1, 99999),
            'city' => fake()->city(),
            'country' => Location::DEFAULT_COUNTRY,
            'timezone' => Location::DEFAULT_TIMEZONE,
            'patron_day' => null,
            'patron_month' => null,
            'primary_marker' => null,
            'archived_at' => null,
        ];
    }

    /**
     * Ogni sede ha un orario standard, come quelle create dal servizio: lunedì-venerdì 8 ore, dal 2000.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (Location $location): void {
            WorkSchedule::factory()->forLocation($location)->create();
        });
    }

    public function primary(): static
    {
        return $this->state(fn (array $attributes): array => ['primary_marker' => 1]);
    }

    public function archived(): static
    {
        return $this->state(fn (array $attributes): array => ['archived_at' => now()]);
    }

    public function withPatron(int $day, int $month): static
    {
        return $this->state(fn (array $attributes): array => ['patron_day' => $day, 'patron_month' => $month]);
    }
}
```

`database/factories/WorkScheduleFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkSchedule>
 */
class WorkScheduleFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // Default sulla principale: una sede nuova dalla factory crea già il suo orario dal 2000-01-01
            // (LocationFactory::configure), un secondo orario con la stessa data violerebbe l'indice unico
            'location_id' => fn (): int => Location::primary()->id,
            'user_id' => null,
            'valid_from' => '2000-01-01',
            'follows_location' => false,
            ...$this->minuteColumns([480, 480, 480, 480, 480, 0, 0]),
        ];
    }

    public function forLocation(Location $location): static
    {
        return $this->state(fn (array $attributes): array => ['location_id' => $location->id, 'user_id' => null]);
    }

    public function forUser(User $user): static
    {
        return $this->state(fn (array $attributes): array => ['location_id' => null, 'user_id' => $user->id]);
    }

    public function validFrom(string $date): static
    {
        return $this->state(fn (array $attributes): array => ['valid_from' => $date]);
    }

    /**
     * @param  list<int>  $minutes  sette valori, lunedì primo
     */
    public function minutes(array $minutes): static
    {
        return $this->state(fn (array $attributes): array => $this->minuteColumns($minutes));
    }

    /**
     * Riga personale che riporta all'orario della sede.
     */
    public function followsLocation(): static
    {
        return $this->state(fn (array $attributes): array => [
            'follows_location' => true,
            ...$this->minuteColumns([0, 0, 0, 0, 0, 0, 0]),
        ]);
    }

    /**
     * @param  list<int>  $minutes
     * @return array<string, int>
     */
    private function minuteColumns(array $minutes): array
    {
        return array_combine(array_map(fn (string $day): string => "{$day}_minutes", WorkSchedule::DAYS), $minutes);
    }
}
```

`database/factories/ClosureFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\Closure;
use App\Models\Location;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Closure>
 */
class ClosureFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'location_id' => null,
            'starts_on' => '2026-08-10',
            'ends_on' => '2026-08-14',
            'description' => 'Chiusura estiva',
        ];
    }

    public function forLocation(Location $location): static
    {
        return $this->state(fn (array $attributes): array => ['location_id' => $location->id]);
    }

    public function between(string $startsOn, string $endsOn): static
    {
        return $this->state(fn (array $attributes): array => ['starts_on' => $startsOn, 'ends_on' => $endsOn]);
    }
}
```

In `database/factories/UserFactory.php` aggiungi `use App\Models\Location;`, la chiave `'location_id' => fn (): int => self::primaryLocationId(),` in `definition()` e:

```php
    public function at(Location $location): static
    {
        return $this->state(fn (array $attributes): array => ['location_id' => $location->id]);
    }

    /**
     * La principale la crea la migration; se un test l'ha tolta, la factory ne crea una.
     */
    private static function primaryLocationId(): int
    {
        $id = Location::query()->where('primary_marker', 1)->value('id');

        return is_int($id) ? $id : Location::factory()->primary()->create()->id;
    }
```

- [ ] **Step 6: Gli invitati nascono nella principale**

Con `users.location_id` obbligatorio, `InvitationService::createInvited()` e `CreateAdmin` devono impostarla. In questo task è sempre la principale; il Task 6 la fa scegliere all'admin.

In `app/Services/InvitationService.php`, `createInvited()`: aggiungi `use App\Models\Location;` e nel `forceFill` la riga `'location_id' => Location::primary()->id,` dopo `'role' => $role,`.

In `app/Console/Commands/CreateAdmin.php`: aggiungi `use App\Models\Location;` e nel `forceFill` del nuovo admin la riga `'location_id' => Location::primary()->id,` dopo `'role' => Role::Admin,`.

`DevUserSeeder` non cambia: gli utenti di sviluppo nascono nella principale tramite la factory. Il DB di sviluppo esistente si aggiorna con `sail artisan migrate` (mai `migrate:fresh`).

- [ ] **Step 7: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Locations/LocationModelTest.php tests/Feature/Migrations/SubProject2MigrationTest.php`
Expected: PASS.

- [ ] **Step 8: Gate**

Run: `sail artisan test --compact` (tutti i test esistenti devono passare: gli utenti delle factory hanno la principale, gli inviti la impostano), poi `sail composer analyse`, `sail bin pint app/Models database/factories database/migrations/2026_10_15_100000_create_locations_table.php app/Services/InvitationService.php app/Console/Commands/CreateAdmin.php tests/Feature/Locations tests/Feature/Migrations --format agent`, `sail bin pint --test`.
Expected: tutto verde. Poi `sail artisan migrate` sul DB di sviluppo.

- [ ] **Step 9: Commit**

```bash
git add apps/laravel/database/migrations/2026_10_15_100000_create_locations_table.php apps/laravel/app/Models apps/laravel/database/factories apps/laravel/app/Services/InvitationService.php apps/laravel/app/Console/Commands/CreateAdmin.php apps/laravel/tests/Feature/Locations apps/laravel/tests/Feature/Migrations
git commit -m "feat(sedi): tabelle di sedi, orari e chiusure con la sede principale"
```

---

## Task 2: Tipo di rapporto — colonna, enum e ruolo "Utente"

**Files:**
- Create: `apps/laravel/database/migrations/2026_10_15_100100_add_employment_type_to_users_table.php`, `apps/laravel/app/Enums/EmploymentType.php`
- Modify: `apps/laravel/app/Models/User.php` (cast, `isIntern()`), `apps/laravel/app/Enums/Role.php` (commento), `apps/laravel/database/factories/UserFactory.php` (stati), `apps/laravel/lang/{it,en}/enums.php`
- Modify (test esistenti): `apps/laravel/tests/Feature/Users/UserModelTest.php` (`test_role_labels_are_translated`), `apps/laravel/tests/Feature/Profile/UpdateProfileTest.php` (`test_the_response_is_already_in_the_new_language`)
- Test: `apps/laravel/tests/Feature/Users/EmploymentTypeTest.php`, `apps/laravel/tests/Feature/Migrations/SubProject2MigrationTest.php`

**Interfaces:**
- Consumes: `SubProject2MigrationTest::legacyDatabaseWith()` (Task 1).
- Produces:
  - `App\Enums\EmploymentType: string` con `Employee = 'employee'`, `Contractor = 'contractor'`, `Intern = 'intern'` e `label(): string` (`enums.employment_type.*`);
  - `users.employment_type` (string 20, default `employee`), cast su `User`, `User::isIntern(): bool`;
  - `UserFactory::contractor()`, `UserFactory::intern()`;
  - testo del ruolo `employee`: "Utente" / "User".
- Le regole sugli stagisti, l'API e le resource arrivano nel Task 6.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/EmploymentTypeTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmploymentTypeTest extends TestCase
{
    use RefreshDatabase;

    public function test_people_are_employees_unless_told_otherwise(): void
    {
        $this->assertSame(EmploymentType::Employee, User::factory()->create()->employment_type);
        $this->assertSame(EmploymentType::Contractor, User::factory()->contractor()->create()->employment_type);

        $intern = User::factory()->intern()->create();
        $this->assertSame(EmploymentType::Intern, $intern->employment_type);
        $this->assertTrue($intern->isIntern());
        $this->assertFalse(User::factory()->create()->isIntern());
    }

    public function test_employment_types_have_translated_labels(): void
    {
        app()->setLocale('it');
        $this->assertSame(['Dipendente', 'Collaboratore esterno', 'Stagista'], array_map(fn (EmploymentType $type): string => $type->label(), EmploymentType::cases()));

        app()->setLocale('en');
        $this->assertSame(['Employee', 'External contractor', 'Intern'], array_map(fn (EmploymentType $type): string => $type->label(), EmploymentType::cases()));
    }

    public function test_the_base_role_is_called_user_to_avoid_clashing_with_the_employment_type(): void
    {
        app()->setLocale('it');
        $this->assertSame('Utente', Role::Employee->label());

        app()->setLocale('en');
        $this->assertSame('User', Role::Employee->label());
    }
}
```

In `tests/Feature/Migrations/SubProject2MigrationTest.php` aggiungi:

```php
    public function test_existing_users_become_employees(): void
    {
        $this->legacyDatabaseWith([
            ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara@example.test', 'role' => 'manager'],
        ]);

        $this->assertSame('employee', DB::table('users')->where('email', 'sara@example.test')->value('employment_type'));
    }
```

Aggiorna i test esistenti sul testo del ruolo:
- `tests/Feature/Users/UserModelTest.php`, `test_role_labels_are_translated()`: aggiungi `$this->assertSame('Utente', Role::Employee->label());` nel blocco italiano;
- `tests/Feature/Profile/UpdateProfileTest.php`, `test_the_response_is_already_in_the_new_language()`: `'Dipendente'` diventa `'Utente'` e `'Employee'` diventa `'User'`.

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/EmploymentTypeTest.php tests/Feature/Migrations tests/Feature/Users/UserModelTest.php tests/Feature/Profile/UpdateProfileTest.php`
Expected: FAIL. `Class "App\Enums\EmploymentType" not found` e "Dipendente" al posto di "Utente".

- [ ] **Step 3: Migration, enum e model**

`database/migrations/2026_10_15_100100_add_employment_type_to_users_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tipo di rapporto (spec §7.1): dipendente, collaboratore esterno o stagista, separato dal ruolo.
 * Il default porta tutti gli utenti esistenti a `employee` (valore letterale).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('employment_type', 20)->default('employee')->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('employment_type');
        });
    }
};
```

`app/Enums/EmploymentType.php`:

```php
<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Tipo di rapporto con l'azienda (spec §7): non decide cosa la persona può fare nell'app (quello è il ruolo), ma
 * quali assenze e saldi valgono (fase 2). Uno stagista ha solo il ruolo base.
 */
enum EmploymentType: string
{
    case Employee = 'employee';
    case Contractor = 'contractor';
    case Intern = 'intern';

    public function label(): string
    {
        return Translate::text('enums.employment_type.'.$this->value);
    }
}
```

`app/Enums/Role.php`, sopra `case Employee`:

```php
    /**
     * Ruolo base, mostrato come "Utente" (spec §7.2): da non confondere con `EmploymentType::Employee`, il tipo di
     * rapporto "Dipendente". Il valore resta `employee` per non cambiare API, link ed E2E.
     */
    case Employee = 'employee';
```

`app/Models/User.php`: aggiungi `use App\Enums\EmploymentType;`, nei `casts()` `'employment_type' => EmploymentType::class,` e:

```php
    public function isIntern(): bool
    {
        return $this->employment_type === EmploymentType::Intern;
    }
```

`employment_type` **non** va in `#[Fillable]`.

`database/factories/UserFactory.php`: `use App\Enums\EmploymentType;`, `'employment_type' => EmploymentType::Employee,` in `definition()` e:

```php
    public function contractor(): static
    {
        return $this->state(fn (array $attributes): array => ['employment_type' => EmploymentType::Contractor]);
    }

    public function intern(): static
    {
        return $this->state(fn (array $attributes): array => ['employment_type' => EmploymentType::Intern]);
    }
```

- [ ] **Step 4: Testi**

`lang/it/enums.php`: `'employee' => 'Utente',` nel gruppo `role` e il nuovo gruppo:

```php
    'employment_type' => [
        'employee' => 'Dipendente',
        'contractor' => 'Collaboratore esterno',
        'intern' => 'Stagista',
    ],
```

`lang/en/enums.php`: `'employee' => 'User',` nel gruppo `role` e:

```php
    'employment_type' => [
        'employee' => 'Employee',
        'contractor' => 'External contractor',
        'intern' => 'Intern',
    ],
```

- [ ] **Step 5: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Users/EmploymentTypeTest.php tests/Feature/Migrations tests/Feature/Users/UserModelTest.php tests/Feature/Profile/UpdateProfileTest.php`
Expected: PASS.

- [ ] **Step 6: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app/Enums app/Models/User.php database lang tests/Feature/Users tests/Feature/Profile tests/Feature/Migrations --format agent`, `sail bin pint --test`; poi `sail artisan migrate` sul DB di sviluppo.
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add apps/laravel/database/migrations/2026_10_15_100100_add_employment_type_to_users_table.php apps/laravel/app/Enums apps/laravel/app/Models/User.php apps/laravel/database/factories/UserFactory.php apps/laravel/lang apps/laravel/tests
git commit -m "feat(utenti): tipo di rapporto e ruolo base chiamato Utente"
```

---
## Task 3: Storico della persona — tabella, UserHistoryRecorder e flussi esistenti

**Files:**
- Create: `apps/laravel/database/migrations/2026_10_15_100200_create_user_history_table.php`
- Create: `apps/laravel/app/Enums/UserHistoryEvent.php`, `apps/laravel/app/Models/UserHistory.php`, `apps/laravel/app/Services/UserHistoryRecorder.php`
- Modify: `apps/laravel/app/Services/InvitationService.php` (invito e attivazione), `apps/laravel/app/Services/UserManagementService.php` (ruolo, promozione, revoca, disattivazione, riattivazione), `apps/laravel/app/Console/Commands/CreateAdmin.php` (primo admin)
- Test: `apps/laravel/tests/Feature/Users/UserHistoryRecordingTest.php`, `apps/laravel/tests/Feature/Migrations/SubProject2MigrationTest.php`

**Interfaces:**
- Consumes: `users.location_id` e `Location::primary()` (Task 1), `users.employment_type` ed `EmploymentType` (Task 2).
- Produces:
  - tabella `user_history` (spec §8.2) e una riga `imported` per ogni utente già esistente;
  - `App\Enums\UserHistoryEvent` (valori del contratto);
  - `App\Models\UserHistory` (`UPDATED_AT = null`, cast `event` e `context`, relazioni `user()` e `actor()`);
  - `App\Services\UserHistoryRecorder` con `invited`, `activated`, `roleChanged`, `employmentTypeChanged`, `locationChanged`, `disabled`, `enabled` (firme del contratto). I metodi `*Changed` con valore uguale non scrivono nulla. Il Task 6 usa `employmentTypeChanged` e `locationChanged`.
- `activated()` registra come autore la persona stessa: l'invito l'ha accettato lei.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/UserHistoryRecordingTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\Invitation;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use App\Services\InvitationService;
use App\Services\UserHistoryRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Ogni flusso che crea, attiva o cambia ruolo o stato di una persona lascia esattamente una tappa (spec §8).
 */
class UserHistoryRecordingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create();
    }

    public function test_an_invitation_records_role_type_and_location(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara@example.test', 'role' => 'manager'])->assertCreated();

        $invited = User::query()->where('email', 'sara@example.test')->sole();
        $entry = $this->onlyEntryOf($invited);
        $this->assertSame(UserHistoryEvent::Invited, $entry->event);
        $this->assertSame(['role' => 'manager', 'employment_type' => 'employee', 'location_id' => Location::primary()->id], $entry->context);
        $this->assertSame($this->admin->id, $entry->actor_id);
    }

    public function test_an_admin_invitation_records_the_admin_role(): void
    {
        $this->actingAs($this->admin)->postJson('/api/administrators/invitations', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'current_password' => 'password'])->assertCreated();

        $entry = $this->onlyEntryOf(User::query()->where('email', 'nora@example.test')->sole());
        $this->assertSame(UserHistoryEvent::Invited, $entry->event);
        $this->assertSame('admin', $entry->context['role'] ?? null);
    }

    public function test_the_first_admin_from_the_terminal_has_no_actor(): void
    {
        $this->artisan('app:create-admin', ['first_name' => 'Giulia', 'last_name' => 'Rossi', 'email' => 'giulia@example.test', '--force' => true])->assertSuccessful();

        $entry = $this->onlyEntryOf(User::query()->where('email', 'giulia@example.test')->sole());
        $this->assertSame(UserHistoryEvent::Invited, $entry->event);
        $this->assertNull($entry->actor_id);
    }

    public function test_accepting_the_invitation_records_the_activation_by_the_person(): void
    {
        $invitation = Invitation::factory()->create();

        $user = app(InvitationService::class)->accept($invitation, 'una-frase-lunga-e-nuova', Request::create('/'));

        $this->assertNotNull($user);
        $entry = $this->onlyEntryOf($user);
        $this->assertSame(UserHistoryEvent::Activated, $entry->event);
        $this->assertSame($user->id, $entry->actor_id);
    }

    public function test_a_role_change_records_both_roles_and_the_same_role_records_nothing(): void
    {
        $employee = User::factory()->create();

        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'manager'])->assertOk();
        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'manager'])->assertOk();

        $entry = $this->onlyEntryOf($employee);
        $this->assertSame(UserHistoryEvent::RoleChanged, $entry->event);
        $this->assertSame(['employee', 'manager'], [$entry->old_value, $entry->new_value]);
        $this->assertSame($this->admin->id, $entry->actor_id);
    }

    public function test_promotion_and_revocation_are_role_changes(): void
    {
        $manager = User::factory()->manager()->create();

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $manager->id, 'current_password' => 'password'])->assertOk();
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$manager->id}", ['role' => 'employee', 'current_password' => 'password'])->assertOk();

        $entries = UserHistory::query()->where('user_id', $manager->id)->orderBy('id')->get();
        $this->assertSame([['manager', 'admin'], ['admin', 'employee']], $entries->map(fn (UserHistory $entry): array => [$entry->old_value, $entry->new_value])->all());
        $this->assertSame([UserHistoryEvent::RoleChanged, UserHistoryEvent::RoleChanged], $entries->pluck('event')->all());
    }

    public function test_disabling_and_enabling_are_recorded_and_a_refused_action_records_nothing(): void
    {
        $employee = User::factory()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")->assertOk();
        // Già disattivato: 409, nessuna tappa
        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")->assertConflict();
        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/enable")->assertOk();

        $this->assertSame(
            [UserHistoryEvent::Disabled, UserHistoryEvent::Enabled],
            UserHistory::query()->where('user_id', $employee->id)->orderBy('id')->pluck('event')->all(),
        );
    }

    public function test_the_recorder_skips_changes_to_the_same_value(): void
    {
        $user = User::factory()->create();
        $recorder = app(UserHistoryRecorder::class);

        $recorder->roleChanged($user, Role::Employee, Role::Employee, $this->admin);
        $recorder->employmentTypeChanged($user, EmploymentType::Intern, EmploymentType::Intern, $this->admin);
        $recorder->locationChanged($user, $user->location_id, $user->location_id, $this->admin);

        $this->assertDatabaseCount('user_history', 0);

        $recorder->employmentTypeChanged($user, EmploymentType::Intern, EmploymentType::Employee, null);
        $this->assertSame(['intern', 'employee'], [$this->onlyEntryOf($user)->old_value, $this->onlyEntryOf($user)->new_value]);
    }

    private function onlyEntryOf(User $user): UserHistory
    {
        return UserHistory::query()->where('user_id', $user->id)->sole();
    }
}
```

In `tests/Feature/Migrations/SubProject2MigrationTest.php` aggiungi:

```php
    public function test_existing_users_get_an_imported_entry_with_their_current_situation(): void
    {
        $this->legacyDatabaseWith([
            ['first_name' => 'Marco', 'last_name' => 'Bianchi', 'email' => 'marco@example.test', 'role' => 'manager'],
        ]);

        $userId = DB::table('users')->where('email', 'marco@example.test')->value('id');
        $entry = DB::table('user_history')->where('user_id', $userId)->sole();

        $this->assertSame('imported', $entry->event);
        $this->assertSame('2026-03-03 09:00:00', $entry->created_at);
        $this->assertNull($entry->actor_id);
        $this->assertSame(
            ['role' => 'manager', 'employment_type' => 'employee', 'location_id' => Location::primary()->id],
            json_decode((string) $entry->context, true),
        );
    }
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/UserHistoryRecordingTest.php tests/Feature/Migrations`
Expected: FAIL. `Class "App\Enums\UserHistoryEvent" not found`.

- [ ] **Step 3: Migration, enum e model**

`database/migrations/2026_10_15_100200_create_user_history_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Storico della persona (spec §8.2): dura quanto l'account, a differenza di `auth_events`. Ogni utente esistente
 * riceve una tappa `imported` con la data di creazione e ruolo, tipo e sede attuali (valori letterali, una sola
 * INSERT … SELECT).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_history', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('event', 40);
            // Valore dell'enum per ruolo e tipo, id per la sede
            $table->string('old_value', 40)->nullable();
            $table->string('new_value', 40)->nullable();
            // Solo per `invited` e `imported`: ruolo, tipo e id della sede di partenza
            $table->json('context')->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->index(['user_id', 'created_at']);
        });

        DB::statement(<<<'SQL'
            INSERT INTO user_history (user_id, event, context, created_at)
            SELECT id, 'imported', JSON_OBJECT('role', role, 'employment_type', employment_type, 'location_id', location_id), COALESCE(created_at, CURRENT_TIMESTAMP)
            FROM users
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('user_history');
    }
};
```

`app/Enums/UserHistoryEvent.php`:

```php
<?php

namespace App\Enums;

/**
 * Tappe dello storico di una persona (spec §8.1). Nome, email, password e lingua non sono tappe del rapporto.
 */
enum UserHistoryEvent: string
{
    case Imported = 'imported';
    case Invited = 'invited';
    case Activated = 'activated';
    case RoleChanged = 'role_changed';
    case EmploymentTypeChanged = 'employment_type_changed';
    case LocationChanged = 'location_changed';
    case Disabled = 'disabled';
    case Enabled = 'enabled';
}
```

`app/Models/UserHistory.php`:

```php
<?php

namespace App\Models;

use App\Enums\UserHistoryEvent;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una tappa dello storico (spec §8.2). La scrive solo `UserHistoryRecorder`, con `forceFill`.
 *
 * @property UserHistoryEvent $event
 * @property array{role?: string, employment_type?: string, location_id?: int}|null $context
 * @property CarbonImmutable $created_at
 */
class UserHistory extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'user_history';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'event' => UserHistoryEvent::class,
            'context' => 'array',
            'created_at' => 'immutable_datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
```

- [ ] **Step 4: Recorder**

`app/Services/UserHistoryRecorder.php`:

```php
<?php

namespace App\Services;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\User;
use App\Models\UserHistory;

/**
 * Unico punto che scrive lo storico (spec §8.2): i servizi lo chiamano dentro la stessa transazione della modifica,
 * così una modifica annullata non lascia tappe. Un cambio verso lo stesso valore non scrive nulla.
 */
final class UserHistoryRecorder
{
    public function invited(User $user, ?User $actor): void
    {
        $this->write($user, UserHistoryEvent::Invited, $actor, context: [
            'role' => $user->role->value,
            'employment_type' => $user->employment_type->value,
            'location_id' => $user->location_id,
        ]);
    }

    /**
     * Invito accettato: l'autore è la persona stessa.
     */
    public function activated(User $user): void
    {
        $this->write($user, UserHistoryEvent::Activated, $user);
    }

    public function roleChanged(User $user, Role $from, Role $to, ?User $actor): void
    {
        if ($from !== $to) {
            $this->write($user, UserHistoryEvent::RoleChanged, $actor, $from->value, $to->value);
        }
    }

    public function employmentTypeChanged(User $user, EmploymentType $from, EmploymentType $to, ?User $actor): void
    {
        if ($from !== $to) {
            $this->write($user, UserHistoryEvent::EmploymentTypeChanged, $actor, $from->value, $to->value);
        }
    }

    /**
     * Si salvano gli id: lo storico mostra il nome attuale della sede (spec §8.2).
     */
    public function locationChanged(User $user, int $fromLocationId, int $toLocationId, ?User $actor): void
    {
        if ($fromLocationId !== $toLocationId) {
            $this->write($user, UserHistoryEvent::LocationChanged, $actor, (string) $fromLocationId, (string) $toLocationId);
        }
    }

    public function disabled(User $user, ?User $actor): void
    {
        $this->write($user, UserHistoryEvent::Disabled, $actor);
    }

    public function enabled(User $user, ?User $actor): void
    {
        $this->write($user, UserHistoryEvent::Enabled, $actor);
    }

    /**
     * @param  array<string, string|int>|null  $context
     */
    private function write(User $user, UserHistoryEvent $event, ?User $actor, ?string $oldValue = null, ?string $newValue = null, ?array $context = null): void
    {
        (new UserHistory)->forceFill([
            'user_id' => $user->id,
            'event' => $event,
            'old_value' => $oldValue,
            'new_value' => $newValue,
            'context' => $context,
            'actor_id' => $actor?->id,
        ])->save();
    }
}
```

- [ ] **Step 5: Le tappe nei flussi esistenti**

`app/Services/InvitationService.php`:
- costruttore: `public function __construct(private readonly AuthEventLogger $events, private readonly UserHistoryRecorder $history) {}`;
- in `createInvited()`, dopo `$this->send($user, $inviter);`: `$this->history->invited($user, $inviter);` (vale per l'invito normale e per quello di un admin);
- in `accept()`, dopo `$locked->forceFill(['accepted_at' => now()])->save();`: `$this->history->activated($user);`.

`app/Services/UserManagementService.php`: aggiungi `private readonly UserHistoryRecorder $history,` al costruttore e:
- `changeRole()`: prima del `forceFill` salva `$from = $fresh->role;`; dopo `$this->events->log(...)`: `$this->history->roleChanged($fresh, $from, $role, $actor);`;
- `grantAdmin()`: `$from = $fresh->role;` prima del `forceFill`, poi `$this->history->roleChanged($fresh, $from, Role::Admin, $actor);`;
- `revokeAdmin()`: dopo il salvataggio `$this->history->roleChanged($fresh, Role::Admin, $newRole, $actor);`;
- `disable()`: dopo l'evento `UserDisabled`: `$this->history->disabled($fresh, $actor);`;
- `enable()`: dopo l'evento `UserEnabled`: `$this->history->enabled($fresh, $actor);`.

`app/Console/Commands/CreateAdmin.php`: aggiungi `UserHistoryRecorder $history` agli argomenti di `handle()` e, nella transazione del nuovo admin, dopo `$invitations->send($admin, null);`, `$history->invited($admin, null);`. Il reinvio a un admin già invitato non scrive tappe.

- [ ] **Step 6: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Users/UserHistoryRecordingTest.php tests/Feature/Migrations`
Expected: PASS.

- [ ] **Step 7: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app/Enums/UserHistoryEvent.php app/Models/UserHistory.php app/Services app/Console/Commands/CreateAdmin.php database/migrations/2026_10_15_100200_create_user_history_table.php tests/Feature/Users/UserHistoryRecordingTest.php tests/Feature/Migrations --format agent`, `sail bin pint --test`; poi `sail artisan migrate` sul DB di sviluppo.
Expected: tutto verde.

- [ ] **Step 8: Commit**

```bash
git add apps/laravel/database/migrations/2026_10_15_100200_create_user_history_table.php apps/laravel/app/Enums/UserHistoryEvent.php apps/laravel/app/Models/UserHistory.php apps/laravel/app/Services apps/laravel/app/Console/Commands/CreateAdmin.php apps/laravel/tests/Feature/Users/UserHistoryRecordingTest.php apps/laravel/tests/Feature/Migrations
git commit -m "feat(utenti): storico della persona con le tappe di invito, ruolo e stato"
```

---

## Task 4: Festivi nazionali e WorkCalendar

**Files:**
- Create: `apps/laravel/app/Support/Holidays/HolidayCalendar.php`, `apps/laravel/app/Support/Holidays/ItalianHolidayCalendar.php`, `apps/laravel/app/Support/Holidays/HolidayCalendars.php`
- Create: `apps/laravel/app/Enums/NonWorkingReason.php`, `apps/laravel/app/Support/WorkDay.php`, `apps/laravel/app/Services/WorkCalendar.php`
- Create: `apps/laravel/lang/it/holidays.php`, `apps/laravel/lang/en/holidays.php`
- Test: `apps/laravel/tests/Feature/Locations/HolidayCalendarTest.php`, `apps/laravel/tests/Feature/Locations/WorkCalendarTest.php`

**Interfaces:**
- Consumes: `Location`, `WorkSchedule`, `Closure`, `User::schedules()`, `User::location()` (Task 1).
- Produces:
  - `HolidayCalendar::holidays(int $year): array<string, list<string>>`: data `Y-m-d` → chiavi di traduzione `holidays.<nome>`. **Precisa il contratto:** una lista per data, non una stringa, perché due festivi possono cadere nello stesso giorno (25 aprile e Pasquetta nel 2011, 25 aprile e Pasqua nel 2038) e vanno elencati entrambi (Review Focus 3). Costanti `MIN_YEAR = 2000`, `MAX_YEAR = 2100` sull'interfaccia; anno fuori range: `InvalidArgumentException`;
  - `HolidayCalendars::for(string $country): HolidayCalendar` (oggi solo `IT`; altro paese: `InvalidArgumentException`);
  - `App\Enums\NonWorkingReason` (valori del contratto);
  - `App\Support\WorkDay` readonly: `date`, `minutes` (0 quando il giorno non è lavorativo), `reasons` (`list<array{type: NonWorkingReason, label: string}>`, nell'ordine riposo settimanale, festivi nazionali, patrono, chiusure); `isWorking(): bool`;
  - `WorkCalendar::forUser()` e `forLocation()` (firme del contratto), `WorkCalendar::MAX_DAYS = 366`.
- Regole (spec §3.1):
  - minuti dall'orario personale valido quel giorno; se manca o è `follows_location`, dall'orario della sede valido quel giorno;
  - prima della prima versione della sede vale la prima versione (decisione del Task 1);
  - prima della prima versione personale vale l'orario della sede;
  - un numero fisso di query per chiamata (sede, orari della sede, orari personali, chiusure), mai una per giorno.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Locations/HolidayCalendarTest.php`:

```php
<?php

namespace Tests\Feature\Locations;

use App\Support\Holidays\HolidayCalendars;
use App\Support\Holidays\ItalianHolidayCalendar;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class HolidayCalendarTest extends TestCase
{
    /**
     * @return array<string, array{int, string, string}>
     */
    public static function easters(): array
    {
        return [
            '2011, Pasquetta il 25 aprile' => [2011, '2011-04-24', '2011-04-25'],
            '2024, Pasqua in marzo' => [2024, '2024-03-31', '2024-04-01'],
            '2025' => [2025, '2025-04-20', '2025-04-21'],
            '2026' => [2026, '2026-04-05', '2026-04-06'],
            '2038, Pasqua il 25 aprile' => [2038, '2038-04-25', '2038-04-26'],
        ];
    }

    #[DataProvider('easters')]
    public function test_easter_and_easter_monday_fall_on_the_right_day(int $year, string $easter, string $easterMonday): void
    {
        $holidays = (new ItalianHolidayCalendar)->holidays($year);

        $this->assertContains('holidays.easter', $holidays[$easter]);
        $this->assertContains('holidays.easter_monday', $holidays[$easterMonday]);
    }

    public function test_two_holidays_on_the_same_day_are_both_listed(): void
    {
        $calendar = new ItalianHolidayCalendar;

        $this->assertSame(['holidays.liberation_day', 'holidays.easter_monday'], $calendar->holidays(2011)['2011-04-25']);
        $this->assertSame(['holidays.liberation_day', 'holidays.easter'], $calendar->holidays(2038)['2038-04-25']);
    }

    public function test_saint_francis_is_a_national_holiday_from_2026(): void
    {
        $calendar = new ItalianHolidayCalendar;

        $this->assertArrayNotHasKey('2025-10-04', $calendar->holidays(2025));
        $this->assertSame(['holidays.st_francis'], $calendar->holidays(2026)['2026-10-04']);
        $this->assertCount(12, $calendar->holidays(2025));
        $this->assertCount(13, $calendar->holidays(2026));
    }

    public function test_the_dates_are_sorted_and_every_label_is_translated(): void
    {
        app()->setLocale('it');
        $holidays = (new ItalianHolidayCalendar)->holidays(2026);

        $this->assertSame(array_keys($holidays), collect(array_keys($holidays))->sort()->values()->all());
        $this->assertSame('Ferragosto', __('holidays.assumption'));

        foreach (array_merge(...array_values($holidays)) as $key) {
            $this->assertNotSame($key, __($key));
        }
    }

    public function test_years_out_of_range_and_unknown_countries_are_refused(): void
    {
        foreach ([1999, 2101] as $year) {
            try {
                (new ItalianHolidayCalendar)->holidays($year);
                $this->fail("{$year}: expected InvalidArgumentException");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertInstanceOf(ItalianHolidayCalendar::class, HolidayCalendars::for('IT'));
        $this->expectException(InvalidArgumentException::class);
        HolidayCalendars::for('FR');
    }
}
```

`tests/Feature/Locations/WorkCalendarTest.php`:

```php
<?php

namespace Tests\Feature\Locations;

use App\Enums\NonWorkingReason;
use App\Models\Closure;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\WorkCalendar;
use App\Support\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Tests\TestCase;

class WorkCalendarTest extends TestCase
{
    use RefreshDatabase;

    private WorkCalendar $calendar;

    protected function setUp(): void
    {
        parent::setUp();
        app()->setLocale('it');
        $this->calendar = app(WorkCalendar::class);
    }

    public function test_a_standard_week_has_five_working_days_and_a_weekly_rest(): void
    {
        $location = Location::factory()->create();

        // Da lunedì 19 a domenica 25 ottobre 2026
        $days = $this->calendar->forLocation($location, $this->day('2026-10-19'), $this->day('2026-10-25'));

        $this->assertSame([480, 480, 480, 480, 480, 0, 0], $this->minutes($days));
        $this->assertTrue($days[0]->isWorking());
        $this->assertFalse($days[6]->isWorking());
        $this->assertSame([NonWorkingReason::WeeklyRest], $this->types($days[6]));
        $this->assertSame('2026-10-25', $days[6]->date->toDateString());
    }

    public function test_a_new_schedule_takes_over_from_its_first_day(): void
    {
        $location = Location::factory()->create();
        WorkSchedule::factory()->forLocation($location)->validFrom('2026-10-21')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $days = $this->calendar->forLocation($location, $this->day('2026-10-19'), $this->day('2026-10-23'));

        $this->assertSame([480, 480, 240, 240, 240], $this->minutes($days));
    }

    public function test_the_oldest_schedule_also_covers_the_days_before_it(): void
    {
        $location = Location::factory()->create();
        $location->schedules()->delete();
        WorkSchedule::factory()->forLocation($location)->validFrom('2026-10-21')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $this->assertSame([240, 240], $this->minutes($this->calendar->forLocation($location, $this->day('2026-10-19'), $this->day('2026-10-20'))));
    }

    public function test_a_personal_schedule_wins_until_it_follows_the_location_again(): void
    {
        $user = User::factory()->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-01')->minutes([240, 240, 240, 0, 0, 0, 0])->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-22')->followsLocation()->create();

        // Lunedì 19 - venerdì 23: part-time fino a mercoledì, poi di nuovo l'orario della sede da giovedì 22
        $days = $this->calendar->forUser($user, $this->day('2026-10-19'), $this->day('2026-10-23'));

        $this->assertSame([240, 240, 240, 480, 480], $this->minutes($days));
    }

    public function test_before_any_personal_schedule_the_location_schedule_applies(): void
    {
        $milano = Location::factory()->create();
        WorkSchedule::factory()->forLocation($milano)->validFrom('2026-01-01')->minutes([420, 420, 420, 420, 420, 240, 0])->create();
        $user = User::factory()->at($milano)->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-24')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $days = $this->calendar->forUser($user, $this->day('2026-10-23'), $this->day('2026-10-24'));

        // Venerdì 23 con l'orario di Milano; da sabato 24 vale l'orario personale, che il sabato non lavora
        $this->assertSame([420, 0], $this->minutes($days));
        $this->assertSame([NonWorkingReason::WeeklyRest], $this->types($days[1]));
    }

    public function test_the_patron_closes_the_location_with_its_name(): void
    {
        $milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);

        // Lunedì 7 dicembre 2026
        [$day] = $this->calendar->forLocation($milano, $this->day('2026-12-07'), $this->day('2026-12-07'));

        $this->assertSame(0, $day->minutes);
        $this->assertSame([NonWorkingReason::Patron], $this->types($day));
        $this->assertSame('Patrono (Milano)', $day->reasons[0]['label']);
        $this->assertTrue(collect($this->calendar->forLocation(Location::factory()->create(), $this->day('2026-12-07'), $this->day('2026-12-07')))->first()?->isWorking());
    }

    public function test_a_day_with_several_reasons_lists_them_all_once(): void
    {
        $milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);
        Closure::factory()->between('2026-08-10', '2026-08-16')->create(['description' => 'Chiusura estiva']);
        Closure::factory()->forLocation($milano)->between('2026-08-14', '2026-08-14')->create(['description' => 'Ponte']);
        Closure::factory()->forLocation(Location::factory()->create())->between('2026-08-13', '2026-08-13')->create(['description' => 'Altra sede']);

        $days = collect($this->calendar->forLocation($milano, $this->day('2026-08-13'), $this->day('2026-08-15')))->keyBy(fn (WorkDay $day): string => $day->date->toDateString());

        $this->assertSame([NonWorkingReason::Closure], $this->types($days['2026-08-13']));
        $this->assertSame(['Chiusura estiva'], array_column($days['2026-08-13']->reasons, 'label'));
        $this->assertSame(['Chiusura estiva', 'Ponte'], array_column($days['2026-08-14']->reasons, 'label'));
        // Sabato di Ferragosto dentro la chiusura: riposo, festivo e chiusura, ognuno una volta
        $this->assertSame([NonWorkingReason::WeeklyRest, NonWorkingReason::NationalHoliday, NonWorkingReason::Closure], $this->types($days['2026-08-15']));
        $this->assertSame('Ferragosto', $days['2026-08-15']->reasons[1]['label']);

        // Patrono di domenica (7 dicembre 2025): riposo e patrono, nessun giorno perso o contato due volte
        [$sunday] = $this->calendar->forLocation($milano, $this->day('2025-12-07'), $this->day('2025-12-07'));
        $this->assertSame([NonWorkingReason::WeeklyRest, NonWorkingReason::Patron], $this->types($sunday));
    }

    public function test_liberation_day_and_easter_monday_together_are_both_listed(): void
    {
        [$day] = $this->calendar->forLocation(Location::factory()->create(), $this->day('2011-04-25'), $this->day('2011-04-25'));

        $this->assertSame([NonWorkingReason::NationalHoliday, NonWorkingReason::NationalHoliday], $this->types($day));
        $this->assertSame(['Festa della Liberazione', 'Lunedì dell’Angelo'], array_column($day->reasons, 'label'));
    }

    public function test_an_interval_spanning_two_years_uses_both_years_holidays(): void
    {
        $days = $this->calendar->forLocation(Location::factory()->create(), $this->day('2026-12-31'), $this->day('2027-01-01'));

        $this->assertTrue($days[0]->isWorking());
        $this->assertSame([NonWorkingReason::NationalHoliday], $this->types($days[1]));
    }

    public function test_intervals_longer_than_a_leap_year_or_reversed_are_refused(): void
    {
        $location = Location::factory()->create();

        $this->assertCount(366, $this->calendar->forLocation($location, $this->day('2028-01-01'), $this->day('2028-12-31')));

        foreach ([['2026-01-01', '2027-01-02'], ['2026-10-20', '2026-10-19']] as [$from, $to]) {
            try {
                $this->calendar->forLocation($location, $this->day($from), $this->day($to));
                $this->fail("{$from} → {$to}: expected InvalidArgumentException");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_the_number_of_queries_does_not_grow_with_the_interval(): void
    {
        $user = User::factory()->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-03-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        Closure::factory()->create();

        $count = function (string $to) use ($user): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->calendar->forUser($user->fresh() ?? $user, $this->day('2026-01-01'), $this->day($to));
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $this->assertSame($count('2026-01-07'), $count('2026-12-31'));
    }

    private function day(string $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date);
    }

    /**
     * @param  list<WorkDay>  $days
     * @return list<int>
     */
    private function minutes(array $days): array
    {
        return array_map(fn (WorkDay $day): int => $day->minutes, $days);
    }

    /**
     * @return list<NonWorkingReason>
     */
    private function types(WorkDay $day): array
    {
        return array_column($day->reasons, 'type');
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Locations/HolidayCalendarTest.php tests/Feature/Locations/WorkCalendarTest.php`
Expected: FAIL. `Class "App\Support\Holidays\ItalianHolidayCalendar" not found`.

- [ ] **Step 3: Festivi nazionali**

`app/Support/Holidays/HolidayCalendar.php`:

```php
<?php

namespace App\Support\Holidays;

/**
 * Festivi nazionali di un paese (spec §2.5): calcolati, non salvati in tabella.
 */
interface HolidayCalendar
{
    public const MIN_YEAR = 2000;

    public const MAX_YEAR = 2100;

    /**
     * Festivi dell'anno, in ordine di data: data `Y-m-d` → chiavi di traduzione dei festivi di quel giorno (possono
     * essere più d'uno, es. 25 aprile e Pasquetta nel 2011).
     *
     * @return array<string, list<string>>
     */
    public function holidays(int $year): array;
}
```

`app/Support/Holidays/ItalianHolidayCalendar.php`:

```php
<?php

namespace App\Support\Holidays;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Festivi nazionali italiani (spec §2.5). Pasqua con l'algoritmo gregoriano anonimo (Meeus/Jones/Butcher).
 */
final class ItalianHolidayCalendar implements HolidayCalendar
{
    /**
     * Festivi a data fissa: mese-giorno → nome (chiave in `lang/*/holidays.php`).
     *
     * @var array<string, string>
     */
    private const FIXED = [
        '01-01' => 'new_year',
        '01-06' => 'epiphany',
        '04-25' => 'liberation_day',
        '05-01' => 'labour_day',
        '06-02' => 'republic_day',
        '08-15' => 'assumption',
        '11-01' => 'all_saints',
        '12-08' => 'immaculate_conception',
        '12-25' => 'christmas',
        '12-26' => 'st_stephen',
    ];

    /**
     * San Francesco d'Assisi (4 ottobre) è di nuovo festa nazionale dal 2026.
     */
    private const ST_FRANCIS_FROM = 2026;

    public function holidays(int $year): array
    {
        if ($year < self::MIN_YEAR || $year > self::MAX_YEAR) {
            throw new InvalidArgumentException("Year {$year} is outside the supported range.");
        }

        $fixed = self::FIXED;

        if ($year >= self::ST_FRANCIS_FROM) {
            $fixed['10-04'] = 'st_francis';
        }

        $days = [];

        foreach ($fixed as $monthDay => $name) {
            $days["{$year}-{$monthDay}"][] = "holidays.{$name}";
        }

        // Dopo quelli fissi: nel giorno in comune il festivo civile viene prima (es. 2011-04-25)
        $easter = $this->easterSunday($year);
        $days[$easter->toDateString()][] = 'holidays.easter';
        $days[$easter->addDay()->toDateString()][] = 'holidays.easter_monday';

        ksort($days);

        return $days;
    }

    private function easterSunday(int $year): CarbonImmutable
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;

        return CarbonImmutable::create($year, $month, $day);
    }
}
```

`app/Support/Holidays/HolidayCalendars.php`:

```php
<?php

namespace App\Support\Holidays;

use InvalidArgumentException;

/**
 * Calcolatore dei festivi per il paese di una sede. Oggi solo l'Italia (spec §1): un paese nuovo si aggiunge qui.
 */
final class HolidayCalendars
{
    public static function for(string $country): HolidayCalendar
    {
        return match ($country) {
            'IT' => new ItalianHolidayCalendar,
            default => throw new InvalidArgumentException("No holiday calendar for country {$country}."),
        };
    }
}
```

`lang/it/holidays.php`:

```php
<?php

return [
    'new_year' => 'Capodanno',
    'epiphany' => 'Epifania',
    'easter' => 'Pasqua',
    'easter_monday' => 'Lunedì dell’Angelo',
    'liberation_day' => 'Festa della Liberazione',
    'labour_day' => 'Festa del lavoro',
    'republic_day' => 'Festa della Repubblica',
    'assumption' => 'Ferragosto',
    'st_francis' => 'San Francesco d’Assisi',
    'all_saints' => 'Ognissanti',
    'immaculate_conception' => 'Immacolata',
    'christmas' => 'Natale',
    'st_stephen' => 'Santo Stefano',
    'patron' => 'Patrono (:location)',
    'weekly_rest' => 'Riposo settimanale',
];
```

`lang/en/holidays.php`:

```php
<?php

return [
    'new_year' => 'New Year’s Day',
    'epiphany' => 'Epiphany',
    'easter' => 'Easter Sunday',
    'easter_monday' => 'Easter Monday',
    'liberation_day' => 'Liberation Day',
    'labour_day' => 'Labour Day',
    'republic_day' => 'Republic Day',
    'assumption' => 'Assumption Day',
    'st_francis' => 'Saint Francis of Assisi',
    'all_saints' => 'All Saints’ Day',
    'immaculate_conception' => 'Immaculate Conception',
    'christmas' => 'Christmas Day',
    'st_stephen' => 'Saint Stephen’s Day',
    'patron' => 'Patron saint (:location)',
    'weekly_rest' => 'Weekly rest',
];
```

- [ ] **Step 4: WorkDay, motivi e WorkCalendar**

`app/Enums/NonWorkingReason.php`:

```php
<?php

namespace App\Enums;

/**
 * Perché un giorno non è lavorativo (spec §3.1).
 */
enum NonWorkingReason: string
{
    case WeeklyRest = 'weekly_rest';
    case NationalHoliday = 'national_holiday';
    case Patron = 'patron';
    case Closure = 'closure';
}
```

`app/Support/WorkDay.php`:

```php
<?php

namespace App\Support;

use App\Enums\NonWorkingReason;
use Carbon\CarbonImmutable;

/**
 * Un giorno del calendario lavorativo: minuti di lavoro (0 se non lavorativo) e i motivi per cui non lo è.
 */
final readonly class WorkDay
{
    /**
     * @param  list<array{type: NonWorkingReason, label: string}>  $reasons
     */
    public function __construct(
        public CarbonImmutable $date,
        public int $minutes,
        public array $reasons,
    ) {}

    public function isWorking(): bool
    {
        return $this->minutes > 0 && $this->reasons === [];
    }
}
```

`app/Services/WorkCalendar.php`:

```php
<?php

namespace App\Services;

use App\Enums\NonWorkingReason;
use App\Models\Closure as CompanyClosure;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\Holidays\HolidayCalendars;
use App\Support\Translate;
use App\Support\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use InvalidArgumentException;

/**
 * Unico punto che calcola i giorni lavorativi (spec §3.1): saldi, richieste e calendario del team passeranno da qui.
 * Un giorno è lavorativo se l'orario valido quel giorno ha minuti e non è festivo nazionale, patrono o chiusura.
 */
final class WorkCalendar
{
    public const MAX_DAYS = 366;

    /**
     * Giorni di una persona: il suo orario personale, se c'è, altrimenti quello della sua sede attuale.
     *
     * @return list<WorkDay>
     */
    public function forUser(User $user, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $this->ensureValidInterval($from, $to);

        /** @var Collection<int, WorkSchedule> $personal */
        $personal = $user->schedules()->where('valid_from', '<=', $to->toDateString())->orderBy('valid_from')->get();

        // Sede attuale (spec §3.1): per i giorni passati varrà lo snapshot delle richieste (fase 3)
        return $this->build($user->location()->firstOrFail(), $from, $to, $personal);
    }

    /**
     * Giorni di una sede con il suo orario standard.
     *
     * @return list<WorkDay>
     */
    public function forLocation(Location $location, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $this->ensureValidInterval($from, $to);

        return $this->build($location, $from, $to, new Collection);
    }

    /**
     * @param  Collection<int, WorkSchedule>  $personal
     * @return list<WorkDay>
     */
    private function build(Location $location, CarbonImmutable $from, CarbonImmutable $to, Collection $personal): array
    {
        $from = $from->startOfDay();
        $to = $to->startOfDay();
        // Tutte le versioni della sede (poche): la più vecchia vale anche per i giorni prima del suo inizio
        $standard = $location->schedules()->orderBy('valid_from')->get();
        $closures = CompanyClosure::query()
            ->where(fn (Builder $query) => $query->whereNull('location_id')->orWhere('location_id', $location->id))
            ->where('starts_on', '<=', $to->toDateString())
            ->where('ends_on', '>=', $from->toDateString())
            ->orderBy('starts_on')
            ->orderBy('id')
            ->get();
        $holidays = $this->nationalHolidays($location->country, $from->year, $to->year);
        $days = [];

        for ($date = $from; $date->lessThanOrEqualTo($to); $date = $date->addDay()) {
            $scheduled = $this->scheduledMinutes($date, $standard, $personal);
            $reasons = [];

            if ($scheduled === 0) {
                $reasons[] = ['type' => NonWorkingReason::WeeklyRest, 'label' => Translate::text('holidays.weekly_rest')];
            }

            foreach ($holidays[$date->toDateString()] ?? [] as $key) {
                $reasons[] = ['type' => NonWorkingReason::NationalHoliday, 'label' => Translate::text($key)];
            }

            if ($location->hasPatron() && $date->day === $location->patron_day && $date->month === $location->patron_month) {
                $reasons[] = ['type' => NonWorkingReason::Patron, 'label' => Translate::text('holidays.patron', ['location' => $location->name])];
            }

            foreach ($closures as $closure) {
                if ($date->betweenIncluded($closure->starts_on, $closure->ends_on)) {
                    $reasons[] = ['type' => NonWorkingReason::Closure, 'label' => $closure->description];
                }
            }

            $days[] = new WorkDay($date, $reasons === [] ? $scheduled : 0, $reasons);
        }

        return $days;
    }

    /**
     * @param  Collection<int, WorkSchedule>  $standard
     * @param  Collection<int, WorkSchedule>  $personal
     */
    private function scheduledMinutes(CarbonImmutable $date, Collection $standard, Collection $personal): int
    {
        $own = $this->versionOn($date, $personal);

        if ($own !== null && ! $own->follows_location) {
            return $own->minutesOn($date);
        }

        return ($this->versionOn($date, $standard) ?? $standard->first())?->minutesOn($date) ?? 0;
    }

    /**
     * Ultima versione iniziata entro quel giorno.
     *
     * @param  Collection<int, WorkSchedule>  $versions  ordinate per `valid_from`
     */
    private function versionOn(CarbonImmutable $date, Collection $versions): ?WorkSchedule
    {
        $day = $date->toDateString();

        return $versions->last(fn (WorkSchedule $version): bool => $version->valid_from->toDateString() <= $day);
    }

    /**
     * @return array<string, list<string>>
     */
    private function nationalHolidays(string $country, int $fromYear, int $toYear): array
    {
        $calendar = HolidayCalendars::for($country);
        $holidays = [];

        for ($year = $fromYear; $year <= $toYear; $year++) {
            $holidays += $calendar->holidays($year);
        }

        return $holidays;
    }

    private function ensureValidInterval(CarbonImmutable $from, CarbonImmutable $to): void
    {
        $from = $from->startOfDay();
        $to = $to->startOfDay();

        if ($to->lessThan($from) || (int) $from->diffInDays($to) + 1 > self::MAX_DAYS) {
            throw new InvalidArgumentException('The interval must be between 1 and '.self::MAX_DAYS.' days.');
        }
    }
}
```

- [ ] **Step 5: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Locations/HolidayCalendarTest.php tests/Feature/Locations/WorkCalendarTest.php`
Expected: PASS.

- [ ] **Step 6: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app/Support app/Enums/NonWorkingReason.php app/Services/WorkCalendar.php lang tests/Feature/Locations --format agent`, `sail bin pint --test`.
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add apps/laravel/app/Support/Holidays apps/laravel/app/Support/WorkDay.php apps/laravel/app/Enums/NonWorkingReason.php apps/laravel/app/Services/WorkCalendar.php apps/laravel/lang/it/holidays.php apps/laravel/lang/en/holidays.php apps/laravel/tests/Feature/Locations
git commit -m "feat(sedi): festivi nazionali italiani e calendario lavorativo"
```

---
## Task 5: Visibilità per sede

**Files:**
- Modify: `apps/laravel/app/Models/User.php` (scope `visibleTo`), `apps/laravel/app/Providers/AppServiceProvider.php` (risoluzione di `{user}`), `apps/laravel/app/Policies/UserPolicy.php` (stessa sede per il responsabile), `apps/laravel/app/Http/Controllers/Admin/UserController.php` (lista e conteggi)
- Test: `apps/laravel/tests/Feature/Users/LocationVisibilityTest.php`

**Interfaces:**
- Consumes: `User::at()`, `Location::factory()` (Task 1); `UserHistory` (Task 3, per verificare che un'azione rifiutata non lasci tappe).
- Produces:
  - `User::query()->visibleTo(User $actor)`: admin tutti, responsabile `location_id = $actor->location_id`, dipendente nessuno;
  - risoluzione di `{user}` in **tutte** le rotte con quel parametro: per chi gestisce gli utenti (`viewAny`), solo tra le persone di `visibleTo`; fuori scope 404. Vale anche per le rotte che i Task 8 e 9 aggiungono (`/users/{user}/schedules…`, `/users/{user}/history`);
  - `UserPolicy::mayActOn()`: il responsabile agisce solo su chi non è admin **e** è nella sua sede; `changeRole` passa da `mayActOn`.
- **Decisione di implementazione (precisa la spec §4.1):** per chi non gestisce utenti (il dipendente) `{user}` si risolve come prima. Così il dipendente riceve ancora il 403 della policy su qualunque persona: niente da scoprire, perché non può fare nulla, e la matrice dei permessi esistente (`UserPermissionsTest`) resta valida. Lo scope `visibleTo` dà comunque "nessuno" per il dipendente, come dice la spec.
- I servizi non cambiano: `ensureStillAllowed()` rilegge chi agisce e il destinatario sotto blocco e interroga la policy. Con la sede nella policy, uno spostamento avvenuto nel frattempo (del destinatario o di chi agisce) diventa da solo `409 users.state_changed`, perché il ruolo di chi agisce non è cambiato.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/LocationVisibilityTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\Location;
use App\Models\User;
use App\Services\InvitationService;
use App\Services\UserManagementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

/**
 * Il responsabile vede e gestisce solo la sua sede, l'admin tutte (spec §4.1).
 */
class LocationVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private Location $milano;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
        // Nella sede principale
        $this->manager = User::factory()->manager()->create();
    }

    public function test_a_manager_lists_and_counts_only_the_people_of_their_location(): void
    {
        $colleague = User::factory()->create();
        $disabled = User::factory()->disabled()->create();
        User::factory()->at($this->milano)->create();
        User::factory()->at($this->milano)->invited()->create();

        $response = $this->actingAs($this->manager)->getJson('/api/users')->assertOk();

        $this->assertEqualsCanonicalizing([$this->manager->id, $colleague->id, $disabled->id], array_column($response->json('data'), 'id'));
        $response->assertJsonPath('meta.counts', ['all' => 3, 'active' => 2, 'invited' => 0, 'disabled' => 1]);
    }

    public function test_an_admin_lists_the_people_of_every_location(): void
    {
        $admin = User::factory()->admin()->create();
        $there = User::factory()->at($this->milano)->create();

        $response = $this->actingAs($admin)->getJson('/api/users')->assertOk();

        $this->assertEqualsCanonicalizing([$this->manager->id, $there->id], array_column($response->json('data'), 'id'));
    }

    public function test_a_manager_gets_404_on_every_route_about_a_person_of_another_location(): void
    {
        $stranger = User::factory()->at($this->milano)->create();
        $routes = collect(Route::getRoutes()->getRoutes())->filter(fn (RoutingRoute $route): bool => str_contains($route->uri(), '{user}'));

        $this->assertNotEmpty($routes);

        foreach ($routes as $route) {
            $method = collect($route->methods())->reject(fn (string $method): bool => $method === 'HEAD')->firstOrFail();
            // Gli altri parametri (es. `{schedule}`) con un id qualsiasi: la persona si risolve prima
            $uri = (string) preg_replace('/\{[^}]+\}/', '1', str_replace('{user}', (string) $stranger->id, $route->uri()));

            $this->actingAs($this->manager)
                ->json($method, '/'.$uri, ['role' => 'manager', 'first_name' => 'Sara', 'last_name' => 'Colombo', 'current_password' => 'password'])
                ->assertNotFound();
        }

        $this->assertSame(UserStatus::Active, $stranger->fresh()?->status);
        $this->assertSame(Role::Employee, $stranger->fresh()?->role);
    }

    public function test_a_manager_still_acts_on_the_people_of_their_location(): void
    {
        $colleague = User::factory()->create();

        $this->actingAs($this->manager)->patchJson("/api/users/{$colleague->id}", ['first_name' => 'Sara', 'last_name' => 'Colombo'])->assertOk();
        $this->actingAs($this->manager)->postJson("/api/users/{$colleague->id}/disable")->assertOk();
    }

    public function test_an_employee_still_gets_the_403_of_the_policy(): void
    {
        $employee = User::factory()->create();
        $stranger = User::factory()->at($this->milano)->create();

        $this->actingAs($employee)->postJson("/api/users/{$stranger->id}/disable")->assertForbidden();
    }

    public function test_the_policy_lets_a_manager_act_only_within_their_location(): void
    {
        $here = User::factory()->create();
        $there = User::factory()->at($this->milano)->create();
        $admin = User::factory()->admin()->create();

        $this->assertTrue(Gate::forUser($this->manager)->allows('update', $here));
        $this->assertTrue(Gate::forUser($this->manager)->allows('changeRole', $here));
        $this->assertFalse(Gate::forUser($this->manager)->allows('update', $there));
        $this->assertFalse(Gate::forUser($this->manager)->allows('changeRole', $there));
        $this->assertTrue(Gate::forUser($admin)->allows('update', $there));
        $this->assertTrue(Gate::forUser($admin)->allows('changeRole', $there));
    }

    public function test_a_person_moved_meanwhile_gives_the_manager_a_conflict(): void
    {
        $service = app(UserManagementService::class);
        $calls = [
            'disable' => fn (User $stale) => $service->disable($stale, $this->manager, request(), false),
            'change_role' => fn (User $stale) => $service->changeRole($stale, Role::Manager, $this->manager, request()),
            'password_reset' => fn (User $stale) => $service->sendPasswordReset($stale, $this->manager, request(), false),
            'resend' => fn (User $stale) => app(InvitationService::class)->resend($stale, $this->manager, request()),
        ];

        foreach ($calls as $action => $call) {
            $stale = $action === 'resend' ? User::factory()->invited()->create() : User::factory()->create();
            // L'admin l'ha appena spostata a Milano: l'istanza in memoria è ancora nella sede del responsabile
            User::query()->whereKey($stale->id)->update(['location_id' => $this->milano->id]);

            try {
                $call($stale);
                $this->fail("{$action}: expected ConflictHttpException");
            } catch (ConflictHttpException $exception) {
                $this->assertSame(__('users.state_changed'), $exception->getMessage());
            }

            $this->assertSame(Role::Employee, $stale->fresh()?->role);
        }

        $this->assertDatabaseCount('user_history', 0);
        Mail::assertNothingQueued();
    }

    public function test_a_manager_moved_meanwhile_gets_a_conflict_too(): void
    {
        $employee = User::factory()->create();
        User::query()->whereKey($this->manager->id)->update(['location_id' => $this->milano->id]);

        try {
            app(UserManagementService::class)->disable($employee, $this->manager, request(), false);
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException $exception) {
            $this->assertSame(__('users.state_changed'), $exception->getMessage());
        }

        $this->assertSame(UserStatus::Active, $employee->fresh()?->status);
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/LocationVisibilityTest.php`
Expected: FAIL. Il responsabile vede anche le persone di Milano e riceve 200/403 invece di 404.

- [ ] **Step 3: Scope**

`app/Models/User.php`: aggiungi `use Illuminate\Database\Eloquent\Builder;` e:

```php
    /**
     * Persone che chi agisce può vedere e gestire (spec §4.1): l'admin tutte, il responsabile quelle della sua sede,
     * il dipendente nessuna.
     *
     * @param  Builder<self>  $query
     */
    public function scopeVisibleTo(Builder $query, User $actor): void
    {
        if ($actor->isAdmin()) {
            return;
        }

        if ($actor->role === Role::Manager) {
            $query->where('location_id', $actor->location_id);

            return;
        }

        $query->whereRaw('1 = 0');
    }
```

- [ ] **Step 4: Risoluzione di `{user}`**

`app/Providers/AppServiceProvider.php`: aggiungi `use App\Models\User;`, `use Illuminate\Support\Facades\Gate;`, `use Illuminate\Support\Facades\Route;` e in fondo a `boot()`:

```php
        // `{user}` nell'indirizzo: per chi gestisce gli utenti si cerca solo tra le persone che può vedere (spec §4.1),
        // così una persona di un'altra sede è 404 su ogni rotta, presente e futura. `auth:sanctum` gira prima della
        // risoluzione dei parametri (priorità dei middleware di Laravel). Il dipendente riceve il 403 della policy
        Route::bind('user', function (string $value): User {
            $actor = request()->user();
            $query = $actor instanceof User && Gate::forUser($actor)->allows('viewAny', User::class)
                ? User::query()->visibleTo($actor)
                : User::query();

            return $query->findOrFail($value);
        });
```

- [ ] **Step 5: Policy**

`app/Policies/UserPolicy.php`: aggiorna il commento della classe ("…tranne gli admin e le persone delle altre sedi…") e sostituisci `changeRole()` e `mayActOn()`:

```php
    public function changeRole(User $actor, User $target): bool
    {
        // Il ruolo admin si gestisce solo dalla sezione amministratori
        return $this->mayActOn($actor, $target) && ! $actor->is($target) && ! $target->isAdmin();
    }
```

```php
    /**
     * L'admin agisce su chiunque. Il responsabile solo su chi non è admin ed è nella sua sede (spec §4.1): confronta
     * le sedi già caricate, nessuna query.
     */
    private function mayActOn(User $actor, User $target): bool
    {
        if (! $this->managesUsers($actor)) {
            return false;
        }

        return $actor->isAdmin() || (! $target->isAdmin() && $actor->location_id === $target->location_id);
    }
```

- [ ] **Step 6: Lista e conteggi**

`app/Http/Controllers/Admin/UserController.php`, `index()`: la query base parte da chi agisce.

```php
        $base = User::query()
            ->visibleTo($this->actor($request))
            ->where('role', '!=', Role::Admin)
            ->when($role !== null, fn (Builder $query) => $query->where('role', $role));
```

Aggiorna il commento sopra: "Solo le persone che chi agisce può vedere (la sua sede per il responsabile); gli admin non sono mai in questa lista…".

- [ ] **Step 7: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Users`
Expected: PASS, compresa la matrice esistente di `UserPermissionsTest` (tutti nella principale).

- [ ] **Step 8: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app/Models/User.php app/Providers/AppServiceProvider.php app/Policies/UserPolicy.php app/Http/Controllers/Admin/UserController.php tests/Feature/Users/LocationVisibilityTest.php --format agent`, `sail bin pint --test`.
Expected: tutto verde.

- [ ] **Step 9: Commit**

```bash
git add apps/laravel/app/Models/User.php apps/laravel/app/Providers/AppServiceProvider.php apps/laravel/app/Policies/UserPolicy.php apps/laravel/app/Http/Controllers/Admin/UserController.php apps/laravel/tests/Feature/Users/LocationVisibilityTest.php
git commit -m "feat(utenti): il responsabile vede e gestisce solo la sua sede"
```

---

## Task 6: Utenti — sede e tipo nell'invito, nella modifica, nella lista e nell'utente corrente

**Files:**
- Create: `apps/laravel/app/Support/UserChanges.php`, `apps/laravel/app/Support/InternRule.php`, `apps/laravel/app/Http/Requests/Concerns/ChoosesLocationAndType.php`, `apps/laravel/lang/it/locations.php`, `apps/laravel/lang/en/locations.php`
- Modify: `apps/laravel/app/Enums/AdminChange.php`, `apps/laravel/app/Enums/UserSort.php`
- Modify: `apps/laravel/app/Services/InvitationService.php`, `apps/laravel/app/Services/UserManagementService.php`
- Modify: `apps/laravel/app/Http/Requests/Users/{StoreUserRequest,UpdateUserRequest,InviteAdminRequest,ListUsersRequest}.php`
- Modify: `apps/laravel/app/Http/Controllers/Admin/{UserController,AdministratorController,UserRoleController,UserStatusController}.php`, `apps/laravel/app/Http/Controllers/Auth/{CurrentUserController,ProfileController,TwoFactorChallengeController}.php`
- Modify: `apps/laravel/app/Policies/UserPolicy.php` (`changeLocation`, `manageSchedule`, `viewHistory`)
- Modify: `apps/laravel/app/Http/Resources/{ManagedUserResource,UserResource,CurrentUserResource}.php`
- Modify: `apps/laravel/lang/{it,en}/users.php`
- Modify (test esistenti): `tests/Feature/Users/UserIndexTest.php`, `tests/Feature/Users/UserPermissionsTest.php`, `tests/Feature/Users/UserModelTest.php`, `tests/Feature/Users/UpdateUserTest.php`, `tests/Feature/Users/InviteAdminTest.php`, `tests/Feature/Users/AdminChangeMailTest.php`
- Test: `apps/laravel/tests/Feature/Users/LocationAndTypeTest.php`

**Interfaces:**
- Consumes: `Location`, `Location::primary()`, `User::at()` (Task 1); `EmploymentType`, `User::isIntern()` (Task 2); `UserHistoryRecorder::employmentTypeChanged()` e `locationChanged()` (Task 3); `visibleTo` e `mayActOn` con la sede (Task 5).
- Produces:
  - `App\Support\UserChanges` e `UserManagementService::update(User $target, UserChanges $changes, User $actor, Request $request, bool $passwordConfirmed = false): User` (contratto);
  - `InvitationService::invite(…, Role $role, EmploymentType $employmentType, Location $location, User $inviter, Request $request)`, `InvitationService::inviteAdmin(…, string $email, EmploymentType $employmentType, Location $location, User $inviter, Request $request)`, `UserManagementService::inviteAdmin(…, string $email, EmploymentType $employmentType, Location $location, User $actor, Request $request)`;
  - `App\Support\InternRule::ensureAllowed(EmploymentType $type, Role $role, string $field): void` (422 `users.intern_role` sul campo indicato);
  - trait `ChoosesLocationAndType` per le request: `locationAndTypeRules()`, `locationMessages()`, `chosenEmploymentType(): ?EmploymentType`, `chosenLocationId(): ?int`, `invitationLocation(User $actor): Location`;
  - `UserPolicy::changeLocation()`, `manageSchedule()` (solo admin) e `viewHistory()` (= `mayActOn`), usate dai Task 8 e 9;
  - JSON: `ManagedUserResource` con chiavi, in quest'ordine, `id, first_name, last_name, name, email, role, role_label, employment_type, employment_type_label, status, status_label, location, invitation_expires_at, is_current_user, can`, e in `can` anche `change_location`, `manage_schedule`, `view_history`; `UserResource` con `employment_type`, `employment_type_label` dopo `role_label` e `location` dopo `status` (solo se caricata); `CurrentUserResource` con `meta.multiple_locations`;
  - lista: `filter[employment_type]` per admin e responsabile, `filter[location]` e `sort=location|-location` solo admin (dal responsabile 422);
  - `AdminChange::LocationChanged`, `AdminChange::EmploymentTypeChanged` con oggetto e testo dell'email;
  - `lang/{it,en}/locations.php` con la chiave `archived`, che il Task 7 estende.
- **Decisione di implementazione:** la regola sugli stagisti la controllano solo i servizi, sulle righe rilette sotto blocco: un'unica verifica, anche contro i cambi paralleli. Il campo dell'errore 422 dipende dal flusso:
  - `role` nell'invito normale e nel cambio ruolo;
  - `employment_type` nell'invito admin e nella modifica;
  - `user_id` nella promozione ad admin.
- **`location` nelle resource:** è `whenLoaded`. Ogni controller che restituisce un utente carica `location` (`load`/`loadMissing`), così `toArray()` non fa query.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/LocationAndTypeTest.php` (gli utenti delle factory hanno lingua `it`: le risposte sono in italiano):

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Mail\AdminChangeMail;
use App\Models\AuthEvent;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Sede e tipo di rapporto nell'invito, nella modifica, nella lista e nell'utente corrente (spec §4.5, §4.6, §7).
 */
class LocationAndTypeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
    }

    public function test_an_admin_invites_into_a_chosen_location_with_a_type(): void
    {
        $this->invite($this->admin, ['location_id' => $this->milano->id, 'employment_type' => 'contractor'])
            ->assertCreated()
            ->assertJsonPath('data.location', ['id' => $this->milano->id, 'name' => 'Milano'])
            ->assertJsonPath('data.employment_type', 'contractor')
            ->assertJsonPath('data.employment_type_label', 'Collaboratore esterno');

        $invited = User::query()->where('email', 'sara@example.test')->sole();
        $this->assertSame($this->milano->id, $invited->location_id);
        $this->assertSame(
            ['role' => 'employee', 'employment_type' => 'contractor', 'location_id' => $this->milano->id],
            UserHistory::query()->where('user_id', $invited->id)->sole()->context,
        );
    }

    public function test_without_a_location_the_invitation_goes_to_the_primary_one_never_to_an_archived_one(): void
    {
        $this->invite($this->admin)
            ->assertCreated()
            ->assertJsonPath('data.location.id', Location::primary()->id)
            ->assertJsonPath('data.employment_type', 'employee');

        $archived = Location::factory()->archived()->create();
        $this->invite($this->admin, ['email' => 'altra@example.test', 'location_id' => $archived->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
    }

    public function test_a_manager_invites_only_into_their_own_location(): void
    {
        $manager = User::factory()->manager()->at($this->milano)->create();

        $this->invite($manager)->assertCreated()->assertJsonPath('data.location.id', $this->milano->id);
        $this->invite($manager, ['email' => 'altra@example.test', 'location_id' => Location::primary()->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
    }

    public function test_an_intern_can_only_have_the_base_role(): void
    {
        $this->invite($this->admin, ['employment_type' => 'intern', 'role' => 'manager'])->assertUnprocessable()->assertJsonValidationErrors('role');
        $this->invite($this->admin, ['employment_type' => 'intern'])->assertCreated();

        $intern = User::factory()->intern()->create();
        $this->actingAs($this->admin)->patchJson("/api/users/{$intern->id}/role", ['role' => 'manager'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $intern->id, 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user_id');
        $this->actingAs($this->admin)->postJson('/api/administrators/invitations', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'employment_type' => 'intern', 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employment_type');

        $manager = User::factory()->manager()->create();
        $this->actingAs($this->admin)->patchJson("/api/users/{$manager->id}", ['first_name' => $manager->first_name, 'last_name' => $manager->last_name, 'employment_type' => 'intern'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employment_type');

        $this->assertSame(Role::Employee, $intern->fresh()?->role);
        $this->assertSame(EmploymentType::Employee, $manager->fresh()?->employment_type);
        $this->assertSame('Uno stagista può avere solo il ruolo Utente.', __('users.intern_role', [], 'it'));
    }

    public function test_an_admin_moves_a_person_and_changes_the_type_leaving_one_entry_each(): void
    {
        $employee = User::factory()->create();
        $payload = ['first_name' => $employee->first_name, 'last_name' => $employee->last_name, 'location_id' => $this->milano->id, 'employment_type' => 'contractor'];

        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", $payload)
            ->assertOk()
            ->assertJsonPath('data.location.name', 'Milano')
            ->assertJsonPath('data.employment_type', 'contractor');

        $entries = UserHistory::query()->where('user_id', $employee->id)->orderBy('id')->get();
        $this->assertSame([UserHistoryEvent::EmploymentTypeChanged, UserHistoryEvent::LocationChanged], $entries->pluck('event')->all());
        $this->assertSame([(string) Location::primary()->id, (string) $this->milano->id], [$entries[1]->old_value, $entries[1]->new_value]);
        $this->assertSame($this->admin->id, $entries[1]->actor_id);
        $this->assertEqualsCanonicalizing(['employment_type', 'location_id'], AuthEvent::query()->where('event', AuthEventType::UserUpdated)->sole()->changed_fields);

        // Stessi valori: nessuna tappa e nessun evento in più
        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", $payload)->assertOk();
        $this->assertSame(2, UserHistory::query()->where('user_id', $employee->id)->count());
        $this->assertSame(1, AuthEvent::query()->where('event', AuthEventType::UserUpdated)->count());
    }

    public function test_only_an_admin_moves_people_and_only_to_active_locations(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();
        $names = ['first_name' => 'Sara', 'last_name' => 'Colombo'];

        $this->actingAs($manager)->patchJson("/api/users/{$employee->id}", [...$names, 'location_id' => $this->milano->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", [...$names, 'location_id' => Location::factory()->archived()->create()->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
        $this->assertSame(Location::primary()->id, $employee->fresh()?->location_id);

        // Il tipo lo cambia anche il responsabile, nella sua sede
        $this->actingAs($manager)->patchJson("/api/users/{$employee->id}", [...$names, 'employment_type' => 'intern'])
            ->assertOk()
            ->assertJsonPath('data.employment_type', 'intern');
    }

    public function test_moving_another_admin_needs_the_password_and_warns_the_admins(): void
    {
        $other = User::factory()->admin()->create();
        $third = User::factory()->admin()->create();
        $payload = ['first_name' => $other->first_name, 'last_name' => $other->last_name, 'location_id' => $this->milano->id];

        $this->actingAs($this->admin)->patchJson("/api/users/{$other->id}", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->patchJson("/api/users/{$other->id}", [...$payload, 'current_password' => 'password'])->assertOk();

        foreach ([$other, $third] as $recipient) {
            Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->change === AdminChange::LocationChanged && $mail->hasTo($recipient->email));
        }

        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($this->admin->email));
    }

    public function test_the_admin_filters_and_sorts_by_location_and_everyone_filters_by_type(): void
    {
        User::factory()->at($this->milano)->contractor()->create(['last_name' => 'Bianchi']);
        $intern = User::factory()->intern()->create(['last_name' => 'Verdi']);

        $this->actingAs($this->admin)->getJson("/api/users?filter[location]={$this->milano->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.last_name', 'Bianchi');
        $this->actingAs($this->admin)->getJson('/api/users?sort=location')->assertOk()->assertJsonPath('data.0.location.name', 'Milano');
        $this->actingAs($this->admin)->getJson('/api/users?sort=-location')->assertOk()->assertJsonPath('data.0.location.name', 'Sede principale');
        $this->actingAs($this->admin)->getJson('/api/users?filter[employment_type]=intern')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $intern->id);

        $manager = User::factory()->manager()->create();
        $this->actingAs($manager)->getJson('/api/users?filter[employment_type]=intern')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($manager)->getJson("/api/users?filter[location]={$this->milano->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('filter.location');
        $this->actingAs($manager)->getJson('/api/users?sort=location')->assertUnprocessable()->assertJsonValidationErrors('sort');
    }

    public function test_each_row_says_who_may_move_people_manage_schedules_and_read_the_history(): void
    {
        User::factory()->create(['last_name' => 'Aaa']);
        $manager = User::factory()->manager()->create(['last_name' => 'Zzz']);

        $this->actingAs($this->admin)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.can.change_location', true)
            ->assertJsonPath('data.0.can.manage_schedule', true)
            ->assertJsonPath('data.0.can.view_history', true);
        $this->actingAs($manager)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.can.change_location', false)
            ->assertJsonPath('data.0.can.manage_schedule', false)
            ->assertJsonPath('data.0.can.view_history', true);
    }

    public function test_the_current_user_knows_location_type_and_whether_there_are_several_locations(): void
    {
        $user = User::factory()->contractor()->create();
        Location::query()->whereKey($this->milano->id)->update(['archived_at' => now()]);

        $this->actingAs($user)->fromFrontend()->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('data.location', ['id' => Location::primary()->id, 'name' => 'Sede principale'])
            ->assertJsonPath('data.employment_type', 'contractor')
            ->assertJsonPath('data.employment_type_label', 'Collaboratore esterno')
            ->assertJsonPath('meta.multiple_locations', false);

        // Una sede archiviata non conta: riattivata, le sedi attive diventano due
        Location::query()->whereKey($this->milano->id)->update(['archived_at' => null]);
        $this->getJson('/api/auth/user')->assertOk()->assertJsonPath('meta.multiple_locations', true);
    }

    public function test_administrators_show_their_location_and_a_new_admin_can_be_invited_elsewhere(): void
    {
        $this->actingAs($this->admin)->getJson('/api/administrators')->assertOk()->assertJsonPath('data.0.location.name', 'Sede principale');

        $this->actingAs($this->admin)->postJson('/api/administrators/invitations', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'location_id' => $this->milano->id, 'employment_type' => 'contractor', 'current_password' => 'password'])
            ->assertCreated()
            ->assertJsonPath('data.location.name', 'Milano')
            ->assertJsonPath('data.employment_type', 'contractor');
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function invite(User $actor, array $extra = []): TestResponse
    {
        return $this->actingAs($actor)->postJson('/api/users', ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara@example.test', 'role' => 'employee', ...$extra]);
    }
}
```

In `tests/Feature/Users/AdminChangeMailTest.php` aggiungi:

```php
    public function test_tells_who_moved_an_admin_or_changed_the_employment_type(): void
    {
        app()->setLocale('it');
        $mail = new AdminChangeMail(AdminChange::LocationChanged, 'Anna Admin', 'Nora Neri', now());
        $mail->assertHasSubject('Holidays: sede di un amministratore cambiata');
        $mail->assertSeeInText('Anna Admin ha spostato l’amministratore Nora Neri in un’altra sede');

        $mail = new AdminChangeMail(AdminChange::EmploymentTypeChanged, 'Anna Admin', 'Nora Neri', now());
        $mail->assertHasSubject('Holidays: tipo di rapporto di un amministratore cambiato');

        app()->setLocale('en');
        $mail = new AdminChangeMail(AdminChange::LocationChanged, 'Anna Admin', 'Nora Neri', now());
        $mail->assertHasSubject('Holidays: admin moved to another location');
        $mail->assertSeeInText('Anna Admin moved the admin Nora Neri to another location');

        $mail = new AdminChangeMail(AdminChange::EmploymentTypeChanged, 'Anna Admin', 'Nora Neri', now());
        $mail->assertHasSubject('Holidays: employment type of an admin changed');
    }
```

**Test esistenti da aggiornare** (falliscono per le firme e le chiavi nuove):
- `tests/Feature/Users/UserIndexTest.php`, `test_lists_users_with_exactly_the_managed_fields()`: l'array atteso diventa `['id', 'first_name', 'last_name', 'name', 'email', 'role', 'role_label', 'employment_type', 'employment_type_label', 'status', 'status_label', 'location', 'invitation_expires_at', 'is_current_user', 'can']`.
- `UserIndexTest` (le quattro occorrenze di `'send_password_reset' =>`) e `UserPermissionsTest` (una occorrenza): in ogni array `can` atteso aggiungi `change_location` e `manage_schedule` (`true` se chi guarda è admin, `false` se è responsabile) e `view_history` con lo stesso valore di `update`.
- `tests/Feature/Users/UserModelTest.php`, `test_resource_exposes_only_public_fields()`: l'array atteso diventa `['id', 'first_name', 'last_name', 'name', 'email', 'role', 'role_label', 'employment_type', 'employment_type_label', 'status', 'locale', 'last_login_at']` (la sede non è caricata, quindi non c'è).
- `tests/Feature/Users/UpdateUserTest.php`: ogni chiamata diretta `->update($stale, 'Sara', 'Colombo', <email>, $actor, Request::create('/')…)` diventa `->update($stale, new UserChanges('Sara', 'Colombo', <email>), $actor, Request::create('/')…)`, con `use App\Support\UserChanges;`.
- `tests/Feature/Users/InviteAdminTest.php`: `->invite('Nora', 'Neri', 'nora@example.test', Role::X, $actor, …)` diventa `->invite('Nora', 'Neri', 'nora@example.test', Role::X, EmploymentType::Employee, Location::primary(), $actor, …)`; `->inviteAdmin('Nora', 'Neri', 'nora@example.test', $actor, …)` diventa `->inviteAdmin('Nora', 'Neri', 'nora@example.test', EmploymentType::Employee, Location::primary(), $actor, …)`, con gli import di `EmploymentType` e `Location`.

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users`
Expected: FAIL. `Class "App\Support\UserChanges" not found` e chiavi `location`/`employment_type` mancanti.

- [ ] **Step 3: Valori, regola sugli stagisti, enum e testi**

`app/Support/UserChanges.php`:

```php
<?php

namespace App\Support;

use App\Enums\EmploymentType;

/**
 * Modifica di una persona (spec §4.5, §7.3): nome e cognome sempre, il resto solo se cambia (null = invariato).
 */
final readonly class UserChanges
{
    public function __construct(
        public string $firstName,
        public string $lastName,
        public ?string $email = null,
        public ?int $locationId = null,
        public ?EmploymentType $employmentType = null,
    ) {}
}
```

`app/Support/InternRule.php`:

```php
<?php

namespace App\Support;

use App\Enums\EmploymentType;
use App\Enums\Role;
use Illuminate\Validation\ValidationException;

/**
 * Uno stagista ha solo il ruolo base "Utente" (spec §7.3). La controllano i servizi sulle righe rilette.
 */
final class InternRule
{
    /**
     * @param  string  $field  campo su cui segnalare l'errore (dipende dal flusso)
     */
    public static function ensureAllowed(EmploymentType $type, Role $role, string $field): void
    {
        if ($type === EmploymentType::Intern && $role !== Role::Employee) {
            throw ValidationException::withMessages([$field => [Translate::text('users.intern_role')]]);
        }
    }
}
```

`app/Enums/AdminChange.php`: aggiungi `case LocationChanged = 'location_changed';` e `case EmploymentTypeChanged = 'employment_type_changed';`.

`app/Enums/UserSort.php`: aggiungi `case Location = 'location';` e `case LocationDesc = '-location';` (aggiorna il commento: "la sede si ordina per nome").

`lang/it/users.php`: `'intern_role' => 'Uno stagista può avere solo il ruolo Utente.',` e, nei gruppi `mail.admin_change.subject` e `body`:

```php
                'location_changed' => 'Holidays: sede di un amministratore cambiata',
                'employment_type_changed' => 'Holidays: tipo di rapporto di un amministratore cambiato',
```

```php
                'location_changed' => ':actor ha spostato l’amministratore :target in un’altra sede il :date.',
                'employment_type_changed' => ':actor ha cambiato il tipo di rapporto dell’amministratore :target il :date.',
```

`lang/en/users.php`: `'intern_role' => 'An intern can only have the User role.',` e:

```php
                'location_changed' => 'Holidays: admin moved to another location',
                'employment_type_changed' => 'Holidays: employment type of an admin changed',
```

```php
                'location_changed' => ':actor moved the admin :target to another location on :date.',
                'employment_type_changed' => ':actor changed the employment type of the admin :target on :date.',
```

`lang/it/locations.php`:

```php
<?php

return [
    'archived' => 'La sede scelta non esiste o è archiviata.',
];
```

`lang/en/locations.php`:

```php
<?php

return [
    'archived' => 'The chosen location does not exist or is archived.',
];
```

- [ ] **Step 4: Servizi**

`app/Services/InvitationService.php`: aggiungi `use App\Enums\EmploymentType;`, `use App\Models\Location;`, `use App\Support\InternRule;`, `use Illuminate\Validation\ValidationException;` e sostituisci `invite()`, `inviteAdmin()` e `createInvited()`:

```php
    /**
     * Invito di un dipendente o di un responsabile, nella sede indicata.
     */
    public function invite(string $firstName, string $lastName, string $email, Role $role, EmploymentType $employmentType, Location $location, User $inviter, Request $request): User
    {
        // Un nuovo admin passa solo da inviteAdmin(): blocco degli admin, evento ed email agli admin dedicati
        if ($role === Role::Admin) {
            throw new InvalidArgumentException('Admins are invited only through UserManagementService::inviteAdmin().');
        }

        return $this->rejectingDuplicateEmail($email, fn (): User => DB::transaction(function () use ($firstName, $lastName, $email, $role, $employmentType, $location, $inviter, $request): User {
            $user = $this->createInvited($firstName, $lastName, $email, $role, $employmentType, $location, $inviter);
            $this->events->log(AuthEventType::InvitationSent, $request, $user, $inviter);

            return $user;
        }, self::TRANSACTION_ATTEMPTS));
    }

    /**
     * Invito di un nuovo admin (spec del 14/10, §4). Da chiamare solo da UserManagementService::inviteAdmin(),
     * che dentro la stessa transazione blocca gli admin attivi, verifica chi agisce e avvisa gli altri admin.
     */
    public function inviteAdmin(string $firstName, string $lastName, string $email, EmploymentType $employmentType, Location $location, User $inviter, Request $request): User
    {
        return DB::transaction(function () use ($firstName, $lastName, $email, $employmentType, $location, $inviter, $request): User {
            $user = $this->createInvited($firstName, $lastName, $email, Role::Admin, $employmentType, $location, $inviter);
            $this->events->log(AuthEventType::AdminInvited, $request, $user, $inviter);

            return $user;
        });
    }

    /**
     * La sede si rilegge bloccata: l'archiviazione blocca la stessa riga prima di contare le persone, quindi nessuno
     * finisce in una sede archiviata nel frattempo (spec §4.2).
     */
    private function createInvited(string $firstName, string $lastName, string $email, Role $role, EmploymentType $employmentType, Location $location, User $inviter): User
    {
        InternRule::ensureAllowed($employmentType, $role, $role === Role::Admin ? 'employment_type' : 'role');
        $lockedLocation = Location::query()->lockForUpdate()->find($location->id);

        if ($lockedLocation === null || $lockedLocation->isArchived()) {
            throw ValidationException::withMessages(['location_id' => [Translate::text('locations.archived')]]);
        }

        $user = new User;
        $user->forceFill([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'password' => null,
            'role' => $role,
            'employment_type' => $employmentType,
            'location_id' => $lockedLocation->id,
            'status' => UserStatus::Invited,
            'locale' => app()->getLocale(),
        ])->save();

        $this->send($user, $inviter);
        $this->history->invited($user, $inviter);

        return $user;
    }
```

`app/Services/UserManagementService.php`: aggiungi `use App\Enums\EmploymentType;`, `use App\Models\Location;`, `use App\Support\InternRule;`, `use App\Support\UserChanges;`.

- `changeRole()`: dopo `$this->ensureStillAllowed('changeRole', …);` aggiungi `InternRule::ensureAllowed($fresh->employment_type, $role, 'role');`.
- `grantAdmin()`: dopo il controllo `not_promotable` aggiungi `InternRule::ensureAllowed($fresh->employment_type, Role::Admin, 'user_id');`.
- `inviteAdmin()`:

```php
    public function inviteAdmin(string $firstName, string $lastName, string $email, EmploymentType $employmentType, Location $location, User $actor, Request $request): User
    {
        return $this->rejectingDuplicateEmail($email, fn (): User => DB::transaction(function () use ($firstName, $lastName, $email, $employmentType, $location, $actor, $request): User {
            $this->lockActiveAdmins($actor);
            $invited = $this->invitations->inviteAdmin($firstName, $lastName, $email, $employmentType, $location, $actor, $request);
            $this->notifyAdmins(AdminChange::Invited, $invited, $actor, notifyTarget: false);

            return $invited;
        }, self::TRANSACTION_ATTEMPTS));
    }
```

- `update()` (sostituisci metodo e docblock):

```php
    /**
     * Nome, cognome, email, sede e tipo di rapporto (spec del 14/10 §7.3, spec del 15/10 §4.5 e §7.3). L'email cambia
     * solo per un invitato: nuovo link al nuovo indirizzo. La sede la cambia solo l'admin, verso una sede attiva.
     * L'evento `user_updated` elenca i campi cambiati, mai i valori; tipo e sede lasciano anche la loro tappa.
     *
     * Un altro admin come destinatario richiede la password di chi agisce (verificata dalla request); il cambio della
     * sua email, sede o tipo avvisa gli admin.
     *
     * @param  bool  $passwordConfirmed  se la request ha verificato la password di chi agisce
     */
    public function update(User $target, UserChanges $changes, User $actor, Request $request, bool $passwordConfirmed = false): User
    {
        return $this->rejectingDuplicateEmail((string) $changes->email, fn (): User => DB::transaction(function () use ($target, $changes, $actor, $request, $passwordConfirmed): User {
            $this->lockActiveAdminIds();
            $freshActor = $this->lockUserManager($actor);
            // Invito prima dell'utente, come in accettazione, reinvio e annullamento
            Invitation::query()->where('user_id', $target->id)->lockForUpdate()->first();
            $fresh = User::query()->lockForUpdate()->findOrFail($target->id);
            $this->ensureStillAllowed('update', $actor, $freshActor, $fresh);
            $targetIsAnotherAdmin = $fresh->isAdmin() && ! $fresh->is($actor);

            // Diventato admin dopo la validazione: la password non è stata chiesta
            if ($targetIsAnotherAdmin && ! $passwordConfirmed) {
                throw new ConflictHttpException(Translate::text('users.state_changed'));
            }

            $changeEmail = $changes->email !== null && $changes->email !== $fresh->email;

            // Nel frattempo l'invito può essere stato accettato: l'email ora è quella di accesso
            if ($changeEmail && $fresh->status !== UserStatus::Invited) {
                throw ValidationException::withMessages(['email' => [Translate::text('users.email_locked')]]);
            }

            $newLocation = $this->lockNewLocation($changes->locationId, $fresh, $freshActor);
            $newType = $changes->employmentType ?? $fresh->employment_type;
            InternRule::ensureAllowed($newType, $fresh->role, 'employment_type');
            $fromLocationId = $fresh->location_id;
            $fromType = $fresh->employment_type;

            $fresh->forceFill([
                'first_name' => $changes->firstName,
                'last_name' => $changes->lastName,
                'employment_type' => $newType,
                ...($changeEmail ? ['email' => $changes->email] : []),
                ...($newLocation !== null ? ['location_id' => $newLocation->id] : []),
            ]);
            $changedFields = array_keys($fresh->getDirty());

            if ($changedFields === []) {
                return $fresh;
            }

            $fresh->save();
            $this->events->log(AuthEventType::UserUpdated, $request, $fresh, $actor, $changedFields);
            $this->history->employmentTypeChanged($fresh, $fromType, $newType, $actor);
            $this->history->locationChanged($fresh, $fromLocationId, $fresh->location_id, $actor);

            if ($changeEmail) {
                $this->invitations->send($fresh, $actor);
                $this->events->log(AuthEventType::InvitationSent, $request, $fresh, $actor);

                // Il link d'invito di un admin ora va a un altro indirizzo: gli altri admin lo devono sapere
                if ($fresh->isAdmin()) {
                    $this->notifyAdmins(AdminChange::EmailChanged, $fresh, $actor, notifyTarget: false);
                }
            }

            if ($targetIsAnotherAdmin && $fromLocationId !== $fresh->location_id) {
                $this->notifyAdmins(AdminChange::LocationChanged, $fresh, $actor);
            }

            if ($targetIsAnotherAdmin && $fromType !== $newType) {
                $this->notifyAdmins(AdminChange::EmploymentTypeChanged, $fresh, $actor);
            }

            return $fresh;
        }, self::TRANSACTION_ATTEMPTS), $target->id);
    }
```

e il metodo privato:

```php
    /**
     * Nuova sede, bloccata: null se la sede non cambia. Solo l'admin sposta le persone (lo garantisce la request,
     * qui si riverifica sulla riga riletta) e solo verso una sede attiva. La sede si blocca dopo l'utente;
     * l'archiviazione blocca solo la sede e conta le persone senza bloccarle, quindi i blocchi non si incrociano.
     */
    private function lockNewLocation(?int $locationId, User $target, User $freshActor): ?Location
    {
        if ($locationId === null || $locationId === $target->location_id) {
            return null;
        }

        if (! $freshActor->isAdmin()) {
            throw new AuthorizationException(Translate::text('users.no_longer_allowed'));
        }

        $location = Location::query()->lockForUpdate()->find($locationId);

        if ($location === null || $location->isArchived()) {
            throw ValidationException::withMessages(['location_id' => [Translate::text('locations.archived')]]);
        }

        return $location;
    }
```

- [ ] **Step 5: Request**

`app/Http/Requests/Concerns/ChoosesLocationAndType.php`:

```php
<?php

namespace App\Http\Requests\Concerns;

use App\Enums\EmploymentType;
use App\Models\Location;
use App\Models\User;
use App\Support\Translate;
use Illuminate\Validation\Rule;

/**
 * Sede e tipo di rapporto nell'invito, nell'invito admin e nella modifica (spec §4.5, §7.4). La sede la sceglie solo
 * l'admin: dal responsabile il campo è vietato e la persona resta (o nasce) nella sua sede.
 */
trait ChoosesLocationAndType
{
    /**
     * @return array<string, list<mixed>>
     */
    protected function locationAndTypeRules(): array
    {
        return [
            'employment_type' => ['sometimes', Rule::enum(EmploymentType::class)],
            'location_id' => $this->actorIsAdmin()
                ? ['sometimes', 'nullable', 'integer', Rule::exists('locations', 'id')->whereNull('archived_at')]
                : ['prohibited'],
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function locationMessages(): array
    {
        return ['location_id.exists' => Translate::text('locations.archived')];
    }

    public function chosenEmploymentType(): ?EmploymentType
    {
        return $this->enum('employment_type', EmploymentType::class);
    }

    public function chosenLocationId(): ?int
    {
        return $this->filled('location_id') ? $this->integer('location_id') : null;
    }

    /**
     * Sede di un invito: quella scelta dall'admin, altrimenti la principale; per il responsabile la sua.
     */
    public function invitationLocation(User $actor): Location
    {
        if (! $actor->isAdmin()) {
            return Location::query()->findOrFail($actor->location_id);
        }

        $locationId = $this->chosenLocationId();

        return $locationId === null ? Location::primary() : Location::query()->findOrFail($locationId);
    }

    private function actorIsAdmin(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }
}
```

- `StoreUserRequest`: `use ChoosesLocationAndType, ValidatesInvitee;`; in `rules()` aggiungi `...$this->locationAndTypeRules(),`; `messages()` restituisce `[...$this->inviteeMessages(), ...$this->locationMessages()]`.
- `UpdateUserRequest`: `use ChoosesLocationAndType, ConfirmsCurrentPassword, ValidatesInvitee;`; in `rules()` aggiungi `...$this->locationAndTypeRules(),` prima della password; `messages()` come sopra.
- `InviteAdminRequest`: `use ChoosesLocationAndType, ConfirmsCurrentPassword, ValidatesInvitee;`; `rules()` con `...$this->locationAndTypeRules(),`; `messages()` come sopra (la rotta è solo admin: la sede è sempre ammessa).
- `ListUsersRequest`: aggiungi `use App\Enums\EmploymentType;`, `use App\Models\User;` e in `rules()`:

```php
            'filter.employment_type' => ['sometimes', 'nullable', Rule::enum(EmploymentType::class)],
            // Sede: solo l'admin, il responsabile vede già solo la sua (spec §4.5)
            'filter.location' => $this->actorIsAdmin() ? ['sometimes', 'nullable', 'integer'] : ['prohibited'],
            'sort' => ['sometimes', 'nullable', Rule::enum(UserSort::class)->except($this->actorIsAdmin() ? [] : [UserSort::Location, UserSort::LocationDesc])],
```

(sostituisce la riga `sort` esistente) e i metodi:

```php
    public function locationFilter(): ?int
    {
        return $this->filled('filter.location') ? $this->integer('filter.location') : null;
    }

    private function actorIsAdmin(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }
```

- [ ] **Step 6: Policy e resource**

`app/Policies/UserPolicy.php`, dopo `update()`:

```php
    /**
     * Spostare una persona di sede: solo l'admin (spec §4.5).
     */
    public function changeLocation(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Orario personale: solo l'admin (spec §4.4).
     */
    public function manageSchedule(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Storico di una persona: chi può agire su di lei (spec §8.3).
     */
    public function viewHistory(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }
```

`app/Http/Resources/ManagedUserResource.php`: aggiungi `use App\Models\Location;` e sostituisci l'array di `toArray()` e `permissions()`:

```php
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'employment_type' => $this->employment_type->value,
            'employment_type_label' => $this->employment_type->label(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            // Caricata dai controller: nessuna query qui
            'location' => $this->whenLoaded('location', fn (Location $location): array => ['id' => $location->id, 'name' => $location->name]),
            'invitation_expires_at' => $invitation?->expires_at->toIso8601String(),
            'is_current_user' => $request->user()?->getAuthIdentifier() === $this->id,
            'can' => $this->permissions($request),
        ];
```

```php
    /**
     * Calcolate dalla policy su ruoli e sedi già caricati: nessuna query per riga.
     *
     * @return array{resend_invitation: bool, cancel_invitation: bool, change_role: bool, disable: bool, enable: bool, update: bool, send_password_reset: bool, change_location: bool, manage_schedule: bool, view_history: bool}
     */
    private function permissions(Request $request): array
    {
        $gate = Gate::forUser($request->user());

        return [
            'resend_invitation' => $gate->allows('resendInvitation', $this->resource),
            'cancel_invitation' => $gate->allows('cancelInvitation', $this->resource),
            'change_role' => $gate->allows('changeRole', $this->resource),
            'disable' => $gate->allows('disable', $this->resource),
            'enable' => $gate->allows('enable', $this->resource),
            'update' => $gate->allows('update', $this->resource),
            'send_password_reset' => $gate->allows('sendPasswordReset', $this->resource),
            'change_location' => $gate->allows('changeLocation', $this->resource),
            'manage_schedule' => $gate->allows('manageSchedule', $this->resource),
            'view_history' => $gate->allows('viewHistory', $this->resource),
        ];
    }
```

`app/Http/Resources/UserResource.php`: aggiungi `use App\Models\Location;` e

```php
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'employment_type' => $this->employment_type->value,
            'employment_type_label' => $this->employment_type->label(),
            'status' => $this->status->value,
            'location' => $this->whenLoaded('location', fn (Location $location): array => ['id' => $location->id, 'name' => $location->name]),
            'locale' => $this->locale,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
        ];
```

`app/Http/Resources/CurrentUserResource.php`: aggiungi `use App\Models\Location;` e in `with()`, accanto a `session`:

```php
                // Con una sola sede attiva la SPA nasconde colonne, filtri e campi Sede (spec §5.5): una query per risposta
                'multiple_locations' => Location::query()->active()->count() > 1,
```

- [ ] **Step 7: Controller**

`app/Http/Controllers/Admin/UserController.php` (aggiungi `use App\Enums\EmploymentType;`, `use App\Models\Location;`, `use App\Support\UserChanges;`):

- `index()`: leggi `$type = $request->enum('filter.employment_type', EmploymentType::class);` e `$locationId = $request->locationFilter();`; la query base diventa

```php
        $base = User::query()
            ->visibleTo($this->actor($request))
            ->where('role', '!=', Role::Admin)
            ->when($role !== null, fn (Builder $query) => $query->where('role', $role))
            ->when($type !== null, fn (Builder $query) => $query->where('employment_type', $type))
            ->when($locationId !== null, fn (Builder $query) => $query->where('location_id', $locationId));
```

  e la lista carica `->with(['invitation', 'location'])` al posto di `->with('invitation')`.
- `store()`:

```php
    public function store(StoreUserRequest $request, InvitationService $invitations): JsonResponse
    {
        $actor = $this->actor($request);
        $user = $invitations->invite(
            $request->string('first_name')->value(),
            $request->string('last_name')->value(),
            $request->string('email')->value(),
            $request->enum('role', Role::class) ?? Role::Employee,
            $request->chosenEmploymentType() ?? EmploymentType::Employee,
            $request->invitationLocation($actor),
            $actor,
            $request,
        );

        return (new ManagedUserResource($user->load(['invitation', 'location'])))->response()->setStatusCode(Response::HTTP_CREATED);
    }
```

- `update()`:

```php
    public function update(UpdateUserRequest $request, User $user, UserManagementService $users): ManagedUserResource
    {
        $updated = $users->update(
            $user,
            new UserChanges(
                firstName: $request->string('first_name')->value(),
                lastName: $request->string('last_name')->value(),
                email: $request->newEmail(),
                locationId: $request->chosenLocationId(),
                employmentType: $request->chosenEmploymentType(),
            ),
            $this->actor($request),
            $request,
            passwordConfirmed: $request->targetIsAnotherAdmin(),
        );

        return new ManagedUserResource($updated->load(['invitation', 'location']));
    }
```

- `applySort()`:

```php
    /**
     * @param  Builder<User>  $query
     */
    private function applySort(Builder $query, UserSort $sort): void
    {
        $column = $sort->column();
        $ranks = self::RANKS[$column] ?? null;

        if ($column === 'location') {
            // Per nome della sede, poi come l'ordinamento predefinito
            $query->orderBy(Location::query()->select('name')->whereColumn('locations.id', 'users.location_id'), $sort->direction())
                ->orderBy('last_name')
                ->orderBy('first_name');
        } elseif ($ranks === null) {
            $query->orderBy($column, $sort->direction());

            // A parità di cognome conta il nome e viceversa (default: cognome, nome, id)
            match ($column) {
                'last_name' => $query->orderBy('first_name'),
                'first_name' => $query->orderBy('last_name'),
                default => null,
            };
        } else {
            // CASE portabile tra i database, con valori e posizioni in binding
            $cases = implode(' ', array_fill(0, count($ranks), 'WHEN ? THEN ?'));
            $bindings = array_merge(...array_map(fn (string $value, int $rank): array => [$value, $rank], $ranks, array_keys($ranks)));
            $query->orderByRaw("CASE {$query->getQuery()->getGrammar()->wrap($column)} {$cases} END {$sort->direction()}", $bindings);
        }

        // Spareggio stabile per la paginazione
        $query->orderBy('id');
    }
```

`app/Http/Controllers/Admin/AdministratorController.php` (aggiungi `use App\Enums\EmploymentType;`):
- `index()`: `->with(['invitation', 'location'])`;
- `store()`: `return new ManagedUserResource($this->users->grantAdmin($target, $this->actor($request), $request)->load(['invitation', 'location']));`;
- `invite()`:

```php
    public function invite(InviteAdminRequest $request): JsonResponse
    {
        $actor = $this->actor($request);
        $invited = $this->users->inviteAdmin(
            $request->string('first_name')->value(),
            $request->string('last_name')->value(),
            $request->string('email')->value(),
            $request->chosenEmploymentType() ?? EmploymentType::Employee,
            $request->invitationLocation($actor),
            $actor,
            $request,
        );

        return (new ManagedUserResource($invited->load(['invitation', 'location'])))->response()->setStatusCode(Response::HTTP_CREATED);
    }
```

- `destroy()`: `->load(['invitation', 'location'])` sul risultato di `revokeAdmin()`.

`UserRoleController`: `->load(['invitation', 'location'])`. `UserStatusController`: `->load('location')` sul risultato di `disable()` ed `enable()`.

`app/Http/Controllers/Auth/CurrentUserController.php`:

```php
    public function __invoke(Request $request): JsonResponse
    {
        // Stato esplicito: senza, un utente appena creato risponderebbe 201
        return (new CurrentUserResource($this->actor($request)->loadMissing('location')))->response()->setStatusCode(Response::HTTP_OK);
    }
```

`ProfileController::update()`: `new CurrentUserResource($updated->loadMissing('location'))`. `TwoFactorChallengeController::completeLogin()`: `new UserResource($user->loadMissing('location'))`.

- [ ] **Step 8: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Users tests/Feature/Auth tests/Feature/Profile`
Expected: PASS.

- [ ] **Step 9: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app lang tests/Feature/Users --format agent`, `sail bin pint --test`.
Expected: tutto verde.

- [ ] **Step 10: Commit**

```bash
git add apps/laravel/app apps/laravel/lang apps/laravel/tests/Feature/Users
git commit -m "feat(utenti): sede e tipo di rapporto in invito, modifica, lista e utente corrente"
```

---
## Task 7: API delle sedi, orari della sede e calendario dell'anno

**Files:**
- Create: `apps/laravel/app/Policies/LocationPolicy.php`
- Create: `apps/laravel/app/Services/LocationService.php`, `apps/laravel/app/Services/WorkScheduleService.php`
- Create: `apps/laravel/app/Http/Requests/Concerns/ValidatesLocation.php`, `apps/laravel/app/Http/Requests/Concerns/ValidatesWeeklySchedule.php`
- Create: `apps/laravel/app/Http/Requests/Locations/{ListLocationsRequest,StoreLocationRequest,UpdateLocationRequest,AddLocationScheduleRequest,LocationCalendarRequest}.php`
- Create: `apps/laravel/app/Http/Controllers/Admin/{LocationController,LocationScheduleController,LocationCalendarController}.php`
- Create: `apps/laravel/app/Http/Resources/{LocationResource,LocationOptionResource,WorkScheduleResource,LocationCalendarResource}.php`
- Modify: `apps/laravel/app/Models/Location.php` (proprietà dei conteggi), `apps/laravel/app/Models/WorkSchedule.php` (`ownerTimezone()`), `apps/laravel/routes/api.php`, `apps/laravel/lang/{it,en}/locations.php`
- Test: `apps/laravel/tests/Feature/Locations/LocationApiTest.php`, `apps/laravel/tests/Feature/Locations/LocationScheduleApiTest.php`

**Interfaces:**
- Consumes: model e factory del Task 1; `WorkCalendar`, `WorkDay` (Task 4); `lang/*/locations.php` con `archived` (Task 6).
- Produces:
  - `LocationPolicy` con `viewAny`, `view`, `create`, `update`, tutti solo admin (il Task 8 aggiunge `manageClosures`);
  - `WorkScheduleService`: `DEFAULT_MINUTES`, `today(Location): CarbonImmutable`, `currentForLocation(Location, ?CarbonImmutable): ?WorkSchedule`, `createForLocation(Location, CarbonImmutable, list<int>): WorkSchedule`, `addForLocation(Location, CarbonImmutable, list<int>, User): WorkSchedule`, `delete(WorkSchedule, User): void` (il Task 8 aggiunge `addForUser`);
  - `LocationService`: `create`, `update`, `makePrimary`, `archive`, `restore`;
  - trait `ValidatesWeeklySchedule` (`weeklyScheduleRules()`, `checkWeeklySchedule()`, `validFrom()`, `minutesList()`), riusato dal Task 8;
  - `WorkScheduleResource` (forma del contratto, `is_started` nel fuso di chi possiede la versione) e `WorkSchedule::ownerTimezone(): string`;
  - rotte e risposte di spec §4.2 con le forme JSON del contratto. `GET /api/locations/options` risponde `{data: [{id, name, is_primary}]}` (`LocationOptionResource`). Nel dettaglio e nelle risposte delle azioni c'è `current_schedule`, nella lista no;
  - chiavi di errore `locations.primary`, `locations.has_users`, `locations.schedule_started` (409); `locations.schedule_past`, `locations.schedule_exists`, `locations.schedule_empty`, `locations.patron_invalid`, `locations.characters` (422).
- **Decisioni di implementazione:**
  - **Versione con la stessa data:** una nuova versione con la stessa `valid_from` di una esistente è `422 locations.schedule_exists` su `valid_from`. Per cambiarla si cancella quella futura e se ne crea un'altra.
  - **Calendario dell'anno:** nella risposta un giorno elenca **tutti** i suoi motivi, compreso `weekly_rest` quando c'è un altro motivo (es. Pasqua di domenica).

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Locations/LocationApiTest.php`:

```php
<?php

namespace Tests\Feature\Locations;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\LocationService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Sezione Sedi (spec §4.2): solo admin.
 */
class LocationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->admin()->create();
    }

    public function test_guests_get_401_and_non_admins_403_on_every_location_route(): void
    {
        $id = Location::factory()->create()->id;
        $routes = [
            ['GET', '/api/locations'],
            ['GET', '/api/locations/options'],
            ['POST', '/api/locations'],
            ['GET', "/api/locations/{$id}"],
            ['PATCH', "/api/locations/{$id}"],
            ['POST', "/api/locations/{$id}/primary"],
            ['POST', "/api/locations/{$id}/archive"],
            ['POST', "/api/locations/{$id}/restore"],
            ['GET', "/api/locations/{$id}/schedules"],
            ['POST', "/api/locations/{$id}/schedules"],
            ['GET', "/api/locations/{$id}/calendar?year=2026"],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $user) {
            foreach ($routes as [$method, $uri]) {
                $this->actingAs($user)->json($method, $uri)->assertForbidden();
            }
        }

        $this->actingAs($this->admin)->getJson('/api/locations/999999')->assertNotFound();
    }

    public function test_lists_active_locations_with_their_people_and_active_managers(): void
    {
        $milano = Location::factory()->create(['name' => 'Milano']);
        User::factory()->at($milano)->count(2)->create();
        User::factory()->manager()->at($milano)->create();
        User::factory()->manager()->disabled()->at($milano)->create();
        Location::factory()->archived()->create(['name' => 'Torino']);

        $this->actingAs($this->admin)->getJson('/api/locations')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Milano')
            ->assertJsonPath('data.0.users_count', 4)
            ->assertJsonPath('data.0.managers_count', 1)
            ->assertJsonPath('data.0.is_primary', false)
            ->assertJsonPath('data.1.name', 'Sede principale')
            ->assertJsonPath('data.1.is_primary', true)
            ->assertJsonPath('meta.counts', ['active' => 2, 'archived' => 1])
            ->assertJsonMissingPath('data.0.current_schedule');

        $this->actingAs($this->admin)->getJson('/api/locations?filter[status]=archived')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Torino');
        $this->actingAs($this->admin)->getJson('/api/locations?sort=-name')->assertOk()->assertJsonPath('data.0.name', 'Sede principale');
        $this->actingAs($this->admin)->getJson('/api/locations?filter[status]=deleted')->assertUnprocessable();
    }

    public function test_options_list_only_active_locations_by_name(): void
    {
        $milano = Location::factory()->create(['name' => 'Milano']);
        Location::factory()->archived()->create(['name' => 'Torino']);

        $this->actingAs($this->admin)->getJson('/api/locations/options')
            ->assertOk()
            ->assertExactJson(['data' => [
                ['id' => $milano->id, 'name' => 'Milano', 'is_primary' => false],
                ['id' => Location::primary()->id, 'name' => 'Sede principale', 'is_primary' => true],
            ]]);
    }

    public function test_a_new_location_starts_with_the_schedule_the_primary_applies_today(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-06-03 10:00:00', 'Europe/Rome'));
        WorkSchedule::factory()->forLocation(Location::primary())->validFrom('2030-01-01')->minutes([450, 450, 450, 450, 420, 0, 0])->create();

        $this->actingAs($this->admin)->postJson('/api/locations', ['name' => ' Milano ', 'city' => 'Milano', 'patron_day' => 7, 'patron_month' => 12])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Milano')
            ->assertJsonPath('data.country', 'IT')
            ->assertJsonPath('data.timezone', 'Europe/Rome')
            ->assertJsonPath('data.patron_day', 7)
            ->assertJsonPath('data.is_primary', false)
            ->assertJsonPath('data.users_count', 0)
            ->assertJsonPath('data.current_schedule.minutes', [450, 450, 450, 450, 420, 0, 0])
            ->assertJsonPath('data.current_schedule.valid_from', '2030-06-03')
            ->assertJsonPath('data.current_schedule.is_started', true);
    }

    public function test_names_are_unique_ignoring_case_archived_locations_included(): void
    {
        Location::factory()->archived()->create(['name' => 'Milano']);

        $this->actingAs($this->admin)->postJson('/api/locations', ['name' => 'MILANO'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');

        // Due richieste parallele superano entrambe la validazione: la seconda viola l'indice e diventa lo stesso 422
        try {
            app(LocationService::class)->create(['name' => 'milano'], $this->admin);
            $this->fail('Expected ValidationException');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('name', $exception->errors());
        }

        $this->assertSame(1, Location::query()->where('name', 'milano')->count());
    }

    public function test_the_patron_needs_a_day_and_a_month_that_exist_every_year(): void
    {
        $patrons = [
            ['patron_day' => 29, 'patron_month' => 2],
            ['patron_day' => 31, 'patron_month' => 4],
            ['patron_day' => 0, 'patron_month' => 12],
            ['patron_day' => 7],
            ['patron_month' => 12],
        ];

        foreach ($patrons as $index => $patron) {
            $this->actingAs($this->admin)->postJson('/api/locations', ['name' => "Sede {$index}", ...$patron])->assertUnprocessable();
        }

        $this->assertSame(1, Location::query()->count());
    }

    public function test_an_admin_renames_a_location_and_removes_its_patron(): void
    {
        $milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);

        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'Milano Centro', 'patron_day' => null, 'patron_month' => null])
            ->assertOk()
            ->assertJsonPath('data.name', 'Milano Centro')
            ->assertJsonPath('data.patron_day', null)
            ->assertJsonPath('data.patron_month', null);
        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'Sede principale'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
        // Il proprio nome, anche con maiuscole diverse, è ammesso
        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'milano centro'])->assertOk();
        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'Sede <b>'])->assertUnprocessable();
    }

    public function test_another_location_becomes_primary_but_never_an_archived_one(): void
    {
        $old = Location::primary();
        $milano = Location::factory()->create();

        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/primary")->assertOk()->assertJsonPath('data.is_primary', true);

        $this->assertTrue(Location::primary()->is($milano));
        $this->assertFalse($old->fresh()?->isPrimary());
        $this->assertSame(1, Location::query()->where('primary_marker', 1)->count());

        $archived = Location::factory()->archived()->create();
        $this->actingAs($this->admin)->postJson("/api/locations/{$archived->id}/primary")->assertConflict();
        $this->assertTrue(Location::primary()->is($milano));
    }

    public function test_a_location_is_archived_only_when_empty_and_never_if_primary(): void
    {
        Log::spy();
        $milano = Location::factory()->create();
        $invited = User::factory()->at($milano)->invited()->create();

        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/archive")
            ->assertConflict()
            ->assertJsonPath('message', __('locations.has_users', [], 'it'));

        $invited->delete();
        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/archive")
            ->assertOk()
            ->assertJsonPath('data.archived_at', fn (?string $archivedAt): bool => $archivedAt !== null);
        $this->actingAs($this->admin)->postJson('/api/locations/'.Location::primary()->id.'/archive')
            ->assertConflict()
            ->assertJsonPath('message', __('locations.primary', [], 'it'));
        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.archived_at', null);

        Log::shouldHaveReceived('info')->with('Location archived', ['location_id' => $milano->id, 'actor_id' => $this->admin->id])->once();
    }

    public function test_the_detail_shows_the_schedule_in_force_today(): void
    {
        $milano = Location::factory()->create();

        $this->actingAs($this->admin)->getJson("/api/locations/{$milano->id}")
            ->assertOk()
            ->assertJsonPath('data.current_schedule.valid_from', '2000-01-01')
            ->assertJsonPath('data.current_schedule.is_started', true);
    }
}
```

`tests/Feature/Locations/LocationScheduleApiTest.php`:

```php
<?php

namespace Tests\Feature\Locations;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Orario standard della sede e calendario dell'anno (spec §2.3, §3.2, §4.2).
 */
class LocationScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    private const WEEK = [480, 480, 480, 480, 240, 0, 0];

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        // Lunedì 3 giugno 2030, mattina a Roma
        $this->travelTo(CarbonImmutable::parse('2030-06-03 10:00:00', 'Europe/Rome'));
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);
    }

    public function test_lists_the_versions_newest_first(): void
    {
        WorkSchedule::factory()->forLocation($this->milano)->validFrom('2030-09-01')->create();

        $this->actingAs($this->admin)->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.0.valid_from', '2030-09-01')
            ->assertJsonPath('data.0.is_started', false)
            ->assertJsonPath('data.1.valid_from', '2000-01-01')
            ->assertJsonPath('data.1.is_started', true)
            ->assertJsonPath('data.1.minutes', [480, 480, 480, 480, 480, 0, 0])
            ->assertJsonPath('data.1.follows_location', false);
    }

    public function test_a_new_version_starts_today_or_later_never_in_the_past_nor_twice_on_a_day(): void
    {
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-02', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::WEEK])
            ->assertCreated()
            ->assertJsonPath('data.valid_from', '2030-06-03')
            ->assertJsonPath('data.minutes', self::WEEK)
            ->assertJsonPath('data.is_started', true);
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
    }

    public function test_today_is_the_day_in_the_location_time_zone(): void
    {
        // Le 22:30 UTC del 14 giugno sono già le 00:30 del 15 a Roma
        $this->travelTo(CarbonImmutable::parse('2030-06-14 22:30:00', 'UTC'));

        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-14', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-15', 'minutes' => self::WEEK])->assertCreated();
    }

    public function test_minutes_are_seven_quarter_hours_up_to_twelve_hours_with_at_least_one_working_day(): void
    {
        $invalid = [
            [480, 480, 480, 480, 480, 0],
            [721, 0, 0, 0, 0, 0, 0],
            [470, 480, 480, 480, 480, 0, 0],
            [-15, 480, 480, 480, 480, 0, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ];

        foreach ($invalid as $minutes) {
            $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-07-01', 'minutes' => $minutes])->assertUnprocessable();
        }

        $this->assertSame(1, $this->milano->schedules()->count());
    }

    public function test_only_future_versions_of_this_location_can_be_deleted(): void
    {
        $future = WorkSchedule::factory()->forLocation($this->milano)->validFrom('2030-09-01')->create();
        $started = $this->milano->schedules()->where('valid_from', '2000-01-01')->sole();
        $elsewhere = WorkSchedule::factory()->forLocation(Location::factory()->create())->validFrom('2030-09-01')->create();

        $this->actingAs($this->admin)->deleteJson($this->url($started->id))->assertConflict();
        $this->actingAs($this->admin)->deleteJson($this->url($elsewhere->id))->assertNotFound();
        $this->actingAs($this->admin)->deleteJson($this->url($future->id))->assertNoContent();

        $this->assertModelMissing($future);
        $this->assertModelExists($started);
    }

    public function test_the_calendar_lists_the_non_working_days_of_the_year_with_their_labels(): void
    {
        $response = $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar?year=2026")
            ->assertOk()
            ->assertJsonPath('data.year', 2026)
            ->assertJsonCount(1, 'data.schedules')
            ->assertJsonPath('data.schedules.0.valid_from', '2000-01-01');

        $days = collect($response->json('data.days'))->keyBy('date');
        // 13 festivi nazionali nel 2026 più il patrono
        $this->assertCount(14, $days);
        $this->assertSame([['type' => 'national_holiday', 'label' => 'Lunedì dell’Angelo']], $days['2026-04-06']['reasons']);
        $this->assertSame([['type' => 'patron', 'label' => 'Patrono (Milano)']], $days['2026-12-07']['reasons']);
        // Pasqua è di domenica: c'è, con il riposo e il festivo; le domeniche normali no
        $this->assertSame(['weekly_rest', 'national_holiday'], array_column($days['2026-04-05']['reasons'], 'type'));
        $this->assertArrayNotHasKey('2026-10-18', $days->all());

        $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar?year=1999")->assertUnprocessable();
        $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar")->assertUnprocessable();
    }

    private function url(?int $scheduleId = null): string
    {
        return "/api/locations/{$this->milano->id}/schedules".($scheduleId === null ? '' : "/{$scheduleId}");
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Locations/LocationApiTest.php tests/Feature/Locations/LocationScheduleApiTest.php`
Expected: FAIL. Le rotte `/api/locations…` rispondono 404.

- [ ] **Step 3: Model e testi**

`app/Models/Location.php`, nel docblock della classe:

```php
 * @property-read int|null $users_count conteggio di `withCount('users')`
 * @property-read int|null $managers_count responsabili attivi, da `withCount`
```

`app/Models/WorkSchedule.php`:

```php
    /**
     * Fuso di chi possiede la versione, per "oggi" in `isStarted()`: la sede, o la sede della persona. I controller
     * impostano le relazioni prima di serializzare, così la resource non fa query.
     */
    public function ownerTimezone(): string
    {
        $location = $this->location_id !== null ? $this->location : $this->user?->location;

        return $location?->timezone ?? Location::DEFAULT_TIMEZONE;
    }
```

`lang/it/locations.php`:

```php
<?php

return [
    'archived' => 'La sede scelta non esiste o è archiviata.',
    'primary' => 'La sede principale non si può archiviare.',
    'has_users' => 'In questa sede ci sono ancora delle persone: spostale in un’altra sede prima di archiviarla.',
    'patron_invalid' => 'Il patrono deve essere un giorno che esiste ogni anno (il 29 febbraio no).',
    'characters' => 'Il testo non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
    'schedule_past' => 'Il nuovo orario può valere da oggi o da una data futura.',
    'schedule_exists' => 'C’è già un orario che parte da questa data: cancellalo prima di crearne un altro.',
    'schedule_empty' => 'Serve almeno un giorno lavorativo.',
    'schedule_started' => 'Questo orario è già in vigore e non si può più cancellare.',
];
```

`lang/en/locations.php`:

```php
<?php

return [
    'archived' => 'The chosen location does not exist or is archived.',
    'primary' => 'The primary location cannot be archived.',
    'has_users' => 'People still belong to this location: move them to another location before archiving it.',
    'patron_invalid' => 'The patron saint’s day must exist every year (not 29 February).',
    'characters' => 'The text cannot contain square brackets, < > signs or control characters.',
    'schedule_past' => 'The new schedule can start today or on a future date.',
    'schedule_exists' => 'A schedule already starts on this date: delete it before creating another one.',
    'schedule_empty' => 'At least one working day is required.',
    'schedule_started' => 'This schedule is already in force and can no longer be deleted.',
];
```

- [ ] **Step 4: Policy e servizi**

`app/Policies/LocationPolicy.php`:

```php
<?php

namespace App\Policies;

use App\Models\Location;
use App\Models\User;

/**
 * Sezione Sedi: solo l'admin (spec §1, §4.2). Orari e calendario seguono i permessi della sede.
 */
final class LocationPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function view(User $actor, Location $location): bool
    {
        return $actor->isAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function update(User $actor, Location $location): bool
    {
        return $actor->isAdmin();
    }
}
```

`app/Services/WorkScheduleService.php`:

```php
<?php

namespace App\Services;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Versioni dell'orario (spec §2.3): una nuova vale da oggi o da una data futura, nel fuso della sede; quelle già
 * iniziate non si toccano, quelle future si cancellano.
 */
final class WorkScheduleService
{
    /**
     * Orario di partenza se la principale non ne ha: lunedì-venerdì, 8 ore.
     *
     * @var list<int>
     */
    public const DEFAULT_MINUTES = [480, 480, 480, 480, 480, 0, 0];

    public function today(Location $location): CarbonImmutable
    {
        return CarbonImmutable::now($location->timezone)->startOfDay();
    }

    /**
     * Versione in vigore quel giorno (oggi se non indicato); prima della prima versione vale la prima.
     */
    public function currentForLocation(Location $location, ?CarbonImmutable $day = null): ?WorkSchedule
    {
        $day ??= $this->today($location);

        return $location->schedules()->where('valid_from', '<=', $day->toDateString())->orderByDesc('valid_from')->first()
            ?? $location->schedules()->orderBy('valid_from')->first();
    }

    /**
     * @param  list<int>  $minutes  sette valori, lunedì primo
     */
    public function addForLocation(Location $location, CarbonImmutable $validFrom, array $minutes, User $actor): WorkSchedule
    {
        $schedule = DB::transaction(function () use ($location, $validFrom, $minutes): WorkSchedule {
            // Blocca la sede: due versioni nuove in parallelo non scelgono la stessa data
            $locked = Location::query()->lockForUpdate()->findOrFail($location->id);
            $this->ensureValidFrom($validFrom, $this->today($locked), $locked->schedules()->where('valid_from', $validFrom->toDateString())->exists());

            return $this->createForLocation($locked, $validFrom, $minutes);
        });

        Log::info('Location schedule added', ['location_id' => $location->id, 'schedule_id' => $schedule->id, 'valid_from' => $validFrom->toDateString(), 'actor_id' => $actor->id]);

        return $schedule;
    }

    /**
     * Senza i controlli sulla data: per l'orario iniziale di una sede appena creata.
     *
     * @param  list<int>  $minutes
     */
    public function createForLocation(Location $location, CarbonImmutable $validFrom, array $minutes): WorkSchedule
    {
        $schedule = new WorkSchedule;
        $schedule->forceFill([
            'location_id' => $location->id,
            'user_id' => null,
            'valid_from' => $validFrom->toDateString(),
            'follows_location' => false,
            ...$this->minuteColumns($minutes),
        ])->save();

        return $schedule;
    }

    /**
     * Solo le versioni future (409 se è già in vigore), della sede o della persona.
     */
    public function delete(WorkSchedule $schedule, User $actor): void
    {
        DB::transaction(function () use ($schedule): void {
            $locked = WorkSchedule::query()->lockForUpdate()->findOrFail($schedule->id);

            if ($locked->isStarted(CarbonImmutable::now($locked->ownerTimezone()))) {
                throw new ConflictHttpException(Translate::text('locations.schedule_started'));
            }

            $locked->delete();
        });

        Log::info('Work schedule deleted', ['schedule_id' => $schedule->id, 'location_id' => $schedule->location_id, 'user_id' => $schedule->user_id, 'actor_id' => $actor->id]);
    }

    /**
     * La request controlla già la data: qui si riverifica sulle righe bloccate.
     */
    private function ensureValidFrom(CarbonImmutable $validFrom, CarbonImmutable $today, bool $taken): void
    {
        if ($validFrom->toDateString() < $today->toDateString()) {
            throw ValidationException::withMessages(['valid_from' => [Translate::text('locations.schedule_past')]]);
        }

        if ($taken) {
            throw ValidationException::withMessages(['valid_from' => [Translate::text('locations.schedule_exists')]]);
        }
    }

    /**
     * @param  list<int>  $minutes
     * @return array<string, int>
     */
    private function minuteColumns(array $minutes): array
    {
        if (count($minutes) !== count(WorkSchedule::DAYS) || array_sum($minutes) === 0) {
            throw new InvalidArgumentException('A schedule needs seven values and at least one working day.');
        }

        return array_combine(array_map(fn (string $day): string => "{$day}_minutes", WorkSchedule::DAYS), $minutes);
    }
}
```

`app/Services/LocationService.php`:

```php
<?php

namespace App\Services;

use App\Models\Location;
use App\Models\User;
use App\Support\Translate;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Sedi (spec §2.1, §4.2): sempre una e una sola principale, si archiviano solo vuote. Ogni modifica finisce nel log
 * applicativo (non sono eventi di sicurezza, spec §4.7).
 */
final class LocationService
{
    public function __construct(private readonly WorkScheduleService $schedules) {}

    /**
     * Nuova sede in Italia, con l'orario che la principale applica oggi (valido da oggi).
     *
     * @param  array<string, mixed>  $data  nome, città e patrono validati
     */
    public function create(array $data, User $actor): Location
    {
        $location = $this->rejectingDuplicateName($data, null, fn (): Location => DB::transaction(function () use ($data): Location {
            $location = new Location;
            $location->fill($data)->forceFill([
                'country' => Location::DEFAULT_COUNTRY,
                'timezone' => Location::DEFAULT_TIMEZONE,
            ])->save();

            $template = $this->schedules->currentForLocation(Location::primary());
            $this->schedules->createForLocation($location, $this->schedules->today($location), $template?->minutes() ?? WorkScheduleService::DEFAULT_MINUTES);

            return $location;
        }));

        Log::info('Location created', ['location_id' => $location->id, 'actor_id' => $actor->id]);

        return $location;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Location $location, array $data, User $actor): Location
    {
        $updated = $this->rejectingDuplicateName($data, $location->id, fn (): Location => DB::transaction(function () use ($location, $data): Location {
            $fresh = Location::query()->lockForUpdate()->findOrFail($location->id);
            $fresh->fill($data)->save();

            return $fresh;
        }));

        Log::info('Location updated', [
            'location_id' => $location->id,
            'changed_fields' => array_values(array_diff(array_keys($updated->getChanges()), ['updated_at'])),
            'actor_id' => $actor->id,
        ]);

        return $updated;
    }

    public function makePrimary(Location $location, User $actor): Location
    {
        $primary = DB::transaction(function () use ($location): Location {
            // Vecchia e nuova principale bloccate in ordine di id: due cambi in parallelo non si incrociano
            $rows = Location::query()
                ->where(fn (Builder $query) => $query->whereKey($location->id)->orWhere('primary_marker', 1))
                ->orderBy('id')
                ->lockForUpdate()
                ->get();
            $target = $rows->firstWhere('id', $location->id) ?? Location::query()->findOrFail($location->id);

            if ($target->isArchived()) {
                throw new ConflictHttpException(Translate::text('locations.archived'));
            }

            if ($target->isPrimary()) {
                return $target;
            }

            // Prima si toglie il marcatore alla vecchia: l'indice unico non ammette due principali nemmeno per un istante
            $rows->first(fn (Location $row): bool => $row->isPrimary())?->forceFill(['primary_marker' => null])->save();
            $target->forceFill(['primary_marker' => 1])->save();

            return $target;
        });

        Log::info('Primary location changed', ['location_id' => $primary->id, 'actor_id' => $actor->id]);

        return $primary;
    }

    /**
     * La sede si blocca prima di contare le persone: un invito o uno spostamento verso questa sede (che bloccano la
     * stessa riga) non può finire in una sede appena archiviata.
     */
    public function archive(Location $location, User $actor): Location
    {
        $archived = DB::transaction(function () use ($location): Location {
            $fresh = Location::query()->lockForUpdate()->findOrFail($location->id);

            if ($fresh->isPrimary()) {
                throw new ConflictHttpException(Translate::text('locations.primary'));
            }

            // Persone in qualunque stato, invitati e disattivati compresi
            if ($fresh->users()->exists()) {
                throw new ConflictHttpException(Translate::text('locations.has_users'));
            }

            if (! $fresh->isArchived()) {
                $fresh->forceFill(['archived_at' => now()])->save();
            }

            return $fresh;
        });

        Log::info('Location archived', ['location_id' => $archived->id, 'actor_id' => $actor->id]);

        return $archived;
    }

    public function restore(Location $location, User $actor): Location
    {
        $restored = DB::transaction(function () use ($location): Location {
            $fresh = Location::query()->lockForUpdate()->findOrFail($location->id);
            $fresh->forceFill(['archived_at' => null])->save();

            return $fresh;
        });

        Log::info('Location restored', ['location_id' => $restored->id, 'actor_id' => $actor->id]);

        return $restored;
    }

    /**
     * Due richieste con lo stesso nome superano entrambe `unique`: la seconda viola l'indice. Fuori dalla transazione
     * diventa lo stesso 422 su `name` della validazione, come per l'email degli utenti.
     *
     * @template TResult
     *
     * @param  array<string, mixed>  $data
     * @param  Closure(): TResult  $callback
     * @return TResult
     */
    private function rejectingDuplicateName(array $data, ?int $ignoreId, Closure $callback): mixed
    {
        try {
            return $callback();
        } catch (UniqueConstraintViolationException $exception) {
            if (is_string($data['name'] ?? null)) {
                Validator::make(['name' => $data['name']], ['name' => [Rule::unique('locations', 'name')->ignore($ignoreId)]])->validate();
            }

            throw $exception;
        }
    }
}
```

- [ ] **Step 5: Request**

`app/Http/Requests/Concerns/ValidatesLocation.php`:

```php
<?php

namespace App\Http\Requests\Concerns;

use App\Models\Location;
use App\Support\PersonRules;
use App\Support\Translate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Nome, città e patrono di una sede (spec §2.1): nome unico senza distinzione di maiuscole (anche tra le archiviate),
 * patrono come giorno e mese insieme, in una data che esiste ogni anno.
 */
trait ValidatesLocation
{
    /**
     * Niente spazi ai lati; la città vuota diventa null.
     */
    protected function normalizeLocation(): void
    {
        $values = [];

        foreach (['name', 'city'] as $field) {
            $value = $this->input($field);

            if (is_string($value)) {
                $trimmed = trim($value);
                $values[$field] = $field === 'city' && $trimmed === '' ? null : $trimmed;
            }
        }

        $this->merge($values);
    }

    /**
     * @return array<string, list<mixed>>
     */
    protected function locationRules(?int $ignoreId): array
    {
        return [
            'name' => [$ignoreId === null ? 'required' : 'sometimes', 'string', 'max:'.Location::NAME_MAX_LENGTH, 'not_regex:'.PersonRules::NAME_FORBIDDEN_CHARACTERS, Rule::unique('locations', 'name')->ignore($ignoreId)],
            'city' => ['sometimes', 'nullable', 'string', 'max:100', 'not_regex:'.PersonRules::NAME_FORBIDDEN_CHARACTERS],
            // Giorno e mese sempre insieme (anche per toglierlo: entrambi null)
            'patron_day' => ['nullable', 'integer', 'between:1,31', 'present_with:patron_month', 'required_with:patron_month'],
            'patron_month' => ['nullable', 'integer', 'between:1,12', 'present_with:patron_day', 'required_with:patron_day'],
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function locationFieldMessages(): array
    {
        return [
            'name.not_regex' => Translate::text('locations.characters'),
            'city.not_regex' => Translate::text('locations.characters'),
        ];
    }

    /**
     * Data valida in un anno non bisestile: il patrono deve esistere ogni anno.
     */
    protected function checkPatron(Validator $validator): void
    {
        $day = $this->input('patron_day');
        $month = $this->input('patron_month');

        if ($validator->errors()->hasAny(['patron_day', 'patron_month']) || ! is_numeric($day) || ! is_numeric($month)) {
            return;
        }

        if (! checkdate((int) $month, (int) $day, 2001)) {
            $validator->errors()->add('patron_day', Translate::text('locations.patron_invalid'));
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function locationData(): array
    {
        return $this->safe()->only(['name', 'city', 'patron_day', 'patron_month']);
    }
}
```

`app/Http/Requests/Locations/StoreLocationRequest.php`:

```php
<?php

namespace App\Http\Requests\Locations;

use App\Http\Requests\Concerns\ValidatesLocation;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreLocationRequest extends FormRequest
{
    use ValidatesLocation;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeLocation();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->locationRules(null);
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->checkPatron($validator)];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return $this->locationFieldMessages();
    }
}
```

`app/Http/Requests/Locations/UpdateLocationRequest.php`: identica a `StoreLocationRequest` tranne `rules()`, che ignora la sede stessa nell'unicità:

```php
<?php

namespace App\Http\Requests\Locations;

use App\Http\Requests\Concerns\ValidatesLocation;
use App\Models\Location;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateLocationRequest extends FormRequest
{
    use ValidatesLocation;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeLocation();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $location = $this->route('location');

        assert($location instanceof Location);

        return $this->locationRules($location->id);
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->checkPatron($validator)];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return $this->locationFieldMessages();
    }
}
```

`app/Http/Requests/Locations/ListLocationsRequest.php`:

```php
<?php

namespace App\Http\Requests\Locations;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Schede Attive / Archiviate e ordinamento per nome della lista sedi (spec §4.2). Valori non validi: 422.
 */
class ListLocationsRequest extends FormRequest
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_ARCHIVED = 'archived';

    public const SORT_NAME = 'name';

    public const SORT_NAME_DESC = '-name';

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'filter' => ['sometimes', 'array'],
            'filter.status' => ['sometimes', 'nullable', Rule::in([self::STATUS_ACTIVE, self::STATUS_ARCHIVED])],
            'sort' => ['sometimes', 'nullable', Rule::in([self::SORT_NAME, self::SORT_NAME_DESC])],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function wantsArchived(): bool
    {
        return $this->input('filter.status') === self::STATUS_ARCHIVED;
    }

    public function sortDirection(): string
    {
        return $this->input('sort') === self::SORT_NAME_DESC ? 'desc' : 'asc';
    }
}
```

`app/Http/Requests/Concerns/ValidatesWeeklySchedule.php`:

```php
<?php

namespace App\Http\Requests\Concerns;

use App\Models\WorkSchedule;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Validator;

/**
 * Una versione di orario (spec §2.3): sette valori a quarti d'ora fino a 12 ore, almeno un giorno lavorativo, da oggi
 * in poi nel fuso di chi la possiede.
 */
trait ValidatesWeeklySchedule
{
    /**
     * @return array<string, list<string>>
     */
    protected function weeklyScheduleRules(): array
    {
        return [
            'valid_from' => ['required', 'date_format:Y-m-d'],
            'minutes' => ['required', 'array', 'list', 'size:'.count(WorkSchedule::DAYS)],
            'minutes.*' => ['required', 'integer', 'between:0,'.WorkSchedule::MAX_DAILY_MINUTES, 'multiple_of:'.WorkSchedule::MINUTE_STEP],
        ];
    }

    protected function checkWeeklySchedule(Validator $validator, string $timezone, bool $requireWorkingDay): void
    {
        $validFrom = $this->input('valid_from');

        if (! $validator->errors()->has('valid_from') && is_string($validFrom) && $validFrom < CarbonImmutable::now($timezone)->toDateString()) {
            $validator->errors()->add('valid_from', Translate::text('locations.schedule_past'));
        }

        if ($requireWorkingDay && ! $validator->errors()->hasAny(['minutes', 'minutes.*']) && array_sum($this->minutesList()) === 0) {
            $validator->errors()->add('minutes', Translate::text('locations.schedule_empty'));
        }
    }

    public function validFrom(): CarbonImmutable
    {
        return CarbonImmutable::parse($this->string('valid_from')->value())->startOfDay();
    }

    /**
     * @return list<int>
     */
    public function minutesList(): array
    {
        return array_values(array_map(intval(...), $this->array('minutes')));
    }
}
```

`app/Http/Requests/Locations/AddLocationScheduleRequest.php`:

```php
<?php

namespace App\Http\Requests\Locations;

use App\Http\Requests\Concerns\ValidatesWeeklySchedule;
use App\Models\Location;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class AddLocationScheduleRequest extends FormRequest
{
    use ValidatesWeeklySchedule;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->weeklyScheduleRules();
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $location = $this->route('location');

            assert($location instanceof Location);

            $this->checkWeeklySchedule($validator, $location->timezone, requireWorkingDay: true);
        }];
    }
}
```

`app/Http/Requests/Locations/LocationCalendarRequest.php`:

```php
<?php

namespace App\Http\Requests\Locations;

use App\Support\Holidays\HolidayCalendar;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class LocationCalendarRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'year' => ['required', 'integer', 'between:'.HolidayCalendar::MIN_YEAR.','.HolidayCalendar::MAX_YEAR],
        ];
    }
}
```

- [ ] **Step 6: Resource**

`app/Http/Resources/WorkScheduleResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una versione di orario. `is_started` vale "oggi" nel fuso di chi la possiede (relazioni impostate dal controller).
 *
 * @mixin WorkSchedule
 */
final class WorkScheduleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'valid_from' => $this->valid_from->toDateString(),
            'follows_location' => $this->follows_location,
            'minutes' => $this->minutes(),
            'is_started' => $this->isStarted(CarbonImmutable::now($this->ownerTimezone())),
        ];
    }
}
```

`app/Http/Resources/LocationResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Models\Location;
use App\Models\WorkSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Sede vista dall'admin. Conteggi da `withCount`/`loadCount`; `current_schedule` solo nel dettaglio.
 *
 * @mixin Location
 */
final class LocationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'city' => $this->city,
            'country' => $this->country,
            'timezone' => $this->timezone,
            'patron_day' => $this->patron_day,
            'patron_month' => $this->patron_month,
            'is_primary' => $this->isPrimary(),
            'archived_at' => $this->archived_at?->toIso8601String(),
            'users_count' => (int) $this->users_count,
            'managers_count' => (int) $this->managers_count,
            'current_schedule' => $this->whenLoaded('currentSchedule', fn (WorkSchedule $schedule): WorkScheduleResource => new WorkScheduleResource($schedule)),
        ];
    }
}
```

`app/Http/Resources/LocationOptionResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Models\Location;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Sede nelle select di invito e modifica.
 *
 * @mixin Location
 */
final class LocationOptionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'is_primary' => $this->isPrimary(),
        ];
    }
}
```

`app/Http/Resources/LocationCalendarResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Models\WorkSchedule;
use App\Support\WorkDay;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Calendario dell'anno di una sede (spec §3.2): versioni dell'orario in vigore nell'anno e giorni non lavorativi
 * diversi dal solo riposo settimanale, ciascuno con tutti i suoi motivi.
 *
 * @property array{year: int, schedules: Collection<int, WorkSchedule>, days: list<WorkDay>} $resource
 */
final class LocationCalendarResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'year' => $this->resource['year'],
            'schedules' => WorkScheduleResource::collection($this->resource['schedules']),
            'days' => array_map(fn (WorkDay $day): array => [
                'date' => $day->date->toDateString(),
                'reasons' => array_map(fn (array $reason): array => ['type' => $reason['type']->value, 'label' => $reason['label']], $day->reasons),
            ], $this->resource['days']),
        ];
    }
}
```

- [ ] **Step 7: Controller e rotte**

`app/Http/Controllers/Admin/LocationController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\ListLocationsRequest;
use App\Http\Requests\Locations\StoreLocationRequest;
use App\Http\Requests\Locations\UpdateLocationRequest;
use App\Http\Resources\LocationOptionResource;
use App\Http\Resources\LocationResource;
use App\Models\Location;
use App\Services\LocationService;
use App\Services\WorkScheduleService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sezione Sedi (spec §4.2, §5.2): solo admin, lo garantiscono le rotte con LocationPolicy.
 */
final class LocationController extends Controller
{
    private const PER_PAGE = 25;

    /**
     * Le sedi sono poche: le select ne ricevono al massimo 500.
     */
    private const OPTIONS_LIMIT = 500;

    public function __construct(
        private readonly LocationService $locations,
        private readonly WorkScheduleService $schedules,
    ) {}

    public function index(ListLocationsRequest $request): AnonymousResourceCollection
    {
        $locations = Location::query()
            ->when(
                $request->wantsArchived(),
                fn (Builder $query) => $query->whereNotNull('archived_at'),
                fn (Builder $query) => $query->whereNull('archived_at'),
            )
            ->withCount($this->counts())
            ->orderBy('name', $request->sortDirection())
            ->orderBy('id')
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        return LocationResource::collection($locations)->additional(['meta' => ['counts' => [
            'active' => Location::query()->active()->count(),
            'archived' => Location::query()->whereNotNull('archived_at')->count(),
        ]]]);
    }

    public function options(): AnonymousResourceCollection
    {
        return LocationOptionResource::collection(Location::query()->active()->orderBy('name')->orderBy('id')->limit(self::OPTIONS_LIMIT)->get());
    }

    public function store(StoreLocationRequest $request): JsonResponse
    {
        $location = $this->locations->create($request->locationData(), $this->actor($request));

        return (new LocationResource($this->detailed($location)))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Location $location): LocationResource
    {
        return new LocationResource($this->detailed($location));
    }

    public function update(UpdateLocationRequest $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->update($location, $request->locationData(), $this->actor($request))));
    }

    public function primary(Request $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->makePrimary($location, $this->actor($request))));
    }

    public function archive(Request $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->archive($location, $this->actor($request))));
    }

    public function restore(Request $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->restore($location, $this->actor($request))));
    }

    /**
     * Persone in qualunque stato e responsabili attivi (avviso "Nessun responsabile", spec §5.2).
     *
     * @return array<int|string, mixed>
     */
    private function counts(): array
    {
        return [
            'users',
            'users as managers_count' => fn (Builder $query) => $query->where('role', Role::Manager)->where('status', UserStatus::Active),
        ];
    }

    /**
     * Conteggi e orario in vigore oggi, con la sede già impostata sulla versione (niente query nella resource).
     */
    private function detailed(Location $location): Location
    {
        $location->loadCount($this->counts());
        $schedule = $this->schedules->currentForLocation($location);
        $schedule?->setRelation('location', $location);

        return $location->setRelation('currentSchedule', $schedule);
    }
}
```

`app/Http/Controllers/Admin/LocationScheduleController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\AddLocationScheduleRequest;
use App\Http\Resources\WorkScheduleResource;
use App\Models\Location;
use App\Models\WorkSchedule;
use App\Services\WorkScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Versioni dell'orario standard di una sede (spec §4.2). `{schedule}` è risolto dentro la sede (scopeBindings).
 */
final class LocationScheduleController extends Controller
{
    public function __construct(private readonly WorkScheduleService $schedules) {}

    public function index(Location $location): AnonymousResourceCollection
    {
        $versions = $location->schedules()->orderByDesc('valid_from')->get()
            ->each(fn (WorkSchedule $schedule) => $schedule->setRelation('location', $location));

        return WorkScheduleResource::collection($versions);
    }

    public function store(AddLocationScheduleRequest $request, Location $location): JsonResponse
    {
        $schedule = $this->schedules->addForLocation($location, $request->validFrom(), $request->minutesList(), $this->actor($request));
        $schedule->setRelation('location', $location);

        return (new WorkScheduleResource($schedule))->response()->setStatusCode(HttpResponse::HTTP_CREATED);
    }

    public function destroy(Request $request, Location $location, WorkSchedule $schedule): Response
    {
        $this->schedules->delete($schedule, $this->actor($request));

        return response()->noContent();
    }
}
```

`app/Http/Controllers/Admin/LocationCalendarController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Enums\NonWorkingReason;
use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\LocationCalendarRequest;
use App\Http\Resources\LocationCalendarResource;
use App\Models\Location;
use App\Models\WorkSchedule;
use App\Services\WorkCalendar;
use App\Support\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Calendario dell'anno di una sede (spec §3.2), per controllare a colpo d'occhio festivi, patrono e chiusure.
 */
final class LocationCalendarController extends Controller
{
    public function __invoke(LocationCalendarRequest $request, Location $location, WorkCalendar $calendar): LocationCalendarResource
    {
        $year = $request->integer('year');
        $days = $calendar->forLocation($location, CarbonImmutable::parse("{$year}-01-01"), CarbonImmutable::parse("{$year}-12-31"));
        $versions = $location->schedules()->orderBy('valid_from')->get()
            ->each(fn (WorkSchedule $schedule) => $schedule->setRelation('location', $location));

        return new LocationCalendarResource([
            'year' => $year,
            'schedules' => $this->versionsIn($versions, $year),
            // Il solo riposo settimanale non si elenca: la risposta dà l'orario di ogni versione
            'days' => array_values(array_filter($days, fn (WorkDay $day): bool => collect($day->reasons)->contains(
                fn (array $reason): bool => $reason['type'] !== NonWorkingReason::WeeklyRest,
            ))),
        ]);
    }

    /**
     * Versioni in vigore almeno un giorno dell'anno. La più vecchia copre anche i giorni prima del suo inizio.
     *
     * @param  Collection<int, WorkSchedule>  $versions  ordinate per `valid_from`
     * @return Collection<int, WorkSchedule>
     */
    private function versionsIn(Collection $versions, int $year): Collection
    {
        $first = "{$year}-01-01";
        $last = "{$year}-12-31";
        $inYear = $versions->filter(function (WorkSchedule $version, int $index) use ($versions, $first, $last): bool {
            $next = $versions->get($index + 1);

            return $version->valid_from->toDateString() <= $last && ($next === null || $next->valid_from->toDateString() > $first);
        })->values();

        return $inYear->isEmpty() && $versions->isNotEmpty() ? collect([$versions->first()]) : $inYear;
    }
}
```

`routes/api.php`: aggiungi gli `use` di `LocationController`, `LocationScheduleController`, `LocationCalendarController` e `App\Models\Location`, e nel gruppo `auth:sanctum`:

```php
    // Sezione Sedi: solo admin (LocationPolicy). `options` prima di `{location}`
    Route::get('/locations', [LocationController::class, 'index'])->can('viewAny', Location::class)->name('locations.index');
    Route::get('/locations/options', [LocationController::class, 'options'])->can('viewAny', Location::class)->name('locations.options');
    Route::post('/locations', [LocationController::class, 'store'])->can('create', Location::class)->name('locations.store');
    Route::get('/locations/{location}', [LocationController::class, 'show'])->can('view', 'location')->name('locations.show');
    Route::patch('/locations/{location}', [LocationController::class, 'update'])->can('update', 'location')->name('locations.update');
    Route::post('/locations/{location}/primary', [LocationController::class, 'primary'])->can('update', 'location')->name('locations.primary');
    Route::post('/locations/{location}/archive', [LocationController::class, 'archive'])->can('update', 'location')->name('locations.archive');
    Route::post('/locations/{location}/restore', [LocationController::class, 'restore'])->can('update', 'location')->name('locations.restore');
    Route::get('/locations/{location}/schedules', [LocationScheduleController::class, 'index'])->can('view', 'location')->name('locations.schedules.index');
    Route::post('/locations/{location}/schedules', [LocationScheduleController::class, 'store'])->can('update', 'location')->name('locations.schedules.store');
    Route::delete('/locations/{location}/schedules/{schedule}', [LocationScheduleController::class, 'destroy'])
        ->can('update', 'location')->scopeBindings()->name('locations.schedules.destroy');
    Route::get('/locations/{location}/calendar', LocationCalendarController::class)->can('view', 'location')->name('locations.calendar');
```

- [ ] **Step 8: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Locations`
Expected: PASS.

- [ ] **Step 9: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app routes lang tests/Feature/Locations --format agent`, `sail bin pint --test`.
Expected: tutto verde.

- [ ] **Step 10: Commit**

```bash
git add apps/laravel/app apps/laravel/routes/api.php apps/laravel/lang apps/laravel/tests/Feature/Locations
git commit -m "feat(sedi): API delle sedi, degli orari standard e del calendario dell'anno"
```

---
## Task 8: Chiusure e orario personale

**Files:**
- Create: `apps/laravel/app/Services/ClosureService.php`
- Create: `apps/laravel/app/Http/Requests/Locations/{ListClosuresRequest,ClosureRequest}.php`, `apps/laravel/app/Http/Requests/Users/AddUserScheduleRequest.php`
- Create: `apps/laravel/app/Http/Controllers/Admin/{ClosureController,UserScheduleController}.php`
- Create: `apps/laravel/app/Http/Resources/{ClosureResource,UserSchedulesResource}.php`
- Modify: `apps/laravel/app/Policies/LocationPolicy.php` (`manageClosures`), `apps/laravel/app/Services/WorkScheduleService.php` (`addForUser`), `apps/laravel/routes/api.php`, `apps/laravel/lang/{it,en}/locations.php`
- Test: `apps/laravel/tests/Feature/Locations/ClosureApiTest.php`, `apps/laravel/tests/Feature/Users/UserScheduleApiTest.php`

**Interfaces:**
- Consumes: `Closure` e `WorkSchedule` (Task 1); risoluzione di `{user}` per sede (Task 5); `UserPolicy::manageSchedule()` (Task 6); `WorkScheduleService`, `ValidatesWeeklySchedule`, `WorkScheduleResource`, `WorkSchedule::ownerTimezone()`, chiavi `locations.*` (Task 7).
- Produces:
  - `LocationPolicy::manageClosures(User $actor): bool` (solo admin);
  - `WorkScheduleService::addForUser(User $user, CarbonImmutable $validFrom, ?array $minutes, User $actor): WorkSchedule` (`$minutes` null = `follows_location`);
  - rotte di spec §4.3 e §4.4 con le forme JSON del contratto (`ClosureResource`; `GET /api/users/{id}/schedules` → `{data: {schedules, location_schedule}}`);
  - chiavi `locations.closure_order` e `locations.closure_too_long` (422 su `ends_on`).
- **Decisioni di implementazione:**
  - **Sede di una chiusura nuova:** in `POST /api/closures` `location_id` è obbligatorio come chiave (`present`): `null` vuol dire "tutte le sedi" e va inviato esplicitamente, così una chiusura per tutti non nasce per una dimenticanza.
  - **Lista delle chiusure:** quelle che toccano l'anno (anche a cavallo di due anni), al massimo 500.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Locations/ClosureApiTest.php`:

```php
<?php

namespace Tests\Feature\Locations;

use App\Models\Closure;
use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Chiusure aziendali (spec §2.4, §4.3): solo admin.
 */
class ClosureApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
    }

    public function test_only_admins_manage_closures(): void
    {
        $closure = Closure::factory()->create();
        $routes = [
            ['GET', '/api/closures?year=2026'],
            ['POST', '/api/closures'],
            ['PATCH', "/api/closures/{$closure->id}"],
            ['DELETE', "/api/closures/{$closure->id}"],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $user) {
            foreach ($routes as [$method, $uri]) {
                $this->actingAs($user)->json($method, $uri)->assertForbidden();
            }
        }

        $this->assertModelExists($closure);
    }

    public function test_lists_the_closures_touching_a_year_for_a_location_and_for_everyone(): void
    {
        Closure::factory()->between('2026-12-28', '2027-01-03')->create(['description' => 'Natale']);
        Closure::factory()->forLocation($this->milano)->between('2026-08-10', '2026-08-14')->create(['description' => 'Estate Milano']);
        Closure::factory()->forLocation(Location::factory()->create())->between('2026-08-10', '2026-08-14')->create(['description' => 'Altrove']);
        Closure::factory()->between('2025-08-10', '2025-08-14')->create(['description' => 'Anno scorso']);

        $this->actingAs($this->admin)->getJson("/api/closures?year=2026&filter[location]={$this->milano->id}")
            ->assertOk()
            ->assertJsonPath('data.*.description', ['Estate Milano', 'Natale'])
            ->assertJsonPath('data.0.location_name', 'Milano')
            ->assertJsonPath('data.0.starts_on', '2026-08-10')
            ->assertJsonPath('data.1.location_id', null)
            ->assertJsonPath('data.1.location_name', null);
        $this->actingAs($this->admin)->getJson('/api/closures?year=2027')->assertOk()->assertJsonPath('data.*.description', ['Natale']);
        $this->actingAs($this->admin)->getJson('/api/closures?year=2026')->assertOk()->assertJsonCount(3, 'data');
        $this->actingAs($this->admin)->getJson('/api/closures')->assertUnprocessable()->assertJsonValidationErrors('year');
    }

    public function test_an_admin_creates_a_closure_for_one_location_or_explicitly_for_all(): void
    {
        $this->actingAs($this->admin)->postJson('/api/closures', ['location_id' => $this->milano->id, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-14', 'description' => ' Chiusura estiva '])
            ->assertCreated()
            ->assertJsonPath('data.location_name', 'Milano')
            ->assertJsonPath('data.description', 'Chiusura estiva')
            ->assertJsonPath('data.ends_on', '2026-08-14');
        $this->actingAs($this->admin)->postJson('/api/closures', ['location_id' => null, 'starts_on' => '2026-12-24', 'ends_on' => '2026-12-24', 'description' => 'Vigilia'])
            ->assertCreated()
            ->assertJsonPath('data.location_id', null);
        // Senza dire per quale sede: 422, mai "tutte" per sbaglio
        $this->actingAs($this->admin)->postJson('/api/closures', ['starts_on' => '2026-12-31', 'ends_on' => '2026-12-31', 'description' => 'San Silvestro'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
        // Una sede archiviata si può ancora configurare
        $this->actingAs($this->admin)->postJson('/api/closures', ['location_id' => Location::factory()->archived()->create()->id, 'starts_on' => '2026-12-31', 'ends_on' => '2026-12-31', 'description' => 'San Silvestro'])
            ->assertCreated();
    }

    public function test_a_closure_lasts_at_most_31_days_and_never_ends_before_it_starts(): void
    {
        $base = ['location_id' => null, 'description' => 'Chiusura'];

        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-01', 'ends_on' => '2026-08-31'])->assertCreated();
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-01', 'ends_on' => '2026-09-01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-09'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-10', 'description' => str_repeat('a', 101)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('description');
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-10', 'description' => 'Ponte <b>'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('description');

        $this->assertSame(1, Closure::query()->count());
    }

    public function test_an_update_keeps_what_it_does_not_change_and_checks_the_whole_interval(): void
    {
        $closure = Closure::factory()->forLocation($this->milano)->between('2026-08-10', '2026-08-14')->create();

        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['description' => 'Ferie estive'])
            ->assertOk()
            ->assertJsonPath('data.description', 'Ferie estive')
            ->assertJsonPath('data.starts_on', '2026-08-10')
            ->assertJsonPath('data.location_name', 'Milano');
        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['ends_on' => '2026-08-09'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['ends_on' => '2026-09-15'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['location_id' => null])
            ->assertOk()
            ->assertJsonPath('data.location_id', null);
    }

    public function test_an_admin_deletes_a_closure(): void
    {
        $closure = Closure::factory()->create();

        $this->actingAs($this->admin)->deleteJson("/api/closures/{$closure->id}")->assertNoContent();

        $this->assertModelMissing($closure);
    }
}
```

`tests/Feature/Users/UserScheduleApiTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Orario personale (spec §2.3, §4.4): solo admin.
 */
class UserScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    private const PART_TIME = [240, 240, 240, 0, 0, 0, 0];

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        // Lunedì 3 giugno 2030, mattina a Roma
        $this->travelTo(CarbonImmutable::parse('2030-06-03 10:00:00', 'Europe/Rome'));
        $this->admin = User::factory()->admin()->create();
        $this->employee = User::factory()->create();
    }

    public function test_the_admin_sees_personal_versions_and_the_location_schedule_in_force(): void
    {
        WorkSchedule::factory()->forUser($this->employee)->validFrom('2030-01-01')->minutes(self::PART_TIME)->create();

        $this->actingAs($this->admin)->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.schedules.0.minutes', self::PART_TIME)
            ->assertJsonPath('data.schedules.0.is_started', true)
            ->assertJsonPath('data.location_schedule.minutes', [480, 480, 480, 480, 480, 0, 0]);
    }

    public function test_a_part_time_schedule_and_then_back_to_the_location_schedule(): void
    {
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::PART_TIME])
            ->assertCreated()
            ->assertJsonPath('data.follows_location', false)
            ->assertJsonPath('data.minutes', self::PART_TIME);
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'follows_location' => true])
            ->assertCreated()
            ->assertJsonPath('data.follows_location', true)
            ->assertJsonPath('data.minutes', [0, 0, 0, 0, 0, 0, 0]);

        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'follows_location' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-02', 'minutes' => self::PART_TIME])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-10-01', 'minutes' => [0, 0, 0, 0, 0, 0, 0]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('minutes');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-10-01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('minutes');

        $this->assertSame(2, $this->employee->schedules()->count());
    }

    public function test_only_admins_manage_personal_schedules(): void
    {
        $manager = User::factory()->manager()->create();
        $stranger = User::factory()->at(Location::factory()->create())->create();

        $this->actingAs($manager)->getJson($this->url())->assertForbidden();
        $this->actingAs($manager)->postJson($this->url(), ['valid_from' => '2030-07-01', 'minutes' => self::PART_TIME])->assertForbidden();
        $this->actingAs(User::factory()->create())->getJson($this->url())->assertForbidden();
        // Una persona di un'altra sede per il responsabile non esiste
        $this->actingAs($manager)->getJson("/api/users/{$stranger->id}/schedules")->assertNotFound();
        $this->assertSame(0, $this->employee->schedules()->count());
    }

    public function test_only_future_versions_of_this_person_can_be_deleted(): void
    {
        $started = WorkSchedule::factory()->forUser($this->employee)->validFrom('2030-01-01')->create();
        $future = WorkSchedule::factory()->forUser($this->employee)->validFrom('2030-09-01')->create();
        $someoneElse = WorkSchedule::factory()->forUser(User::factory()->create())->validFrom('2030-09-01')->create();

        $this->actingAs($this->admin)->deleteJson($this->url($started->id))->assertConflict();
        $this->actingAs($this->admin)->deleteJson($this->url($someoneElse->id))->assertNotFound();
        $this->actingAs($this->admin)->deleteJson($this->url($future->id))->assertNoContent();

        $this->assertModelMissing($future);
        $this->assertModelExists($started);
    }

    private function url(?int $scheduleId = null): string
    {
        return "/api/users/{$this->employee->id}/schedules".($scheduleId === null ? '' : "/{$scheduleId}");
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Locations/ClosureApiTest.php tests/Feature/Users/UserScheduleApiTest.php`
Expected: FAIL. Le rotte `/api/closures` e `/api/users/{user}/schedules` rispondono 404.

- [ ] **Step 3: Policy, testi e servizi**

`app/Policies/LocationPolicy.php`:

```php
    /**
     * Chiusure aziendali, di una sede o di tutte: solo l'admin (spec §4.3).
     */
    public function manageClosures(User $actor): bool
    {
        return $actor->isAdmin();
    }
```

`lang/it/locations.php`:

```php
    'closure_order' => 'La chiusura non può finire prima di cominciare.',
    'closure_too_long' => 'Una chiusura dura al massimo :days giorni: dividila in più chiusure.',
```

`lang/en/locations.php`:

```php
    'closure_order' => 'A closure cannot end before it starts.',
    'closure_too_long' => 'A closure lasts at most :days days: split it into several closures.',
```

`app/Services/ClosureService.php`:

```php
<?php

namespace App\Services;

use App\Models\Closure as CompanyClosure;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Chiusure aziendali (spec §2.4): si creano, modificano e cancellano a qualunque data. Il log applicativo tiene
 * traccia di chi le ha cambiate (spec §4.7).
 */
final class ClosureService
{
    /**
     * @param  array<string, mixed>  $data  `location_id` (null = tutte le sedi), date e descrizione validate
     */
    public function create(array $data, User $actor): CompanyClosure
    {
        $closure = new CompanyClosure;
        $closure->forceFill($data)->save();
        Log::info('Closure created', ['closure_id' => $closure->id, 'location_id' => $closure->location_id, 'actor_id' => $actor->id]);

        return $closure;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(CompanyClosure $closure, array $data, User $actor): CompanyClosure
    {
        $closure->forceFill($data)->save();
        Log::info('Closure updated', ['closure_id' => $closure->id, 'location_id' => $closure->location_id, 'actor_id' => $actor->id]);

        return $closure;
    }

    public function delete(CompanyClosure $closure, User $actor): void
    {
        $closure->delete();
        Log::info('Closure deleted', ['closure_id' => $closure->id, 'location_id' => $closure->location_id, 'actor_id' => $actor->id]);
    }
}
```

`app/Services/WorkScheduleService.php`: aggiungi `use App\Models\User;` (se manca) e:

```php
    /**
     * Versione personale (spec §4.4). Con `$minutes` null la persona torna all'orario della sede da quel giorno.
     *
     * @param  list<int>|null  $minutes
     */
    public function addForUser(User $user, CarbonImmutable $validFrom, ?array $minutes, User $actor): WorkSchedule
    {
        $schedule = DB::transaction(function () use ($user, $validFrom, $minutes): WorkSchedule {
            // Blocca la persona: due versioni nuove in parallelo non scelgono la stessa data
            $locked = User::query()->lockForUpdate()->findOrFail($user->id);
            $location = Location::query()->findOrFail($locked->location_id);
            $this->ensureValidFrom($validFrom, $this->today($location), $locked->schedules()->where('valid_from', $validFrom->toDateString())->exists());

            $schedule = new WorkSchedule;
            $schedule->forceFill([
                'location_id' => null,
                'user_id' => $locked->id,
                'valid_from' => $validFrom->toDateString(),
                'follows_location' => $minutes === null,
                ...($minutes === null ? $this->restColumns() : $this->minuteColumns($minutes)),
            ])->save();

            return $schedule;
        });

        Log::info('Personal schedule added', [
            'user_id' => $user->id,
            'schedule_id' => $schedule->id,
            'valid_from' => $validFrom->toDateString(),
            'follows_location' => $minutes === null,
            'actor_id' => $actor->id,
        ]);

        return $schedule;
    }

    /**
     * Righe `follows_location`: minuti a zero, che il calendario non legge (spec §2.3).
     *
     * @return array<string, int>
     */
    private function restColumns(): array
    {
        return array_fill_keys(array_map(fn (string $day): string => "{$day}_minutes", WorkSchedule::DAYS), 0);
    }
```

- [ ] **Step 4: Request**

`app/Http/Requests/Locations/ListClosuresRequest.php`:

```php
<?php

namespace App\Http\Requests\Locations;

use App\Support\Holidays\HolidayCalendar;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListClosuresRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'year' => ['required', 'integer', 'between:'.HolidayCalendar::MIN_YEAR.','.HolidayCalendar::MAX_YEAR],
            'filter' => ['sometimes', 'array'],
            'filter.location' => ['sometimes', 'nullable', 'integer', Rule::exists('locations', 'id')],
        ];
    }

    public function locationFilter(): ?int
    {
        return $this->filled('filter.location') ? $this->integer('filter.location') : null;
    }
}
```

`app/Http/Requests/Locations/ClosureRequest.php` (creazione e modifica):

```php
<?php

namespace App\Http\Requests\Locations;

use App\Models\Closure as CompanyClosure;
use App\Support\PersonRules;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Chiusura nuova o modificata (spec §2.4): al massimo 31 giorni, mai finita prima di cominciare. Nella modifica
 * l'intervallo si controlla con le date che non cambiano.
 */
class ClosureRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $description = $this->input('description');

        if (is_string($description)) {
            $this->merge(['description' => trim($description)]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $creating = $this->closure() === null;
        $required = $creating ? 'required' : 'sometimes';

        return [
            // Nella creazione la chiave serve sempre: null vuol dire "tutte le sedi", detto esplicitamente
            'location_id' => [$creating ? 'present' : 'sometimes', 'nullable', 'integer', Rule::exists('locations', 'id')],
            'starts_on' => [$required, 'date_format:Y-m-d'],
            'ends_on' => [$required, 'date_format:Y-m-d'],
            'description' => [$required, 'string', 'max:'.CompanyClosure::DESCRIPTION_MAX_LENGTH, 'not_regex:'.PersonRules::NAME_FORBIDDEN_CHARACTERS],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['starts_on', 'ends_on'])) {
                return;
            }

            $start = $this->input('starts_on', $this->closure()?->starts_on->toDateString());
            $end = $this->input('ends_on', $this->closure()?->ends_on->toDateString());

            if (! is_string($start) || ! is_string($end)) {
                return;
            }

            if ($end < $start) {
                $validator->errors()->add('ends_on', Translate::text('locations.closure_order'));

                return;
            }

            if ((int) CarbonImmutable::parse($start)->diffInDays(CarbonImmutable::parse($end)) + 1 > CompanyClosure::MAX_DAYS) {
                $validator->errors()->add('ends_on', Translate::text('locations.closure_too_long', ['days' => CompanyClosure::MAX_DAYS]));
            }
        }];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['description.not_regex' => Translate::text('locations.characters')];
    }

    /**
     * @return array<string, mixed>
     */
    public function closureData(): array
    {
        return $this->safe()->only(['location_id', 'starts_on', 'ends_on', 'description']);
    }

    private function closure(): ?CompanyClosure
    {
        $closure = $this->route('closure');

        return $closure instanceof CompanyClosure ? $closure : null;
    }
}
```

`app/Http/Requests/Users/AddUserScheduleRequest.php`:

```php
<?php

namespace App\Http\Requests\Users;

use App\Http\Requests\Concerns\ValidatesWeeklySchedule;
use App\Models\Location;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Versione dell'orario personale: i sette giorni, oppure `follows_location` per tornare all'orario della sede.
 * "Oggi" è quello della sede della persona.
 */
class AddUserScheduleRequest extends FormRequest
{
    use ValidatesWeeklySchedule;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = $this->weeklyScheduleRules();

        return [
            'follows_location' => ['sometimes', 'boolean'],
            'valid_from' => $rules['valid_from'],
            'minutes' => ['exclude_if:follows_location,true', ...$rules['minutes']],
            'minutes.*' => ['exclude_if:follows_location,true', ...$rules['minutes.*']],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $target = $this->route('user');

            assert($target instanceof User);

            $timezone = Location::query()->findOrFail($target->location_id)->timezone;
            $this->checkWeeklySchedule($validator, $timezone, requireWorkingDay: ! $this->followsLocation());
        }];
    }

    public function followsLocation(): bool
    {
        return $this->boolean('follows_location');
    }
}
```

- [ ] **Step 5: Resource, controller e rotte**

`app/Http/Resources/ClosureResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Models\Closure as CompanyClosure;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Chiusura con il nome della sede (null = tutte), caricato dal controller.
 *
 * @mixin CompanyClosure
 */
final class ClosureResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'location_id' => $this->location_id,
            'location_name' => $this->relationLoaded('location') ? $this->location?->name : null,
            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),
            'description' => $this->description,
        ];
    }
}
```

`app/Http/Resources/UserSchedulesResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Models\WorkSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Orario di una persona: le sue versioni personali e l'orario della sede che vale oggi (spec §4.4).
 *
 * @property array{schedules: Collection<int, WorkSchedule>, location_schedule: WorkSchedule|null} $resource
 */
final class UserSchedulesResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $locationSchedule = $this->resource['location_schedule'];

        return [
            'schedules' => WorkScheduleResource::collection($this->resource['schedules']),
            'location_schedule' => $locationSchedule === null ? null : new WorkScheduleResource($locationSchedule),
        ];
    }
}
```

`app/Http/Controllers/Admin/ClosureController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\ClosureRequest;
use App\Http\Requests\Locations\ListClosuresRequest;
use App\Http\Resources\ClosureResource;
use App\Models\Closure as CompanyClosure;
use App\Services\ClosureService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Chiusure aziendali (spec §4.3): solo admin, lo garantiscono le rotte con LocationPolicy::manageClosures.
 */
final class ClosureController extends Controller
{
    /**
     * Le chiusure di un anno sono poche: un tetto contro le liste senza limite.
     */
    private const MAX_PER_YEAR = 500;

    public function __construct(private readonly ClosureService $closures) {}

    /**
     * Chiusure che toccano l'anno; con `filter[location]` quelle della sede più quelle di tutte le sedi.
     */
    public function index(ListClosuresRequest $request): AnonymousResourceCollection
    {
        $year = $request->integer('year');
        $locationId = $request->locationFilter();

        $closures = CompanyClosure::query()
            ->with('location:id,name')
            ->where('starts_on', '<=', "{$year}-12-31")
            ->where('ends_on', '>=', "{$year}-01-01")
            ->when($locationId !== null, fn (Builder $query) => $query->where(
                fn (Builder $inner) => $inner->whereNull('location_id')->orWhere('location_id', $locationId),
            ))
            ->orderBy('starts_on')
            ->orderBy('id')
            ->limit(self::MAX_PER_YEAR)
            ->get();

        return ClosureResource::collection($closures);
    }

    public function store(ClosureRequest $request): JsonResponse
    {
        $closure = $this->closures->create($request->closureData(), $this->actor($request));

        return (new ClosureResource($closure->load('location:id,name')))->response()->setStatusCode(HttpResponse::HTTP_CREATED);
    }

    public function update(ClosureRequest $request, CompanyClosure $closure): ClosureResource
    {
        return new ClosureResource($this->closures->update($closure, $request->closureData(), $this->actor($request))->load('location:id,name'));
    }

    public function destroy(Request $request, CompanyClosure $closure): Response
    {
        $this->closures->delete($closure, $this->actor($request));

        return response()->noContent();
    }
}
```

`app/Http/Controllers/Admin/UserScheduleController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Users\AddUserScheduleRequest;
use App\Http\Resources\UserSchedulesResource;
use App\Http\Resources\WorkScheduleResource;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\WorkScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Orario personale (spec §4.4): solo admin (UserPolicy::manageSchedule). `{schedule}` è risolto dentro la persona.
 */
final class UserScheduleController extends Controller
{
    public function __construct(private readonly WorkScheduleService $schedules) {}

    public function index(User $user): UserSchedulesResource
    {
        $location = $user->location()->firstOrFail();
        $user->setRelation('location', $location);
        $versions = $user->schedules()->orderByDesc('valid_from')->get()
            ->each(fn (WorkSchedule $schedule) => $schedule->setRelation('user', $user));
        $locationSchedule = $this->schedules->currentForLocation($location);
        $locationSchedule?->setRelation('location', $location);

        return new UserSchedulesResource(['schedules' => $versions, 'location_schedule' => $locationSchedule]);
    }

    public function store(AddUserScheduleRequest $request, User $user): JsonResponse
    {
        $schedule = $this->schedules->addForUser(
            $user,
            $request->validFrom(),
            $request->followsLocation() ? null : $request->minutesList(),
            $this->actor($request),
        );
        $user->setRelation('location', $user->location()->firstOrFail());
        $schedule->setRelation('user', $user);

        return (new WorkScheduleResource($schedule))->response()->setStatusCode(HttpResponse::HTTP_CREATED);
    }

    public function destroy(Request $request, User $user, WorkSchedule $schedule): Response
    {
        $this->schedules->delete($schedule, $this->actor($request));

        return response()->noContent();
    }
}
```

`routes/api.php`: `use` di `ClosureController` e `UserScheduleController` e, nel gruppo `auth:sanctum`:

```php
    // Orario personale: solo admin (UserPolicy::manageSchedule)
    Route::get('/users/{user}/schedules', [UserScheduleController::class, 'index'])->can('manageSchedule', 'user')->name('users.schedules.index');
    Route::post('/users/{user}/schedules', [UserScheduleController::class, 'store'])->can('manageSchedule', 'user')->name('users.schedules.store');
    Route::delete('/users/{user}/schedules/{schedule}', [UserScheduleController::class, 'destroy'])
        ->can('manageSchedule', 'user')->scopeBindings()->name('users.schedules.destroy');

    // Chiusure aziendali: solo admin (LocationPolicy::manageClosures)
    Route::get('/closures', [ClosureController::class, 'index'])->can('manageClosures', Location::class)->name('closures.index');
    Route::post('/closures', [ClosureController::class, 'store'])->can('manageClosures', Location::class)->name('closures.store');
    Route::patch('/closures/{closure}', [ClosureController::class, 'update'])->can('manageClosures', Location::class)->name('closures.update');
    Route::delete('/closures/{closure}', [ClosureController::class, 'destroy'])->can('manageClosures', Location::class)->name('closures.destroy');
```

- [ ] **Step 6: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Locations tests/Feature/Users`
Expected: PASS. Anche `LocationVisibilityTest::test_a_manager_gets_404_on_every_route_about_a_person_of_another_location` copre ora le rotte `/users/{user}/schedules…`.

- [ ] **Step 7: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app routes lang tests/Feature/Locations tests/Feature/Users --format agent`, `sail bin pint --test`.
Expected: tutto verde.

- [ ] **Step 8: Commit**

```bash
git add apps/laravel/app apps/laravel/routes/api.php apps/laravel/lang apps/laravel/tests/Feature/Locations/ClosureApiTest.php apps/laravel/tests/Feature/Users/UserScheduleApiTest.php
git commit -m "feat(sedi): chiusure aziendali e orario personale"
```

---

## Task 9: API dello storico

**Files:**
- Create: `apps/laravel/app/Support/HistoryEntry.php`, `apps/laravel/app/Services/UserHistoryPresenter.php`, `apps/laravel/app/Http/Resources/UserHistoryResource.php`
- Create: `apps/laravel/app/Http/Controllers/Auth/ProfileHistoryController.php`, `apps/laravel/app/Http/Controllers/Admin/UserHistoryController.php`
- Create: `apps/laravel/lang/it/history.php`, `apps/laravel/lang/en/history.php`
- Modify: `apps/laravel/routes/api.php`
- Test: `apps/laravel/tests/Feature/Users/UserHistoryApiTest.php`

**Interfaces:**
- Consumes: `UserHistory`, `UserHistoryEvent`, `UserHistoryRecorder` (Task 3); `Role::label()`, `EmploymentType::label()` (Task 2); scope e risoluzione di `{user}` (Task 5); `UserPolicy::viewHistory()` (Task 6).
- Produces:
  - `GET /api/profile/history` e `GET /api/users/{user}/history` (nome `users.history`), paginati a 20 (`UserHistoryPresenter::PER_PAGE`), dalla tappa più recente. Risposta `{data: UserHistory[], links, meta}` con `UserHistoryResource` = `{id, event, summary, actor_name, occurred_at}` (contratto); `actor_name` sempre `null` nel profilo;
  - testi delle tappe in `lang/*/history.php`, tradotti dal server nella lingua dell'account.
- La sede si mostra con il nome **attuale**: una sede rinominata compare con il nome nuovo (spec §8.2). Una sede mancante compare come "—".

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/UserHistoryApiTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use App\Services\UserHistoryRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Storico nel profilo e nel menu di riga di Utenti (spec §8.3).
 */
class UserHistoryApiTest extends TestCase
{
    use RefreshDatabase;

    private UserHistoryRecorder $recorder;

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        $this->recorder = app(UserHistoryRecorder::class);
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
    }

    public function test_the_profile_shows_my_steps_newest_first_without_who_acted(): void
    {
        $user = User::factory()->intern()->create();
        $this->travelTo(CarbonImmutable::parse('2026-03-03 09:00:00'));
        $this->recorder->invited($user, $this->admin);
        $this->travelTo(CarbonImmutable::parse('2026-03-04 09:00:00'));
        $this->recorder->activated($user);
        $this->travelTo(CarbonImmutable::parse('2026-05-10 09:00:00'));
        $this->recorder->employmentTypeChanged($user, EmploymentType::Intern, EmploymentType::Employee, $this->admin);
        $this->travelTo(CarbonImmutable::parse('2026-06-01 09:00:00'));
        $this->recorder->locationChanged($user, Location::primary()->id, $this->milano->id, $this->admin);
        // La tappa di un'altra persona non compare
        $this->recorder->roleChanged(User::factory()->create(), Role::Employee, Role::Manager, $this->admin);

        $this->actingAs($user)->getJson('/api/profile/history')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.*.summary', [
                'Sede: Sede principale → Milano',
                'Tipo: Stagista → Dipendente',
                'Account attivato',
                'Invito come Stagista, Utente, sede Sede principale',
            ])
            ->assertJsonPath('data.*.actor_name', [null, null, null, null])
            ->assertJsonPath('data.3.event', 'invited')
            ->assertJsonPath('data.3.occurred_at', '2026-03-03T09:00:00+00:00');
    }

    public function test_the_profile_history_needs_a_session(): void
    {
        $this->getJson('/api/profile/history')->assertUnauthorized();
    }

    public function test_pages_hold_twenty_steps(): void
    {
        $user = User::factory()->create();

        foreach (range(1, 25) as $step) {
            $step % 2 === 1 ? $this->recorder->disabled($user, null) : $this->recorder->enabled($user, null);
        }

        $this->actingAs($user)->getJson('/api/profile/history')
            ->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.total', 25)
            ->assertJsonPath('meta.per_page', 20);
        $this->actingAs($user)->getJson('/api/profile/history?page=2')->assertOk()->assertJsonCount(5, 'data');
    }

    public function test_staff_see_who_acted_and_the_current_name_of_the_location(): void
    {
        $employee = User::factory()->create();
        $this->recorder->locationChanged($employee, Location::primary()->id, $this->milano->id, $this->admin);
        $this->recorder->roleChanged($employee, Role::Employee, Role::Manager, $this->admin);
        Location::query()->whereKey($this->milano->id)->update(['name' => 'Milano Centro']);

        $this->actingAs($this->admin)->getJson("/api/users/{$employee->id}/history")
            ->assertOk()
            ->assertJsonPath('data.*.actor_name', [$this->admin->name, $this->admin->name])
            ->assertJsonPath('data.*.summary', ['Ruolo: Utente → Responsabile', 'Sede: Sede principale → Milano Centro']);
    }

    public function test_a_manager_reads_the_history_only_within_their_location_and_never_of_an_admin(): void
    {
        $manager = User::factory()->manager()->create();
        $colleague = User::factory()->create();
        $stranger = User::factory()->at($this->milano)->create();

        $this->actingAs($manager)->getJson("/api/users/{$colleague->id}/history")->assertOk();
        $this->actingAs($manager)->getJson("/api/users/{$stranger->id}/history")->assertNotFound();
        $this->actingAs($manager)->getJson("/api/users/{$this->admin->id}/history")->assertForbidden();
        $this->actingAs($colleague)->getJson("/api/users/{$manager->id}/history")->assertForbidden();
    }

    public function test_every_step_has_a_text_in_english_too(): void
    {
        $user = User::factory()->create(['locale' => 'en']);
        (new UserHistory)->forceFill([
            'user_id' => $user->id,
            'event' => UserHistoryEvent::Imported,
            'context' => ['role' => 'employee', 'employment_type' => 'employee', 'location_id' => Location::primary()->id],
        ])->save();
        $this->recorder->invited($user, null);
        $this->recorder->activated($user);
        $this->recorder->roleChanged($user, Role::Employee, Role::Manager, null);
        $this->recorder->employmentTypeChanged($user, EmploymentType::Employee, EmploymentType::Contractor, null);
        $this->recorder->locationChanged($user, Location::primary()->id, $this->milano->id, null);
        $this->recorder->disabled($user, null);
        $this->recorder->enabled($user, null);

        $summaries = $this->actingAs($user)->getJson('/api/profile/history')->assertOk()->json('data.*.summary');

        $this->assertEqualsCanonicalizing([
            'In the app as Employee, User, location Sede principale',
            'Invited as Employee, User, location Sede principale',
            'Account activated',
            'Role: User → Manager',
            'Type: Employee → External contractor',
            'Location: Sede principale → Milano',
            'Account disabled',
            'Account enabled',
        ], $summaries);
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/UserHistoryApiTest.php`
Expected: FAIL. Le rotte rispondono 404 (`/api/profile/history`) o 404/405.

- [ ] **Step 3: Testi**

`lang/it/history.php`:

```php
<?php

return [
    'imported' => 'Nell’app come :type, :role, sede :location',
    'invited' => 'Invito come :type, :role, sede :location',
    'activated' => 'Account attivato',
    'role_changed' => 'Ruolo: :from → :to',
    'employment_type_changed' => 'Tipo: :from → :to',
    'location_changed' => 'Sede: :from → :to',
    'disabled' => 'Account disattivato',
    'enabled' => 'Account riattivato',
];
```

`lang/en/history.php`:

```php
<?php

return [
    'imported' => 'In the app as :type, :role, location :location',
    'invited' => 'Invited as :type, :role, location :location',
    'activated' => 'Account activated',
    'role_changed' => 'Role: :from → :to',
    'employment_type_changed' => 'Type: :from → :to',
    'location_changed' => 'Location: :from → :to',
    'disabled' => 'Account disabled',
    'enabled' => 'Account enabled',
];
```

- [ ] **Step 4: Presenter, resource e controller**

`app/Support/HistoryEntry.php`:

```php
<?php

namespace App\Support;

use App\Models\UserHistory;

/**
 * Una tappa pronta da mostrare: testo tradotto e, solo per lo staff, chi ha agito.
 */
final readonly class HistoryEntry
{
    public function __construct(
        public UserHistory $entry,
        public string $summary,
        public ?string $actorName,
    ) {}
}
```

`app/Services/UserHistoryPresenter.php`:

```php
<?php

namespace App\Services;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use App\Support\HistoryEntry;
use App\Support\Translate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * Storico di una persona per il profilo e per lo staff (spec §8.3): pagine da 20, dalla tappa più recente, con il
 * testo tradotto nella lingua della richiesta. I nomi delle sedi si leggono con una sola query per pagina.
 */
final class UserHistoryPresenter
{
    public const PER_PAGE = 20;

    private const UNKNOWN = '—';

    /**
     * @param  bool  $withActor  solo per lo staff: nel profilo chi ha agito non si mostra
     * @return LengthAwarePaginator<int, HistoryEntry>
     */
    public function page(User $user, bool $withActor): LengthAwarePaginator
    {
        $page = UserHistory::query()
            ->where('user_id', $user->id)
            ->when($withActor, fn (Builder $query) => $query->with('actor:id,first_name,last_name'))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE);
        $locationNames = $this->locationNames($page->getCollection());

        /** @var LengthAwarePaginator<int, HistoryEntry> $entries */
        $entries = $page->through(fn (UserHistory $entry): HistoryEntry => new HistoryEntry(
            $entry,
            $this->summary($entry, $locationNames),
            $withActor ? $entry->actor?->name : null,
        ));

        return $entries;
    }

    /**
     * @param  Collection<int, string>  $locationNames  id → nome attuale
     */
    private function summary(UserHistory $entry, Collection $locationNames): string
    {
        $context = $entry->context ?? [];

        return match ($entry->event) {
            UserHistoryEvent::Imported, UserHistoryEvent::Invited => Translate::text('history.'.$entry->event->value, [
                'type' => EmploymentType::tryFrom((string) ($context['employment_type'] ?? ''))?->label() ?? self::UNKNOWN,
                'role' => Role::tryFrom((string) ($context['role'] ?? ''))?->label() ?? self::UNKNOWN,
                'location' => $locationNames->get((int) ($context['location_id'] ?? 0), self::UNKNOWN),
            ]),
            UserHistoryEvent::RoleChanged => Translate::text('history.role_changed', [
                'from' => Role::tryFrom((string) $entry->old_value)?->label() ?? self::UNKNOWN,
                'to' => Role::tryFrom((string) $entry->new_value)?->label() ?? self::UNKNOWN,
            ]),
            UserHistoryEvent::EmploymentTypeChanged => Translate::text('history.employment_type_changed', [
                'from' => EmploymentType::tryFrom((string) $entry->old_value)?->label() ?? self::UNKNOWN,
                'to' => EmploymentType::tryFrom((string) $entry->new_value)?->label() ?? self::UNKNOWN,
            ]),
            UserHistoryEvent::LocationChanged => Translate::text('history.location_changed', [
                'from' => $locationNames->get((int) $entry->old_value, self::UNKNOWN),
                'to' => $locationNames->get((int) $entry->new_value, self::UNKNOWN),
            ]),
            UserHistoryEvent::Activated, UserHistoryEvent::Disabled, UserHistoryEvent::Enabled => Translate::text('history.'.$entry->event->value),
        };
    }

    /**
     * Nomi attuali delle sedi citate nella pagina: una sede rinominata compare con il nome nuovo.
     *
     * @param  Collection<int, UserHistory>  $entries
     * @return Collection<int, string>
     */
    private function locationNames(Collection $entries): Collection
    {
        $ids = $entries->flatMap(fn (UserHistory $entry): array => match ($entry->event) {
            UserHistoryEvent::LocationChanged => [(int) $entry->old_value, (int) $entry->new_value],
            UserHistoryEvent::Imported, UserHistoryEvent::Invited => [(int) ($entry->context['location_id'] ?? 0)],
            default => [],
        })->filter()->unique()->values();

        if ($ids->isEmpty()) {
            return new Collection;
        }

        /** @var Collection<int, string> $names */
        $names = Location::query()->whereIn('id', $ids)->pluck('name', 'id');

        return $names;
    }
}
```

`app/Http/Resources/UserHistoryResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Support\HistoryEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una tappa dello storico (spec §8): `actor_name` è null nel profilo.
 *
 * @property HistoryEntry $resource
 */
final class UserHistoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->entry->id,
            'event' => $this->resource->entry->event->value,
            'summary' => $this->resource->summary,
            'actor_name' => $this->resource->actorName,
            'occurred_at' => $this->resource->entry->created_at->toIso8601String(),
        ];
    }
}
```

`app/Http/Controllers/Auth/ProfileHistoryController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserHistoryResource;
use App\Services\UserHistoryPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Storico di chi è collegato, senza chi ha agito (spec §8.3).
 */
final class ProfileHistoryController extends Controller
{
    public function __invoke(Request $request, UserHistoryPresenter $history): AnonymousResourceCollection
    {
        return UserHistoryResource::collection($history->page($this->actor($request), withActor: false));
    }
}
```

`app/Http/Controllers/Admin/UserHistoryController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserHistoryResource;
use App\Models\User;
use App\Services\UserHistoryPresenter;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Storico di una persona per admin e responsabile (spec §8.3), con chi ha agito. Sede e admin: policy e `{user}`.
 */
final class UserHistoryController extends Controller
{
    public function __invoke(User $user, UserHistoryPresenter $history): AnonymousResourceCollection
    {
        return UserHistoryResource::collection($history->page($user, withActor: true));
    }
}
```

`routes/api.php`: `use` dei due controller e, nel gruppo `auth:sanctum`:

```php
    Route::get('/profile/history', ProfileHistoryController::class)->name('profile.history');
```

(accanto alle altre rotte del profilo) e

```php
    Route::get('/users/{user}/history', UserHistoryController::class)->can('viewHistory', 'user')->name('users.history');
```

(accanto alle rotte `/users/{user}/…`).

- [ ] **Step 5: Verifica che passino**

Run: `sail artisan test --compact tests/Feature/Users`
Expected: PASS, compreso `LocationVisibilityTest`, che ora include `/users/{user}/history`.

- [ ] **Step 6: Gate**

Run: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint app routes lang tests/Feature/Users --format agent`, `sail bin pint --test`.
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add apps/laravel/app apps/laravel/routes/api.php apps/laravel/lang apps/laravel/tests/Feature/Users/UserHistoryApiTest.php
git commit -m "feat(utenti): storico della persona nel profilo e per lo staff"
```


## Task 10: Frontend — utente corrente, ruolo "Utente", tipi e hook delle sedi

> Le rotte `/admin/locations` e `/admin/locations/:id` e la voce **Sedi** della sidebar entrano nel Task 11 e nel Task 12 insieme alle pagine: una rotta lazy verso un file che non esiste ancora romperebbe `npm run build` a fine task.

**Files:**
- Modify: `apps/react/src/features/auth/api.ts` (schema dell'utente, `meta.multiple_locations`, `useMultipleLocations`)
- Modify: `apps/react/src/features/auth/api.test.tsx`
- Modify: `apps/react/src/test/fixtures.ts`
- Modify: `apps/react/src/features/users/api.ts` (`managedUserSchema` con sede, tipo e nuovi `can`; tipi comuni)
- Modify: `apps/react/src/test/usersFixtures.ts`
- Modify: `apps/react/src/lib/queryKeys.ts`
- Create: `apps/react/src/features/locations/scheduleFormat.ts`
- Create: `apps/react/src/features/locations/scheduleFormat.test.ts`
- Create: `apps/react/src/features/locations/patron.ts`
- Create: `apps/react/src/features/locations/patron.test.ts`
- Create: `apps/react/src/features/locations/api.ts`
- Create: `apps/react/src/features/locations/api.test.tsx`
- Create: `apps/react/src/test/locationsFixtures.ts`
- Modify: `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`
- Modify: `apps/react/e2e/admin-users.spec.ts` (radio "Dipendente" → "Utente")

**Interfaces:**
- Consumes (backend, contratti del piano): `CurrentUserResource` con `location: {id, name}`, `employment_type`, `employment_type_label`, `meta.multiple_locations`; `ManagedUserResource` con `location`, `employment_type`, `employment_type_label` e `can.change_location`, `can.manage_schedule`, `can.view_history`; le rotte e le forme JSON di sedi, orari, chiusure e calendario.
- Produces:
  - `features/auth/api.ts`: `User` con `location: { id: number; name: string }`, `employment_type: EmploymentType`, `employment_type_label: string`, `multipleLocations?: boolean`; `useMultipleLocations(): boolean`; `EMPLOYMENT_TYPES: EmploymentType[]`; `isEmploymentType(value: string): value is EmploymentType`; `type EmploymentType = 'employee' | 'contractor' | 'intern'`.
  - `features/users/api.ts`: `ManagedUser` con gli stessi campi e i tre nuovi `can`.
  - `lib/queryKeys.ts`: `locationsQueryKey: readonly ['admin', 'locations']`, `historyQueryKey: readonly ['history']`.
  - `features/locations/scheduleFormat.ts`: `formatMinutes(minutes: number): string`, `parseHours(text: string): number | null`, `validateWeek(minutes: number[]): 'invalidHours' | 'noWorkingDay' | null`, `todayIn(timeZone: string, now?: Date): string`, `DEFAULT_TIMEZONE = 'Europe/Rome'`, `WEEKDAYS: Weekday[]` (lunedì primo), `DEFAULT_WEEK: number[]`.
  - `features/locations/patron.ts`: `parsePatron(text: string): { day: number; month: number } | null | 'invalid'`, `formatPatron(day: number | null, month: number | null): string`.
  - `features/locations/api.ts`: tutti gli hook dei contratti (firme sotto), più i tipi `Location`, `LocationDetail`, `WorkSchedule`, `Closure`, `LocationCalendar`, `LocationOption`, `LocationListParams`, `LocationStatus`, `LocationInput`, `ClosureInput`, `UserScheduleInput`.
  - `test/locationsFixtures.ts`: `location()`, `locationDetail()`, `schedule()`, `closure()`, `locationListResponse()`.

- [ ] **Step 1: Scrivi i test che falliscono — formato degli orari e patrono**

`apps/react/src/features/locations/scheduleFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK, formatMinutes, parseHours, todayIn, validateWeek } from '@/features/locations/scheduleFormat'

describe('formatMinutes', () => {
  it('writes whole hours without minutes and the rest as h:mm', () => {
    expect(formatMinutes(480)).toBe('8')
    expect(formatMinutes(270)).toBe('4:30')
    expect(formatMinutes(15)).toBe('0:15')
    expect(formatMinutes(0)).toBe('0')
    expect(formatMinutes(720)).toBe('12')
  })
})

describe('parseHours', () => {
  it('reads hours with a colon, a dot or a comma', () => {
    expect(parseHours('8')).toBe(480)
    expect(parseHours('4:30')).toBe(270)
    expect(parseHours('7.5')).toBe(450)
    expect(parseHours('7,25')).toBe(435)
    expect(parseHours(' 6:45 ')).toBe(405)
    expect(parseHours('0')).toBe(0)
  })

  it('rejects values that are not quarters of an hour or are out of range', () => {
    expect(parseHours('')).toBeNull()
    expect(parseHours('abc')).toBeNull()
    expect(parseHours('4:10')).toBeNull()
    expect(parseHours('4:60')).toBeNull()
    expect(parseHours('12:15')).toBeNull()
    expect(parseHours('13')).toBeNull()
    expect(parseHours('-1')).toBeNull()
  })
})

describe('validateWeek', () => {
  it('accepts a week with at least one working day', () => {
    expect(validateWeek(DEFAULT_WEEK)).toBeNull()
    expect(validateWeek([0, 0, 0, 0, 0, 240, 0])).toBeNull()
  })

  it('reports invalid hours before an empty week', () => {
    expect(validateWeek([480, Number.NaN, 480, 480, 480, 0, 0])).toBe('invalidHours')
    expect(validateWeek([0, 0, 0, 0, 0, 0, 0])).toBe('noWorkingDay')
    expect(validateWeek([480, 480])).toBe('invalidHours')
  })
})

describe('todayIn', () => {
  it('uses the calendar day of the location, not the one of the device', () => {
    // 23:30 UTC del 14 ottobre: a Roma è già il 15
    expect(todayIn('Europe/Rome', new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-15')
    expect(todayIn('Europe/Rome', new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-14')
  })
})
```

`apps/react/src/features/locations/patron.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatPatron, parsePatron } from '@/features/locations/patron'

describe('parsePatron', () => {
  it('reads day and month as dd/mm, with or without leading zeros', () => {
    expect(parsePatron('07/12')).toEqual({ day: 7, month: 12 })
    expect(parsePatron('7/12')).toEqual({ day: 7, month: 12 })
    expect(parsePatron(' 29/6 ')).toEqual({ day: 29, month: 6 })
  })

  it('treats an empty field as no patron', () => {
    expect(parsePatron('')).toBeNull()
    expect(parsePatron('   ')).toBeNull()
  })

  it('rejects dates that do not exist in a non-leap year', () => {
    expect(parsePatron('29/02')).toBe('invalid')
    expect(parsePatron('31/04')).toBe('invalid')
    expect(parsePatron('00/05')).toBe('invalid')
    expect(parsePatron('12/13')).toBe('invalid')
    expect(parsePatron('7 dicembre')).toBe('invalid')
  })
})

describe('formatPatron', () => {
  it('writes dd/mm or nothing', () => {
    expect(formatPatron(7, 12)).toBe('07/12')
    expect(formatPatron(null, null)).toBe('')
  })
})
```

- [ ] **Step 2: Scrivi i test che falliscono — utente corrente e hook delle sedi**

In `apps/react/src/features/auth/api.test.tsx` aggiungi in fondo al `describe('current user', …)` (l'import di `useMultipleLocations` si aggiunge a quello esistente da `@/features/auth/api`):

```tsx
  it('reads location, employment type and whether there is more than one location', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { multipleLocations: true }))))

    const { result } = renderWithClient(() => ({ current: useCurrentUser(), multiple: useMultipleLocations() }))

    await waitFor(() => expect(result.current.current.data).toBeTruthy())
    expect(result.current.current.data?.location).toEqual({ id: 1, name: 'Sede principale' })
    expect(result.current.current.data?.employment_type).toBe('employee')
    expect(result.current.multiple).toBe(true)
  })

  it('treats a single location as the default before and after the read', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser))))

    const { result } = renderWithClient(() => ({ current: useCurrentUser(), multiple: useMultipleLocations() }))

    expect(result.current.multiple).toBe(false)
    await waitFor(() => expect(result.current.current.data).toBeTruthy())
    expect(result.current.multiple).toBe(false)
  })
```

`apps/react/src/features/locations/api.test.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  useAddLocationSchedule,
  useAddUserSchedule,
  useClosures,
  useCreateClosure,
  useLocationCalendar,
  useLocationOptions,
  useLocations,
  useUserSchedules,
} from '@/features/locations/api'
import { createQueryClient } from '@/lib/queryClient'
import { closure, location, locationListResponse, schedule } from '@/test/locationsFixtures'
import { server } from '@/test/server'

const renderWithClient = <T,>(hook: () => T) => {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), queryClient }
}

describe('locations api', () => {
  it('sends status, sort and page of the list and reads the counts', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/locations', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json(locationListResponse([location()], { active: 1, archived: 2 }))
      }),
    )

    const { result } = renderWithClient(() => useLocations({ status: 'archived', sort: '-name', page: 2 }))

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(urls[0]?.searchParams.get('filter[status]')).toBe('archived')
    expect(urls[0]?.searchParams.get('sort')).toBe('-name')
    expect(urls[0]?.searchParams.get('page')).toBe('2')
    expect(result.current.data?.meta.counts).toEqual({ active: 1, archived: 2 })
  })

  it('reads the options for the selects', async () => {
    server.use(http.get('/api/locations/options', () => HttpResponse.json({ data: [{ id: 1, name: 'Sede principale', is_primary: true }] })))

    const { result } = renderWithClient(() => useLocationOptions())

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1, name: 'Sede principale', is_primary: true }]))
  })

  it('reads the calendar of a year with its reasons', async () => {
    server.use(
      http.get('/api/locations/1/calendar', ({ request }) => {
        expect(new URL(request.url).searchParams.get('year')).toBe('2027')
        return HttpResponse.json({
          data: {
            year: 2027,
            schedules: [schedule()],
            days: [{ date: '2027-03-29', reasons: [{ type: 'national_holiday', label: 'Lunedì dell’Angelo' }] }],
          },
        })
      }),
    )

    const { result } = renderWithClient(() => useLocationCalendar(1, 2027))

    await waitFor(() => expect(result.current.data?.days[0]?.reasons[0]?.type).toBe('national_holiday'))
  })

  it('asks for the closures of a location together with the company-wide ones', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/closures', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: [closure()] })
      }),
    )

    const { result } = renderWithClient(() => useClosures(2026, 3))

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(urls[0]?.searchParams.get('year')).toBe('2026')
    expect(urls[0]?.searchParams.get('filter[location]')).toBe('3')
  })

  it('sends schedules and closures in the API format', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/locations/1/schedules', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: schedule({ id: 9, valid_from: '2026-11-01' }) }, { status: 201 })
      }),
      http.post('/api/users/7/schedules', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: schedule({ id: 10, follows_location: true }) }, { status: 201 })
      }),
      http.post('/api/closures', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: closure() }, { status: 201 })
      }),
    )

    const { result } = renderWithClient(() => ({ location: useAddLocationSchedule(1), user: useAddUserSchedule(7), closure: useCreateClosure() }))

    await act(async () => {
      await result.current.location.mutateAsync({ validFrom: '2026-11-01', minutes: [480, 480, 480, 480, 240, 0, 0] })
      await result.current.user.mutateAsync({ validFrom: '2026-11-01', followsLocation: true })
      await result.current.closure.mutateAsync({ locationId: null, startsOn: '2026-08-10', endsOn: '2026-08-21', description: 'Chiusura estiva' })
    })

    expect(bodies).toEqual([
      { valid_from: '2026-11-01', minutes: [480, 480, 480, 480, 240, 0, 0] },
      { valid_from: '2026-11-01', follows_location: true },
      { location_id: null, starts_on: '2026-08-10', ends_on: '2026-08-21', description: 'Chiusura estiva' },
    ])
  })

  it('reads personal schedules and the schedule of the location', async () => {
    server.use(
      http.get('/api/users/7/schedules', () =>
        HttpResponse.json({ data: { schedules: [schedule({ id: 3, minutes: [240, 240, 240, 0, 0, 0, 0] })], location_schedule: schedule() } }),
      ),
    )

    const { result } = renderWithClient(() => useUserSchedules(7))

    await waitFor(() => expect(result.current.data?.schedules[0]?.minutes).toEqual([240, 240, 240, 0, 0, 0, 0]))
    expect(result.current.data?.location_schedule?.minutes).toEqual([480, 480, 480, 480, 480, 0, 0])
  })
})
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `cd apps/react && npx vitest run src/features/locations src/features/auth/api.test.tsx`
Expected: FAIL — moduli `@/features/locations/*` e `@/test/locationsFixtures` inesistenti, `useMultipleLocations` non esportato.

- [ ] **Step 4: Utente corrente con sede, tipo e numero di sedi**

In `apps/react/src/features/auth/api.ts` sostituisci `userSchema`, `User` e `currentUserResponseSchema`, e aggiungi i tipi e l'hook (dopo `useCurrentUser`):

```ts
/** Tipo di rapporto (spec SP2 fase 1 §7): diverso dal ruolo, che dice cosa si può fare nell'app. */
export type EmploymentType = 'employee' | 'contractor' | 'intern'

export const EMPLOYMENT_TYPES: EmploymentType[] = ['employee', 'contractor', 'intern']

export const isEmploymentType = (value: string): value is EmploymentType => EMPLOYMENT_TYPES.some((type) => type === value)

/** Sede di una persona come la manda il server: id e nome attuale. */
export const locationRefSchema = z.object({ id: z.number(), name: z.string() })

export const userSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string(),
  // Nome completo ("Nome Cognome") per la visualizzazione
  name: z.string(),
  email: z.string(),
  role: z.enum(['employee', 'manager', 'admin']),
  role_label: z.string(),
  status: z.enum(['invited', 'active', 'disabled']),
  locale: z.enum(['it', 'en']),
  last_login_at: z.string().nullable(),
  location: locationRefSchema,
  employment_type: z.enum(['employee', 'contractor', 'intern']),
  employment_type_label: z.string(),
})

/** Utente corrente. `session` e `multipleLocations` ci sono solo dopo una lettura di `/api/auth/user` o `/api/profile`. */
export type User = z.infer<typeof userSchema> & {
  session?: SessionLimits
  /** Almeno due sedi attive (spec §5.5): senza, i campi Sede non compaiono */
  multipleLocations?: boolean
}

/** Risposta di `GET /api/auth/user` e `PATCH /api/profile`: l'utente, i limiti della sessione e il numero di sedi. */
export const currentUserResponseSchema = z
  .object({
    data: userSchema,
    meta: z.object({
      session: z.object({ idle_timeout_seconds: z.number(), absolute_remaining_seconds: z.number() }),
      multiple_locations: z.boolean(),
    }),
  })
  .transform(({ data, meta }): User => ({
    ...data,
    session: {
      idleTimeoutMs: meta.session.idle_timeout_seconds * 1000,
      absoluteDeadline: Date.now() + Math.max(0, meta.session.absolute_remaining_seconds) * 1000,
    },
    multipleLocations: meta.multiple_locations,
  }))
```

```ts
/** true con almeno due sedi attive. Prima della lettura (o dopo la sola risposta del codice) vale una sede sola. */
export const useMultipleLocations = (): boolean => {
  const { data } = useCurrentUser()
  return data?.multipleLocations ?? false
}
```

`SessionLimits` resta dichiarato prima di `User`, com'è oggi.

- [ ] **Step 5: Fixture dell'utente corrente**

In `apps/react/src/test/fixtures.ts`:

```ts
import { userSchema, type User } from '@/features/auth/api'

export const adminUser: User = {
  id: 1,
  first_name: 'Giulia',
  last_name: 'Rossi',
  name: 'Giulia Rossi',
  email: 'admin@holidays.test',
  role: 'admin',
  role_label: 'HR / Admin',
  status: 'active',
  locale: 'it',
  last_login_at: null,
  location: { id: 1, name: 'Sede principale' },
  employment_type: 'employee',
  employment_type_label: 'Dipendente',
}

interface SessionSeconds {
  /** Inattività ammessa (default 2 ore, come `session.lifetime` di Laravel) */
  idle?: number
  /** Secondi rimasti alla durata assoluta (default 12 ore) */
  absolute?: number
  /** Almeno due sedi attive (default no: l'azienda con una sola sede) */
  multipleLocations?: boolean
}

/** Risposta di `GET /api/auth/user` e `PATCH /api/profile`: l'utente, i limiti della sessione e il numero di sedi. */
export const currentUserResponse = (user: User = adminUser, { idle = 7200, absolute = 43_200, multipleLocations = false }: SessionSeconds = {}) => {
  // Sessione e numero di sedi non sono campi della risorsa (nel frontend li ricava la lettura da `meta`): lo schema li toglie
  return {
    data: userSchema.parse(user),
    meta: { session: { idle_timeout_seconds: idle, absolute_remaining_seconds: absolute }, multiple_locations: multipleLocations },
  }
}
```

In `apps/react/src/features/profile/pages/ProfilePage.test.tsx` cambia nel fixture `employee` `role_label: 'Dipendente'` in `role_label: 'Utente'` (il testo del ruolo ora è "Utente").

- [ ] **Step 6: Utente gestito con sede, tipo e nuovi permessi**

In `apps/react/src/features/users/api.ts` aggiorna l'import e `managedUserSchema`:

```ts
import { locationRefSchema, type User } from '@/features/auth/api'
```

```ts
export const managedUserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string(),
  // Nome completo ("Nome Cognome") per la visualizzazione
  name: z.string(),
  email: z.string(),
  role: z.enum(['employee', 'manager', 'admin']),
  role_label: z.string(),
  status: z.enum(['invited', 'active', 'disabled']),
  status_label: z.string(),
  invitation_expires_at: z.string().nullable(),
  is_current_user: z.boolean(),
  // Sede e tipo di rapporto (spec SP2 fase 1 §4.5 e §7.4)
  location: locationRefSchema,
  employment_type: z.enum(['employee', 'contractor', 'intern']),
  employment_type_label: z.string(),
  // Azioni permesse a chi guarda, calcolate dal server (spec §2): il frontend non ricalcola le regole dei ruoli
  can: z.object({
    resend_invitation: z.boolean(),
    cancel_invitation: z.boolean(),
    change_role: z.boolean(),
    disable: z.boolean(),
    enable: z.boolean(),
    update: z.boolean(),
    // Link di reset della password all'email della persona (spec fase 4 §6)
    send_password_reset: z.boolean(),
    // Solo l'admin cambia la sede e l'orario personale; storico per admin e responsabile (spec SP2 fase 1 §4.4, §8.3)
    change_location: z.boolean(),
    manage_schedule: z.boolean(),
    view_history: z.boolean(),
  }),
})
```

In `apps/react/src/test/usersFixtures.ts`:

```ts
import type { ManagedUser } from '@/features/users/api'

/** Nessuna azione permessa (es. la propria riga, o un admin visto da un responsabile). */
export const NO_ACTIONS: ManagedUser['can'] = {
  resend_invitation: false,
  cancel_invitation: false,
  change_role: false,
  disable: false,
  enable: false,
  update: false,
  send_password_reset: false,
  change_location: false,
  manage_schedule: false,
  view_history: false,
}

/** Azioni della fase 3 e 4 permesse: lo stato decide poi quali compaiono. Orario, storico e sede si attivano nei test che le provano. */
export const ALL_ACTIONS: ManagedUser['can'] = {
  resend_invitation: true,
  cancel_invitation: true,
  change_role: true,
  disable: true,
  enable: true,
  update: true,
  send_password_reset: true,
  change_location: false,
  manage_schedule: false,
  view_history: false,
}

/** Tutte le azioni, comprese orario personale, storico e cambio sede (vista dell'admin). */
export const ADMIN_ACTIONS: ManagedUser['can'] = { ...ALL_ACTIONS, change_location: true, manage_schedule: true, view_history: true }

/** Utente della lista; nome e cognome, se mancano, si ricavano da `name` dividendo al primo spazio (come la migration). */
export const managedUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => {
  const name = overrides.name ?? 'Marco Bianchi'
  const [firstName = '', ...rest] = name.split(' ')
  return {
    id: 2,
    first_name: firstName,
    last_name: rest.join(' '),
    name,
    email: 'marco@holidays.test',
    role: 'employee',
    role_label: 'Utente',
    status: 'active',
    status_label: 'Attivo',
    invitation_expires_at: null,
    is_current_user: false,
    location: { id: 1, name: 'Sede principale' },
    employment_type: 'employee',
    employment_type_label: 'Dipendente',
    can: overrides.is_current_user === true ? NO_ACTIONS : ALL_ACTIONS,
    ...overrides,
  }
}
```

(`userListResponse` resta com'è.) Le tre azioni nuove sono `false` in `ALL_ACTIONS`: i test delle fasi precedenti, che contano le voci di menu, non cambiano.

- [ ] **Step 7: Chiavi delle query**

In fondo a `apps/react/src/lib/queryKeys.ts`:

```ts
/** Sedi, orari, chiusure e calendari: sotto il prefisso admin, così le modifiche agli utenti e alle sedi si invalidano insieme. */
export const locationsQueryKey: readonly ['admin', 'locations'] = [adminQueryKey[0], 'locations']

/** Storico delle persone (profilo e Utenti): fuori dall'utente corrente, quindi il logout lo cancella (clearSessionData). */
export const historyQueryKey: readonly ['history'] = ['history']
```

- [ ] **Step 8: Formato degli orari e del patrono**

`apps/react/src/features/locations/scheduleFormat.ts`:

```ts
/** Giorni della settimana in ordine di orario: lunedì primo, come `minutes` dell'API (spec SP2 fase 1 §2.3). */
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** Orario di partenza della prima sede: lunedì-venerdì, 8 ore */
export const DEFAULT_WEEK: number[] = [480, 480, 480, 480, 480, 0, 0]

/** Oggi tutte le sedi sono in Italia (spec §1): fuso usato quando la sede non è nota (es. orario personale) */
export const DEFAULT_TIMEZONE = 'Europe/Rome'

const STEP = 15
const MAX_MINUTES = 720

/** Minuti in ore leggibili: 480 → "8", 270 → "4:30". */
export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? String(hours) : `${hours}:${String(rest).padStart(2, '0')}`
}

const isAllowed = (minutes: number): boolean => Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_MINUTES && minutes % STEP === 0

/**
 * Ore scritte da una persona in minuti: "8", "4:30", "7.5" o "7,25". null se non è un quarto d'ora tra 0 e 12 ore
 * (spec §2.3: multipli di 15, da 0 a 720).
 */
export const parseHours = (text: string): number | null => {
  const value = text.trim()
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (clock) {
    const minutes = Number(clock[2])
    if (minutes >= 60) return null
    const total = Number(clock[1]) * 60 + minutes
    return isAllowed(total) ? total : null
  }
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(value)) return null
  const total = Math.round(Number(value.replace(',', '.')) * 60)
  return isAllowed(total) ? total : null
}

/** Errore della settimana: ore non valide (prima) o nessun giorno lavorativo. null se va bene. */
export const validateWeek = (minutes: number[]): 'invalidHours' | 'noWorkingDay' | null => {
  if (minutes.length !== WEEKDAYS.length || minutes.some((value) => !isAllowed(value))) return 'invalidHours'
  if (minutes.every((value) => value === 0)) return 'noWorkingDay'
  return null
}

/** Data di oggi (YYYY-MM-DD) nel fuso della sede: `valid_from` si confronta con questa, non con il giorno del dispositivo. */
export const todayIn = (timeZone: string, now: Date = new Date()): string =>
  // en-CA scrive già le date come YYYY-MM-DD
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
```

`apps/react/src/features/locations/patron.ts`:

```ts
// Giorni dei mesi in un anno non bisestile: il 29 febbraio non è un patrono valido (spec SP2 fase 1 §2.1)
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Patrono scritto come "gg/mm": null se il campo è vuoto (nessun patrono), 'invalid' se la data non esiste. */
export const parsePatron = (text: string): { day: number; month: number } | null | 'invalid' => {
  const value = text.trim()
  if (value === '') return null
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value)
  if (!match) return 'invalid'
  const day = Number(match[1])
  const month = Number(match[2])
  const days = DAYS_IN_MONTH[month - 1]
  if (days === undefined || day < 1 || day > days) return 'invalid'
  return { day, month }
}

/** Patrono come "gg/mm" (vuoto senza patrono), per il campo del form e la lettura. */
export const formatPatron = (day: number | null, month: number | null): string =>
  day === null || month === null ? '' : `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
```

- [ ] **Step 9: Hook delle sedi**

`apps/react/src/features/locations/api.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'
import { adminQueryKey, locationsQueryKey, userQueryKey } from '@/lib/queryKeys'

export const workScheduleSchema = z.object({
  id: z.number(),
  valid_from: z.string(),
  // Solo per l'orario personale: da quella data vale di nuovo l'orario della sede
  follows_location: z.boolean(),
  // Minuti per giorno, lunedì primo
  minutes: z.array(z.number()).length(7),
  // Già in vigore: non si cancella più
  is_started: z.boolean(),
})

export const locationSchema = z.object({
  id: z.number(),
  name: z.string(),
  city: z.string().nullable(),
  country: z.string(),
  timezone: z.string(),
  patron_day: z.number().nullable(),
  patron_month: z.number().nullable(),
  is_primary: z.boolean(),
  archived_at: z.string().nullable(),
  users_count: z.number(),
  // Responsabili attivi: zero mostra l'avviso "Nessun responsabile"
  managers_count: z.number(),
})

export const locationDetailSchema = locationSchema.extend({ current_schedule: workScheduleSchema.nullable() })

export const closureSchema = z.object({
  id: z.number(),
  // null = tutte le sedi
  location_id: z.number().nullable(),
  location_name: z.string().nullable(),
  starts_on: z.string(),
  ends_on: z.string(),
  description: z.string(),
})

const reasonSchema = z.object({ type: z.enum(['weekly_rest', 'national_holiday', 'patron', 'closure']), label: z.string() })

const calendarSchema = z.object({
  data: z.object({
    year: z.number(),
    schedules: z.array(workScheduleSchema),
    days: z.array(z.object({ date: z.string(), reasons: z.array(reasonSchema) })),
  }),
})

const locationOptionSchema = z.object({ id: z.number(), name: z.string(), is_primary: z.boolean() })

const locationListSchema = z.object({
  data: z.array(locationSchema),
  meta: z.object({
    current_page: z.number(),
    last_page: z.number(),
    total: z.number(),
    counts: z.object({ active: z.number(), archived: z.number() }),
  }),
})

const userSchedulesSchema = z.object({
  data: z.object({ schedules: z.array(workScheduleSchema), location_schedule: workScheduleSchema.nullable() }),
})

export type WorkSchedule = z.infer<typeof workScheduleSchema>
export type Location = z.infer<typeof locationSchema>
export type LocationDetail = z.infer<typeof locationDetailSchema>
export type Closure = z.infer<typeof closureSchema>
export type LocationCalendar = z.infer<typeof calendarSchema>['data']
export type CalendarReason = z.infer<typeof reasonSchema>
export type LocationOption = z.infer<typeof locationOptionSchema>
export type LocationList = z.infer<typeof locationListSchema>
export type UserSchedules = z.infer<typeof userSchedulesSchema>['data']

export type LocationStatus = 'active' | 'archived'
export type LocationSort = 'name' | '-name'

export interface LocationListParams {
  status: LocationStatus
  sort: LocationSort
  page: number
}

export interface LocationInput {
  name: string
  city: string
  /** null = nessun patrono */
  patronDay: number | null
  patronMonth: number | null
}

export interface ScheduleInput {
  validFrom: string
  minutes: number[]
}

/** Orario personale: o i minuti, o il ritorno all'orario della sede da quella data */
export type UserScheduleInput = { validFrom: string; minutes: number[] } | { validFrom: string; followsLocation: true }

export interface ClosureInput {
  /** null = tutte le sedi */
  locationId: number | null
  startsOn: string
  endsOn: string
  description: string
}

const detailResponse = z.object({ data: locationDetailSchema })
const scheduleResponse = z.object({ data: workScheduleSchema })
const closureResponse = z.object({ data: closureSchema })

const locationBody = ({ name, city, patronDay, patronMonth }: LocationInput) => ({
  name,
  city: city.trim() === '' ? null : city.trim(),
  patron_day: patronDay,
  patron_month: patronMonth,
})

const closureBody = ({ locationId, startsOn, endsOn, description }: ClosureInput) => ({
  location_id: locationId,
  starts_on: startsOn,
  ends_on: endsOn,
  description,
})

/**
 * Dopo ogni modifica si ricaricano le query admin (sedi, utenti, amministratori) e l'utente corrente: rinominare la
 * propria sede o crearne una seconda cambia profilo e campi Sede.
 */
const useLocationMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    // Anche dopo un errore (es. 409): i dati mostrati potrebbero essere superati
    onSettled: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: adminQueryKey }), queryClient.invalidateQueries({ queryKey: userQueryKey })])
    },
  })
}

export const useLocations = ({ status, sort, page }: LocationListParams) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'list', status, sort, page],
    queryFn: () => {
      const query = new URLSearchParams({ 'filter[status]': status, sort })
      if (page > 1) query.set('page', String(page))
      return requestData('GET', `/api/locations?${query.toString()}`, locationListSchema)
    },
    placeholderData: keepPreviousData,
  })

/** Sedi attive per le select (invito, Modifica, filtro): al massimo 500, ordinate per nome. */
export const useLocationOptions = (enabled = true) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'options'],
    queryFn: async () => (await requestData('GET', '/api/locations/options', z.object({ data: z.array(locationOptionSchema) }))).data,
    enabled,
  })

export const useLocation = (id: number) =>
  useQuery({ queryKey: [...locationsQueryKey, 'detail', id], queryFn: async () => (await requestData('GET', `/api/locations/${id}`, detailResponse)).data })

export const useCreateLocation = () => useLocationMutation((input: LocationInput) => requestData('POST', '/api/locations', detailResponse, locationBody(input)))

export const useUpdateLocation = (id: number) =>
  useLocationMutation((input: LocationInput) => requestData('PATCH', `/api/locations/${id}`, detailResponse, locationBody(input)))

export const useMakePrimaryLocation = () => useLocationMutation((id: number) => requestData('POST', `/api/locations/${id}/primary`, detailResponse))

export const useArchiveLocation = () => useLocationMutation((id: number) => requestData('POST', `/api/locations/${id}/archive`, detailResponse))

export const useRestoreLocation = () => useLocationMutation((id: number) => requestData('POST', `/api/locations/${id}/restore`, detailResponse))

export const useLocationSchedules = (id: number) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'schedules', id],
    queryFn: async () => (await requestData('GET', `/api/locations/${id}/schedules`, z.object({ data: z.array(workScheduleSchema) }))).data,
  })

export const useAddLocationSchedule = (id: number) =>
  useLocationMutation(({ validFrom, minutes }: ScheduleInput) =>
    requestData('POST', `/api/locations/${id}/schedules`, scheduleResponse, { valid_from: validFrom, minutes }),
  )

export const useDeleteLocationSchedule = (id: number) =>
  useLocationMutation((scheduleId: number) => request('DELETE', `/api/locations/${id}/schedules/${scheduleId}`))

export const useLocationCalendar = (id: number, year: number) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'calendar', id, year],
    queryFn: async () => (await requestData('GET', `/api/locations/${id}/calendar?year=${year}`, calendarSchema)).data,
    placeholderData: keepPreviousData,
  })

/** Chiusure dell'anno: con una sede, le sue più quelle di tutte le sedi (spec §4.3). */
export const useClosures = (year: number, locationId: number | null) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'closures', year, locationId],
    queryFn: async () => {
      const query = new URLSearchParams({ year: String(year) })
      if (locationId !== null) query.set('filter[location]', String(locationId))
      return (await requestData('GET', `/api/closures?${query.toString()}`, z.object({ data: z.array(closureSchema) }))).data
    },
    placeholderData: keepPreviousData,
  })

export const useCreateClosure = () => useLocationMutation((input: ClosureInput) => requestData('POST', '/api/closures', closureResponse, closureBody(input)))

export const useUpdateClosure = () =>
  useLocationMutation(({ id, ...input }: ClosureInput & { id: number }) => requestData('PATCH', `/api/closures/${id}`, closureResponse, closureBody(input)))

export const useDeleteClosure = () => useLocationMutation((id: number) => request('DELETE', `/api/closures/${id}`))

export const useUserSchedules = (userId: number) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'user-schedules', userId],
    queryFn: async () => (await requestData('GET', `/api/users/${userId}/schedules`, userSchedulesSchema)).data,
  })

export const useAddUserSchedule = (userId: number) =>
  useLocationMutation((input: UserScheduleInput) =>
    requestData(
      'POST',
      `/api/users/${userId}/schedules`,
      scheduleResponse,
      'followsLocation' in input ? { valid_from: input.validFrom, follows_location: true } : { valid_from: input.validFrom, minutes: input.minutes },
    ),
  )

export const useDeleteUserSchedule = (userId: number) =>
  useLocationMutation((scheduleId: number) => request('DELETE', `/api/users/${userId}/schedules/${scheduleId}`))
```

- [ ] **Step 10: Fixture delle sedi**

`apps/react/src/test/locationsFixtures.ts`:

```ts
import type { Closure, Location, LocationDetail, WorkSchedule } from '@/features/locations/api'

export const schedule = (overrides: Partial<WorkSchedule> = {}): WorkSchedule => ({
  id: 1,
  valid_from: '2026-01-01',
  follows_location: false,
  minutes: [480, 480, 480, 480, 480, 0, 0],
  is_started: true,
  ...overrides,
})

export const location = (overrides: Partial<Location> = {}): Location => ({
  id: 1,
  name: 'Sede principale',
  city: 'Milano',
  country: 'IT',
  timezone: 'Europe/Rome',
  patron_day: 7,
  patron_month: 12,
  is_primary: true,
  archived_at: null,
  users_count: 12,
  managers_count: 2,
  ...overrides,
})

export const locationDetail = (overrides: Partial<LocationDetail> = {}): LocationDetail => ({
  ...location(),
  current_schedule: schedule(),
  ...overrides,
})

export const closure = (overrides: Partial<Closure> = {}): Closure => ({
  id: 1,
  location_id: null,
  location_name: null,
  starts_on: '2026-08-10',
  ends_on: '2026-08-21',
  description: 'Chiusura estiva',
  ...overrides,
})

export const locationListResponse = (locations: Location[], counts = { active: locations.length, archived: 0 }) => ({
  data: locations,
  links: {},
  meta: { current_page: 1, last_page: 1, per_page: 25, total: locations.length, counts },
})
```

- [ ] **Step 11: Testi — ruolo "Utente" e tipi di rapporto**

In `apps/react/src/locales/it.json`, dentro `users`:

```json
"roles": { "employee": "Utente", "manager": "Responsabile", "admin": "HR / Admin" },
"employmentTypes": { "employee": "Dipendente", "contractor": "Collaboratore esterno", "intern": "Stagista" },
```

e in `users.sort`:

```json
"role": "Ruolo (utente → admin)",
"-role": "Ruolo (admin → utente)",
```

In `apps/react/src/locales/en.json`, dentro `users`:

```json
"roles": { "employee": "User", "manager": "Manager", "admin": "HR / Admin" },
"employmentTypes": { "employee": "Employee", "contractor": "External contractor", "intern": "Intern" },
```

e in `users.sort`:

```json
"role": "Role (user → admin)",
"-role": "Role (admin → user)",
```

In `apps/react/e2e/admin-users.spec.ts` (test della revoca) sostituisci:

```ts
  await revoke.getByRole('radio', { name: 'Dipendente' }).check()
```

con:

```ts
  await revoke.getByRole('radio', { name: 'Utente' }).check()
```

e il commento `// Dipendente: nessuna password di chi agisce` con `// Utente (ruolo base): nessuna password di chi agisce`.

- [ ] **Step 12: Esegui i test e verifica che passino**

Run: `cd apps/react && npx vitest run src/features/locations src/features/auth/api.test.tsx`
Expected: PASS.

- [ ] **Step 13: Gate**

Run: `cd apps/react && npm test && npm run lint && npm run build`
Expected: tutto verde. Se un test esistente cerca il testo "Dipendente" come **ruolo** (non come tipo), aggiornalo a "Utente": è il rinomino voluto (spec §7.2).

- [ ] **Step 14: Commit**

```bash
git add apps/react/src/features/auth/api.ts apps/react/src/features/auth/api.test.tsx apps/react/src/test/fixtures.ts \
  apps/react/src/features/users/api.ts apps/react/src/test/usersFixtures.ts apps/react/src/lib/queryKeys.ts \
  apps/react/src/features/locations apps/react/src/test/locationsFixtures.ts apps/react/src/locales/it.json apps/react/src/locales/en.json \
  apps/react/src/features/profile/pages/ProfilePage.test.tsx apps/react/e2e/admin-users.spec.ts
git commit -m "feat(sedi): utente corrente con sede e tipo, ruolo Utente e hook delle sedi"
```

## Task 11: Frontend — lista delle sedi

**Files:**
- Create: `apps/react/src/features/locations/pages/LocationsPage.tsx`
- Create: `apps/react/src/features/locations/pages/LocationsPage.test.tsx`
- Create: `apps/react/src/features/locations/components/LocationBadge.tsx`
- Create: `apps/react/src/features/locations/components/LocationsTable.tsx`
- Create: `apps/react/src/features/locations/components/LocationActionsMenu.tsx`
- Create: `apps/react/src/features/locations/components/LocationConfirmDialog.tsx`
- Create: `apps/react/src/features/locations/components/LocationFormDialog.tsx` (nuova sede e modifica, riusato nel Task 12)
- Modify: `apps/react/src/lib/focusTrigger.ts` (attributo dei pulsanti delle sedi)
- Modify: `apps/react/src/routes.tsx` (rotta `/admin/locations`, solo admin)
- Modify: `apps/react/src/components/layout/AppShell.tsx` (voce **Sedi**)
- Modify: `apps/react/src/components/layout/AppShell.test.tsx`
- Modify: `apps/react/src/lib/themeContrast.test.ts` (badge Principale e Tutte le sedi)
- Modify: `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`

**Interfaces:**
- Consumes (Task 10): `useLocations`, `useCreateLocation`, `useUpdateLocation`, `useMakePrimaryLocation`, `useArchiveLocation`, `useRestoreLocation`, i tipi `Location`, `LocationStatus`, `LocationSort`, `LocationInput`; `parsePatron`, `formatPatron`; `locationListResponse`, `location` dei fixture.
- Produces:
  - `LocationBadge` — `interface LocationBadgeProps { kind: 'primary' | 'noManager' | 'allLocations' | 'archived' }`;
  - `LocationFormDialog` — `interface LocationFormDialogProps { open: boolean; location: Location | null; onClose: () => void }` (`location` null = nuova sede; dopo la creazione porta al dettaglio);
  - `LOCATION_TRIGGER_ATTRIBUTE = 'data-location-actions-trigger'` in `lib/focusTrigger.ts`;
  - rotta lazy `/admin/locations` (titolo `titles.locations`) e voce **Sedi** nella sidebar per gli admin.

- [ ] **Step 1: Scrivi il test che fallisce — pagina delle sedi**

`apps/react/src/features/locations/pages/LocationsPage.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import LocationsPage from '@/features/locations/pages/LocationsPage'
import { expectNoA11yViolations } from '@/test/axe'
import { location, locationDetail, locationListResponse } from '@/test/locationsFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/admin/locations', element: <LocationsPage /> },
  { path: '/admin/locations/:id', element: <h1>Dettaglio sede</h1> },
  { path: '/users', element: <h1>Utenti</h1> },
]

const milano = location()
const bergamo = location({ id: 2, name: 'Bergamo', city: 'Bergamo', patron_day: 26, patron_month: 8, is_primary: false, users_count: 0, managers_count: 0 })

const listing = (onRequest: (url: URL) => void = () => undefined, active = [milano, bergamo], archived = [location({ id: 3, name: 'Torino', is_primary: false, archived_at: '2026-09-01T10:00:00+02:00', users_count: 0 })]) =>
  server.use(
    http.get('/api/locations', ({ request }) => {
      const url = new URL(request.url)
      onRequest(url)
      const list = url.searchParams.get('filter[status]') === 'archived' ? archived : active
      return HttpResponse.json(locationListResponse(list, { active: active.length, archived: archived.length }))
    }),
  )

const row = async (name: string): Promise<HTMLElement> => {
  const table = await screen.findByRole('table')
  const found = within(table).getAllByRole('row').find((item) => within(item).queryByRole('link', { name }) !== null)
  if (!found) throw new Error(`Riga ${name} mancante`)
  return found
}

describe('LocationsPage', () => {
  it('lists active locations with people, managers, badges and the counts on the tabs', async () => {
    listing()
    renderRoutes(routes, ['/admin/locations'])

    const milanoRow = await row('Sede principale')
    expect(within(milanoRow).getByText('Principale')).toBeInTheDocument()
    expect(within(milanoRow).getByText('Milano')).toBeInTheDocument()
    expect(within(milanoRow).getByText('12')).toBeInTheDocument()
    const bergamoRow = await row('Bergamo')
    expect(within(bergamoRow).getByText('Nessun responsabile')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Attive/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /Archiviate/ })).toHaveTextContent('1')
  })

  it('opens the detail from the name', async () => {
    listing()
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('link', { name: 'Bergamo' }))

    expect(router.state.location.pathname).toBe('/admin/locations/2')
  })

  it('shows archived locations in their tab, with the status and the sort in the URL', async () => {
    const urls: URL[] = []
    listing((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await row('Bergamo')
    await user.click(screen.getByRole('tab', { name: /Archiviate/ }))
    expect(await screen.findByRole('link', { name: 'Torino' })).toBeInTheDocument()
    expect(urls.at(-1)?.searchParams.get('filter[status]')).toBe('archived')
    expect(router.state.location.search).toBe('?status=archived')

    await user.click(screen.getByRole('button', { name: /Nome/ }))
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('sort')).toBe('-name'))
    expect(screen.getByRole('columnheader', { name: /Nome/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('creates a location and opens its detail', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.post('/api/locations', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: locationDetail({ id: 5, name: 'Roma', is_primary: false }) }, { status: 201 })
      }),
    )
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await user.click(await screen.findByRole('button', { name: 'Nuova sede' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuova sede' })
    expect(within(dialog).getByText(/L’orario parte uguale a quello della sede principale/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nome'), 'Roma')
    await user.type(within(dialog).getByLabelText('Città'), 'Roma')
    await user.type(within(dialog).getByLabelText('Patrono (giorno/mese)'), '29/02')
    await user.click(within(dialog).getByRole('button', { name: 'Crea sede' }))

    expect(await within(dialog).findByText('Scrivi giorno e mese come 07/12, con una data che esiste.')).toBeInTheDocument()
    expect(body).toBeNull()

    await user.clear(within(dialog).getByLabelText('Patrono (giorno/mese)'))
    await user.type(within(dialog).getByLabelText('Patrono (giorno/mese)'), '29/6')
    await user.click(within(dialog).getByRole('button', { name: 'Crea sede' }))

    expect(await screen.findByText('Sede Roma creata.')).toBeInTheDocument()
    expect(body).toEqual({ name: 'Roma', city: 'Roma', patron_day: 29, patron_month: 6 })
    expect(router.state.location.pathname).toBe('/admin/locations/5')
  })

  it('shows the server errors under the fields', async () => {
    listing()
    server.use(http.post('/api/locations', () => HttpResponse.json({ message: 'x', errors: { name: ['Esiste già una sede con questo nome.'] } }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(await screen.findByRole('button', { name: 'Nuova sede' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuova sede' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Bergamo')
    await user.click(within(dialog).getByRole('button', { name: 'Crea sede' }))

    expect(await within(dialog).findByText('Esiste già una sede con questo nome.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus()
  })

  it('makes a location the primary one after a confirmation', async () => {
    listing()
    let calls = 0
    server.use(
      http.post('/api/locations/2/primary', () => {
        calls += 1
        return HttpResponse.json({ data: locationDetail({ id: 2, name: 'Bergamo', is_primary: true }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('button', { name: 'Azioni per Bergamo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Imposta come principale' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Rendere Bergamo la sede principale?' })
    await user.click(within(dialog).getByRole('button', { name: 'Imposta come principale' }))

    expect(await screen.findByText('Bergamo ora è la sede principale.')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('explains why a location with people or the primary one cannot be archived', async () => {
    listing()
    let calls = 0
    server.use(
      http.post('/api/locations/:id/archive', () => {
        calls += 1
        return HttpResponse.json({ message: 'x' }, { status: 409 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Sede principale')).getByRole('button', { name: 'Azioni per Sede principale' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archivia' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Non puoi archiviare Sede principale' })
    expect(within(dialog).getByText(/È la sede principale/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Archivia' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ho capito' }))
    expect(calls).toBe(0)
  })

  it('archives an empty location and restores an archived one', async () => {
    listing()
    const posted: string[] = []
    server.use(
      http.post('/api/locations/2/archive', () => {
        posted.push('archive')
        return HttpResponse.json({ data: locationDetail({ id: 2, name: 'Bergamo', is_primary: false, archived_at: '2026-10-15T10:00:00+02:00' }) })
      }),
      http.post('/api/locations/3/restore', () => {
        posted.push('restore')
        return HttpResponse.json({ data: locationDetail({ id: 3, name: 'Torino', is_primary: false }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('button', { name: 'Azioni per Bergamo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archivia' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Archiviare Bergamo?' })).getByRole('button', { name: 'Archivia' }))
    expect(await screen.findByText('Bergamo archiviata.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Archiviate/ }))
    await user.click(within(await row('Torino')).getByRole('button', { name: 'Azioni per Torino' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ripristina' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Ripristinare Torino?' })).getByRole('button', { name: 'Ripristina' }))
    expect(await screen.findByText('Torino ripristinata.')).toBeInTheDocument()
    expect(posted).toEqual(['archive', 'restore'])
  })

  it('links to the people of a location', async () => {
    listing()
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('button', { name: 'Azioni per Bergamo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Vedi persone' }))

    expect(router.state.location.pathname).toBe('/users')
    expect(router.state.location.search).toBe('?location=2')
  })

  it('has no accessibility violations', async () => {
    listing()
    const { container } = renderRoutes(routes, ['/admin/locations'])

    await row('Bergamo')
    await expectNoA11yViolations(container)
  })
})
```

In `apps/react/src/components/layout/AppShell.test.tsx` aggiungi (l'import di `User` da `@/features/auth/api` si aggiunge in cima):

```tsx
  it('shows Locations in the management menu only to admins', async () => {
    signedIn()
    const { unmount } = renderRoutes(routes, ['/'], { toaster: false })

    const nav = await screen.findByRole('navigation', { name: 'Navigazione principale' })
    expect(within(nav).getByRole('link', { name: 'Sedi' })).toHaveAttribute('href', '/admin/locations')
    unmount()

    const manager: User = { ...adminUser, role: 'manager', role_label: 'Responsabile' }
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(manager))))
    renderRoutes(routes, ['/'], { toaster: false })
    const managerNav = await screen.findByRole('navigation', { name: 'Navigazione principale' })
    expect(within(managerNav).getByRole('link', { name: 'Utenti' })).toBeInTheDocument()
    expect(within(managerNav).queryByRole('link', { name: 'Sedi' })).not.toBeInTheDocument()
  })
```

(aggiungi `within` all'import da `@testing-library/react`).

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `cd apps/react && npx vitest run src/features/locations/pages/LocationsPage.test.tsx src/components/layout/AppShell.test.tsx`
Expected: FAIL — `LocationsPage` inesistente, nessuna voce "Sedi".

- [ ] **Step 3: Attributo per riportare il focus**

In `apps/react/src/lib/focusTrigger.ts`, dopo `INVITATION_TRIGGER_ATTRIBUTE`:

```ts
/** Menu di riga delle sedi */
export const LOCATION_TRIGGER_ATTRIBUTE = 'data-location-actions-trigger'
/** Pulsanti del dettaglio di una sede (Modifica, Cambia orario, chiusure): il valore dice quale */
export const LOCATION_DETAIL_TRIGGER_ATTRIBUTE = 'data-location-detail-trigger'
```

- [ ] **Step 4: Badge delle sedi**

`apps/react/src/features/locations/components/LocationBadge.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type LocationBadgeKind = 'primary' | 'noManager' | 'allLocations' | 'archived'

interface LocationBadgeProps {
  kind: LocationBadgeKind
}

// Colori di significato (token in index.css, contrasto AA nei due temi): principale e "tutte le sedi" nel primario
// tenue, nessun responsabile in ambra come un avviso, archiviata in grigio come uno stato spento
const CLASSES: Record<LocationBadgeKind, string> = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  noManager: 'bg-status-invited text-status-invited-foreground',
  allLocations: 'bg-primary-soft text-primary-soft-foreground',
  archived: 'bg-status-disabled text-status-disabled-foreground',
}

/** Etichetta sempre in testo: il colore non è l'unico segnale. */
const LocationBadge = ({ kind }: LocationBadgeProps) => {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" data-kind={kind} className={cn(CLASSES[kind])}>
      {t(`locations.badges.${kind}`)}
    </Badge>
  )
}

export default LocationBadge
```

- [ ] **Step 5: Tabella e menu di riga**

`apps/react/src/features/locations/components/LocationActionsMenu.tsx`:

```tsx
import { Ellipsis } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Location } from '@/features/locations/api'
import { LOCATION_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

export type LocationAction = 'primary' | 'archive' | 'restore'

interface LocationActionsMenuProps {
  location: Location
  onSelect: (action: LocationAction) => void
}

/**
 * Menu di riga di una sede (spec SP2 fase 1 §5.2): Apri, Imposta come principale, Vedi persone, Archivia o Ripristina.
 * Archivia c'è sempre per una sede attiva: se non si può, il dialog spiega perché invece di una voce spenta e muta.
 */
const LocationActionsMenu = ({ location, onSelect }: LocationActionsMenuProps) => {
  const { t } = useTranslation()
  const archived = location.archived_at !== null
  // Impostato dal gestore della voce scelta, letto alla chiusura del menu (mai durante il render)
  const selected = useRef(false)
  const choose = (action: LocationAction) => {
    selected.current = true
    onSelect(action)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('locations.actions.menu', { name: location.name })} {...{ [LOCATION_TRIGGER_ATTRIBUTE]: location.id }}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* Con una voce che apre un dialog il focus lo gestisce il dialog (vedi lib/focusTrigger) */}
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (selected.current) event.preventDefault()
          selected.current = false
        }}
      >
        <DropdownMenuItem asChild>
          <Link to={`/admin/locations/${location.id}`}>{t('locations.actions.open')}</Link>
        </DropdownMenuItem>
        {!location.is_primary && !archived && <DropdownMenuItem onSelect={() => choose('primary')}>{t('locations.actions.primary')}</DropdownMenuItem>}
        <DropdownMenuItem asChild>
          <Link to={`/users?location=${location.id}`}>{t('locations.actions.people')}</Link>
        </DropdownMenuItem>
        {archived ? (
          <DropdownMenuItem onSelect={() => choose('restore')}>{t('locations.actions.restore')}</DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={() => choose('archive')}>
            {t('locations.actions.archive')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LocationActionsMenu
```

`apps/react/src/features/locations/components/LocationsTable.tsx`:

```tsx
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Location, LocationSort } from '@/features/locations/api'
import LocationBadge from '@/features/locations/components/LocationBadge'

interface LocationsTableProps {
  locations: Location[]
  sort: LocationSort
  onSortChange: (sort: LocationSort) => void
  renderActions: (location: Location) => ReactNode
}

/** Badge di una sede: principale, archiviata e, per una sede attiva senza responsabili, l'avviso. */
const badges = (location: Location): ReactNode => (
  <>
    {location.is_primary && <LocationBadge kind="primary" />}
    {location.archived_at !== null && <LocationBadge kind="archived" />}
    {location.archived_at === null && location.managers_count === 0 && <LocationBadge kind="noManager" />}
  </>
)

/** Tabella su desktop, schede su mobile: le due viste sono nel DOM e si alternano via CSS, come la lista utenti. */
const LocationsTable = ({ locations, sort, onSortChange, renderActions }: LocationsTableProps) => {
  const { t } = useTranslation()
  const descending = sort === '-name'
  const SortIcon = descending ? ArrowDown : ArrowUp

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t('locations.title')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead aria-sort={descending ? 'descending' : 'ascending'}>
                <Button variant="ghost" size="sm" className="-ml-3 font-medium text-foreground" onClick={() => onSortChange(descending ? 'name' : '-name')}>
                  {t('locations.columns.name')}
                  <SortIcon aria-hidden="true" />
                </Button>
              </TableHead>
              <TableHead>{t('locations.columns.city')}</TableHead>
              <TableHead>{t('locations.columns.people')}</TableHead>
              <TableHead>{t('locations.columns.managers')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('locations.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/locations/${location.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {location.name}
                    </Link>
                    {badges(location)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{location.city ?? ''}</TableCell>
                <TableCell className="tabular-nums">{location.users_count}</TableCell>
                <TableCell className="tabular-nums">{location.managers_count}</TableCell>
                <TableCell className="text-right">{renderActions(location)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {locations.map((location) => (
          <li key={location.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-4">
            <div className="grid gap-2">
              <Link to={`/admin/locations/${location.id}`} className="font-semibold underline-offset-4 hover:underline">
                {location.name}
              </Link>
              {location.city && <span className="text-sm text-muted-foreground">{location.city}</span>}
              <span className="text-sm">
                {t('locations.people', { count: location.users_count })} · {t('locations.managers', { count: location.managers_count })}
              </span>
              <div className="flex flex-wrap items-center gap-2">{badges(location)}</div>
            </div>
            <div className="-mt-2 -mr-2">{renderActions(location)}</div>
          </li>
        ))}
      </ul>
    </>
  )
}

export default LocationsTable
```

- [ ] **Step 6: Conferme (principale, archivia, ripristina)**

`apps/react/src/features/locations/components/LocationConfirmDialog.tsx`:

```tsx
import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useArchiveLocation, useMakePrimaryLocation, useRestoreLocation, type Location } from '@/features/locations/api'
import type { LocationAction } from '@/features/locations/components/LocationActionsMenu'
import { isApiError } from '@/lib/api'
import { focusTrigger, LOCATION_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface LocationConfirmDialogProps {
  location: Location | null
  action: LocationAction | null
  onClose: () => void
}

/** Motivo per cui una sede non si archivia (spec §4.2): principale o con persone. null se si può. */
const archiveBlock = (location: Location): 'primary' | 'users' | null => {
  if (location.is_primary) return 'primary'
  return location.users_count > 0 ? 'users' : null
}

interface ConfirmBodyProps {
  location: Location
  action: LocationAction
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

const ConfirmBody = ({ location, action, onClose, onBusyChange }: ConfirmBodyProps) => {
  const { t } = useTranslation()
  const primary = useMakePrimaryLocation()
  const archive = useArchiveLocation()
  const restore = useRestoreLocation()
  const [pending, setPending] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)
  const blocked = action === 'archive' ? archiveBlock(location) : null
  const texts = { name: location.name, count: location.users_count }

  if (blocked !== null) {
    return (
      <>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('locations.confirm.archive.blockedTitle', texts)}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked === 'primary' ? t('locations.confirm.archive.blockedPrimary') : t('locations.confirm.archive.blockedUsers', texts)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('locations.confirm.archive.understood')}</AlertDialogCancel>
        </AlertDialogFooter>
      </>
    )
  }

  const run = () => {
    switch (action) {
      case 'primary':
        return primary.mutateAsync(location.id)
      case 'archive':
        return archive.mutateAsync(location.id)
      case 'restore':
        return restore.mutateAsync(location.id)
    }
  }

  const confirm = async () => {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    onBusyChange(true)
    try {
      await run()
    } catch (error) {
      submitting.current = false
      setPending(false)
      // 409 (es. persone aggiunte nel frattempo): il messaggio del server è già tradotto, la lista si ricarica
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      onClose()
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t(`locations.confirm.${action}.done`, texts))
    onClose()
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t(`locations.confirm.${action}.title`, texts)}</AlertDialogTitle>
        <AlertDialogDescription>{t(`locations.confirm.${action}.description`, texts)}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t('locations.confirm.back')}</AlertDialogCancel>
        <Button variant={action === 'archive' ? 'destructive' : 'default'} disabled={pending} onClick={() => void confirm()}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t(`locations.confirm.${action}.action`, texts)}
        </Button>
      </AlertDialogFooter>
    </>
  )
}

/** Conferma delle azioni di riga sulle sedi; per Archivia, se non si può, spiega il motivo. */
const LocationConfirmDialog = ({ location, action, onClose }: LocationConfirmDialogProps) => {
  const open = location !== null && action !== null
  // Contenuto conservato durante l'animazione di chiusura
  const [last, setLast] = useState<{ location: Location; action: LocationAction } | null>(null)
  if (location !== null && action !== null && (last?.location !== location || last.action !== action)) setLast({ location, action })
  const shown = open ? { location, action } : last
  // Conta le aperture: ogni apertura rimonta il corpo
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LOCATION_TRIGGER_ATTRIBUTE, shown?.location.id ?? null)
        }}
      >
        {shown && <ConfirmBody key={`${openCount}-${shown.location.id}-${shown.action}`} location={shown.location} action={shown.action} onClose={onClose} onBusyChange={setBusy} />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default LocationConfirmDialog
```

- [ ] **Step 7: Dialog di creazione e modifica**

`apps/react/src/features/locations/components/LocationFormDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useCreateLocation, useUpdateLocation, type Location } from '@/features/locations/api'
import { formatPatron, parsePatron } from '@/features/locations/patron'
import { isApiError } from '@/lib/api'

const MAX_LENGTH = 100

const createSchema = (t: TFunction) =>
  z.object({
    name: z.string().trim().min(1, t('validation.locationNameRequired')).max(MAX_LENGTH, t('validation.tooLong', { max: MAX_LENGTH })),
    city: z.string().trim().max(MAX_LENGTH, t('validation.tooLong', { max: MAX_LENGTH })),
    patron: z.string().refine((value) => parsePatron(value) !== 'invalid', t('validation.patronInvalid')),
  })

type LocationValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof LocationValues)[] = ['name', 'city', 'patron']

interface LocationFormDialogProps {
  open: boolean
  /** null = nuova sede */
  location: Location | null
  onClose: () => void
}

interface LocationFormProps {
  location: Location | null
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form si monta a ogni apertura: parte dai dati attuali (o vuoto), senza errori. */
const LocationForm = ({ location, onClose, onBusyChange }: LocationFormProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateLocation()
  const update = useUpdateLocation(location?.id ?? 0)
  const pending = create.isPending || update.isPending
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<LocationValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: location?.name ?? '',
      city: location?.city ?? '',
      patron: location ? formatPatron(location.patron_day, location.patron_month) : '',
    },
  })
  const { errors } = form.formState
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)

  const submit = async ({ name, city, patron }: LocationValues) => {
    if (submitting.current) return
    submitting.current = true
    onBusyChange(true)
    const parsed = parsePatron(patron)
    const input = { name, city, patronDay: parsed === null || parsed === 'invalid' ? null : parsed.day, patronMonth: parsed === null || parsed === 'invalid' ? null : parsed.month }
    try {
      const { data } = location === null ? await create.mutateAsync(input) : await update.mutateAsync(input)
      toast.success(location === null ? t('locations.form.created', { name: data.name }) : t('locations.form.updated', { name: data.name }))
      onClose()
      // Nuova sede: si apre il dettaglio, dove si controllano orario e chiusure
      if (location === null) void navigate(`/admin/locations/${data.id}`)
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof LocationValues, string | undefined> = {
          name: error.fieldErrors.name?.[0],
          city: error.fieldErrors.city?.[0],
          patron: error.fieldErrors.patron_day?.[0] ?? error.fieldErrors.patron_month?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        const first = FIELDS.find((field) => messages[field] !== undefined)
        if (first) form.setFocus(first)
        else toast.error(error.message)
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      onBusyChange(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="location-name">{t('locations.form.name')}</FieldLabel>
          <Input
            id="location-name"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'location-name-error' : undefined}
            {...form.register('name')}
          />
          <FieldError id="location-name-error">{errors.name?.message}</FieldError>
        </Field>
        <Field data-invalid={errors.city ? true : undefined}>
          <FieldLabel htmlFor="location-city">{t('locations.form.city')}</FieldLabel>
          <Input
            id="location-city"
            autoComplete="off"
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? 'location-city-hint location-city-error' : 'location-city-hint'}
            {...form.register('city')}
          />
          <FieldDescription id="location-city-hint">{t('locations.form.cityHint')}</FieldDescription>
          <FieldError id="location-city-error">{errors.city?.message}</FieldError>
        </Field>
        <Field data-invalid={errors.patron ? true : undefined}>
          <FieldLabel htmlFor="location-patron">{t('locations.form.patron')}</FieldLabel>
          <Input
            id="location-patron"
            inputMode="numeric"
            autoComplete="off"
            placeholder="07/12"
            className="max-w-32"
            aria-invalid={errors.patron ? true : undefined}
            aria-describedby={errors.patron ? 'location-patron-hint location-patron-error' : 'location-patron-hint'}
            {...form.register('patron')}
          />
          <FieldDescription id="location-patron-hint">{t('locations.form.patronHint')}</FieldDescription>
          <FieldError id="location-patron-error">{errors.patron?.message}</FieldError>
        </Field>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {location === null ? t('locations.form.submitCreate') : t('locations.form.submitEdit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nuova sede (dalla lista) o modifica di nome, città e patrono (dal dettaglio). */
const LocationFormDialog = ({ open, location, onClose }: LocationFormDialogProps) => {
  const { t } = useTranslation()
  // Titolo conservato durante l'animazione di chiusura
  const [last, setLast] = useState<Location | null>(location)
  if (location !== null && location !== last) setLast(location)
  const shown = open ? location : last
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shown === null ? t('locations.form.createTitle') : t('locations.form.editTitle', { name: shown.name })}</DialogTitle>
          <DialogDescription>{shown === null ? t('locations.form.createDescription') : t('locations.form.editDescription')}</DialogDescription>
        </DialogHeader>
        {open && <LocationForm key={openCount} location={location} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default LocationFormDialog
```

- [ ] **Step 8: Pagina della lista**

`apps/react/src/features/locations/pages/LocationsPage.tsx`:

```tsx
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLocations, type Location, type LocationSort, type LocationStatus } from '@/features/locations/api'
import LocationActionsMenu, { type LocationAction } from '@/features/locations/components/LocationActionsMenu'
import LocationConfirmDialog from '@/features/locations/components/LocationConfirmDialog'
import LocationFormDialog from '@/features/locations/components/LocationFormDialog'
import LocationsTable from '@/features/locations/components/LocationsTable'

const STATUSES: LocationStatus[] = ['active', 'archived']

const isStatus = (value: string): value is LocationStatus => STATUSES.some((status) => status === value)

const toPage = (value: string | null): number => {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isNaN(page) || page < 1 ? 1 : page
}

/** Sezione Sedi (solo admin, spec SP2 fase 1 §5.2): schede Attive e Archiviate, stato e ordinamento nell'URL. */
const LocationsPage = () => {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status') ?? ''
  const status: LocationStatus = isStatus(statusParam) ? statusParam : 'active'
  const sort: LocationSort = searchParams.get('sort') === '-name' ? '-name' : 'name'
  const page = toPage(searchParams.get('page'))
  const locations = useLocations({ status, sort, page })
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<{ location: Location; action: LocationAction } | null>(null)

  // Scrive solo i valori diversi dal default, come la lista utenti
  const update = (next: { status?: LocationStatus; sort?: LocationSort; page?: number }) =>
    setSearchParams((current) => {
      const merged = { status, sort, page, ...next }
      const query = new URLSearchParams(current)
      query.delete('status')
      query.delete('sort')
      query.delete('page')
      if (merged.status !== 'active') query.set('status', merged.status)
      if (merged.sort !== 'name') query.set('sort', merged.sort)
      if (merged.page > 1) query.set('page', String(merged.page))
      return query
    })

  // Stabile: la tabella non ricrea i menu a ogni render
  const renderActions = useCallback((location: Location) => <LocationActionsMenu location={location} onSelect={(action) => setConfirm({ location, action })} />, [])

  const lastPage = locations.data?.meta.last_page ?? 1

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('locations.title')} description={t('locations.subtitle')} className="mb-0" />
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('locations.add')}
        </Button>
      </div>
      <Tabs value={status} onValueChange={(next) => isStatus(next) && update({ status: next, page: 1 })}>
        <TabsList aria-label={t('locations.tabs.label')}>
          {STATUSES.map((item) => (
            <TabsTrigger key={item} value={item} className="h-7 flex-none gap-1.5 text-muted-foreground">
              {t(`locations.tabs.${item}`)}
              {locations.data !== undefined && (
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{locations.data.meta.counts[item]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status}>
          {locations.isPending ? (
            <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : locations.isError ? (
            <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
              <p>{t('locations.loadError')}</p>
              <Button variant="outline" onClick={() => void locations.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : locations.data.data.length === 0 ? (
            <p className="rounded-lg border p-6">{t(`locations.empty.${status}`)}</p>
          ) : (
            <div aria-busy={locations.isPlaceholderData || undefined}>
              <LocationsTable locations={locations.data.data} sort={sort} onSortChange={(next) => update({ sort: next, page: 1 })} renderActions={renderActions} />
              {lastPage > 1 && (
                <nav aria-label={t('locations.pagination.label')} className="mt-4 flex items-center justify-end gap-1">
                  <p aria-live="polite" className="mr-2 text-sm">
                    {t('locations.pagination.status', { page, pages: lastPage })}
                  </p>
                  <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => update({ page: page - 1 })} aria-label={t('locations.pagination.previous')}>
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <Button variant="outline" size="icon" disabled={page >= lastPage} onClick={() => update({ page: page + 1 })} aria-label={t('locations.pagination.next')}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <LocationFormDialog open={creating} location={null} onClose={() => setCreating(false)} />
      <LocationConfirmDialog location={confirm?.location ?? null} action={confirm?.action ?? null} onClose={() => setConfirm(null)} />
    </>
  )
}

export default LocationsPage
```

- [ ] **Step 9: Rotta e voce della sidebar**

In `apps/react/src/routes.tsx`, accanto alle altre pagine lazy:

```tsx
const LocationsPage = lazy(() => import('@/features/locations/pages/LocationsPage'))
```

e sostituisci il blocco della rotta solo admin:

```tsx
                  {
                    element: <RoleRoute roles={['admin']} />,
                    children: [
                      { path: '/admin/administrators', element: <AdministratorsPage />, handle: { titleKey: 'titles.administrators' } },
                      // Sezione Sedi: solo l'admin le gestisce (spec SP2 fase 1 §5.1)
                      { path: '/admin/locations', element: <LocationsPage />, handle: { titleKey: 'titles.locations' } },
                    ],
                  },
```

In `apps/react/src/components/layout/AppShell.tsx` aggiungi `MapPin` all'import da `lucide-react` e, dopo la voce Amministratori dentro `{user.role === 'admin' && (…)}`, trasforma il blocco in un frammento con le due voci:

```tsx
                    {user.role === 'admin' && (
                      <>
                        <SidebarMenuItem>
                          <SidebarNavLink to="/admin/administrators" label={t('nav.administrators')} icon={<ShieldCheck aria-hidden="true" />} />
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarNavLink to="/admin/locations" label={t('nav.locations')} icon={<MapPin aria-hidden="true" />} />
                        </SidebarMenuItem>
                      </>
                    )}
```

- [ ] **Step 10: Contrasto dei nuovi badge**

In `apps/react/src/lib/themeContrast.test.ts`, in `PAIRS` dopo `['status-disabled-foreground', 'status-disabled', 4.5]`:

```ts
  // Badge "Principale" e "Tutte le sedi" (Nessun responsabile e Archiviata riusano i badge di stato qui sopra)
  ['primary-soft-foreground', 'primary-soft', 4.5],
```

- [ ] **Step 11: Testi**

In `apps/react/src/locales/it.json`: in `nav` aggiungi `"locations": "Sedi"`; in `titles` aggiungi `"locations": "Sedi"` e `"location": "Sede"`; in `validation` aggiungi:

```json
"locationNameRequired": "Inserisci il nome della sede.",
"tooLong": "Al massimo {{max}} caratteri.",
"patronInvalid": "Scrivi giorno e mese come 07/12, con una data che esiste."
```

e la sezione di primo livello:

```json
"locations": {
  "title": "Sedi",
  "subtitle": "Dove lavorano le persone: ogni sede ha i suoi festivi, le sue chiusure e il suo orario.",
  "add": "Nuova sede",
  "tabs": { "label": "Filtra per stato", "active": "Attive", "archived": "Archiviate" },
  "columns": { "name": "Nome", "city": "Città", "people": "Persone", "managers": "Responsabili", "actions": "Azioni" },
  "people_one": "{{count}} persona",
  "people_other": "{{count}} persone",
  "managers_one": "{{count}} responsabile",
  "managers_other": "{{count}} responsabili",
  "empty": { "active": "Nessuna sede attiva.", "archived": "Nessuna sede archiviata." },
  "loadError": "Non è stato possibile caricare le sedi.",
  "badges": { "primary": "Principale", "noManager": "Nessun responsabile", "allLocations": "Tutte le sedi", "archived": "Archiviata" },
  "pagination": { "label": "Pagine", "previous": "Pagina precedente", "next": "Pagina successiva", "status": "Pagina {{page}} di {{pages}}" },
  "actions": { "menu": "Azioni per {{name}}", "open": "Apri", "primary": "Imposta come principale", "people": "Vedi persone", "archive": "Archivia", "restore": "Ripristina" },
  "form": {
    "createTitle": "Nuova sede",
    "editTitle": "Modifica {{name}}",
    "createDescription": "L’orario parte uguale a quello della sede principale: lo cambi dal dettaglio della sede.",
    "editDescription": "Nome, città e patrono della sede.",
    "name": "Nome",
    "city": "Città",
    "cityHint": "Facoltativa.",
    "patron": "Patrono (giorno/mese)",
    "patronHint": "Es. 07/12. Lascia vuoto se la sede non ha un patrono.",
    "submitCreate": "Crea sede",
    "submitEdit": "Salva",
    "created": "Sede {{name}} creata.",
    "updated": "Sede {{name}} aggiornata."
  },
  "confirm": {
    "back": "Annulla",
    "primary": {
      "title": "Rendere {{name}} la sede principale?",
      "description": "Le persone invitate senza scegliere una sede finiranno qui.",
      "action": "Imposta come principale",
      "done": "{{name}} ora è la sede principale."
    },
    "archive": {
      "title": "Archiviare {{name}}?",
      "description": "Non comparirà più tra le sedi da assegnare. Potrai ripristinarla quando vuoi.",
      "action": "Archivia",
      "done": "{{name}} archiviata.",
      "blockedTitle": "Non puoi archiviare {{name}}",
      "blockedPrimary": "È la sede principale: scegli prima un’altra sede come principale.",
      "blockedUsers_one": "Ha ancora {{count}} persona: spostala prima in un’altra sede.",
      "blockedUsers_other": "Ha ancora {{count}} persone: spostale prima in un’altra sede.",
      "understood": "Ho capito"
    },
    "restore": {
      "title": "Ripristinare {{name}}?",
      "description": "Tornerà tra le sedi da assegnare.",
      "action": "Ripristina",
      "done": "{{name}} ripristinata."
    }
  }
}
```

In `apps/react/src/locales/en.json` le stesse chiavi: `nav.locations` "Locations"; `titles.locations` "Locations", `titles.location` "Location"; in `validation`:

```json
"locationNameRequired": "Enter the name of the location.",
"tooLong": "At most {{max}} characters.",
"patronInvalid": "Write day and month as 07/12, with a date that exists."
```

e:

```json
"locations": {
  "title": "Locations",
  "subtitle": "Where people work: each location has its own holidays, closures and working hours.",
  "add": "New location",
  "tabs": { "label": "Filter by status", "active": "Active", "archived": "Archived" },
  "columns": { "name": "Name", "city": "City", "people": "People", "managers": "Managers", "actions": "Actions" },
  "people_one": "{{count}} person",
  "people_other": "{{count}} people",
  "managers_one": "{{count}} manager",
  "managers_other": "{{count}} managers",
  "empty": { "active": "No active locations.", "archived": "No archived locations." },
  "loadError": "The locations could not be loaded.",
  "badges": { "primary": "Primary", "noManager": "No manager", "allLocations": "All locations", "archived": "Archived" },
  "pagination": { "label": "Pages", "previous": "Previous page", "next": "Next page", "status": "Page {{page}} of {{pages}}" },
  "actions": { "menu": "Actions for {{name}}", "open": "Open", "primary": "Make primary", "people": "See people", "archive": "Archive", "restore": "Restore" },
  "form": {
    "createTitle": "New location",
    "editTitle": "Edit {{name}}",
    "createDescription": "Working hours start as those of the primary location: change them from the location detail.",
    "editDescription": "Name, city and patron saint of the location.",
    "name": "Name",
    "city": "City",
    "cityHint": "Optional.",
    "patron": "Patron saint (day/month)",
    "patronHint": "E.g. 07/12. Leave empty if the location has no patron saint.",
    "submitCreate": "Create location",
    "submitEdit": "Save",
    "created": "Location {{name}} created.",
    "updated": "Location {{name}} updated."
  },
  "confirm": {
    "back": "Cancel",
    "primary": {
      "title": "Make {{name}} the primary location?",
      "description": "People invited without choosing a location will end up here.",
      "action": "Make primary",
      "done": "{{name}} is now the primary location."
    },
    "archive": {
      "title": "Archive {{name}}?",
      "description": "It will no longer be offered when assigning a location. You can restore it at any time.",
      "action": "Archive",
      "done": "{{name}} archived.",
      "blockedTitle": "You cannot archive {{name}}",
      "blockedPrimary": "It is the primary location: make another location primary first.",
      "blockedUsers_one": "{{count}} person still works here: move them to another location first.",
      "blockedUsers_other": "{{count}} people still work here: move them to another location first.",
      "understood": "Got it"
    },
    "restore": {
      "title": "Restore {{name}}?",
      "description": "It will be offered again when assigning a location.",
      "action": "Restore",
      "done": "{{name}} restored."
    }
  }
}
```

- [ ] **Step 12: Esegui i test e verifica che passino**

Run: `cd apps/react && npx vitest run src/features/locations src/components/layout/AppShell.test.tsx src/lib/themeContrast.test.ts`
Expected: PASS.

- [ ] **Step 13: Gate**

Run: `cd apps/react && npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 14: Commit**

```bash
git add apps/react/src/features/locations apps/react/src/lib/focusTrigger.ts apps/react/src/routes.tsx \
  apps/react/src/components/layout/AppShell.tsx apps/react/src/components/layout/AppShell.test.tsx \
  apps/react/src/lib/themeContrast.test.ts apps/react/src/locales/it.json apps/react/src/locales/en.json
git commit -m "feat(sedi): lista delle sedi con creazione, principale, archiviazione e ripristino"
```

## Task 12: Frontend — dettaglio della sede (dati, orario, chiusure, calendario dell'anno)

**Files:**
- Create: `apps/react/src/features/locations/dateFormat.ts`
- Create: `apps/react/src/features/locations/dateFormat.test.ts`
- Create: `apps/react/src/features/locations/components/WeeklyScheduleEditor.tsx`
- Create: `apps/react/src/features/locations/components/WeeklyScheduleEditor.test.tsx`
- Create: `apps/react/src/features/locations/components/ScheduleSummary.tsx`
- Create: `apps/react/src/features/locations/components/ScheduleVersionsList.tsx`
- Create: `apps/react/src/features/locations/components/ConfirmDeleteDialog.tsx`
- Create: `apps/react/src/features/locations/components/YearSelect.tsx`
- Create: `apps/react/src/features/locations/components/LocationDetailsCard.tsx`
- Create: `apps/react/src/features/locations/components/LocationScheduleCard.tsx`
- Create: `apps/react/src/features/locations/components/ScheduleDialog.tsx`
- Create: `apps/react/src/features/locations/components/ClosuresCard.tsx`
- Create: `apps/react/src/features/locations/components/ClosureDialog.tsx`
- Create: `apps/react/src/features/locations/components/LocationCalendarCard.tsx`
- Create: `apps/react/src/features/locations/pages/LocationDetailPage.tsx`
- Create: `apps/react/src/features/locations/pages/LocationDetailPage.test.tsx`
- Modify: `apps/react/src/routes.tsx` (rotta `/admin/locations/:id`)
- Modify: `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`

**Interfaces:**
- Consumes (Task 10 e 11): `useLocation`, `useLocationSchedules`, `useAddLocationSchedule`, `useDeleteLocationSchedule`, `useClosures`, `useCreateClosure`, `useUpdateClosure`, `useDeleteClosure`, `useLocationCalendar`; `formatMinutes`, `parseHours`, `validateWeek`, `todayIn`, `WEEKDAYS`, `formatPatron`; `LocationBadge`, `LocationFormDialog`, `LOCATION_DETAIL_TRIGGER_ATTRIBUTE`; `ProfileCard` (`@/features/profile/components/ProfileCard`, card generica con titolo h2).
- Produces (usati dal Task 14):
  - `WeeklyScheduleEditor` — `interface WeeklyScheduleEditorProps { value: number[]; onChange: (minutes: number[]) => void; disabled?: boolean }`: un giorno non valido arriva come `Number.NaN` (la validazione della settimana è di chi lo usa, con `validateWeek`);
  - `ScheduleSummary` — `interface ScheduleSummaryProps { minutes: number[] }`;
  - `ScheduleVersionsList` — `interface ScheduleVersionsListProps { schedules: WorkSchedule[]; onDelete: (schedule: WorkSchedule) => void }`;
  - `ConfirmDeleteDialog` — `interface ConfirmDeleteDialogProps { open: boolean; title: string; description: string; actionLabel: string; pending: boolean; onConfirm: () => void; onCancel: () => void; triggerKey: string | null }`;
  - `dateFormat.ts` — `formatDay(date: string, language: string, options?: Intl.DateTimeFormatOptions): string`, `daysInclusive(from: string, to: string): number`;
  - rotta lazy `/admin/locations/:id` (titolo `titles.location`).

- [ ] **Step 1: Scrivi i test che falliscono — date, editor dell'orario, pagina di dettaglio**

`apps/react/src/features/locations/dateFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { daysInclusive, formatDay } from '@/features/locations/dateFormat'

describe('formatDay', () => {
  it('formats a calendar date without moving it with the time zone of the device', () => {
    expect(formatDay('2027-03-29', 'it', { weekday: 'long', day: 'numeric', month: 'long' })).toBe('lunedì 29 marzo')
    expect(formatDay('2026-12-07', 'it')).toBe('7 dicembre 2026')
    expect(formatDay('2026-12-07', 'en')).toBe('December 7, 2026')
  })
})

describe('daysInclusive', () => {
  it('counts both ends', () => {
    expect(daysInclusive('2026-08-10', '2026-08-21')).toBe(12)
    expect(daysInclusive('2026-08-10', '2026-08-10')).toBe(1)
    // Il cambio dell'ora legale non sposta il conteggio
    expect(daysInclusive('2026-10-20', '2026-11-19')).toBe(31)
  })
})
```

`apps/react/src/features/locations/components/WeeklyScheduleEditor.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import WeeklyScheduleEditor from '@/features/locations/components/WeeklyScheduleEditor'
import { expectNoA11yViolations } from '@/test/axe'

/** Editor con lo stato in un genitore, come nei dialog: `last` è l'ultimo valore emesso. */
const renderEditor = (initial = [480, 480, 480, 480, 480, 0, 0]) => {
  const emitted: number[][] = []
  const Host = () => {
    const [value, setValue] = useState(initial)
    return (
      <WeeklyScheduleEditor
        value={value}
        onChange={(next) => {
          emitted.push(next)
          setValue(next)
        }}
      />
    )
  }
  const view = render(<Host />)
  return { ...view, user: userEvent.setup(), last: () => emitted.at(-1) }
}

describe('WeeklyScheduleEditor', () => {
  it('shows working days with their hours and the others as non-working', () => {
    renderEditor([480, 480, 480, 480, 270, 0, 0])

    expect(screen.getByRole('checkbox', { name: 'Lunedì' })).toBeChecked()
    expect(screen.getByLabelText('Ore di venerdì')).toHaveValue('4:30')
    expect(screen.getByRole('checkbox', { name: 'Sabato' })).not.toBeChecked()
    expect(screen.queryByLabelText('Ore di sabato')).not.toBeInTheDocument()
    expect(screen.getAllByText('Non lavorativo')).toHaveLength(2)
  })

  it('turns a day on with 8 hours and off again', async () => {
    const { user, last } = renderEditor()

    await user.click(screen.getByRole('checkbox', { name: 'Sabato' }))
    expect(screen.getByLabelText('Ore di sabato')).toHaveValue('8')
    expect(last()).toEqual([480, 480, 480, 480, 480, 480, 0])

    await user.click(screen.getByRole('checkbox', { name: 'Lunedì' }))
    expect(last()).toEqual([0, 480, 480, 480, 480, 480, 0])
  })

  it('emits the minutes of valid hours and NaN with an error for invalid ones', async () => {
    const { user, last } = renderEditor()

    const friday = screen.getByLabelText('Ore di venerdì')
    await user.clear(friday)
    await user.type(friday, '4,5')
    expect(last()?.[4]).toBe(270)

    await user.clear(friday)
    await user.type(friday, '4:10')
    expect(Number.isNaN(last()?.[4])).toBe(true)
    // L'errore compare lasciando il campo, non a ogni battuta
    expect(screen.queryByText(/Usa quarti d’ora/)).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('Usa quarti d’ora fino a 12 ore (es. 8 o 4:30).')).toBeInTheDocument()
    expect(friday).toHaveAttribute('aria-invalid', 'true')
  })

  it('treats zero hours on a working day as invalid: the day is turned off with the checkbox', async () => {
    const { user, last } = renderEditor()

    const monday = screen.getByLabelText('Ore di lunedì')
    await user.clear(monday)
    await user.type(monday, '0')

    expect(Number.isNaN(last()?.[0])).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const { container } = renderEditor()
    await expectNoA11yViolations(container)
  })
})
```

`apps/react/src/features/locations/pages/LocationDetailPage.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import { todayIn } from '@/features/locations/scheduleFormat'
import LocationDetailPage from '@/features/locations/pages/LocationDetailPage'
import { expectNoA11yViolations } from '@/test/axe'
import { closure, locationDetail, schedule } from '@/test/locationsFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/admin/locations', element: <h1>Sedi</h1> },
  { path: '/admin/locations/:id', element: <LocationDetailPage /> },
]

const thisYear = Number(todayIn('Europe/Rome').slice(0, 4))

const detail = (
  {
    calendarUrls = [],
    closures = [closure({ id: 1, location_id: null, description: 'Chiusura estiva' }), closure({ id: 2, location_id: 1, location_name: 'Sede principale', starts_on: `${thisYear}-12-24`, ends_on: `${thisYear}-12-24`, description: 'Vigilia' })],
  }: { calendarUrls?: URL[]; closures?: ReturnType<typeof closure>[] } = {},
) =>
  server.use(
    http.get('/api/locations/1', () => HttpResponse.json({ data: locationDetail() })),
    http.get('/api/locations/1/schedules', () =>
      HttpResponse.json({ data: [schedule({ id: 4, valid_from: '2099-01-01', is_started: false, minutes: [480, 480, 480, 480, 240, 0, 0] }), schedule()] }),
    ),
    http.get('/api/closures', () => HttpResponse.json({ data: closures })),
    http.get('/api/locations/1/calendar', ({ request }) => {
      const url = new URL(request.url)
      calendarUrls.push(url)
      const year = Number(url.searchParams.get('year'))
      return HttpResponse.json({
        data: {
          year,
          schedules: [schedule()],
          days: [
            { date: `${year}-03-29`, reasons: [{ type: 'national_holiday', label: 'Lunedì dell’Angelo' }] },
            { date: `${year}-12-07`, reasons: [{ type: 'patron', label: 'Patrono della sede' }] },
          ],
        },
      })
    }),
  )

const card = (name: string): HTMLElement => {
  const section = screen.getByRole('heading', { level: 2, name }).closest('section')
  if (!section) throw new Error(`Blocco ${name} mancante`)
  return section
}

describe('LocationDetailPage', () => {
  it('shows data, standard schedule, closures and the non-working days of the year', async () => {
    detail()
    renderRoutes(routes, ['/admin/locations/1'])

    expect(await screen.findByRole('heading', { level: 1, name: 'Sede principale' })).toBeInTheDocument()
    expect(screen.getByText('Principale')).toBeInTheDocument()
    const data = card('Dati')
    expect(within(data).getByText('07/12')).toBeInTheDocument()
    const hours = card('Orario standard')
    expect(within(hours).getAllByText('8 h').length).toBeGreaterThan(0)
    expect(await within(hours).findByText('In arrivo')).toBeInTheDocument()
    const closures = card('Chiusure')
    expect(await within(closures).findByText('Chiusura estiva')).toBeInTheDocument()
    expect(within(closures).getByText('Tutte le sedi')).toBeInTheDocument()
    const calendar = card('Calendario dell’anno')
    expect(await within(calendar).findByText('Lunedì dell’Angelo')).toBeInTheDocument()
    expect(within(calendar).getByText('Patrono della sede')).toBeInTheDocument()
    expect(within(calendar).getByText('Riposo settimanale: sabato, domenica.')).toBeInTheDocument()
  })

  it('edits name, city and patron', async () => {
    detail()
    let body: unknown = null
    server.use(
      http.patch('/api/locations/1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: locationDetail({ name: 'Milano Centro' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Dati')).getByRole('button', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Sede principale' })
    expect(within(dialog).getByLabelText('Patrono (giorno/mese)')).toHaveValue('07/12')
    await user.clear(within(dialog).getByLabelText('Nome'))
    await user.type(within(dialog).getByLabelText('Nome'), 'Milano Centro')
    await user.clear(within(dialog).getByLabelText('Patrono (giorno/mese)'))
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Sede Milano Centro aggiornata.')).toBeInTheDocument()
    expect(body).toEqual({ name: 'Milano Centro', city: 'Milano', patron_day: null, patron_month: null })
  })

  it('changes the schedule from a future day and refuses past days and empty weeks', async () => {
    detail()
    let body: unknown = null
    server.use(
      http.post('/api/locations/1/schedules', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: schedule({ id: 9, valid_from: '2099-02-01', is_started: false }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Orario standard')).getByRole('button', { name: 'Cambia orario' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia orario di Sede principale' })
    // Parte da oggi, nel fuso della sede
    expect(within(dialog).getByLabelText('Vale dal')).toHaveValue(todayIn('Europe/Rome'))

    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2000-01-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Salva orario' }))
    expect(await within(dialog).findByText('Scegli oggi o una data futura.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2099-02-01' } })
    for (const day of ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì']) await user.click(within(dialog).getByRole('checkbox', { name: day }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva orario' }))
    expect(await within(dialog).findByText('Almeno un giorno deve essere lavorativo.')).toBeInTheDocument()
    expect(body).toBeNull()

    await user.click(within(dialog).getByRole('checkbox', { name: 'Lunedì' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Sabato' }))
    await user.clear(within(dialog).getByLabelText('Ore di sabato'))
    await user.type(within(dialog).getByLabelText('Ore di sabato'), '4')
    await user.click(within(dialog).getByRole('button', { name: 'Salva orario' }))

    expect(await screen.findByText('Nuovo orario salvato: vale dal 1 febbraio 2099.')).toBeInTheDocument()
    expect(body).toEqual({ valid_from: '2099-02-01', minutes: [480, 0, 0, 0, 0, 240, 0] })
  })

  it('deletes a schedule that has not started yet', async () => {
    detail()
    let deleted = false
    server.use(
      http.delete('/api/locations/1/schedules/4', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(await within(card('Orario standard')).findByRole('button', { name: 'Elimina l’orario dal 1 gennaio 2099' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Eliminare l’orario dal 1 gennaio 2099?' })
    await user.click(within(dialog).getByRole('button', { name: 'Elimina' }))

    expect(await screen.findByText('Orario dal 1 gennaio 2099 eliminato.')).toBeInTheDocument()
    expect(deleted).toBe(true)
  })

  it('adds a company-wide closure and refuses closures longer than 31 days', async () => {
    detail({ closures: [] })
    let body: unknown = null
    server.use(
      http.post('/api/closures', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: closure() }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Chiusure')).getByRole('button', { name: 'Aggiungi chiusura' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuova chiusura' })
    await user.click(within(dialog).getByRole('radio', { name: 'Tutte le sedi' }))
    fireEvent.change(within(dialog).getByLabelText('Dal'), { target: { value: `${thisYear}-08-01` } })
    fireEvent.change(within(dialog).getByLabelText('Al'), { target: { value: `${thisYear}-09-15` } })
    await user.type(within(dialog).getByLabelText('Descrizione'), 'Chiusura estiva')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await within(dialog).findByText('Una chiusura dura al massimo 31 giorni.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Al'), { target: { value: `${thisYear}-08-21` } })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Chiusura aggiunta.')).toBeInTheDocument()
    expect(body).toEqual({ location_id: null, starts_on: `${thisYear}-08-01`, ends_on: `${thisYear}-08-21`, description: 'Chiusura estiva' })
  })

  it('reads the calendar of the chosen year', async () => {
    const urls: URL[] = []
    detail({ calendarUrls: urls })
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    const calendar = card('Calendario dell’anno')
    await user.click(within(calendar).getByRole('combobox', { name: 'Anno' }))
    await user.click(await screen.findByRole('option', { name: String(thisYear + 1) }))

    await waitFor(() => expect(urls.at(-1)?.searchParams.get('year')).toBe(String(thisYear + 1)))
  })

  it('says when the location does not exist', async () => {
    server.use(http.get('/api/locations/99', () => HttpResponse.json({ message: 'Not found.' }, { status: 404 })))
    renderRoutes(routes, ['/admin/locations/99'])

    expect(await screen.findByText('Sede non trovata.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tutte le sedi/ })).toHaveAttribute('href', '/admin/locations')
  })

  it('has no accessibility violations', async () => {
    detail()
    const { container } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByText('Lunedì dell’Angelo')
    await expectNoA11yViolations(container)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `cd apps/react && npx vitest run src/features/locations`
Expected: FAIL — moduli `dateFormat`, `WeeklyScheduleEditor` e `LocationDetailPage` inesistenti.

- [ ] **Step 3: Date**

`apps/react/src/features/locations/dateFormat.ts`:

```ts
/** Data YYYY-MM-DD come mezzanotte UTC: formattata in UTC non si sposta di un giorno con il fuso del dispositivo. */
const toUtc = (date: string): Date => new Date(`${date}T00:00:00Z`)

/** Data del calendario nella lingua dell'interfaccia (default "7 dicembre 2026"). */
export const formatDay = (date: string, language: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string =>
  new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(toUtc(date))

/** Giorni da `from` a `to`, estremi compresi (10–21 agosto = 12): il limite delle chiusure è di 31 (spec §2.4). */
export const daysInclusive = (from: string, to: string): number => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000) + 1
```

- [ ] **Step 4: Editor e riepilogo dell'orario**

`apps/react/src/features/locations/components/WeeklyScheduleEditor.tsx`:

```tsx
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMinutes, parseHours, WEEKDAYS } from '@/features/locations/scheduleFormat'

interface WeeklyScheduleEditorProps {
  /** Minuti per giorno, lunedì primo; 0 = non lavorativo */
  value: number[]
  /** Un giorno con ore non valide arriva come NaN: la settimana la valida chi usa l'editor (validateWeek) */
  onChange: (minutes: number[]) => void
  disabled?: boolean
}

/**
 * Orario della settimana (spec SP2 fase 1 §5.3): una spunta per i giorni lavorativi e le ore scritte come 8, 4:30 o 7,5.
 * Il testo resta quello scritto anche quando non è valido, così la persona lo corregge; l'errore compare lasciando il campo.
 */
const WeeklyScheduleEditor = ({ value, onChange, disabled = false }: WeeklyScheduleEditorProps) => {
  const { t } = useTranslation()
  const id = useId()
  const [drafts, setDrafts] = useState(() => value.map((minutes) => (minutes > 0 ? formatMinutes(minutes) : '')))
  const [touched, setTouched] = useState<boolean[]>(() => value.map(() => false))

  const emit = (index: number, minutes: number) => onChange(value.map((current, day) => (day === index ? minutes : current)))
  const setDraft = (index: number, text: string) => setDrafts((current) => current.map((item, day) => (day === index ? text : item)))
  const setDayTouched = (index: number, next: boolean) => setTouched((current) => current.map((item, day) => (day === index ? next : item)))

  const toggle = (index: number, working: boolean) => {
    // Un giorno appena attivato parte da 8 ore, il valore più comune
    setDraft(index, working ? '8' : '')
    setDayTouched(index, false)
    emit(index, working ? 480 : 0)
  }

  const type = (index: number, text: string) => {
    setDraft(index, text)
    const minutes = parseHours(text)
    // Un giorno lavorativo ha almeno un quarto d'ora: per non lavorare si toglie la spunta
    emit(index, minutes === null || minutes === 0 ? Number.NaN : minutes)
  }

  return (
    <ul className="grid gap-2">
      {WEEKDAYS.map((day, index) => {
        const minutes = value[index] ?? 0
        const working = minutes !== 0
        const dayName = t(`schedule.weekdays.${day}`)
        const checkboxId = `${id}-${day}`
        const errorId = `${id}-${day}-error`
        const invalid = working && (touched[index] ?? false) && Number.isNaN(minutes)
        return (
          <li key={day} className="grid min-h-9 grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id={checkboxId} checked={working} disabled={disabled} onCheckedChange={(checked) => toggle(index, checked === true)} />
              <Label htmlFor={checkboxId}>{dayName}</Label>
            </div>
            {working ? (
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    value={drafts[index] ?? ''}
                    disabled={disabled}
                    className="w-24"
                    aria-label={t('schedule.hoursFor', { day: dayName.toLowerCase() })}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    onChange={(event) => type(index, event.target.value)}
                    onBlur={() => setDayTouched(index, true)}
                  />
                  <span aria-hidden="true" className="text-sm text-muted-foreground">
                    {t('schedule.hoursUnit')}
                  </span>
                </div>
                {invalid && <FieldError id={errorId}>{t('schedule.invalidHours')}</FieldError>}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{t('schedule.nonWorking')}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default WeeklyScheduleEditor
```

`apps/react/src/features/locations/components/ScheduleSummary.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { formatMinutes, WEEKDAYS } from '@/features/locations/scheduleFormat'

interface ScheduleSummaryProps {
  minutes: number[]
}

/** Orario in sola lettura: sette caselle con il giorno abbreviato (nome intero per gli screen reader) e le ore. */
const ScheduleSummary = ({ minutes }: ScheduleSummaryProps) => {
  const { t } = useTranslation()
  return (
    <dl className="grid grid-cols-7 gap-1 text-center">
      {WEEKDAYS.map((day, index) => {
        const value = minutes[index] ?? 0
        return (
          <div key={day} className="grid gap-1 rounded-md bg-muted px-1 py-2">
            <dt className="text-xs text-muted-foreground">
              <span aria-hidden="true">{t(`schedule.weekdaysShort.${day}`)}</span>
              <span className="sr-only">{t(`schedule.weekdays.${day}`)}</span>
            </dt>
            <dd className="text-sm font-medium tabular-nums">
              {value === 0 ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">{t('schedule.nonWorking')}</span>
                </>
              ) : (
                t('schedule.hours', { hours: formatMinutes(value) })
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

export default ScheduleSummary
```

`apps/react/src/features/locations/components/ScheduleVersionsList.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { WorkSchedule } from '@/features/locations/api'
import ScheduleSummary from '@/features/locations/components/ScheduleSummary'
import { formatDay } from '@/features/locations/dateFormat'
import { LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ScheduleVersionsListProps {
  /** Versioni dalla più recente, come le manda il server */
  schedules: WorkSchedule[]
  onDelete: (schedule: WorkSchedule) => void
}

/**
 * Versioni di un orario: in arrivo (cancellabili), in vigore e precedenti (spec §2.3). Le versioni già iniziate non si
 * cancellano: il server lo rifiuta, qui il pulsante non c'è.
 */
const ScheduleVersionsList = ({ schedules, onDelete }: ScheduleVersionsListProps) => {
  const { t, i18n } = useTranslation()
  const upcoming = schedules.filter((schedule) => !schedule.is_started)
  const started = schedules.filter((schedule) => schedule.is_started)
  const [current, ...past] = started

  const item = (schedule: WorkSchedule, deletable: boolean) => {
    const date = formatDay(schedule.valid_from, i18n.language)
    return (
      <li key={schedule.id} className="grid gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('schedule.since', { date })}</p>
          {deletable && (
            <Button
              variant="outline"
              size="sm"
              aria-label={t('schedule.versions.deleteFor', { date })}
              {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: `schedule-${schedule.id}` }}
              onClick={() => onDelete(schedule)}
            >
              {t('schedule.versions.delete')}
            </Button>
          )}
        </div>
        {schedule.follows_location ? <p className="text-sm text-muted-foreground">{t('schedule.versions.followsLocation')}</p> : <ScheduleSummary minutes={schedule.minutes} />}
      </li>
    )
  }

  const group = (title: string, list: WorkSchedule[], deletable: boolean) =>
    list.length > 0 && (
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <ul className="grid gap-2">{list.map((schedule) => item(schedule, deletable))}</ul>
      </div>
    )

  return (
    <div className="grid gap-4">
      {group(t('schedule.versions.upcoming'), upcoming, true)}
      {current !== undefined && group(t('schedule.versions.current'), [current], false)}
      {group(t('schedule.versions.past'), past, false)}
    </div>
  )
}

export default ScheduleVersionsList
```

- [ ] **Step 5: Conferma di eliminazione e selettore dell'anno**

`apps/react/src/features/locations/components/ConfirmDeleteDialog.tsx`:

```tsx
import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { focusTrigger, LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ConfirmDeleteDialogProps {
  open: boolean
  title: string
  description: string
  actionLabel: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Valore di LOCATION_DETAIL_TRIGGER_ATTRIBUTE del pulsante che l'ha aperto: alla chiusura il focus torna lì */
  triggerKey: string | null
}

/** Conferma di un'eliminazione nel dettaglio della sede (versione futura dell'orario, chiusura). */
const ConfirmDeleteDialog = ({ open, title, description, actionLabel, pending, onConfirm, onCancel, triggerKey }: ConfirmDeleteDialogProps) => {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LOCATION_DETAIL_TRIGGER_ATTRIBUTE, triggerKey)
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('locations.confirm.back')}</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {actionLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default ConfirmDeleteDialog
```

`apps/react/src/features/locations/components/YearSelect.tsx`:

```tsx
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface YearSelectProps {
  id: string
  label: string
  value: number
  years: number[]
  onChange: (year: number) => void
}

/** Anno di chiusure e calendario: l'anno corrente, quello prima e i due dopo. */
const YearSelect = ({ id, label, value, years, onChange }: YearSelectProps) => (
  <div className="flex items-center gap-2">
    <Label id={`${id}-label`} htmlFor={id} className="font-normal text-muted-foreground">
      {label}
    </Label>
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger id={id} aria-labelledby={`${id}-label`} className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {years.map((year) => (
          <SelectItem key={year} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

export default YearSelect
```

- [ ] **Step 6: Card dei dati e dell'orario**

`apps/react/src/features/locations/components/LocationDetailsCard.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { LocationDetail } from '@/features/locations/api'
import LocationFormDialog from '@/features/locations/components/LocationFormDialog'
import { formatPatron } from '@/features/locations/patron'
import ProfileCard from '@/features/profile/components/ProfileCard'

interface LocationDetailsCardProps {
  location: LocationDetail
}

/** Nome, città e patrono con Modifica. Paese e fuso non compaiono finché c'è solo l'Italia (spec §5.3). */
const LocationDetailsCard = ({ location }: LocationDetailsCardProps) => {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const patron = formatPatron(location.patron_day, location.patron_month)
  const rows: [string, string][] = [
    [t('locations.detail.name'), location.name],
    [t('locations.detail.city'), location.city ?? t('locations.detail.noCity')],
    [t('locations.detail.patron'), patron === '' ? t('locations.detail.noPatron') : patron],
  ]

  return (
    <ProfileCard
      titleId="location-data-title"
      title={t('locations.detail.dataTitle')}
      footer={
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditing(true)}>
          {t('locations.detail.edit')}
        </Button>
      }
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <LocationFormDialog open={editing} location={location} onClose={() => setEditing(false)} />
    </ProfileCard>
  )
}

export default LocationDetailsCard
```

`apps/react/src/features/locations/components/ScheduleDialog.tsx`:

```tsx
import { LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAddLocationSchedule } from '@/features/locations/api'
import WeeklyScheduleEditor from '@/features/locations/components/WeeklyScheduleEditor'
import { formatDay } from '@/features/locations/dateFormat'
import { todayIn, validateWeek } from '@/features/locations/scheduleFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ScheduleDialogProps {
  open: boolean
  locationId: number
  locationName: string
  timezone: string
  /** Orario da cui partire: quello in vigore */
  initialMinutes: number[]
  onClose: () => void
}

interface ScheduleFormProps extends Omit<ScheduleDialogProps, 'open' | 'locationName'> {
  onBusyChange: (busy: boolean) => void
}

const ScheduleForm = ({ locationId, timezone, initialMinutes, onClose, onBusyChange }: ScheduleFormProps) => {
  const { t, i18n } = useTranslation()
  const add = useAddLocationSchedule(locationId)
  // "Oggi" nel fuso della sede (spec §2.3), fissato all'apertura del dialog
  const [today] = useState(() => todayIn(timezone))
  const [validFrom, setValidFrom] = useState(today)
  const [minutes, setMinutes] = useState(initialMinutes)
  const [errors, setErrors] = useState<{ validFrom?: string; minutes?: string }>({})
  const submitting = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    const week = validateWeek(minutes)
    const next = {
      validFrom: validFrom === '' || validFrom < today ? t('schedule.validFromPast') : undefined,
      minutes: week === 'invalidHours' ? t('schedule.weekInvalid') : week === 'noWorkingDay' ? t('schedule.noWorkingDay') : undefined,
    }
    setErrors(next)
    if (next.validFrom || next.minutes) return
    submitting.current = true
    onBusyChange(true)
    try {
      await add.mutateAsync({ validFrom, minutes })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const minutesError = Object.entries(error.fieldErrors).find(([key]) => key.startsWith('minutes'))?.[1][0]
        setErrors({ validFrom: error.fieldErrors.valid_from?.[0], minutes: minutesError })
        if (!error.fieldErrors.valid_from && !minutesError) toast.error(error.message)
      } else {
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      }
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t('schedule.saved', { date: formatDay(validFrom, i18n.language) }))
    onClose()
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <FieldGroup>
        <Field data-invalid={errors.validFrom ? true : undefined}>
          <FieldLabel htmlFor="schedule-valid-from">{t('schedule.validFrom')}</FieldLabel>
          <Input
            id="schedule-valid-from"
            type="date"
            min={today}
            value={validFrom}
            className="max-w-48"
            aria-invalid={errors.validFrom ? true : undefined}
            aria-describedby={errors.validFrom ? 'schedule-valid-from-error' : undefined}
            onChange={(event) => setValidFrom(event.target.value)}
          />
          <FieldError id="schedule-valid-from-error">{errors.validFrom}</FieldError>
        </Field>
        <FieldSet>
          <FieldLegend variant="label">{t('schedule.days')}</FieldLegend>
          <WeeklyScheduleEditor value={minutes} onChange={setMinutes} disabled={add.isPending} />
          {errors.minutes && <FieldError role="alert">{errors.minutes}</FieldError>}
        </FieldSet>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={add.isPending}>
          {add.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('schedule.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nuova versione dell'orario standard: vale dal giorno scelto in poi, mai nel passato (spec §2.3). */
const ScheduleDialog = ({ open, locationName, onClose, ...rest }: ScheduleDialogProps) => {
  const { t } = useTranslation()
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LOCATION_DETAIL_TRIGGER_ATTRIBUTE, 'change-schedule')
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('schedule.dialogTitle', { name: locationName })}</DialogTitle>
          <DialogDescription>{t('schedule.dialogDescription')}</DialogDescription>
        </DialogHeader>
        {open && <ScheduleForm key={openCount} onClose={onClose} onBusyChange={setBusy} {...rest} />}
      </DialogContent>
    </Dialog>
  )
}

export default ScheduleDialog
```

`apps/react/src/features/locations/components/LocationScheduleCard.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDeleteLocationSchedule, useLocationSchedules, type LocationDetail, type WorkSchedule } from '@/features/locations/api'
import ConfirmDeleteDialog from '@/features/locations/components/ConfirmDeleteDialog'
import ScheduleDialog from '@/features/locations/components/ScheduleDialog'
import ScheduleSummary from '@/features/locations/components/ScheduleSummary'
import ScheduleVersionsList from '@/features/locations/components/ScheduleVersionsList'
import { formatDay } from '@/features/locations/dateFormat'
import { DEFAULT_WEEK } from '@/features/locations/scheduleFormat'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { isApiError } from '@/lib/api'
import { LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface LocationScheduleCardProps {
  location: LocationDetail
}

/** Orario standard in vigore, Cambia orario e versioni (in arrivo, in vigore, precedenti). */
const LocationScheduleCard = ({ location }: LocationScheduleCardProps) => {
  const { t, i18n } = useTranslation()
  const schedules = useLocationSchedules(location.id)
  const remove = useDeleteLocationSchedule(location.id)
  const [changing, setChanging] = useState(false)
  // La versione resta in memoria durante l'animazione di chiusura: il titolo non sparisce
  const [target, setTarget] = useState<WorkSchedule | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const current = location.current_schedule
  const targetDate = target ? formatDay(target.valid_from, i18n.language) : ''

  const confirmDelete = async () => {
    if (!target) return
    try {
      await remove.mutateAsync(target.id)
      toast.success(t('schedule.deleteDialog.done', { date: targetDate }))
    } catch (error) {
      // 409: nel frattempo è entrata in vigore
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
    setConfirmOpen(false)
  }

  return (
    <ProfileCard
      titleId="location-schedule-title"
      title={t('schedule.title')}
      description={t('schedule.description')}
      footer={
        <Button className="w-full sm:w-auto" {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: 'change-schedule' }} onClick={() => setChanging(true)}>
          {t('schedule.change')}
        </Button>
      }
    >
      <div className="grid gap-4">
        {current ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t('schedule.since', { date: formatDay(current.valid_from, i18n.language) })}</p>
            <ScheduleSummary minutes={current.minutes} />
          </div>
        ) : (
          <p>{t('schedule.none')}</p>
        )}
        {schedules.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : schedules.isError ? null : (
          <ScheduleVersionsList
            schedules={schedules.data}
            onDelete={(schedule) => {
              setTarget(schedule)
              setConfirmOpen(true)
            }}
          />
        )}
      </div>
      <ScheduleDialog
        open={changing}
        locationId={location.id}
        locationName={location.name}
        timezone={location.timezone}
        initialMinutes={current?.minutes ?? DEFAULT_WEEK}
        onClose={() => setChanging(false)}
      />
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={t('schedule.deleteDialog.title', { date: targetDate })}
        description={t('schedule.deleteDialog.description')}
        actionLabel={t('schedule.deleteDialog.action')}
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
        triggerKey={target ? `schedule-${target.id}` : null}
      />
    </ProfileCard>
  )
}

export default LocationScheduleCard
```

- [ ] **Step 7: Chiusure**

`apps/react/src/features/locations/components/ClosureDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCreateClosure, useUpdateClosure, type Closure } from '@/features/locations/api'
import { daysInclusive } from '@/features/locations/dateFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

const MAX_DAYS = 31
const MAX_DESCRIPTION = 100

const createSchema = (t: TFunction) =>
  z
    .object({
      scope: z.enum(['location', 'all']),
      startsOn: z.string().min(1, t('closures.dateRequired')),
      endsOn: z.string().min(1, t('closures.dateRequired')),
      description: z.string().trim().min(1, t('closures.descriptionRequired')).max(MAX_DESCRIPTION, t('validation.tooLong', { max: MAX_DESCRIPTION })),
    })
    .superRefine(({ startsOn, endsOn }, context) => {
      if (startsOn === '' || endsOn === '') return
      if (endsOn < startsOn) context.addIssue({ code: 'custom', path: ['endsOn'], message: t('closures.endsBeforeStart') })
      else if (daysInclusive(startsOn, endsOn) > MAX_DAYS) context.addIssue({ code: 'custom', path: ['endsOn'], message: t('closures.tooLong') })
    })

type ClosureValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof ClosureValues)[] = ['scope', 'startsOn', 'endsOn', 'description']

const isScope = (value: string): value is ClosureValues['scope'] => value === 'location' || value === 'all'

interface ClosureDialogProps {
  open: boolean
  locationId: number
  /** null = nuova chiusura */
  closure: Closure | null
  onClose: () => void
}

interface ClosureFormProps {
  locationId: number
  closure: Closure | null
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

const ClosureForm = ({ locationId, closure, onClose, onBusyChange }: ClosureFormProps) => {
  const { t } = useTranslation()
  const create = useCreateClosure()
  const update = useUpdateClosure()
  const pending = create.isPending || update.isPending
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<ClosureValues>({
    resolver: zodResolver(schema),
    defaultValues: closure
      ? { scope: closure.location_id === null ? 'all' : 'location', startsOn: closure.starts_on, endsOn: closure.ends_on, description: closure.description }
      : { scope: 'location', startsOn: '', endsOn: '', description: '' },
  })
  const { errors } = form.formState
  const submitting = useRef(false)

  const submit = async ({ scope, startsOn, endsOn, description }: ClosureValues) => {
    if (submitting.current) return
    submitting.current = true
    onBusyChange(true)
    const input = { locationId: scope === 'all' ? null : locationId, startsOn, endsOn, description }
    try {
      if (closure === null) await create.mutateAsync(input)
      else await update.mutateAsync({ id: closure.id, ...input })
      toast.success(closure === null ? t('closures.dialog.created') : t('closures.dialog.updated'))
      onClose()
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof ClosureValues, string | undefined> = {
          scope: error.fieldErrors.location_id?.[0],
          startsOn: error.fieldErrors.starts_on?.[0],
          endsOn: error.fieldErrors.ends_on?.[0],
          description: error.fieldErrors.description?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        if (!FIELDS.some((field) => messages[field] !== undefined)) toast.error(error.message)
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      onBusyChange(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">{t('closures.dialog.scope')}</FieldLegend>
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={(value) => isScope(value) && field.onChange(value)} onBlur={field.onBlur} ref={field.ref}>
                {(['location', 'all'] satisfies ClosureValues['scope'][]).map((scope) => (
                  <Field key={scope} orientation="horizontal">
                    <RadioGroupItem value={scope} id={`closure-scope-${scope}`} />
                    <FieldLabel htmlFor={`closure-scope-${scope}`}>{scope === 'all' ? t('closures.dialog.scopeAll') : t('closures.dialog.scopeLocation')}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          />
          <FieldError>{errors.scope?.message}</FieldError>
        </FieldSet>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={errors.startsOn ? true : undefined}>
            <FieldLabel htmlFor="closure-starts-on">{t('closures.dialog.startsOn')}</FieldLabel>
            <Input
              id="closure-starts-on"
              type="date"
              aria-invalid={errors.startsOn ? true : undefined}
              aria-describedby={errors.startsOn ? 'closure-starts-on-error' : undefined}
              {...form.register('startsOn')}
            />
            <FieldError id="closure-starts-on-error">{errors.startsOn?.message}</FieldError>
          </Field>
          <Field data-invalid={errors.endsOn ? true : undefined}>
            <FieldLabel htmlFor="closure-ends-on">{t('closures.dialog.endsOn')}</FieldLabel>
            <Input
              id="closure-ends-on"
              type="date"
              aria-invalid={errors.endsOn ? true : undefined}
              aria-describedby={errors.endsOn ? 'closure-ends-on-error' : undefined}
              {...form.register('endsOn')}
            />
            <FieldError id="closure-ends-on-error">{errors.endsOn?.message}</FieldError>
          </Field>
        </div>
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="closure-description">{t('closures.dialog.text')}</FieldLabel>
          <Input
            id="closure-description"
            autoComplete="off"
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'closure-description-hint closure-description-error' : 'closure-description-hint'}
            {...form.register('description')}
          />
          <FieldDescription id="closure-description-hint">{t('closures.dialog.textHint')}</FieldDescription>
          <FieldError id="closure-description-error">{errors.description?.message}</FieldError>
        </Field>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('closures.dialog.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nuova chiusura o modifica: solo questa sede o tutte, al massimo 31 giorni (spec §2.4). */
const ClosureDialog = ({ open, locationId, closure, onClose }: ClosureDialogProps) => {
  const { t } = useTranslation()
  const [last, setLast] = useState<Closure | null>(closure)
  if (closure !== null && closure !== last) setLast(closure)
  const shown = open ? closure : last
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LOCATION_DETAIL_TRIGGER_ATTRIBUTE, shown ? `closure-edit-${shown.id}` : 'add-closure')
        }}
      >
        <DialogHeader>
          <DialogTitle>{shown === null ? t('closures.dialog.createTitle') : t('closures.dialog.editTitle')}</DialogTitle>
          <DialogDescription>{t('closures.dialog.description')}</DialogDescription>
        </DialogHeader>
        {open && <ClosureForm key={openCount} locationId={locationId} closure={closure} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default ClosureDialog
```

`apps/react/src/features/locations/components/ClosuresCard.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useClosures, useDeleteClosure, type Closure, type LocationDetail } from '@/features/locations/api'
import ClosureDialog from '@/features/locations/components/ClosureDialog'
import ConfirmDeleteDialog from '@/features/locations/components/ConfirmDeleteDialog'
import LocationBadge from '@/features/locations/components/LocationBadge'
import YearSelect from '@/features/locations/components/YearSelect'
import { formatDay } from '@/features/locations/dateFormat'
import { todayIn } from '@/features/locations/scheduleFormat'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { isApiError } from '@/lib/api'
import { LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ClosuresCardProps {
  location: LocationDetail
}

/** Chiusure dell'anno scelto: quelle della sede e quelle di tutte le sedi, con il loro badge (spec §5.3). */
const ClosuresCard = ({ location }: ClosuresCardProps) => {
  const { t, i18n } = useTranslation()
  const [currentYear] = useState(() => Number(todayIn(location.timezone).slice(0, 4)))
  const [year, setYear] = useState(currentYear)
  const closures = useClosures(year, location.id)
  const remove = useDeleteClosure()
  const [editing, setEditing] = useState<{ open: boolean; closure: Closure | null }>({ open: false, closure: null })
  const [target, setTarget] = useState<Closure | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const period = (closure: Closure): string =>
    closure.starts_on === closure.ends_on
      ? formatDay(closure.starts_on, i18n.language)
      : t('closures.period', { from: formatDay(closure.starts_on, i18n.language), to: formatDay(closure.ends_on, i18n.language) })

  const confirmDelete = async () => {
    if (!target) return
    try {
      await remove.mutateAsync(target.id)
      toast.success(t('closures.deleteDialog.done'))
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
    setConfirmOpen(false)
  }

  return (
    <ProfileCard
      titleId="location-closures-title"
      title={t('closures.title')}
      description={t('closures.description')}
      footer={
        <Button className="w-full sm:w-auto" {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: 'add-closure' }} onClick={() => setEditing({ open: true, closure: null })}>
          {t('closures.add')}
        </Button>
      }
    >
      <div className="grid gap-4">
        <YearSelect id="closures-year" label={t('closures.year')} value={year} years={[currentYear - 1, currentYear, currentYear + 1, currentYear + 2]} onChange={setYear} />
        {closures.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : closures.isError ? (
          <div role="alert" className="grid justify-items-start gap-2">
            <p>{t('closures.loadError')}</p>
            <Button variant="outline" onClick={() => void closures.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : closures.data.length === 0 ? (
          <p className="text-muted-foreground">{t('closures.empty')}</p>
        ) : (
          <ul className="grid gap-2" aria-busy={closures.isPlaceholderData || undefined}>
            {closures.data.map((closure) => (
              <li key={closure.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {closure.description}
                    {closure.location_id === null && <LocationBadge kind="allLocations" />}
                  </span>
                  <span className="text-sm text-muted-foreground">{period(closure)}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('closures.editFor', { description: closure.description })}
                    {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: `closure-edit-${closure.id}` }}
                    onClick={() => setEditing({ open: true, closure })}
                  >
                    {t('closures.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('closures.deleteFor', { description: closure.description })}
                    {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: `closure-delete-${closure.id}` }}
                    onClick={() => {
                      setTarget(closure)
                      setConfirmOpen(true)
                    }}
                  >
                    {t('closures.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ClosureDialog open={editing.open} locationId={location.id} closure={editing.closure} onClose={() => setEditing((current) => ({ ...current, open: false }))} />
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={t('closures.deleteDialog.title', { description: target?.description ?? '' })}
        description={target?.location_id === null ? t('closures.deleteDialog.descriptionAll') : t('closures.deleteDialog.description')}
        actionLabel={t('closures.deleteDialog.action')}
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
        triggerKey={target ? `closure-delete-${target.id}` : null}
      />
    </ProfileCard>
  )
}

export default ClosuresCard
```

- [ ] **Step 8: Calendario dell'anno**

`apps/react/src/features/locations/components/LocationCalendarCard.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocationCalendar, type LocationDetail, type WorkSchedule } from '@/features/locations/api'
import YearSelect from '@/features/locations/components/YearSelect'
import { formatDay } from '@/features/locations/dateFormat'
import { todayIn, WEEKDAYS } from '@/features/locations/scheduleFormat'
import ProfileCard from '@/features/profile/components/ProfileCard'

interface LocationCalendarCardProps {
  location: LocationDetail
}

/**
 * Giorni non lavorativi dell'anno secondo l'orario standard (spec §3.2), in sola lettura: serve all'admin per
 * controllare a colpo d'occhio festivi, patrono e chiusure. Il riposo settimanale si riassume in una riga per versione.
 */
const LocationCalendarCard = ({ location }: LocationCalendarCardProps) => {
  const { t, i18n } = useTranslation()
  const [currentYear] = useState(() => Number(todayIn(location.timezone).slice(0, 4)))
  const [year, setYear] = useState(currentYear)
  const calendar = useLocationCalendar(location.id, year)

  const restDays = (schedule: WorkSchedule): string =>
    WEEKDAYS.filter((_, index) => (schedule.minutes[index] ?? 0) === 0)
      .map((day) => t(`schedule.weekdays.${day}`).toLowerCase())
      .join(', ')

  const restNote = (schedule: WorkSchedule, several: boolean): string => {
    const days = restDays(schedule)
    if (days === '') return t('calendar.noWeeklyRest')
    return several ? t('calendar.weeklyRestSince', { date: formatDay(schedule.valid_from, i18n.language), days }) : t('calendar.weeklyRest', { days })
  }

  return (
    <ProfileCard titleId="location-calendar-title" title={t('calendar.title')} description={t('calendar.description')}>
      <div className="grid gap-4">
        <YearSelect id="calendar-year" label={t('calendar.year')} value={year} years={[currentYear - 1, currentYear, currentYear + 1, currentYear + 2]} onChange={setYear} />
        {calendar.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : calendar.isError ? (
          <div role="alert" className="grid justify-items-start gap-2">
            <p>{t('calendar.loadError')}</p>
            <Button variant="outline" onClick={() => void calendar.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3" aria-busy={calendar.isPlaceholderData || undefined}>
            {calendar.data.schedules.map((schedule) => (
              <p key={schedule.id} className="text-sm text-muted-foreground">
                {restNote(schedule, calendar.data.schedules.length > 1)}
              </p>
            ))}
            {calendar.data.days.length === 0 ? (
              <p>{t('calendar.empty')}</p>
            ) : (
              <ol className="grid">
                {calendar.data.days.map((day) => (
                  <li key={day.date} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0">
                    <time dateTime={day.date} className="font-medium first-letter:uppercase">
                      {formatDay(day.date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </time>
                    <span className="text-sm text-muted-foreground">{day.reasons.map((reason) => reason.label).join(' · ')}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </ProfileCard>
  )
}

export default LocationCalendarCard
```

> Le etichette dei giorni (`reasons[].label`) arrivano già tradotte dal server: i test di componente usano testi finti ("Patrono della sede"), l'E2E del Task 15 quelli veri. Con una sola versione dell'orario nell'anno il riepilogo è "Riposo settimanale: sabato, domenica."; con più versioni una riga per versione, con la data di inizio.

- [ ] **Step 9: Pagina di dettaglio e rotta**

`apps/react/src/features/locations/pages/LocationDetailPage.tsx`:

```tsx
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocation } from '@/features/locations/api'
import ClosuresCard from '@/features/locations/components/ClosuresCard'
import LocationBadge from '@/features/locations/components/LocationBadge'
import LocationCalendarCard from '@/features/locations/components/LocationCalendarCard'
import LocationDetailsCard from '@/features/locations/components/LocationDetailsCard'
import LocationScheduleCard from '@/features/locations/components/LocationScheduleCard'
import { isApiError } from '@/lib/api'

const BackLink = () => {
  const { t } = useTranslation()
  return (
    <Link to="/admin/locations" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {t('locations.detail.back')}
    </Link>
  )
}

/** Dettaglio di una sede (spec SP2 fase 1 §5.3): dati, orario standard e chiusure a sinistra, calendario dell'anno a destra. */
const LocationDetailPage = () => {
  const { t } = useTranslation()
  const params = useParams()
  const location = useLocation(Number(params.id))

  if (location.isPending) {
    return (
      <div className="grid gap-4" role="status" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (location.isError) {
    const notFound = isApiError(location.error) && location.error.status === 404
    return (
      <>
        <BackLink />
        <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>{notFound ? t('locations.detail.notFound') : t('locations.detail.loadError')}</p>
          {!notFound && (
            <Button variant="outline" onClick={() => void location.refetch()}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      </>
    )
  }

  const data = location.data

  return (
    <>
      <BackLink />
      <PageHeading
        title={data.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {data.city}
            {data.is_primary && <LocationBadge kind="primary" />}
            {data.archived_at !== null && <LocationBadge kind="archived" />}
            {data.archived_at === null && data.managers_count === 0 && <LocationBadge kind="noManager" />}
          </span>
        }
      />
      {/* Da lg due colonne: dati, orario e chiusure a sinistra, calendario a destra. Sotto lg una colonna nell'ordine del DOM */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <LocationDetailsCard location={data} />
          <LocationScheduleCard location={data} />
          <ClosuresCard location={data} />
        </div>
        <div className="min-w-0">
          <LocationCalendarCard location={data} />
        </div>
      </div>
    </>
  )
}

export default LocationDetailPage
```

In `apps/react/src/routes.tsx`:

```tsx
const LocationDetailPage = lazy(() => import('@/features/locations/pages/LocationDetailPage'))
```

e nei figli della rotta solo admin, dopo `/admin/locations`:

```tsx
                      { path: '/admin/locations/:id', element: <LocationDetailPage />, handle: { titleKey: 'titles.location' } },
```

- [ ] **Step 10: Testi**

In `apps/react/src/locales/it.json`, dentro `locations` aggiungi:

```json
"detail": {
  "back": "Tutte le sedi",
  "notFound": "Sede non trovata.",
  "loadError": "Non è stato possibile caricare la sede.",
  "dataTitle": "Dati",
  "name": "Nome",
  "city": "Città",
  "patron": "Patrono",
  "noCity": "Non indicata",
  "noPatron": "Nessuno",
  "edit": "Modifica"
}
```

e le sezioni di primo livello:

```json
"schedule": {
  "title": "Orario standard",
  "description": "Vale per chi lavora in questa sede senza un orario personale.",
  "change": "Cambia orario",
  "since": "Dal {{date}}",
  "none": "Nessun orario impostato.",
  "weekdays": { "monday": "Lunedì", "tuesday": "Martedì", "wednesday": "Mercoledì", "thursday": "Giovedì", "friday": "Venerdì", "saturday": "Sabato", "sunday": "Domenica" },
  "weekdaysShort": { "monday": "Lun", "tuesday": "Mar", "wednesday": "Mer", "thursday": "Gio", "friday": "Ven", "saturday": "Sab", "sunday": "Dom" },
  "hours": "{{hours}} h",
  "hoursUnit": "ore",
  "hoursFor": "Ore di {{day}}",
  "nonWorking": "Non lavorativo",
  "invalidHours": "Usa quarti d’ora fino a 12 ore (es. 8 o 4:30).",
  "weekInvalid": "Controlla le ore: usa quarti d’ora fino a 12 ore.",
  "noWorkingDay": "Almeno un giorno deve essere lavorativo.",
  "dialogTitle": "Cambia orario di {{name}}",
  "dialogDescription": "Il nuovo orario vale dal giorno scelto in poi: i giorni precedenti restano con l’orario di prima.",
  "validFrom": "Vale dal",
  "validFromPast": "Scegli oggi o una data futura.",
  "days": "Ore per giorno",
  "submit": "Salva orario",
  "saved": "Nuovo orario salvato: vale dal {{date}}.",
  "versions": {
    "current": "In vigore",
    "upcoming": "In arrivo",
    "past": "Precedenti",
    "delete": "Elimina",
    "deleteFor": "Elimina l’orario dal {{date}}",
    "followsLocation": "Torna all’orario della sede."
  },
  "deleteDialog": {
    "title": "Eliminare l’orario dal {{date}}?",
    "description": "Non è ancora in vigore: resta l’orario di adesso.",
    "action": "Elimina",
    "done": "Orario dal {{date}} eliminato."
  }
},
"closures": {
  "title": "Chiusure",
  "description": "Giorni in cui la sede è chiusa: ponti, ferie collettive, inventario.",
  "year": "Anno",
  "add": "Aggiungi chiusura",
  "empty": "Nessuna chiusura in questo anno.",
  "loadError": "Non è stato possibile caricare le chiusure.",
  "period": "dal {{from}} al {{to}}",
  "edit": "Modifica",
  "editFor": "Modifica {{description}}",
  "delete": "Elimina",
  "deleteFor": "Elimina {{description}}",
  "dateRequired": "Scegli una data.",
  "descriptionRequired": "Scrivi una descrizione.",
  "endsBeforeStart": "La fine viene prima dell’inizio.",
  "tooLong": "Una chiusura dura al massimo 31 giorni.",
  "dialog": {
    "createTitle": "Nuova chiusura",
    "editTitle": "Modifica chiusura",
    "description": "Al massimo 31 giorni. I giorni di chiusura non sono lavorativi.",
    "scope": "Vale per",
    "scopeLocation": "Solo questa sede",
    "scopeAll": "Tutte le sedi",
    "startsOn": "Dal",
    "endsOn": "Al",
    "text": "Descrizione",
    "textHint": "Es. Chiusura estiva.",
    "submit": "Salva",
    "created": "Chiusura aggiunta.",
    "updated": "Chiusura aggiornata."
  },
  "deleteDialog": {
    "title": "Eliminare “{{description}}”?",
    "description": "I giorni tornano lavorativi per questa sede.",
    "descriptionAll": "È una chiusura di tutte le sedi: i giorni tornano lavorativi per tutte.",
    "action": "Elimina",
    "done": "Chiusura eliminata."
  }
},
"calendar": {
  "title": "Calendario dell’anno",
  "description": "Giorni non lavorativi della sede: festivi nazionali, patrono e chiusure.",
  "year": "Anno",
  "empty": "Nessun giorno festivo in questo anno.",
  "loadError": "Non è stato possibile caricare il calendario.",
  "weeklyRest": "Riposo settimanale: {{days}}.",
  "weeklyRestSince": "Dal {{date}}, riposo settimanale: {{days}}.",
  "noWeeklyRest": "Nessun giorno di riposo settimanale."
}
```

In `apps/react/src/locales/en.json`, dentro `locations`:

```json
"detail": {
  "back": "All locations",
  "notFound": "Location not found.",
  "loadError": "The location could not be loaded.",
  "dataTitle": "Details",
  "name": "Name",
  "city": "City",
  "patron": "Patron saint",
  "noCity": "Not set",
  "noPatron": "None",
  "edit": "Edit"
}
```

e:

```json
"schedule": {
  "title": "Standard working hours",
  "description": "Applies to people of this location without personal working hours.",
  "change": "Change hours",
  "since": "From {{date}}",
  "none": "No working hours set.",
  "weekdays": { "monday": "Monday", "tuesday": "Tuesday", "wednesday": "Wednesday", "thursday": "Thursday", "friday": "Friday", "saturday": "Saturday", "sunday": "Sunday" },
  "weekdaysShort": { "monday": "Mon", "tuesday": "Tue", "wednesday": "Wed", "thursday": "Thu", "friday": "Fri", "saturday": "Sat", "sunday": "Sun" },
  "hours": "{{hours}} h",
  "hoursUnit": "hours",
  "hoursFor": "Hours on {{day}}",
  "nonWorking": "Non-working",
  "invalidHours": "Use quarters of an hour up to 12 hours (e.g. 8 or 4:30).",
  "weekInvalid": "Check the hours: use quarters of an hour up to 12 hours.",
  "noWorkingDay": "At least one day must be a working day.",
  "dialogTitle": "Change working hours of {{name}}",
  "dialogDescription": "The new hours apply from the chosen day on: earlier days keep the previous hours.",
  "validFrom": "Applies from",
  "validFromPast": "Choose today or a future date.",
  "days": "Hours per day",
  "submit": "Save hours",
  "saved": "New working hours saved: they apply from {{date}}.",
  "versions": {
    "current": "In effect",
    "upcoming": "Upcoming",
    "past": "Previous",
    "delete": "Delete",
    "deleteFor": "Delete the hours from {{date}}",
    "followsLocation": "Back to the hours of the location."
  },
  "deleteDialog": {
    "title": "Delete the hours from {{date}}?",
    "description": "They are not in effect yet: the current hours stay.",
    "action": "Delete",
    "done": "Hours from {{date}} deleted."
  }
},
"closures": {
  "title": "Closures",
  "description": "Days when the location is closed: bridges, company holidays, stocktaking.",
  "year": "Year",
  "add": "Add closure",
  "empty": "No closures this year.",
  "loadError": "The closures could not be loaded.",
  "period": "from {{from}} to {{to}}",
  "edit": "Edit",
  "editFor": "Edit {{description}}",
  "delete": "Delete",
  "deleteFor": "Delete {{description}}",
  "dateRequired": "Choose a date.",
  "descriptionRequired": "Write a description.",
  "endsBeforeStart": "The end comes before the start.",
  "tooLong": "A closure lasts at most 31 days.",
  "dialog": {
    "createTitle": "New closure",
    "editTitle": "Edit closure",
    "description": "At most 31 days. Closure days are not working days.",
    "scope": "Applies to",
    "scopeLocation": "This location only",
    "scopeAll": "All locations",
    "startsOn": "From",
    "endsOn": "To",
    "text": "Description",
    "textHint": "E.g. Summer closure.",
    "submit": "Save",
    "created": "Closure added.",
    "updated": "Closure updated."
  },
  "deleteDialog": {
    "title": "Delete “{{description}}”?",
    "description": "The days become working days again for this location.",
    "descriptionAll": "It is a closure of all locations: the days become working days again everywhere.",
    "action": "Delete",
    "done": "Closure deleted."
  }
},
"calendar": {
  "title": "Calendar of the year",
  "description": "Non-working days of the location: national holidays, patron saint and closures.",
  "year": "Year",
  "empty": "No holidays this year.",
  "loadError": "The calendar could not be loaded.",
  "weeklyRest": "Weekly rest: {{days}}.",
  "weeklyRestSince": "From {{date}}, weekly rest: {{days}}.",
  "noWeeklyRest": "No weekly rest day."
}
```

- [ ] **Step 11: Esegui i test e verifica che passino**

Run: `cd apps/react && npx vitest run src/features/locations`
Expected: PASS. Se il test del calendario non trova l'opzione dell'anno, controlla che `YearSelect` usi `position="popper"` come le altre select (Radix in jsdom).

- [ ] **Step 12: Gate**

Run: `cd apps/react && npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 13: Commit**

```bash
git add apps/react/src/features/locations apps/react/src/routes.tsx apps/react/src/locales/it.json apps/react/src/locales/en.json
git commit -m "feat(sedi): dettaglio della sede con orario, chiusure e calendario dell'anno"
```

## Task 13: Frontend — storico (profilo e Utenti)

**Files:**
- Create: `apps/react/src/features/history/api.ts`
- Create: `apps/react/src/features/history/components/HistoryList.tsx`
- Create: `apps/react/src/features/history/components/UserHistoryDialog.tsx`
- Create: `apps/react/src/features/history/components/UserHistoryDialog.test.tsx`
- Create: `apps/react/src/features/profile/components/HistoryCard.tsx`
- Modify: `apps/react/src/features/profile/components/PersonalDetailsCard.tsx` (Sede e Tipo in sola lettura)
- Modify: `apps/react/src/features/profile/pages/ProfilePage.tsx` (Storico sotto Preferenze)
- Modify: `apps/react/src/features/profile/pages/ProfilePage.test.tsx`
- Modify: `apps/react/src/test/server.ts` (storico del profilo vuoto di default)
- Create: `apps/react/src/test/historyFixtures.ts`
- Modify: `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`

**Interfaces:**
- Consumes: `GET /api/profile/history?page=N` e `GET /api/users/{id}/history?page=N` (paginati a 20, `UserHistoryResource`: `{id, event, summary, actor_name, occurred_at}`; `actor_name` sempre `null` nel profilo); `historyQueryKey` (Task 10); `User` con `location`, `employment_type_label`, `multipleLocations` (Task 10); `ProfileCard`; `USER_TRIGGER_ATTRIBUTE`.
- Produces:
  - `features/history/api.ts`: `historyEntrySchema`, `type HistoryEntry`, `useProfileHistory()`, `useUserHistory(userId: number)` (infinite query, una pagina = 20 tappe);
  - `HistoryList` — `interface HistoryListProps { entries: HistoryEntry[]; showActor: boolean }`; ogni `li` ha `tabIndex={-1}` per ricevere il focus quando compaiono altre tappe;
  - `UserHistoryDialog` — `interface UserHistoryDialogProps { user: ManagedUser | null; onClose: () => void }` (usato dal Task 14);
  - `test/historyFixtures.ts`: `historyEntry()`, `historyPage()`.

- [ ] **Step 1: Scrivi i test che falliscono**

`apps/react/src/test/historyFixtures.ts`:

```ts
import type { HistoryEntry } from '@/features/history/api'

export const historyEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 1,
  event: 'role_changed',
  summary: 'Ruolo: Utente → Responsabile',
  actor_name: null,
  occurred_at: '2026-03-03T10:00:00+01:00',
  ...overrides,
})

export const historyPage = (entries: HistoryEntry[], { page = 1, lastPage = 1 } = {}) => ({
  data: entries,
  links: {},
  meta: { current_page: page, last_page: lastPage, per_page: 20, total: entries.length },
})
```

In `apps/react/src/features/profile/pages/ProfilePage.test.tsx` aggiungi gli import:

```tsx
import { historyEntry, historyPage } from '@/test/historyFixtures'
```

e in fondo al `describe('ProfilePage', …)`:

```tsx
  it('shows employment type and, with more than one location, the location as read-only fields', async () => {
    const contractor: User = { ...employee, employment_type: 'contractor', employment_type_label: 'Collaboratore esterno', location: { id: 2, name: 'Bergamo' } }
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(contractor, { multipleLocations: true }))))
    await openProfile()

    const personal = card('Dati personali')
    expect(within(personal).getByLabelText('Tipo di rapporto')).toHaveValue('Collaboratore esterno')
    expect(within(personal).getByLabelText('Tipo di rapporto')).toHaveAttribute('readonly')
    expect(within(personal).getByLabelText('Sede')).toHaveValue('Bergamo')
  })

  it('hides the location when the company has only one', async () => {
    signedIn()
    await openProfile()

    expect(within(card('Dati personali')).queryByLabelText('Sede')).not.toBeInTheDocument()
    expect(within(card('Dati personali')).getByLabelText('Tipo di rapporto')).toHaveValue('Dipendente')
  })

  it('shows the last five steps of the account and the others on request', async () => {
    signedIn()
    const entries = Array.from({ length: 7 }, (_, index) =>
      historyEntry({ id: index + 1, summary: `Tappa ${index + 1}`, occurred_at: `2026-0${index + 1}-10T10:00:00+01:00` }),
    )
    server.use(http.get('/api/profile/history', () => HttpResponse.json(historyPage(entries))))
    const { user } = await openProfile()

    const history = card('Storico')
    expect(await within(history).findByText('Tappa 1')).toBeInTheDocument()
    expect(within(history).getAllByRole('listitem')).toHaveLength(5)
    expect(within(history).getByText('10 gennaio 2026')).toBeInTheDocument()

    await user.click(within(history).getByRole('button', { name: 'Mostra tutto' }))

    expect(within(history).getAllByRole('listitem')).toHaveLength(7)
    // Il pulsante sparisce: il focus va alla prima tappa comparsa, non si perde sul body
    await waitFor(() => expect(within(history).getByText('Tappa 6').closest('li')).toHaveFocus())
    expect(within(history).queryByRole('button', { name: 'Mostra tutto' })).not.toBeInTheDocument()
  })

  it('loads the next pages of the history', async () => {
    signedIn()
    const pages: string[] = []
    server.use(
      http.get('/api/profile/history', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        pages.push(page)
        const entries = page === '1' ? Array.from({ length: 20 }, (_, index) => historyEntry({ id: index + 1, summary: `Tappa ${index + 1}` })) : [historyEntry({ id: 21, summary: 'Tappa 21' })]
        return HttpResponse.json(historyPage(entries, { page: Number(page), lastPage: 2 }))
      }),
    )
    const { user } = await openProfile()

    const history = card('Storico')
    await within(history).findByText('Tappa 1')
    await user.click(within(history).getByRole('button', { name: 'Mostra tutto' }))
    await user.click(within(history).getByRole('button', { name: 'Carica altre' }))

    expect(await within(history).findByText('Tappa 21')).toBeInTheDocument()
    expect(pages).toEqual(['1', '2'])
    expect(within(history).queryByRole('button', { name: 'Carica altre' })).not.toBeInTheDocument()
  })

  it('says when there are no steps yet', async () => {
    signedIn()
    await openProfile()

    expect(await within(card('Storico')).findByText('Ancora nessuna tappa.')).toBeInTheDocument()
  })
```

`apps/react/src/features/history/components/UserHistoryDialog.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import UserHistoryDialog from '@/features/history/components/UserHistoryDialog'
import { createQueryClient } from '@/lib/queryClient'
import { expectNoA11yViolations } from '@/test/axe'
import { historyEntry, historyPage } from '@/test/historyFixtures'
import { server } from '@/test/server'
import { managedUser } from '@/test/usersFixtures'

const renderDialog = () => {
  const client = createQueryClient({ retry: false })
  const view = render(
    <QueryClientProvider client={client}>
      <UserHistoryDialog user={managedUser({ id: 7, name: 'Marco Bianchi' })} onClose={() => undefined} />
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

describe('UserHistoryDialog', () => {
  it('lists the steps of the account with who made them', async () => {
    server.use(
      http.get('/api/users/7/history', () =>
        HttpResponse.json(
          historyPage([
            historyEntry({ id: 2, summary: 'Sede: Sede principale → Bergamo', actor_name: 'Giulia Rossi' }),
            historyEntry({ id: 1, event: 'invited', summary: 'Invitato come Dipendente, Utente, sede Sede principale', actor_name: null }),
          ]),
        ),
      ),
    )
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    expect(await within(dialog).findByText('Sede: Sede principale → Bergamo')).toBeInTheDocument()
    expect(within(dialog).getByText('da Giulia Rossi')).toBeInTheDocument()
    // Azione di sistema (es. comando del primo admin): nessun autore
    expect(within(dialog).getAllByText(/^da /)).toHaveLength(1)
  })

  it('loads the next page', async () => {
    const pages: string[] = []
    server.use(
      http.get('/api/users/7/history', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        pages.push(page)
        return HttpResponse.json(historyPage([historyEntry({ id: Number(page), summary: `Tappa ${page}` })], { page: Number(page), lastPage: 2 }))
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    await within(dialog).findByText('Tappa 1')
    await user.click(within(dialog).getByRole('button', { name: 'Carica altre' }))

    expect(await within(dialog).findByText('Tappa 2')).toBeInTheDocument()
    expect(pages).toEqual(['1', '2'])
  })

  it('has no accessibility violations', async () => {
    server.use(http.get('/api/users/7/history', () => HttpResponse.json(historyPage([historyEntry()]))))
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    await within(dialog).findByText('Ruolo: Utente → Responsabile')
    await expectNoA11yViolations(document.body)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `cd apps/react && npx vitest run src/features/history src/features/profile/pages/ProfilePage.test.tsx`
Expected: FAIL — `@/features/history/*` inesistente, nessuna card "Storico", nessun campo "Tipo di rapporto".

- [ ] **Step 3: Hook dello storico**

`apps/react/src/features/history/api.ts`:

```ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { requestData } from '@/lib/api'
import { historyQueryKey } from '@/lib/queryKeys'

export const historyEntrySchema = z.object({
  id: z.number(),
  event: z.enum(['imported', 'invited', 'activated', 'role_changed', 'employment_type_changed', 'location_changed', 'disabled', 'enabled']),
  // Testo della tappa già tradotto dal server ("Ruolo: Utente → Responsabile")
  summary: z.string(),
  // Chi ha agito: solo nella vista di admin e responsabili, null nel profilo e per le azioni di sistema
  actor_name: z.string().nullable(),
  occurred_at: z.string(),
})

export type HistoryEntry = z.infer<typeof historyEntrySchema>

const pageSchema = z.object({
  data: z.array(historyEntrySchema),
  meta: z.object({ current_page: z.number(), last_page: z.number() }),
})

type HistoryPage = z.infer<typeof pageSchema>

const nextPage = (last: HistoryPage): number | undefined => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined)

/** Storico di chi è collegato, 20 tappe per pagina dalla più recente (spec SP2 fase 1 §8.3). */
export const useProfileHistory = () =>
  useInfiniteQuery({
    queryKey: [...historyQueryKey, 'profile'],
    queryFn: ({ pageParam }) => requestData('GET', `/api/profile/history?page=${pageParam}`, pageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  })

/** Storico di una persona per admin e responsabili, con chi ha agito. Fuori dalla propria sede il server risponde 404. */
export const useUserHistory = (userId: number) =>
  useInfiniteQuery({
    queryKey: [...historyQueryKey, 'user', userId],
    queryFn: ({ pageParam }) => requestData('GET', `/api/users/${userId}/history?page=${pageParam}`, pageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  })
```

- [ ] **Step 4: Elenco delle tappe**

`apps/react/src/features/history/components/HistoryList.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { HistoryEntry } from '@/features/history/api'

interface HistoryListProps {
  entries: HistoryEntry[]
  /** Nome di chi ha agito: solo nella vista di admin e responsabili (spec §8.3) */
  showActor: boolean
}

/** Tappe dell'account come linea del tempo verticale: data, testo e, se serve, chi ha agito. */
const HistoryList = ({ entries, showActor }: HistoryListProps) => {
  const { t, i18n } = useTranslation()
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' })

  return (
    <ol className="grid gap-3">
      {entries.map((entry) => (
        // tabIndex -1: riceve il focus quando "Mostra tutto" o "Carica altre" fanno comparire nuove tappe
        <li key={entry.id} tabIndex={-1} className="grid gap-0.5 border-l-2 border-border pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <time dateTime={entry.occurred_at} className="text-sm text-muted-foreground">
            {format.format(new Date(entry.occurred_at))}
          </time>
          <span>{entry.summary}</span>
          {showActor && entry.actor_name !== null && <span className="text-sm text-muted-foreground">{t('history.by', { name: entry.actor_name })}</span>}
        </li>
      ))}
    </ol>
  )
}

export default HistoryList
```

- [ ] **Step 5: Card dello storico nel profilo**

`apps/react/src/features/profile/components/HistoryCard.tsx`:

```tsx
import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileHistory } from '@/features/history/api'
import HistoryList from '@/features/history/components/HistoryList'
import ProfileCard from '@/features/profile/components/ProfileCard'

/** Tappe visibili prima di "Mostra tutto" (spec §8.4) */
const PREVIEW = 5

/** Sposta il focus sulla tappa `index` appena compare (dopo il render): il pulsante premuto può sparire. */
const focusEntry = (container: HTMLElement | null, index: number) =>
  window.setTimeout(() => container?.querySelectorAll<HTMLElement>('li')[index]?.focus(), 0)

/** Storico dell'account nella colonna di destra del profilo, sotto Preferenze (spec SP2 fase 1 §8.4). */
const HistoryCard = () => {
  const { t } = useTranslation()
  const history = useProfileHistory()
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const entries = history.data?.pages.flatMap((page) => page.data) ?? []
  const shown = expanded ? entries : entries.slice(0, PREVIEW)
  const canExpand = !expanded && (entries.length > PREVIEW || history.hasNextPage)

  const loadMore = async () => {
    const before = entries.length
    await history.fetchNextPage()
    focusEntry(listRef.current, before)
  }

  return (
    <ProfileCard titleId="profile-history-title" title={t('history.title')} description={t('history.description')}>
      {history.isPending ? (
        <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : history.isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{t('history.loadError')}</p>
          <Button variant="outline" onClick={() => void history.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">{t('history.empty')}</p>
      ) : (
        <div className="grid gap-4">
          <div ref={listRef}>
            <HistoryList entries={shown} showActor={false} />
          </div>
          {canExpand && (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => {
                setExpanded(true)
                focusEntry(listRef.current, PREVIEW)
              }}
            >
              {t('history.showAll')}
            </Button>
          )}
          {expanded && history.hasNextPage && (
            <Button variant="outline" className="justify-self-start" disabled={history.isFetchingNextPage} onClick={() => void loadMore()}>
              {history.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {t('history.loadMore')}
            </Button>
          )}
        </div>
      )}
    </ProfileCard>
  )
}

export default HistoryCard
```

- [ ] **Step 6: Storico di una persona (per Utenti)**

`apps/react/src/features/history/components/UserHistoryDialog.tsx`:

```tsx
import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserHistory } from '@/features/history/api'
import HistoryList from '@/features/history/components/HistoryList'
import type { ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserHistoryDialogProps {
  user: ManagedUser | null
  onClose: () => void
}

const HistoryBody = ({ userId }: { userId: number }) => {
  const { t } = useTranslation()
  const history = useUserHistory(userId)
  const listRef = useRef<HTMLDivElement>(null)
  const entries = history.data?.pages.flatMap((page) => page.data) ?? []

  const loadMore = async () => {
    const before = entries.length
    await history.fetchNextPage()
    // La nuova tappa riceve il focus: chi usa la tastiera continua a leggere da lì
    window.setTimeout(() => listRef.current?.querySelectorAll<HTMLElement>('li')[before]?.focus(), 0)
  }

  if (history.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (history.isError) {
    // 404: la persona non è più visibile (es. spostata in un'altra sede)
    return <p role="alert">{isApiError(history.error) && history.error.status === 404 ? t('history.notVisible') : t('history.loadError')}</p>
  }

  if (entries.length === 0) return <p className="text-muted-foreground">{t('history.empty')}</p>

  return (
    <div className="grid gap-4">
      <div ref={listRef} className="max-h-[60vh] overflow-y-auto pr-1">
        <HistoryList entries={entries} showActor />
      </div>
      {history.hasNextPage && (
        <Button variant="outline" className="justify-self-start" disabled={history.isFetchingNextPage} onClick={() => void loadMore()}>
          {history.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('history.loadMore')}
        </Button>
      )}
    </div>
  )
}

/** Storico di una persona dal menu di riga di Utenti, con chi ha agito (spec SP2 fase 1 §8.4). */
const UserHistoryDialog = ({ user, onClose }: UserHistoryDialogProps) => {
  const { t } = useTranslation()
  // Nome conservato durante l'animazione di chiusura
  const [last, setLast] = useState<ManagedUser | null>(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(USER_TRIGGER_ATTRIBUTE, shown?.id ?? null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('history.dialogTitle', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('history.dialogDescription')}</DialogDescription>
        </DialogHeader>
        {user !== null && <HistoryBody key={user.id} userId={user.id} />}
      </DialogContent>
    </Dialog>
  )
}

export default UserHistoryDialog
```

- [ ] **Step 7: Profilo — Sede, Tipo e Storico**

In `apps/react/src/features/profile/components/PersonalDetailsCard.tsx`, dopo il blocco `<div className="grid gap-4 sm:grid-cols-2">` con email e ruolo (dentro `FieldGroup`), aggiungi:

```tsx
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Li decide l'amministrazione (spec SP2 fase 1 §7.4): in sola lettura come email e ruolo */}
          <Field>
            <FieldLabel htmlFor="profile-employment-type">{t('profile.personal.employmentType')}</FieldLabel>
            <Input id="profile-employment-type" value={user.employment_type_label} readOnly className="cursor-default bg-muted text-muted-foreground" />
          </Field>
          {/* Con una sola sede il campo non compare (spec §5.5) */}
          {user.multipleLocations === true && (
            <Field>
              <FieldLabel htmlFor="profile-location">{t('profile.personal.location')}</FieldLabel>
              <Input id="profile-location" value={user.location.name} readOnly className="cursor-default bg-muted text-muted-foreground" />
            </Field>
          )}
        </div>
```

In `apps/react/src/features/profile/pages/ProfilePage.tsx` importa `HistoryCard` e sostituisci la colonna di destra:

```tsx
        <div className="grid min-w-0 gap-6">
          <PreferencesCard />
          {/* Tappe dell'account sotto le preferenze (spec SP2 fase 1 §8.4) */}
          <HistoryCard />
        </div>
```

aggiornando il commento sopra la griglia: `dati e password a sinistra, preferenze e storico a destra`, e quello del componente: `dati personali, password, preferenze e storico`.

- [ ] **Step 8: Storico vuoto di default nei test**

In `apps/react/src/test/server.ts`, tra gli handler di default:

```ts
  // Profilo: senza un handler del test lo storico è vuoto (la card c'è in ogni pagina Profilo)
  http.get('/api/profile/history', () => HttpResponse.json({ data: [], links: {}, meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } })),
```

- [ ] **Step 9: Testi**

In `apps/react/src/locales/it.json`, in `profile.personal` aggiungi `"employmentType": "Tipo di rapporto"` e `"location": "Sede"`; e la sezione di primo livello:

```json
"history": {
  "title": "Storico",
  "description": "Le tappe del tuo account, dalla più recente.",
  "empty": "Ancora nessuna tappa.",
  "loadError": "Non è stato possibile caricare lo storico.",
  "notVisible": "Questa persona non è più tra quelle che puoi vedere.",
  "showAll": "Mostra tutto",
  "loadMore": "Carica altre",
  "by": "da {{name}}",
  "dialogTitle": "Storico di {{name}}",
  "dialogDescription": "Le tappe dell’account dalla più recente, con chi le ha fatte."
}
```

In `apps/react/src/locales/en.json`, in `profile.personal` aggiungi `"employmentType": "Employment type"` e `"location": "Location"`; e:

```json
"history": {
  "title": "History",
  "description": "The steps of your account, most recent first.",
  "empty": "No steps yet.",
  "loadError": "The history could not be loaded.",
  "notVisible": "This person is no longer among those you can see.",
  "showAll": "Show all",
  "loadMore": "Load more",
  "by": "by {{name}}",
  "dialogTitle": "History of {{name}}",
  "dialogDescription": "The steps of the account, most recent first, with who made them."
}
```

- [ ] **Step 10: Esegui i test e verifica che passino**

Run: `cd apps/react && npx vitest run src/features/history src/features/profile`
Expected: PASS.

- [ ] **Step 11: Gate**

Run: `cd apps/react && npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 12: Commit**

```bash
git add apps/react/src/features/history apps/react/src/features/profile apps/react/src/test/server.ts apps/react/src/test/historyFixtures.ts \
  apps/react/src/locales/it.json apps/react/src/locales/en.json
git commit -m "feat(storico): storico dell'account nel profilo e dialog per gli utenti, sede e tipo nel profilo"
```

## Task 14: Frontend — Sede, Tipo, Orario di lavoro e Storico in Utenti e Amministratori

**Files:**
- Modify: `apps/react/src/features/users/api.ts` (parametri della lista, invito e modifica con tipo e sede)
- Modify: `apps/react/src/features/users/useUserListParams.ts` (parametri `location` ed `employment_type` nell'URL)
- Create: `apps/react/src/features/users/useUserListParams.test.ts`
- Create: `apps/react/src/features/users/components/EmploymentTypeFilter.tsx`
- Create: `apps/react/src/features/users/components/LocationFilter.tsx`
- Modify: `apps/react/src/features/users/components/UsersFilters.tsx`
- Modify: `apps/react/src/features/users/components/UsersTable.tsx`
- Modify: `apps/react/src/features/users/components/UsersSortSelect.tsx`
- Modify: `apps/react/src/features/users/pages/UsersPage.tsx`
- Modify: `apps/react/src/features/users/pages/UsersPage.test.tsx`
- Modify: `apps/react/src/features/users/components/InviteUserDialog.tsx` (riscritto)
- Modify: `apps/react/src/features/users/components/EditUserDialog.tsx`
- Modify: `apps/react/src/features/users/components/ChangeRoleDialog.tsx`
- Modify: `apps/react/src/features/users/actions.ts`, `apps/react/src/features/users/actions.test.ts`
- Create: `apps/react/src/features/users/components/UserScheduleForm.tsx`
- Create: `apps/react/src/features/users/components/UserScheduleDialog.tsx`
- Create: `apps/react/src/features/users/components/UserScheduleDialog.test.tsx`
- Modify: `apps/react/src/features/users/pages/UsersAdminPage.tsx`
- Modify: `apps/react/src/features/users/pages/UsersAdminPage.test.tsx`
- Modify: `apps/react/src/features/administrators/api.ts`
- Modify: `apps/react/src/features/administrators/components/InviteAdminForm.tsx`
- Modify: `apps/react/src/features/administrators/components/PromoteExistingForm.tsx`
- Modify: `apps/react/src/features/administrators/pages/AdministratorsPage.tsx`
- Modify: `apps/react/src/features/administrators/pages/AdministratorsPage.test.tsx`
- Modify: `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`

**Interfaces:**
- Consumes: `useCurrentUser`, `useMultipleLocations`, `EMPLOYMENT_TYPES`, `isEmploymentType`, `type EmploymentType` (Task 10); `useLocationOptions(enabled)`, `useUserSchedules`, `useAddUserSchedule`, `useDeleteUserSchedule`, `type UserSchedules`, `type WorkSchedule` (Task 10); `WeeklyScheduleEditor`, `ScheduleSummary`, `ScheduleVersionsList`, `ConfirmDeleteDialog`, `formatDay`, `todayIn`, `validateWeek`, `DEFAULT_TIMEZONE`, `DEFAULT_WEEK` (Task 10 e 12); `UserHistoryDialog` (Task 13); dal backend `filter[location]`, `filter[employment_type]`, `sort=location|-location`, `employment_type` e `location_id` in `POST /api/users`, `PATCH /api/users/{id}` e `POST /api/administrators/invitations`, 422 `users.intern_role`.
- Produces:
  - `UserListParams` con `location: number | null` ed `employmentType: EmploymentTypeFilter` (`'all' | EmploymentType`), `UserSortField` con `'location'`;
  - `useUserListParams(withLocation?: boolean)` e `withoutLocation(params)`;
  - `UserAction` con `'schedule'` e `'history'`;
  - `InviteUserInput` con `employmentType` e `locationId?`; `UpdateUserInput` con `employmentType?` e `locationId?`; `InviteAdminInput` con `employmentType` e `locationId?`.

- [ ] **Step 1: Scrivi i test che falliscono — parametri della lista e azioni**

`apps/react/src/features/users/useUserListParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_USER_LIST_PARAMS } from '@/features/users/api'
import { countPanelFilters, parseUserListParams, serializeUserListParams, withoutLocation } from '@/features/users/useUserListParams'

describe('user list params', () => {
  it('reads and writes location and employment type', () => {
    const params = parseUserListParams(new URLSearchParams('location=3&employment_type=intern&sort=-location'))
    expect(params.location).toBe(3)
    expect(params.employmentType).toBe('intern')
    expect(params.sort).toBe('-location')
    expect(serializeUserListParams(params).toString()).toBe('employment_type=intern&location=3&sort=-location')
  })

  it('ignores unknown values', () => {
    const params = parseUserListParams(new URLSearchParams('location=abc&employment_type=boss'))
    expect(params.location).toBeNull()
    expect(params.employmentType).toBe('all')
  })

  it('counts location and type among the panel filters', () => {
    expect(countPanelFilters({ ...DEFAULT_USER_LIST_PARAMS, location: 2, employmentType: 'contractor' })).toBe(2)
  })

  it('drops location filter and sort when the location is not shown', () => {
    expect(withoutLocation({ ...DEFAULT_USER_LIST_PARAMS, location: 2, sort: '-location' })).toEqual(DEFAULT_USER_LIST_PARAMS)
    expect(withoutLocation({ ...DEFAULT_USER_LIST_PARAMS, sort: '-email' }).sort).toBe('-email')
  })
})
```

In `apps/react/src/features/users/actions.test.ts` aggiungi (import di `ADMIN_ACTIONS` da `@/test/usersFixtures`):

```ts
  it('offers working hours and history when the server allows them, in every status', () => {
    expect(availableActions(managedUser({ can: ADMIN_ACTIONS }))).toEqual(['edit', 'schedule', 'history', 'changeRole', 'passwordReset', 'disable'])
    expect(availableActions(managedUser({ status: 'invited', can: ADMIN_ACTIONS }))).toEqual(['edit', 'schedule', 'history', 'resend', 'cancel'])
    expect(availableActions(managedUser({ status: 'disabled', can: { ...NO_ACTIONS, view_history: true } }))).toEqual(['history'])
  })
```

- [ ] **Step 2: Scrivi i test che falliscono — pagina Utenti**

In `apps/react/src/features/users/pages/UsersPage.test.tsx` aggiungi gli import:

```tsx
import type { User } from '@/features/auth/api'
import { adminUser, currentUserResponse } from '@/test/fixtures'
```

e in fondo al `describe('UsersPage', …)`:

```tsx
  it('shows location column and filter to admins when there is more than one location', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { multipleLocations: true }))),
      http.get('/api/locations/options', () => HttpResponse.json({ data: [{ id: 1, name: 'Sede principale', is_primary: true }, { id: 2, name: 'Bergamo', is_primary: false }] })),
    )
    respondWith((url) => urls.push(url), [managedUser({ location: { id: 2, name: 'Bergamo' }, employment_type: 'intern', employment_type_label: 'Stagista' })])
    const { user, router } = renderRoutes(routes, ['/users'])

    const table = await screen.findByRole('table')
    await waitFor(() => expect(columnHeader('Sede')).toBeInTheDocument())
    expect(within(table).getByText('Bergamo')).toBeInTheDocument()
    expect(within(table).getByText('Stagista')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filtri' }))
    await user.click(screen.getByRole('combobox', { name: 'Sede' }))
    await user.click(await screen.findByRole('option', { name: 'Bergamo' }))

    await waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[location]')).toBe('2'))
    expect(router.state.location.search).toContain('location=2')

    await user.click(within(columnHeader('Sede')).getByRole('button'))
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('sort')).toBe('location'))
  })

  it('filters by employment type for every viewer and hides the location with a single one', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user } = renderRoutes(routes, ['/users'])

    await screen.findByRole('table')
    expect(columnHeader('Tipo')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByRole('columnheader', { name: /Sede/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filtri' }))
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Tipo di rapporto' }))
    await user.click(await screen.findByRole('option', { name: 'Collaboratore esterno' }))

    await waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[employment_type]')).toBe('contractor'))
  })

  it('names the location in the title for managers and never sends a location filter', async () => {
    const urls: URL[] = []
    const manager: User = { ...adminUser, role: 'manager', role_label: 'Responsabile', location: { id: 2, name: 'Bergamo' } }
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(manager, { multipleLocations: true }))))
    respondWith((url) => urls.push(url))
    renderRoutes(routes, ['/users?location=1&sort=location'])

    expect(await screen.findByRole('heading', { level: 1, name: 'Utenti · Bergamo' })).toBeInTheDocument()
    await screen.findByRole('table')
    expect(urls.at(-1)?.searchParams.has('filter[location]')).toBe(false)
    expect(urls.at(-1)?.searchParams.get('sort')).toBe('last_name')
    expect(within(screen.getByRole('table')).queryByRole('columnheader', { name: /Sede/ })).not.toBeInTheDocument()
  })
```

- [ ] **Step 3: Scrivi i test che falliscono — invito, modifica, ruolo, orario e storico**

In `apps/react/src/features/users/pages/UsersAdminPage.test.tsx`:
- nel test `invites a user and shows the server errors under the fields` sostituisci l'attesa del corpo con `expect(body).toEqual({ first_name: 'Sara', last_name: 'Colombo', email: 'sara@holidays.test', role: 'employee', employment_type: 'employee' })`;
- aggiungi gli import `import type { User } from '@/features/auth/api'`, `import { adminUser, currentUserResponse } from '@/test/fixtures'`, `import { historyEntry, historyPage } from '@/test/historyFixtures'` e `ADMIN_ACTIONS` all'import da `@/test/usersFixtures`;
- in fondo al `describe`:

```tsx
  it('limits the role of an intern to "Utente" in the invitation', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.post('/api/users', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 9, status: 'invited' }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Stagista' }))

    expect(within(dialog).queryByRole('radio', { name: 'Responsabile' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Utente' })).toBeChecked()
    expect(within(dialog).getByText('Uno stagista può essere solo Utente.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    await screen.findByText('Invito inviato a sara@holidays.test.')
    expect(body).toEqual({ first_name: 'Sara', last_name: 'Colombo', email: 'sara@holidays.test', role: 'employee', employment_type: 'intern' })
  })

  it('lets admins choose the location of the invitation, starting from the primary one', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { multipleLocations: true }))),
      http.get('/api/locations/options', () => HttpResponse.json({ data: [{ id: 2, name: 'Bergamo', is_primary: false }, { id: 1, name: 'Sede principale', is_primary: true }] })),
      http.post('/api/users', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 9, status: 'invited' }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Sede' })).toHaveTextContent('Sede principale'))
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('combobox', { name: 'Sede' }))
    await user.click(await screen.findByRole('option', { name: 'Bergamo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    await screen.findByText('Invito inviato a sara@holidays.test.')
    expect(body).toEqual({ first_name: 'Sara', last_name: 'Colombo', email: 'sara@holidays.test', role: 'employee', employment_type: 'employee', location_id: 2 })
  })

  it('sends only the type and location that changed, explaining the change of location', async () => {
    listing([managedUser({ can: ADMIN_ACTIONS })])
    let body: unknown = null
    server.use(
      http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { multipleLocations: true }))),
      http.get('/api/locations/options', () => HttpResponse.json({ data: [{ id: 1, name: 'Sede principale', is_primary: true }, { id: 2, name: 'Bergamo', is_primary: false }] })),
      http.patch('/api/users/2', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser() })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    await user.click(within(dialog).getByRole('radio', { name: 'Collaboratore esterno' }))
    const location = await within(dialog).findByRole('combobox', { name: 'Sede' })
    expect(location).toHaveAccessibleDescription('La persona passa al responsabile della nuova sede.')
    await user.click(location)
    await user.click(await screen.findByRole('option', { name: 'Bergamo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    await screen.findByText('Dati di Marco Bianchi aggiornati.')
    expect(body).toEqual({ first_name: 'Marco', last_name: 'Bianchi', employment_type: 'contractor', location_id: 2 })
  })

  it('does not offer "Stagista" to a manager and hides the location without the permission', async () => {
    listing([managedUser({ role: 'manager', role_label: 'Responsabile' })])
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { multipleLocations: true }))))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })

    expect(within(dialog).getByRole('radio', { name: 'Stagista' })).toBeDisabled()
    expect(within(dialog).getByText('Uno stagista può essere solo Utente: prima cambia il ruolo.')).toBeInTheDocument()
    // can.change_location è falso (vista del responsabile o permesso negato): nessun campo Sede
    expect(within(dialog).queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument()
  })

  it('does not let an intern become a manager', async () => {
    listing([managedUser({ employment_type: 'intern', employment_type_label: 'Stagista' })])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia ruolo di Marco Bianchi' })

    expect(within(dialog).getByRole('radio', { name: 'Responsabile' })).toBeDisabled()
    expect(within(dialog).getByText('Uno stagista può essere solo Utente.')).toBeInTheDocument()
  })

  it('opens the history of a person from the row menu', async () => {
    listing([managedUser({ can: { ...NO_ACTIONS, view_history: true } })])
    server.use(http.get('/api/users/2/history', () => HttpResponse.json(historyPage([historyEntry({ summary: 'Tipo: Stagista → Dipendente', actor_name: 'Giulia Rossi' })]))))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Storico' }))

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    expect(await within(dialog).findByText('Tipo: Stagista → Dipendente')).toBeInTheDocument()
    expect(within(dialog).getByText('da Giulia Rossi')).toBeInTheDocument()
  })

  it('opens the working hours of a person from the row menu', async () => {
    listing([managedUser({ can: { ...NO_ACTIONS, manage_schedule: true } })])
    server.use(
      http.get('/api/users/2/schedules', () =>
        HttpResponse.json({ data: { schedules: [], location_schedule: { id: 1, valid_from: '2026-01-01', follows_location: false, minutes: [480, 480, 480, 480, 480, 0, 0], is_started: true } } }),
      ),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Orario di lavoro' }))

    expect(await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })).toBeInTheDocument()
  })
```

`apps/react/src/features/users/components/UserScheduleDialog.test.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import UserScheduleDialog from '@/features/users/components/UserScheduleDialog'
import { createQueryClient } from '@/lib/queryClient'
import { expectNoA11yViolations } from '@/test/axe'
import { schedule } from '@/test/locationsFixtures'
import { server } from '@/test/server'
import { managedUser } from '@/test/usersFixtures'

const marco = managedUser({ id: 7, name: 'Marco Bianchi', location: { id: 2, name: 'Bergamo' } })

const renderDialog = () => {
  const client = createQueryClient({ retry: false })
  const view = render(
    <QueryClientProvider client={client}>
      <UserScheduleDialog user={marco} onClose={() => undefined} />
      <Toaster />
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

const schedules = (personal = [schedule({ id: 5, valid_from: '2026-02-01', minutes: [240, 240, 240, 240, 240, 0, 0] })]) =>
  server.use(http.get('/api/users/7/schedules', () => HttpResponse.json({ data: { schedules: personal, location_schedule: schedule() } })))

describe('UserScheduleDialog', () => {
  it('starts from the personal schedule in effect and saves a new one from a future day', async () => {
    schedules()
    let body: unknown = null
    server.use(
      http.post('/api/users/7/schedules', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: schedule({ id: 9, valid_from: '2099-03-01', is_started: false }) }, { status: 201 })
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    expect(await within(dialog).findByRole('radio', { name: 'Orario personale' })).toBeChecked()
    expect(within(dialog).getByLabelText('Ore di lunedì')).toHaveValue('4')
    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2099-03-01' } })
    await user.clear(within(dialog).getByLabelText('Ore di venerdì'))
    await user.type(within(dialog).getByLabelText('Ore di venerdì'), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Orario di Marco Bianchi salvato: vale dal 1 marzo 2099.')).toBeInTheDocument()
    expect(body).toEqual({ valid_from: '2099-03-01', minutes: [240, 240, 240, 240, 120, 0, 0] })
  })

  it('goes back to the schedule of the location', async () => {
    schedules()
    let body: unknown = null
    server.use(
      http.post('/api/users/7/schedules', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: schedule({ id: 9, follows_location: true, is_started: false }) }, { status: 201 })
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    await user.click(await within(dialog).findByRole('radio', { name: 'Usa l’orario della sede (Bergamo)' }))
    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2099-03-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    await screen.findByText('Orario di Marco Bianchi salvato: vale dal 1 marzo 2099.')
    expect(body).toEqual({ valid_from: '2099-03-01', follows_location: true })
  })

  it('does not save the schedule of the location again when the person already follows it', async () => {
    schedules([])
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    expect(await within(dialog).findByRole('radio', { name: 'Usa l’orario della sede (Bergamo)' })).toBeChecked()
    expect(within(dialog).getByText('Segue già l’orario della sede.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    schedules()
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    await within(dialog).findByRole('radio', { name: 'Orario personale' })
    await expectNoA11yViolations(document.body)
  })
})
```

In `apps/react/src/features/administrators/pages/AdministratorsPage.test.tsx`:
- nei due test dell'invito di un admin (oggi con `expect(body).toEqual({ first_name: 'Sara', … current_password: 'password' })`) aggiungi `employment_type: 'employee'` all'oggetto atteso;
- aggiungi (import di `adminUser`, `currentUserResponse` da `@/test/fixtures`):

```tsx
  it('shows the location of each administrator when there is more than one', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { multipleLocations: true }))))
    admins([me, { ...bruno, location: { id: 2, name: 'Bergamo' } }])
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByText('Sede: Bergamo')).toBeInTheDocument()
  })

  it('never offers an intern for promotion', async () => {
    admins()
    server.use(
      http.get('/api/users', () =>
        HttpResponse.json(
          userListResponse([
            managedUser({ id: 5, name: 'Sara Colombo', email: 'sara@holidays.test' }),
            managedUser({ id: 6, name: 'Luca Stagista', email: 'luca@holidays.test', employment_type: 'intern', employment_type_label: 'Stagista' }),
          ]),
        ),
      ),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    expect(await within(dialog).findByRole('radio', { name: /Sara Colombo/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: /Luca Stagista/ })).not.toBeInTheDocument()
  })
```

- [ ] **Step 4: Esegui i test e verifica che falliscano**

Run: `cd apps/react && npx vitest run src/features/users src/features/administrators`
Expected: FAIL — `withoutLocation`, colonne Tipo e Sede, campi del tipo, voci "Orario di lavoro" e "Storico" e `UserScheduleDialog` mancanti.

- [ ] **Step 5: Parametri e chiamate della lista**

In `apps/react/src/features/users/api.ts`:

```ts
import { locationRefSchema, type EmploymentType, type User } from '@/features/auth/api'
```

```ts
/** "Tutti i tipi" o un tipo di rapporto (spec SP2 fase 1 §7.4) */
export type EmploymentTypeFilter = 'all' | EmploymentType
export type UserSortField = 'last_name' | 'first_name' | 'email' | 'role' | 'status' | 'location'
```

in `UserListParams`, dopo `role`:

```ts
  /** Tipo di rapporto, per admin e responsabili */
  employmentType: EmploymentTypeFilter
  /** Id della sede: solo per l'admin con più sedi (spec §4.5), altrimenti null */
  location: number | null
```

in `DEFAULT_USER_LIST_PARAMS`, dopo `role: 'all'`: `employmentType: 'all', location: null,`.

In `toQueryString` aggiungi i due parametri al destructuring e, dopo `filter[role]`:

```ts
  if (employmentType !== 'all') query.set('filter[employment_type]', employmentType)
  if (location !== null) query.set('filter[location]', String(location))
```

Invito e modifica:

```ts
export interface InviteUserInput {
  firstName: string
  lastName: string
  email: string
  role: ManagedRole
  employmentType: EmploymentType
  /** Solo l'admin con più sedi la sceglie; senza, il server usa la sede di chi invita o la principale */
  locationId?: number
}
```

```ts
export const useInviteUser = () =>
  useAdminMutation(({ firstName, lastName, email, role, employmentType, locationId }: InviteUserInput) =>
    requestData('POST', '/api/users', userResourceSchema, {
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      employment_type: employmentType,
      ...(locationId === undefined ? {} : { location_id: locationId }),
    }),
  )
```

```ts
export interface UpdateUserInput {
  id: number
  firstName: string
  lastName: string
  /** Solo per gli utenti invitati: per gli altri l'email non cambia (spec §7.3) */
  email?: string
  /** Solo se cambia */
  employmentType?: EmploymentType
  /** Solo se cambia, e solo l'admin (can.change_location) */
  locationId?: number
  /** Solo per modificare un altro admin */
  currentPassword?: string
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()
  return useAdminMutation(
    ({ id, firstName, lastName, email, employmentType, locationId, currentPassword }: UpdateUserInput) =>
      requestData('PATCH', `/api/users/${id}`, userResourceSchema, {
        first_name: firstName,
        last_name: lastName,
        ...(email === undefined ? {} : { email }),
        ...(employmentType === undefined ? {} : { employment_type: employmentType }),
        ...(locationId === undefined ? {} : { location_id: locationId }),
        ...(currentPassword === undefined ? {} : { current_password: currentPassword }),
      }),
    // Modificando sé stessi cambiano anche menu account e profilo: si aggiorna subito l'utente corrente
    ({ data }) => {
      queryClient.setQueryData<User | null>(userQueryKey, (current) =>
        current && current.id === data.id
          ? {
              ...current,
              first_name: data.first_name,
              last_name: data.last_name,
              name: data.name,
              employment_type: data.employment_type,
              employment_type_label: data.employment_type_label,
              location: data.location,
            }
          : current,
      )
    },
  )
}
```

(`locationRefSchema` resta usato da `managedUserSchema`, Task 10.)

- [ ] **Step 6: Parametri nell'URL**

In `apps/react/src/features/users/useUserListParams.ts`:

```ts
import { EMPLOYMENT_TYPES } from '@/features/auth/api'
import {
  DEFAULT_USER_LIST_PARAMS,
  USER_PER_PAGE_OPTIONS,
  type EmploymentTypeFilter,
  type UserListParams,
  type UserPerPage,
  type UserRoleFilter,
  type UserSort,
  type UserSortField,
  type UserStatusFilter,
} from '@/features/users/api'

const EMPLOYMENT_TYPE_FILTERS: EmploymentTypeFilter[] = ['all', ...EMPLOYMENT_TYPES]
// L'ordinamento per sede si legge dall'URL per tutti, ma vale solo per l'admin con più sedi (vedi withoutLocation)
export const USER_SORT_FIELDS: UserSortField[] = ['last_name', 'first_name', 'email', 'role', 'status', 'location']

export const isEmploymentTypeFilter = (value: string | null): value is EmploymentTypeFilter => value !== null && EMPLOYMENT_TYPE_FILTERS.some((type) => type === value)

const toLocation = (value: string | null): number | null => {
  const id = Number.parseInt(value ?? '', 10)
  return Number.isNaN(id) || id < 1 ? null : id
}
```

`parseUserListParams` diventa:

```ts
export const parseUserListParams = (search: URLSearchParams): UserListParams => {
  const role = search.get('role')
  const employmentType = search.get('employment_type')
  const status = search.get('status')
  const sort = search.get('sort')
  return {
    search: toText(search.get('search')),
    firstName: toText(search.get('first_name')),
    lastName: toText(search.get('last_name')),
    email: toText(search.get('email')),
    role: isRoleFilter(role) ? role : DEFAULT_USER_LIST_PARAMS.role,
    employmentType: isEmploymentTypeFilter(employmentType) ? employmentType : DEFAULT_USER_LIST_PARAMS.employmentType,
    location: toLocation(search.get('location')),
    status: isStatusFilter(status) ? status : DEFAULT_USER_LIST_PARAMS.status,
    sort: isUserSort(sort) ? sort : DEFAULT_USER_LIST_PARAMS.sort,
    page: toPage(search.get('page')),
    perPage: toPerPage(search.get('per_page')),
  }
}
```

In `serializeUserListParams`, dopo la riga del ruolo:

```ts
  if (params.employmentType !== DEFAULT_USER_LIST_PARAMS.employmentType) query.set('employment_type', params.employmentType)
  if (params.location !== null) query.set('location', String(params.location))
```

e sposta la riga di `role` prima di queste due: l'ordine dei parametri nell'URL diventa testi, `role`, `employment_type`, `location`, `status`, `sort`, `page`, `per_page` (il test del Step 1 si aspetta `employment_type=intern&location=3&sort=-location`).

`countPanelFilters`:

```ts
export const countPanelFilters = ({ firstName, lastName, email, role, employmentType, location }: UserListParams): number =>
  [firstName !== '', lastName !== '', email !== '', role !== 'all', employmentType !== 'all', location !== null].filter(Boolean).length
```

`CLEARED_FILTERS`:

```ts
export const CLEARED_FILTERS: Partial<UserListParams> = { search: '', firstName: '', lastName: '', email: '', role: 'all', employmentType: 'all', location: null, status: 'all', page: 1 }
```

Nuova funzione e hook:

```ts
/** Vista senza sede (responsabile, o admin con una sola sede): filtro e ordinamento per sede dell'URL non valgono. */
export const withoutLocation = (params: UserListParams): UserListParams => ({
  ...params,
  location: null,
  sort: params.sort === 'location' || params.sort === '-location' ? DEFAULT_USER_LIST_PARAMS.sort : params.sort,
})

/** Filtri, ordinamento e pagina nell'URL: Indietro, Avanti e i link condivisi riportano alla stessa vista. */
export const useUserListParams = (withLocation = false) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsed = parseUserListParams(searchParams)
  const params = withLocation ? parsed : withoutLocation(parsed)
  // setParams resta com'è
```

- [ ] **Step 7: Filtri, tabella e ordinamento**

`apps/react/src/features/users/components/EmploymentTypeFilter.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EMPLOYMENT_TYPES } from '@/features/auth/api'
import type { EmploymentTypeFilter as EmploymentTypeFilterValue } from '@/features/users/api'
import { isEmploymentTypeFilter } from '@/features/users/useUserListParams'

const OPTIONS: EmploymentTypeFilterValue[] = ['all', ...EMPLOYMENT_TYPES]

interface EmploymentTypeFilterProps {
  value: EmploymentTypeFilterValue
  onChange: (type: EmploymentTypeFilterValue) => void
}

/** Select del tipo di rapporto: "Tutti i tipi" toglie il filtro. */
const EmploymentTypeFilter = ({ value, onChange }: EmploymentTypeFilterProps) => {
  const { t } = useTranslation()
  return (
    <div className="grid gap-2">
      <Label id="users-filter-employment-type-label" htmlFor="users-filter-employment-type">
        {t('users.filters.employmentType')}
      </Label>
      <Select value={value} onValueChange={(next) => isEmploymentTypeFilter(next) && onChange(next)}>
        <SelectTrigger id="users-filter-employment-type" aria-labelledby="users-filter-employment-type-label" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {OPTIONS.map((type) => (
            <SelectItem key={type} value={type}>
              {type === 'all' ? t('users.filters.allEmploymentTypes') : t(`users.employmentTypes.${type}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default EmploymentTypeFilter
```

`apps/react/src/features/users/components/LocationFilter.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLocationOptions } from '@/features/locations/api'

interface LocationFilterProps {
  value: number | null
  onChange: (location: number | null) => void
}

/** Select della sede (solo admin con più sedi, spec §5.4): "Tutte le sedi" toglie il filtro. */
const LocationFilter = ({ value, onChange }: LocationFilterProps) => {
  const { t } = useTranslation()
  const options = useLocationOptions()
  return (
    <div className="grid gap-2">
      <Label id="users-filter-location-label" htmlFor="users-filter-location">
        {t('users.filters.location')}
      </Label>
      <Select value={value === null ? 'all' : String(value)} onValueChange={(next) => onChange(next === 'all' ? null : Number(next))}>
        <SelectTrigger id="users-filter-location" aria-labelledby="users-filter-location-label" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="all">{t('users.filters.allLocations')}</SelectItem>
          {(options.data ?? []).map((location) => (
            <SelectItem key={location.id} value={String(location.id)}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default LocationFilter
```

In `apps/react/src/features/users/components/UsersFilters.tsx`:
- aggiungi alle props `/** Filtro per sede: solo admin con più sedi */ withLocation: boolean` e al destructuring;
- importa `EmploymentTypeFilter` e `LocationFilter`;
- sostituisci la griglia del pannello con:

```tsx
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
```

- dopo `<RoleFilter … />`:

```tsx
          <EmploymentTypeFilter value={params.employmentType} onChange={(employmentType) => setParams({ employmentType, page: 1 })} />
          {withLocation && <LocationFilter value={params.location} onChange={(location) => setParams({ location, page: 1 })} />}
```

- aggiorna il commento del componente: "… con nome, cognome, email, ruolo, tipo di rapporto, sede (solo admin con più sedi) e Azzera filtri".

In `apps/react/src/features/users/components/UsersTable.tsx`:
- aggiungi alle props `/** Colonna Sede: solo admin con più sedi */ withLocation: boolean` e al destructuring;
- nelle colonne, dopo quella del ruolo:

```tsx
        usersColumnHelper.accessor('employment_type', {
          header: t('users.columns.employmentType'),
          enableSorting: false,
          cell: ({ row }) => row.original.employment_type_label,
        }),
        ...(withLocation
          ? [
              usersColumnHelper.accessor((user) => user.location.name, {
                id: 'location',
                header: ({ column }) => <SortableHeader label={t('users.columns.location')} column={column} />,
                cell: ({ row }) => row.original.location.name,
              }),
            ]
          : []),
```

- aggiungi `withLocation` alle dipendenze di `useMemo` delle colonne;
- nella scheda mobile, sotto i badge di ruolo e stato:

```tsx
                <p className="text-sm text-muted-foreground">
                  {user.employment_type_label}
                  {withLocation && ` · ${user.location.name}`}
                </p>
```

In `apps/react/src/features/users/components/UsersSortSelect.tsx`:

```tsx
interface UsersSortSelectProps {
  value: UserSort
  onChange: (sort: UserSort) => void
  /** Ordinamento per sede: solo admin con più sedi */
  withLocation: boolean
  className?: string
}
```

e calcola le opzioni nel componente (togli la costante `OPTIONS` di modulo):

```tsx
  // Ogni campo in ordine crescente e decrescente, come le intestazioni della tabella
  const options = USER_SORT_FIELDS.filter((field) => withLocation || field !== 'location').flatMap((field): UserSort[] => [field, `-${field}`])
```

- [ ] **Step 8: Pagina Utenti**

In `apps/react/src/features/users/pages/UsersPage.tsx`:

```tsx
import { useCurrentUser, useMultipleLocations } from '@/features/auth/api'
```

all'inizio del componente:

```tsx
  const { data: currentUser } = useCurrentUser()
  const multipleLocations = useMultipleLocations()
  // Sede in tabella, filtri e ordinamento solo per l'admin con più sedi (spec SP2 fase 1 §5.4 e §5.5)
  const withLocation = currentUser?.role === 'admin' && multipleLocations
  const { params, setParams } = useUserListParams(withLocation)
  // Il responsabile vede solo la sua sede: il titolo lo dice
  const title = currentUser?.role === 'manager' && multipleLocations ? t('users.titleWithLocation', { location: currentUser.location.name }) : t('users.title')
```

(al posto della riga `const { params, setParams } = useUserListParams()`), poi `title={title}` in `PageHeading`, `withLocation={withLocation}` a `UsersFilters`, `UsersTable` e `UsersSortSelect`.

- [ ] **Step 9: Invito con tipo e sede**

`apps/react/src/features/users/components/InviteUserDialog.tsx` (sostituisce il file):

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle, UserPlus } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EMPLOYMENT_TYPES, isEmploymentType, useCurrentUser, useMultipleLocations } from '@/features/auth/api'
import { emailField } from '@/features/auth/validation'
import { useLocationOptions } from '@/features/locations/api'
import { useInviteUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'

const createInviteSchema = (t: TFunction) =>
  z
    .object({
      firstName: z.string().trim().min(1, t('validation.firstNameRequired')),
      lastName: z.string().trim().min(1, t('validation.lastNameRequired')),
      email: emailField(t),
      employmentType: z.enum(['employee', 'contractor', 'intern']),
      role: z.enum(['employee', 'manager']),
      // Id della sede scelta come testo (valore della select); vuoto = la principale
      locationId: z.string(),
    })
    .refine(({ employmentType, role }) => employmentType !== 'intern' || role === 'employee', { path: ['role'], message: t('users.internRoleOnly') })

type InviteValues = z.infer<ReturnType<typeof createInviteSchema>>

const ROLES: InviteValues['role'][] = ['employee', 'manager']

const FIELDS: (keyof InviteValues)[] = ['firstName', 'lastName', 'email', 'employmentType', 'role', 'locationId']

const isRole = (value: string): value is InviteValues['role'] => value === 'employee' || value === 'manager'

/** Pulsante "Invita utente" con il dialog di invito: tipo di rapporto per tutti, sede solo per l'admin con più sedi. */
const InviteUserDialog = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const invite = useInviteUser()
  const { data: currentUser } = useCurrentUser()
  const multipleLocations = useMultipleLocations()
  // Il responsabile invita sempre nella sua sede: il campo c'è solo per l'admin (spec SP2 fase 1 §4.5)
  const showLocation = currentUser?.role === 'admin' && multipleLocations
  const locations = useLocationOptions(showLocation && open)
  const primaryId = locations.data?.find((location) => location.is_primary)?.id
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo l'invito riuscito resta attivo finché il dialog
  // non si riapre: durante l'animazione di chiusura il form è ancora nel DOM
  const submitting = useRef(false)
  const schema = useMemo(() => createInviteSchema(t), [t])
  const form = useForm<InviteValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', employmentType: 'employee', role: 'employee', locationId: '' },
  })
  const { errors } = form.formState
  const employmentType = useWatch({ control: form.control, name: 'employmentType' })
  // Uno stagista può essere solo Utente (spec §7.3)
  const roles = employmentType === 'intern' ? ROLES.filter((role) => role === 'employee') : ROLES

  const submit = async (values: InviteValues) => {
    if (submitting.current) return
    submitting.current = true
    const chosen = Number(values.locationId === '' ? primaryId : values.locationId)
    try {
      await invite.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        role: values.role,
        employmentType: values.employmentType,
        // Senza campo (o senza sedi caricate) il server usa la sua regola: sede di chi invita o principale
        locationId: showLocation && Number.isInteger(chosen) ? chosen : undefined,
      })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof InviteValues, string | undefined> = {
          firstName: error.fieldErrors.first_name?.[0],
          lastName: error.fieldErrors.last_name?.[0],
          email: error.fieldErrors.email?.[0],
          employmentType: error.fieldErrors.employment_type?.[0],
          role: error.fieldErrors.role?.[0],
          locationId: error.fieldErrors.location_id?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        // Il focus va al primo campo con errore, nell'ordine in cui compaiono
        const first = FIELDS.find((field) => messages[field] !== undefined)
        if (first) form.setFocus(first)
        else toast.error(error.message)
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error, 'throttled') ? error.message : t('errors.generic'))
      return
    }
    toast.success(t('users.inviteDialog.done', { email: values.email }))
    setOpen(false)
    form.reset()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Durante l'invio il dialog non si chiude (Escape, clic fuori): l'esito non va perso
        if (!next && invite.isPending) return
        // Nuova apertura: si può inviare un nuovo invito
        if (next) submitting.current = false
        setOpen(next)
        // Chiudendo si scarta quanto scritto, errori compresi
        if (!next) form.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          {t('users.invite')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.inviteDialog.title')}</DialogTitle>
          <DialogDescription>{t('users.inviteDialog.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {/* Nome e cognome affiancati da sm in su: sono i dati di un'altra persona, niente autocompletamento */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={errors.firstName ? true : undefined}>
                <FieldLabel htmlFor="invite-first-name">{t('users.inviteDialog.firstName')}</FieldLabel>
                <Input
                  id="invite-first-name"
                  autoComplete="off"
                  aria-invalid={errors.firstName ? true : undefined}
                  aria-describedby={errors.firstName ? 'invite-first-name-error' : undefined}
                  {...form.register('firstName')}
                />
                <FieldError id="invite-first-name-error">{errors.firstName?.message}</FieldError>
              </Field>
              <Field data-invalid={errors.lastName ? true : undefined}>
                <FieldLabel htmlFor="invite-last-name">{t('users.inviteDialog.lastName')}</FieldLabel>
                <Input
                  id="invite-last-name"
                  autoComplete="off"
                  aria-invalid={errors.lastName ? true : undefined}
                  aria-describedby={errors.lastName ? 'invite-last-name-error' : undefined}
                  {...form.register('lastName')}
                />
                <FieldError id="invite-last-name-error">{errors.lastName?.message}</FieldError>
              </Field>
            </div>
            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor="invite-email">{t('users.inviteDialog.email')}</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'invite-email-error' : undefined}
                {...form.register('email')}
              />
              <FieldError id="invite-email-error">{errors.email?.message}</FieldError>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">{t('users.inviteDialog.employmentType')}</FieldLegend>
              <Controller
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <RadioGroup
                    aria-invalid={errors.employmentType ? true : undefined}
                    aria-describedby={errors.employmentType ? 'invite-employment-type-error' : undefined}
                    value={field.value}
                    onValueChange={(value) => {
                      if (!isEmploymentType(value)) return
                      field.onChange(value)
                      // Stagista: il ruolo torna Utente, l'unico ammesso
                      if (value === 'intern') form.setValue('role', 'employee')
                    }}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    {EMPLOYMENT_TYPES.map((type) => (
                      <Field key={type} orientation="horizontal">
                        <RadioGroupItem value={type} id={`invite-employment-type-${type}`} />
                        <FieldLabel htmlFor={`invite-employment-type-${type}`}>{t(`users.employmentTypes.${type}`)}</FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                )}
              />
              <FieldError id="invite-employment-type-error">{errors.employmentType?.message}</FieldError>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">{t('users.inviteDialog.role')}</FieldLegend>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <RadioGroup
                    aria-invalid={errors.role ? true : undefined}
                    aria-describedby={[employmentType === 'intern' ? 'invite-role-note' : '', errors.role ? 'invite-role-error' : ''].filter(Boolean).join(' ') || undefined}
                    value={field.value}
                    onValueChange={(value) => isRole(value) && field.onChange(value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    {roles.map((item) => (
                      <Field key={item} orientation="horizontal">
                        <RadioGroupItem value={item} id={`invite-role-${item}`} />
                        <FieldLabel htmlFor={`invite-role-${item}`}>{t(`users.roles.${item}`)}</FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                )}
              />
              {employmentType === 'intern' && <FieldDescription id="invite-role-note">{t('users.internRoleOnly')}</FieldDescription>}
              <FieldError id="invite-role-error">{errors.role?.message}</FieldError>
            </FieldSet>
            {showLocation && (
              <Field data-invalid={errors.locationId ? true : undefined}>
                <Label id="invite-location-label" htmlFor="invite-location">
                  {t('users.inviteDialog.location')}
                </Label>
                <Controller
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <Select value={field.value === '' ? (primaryId === undefined ? '' : String(primaryId)) : field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="invite-location"
                        aria-labelledby="invite-location-label"
                        aria-invalid={errors.locationId ? true : undefined}
                        aria-describedby={errors.locationId ? 'invite-location-error' : undefined}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {(locations.data ?? []).map((location) => (
                          <SelectItem key={location.id} value={String(location.id)}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError id="invite-location-error">{errors.locationId?.message}</FieldError>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('users.inviteDialog.submitting')}
                </>
              ) : (
                t('users.inviteDialog.submit')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default InviteUserDialog
```

- [ ] **Step 10: Modifica con tipo e sede; cambio ruolo di uno stagista**

In `apps/react/src/features/users/components/EditUserDialog.tsx`:
- import: `Controller` da `react-hook-form`; `FieldLegend`, `FieldSet` da `@/components/ui/field`; `Label`; `RadioGroup`, `RadioGroupItem`; `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`; `EMPLOYMENT_TYPES`, `isEmploymentType`, `useMultipleLocations` da `@/features/auth/api`; `useLocationOptions` da `@/features/locations/api`;
- schema e campi:

```tsx
const createSchema = (t: TFunction, askPassword: boolean, emailEditable: boolean) =>
  z.object({
    firstName: z.string().trim().min(1, t('validation.firstNameRequired')),
    lastName: z.string().trim().min(1, t('validation.lastNameRequired')),
    email: emailEditable ? emailField(t) : z.string(),
    employmentType: z.enum(['employee', 'contractor', 'intern']),
    // Id della sede come testo (valore della select)
    locationId: z.string(),
    currentPassword: askPassword ? z.string().min(1, t('validation.passwordRequired')) : z.string(),
  })

type EditValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof EditValues)[] = ['firstName', 'lastName', 'email', 'employmentType', 'locationId', 'currentPassword']
```

- in `EditForm`, dopo `const askPassword = …`:

```tsx
  const multipleLocations = useMultipleLocations()
  // Solo l'admin cambia la sede (can.change_location) e solo se ce n'è più d'una (spec SP2 fase 1 §5.4 e §5.5)
  const showLocation = user.can.change_location && multipleLocations
  const locations = useLocationOptions(showLocation)
  // Uno stagista può essere solo Utente: per un responsabile o un admin il tipo Stagista non si sceglie (spec §7.3)
  const internAllowed = user.role === 'employee'
```

- `defaultValues`: aggiungi `employmentType: user.employment_type, locationId: String(user.location.id)`;
- `submit` riceve anche `employmentType, locationId` e passa a `update.mutateAsync`:

```tsx
        employmentType: employmentType !== user.employment_type ? employmentType : undefined,
        locationId: showLocation && Number(locationId) !== user.location.id ? Number(locationId) : undefined,
```

- nella mappa degli errori di validazione: `employmentType: error.fieldErrors.employment_type?.[0]`, `locationId: error.fieldErrors.location_id?.[0]`;
- nel JSX, dopo il campo email e prima della password:

```tsx
        <FieldSet>
          <FieldLegend variant="label">{t('users.editDialog.employmentType')}</FieldLegend>
          <Controller
            control={form.control}
            name="employmentType"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(value) => isEmploymentType(value) && field.onChange(value)}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={errors.employmentType ? true : undefined}
                aria-describedby={[internAllowed ? '' : 'edit-employment-type-note', errors.employmentType ? 'edit-employment-type-error' : ''].filter(Boolean).join(' ') || undefined}
              >
                {EMPLOYMENT_TYPES.map((type) => (
                  <Field key={type} orientation="horizontal" data-disabled={type === 'intern' && !internAllowed ? true : undefined}>
                    <RadioGroupItem value={type} id={`edit-employment-type-${type}`} disabled={type === 'intern' && !internAllowed} />
                    <FieldLabel htmlFor={`edit-employment-type-${type}`}>{t(`users.employmentTypes.${type}`)}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          />
          {!internAllowed && <FieldDescription id="edit-employment-type-note">{t('users.internNeedsUserRole')}</FieldDescription>}
          <FieldError id="edit-employment-type-error">{errors.employmentType?.message}</FieldError>
        </FieldSet>
        {showLocation && (
          <Field data-invalid={errors.locationId ? true : undefined}>
            <Label id="edit-location-label" htmlFor="edit-location">
              {t('users.editDialog.location')}
            </Label>
            <Controller
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="edit-location"
                    aria-labelledby="edit-location-label"
                    aria-describedby={errors.locationId ? 'edit-location-note edit-location-error' : 'edit-location-note'}
                    aria-invalid={errors.locationId ? true : undefined}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {/* La sede attuale c'è sempre, anche prima che arrivino le opzioni */}
                    {(locations.data ?? [{ id: user.location.id, name: user.location.name, is_primary: false }]).map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription id="edit-location-note">{t('users.editDialog.locationNote')}</FieldDescription>
            <FieldError id="edit-location-error">{errors.locationId?.message}</FieldError>
          </Field>
        )}
```

- aggiorna il commento del componente: "Modifica di nome, cognome, email (solo invitati), tipo di rapporto e, per l'admin, sede."

In `apps/react/src/features/users/components/ChangeRoleDialog.tsx`, in `RoleForm`:

```tsx
  // Uno stagista può essere solo Utente (spec SP2 fase 1 §7.3): il server rifiuta comunque con 422
  const intern = user.employment_type === 'intern'
```

e nel `RadioGroup` aggiungi `aria-describedby={intern ? 'role-intern-note' : undefined}`; sul `RadioGroupItem` `disabled={intern && item === 'manager'}`; dopo il `RadioGroup`:

```tsx
      {intern && (
        <p id="role-intern-note" className="text-sm text-muted-foreground">
          {t('users.internRoleOnly')}
        </p>
      )}
```

- [ ] **Step 11: Azioni di riga: Orario di lavoro e Storico**

In `apps/react/src/features/users/actions.ts`:

```ts
export type UserAction = 'edit' | 'schedule' | 'history' | 'resend' | 'cancel' | 'changeRole' | 'passwordReset' | 'disable' | 'enable'
```

e in `availableActions` sostituisci `all`:

```ts
  // Modifica, orario personale (solo admin) e storico (admin e responsabili) valgono in ogni stato
  const all: [UserAction, boolean][] = [['edit', can.update], ['schedule', can.manage_schedule], ['history', can.view_history], ...byStatus[status]]
```

`apps/react/src/features/users/components/UserScheduleForm.tsx`:

```tsx
import { LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useAddUserSchedule, useDeleteUserSchedule, type UserSchedules, type WorkSchedule } from '@/features/locations/api'
import ConfirmDeleteDialog from '@/features/locations/components/ConfirmDeleteDialog'
import ScheduleSummary from '@/features/locations/components/ScheduleSummary'
import ScheduleVersionsList from '@/features/locations/components/ScheduleVersionsList'
import WeeklyScheduleEditor from '@/features/locations/components/WeeklyScheduleEditor'
import { formatDay } from '@/features/locations/dateFormat'
import { DEFAULT_TIMEZONE, DEFAULT_WEEK, todayIn, validateWeek } from '@/features/locations/scheduleFormat'
import type { ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'

type Mode = 'location' | 'personal'

const isMode = (value: string): value is Mode => value === 'location' || value === 'personal'

interface UserScheduleFormProps {
  user: ManagedUser
  data: UserSchedules
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Orario personale (spec SP2 fase 1 §4.4): "Usa l'orario della sede" o un orario proprio, dal giorno scelto in poi.
 * Parte dalla situazione in vigore: l'orario personale attuale, oppure quello della sede come base da modificare.
 */
const UserScheduleForm = ({ user, data, onClose, onBusyChange }: UserScheduleFormProps) => {
  const { t, i18n } = useTranslation()
  const add = useAddUserSchedule(user.id)
  const remove = useDeleteUserSchedule(user.id)
  // Oggi tutte le sedi sono in Italia: il fuso della sede della persona è quello italiano (il server ricontrolla)
  const [today] = useState(() => todayIn(DEFAULT_TIMEZONE))
  const current = data.schedules.find((schedule) => schedule.is_started)
  const upcoming = data.schedules.filter((schedule) => !schedule.is_started)
  const personalNow = current !== undefined && !current.follows_location
  const [mode, setMode] = useState<Mode>(personalNow ? 'personal' : 'location')
  const [minutes, setMinutes] = useState(personalNow ? current.minutes : (data.location_schedule?.minutes ?? DEFAULT_WEEK))
  const [validFrom, setValidFrom] = useState(today)
  const [errors, setErrors] = useState<{ validFrom?: string; minutes?: string }>({})
  const [target, setTarget] = useState<WorkSchedule | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const submitting = useRef(false)
  // Segue già la sede e non c'è nulla in arrivo: un'altra riga "torna alla sede" non cambierebbe niente
  const alreadyLocation = mode === 'location' && !personalNow && upcoming.length === 0

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || alreadyLocation) return
    const week = mode === 'personal' ? validateWeek(minutes) : null
    const next = {
      validFrom: validFrom === '' || validFrom < today ? t('schedule.validFromPast') : undefined,
      minutes: week === 'invalidHours' ? t('schedule.weekInvalid') : week === 'noWorkingDay' ? t('schedule.noWorkingDay') : undefined,
    }
    setErrors(next)
    if (next.validFrom || next.minutes) return
    submitting.current = true
    onBusyChange(true)
    try {
      await add.mutateAsync(mode === 'location' ? { validFrom, followsLocation: true } : { validFrom, minutes })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const minutesError = Object.entries(error.fieldErrors).find(([key]) => key.startsWith('minutes'))?.[1][0]
        setErrors({ validFrom: error.fieldErrors.valid_from?.[0], minutes: minutesError })
        if (!error.fieldErrors.valid_from && !minutesError) toast.error(error.message)
      } else {
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      }
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t('users.scheduleDialog.saved', { name: user.name, date: formatDay(validFrom, i18n.language) }))
    onClose()
  }

  const confirmDelete = async () => {
    if (!target) return
    try {
      await remove.mutateAsync(target.id)
      toast.success(t('schedule.deleteDialog.done', { date: formatDay(target.valid_from, i18n.language) }))
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
    setConfirmOpen(false)
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">{t('users.scheduleDialog.mode')}</FieldLegend>
            <RadioGroup value={mode} onValueChange={(value) => isMode(value) && setMode(value)}>
              <Field orientation="horizontal">
                <RadioGroupItem value="location" id="user-schedule-location" />
                <FieldLabel htmlFor="user-schedule-location">{t('users.scheduleDialog.useLocation', { location: user.location.name })}</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <RadioGroupItem value="personal" id="user-schedule-personal" />
                <FieldLabel htmlFor="user-schedule-personal">{t('users.scheduleDialog.personal')}</FieldLabel>
              </Field>
            </RadioGroup>
          </FieldSet>
          {mode === 'location' ? (
            <div className="grid gap-2">
              {data.location_schedule && <ScheduleSummary minutes={data.location_schedule.minutes} />}
              {alreadyLocation && <FieldDescription>{t('users.scheduleDialog.alreadyLocation')}</FieldDescription>}
            </div>
          ) : (
            <FieldSet>
              <FieldLegend variant="label">{t('schedule.days')}</FieldLegend>
              <WeeklyScheduleEditor value={minutes} onChange={setMinutes} disabled={add.isPending} />
              {errors.minutes && <FieldError>{errors.minutes}</FieldError>}
            </FieldSet>
          )}
          <Field data-invalid={errors.validFrom ? true : undefined}>
            <FieldLabel htmlFor="user-schedule-valid-from">{t('schedule.validFrom')}</FieldLabel>
            <Input
              id="user-schedule-valid-from"
              type="date"
              min={today}
              value={validFrom}
              className="max-w-48"
              aria-invalid={errors.validFrom ? true : undefined}
              aria-describedby={errors.validFrom ? 'user-schedule-valid-from-error' : undefined}
              onChange={(event) => setValidFrom(event.target.value)}
            />
            <FieldError id="user-schedule-valid-from-error">{errors.validFrom}</FieldError>
          </Field>
        </FieldGroup>
        <DialogFooter className="mt-4">
          <Button type="submit" disabled={add.isPending || alreadyLocation}>
            {add.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {t('users.scheduleDialog.submit')}
          </Button>
        </DialogFooter>
      </form>
      {data.schedules.length > 0 && (
        <ScheduleVersionsList
          schedules={data.schedules}
          onDelete={(schedule) => {
            setTarget(schedule)
            setConfirmOpen(true)
          }}
        />
      )}
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={t('schedule.deleteDialog.title', { date: target ? formatDay(target.valid_from, i18n.language) : '' })}
        description={t('schedule.deleteDialog.description')}
        actionLabel={t('schedule.deleteDialog.action')}
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
        triggerKey={target ? `schedule-${target.id}` : null}
      />
    </div>
  )
}

export default UserScheduleForm
```

`apps/react/src/features/users/components/UserScheduleDialog.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserSchedules } from '@/features/locations/api'
import type { ManagedUser } from '@/features/users/api'
import UserScheduleForm from '@/features/users/components/UserScheduleForm'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserScheduleDialogProps {
  user: ManagedUser | null
  onClose: () => void
}

interface ScheduleBodyProps {
  user: ManagedUser
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form parte dai dati del server: si monta solo quando sono arrivati. */
const ScheduleBody = ({ user, onClose, onBusyChange }: ScheduleBodyProps) => {
  const { t } = useTranslation()
  const schedules = useUserSchedules(user.id)
  if (schedules.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (schedules.isError) return <p role="alert">{t('users.scheduleDialog.loadError')}</p>
  return <UserScheduleForm user={user} data={schedules.data} onClose={onClose} onBusyChange={onBusyChange} />
}

/** Orario di lavoro di una persona, dal menu di riga di Utenti (solo admin, spec SP2 fase 1 §5.4). */
const UserScheduleDialog = ({ user, onClose }: UserScheduleDialogProps) => {
  const { t } = useTranslation()
  const open = user !== null
  const [last, setLast] = useState<ManagedUser | null>(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(USER_TRIGGER_ATTRIBUTE, shown?.id ?? null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('users.scheduleDialog.title', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('users.scheduleDialog.description')}</DialogDescription>
        </DialogHeader>
        {user !== null && <ScheduleBody key={`${openCount}-${user.id}`} user={user} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default UserScheduleDialog
```

In `apps/react/src/features/users/pages/UsersAdminPage.tsx`:

```tsx
import UserHistoryDialog from '@/features/history/components/UserHistoryDialog'
import UserScheduleDialog from '@/features/users/components/UserScheduleDialog'

type ConfirmAction = Exclude<UserAction, 'changeRole' | 'edit' | 'schedule' | 'history'>
```

```tsx
  const [scheduleTarget, setScheduleTarget] = useState<ManagedUser | null>(null)
  const [historyTarget, setHistoryTarget] = useState<ManagedUser | null>(null)
```

nel gestore della voce di menu:

```tsx
            if (action === 'changeRole') setRoleTarget(user)
            else if (action === 'edit') setEditTarget(user)
            else if (action === 'schedule') setScheduleTarget(user)
            else if (action === 'history') setHistoryTarget(user)
            else setConfirm({ user, action })
```

e in fondo al JSX:

```tsx
      <UserScheduleDialog user={scheduleTarget} onClose={() => setScheduleTarget(null)} />
      <UserHistoryDialog user={historyTarget} onClose={() => setHistoryTarget(null)} />
```

- [ ] **Step 12: Amministratori**

In `apps/react/src/features/administrators/api.ts`:

```ts
import type { EmploymentType } from '@/features/auth/api'

export interface InviteAdminInput {
  firstName: string
  lastName: string
  email: string
  /** Un admin non può essere stagista: solo dipendente o collaboratore esterno */
  employmentType: Exclude<EmploymentType, 'intern'>
  /** Solo con più sedi; senza, il server usa la principale */
  locationId?: number
  currentPassword: string
}
```

e nel `mutationFn` di `useInviteAdmin`:

```ts
    mutationFn: ({ firstName, lastName, email, employmentType, locationId, currentPassword }: InviteAdminInput) =>
      requestData('POST', '/api/administrators/invitations', resourceSchema, {
        first_name: firstName,
        last_name: lastName,
        email,
        employment_type: employmentType,
        ...(locationId === undefined ? {} : { location_id: locationId }),
        current_password: currentPassword,
      }),
```

In `apps/react/src/features/administrators/components/InviteAdminForm.tsx`:
- schema: aggiungi `employmentType: z.enum(['employee', 'contractor'])` e `locationId: z.string()`; `defaultValues` con `employmentType: 'employee', locationId: ''`; `FIELDS` con i due campi dopo `email`;
- prima di `submit`:

```tsx
  const multipleLocations = useMultipleLocations()
  const locations = useLocationOptions(multipleLocations)
  const primaryId = locations.data?.find((location) => location.is_primary)?.id
```

- in `submit`, chiama `invite.mutateAsync({ ...values, locationId: multipleLocations && Number.isInteger(chosen) ? chosen : undefined })` con `const chosen = Number(values.locationId === '' ? primaryId : values.locationId)`, e mappa `employment_type` e `location_id` negli errori;
- import da aggiungere: `Controller` da `react-hook-form`; `FieldLegend`, `FieldSet` da `@/components/ui/field`; `Label`; `RadioGroup`, `RadioGroupItem`; `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`; `useMultipleLocations` da `@/features/auth/api`; `useLocationOptions` da `@/features/locations/api`; e in cima al file:

```tsx
// Un admin non può essere stagista (spec SP2 fase 1 §7.3)
const ADMIN_EMPLOYMENT_TYPES: InviteAdminValues['employmentType'][] = ['employee', 'contractor']

const isAdminEmploymentType = (value: string): value is InviteAdminValues['employmentType'] => value === 'employee' || value === 'contractor'
```

(dopo la dichiarazione di `InviteAdminValues`);
- nel JSX, tra il campo email e quello della password:

```tsx
        <FieldSet>
          <FieldLegend variant="label">{t('administrators.grant.employmentType')}</FieldLegend>
          <Controller
            control={form.control}
            name="employmentType"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(value) => isAdminEmploymentType(value) && field.onChange(value)}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={errors.employmentType ? true : undefined}
                aria-describedby={errors.employmentType ? 'invite-admin-employment-type-error' : undefined}
              >
                {ADMIN_EMPLOYMENT_TYPES.map((type) => (
                  <Field key={type} orientation="horizontal">
                    <RadioGroupItem value={type} id={`invite-admin-employment-type-${type}`} />
                    <FieldLabel htmlFor={`invite-admin-employment-type-${type}`}>{t(`users.employmentTypes.${type}`)}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          />
          <FieldError id="invite-admin-employment-type-error">{errors.employmentType?.message}</FieldError>
        </FieldSet>
        {multipleLocations && (
          <Field data-invalid={errors.locationId ? true : undefined}>
            <Label id="invite-admin-location-label" htmlFor="invite-admin-location">
              {t('administrators.grant.location')}
            </Label>
            <Controller
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <Select value={field.value === '' ? (primaryId === undefined ? '' : String(primaryId)) : field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="invite-admin-location"
                    aria-labelledby="invite-admin-location-label"
                    aria-invalid={errors.locationId ? true : undefined}
                    aria-describedby={errors.locationId ? 'invite-admin-location-error' : undefined}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(locations.data ?? []).map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError id="invite-admin-location-error">{errors.locationId?.message}</FieldError>
          </Field>
        )}
```

- in `submit`, al posto di `await invite.mutateAsync(values)`:

```tsx
      const chosen = Number(values.locationId === '' ? primaryId : values.locationId)
      await invite.mutateAsync({ ...values, locationId: multipleLocations && Number.isInteger(chosen) ? chosen : undefined })
```

  e nella mappa degli errori: `employmentType: error.fieldErrors.employment_type?.[0]`, `locationId: error.fieldErrors.location_id?.[0]`.

In `apps/react/src/features/administrators/components/PromoteExistingForm.tsx` sostituisci il filtro dei candidati:

```tsx
  // Un admin non può essere stagista (spec SP2 fase 1 §7.3): gli stagisti non sono tra i candidati
  const people = (candidates.data?.data ?? []).filter((person) => person.role !== 'admin' && person.employment_type !== 'intern')
```

In `apps/react/src/features/administrators/pages/AdministratorsPage.tsx`:

```tsx
import { useMultipleLocations } from '@/features/auth/api'
```

```tsx
  const multipleLocations = useMultipleLocations()
```

e sotto l'email di ogni admin:

```tsx
                    {multipleLocations && <p className="text-sm text-muted-foreground">{t('administrators.location', { name: admin.location.name })}</p>}
```

- [ ] **Step 13: Testi**

In `apps/react/src/locales/it.json`, dentro `users`:
- `"titleWithLocation": "Utenti · {{location}}"`, `"internRoleOnly": "Uno stagista può essere solo Utente."`, `"internNeedsUserRole": "Uno stagista può essere solo Utente: prima cambia il ruolo."`;
- in `columns`: `"employmentType": "Tipo"`, `"location": "Sede"`;
- in `filters`: `"employmentType": "Tipo di rapporto"`, `"allEmploymentTypes": "Tutti i tipi"`, `"location": "Sede"`, `"allLocations": "Tutte le sedi"`;
- in `sort`: `"location": "Sede (A → Z)"`, `"-location": "Sede (Z → A)"`;
- in `actions`: `"schedule": "Orario di lavoro"`, `"history": "Storico"`;
- in `inviteDialog`: `"employmentType": "Tipo di rapporto"`, `"location": "Sede"`;
- in `editDialog`: `"employmentType": "Tipo di rapporto"`, `"location": "Sede"`, `"locationNote": "La persona passa al responsabile della nuova sede."`, e `"description": "Nome, cognome, email, tipo di rapporto e sede di chi usa Holidays."`;
- nuova chiave:

```json
"scheduleDialog": {
  "title": "Orario di lavoro di {{name}}",
  "description": "Senza un orario personale vale quello della sua sede. Il cambio vale dal giorno scelto in poi.",
  "mode": "Orario",
  "useLocation": "Usa l’orario della sede ({{location}})",
  "personal": "Orario personale",
  "alreadyLocation": "Segue già l’orario della sede.",
  "submit": "Salva",
  "saved": "Orario di {{name}} salvato: vale dal {{date}}.",
  "loadError": "Non è stato possibile caricare l’orario."
}
```

In `administrators`: `"location": "Sede: {{name}}"`; in `administrators.grant`: `"employmentType": "Tipo di rapporto"`, `"location": "Sede"`.

In `apps/react/src/locales/en.json`, stesse chiavi:
- `users.titleWithLocation` "Users · {{location}}", `users.internRoleOnly` "An intern can only be a User.", `users.internNeedsUserRole` "An intern can only be a User: change the role first.";
- `columns.employmentType` "Type", `columns.location` "Location"; `filters.employmentType` "Employment type", `filters.allEmploymentTypes` "All types", `filters.location` "Location", `filters.allLocations` "All locations"; `sort.location` "Location (A → Z)", `sort.-location` "Location (Z → A)"; `actions.schedule` "Working hours", `actions.history` "History"; `inviteDialog.employmentType` "Employment type", `inviteDialog.location` "Location"; `editDialog.employmentType` "Employment type", `editDialog.location` "Location", `editDialog.locationNote` "The person moves to the manager of the new location.", `editDialog.description` "Name, surname, email, employment type and location of who uses Holidays.";

```json
"scheduleDialog": {
  "title": "Working hours of {{name}}",
  "description": "Without personal hours, those of their location apply. The change applies from the chosen day on.",
  "mode": "Hours",
  "useLocation": "Use the hours of the location ({{location}})",
  "personal": "Personal hours",
  "alreadyLocation": "Already follows the hours of the location.",
  "submit": "Save",
  "saved": "Working hours of {{name}} saved: they apply from {{date}}.",
  "loadError": "The working hours could not be loaded."
}
```

- `administrators.location` "Location: {{name}}"; `administrators.grant.employmentType` "Employment type", `administrators.grant.location` "Location".

Se esiste già `users.editDialog.description` con un altro testo, sostituiscilo: la Modifica ora tocca anche tipo e sede.

- [ ] **Step 14: Esegui i test e verifica che passino**

Run: `cd apps/react && npx vitest run src/features/users src/features/administrators src/features/history`
Expected: PASS. Se un test esistente si aspettava il corpo dell'invito senza `employment_type`, aggiungilo (Step 3): ora è sempre inviato.

- [ ] **Step 15: Gate**

Run: `cd apps/react && npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 16: Commit**

```bash
git add apps/react/src/features/users apps/react/src/features/administrators apps/react/src/locales/it.json apps/react/src/locales/en.json
git commit -m "feat(utenti): sede, tipo di rapporto, orario di lavoro e storico in Utenti e Amministratori"
```

## Task 15: E2E — sedi, visibilità per sede e storico

**Files:**
- Create: `apps/react/e2e/locations.spec.ts`
- Modify: `apps/react/CLAUDE.md` (nota sui dati dell'E2E delle sedi)

**Interfaces:**
- Consumes: tutto il backend dei Task 1–9 e il frontend dei Task 10–14; `signIn` (`e2e/auth.ts`), `clearInbox` (`e2e/mailpit.ts`); utenti di `DevUserSeeder`: `admin@holidays.test` (Giulia Rossi), `manager@holidays.test` (Marco Bianchi), `employee@holidays.test` (Sara Colombo), `profile@holidays.test` (Paolo Ferri).
- Produces: E2E dei flussi di spec §6.3 e §8.5.

**Dati di sviluppo.** Niente `migrate:fresh`: prima della prima esecuzione basta `sail artisan migrate` (la migration della fase mette tutti nella sede principale), poi `sail artisan cache:clear` e `sail artisan queue:restart` come per gli altri E2E. Ogni esecuzione crea una sede `E2E <timestamp>` e a fine file rimette tutto com'era:
- Marco Bianchi e Sara Colombo tornano nella sede principale;
- Sara Colombo torna al ruolo Utente;
- la sede `E2E <timestamp>` viene archiviata (le sedi non si cancellano: ne resta una archiviata per esecuzione).

Se un'esecuzione si interrompe a metà, il blocco `afterAll` fa la stessa pulizia via API. Il primo test ("una sola sede") si salta da solo se nel database di sviluppo ci sono già più sedi attive (es. create a mano): lo dice nel motivo del salto.

- [ ] **Step 1: Scrivi lo spec**

`apps/react/e2e/locations.spec.ts`:

```ts
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { z } from 'zod'
import { signIn } from './auth.ts'
import { clearInbox } from './mailpit.ts'

const ADMIN = 'admin@holidays.test'
const MANAGER = 'manager@holidays.test'
const MANAGER_NAME = 'Marco Bianchi'
const EMPLOYEE = 'employee@holidays.test'
const EMPLOYEE_NAME = 'Sara Colombo'
// Resta nella sede principale: per il responsabile spostato è "una persona di un'altra sede"
const OTHER = 'profile@holidays.test'
const PASSWORD = 'holidays-dev-password'
const LOCATION_NAME = `E2E ${Date.now()}`
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

test.describe.configure({ mode: 'serial' })

const expectNoViolationsInBothSchemes = async (page: Page): Promise<void> => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    const html = page.locator('html')
    if (colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
    else await expect(html).not.toHaveClass(/\bdark\b/)
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  }
}

const horizontalOverflow = async (page: Page): Promise<number> =>
  z.number().parse(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth'))

/** Lunedì dell'Angelo: Pasqua gregoriana (algoritmo anonimo, Meeus/Jones/Butcher) più un giorno, come nel backend. */
const easterMonday = (year: number): Date => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day + 1))
}

const dayLabel = (date: Date): string => new Intl.DateTimeFormat('it', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let browserRef: Browser
let baseURL: string
let adminContext: BrowserContext | null = null
let admin: Page
const extraContexts: BrowserContext[] = []
let locationId: number | null = null

const newContext = async (): Promise<BrowserContext> => {
  const context = await browserRef.newContext({ baseURL, locale: 'it-IT' })
  extraContexts.push(context)
  return context
}

/** Chiamata all'API con la sessione della pagina (cookie, token CSRF e origine della SPA, come fa src/lib/api.ts). */
const api = async (page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<APIResponse> => {
  const cookies = await page.context().cookies()
  const xsrf = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? ''
  return page.request.fetch(path, {
    method,
    data,
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': decodeURIComponent(xsrf), Origin: baseURL, Referer: `${baseURL}/` },
  })
}

const personSchema = z.object({ data: z.array(z.object({ id: z.number(), first_name: z.string(), last_name: z.string(), role: z.string() })) })

const findPerson = async (page: Page, email: string) => {
  const person = personSchema.parse(await (await api(page, 'GET', `/api/users?filter[email]=${encodeURIComponent(email)}`)).json()).data[0]
  if (!person) throw new Error(`${email} non trovato`)
  return person
}

const primaryLocationId = async (page: Page): Promise<number> => {
  const options = z.object({ data: z.array(z.object({ id: z.number(), is_primary: z.boolean() })) }).parse(await (await api(page, 'GET', '/api/locations/options')).json())
  const primary = options.data.find((option) => option.is_primary)
  if (!primary) throw new Error('Sede principale mancante')
  return primary.id
}

test.beforeAll(async ({ browser }) => {
  browserRef = browser
  const configured = test.info().project.use.baseURL
  if (!configured) throw new Error('baseURL non configurato')
  baseURL = configured
  await clearInbox()
  // Un solo login admin per file: il limite è di 5 al minuto per email e IP
  adminContext = await browserRef.newContext({ baseURL, locale: 'it-IT' })
  admin = await adminContext.newPage()
  await signIn(admin, ADMIN, PASSWORD)
})

test.afterAll(async () => {
  // Pulizia anche dopo un errore a metà: persone nella principale, ruolo di Sara, sede archiviata
  if (adminContext) {
    const primaryId = await primaryLocationId(admin)
    for (const email of [MANAGER, EMPLOYEE]) {
      const person = await findPerson(admin, email)
      await api(admin, 'PATCH', `/api/users/${person.id}`, { first_name: person.first_name, last_name: person.last_name, location_id: primaryId })
      if (email === EMPLOYEE && person.role === 'manager') await api(admin, 'PATCH', `/api/users/${person.id}/role`, { role: 'employee' })
    }
    // Già archiviata dall'ultimo test: il 409 si ignora
    if (locationId !== null) await api(admin, 'POST', `/api/locations/${locationId}/archive`)
  }
  for (const context of extraContexts) await context.close()
  await adminContext?.close()
})

test('with a single active location there is no trace of the location column', async () => {
  await admin.goto('/admin/locations')
  const activeTab = admin.getByRole('tab', { name: /Attive/ })
  await expect(activeTab).toContainText(/\d/)
  const active = Number((await activeTab.textContent())?.replace(/\D/g, '') ?? '0')
  test.skip(active > 1, `Nel database di sviluppo ci sono già ${active} sedi attive`)

  await admin.goto('/users')
  await expect(admin.getByRole('columnheader', { name: 'Tipo' })).toBeVisible()
  await expect(admin.getByRole('columnheader', { name: 'Sede' })).toHaveCount(0)
})

test('an admin creates a location with its patron and checks the calendar of the year', async () => {
  await admin.goto('/admin/locations')
  await admin.getByRole('button', { name: 'Nuova sede' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Nuova sede' })
  await dialog.getByLabel('Nome').fill(LOCATION_NAME)
  await dialog.getByLabel('Città').fill('Milano')
  await dialog.getByLabel('Patrono (giorno/mese)').fill('07/12')
  await dialog.getByRole('button', { name: 'Crea sede' }).click()

  await expect(admin.getByText(`Sede ${LOCATION_NAME} creata.`)).toBeVisible()
  await expect(admin).toHaveURL(/\/admin\/locations\/\d+$/)
  locationId = Number(new URL(admin.url()).pathname.split('/').pop())
  await expect(admin.getByRole('heading', { level: 1, name: LOCATION_NAME })).toBeVisible()

  // L'anno prossimo: Pasquetta e patrono nel giorno giusto
  const year = new Date().getFullYear() + 1
  const calendar = admin.getByRole('region', { name: 'Calendario dell’anno' })
  await calendar.getByRole('combobox', { name: 'Anno' }).click()
  await admin.getByRole('option', { name: String(year) }).click()
  await expect(calendar.getByRole('listitem').filter({ hasText: dayLabel(easterMonday(year)) })).toContainText(/Angelo/)
  await expect(calendar.getByRole('listitem').filter({ hasText: dayLabel(new Date(Date.UTC(year, 11, 7))) })).toContainText(/patrono|E2E/i)

  await expectNoViolationsInBothSchemes(admin)
  await admin.setViewportSize({ width: 360, height: 800 })
  expect(await horizontalOverflow(admin)).toBeLessThanOrEqual(0)
  await admin.setViewportSize({ width: 1280, height: 800 })
})

test('the admin promotes an employee to manager and moves her and a manager to the new location', async () => {
  // Cambio di ruolo: Sara diventa responsabile
  await admin.goto(`/users?email=${encodeURIComponent(EMPLOYEE)}`)
  const saraRow = admin.getByRole('table').getByRole('row').filter({ hasText: EMPLOYEE })
  await saraRow.getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Cambia ruolo' }).click()
  const roleDialog = admin.getByRole('dialog', { name: `Cambia ruolo di ${EMPLOYEE_NAME}` })
  await roleDialog.getByRole('radio', { name: 'Responsabile' }).check()
  await roleDialog.getByRole('button', { name: 'Salva ruolo' }).click()
  await expect(admin.getByText(`Ruolo di ${EMPLOYEE_NAME} aggiornato.`)).toBeVisible()

  // Cambio di sede di Sara e di Marco dalla Modifica, con la nota sul nuovo responsabile
  for (const [email, name] of [
    [EMPLOYEE, EMPLOYEE_NAME],
    [MANAGER, MANAGER_NAME],
  ]) {
    await admin.goto(`/users?email=${encodeURIComponent(email)}`)
    const row = admin.getByRole('table').getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: `Azioni per ${name}` }).click()
    await admin.getByRole('menuitem', { name: 'Modifica' }).click()
    const dialog = admin.getByRole('dialog', { name: `Modifica ${name}` })
    await expect(dialog.getByText('La persona passa al responsabile della nuova sede.')).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Sede' }).click()
    await admin.getByRole('option', { name: LOCATION_NAME }).click()
    await dialog.getByRole('button', { name: 'Salva' }).click()
    await expect(admin.getByText(`Dati di ${name} aggiornati.`)).toBeVisible()
    await expect(row.getByRole('cell', { name: LOCATION_NAME })).toBeVisible()
  }

  // Con due sedi l'admin vede colonna e filtro Sede
  await admin.goto(`/users?location=${locationId}`)
  await expect(admin.getByRole('columnheader', { name: 'Sede' })).toBeVisible()
  await expect(admin.getByRole('table').getByRole('row')).toHaveCount(3)
  await expectNoViolationsInBothSchemes(admin)
})

test('the manager sees only the people of his location and gets 404 for the others', async () => {
  await clearInbox()
  const context = await newContext()
  const manager = await context.newPage()
  await signIn(manager, MANAGER, PASSWORD)

  await manager.goto('/users')
  await expect(manager.getByRole('heading', { level: 1, name: `Utenti · ${LOCATION_NAME}` })).toBeVisible()
  const table = manager.getByRole('table')
  await expect(table.getByRole('row').filter({ hasText: EMPLOYEE })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: OTHER })).toHaveCount(0)
  // Nessuna colonna, filtro o campo Sede per il responsabile
  await expect(manager.getByRole('columnheader', { name: 'Sede' })).toHaveCount(0)

  // Indirizzo di una persona di un'altra sede: per lui non esiste
  const other = await findPerson(admin, OTHER)
  expect((await api(manager, 'GET', `/api/users/${other.id}/history`)).status()).toBe(404)
  expect((await api(manager, 'POST', `/api/users/${other.id}/disable`)).status()).toBe(404)
})

test('the history shows the promotion and the move, in the profile and in the users table', async () => {
  await clearInbox()
  const context = await newContext()
  const sara = await context.newPage()
  await signIn(sara, EMPLOYEE, PASSWORD)

  await sara.goto('/profile')
  const history = sara.getByRole('region', { name: 'Storico' })
  await expect(history).toContainText('Ruolo: Utente → Responsabile')
  await expect(history).toContainText(new RegExp(`Sede: .+ → ${escapeRegExp(LOCATION_NAME)}`))
  await expect(sara.getByRole('region', { name: 'Dati personali' }).getByLabel('Sede')).toHaveValue(LOCATION_NAME)
  await expectNoViolationsInBothSchemes(sara)

  // Dal menu di riga l'admin vede le stesse tappe con chi le ha fatte
  await admin.goto(`/users?email=${encodeURIComponent(EMPLOYEE)}`)
  await admin.getByRole('table').getByRole('row').filter({ hasText: EMPLOYEE }).getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Storico' }).click()
  const dialog = admin.getByRole('dialog', { name: `Storico di ${EMPLOYEE_NAME}` })
  await expect(dialog).toContainText('Ruolo: Utente → Responsabile')
  await expect(dialog.getByText('da Giulia Rossi').first()).toBeVisible()
  await admin.keyboard.press('Escape')
})

test('the admin puts everything back and archives the location', async () => {
  const primaryId = await primaryLocationId(admin)
  for (const email of [MANAGER, EMPLOYEE]) {
    const person = await findPerson(admin, email)
    expect((await api(admin, 'PATCH', `/api/users/${person.id}`, { first_name: person.first_name, last_name: person.last_name, location_id: primaryId })).status()).toBe(200)
  }
  const sara = await findPerson(admin, EMPLOYEE)
  expect((await api(admin, 'PATCH', `/api/users/${sara.id}/role`, { role: 'employee' })).status()).toBe(200)

  await admin.goto('/admin/locations')
  await admin.getByRole('row').filter({ hasText: LOCATION_NAME }).getByRole('button', { name: `Azioni per ${LOCATION_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Archivia' }).click()
  await admin.getByRole('alertdialog', { name: `Archiviare ${LOCATION_NAME}?` }).getByRole('button', { name: 'Archivia' }).click()
  await expect(admin.getByText(`${LOCATION_NAME} archiviata.`)).toBeVisible()
  await admin.getByRole('tab', { name: /Archiviate/ }).click()
  await expect(admin.getByRole('link', { name: LOCATION_NAME })).toBeVisible()
})
```

- [ ] **Step 2: Esegui l'E2E e verifica che passi**

Prerequisiti: Sail acceso con `queue`, `sail artisan migrate`, `sail artisan cache:clear`, `sail artisan queue:restart`, Mailpit su `localhost:8025`.

Run: `cd apps/react && npx playwright test e2e/locations.spec.ts`
Expected: PASS (il primo test può risultare "skipped" con il motivo, se ci sono già più sedi attive). Poi l'intera suite: `npx playwright test` — PASS, compreso `admin-users.spec.ts` con il ruolo "Utente".

- [ ] **Step 3: Nota nel CLAUDE.md del frontend**

In `apps/react/CLAUDE.md`, nella riga di `npm run test:e2e`, prima della chiusura della parentesi aggiungi:

```
; `locations.spec.ts` crea a ogni esecuzione una sede `E2E <timestamp>`, ci sposta `manager@holidays.test` ed `employee@holidays.test` (Sara diventa responsabile), entra come admin, responsabile e Sara (un accesso ciascuno), poi rimette persone e ruolo come prima e archivia la sede (ne resta una archiviata per esecuzione; la pulizia gira anche dopo un errore); il primo test si salta se nel database ci sono già più sedi attive; dopo la fase 1 del sotto-progetto 2 serve `sail artisan migrate`
```

- [ ] **Step 4: Commit**

```bash
git add apps/react/e2e/locations.spec.ts apps/react/CLAUDE.md
git commit -m "test(e2e): sedi, visibilità per sede e storico"
```

## Verifica finale (dopo i task)

- [ ] **Step 1: Gate completi**

Run, da `apps/laravel`:

```bash
./vendor/bin/sail artisan test --compact
./vendor/bin/sail composer analyse
./vendor/bin/sail bin pint --test
```

Run, da `apps/react`:

```bash
npm test
npm run lint
npm run build
```

Expected: tutto verde, senza test saltati se non quelli già saltati prima della fase.

- [ ] **Step 2: E2E completi**

Prerequisiti: Sail acceso con `queue`, `sail artisan migrate`, `sail artisan cache:clear`, `sail artisan queue:restart`. Mai `migrate:fresh` sul database di sviluppo.

Run: `cd apps/react && npx playwright test`
Expected: tutti verdi (il test "una sola sede" può essere saltato con il suo motivo).

- [ ] **Step 3: Controllo visivo con Playwright MCP**

Con il dev server (`npm run dev`) e Sail accesi, entra come admin (`admin@holidays.test`, codice da Mailpit) e, per ogni vista, fai uno screenshot in chiaro e in scuro (desktop 1280 e telefono 360):
- `/admin/locations`: schede Attive e Archiviate, badge Principale e Nessun responsabile, menu di riga, dialog Nuova sede;
- `/admin/locations/:id` di una sede di prova: card Dati, Orario standard con versioni, Chiusure con badge Tutte le sedi, Calendario dell'anno; dialog Cambia orario (editor dei 7 giorni) e Nuova chiusura;
- `/users` da admin con due sedi attive (colonne Tipo e Sede, filtri Tipo e Sede, dialog di invito con Tipo e Sede, Modifica con la nota sulla sede, Orario di lavoro, Storico) e da responsabile (titolo "Utenti · <sede>", nessuna traccia della sede);
- `/profile`: Sede e Tipo in sola lettura, card Storico sotto Preferenze, "Mostra tutto".

Controlla: niente scroll orizzontale a 360 px, focus visibile su menu e dialog, testi senza chiavi di traduzione non risolte (es. `locations.badges.primary`), etichette dei giorni del calendario leggibili. A fine controllo archivia la sede di prova e rimetti le persone nella principale, e cancella la cartella `.playwright-mcp` se creata.

- [ ] **Step 4: Documentazione di progetto**

In `apps/laravel/CLAUDE.md`, sezione "Ambiente", aggiungi una voce (dopo quella sul profilo):

```
- Sedi (`Location`, solo admin, `LocationPolicy`): sempre una e una sola principale (`primary_marker` unico), si archiviano e non si cancellano. Ogni utente ha `location_id` ed `employment_type` (`EmploymentType`: dipendente, collaboratore esterno, stagista; lo stagista è solo `employee`, che nell'interfaccia si chiama "Utente"). Il responsabile vede e gestisce solo la sua sede: lo scope `User::visibleTo()` vale per la lista e per la risoluzione di `{user}` (fuori sede: 404). Giorni lavorativi solo da `WorkCalendar` (orario personale o della sede, festivi nazionali da `HolidayCalendars`, patrono, chiusure). Lo storico della persona (`user_history`) lo scrive solo `UserHistoryRecorder`, nella stessa transazione della modifica.
```

In `apps/react/CLAUDE.md`, sezione "Ambiente", aggiungi:

```
- Sedi: con una sola sede attiva (`meta.multiple_locations = false` in `/api/auth/user`, hook `useMultipleLocations`) colonna, filtro e campi Sede non compaiono; il tipo di rapporto invece c'è sempre. Il ruolo `employee` si mostra come "Utente": "Dipendente" è un tipo di rapporto. Giorni e ore degli orari passano da `features/locations/scheduleFormat.ts`, le date del calendario (YYYY-MM-DD) da `features/locations/dateFormat.ts` (formattate in UTC, mai con il fuso del dispositivo).
```

- [ ] **Step 5: Commit della documentazione**

```bash
git add apps/laravel/CLAUDE.md apps/react/CLAUDE.md
git commit -m "docs(sedi): sedi, tipo di rapporto e storico nelle istruzioni di progetto"
```
