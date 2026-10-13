# Fase 3 — Inviti, gestione utenti e amministratori: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un admin invita dipendenti e responsabili, che attivano l'account dal link e entrano con il codice via email. L'admin gestisce gli utenti (reinvia, annulla, cambia ruolo, disattiva, riattiva) e nella sezione "Amministratori" promuove e revoca gli admin con protezioni rafforzate. Il primo admin nasce da `app:create-admin`.

**Architecture:**
- **Backend:** due service con la logica (`InvitationService`, `UserManagementService`), una `UserPolicy` nativa con metodi bool, controller sottili e FormRequest. Un trait conferma la password per le azioni sugli admin. La regola "mai zero admin" sta in una transazione con `lockForUpdate`.
- **Frontend:** nuove feature `users`, `administrators` e `invitations`, con hook TanStack Query, schemi zod e componenti shadcn. Le route admin sono protette da `AdminRoute`.

**Tech Stack:** Laravel 13 · PHP 8.5 · Sail · Sanctum · PHPUnit · Larastan · React 19 · React Router 8 · TanStack Query 5 · react-hook-form + zod · shadcn 4.21 (Radix) · i18next · Vitest + MSW · Playwright + axe.

**Spec:**
- `docs/superpowers/specs/2026-10-13-fase-3-inviti-utenti-admin-design.md` (decisioni di questa fase, prevale);
- `docs/superpowers/specs/2026-09-30-fondamenta-autenticazione-design.md` (spec principale).

## Global Constraints

- **Branch e commit:**
  - branch `feature/auth-fase-3`, già creato e attivo;
  - commit piccoli in Conventional Commits in italiano, senza riga di attribuzione, mai push.
- **Comandi:** Laravel da `apps/laravel` con `./vendor/bin/sail …` (qui `sail`); frontend da `apps/react`.
- **Regole di progetto** (`apps/laravel/CLAUDE.md`, `apps/react/CLAUDE.md`): valgono quelle, **non** le guide Dieffetech escluse (niente antd/DF, `useApi`, SWR, Spatie QueryBuilder, classi base del template).
- **Lingua:** identificatori in inglese, **commenti in italiano**, testi per l'utente solo da traduzioni (`lang/{it,en}`, `src/locales/{it,en}.json`).
- **Laravel:**
  - `env()` solo in `config/`;
  - FormRequest per ogni input, output solo tramite API Resource, Policy native con metodi bool;
  - `role` e `status` impostati solo nei service con `forceFill`;
  - email **dopo il commit** (`DB::afterCommit`);
  - log con context array, mai `catch` silenziosi;
  - `Translate::text()` per i testi PHP;
  - dopo ogni modifica PHP `sail bin pint <file> --format agent`.
- **React:**
  - niente `any`, niente `as` (né `as const`), `interface` per le props, componenti arrow function, un componente per file;
  - niente `console.*`, classi condizionali con `cn` da `@/lib/utils`;
  - dati server solo con TanStack Query, risposte validate con zod;
  - `erasableSyntaxOnly`: niente `enum` TS né parameter properties;
  - React Hooks v7: niente lettura o scrittura di `ref.current` durante il render, niente `setState` sincrono nel corpo di un `useEffect`.
- **Componenti shadcn mancanti:** solo con `npx shadcn@4.21.0 add <nome>` (style `radix-nova` già configurato).
- **Valori della spec:**
  - invito valido **72 ore**, reinvio al massimo ogni **60 s**;
  - pagine pubbliche dell'invito **10/min per IP**;
  - API admin **60/min per utente**;
  - password di conferma: **5 errori ogni 15 minuti** per admin, poi `429`;
  - lista utenti paginata a **25**, ricerca con debounce di **300 ms**;
  - password con le regole già attive (`Password::defaults()`: min 12, HIBP) e `confirmed`.
- **Ruoli:**
  - all'invito e nel cambio ruolo solo `employee` o `manager`;
  - `admin` solo per promozione o con `app:create-admin`.
- **Limite di finalità (spec §7.3):** la gestione utenti non espone né mostra `last_login_at`.
- **Gate a fine di ogni task:**
  - backend: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint --test`;
  - frontend: `npm test`, `npm run lint`, `npm run build`.
- **Test Laravel:**
  - il client di test manda `Accept-Language: en-us`; i test che controllano testi italiani aggiungono `withHeader('Accept-Language', 'it')` in `setUp()`;
  - le chiamate autenticate usano `$this->actingAs($user)`.
- **Database di sviluppo:** mai `migrate:fresh` o altro che lo svuoti. Le nuove migration si applicano con `sail artisan migrate`.

## Review Focus

1. **Due admin si revocano a vicenda nello stesso istante** (o uno revoca mentre l'altro disattiva): resta sempre almeno un admin attivo → test in Task 6 (prove in sequenza sulle stesse righe bloccate; la serializzazione la garantisce `lockForUpdate`).
2. **Un admin appena revocato ha la pagina admin ancora aperta:** la richiesta successiva riceve `403` e la SPA mostra la pagina 403 → test in Task 6 (backend) e Task 9 (frontend).
3. **Invito a un'email già invitata o in uso** (anche con maiuscole o spazi): `422` chiaro sul campo email, nessun doppio utente → test in Task 3.
4. **Link di invito vecchio dopo un reinvio:** il vecchio token dà `404`, il nuovo funziona → test in Task 3 e Task 4.
5. **Logout di un admin:** sparisce dalla cache anche la lista utenti, così chi accede dopo sullo stesso browser non la vede → test in Task 8.

## Struttura dei file

**Laravel (`apps/laravel`)**

| File | Responsabilità |
|---|---|
| `database/migrations/*_create_invitations_table.php` · `*_add_actor_id_to_auth_events_table.php` | Schema |
| `app/Models/Invitation.php` (+ `User::invitation()`, `AuthEvent` `actor_id`) | Model |
| `app/Enums/{AuthEventType,AdminChange}.php` | Enum |
| `app/Services/AuthEventLogger.php` | Log con `actor` |
| `app/Services/{InvitationService,UserManagementService}.php` | Logica |
| `app/Policies/UserPolicy.php` | Permessi |
| `app/Http/Requests/Concerns/ConfirmsCurrentPassword.php` | Password di conferma con blocco |
| `app/Http/Requests/Users/*.php` · `app/Http/Requests/Invitations/AcceptInvitationRequest.php` | Validazione |
| `app/Http/Controllers/Admin/{UserController,UserInvitationController,UserRoleController,UserStatusController,AdministratorController}.php` | API admin |
| `app/Http/Controllers/Auth/InvitationController.php` | API pubblica dell'invito |
| `app/Http/Resources/ManagedUserResource.php` | Output della gestione utenti |
| `app/Mail/{InvitationMail,AdminChangeMail}.php` + `resources/views/mail/{auth/invitation,admin/change}.blade.php` | Email |
| `app/Console/Commands/CreateAdmin.php` | Primo admin |
| `lang/{it,en}/{users,invitations}.php`, `lang/{it,en}/enums.php` | Testi |

**React (`apps/react`)**

| File | Responsabilità |
|---|---|
| `src/components/ui/{dialog,alert-dialog,table,select,checkbox,tabs,radio-group}.tsx` | shadcn (generati) |
| `src/features/auth/AdminRoute.tsx` · `src/pages/ForbiddenPage.tsx` | Protezione route admin |
| `src/features/users/{api,schemas}.ts` · `src/features/users/components/*` · `src/features/users/pages/UsersPage.tsx` | Gestione utenti |
| `src/features/administrators/api.ts` · `.../pages/AdministratorsPage.tsx` · `.../components/*` | Sezione admin |
| `src/features/invitations/api.ts` · `.../pages/AcceptInvitationPage.tsx` · `src/pages/PrivacyPage.tsx` | Pagine pubbliche |
| `src/lib/queryKeys.ts` · `src/features/auth/api.ts` (logout) · `src/components/layout/AppShell.tsx` (menu) · `src/routes.tsx` | Infrastruttura |
| `e2e/admin-users.spec.ts` · `e2e/mailpit.ts` | E2E |

---

## Task 1: Fondamenta — tabelle, model, eventi con autore, limite API

**Files:**
- Create: `apps/laravel/database/migrations/2026_10_13_100000_create_invitations_table.php`, `apps/laravel/database/migrations/2026_10_13_100100_add_actor_id_to_auth_events_table.php`
- Create: `apps/laravel/app/Models/Invitation.php`, `apps/laravel/database/factories/InvitationFactory.php`
- Modify: `apps/laravel/app/Models/User.php` (relazione `invitation`), `apps/laravel/app/Models/AuthEvent.php` (`actor_id`), `apps/laravel/app/Enums/AuthEventType.php`, `apps/laravel/app/Services/AuthEventLogger.php`
- Modify: `apps/laravel/config/app.php` (`privacy_notice_version`), `apps/laravel/.env.example`, `apps/laravel/bootstrap/app.php` (`throttleApi`), `apps/laravel/app/Providers/AppServiceProvider.php` (limiter `api`)
- Test: `apps/laravel/tests/Feature/Users/InvitationModelTest.php`, `apps/laravel/tests/Feature/Auth/AuthEventLoggerTest.php` (aggiunta), `apps/laravel/tests/Feature/Http/ApiRateLimitTest.php`

**Interfaces:**
- Produces:
  - Model `App\Models\Invitation`:
    - colonne `user_id`, `token_hash` (hidden), `invited_by`, `expires_at`, `accepted_at`, `last_sent_at` (date `CarbonImmutable` o `Carbon` come gli altri model);
    - `user(): BelongsTo`, `inviter(): BelongsTo`, `isExpired(): bool`, `isAccepted(): bool`;
    - factory con gli stati `expired()` e `accepted()`.
  - `User::invitation(): HasOne`.
  - `AuthEventType::{InvitationCancelled, RoleChanged, AdminGranted, AdminRevoked}`.
  - `AuthEventLogger::log(AuthEventType $type, Request $request, ?User $user = null, ?User $actor = null): void`.
  - `config('app.privacy_notice_version')`.
  - Limiter `api` a 60/min per utente (o per IP da ospite) su tutto il gruppo `api`.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/InvitationModelTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvitationModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_belongs_to_the_invited_user_and_the_inviter(): void
    {
        $admin = User::factory()->admin()->create();
        $invitation = Invitation::factory()->create(['invited_by' => $admin->id]);

        $this->assertTrue($invitation->user?->is($invitation->user()->first()));
        $this->assertTrue($invitation->inviter?->is($admin));
        $this->assertTrue($invitation->user?->invitation?->is($invitation));
    }

    public function test_knows_when_it_is_expired_or_accepted(): void
    {
        $this->assertFalse(Invitation::factory()->create()->isExpired());
        $this->assertTrue(Invitation::factory()->expired()->create()->isExpired());
        $this->assertFalse(Invitation::factory()->create()->isAccepted());
        $this->assertTrue(Invitation::factory()->accepted()->create()->isAccepted());
    }

    public function test_never_serializes_the_token_hash(): void
    {
        $this->assertArrayNotHasKey('token_hash', Invitation::factory()->create()->toArray());
    }

    public function test_is_deleted_with_its_user(): void
    {
        $invitation = Invitation::factory()->create();

        $invitation->user?->delete();

        $this->assertModelMissing($invitation);
    }
}
```

In `tests/Feature/Auth/AuthEventLoggerTest.php` aggiungi (stesso stile del file, che usa `app(AuthEventLogger::class)` e `Request::create`; adegua se il file costruisce la richiesta in altro modo):

```php
    public function test_records_who_performed_the_action(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();

        app(AuthEventLogger::class)->log(AuthEventType::UserDisabled, Request::create('/'), $target, $admin);

        $this->assertDatabaseHas('auth_events', [
            'user_id' => $target->id,
            'actor_id' => $admin->id,
            'event' => AuthEventType::UserDisabled->value,
        ]);
    }
```

`tests/Feature/Http/ApiRateLimitTest.php`:

```php
<?php

namespace Tests\Feature\Http;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiRateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_api_calls_are_limited_to_sixty_per_minute_per_user(): void
    {
        $user = User::factory()->create();

        for ($call = 0; $call < 60; $call++) {
            $this->actingAs($user)->getJson('/api/auth/user')->assertOk();
        }

        $this->actingAs($user)->getJson('/api/auth/user')->assertTooManyRequests();
        // Il contatore è per utente: un collega dallo stesso IP non è bloccato
        $this->actingAs(User::factory()->create())->getJson('/api/auth/user')->assertOk();
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/InvitationModelTest.php tests/Feature/Auth/AuthEventLoggerTest.php tests/Feature/Http/ApiRateLimitTest.php`
Expected: FAIL. La classe `Invitation` non esiste, la colonna `actor_id` manca e la 61ª chiamata risponde 200.

- [ ] **Step 3: Migration**

`database/migrations/2026_10_13_100000_create_invitations_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            // Un solo invito per utente: il reinvio aggiorna la riga
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            // SHA-256 del token: il token in chiaro esiste solo nell'email
            $table->char('token_hash', 64)->unique();
            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('last_sent_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
```

`database/migrations/2026_10_13_100100_add_actor_id_to_auth_events_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('auth_events', function (Blueprint $table) {
            // Chi ha compiuto l'azione (admin); user_id resta chi la subisce
            $table->foreignId('actor_id')->nullable()->after('user_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('auth_events', function (Blueprint $table) {
            $table->dropConstrainedForeignId('actor_id');
        });
    }
};
```

- [ ] **Step 4: Model, factory, enum, logger**

`app/Models/Invitation.php` (stesso stile di `LoginChallenge`, con attributi `#[Fillable]`/`#[Hidden]`):

```php
<?php

namespace App\Models;

use Database\Factories\InvitationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'token_hash', 'invited_by', 'expires_at', 'accepted_at', 'last_sent_at'])]
#[Hidden(['token_hash'])]
class Invitation extends Model
{
    /** @use HasFactory<InvitationFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'last_sent_at' => 'datetime',
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
    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isAccepted(): bool
    {
        return $this->accepted_at !== null;
    }
}
```

`database/factories/InvitationFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Invitation>
 */
class InvitationFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory()->invited(),
            'token_hash' => hash('sha256', Str::random(64)),
            'invited_by' => null,
            'expires_at' => now()->addHours(72),
            'accepted_at' => null,
            'last_sent_at' => now(),
        ];
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes): array => ['expires_at' => now()->subMinute()]);
    }

    public function accepted(): static
    {
        return $this->state(fn (array $attributes): array => ['accepted_at' => now()]);
    }
}
```

`User.php`: aggiungi l'import di `HasOne` e:

```php
    /**
     * @return HasOne<Invitation, $this>
     */
    public function invitation(): HasOne
    {
        return $this->hasOne(Invitation::class);
    }
```

`AuthEvent.php`: aggiungi `actor_id` all'elenco `#[Fillable]` e la relazione:

```php
    /**
     * @return BelongsTo<User, $this>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
```

`AuthEventType.php`: aggiungi i casi

```php
    case InvitationCancelled = 'invitation_cancelled';
    case RoleChanged = 'role_changed';
    case AdminGranted = 'admin_granted';
    case AdminRevoked = 'admin_revoked';
```

`AuthEventLogger::log()`:

```php
    public function log(AuthEventType $type, Request $request, ?User $user = null, ?User $actor = null): void
    {
        AuthEvent::query()->create([
            'user_id' => $user?->id,
            'actor_id' => $actor?->id,
            'event' => $type,
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 255, ''),
        ]);
    }
```

- [ ] **Step 5: Configurazione e limite API**

`config/app.php`, sotto `display_timezone`:

```php
    // Versione dell'informativa privacy di cui l'utente prende visione all'attivazione (spec §6.1)
    'privacy_notice_version' => env('PRIVACY_NOTICE_VERSION', '1.0'),
```

`.env.example`: aggiungi `PRIVACY_NOTICE_VERSION=1.0` vicino a `APP_DISPLAY_TIMEZONE`.

`bootstrap/app.php`, dentro `withMiddleware`, dopo `statefulApi()`:

```php
        // API autenticata: 60 richieste al minuto per utente (spec §8.1), limiter `api` in AppServiceProvider
        $middleware->throttleApi();
```

`AppServiceProvider::boot()` (import `Illuminate\Cache\RateLimiting\Limit`, `Illuminate\Http\Request`, `Illuminate\Support\Facades\RateLimiter`):

```php
        // Per utente quando c'è una sessione, per IP da ospite
        RateLimiter::for('api', fn (Request $request): Limit => Limit::perMinute(60)
            ->by('api:'.($request->user()?->getAuthIdentifier() ?? $request->ip())));
```

- [ ] **Step 6: Migrazione del database di sviluppo e test**

Run: `sail artisan migrate` (aggiunge le tabelle, non svuota nulla), poi `sail artisan test --compact`.
Expected: tutti PASS.

- [ ] **Step 7: Gate e commit**

```bash
sail bin pint database app config bootstrap tests --format agent && sail bin pint --test && sail composer analyse
git add apps/laravel
git commit -m "feat(users): tabella degli inviti, autore negli eventi di sicurezza e limite delle api"
```

---

## Task 2: Permessi e lista utenti per l'admin

**Files:**
- Create: `apps/laravel/app/Policies/UserPolicy.php`
- Create: `apps/laravel/app/Http/Requests/Users/ListUsersRequest.php`, `apps/laravel/app/Http/Controllers/Admin/UserController.php`, `apps/laravel/app/Http/Resources/ManagedUserResource.php`
- Modify: `apps/laravel/routes/api.php`, `apps/laravel/app/Enums/UserStatus.php` (già con `label()`), `apps/laravel/lang/{it,en}/users.php` (nuovi)
- Test: `apps/laravel/tests/Feature/Users/UserIndexTest.php`, `apps/laravel/tests/Feature/Users/UserPolicyTest.php`

**Interfaces:**
- Consumes: `Invitation`, `User::invitation()` (Task 1).
- Produces:
  - `UserPolicy` con i metodi `viewAny`, `create`, `resendInvitation`, `cancelInvitation`, `changeRole`, `disable`, `enable`, `grantAdmin`, `revokeAdmin` (firme sotto).
    - La policy decide **chi** può agire su **chi** (`403`). Lo stato incompatibile del bersaglio (es. reinviare a un utente già attivo) lo controllano i controller con `409`.
    - Scelta di implementazione rispetto alla tabella §6 del design: dà un messaggio più preciso e mantiene i metodi della policy senza query.
  - `GET /api/users` (nome `users.index`): `200 {data: ManagedUser[], links, meta: {current_page, last_page, per_page, total, counts: {all, active, invited, disabled}}}`.
  - `ManagedUserResource`, con chiavi **esatte** `id`, `name`, `email`, `role`, `role_label`, `status`, `status_label`, `invitation_expires_at` (ISO 8601 o `null`) e `is_current_user`.
  - Gruppo di rotte admin in `routes/api.php`, dentro `auth:sanctum`, dove i task successivi aggiungono le loro.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/UserPolicyTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Models\User;
use App\Policies\UserPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_admins_manage_users(): void
    {
        $policy = new UserPolicy;
        $target = User::factory()->create();

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $nonAdmin) {
            $this->assertFalse($policy->viewAny($nonAdmin));
            $this->assertFalse($policy->create($nonAdmin));
            $this->assertFalse($policy->disable($nonAdmin, $target));
            $this->assertFalse($policy->grantAdmin($nonAdmin, $target));
        }

        $admin = User::factory()->admin()->create();
        $this->assertTrue($policy->viewAny($admin));
        $this->assertTrue($policy->create($admin));
        $this->assertTrue($policy->disable($admin, $target));
        $this->assertTrue($policy->grantAdmin($admin, $target));
    }

    public function test_admins_cannot_act_on_themselves(): void
    {
        $policy = new UserPolicy;
        $admin = User::factory()->admin()->create();

        $this->assertFalse($policy->disable($admin, $admin));
        $this->assertFalse($policy->changeRole($admin, $admin));
        $this->assertFalse($policy->revokeAdmin($admin, $admin));
    }

    public function test_role_changes_never_touch_admins(): void
    {
        $policy = new UserPolicy;
        $admin = User::factory()->admin()->create();

        $this->assertFalse($policy->changeRole($admin, User::factory()->admin()->create()));
        $this->assertTrue($policy->changeRole($admin, User::factory()->manager()->create()));
    }
}
```

`tests/Feature/Users/UserIndexTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_get_401_and_non_admins_get_403(): void
    {
        $this->getJson('/api/users')->assertUnauthorized();
        $this->actingAs(User::factory()->create())->getJson('/api/users')->assertForbidden();
        $this->actingAs(User::factory()->manager()->create())->getJson('/api/users')->assertForbidden();
    }

    public function test_lists_users_with_exactly_the_managed_fields(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
        User::factory()->create(['name' => 'Bruno Bianchi', 'last_login_at' => now()]);

        $response = $this->actingAs($admin)->getJson('/api/users')->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(
            ['id', 'name', 'email', 'role', 'role_label', 'status', 'status_label', 'invitation_expires_at', 'is_current_user'],
            array_keys($response->json('data.0')),
        );
        // Limite di finalità (spec §7.3): niente ultimo accesso nella gestione utenti
        $response->assertJsonMissingPath('data.1.last_login_at');
        $response->assertJsonPath('data.0.is_current_user', true);
        $response->assertJsonPath('data.1.is_current_user', false);
    }

    public function test_filters_by_status_and_counts_every_status(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(2)->create();
        User::factory()->disabled()->create();
        Invitation::factory()->create();

        $response = $this->actingAs($admin)->getJson('/api/users?filter[status]=active')->assertOk();

        $response->assertJsonCount(3, 'data');
        $response->assertJsonPath('meta.counts', ['all' => 5, 'active' => 3, 'invited' => 1, 'disabled' => 1]);
    }

    public function test_searches_name_and_email_and_counts_within_the_search(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin', 'email' => 'anna@example.test']);
        User::factory()->create(['name' => 'Marco Rossi', 'email' => 'm.rossi@example.test']);
        User::factory()->create(['name' => 'Giulia Verdi', 'email' => 'giulia.rossi@example.test']);

        $response = $this->actingAs($admin)->getJson('/api/users?search=rossi')->assertOk();

        $response->assertJsonCount(2, 'data');
        $response->assertJsonPath('meta.counts.all', 2);
    }

    public function test_search_wildcards_are_literal(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->create(['name' => 'Mario']);

        $this->actingAs($admin)->getJson('/api/users?search=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_paginates_by_twenty_five(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(30)->create();

        $this->actingAs($admin)->getJson('/api/users?page=2')
            ->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonPath('meta.per_page', 25)
            ->assertJsonPath('meta.current_page', 2);
    }

    public function test_invited_users_show_when_the_invitation_expires(): void
    {
        $admin = User::factory()->admin()->create();
        $invitation = Invitation::factory()->create();

        $this->actingAs($admin)->getJson('/api/users?filter[status]=invited')
            ->assertOk()
            ->assertJsonPath('data.0.invitation_expires_at', $invitation->expires_at->toIso8601String());
    }

    public function test_rejects_unknown_filters(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->getJson('/api/users?filter[status]=deleted')->assertUnprocessable();
        $this->actingAs($admin)->getJson('/api/users?filter[role]=root')->assertUnprocessable();
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users`
Expected: FAIL. La classe `UserPolicy` non esiste e `/api/users` risponde 404.

- [ ] **Step 3: Policy**

`app/Policies/UserPolicy.php` (scoperta automatica di Laravel per il model `User`):

```php
<?php

namespace App\Policies;

use App\Models\User;

/**
 * Chi può agire su chi nella gestione utenti. Lo stato del bersaglio (invitato, attivo…) lo controllano i controller.
 */
final class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function resendInvitation(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function cancelInvitation(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function changeRole(User $actor, User $target): bool
    {
        // Il ruolo admin si gestisce solo dalla sezione amministratori
        return $actor->isAdmin() && ! $actor->is($target) && ! $target->isAdmin();
    }

    public function disable(User $actor, User $target): bool
    {
        return $actor->isAdmin() && ! $actor->is($target);
    }

    public function enable(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function grantAdmin(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function revokeAdmin(User $actor, User $target): bool
    {
        return $actor->isAdmin() && ! $actor->is($target);
    }
}
```

- [ ] **Step 4: Testi, request, resource, controller, rotta**

`lang/it/users.php` (le chiavi successive si aggiungono nei task 3, 5 e 6):

```php
<?php

return [
    'not_found' => 'Utente non trovato.',
];
```

`lang/en/users.php`:

```php
<?php

return [
    'not_found' => 'User not found.',
];
```

`app/Http/Requests/Users/ListUsersRequest.php`:

```php
<?php

namespace App\Http\Requests\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListUsersRequest extends FormRequest
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
            'filter' => ['sometimes', 'array'],
            'filter.status' => ['sometimes', Rule::enum(UserStatus::class)],
            'filter.role' => ['sometimes', Rule::enum(Role::class)],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }
}
```

`app/Http/Resources/ManagedUserResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Utente visto dall'admin. Niente ultimo accesso (limite di finalità, spec §7.3), niente dati dell'invito oltre la scadenza.
 *
 * @mixin User
 */
final class ManagedUserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $invitation = $this->status === UserStatus::Invited && $this->relationLoaded('invitation') ? $this->invitation : null;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'invitation_expires_at' => $invitation?->expires_at->toIso8601String(),
            'is_current_user' => $request->user()?->getAuthIdentifier() === $this->id,
        ];
    }
}
```

`app/Http/Controllers/Admin/UserController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\ListUsersRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class UserController extends Controller
{
    private const PER_PAGE = 25;

    public function index(ListUsersRequest $request): AnonymousResourceCollection
    {
        $search = $request->string('search')->trim()->value();
        $status = $request->enum('filter.status', UserStatus::class);
        $role = $request->enum('filter.role', Role::class);

        // Ricerca e ruolo valgono anche per i conteggi delle schede; lo stato filtra solo la lista
        $base = User::query()
            ->when($search !== '', function (Builder $query) use ($search): void {
                $pattern = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn (Builder $inner) => $inner->where('name', 'like', $pattern)->orWhere('email', 'like', $pattern));
            })
            ->when($role !== null, fn (Builder $query) => $query->where('role', $role));

        $counts = (clone $base)->toBase()
            ->selectRaw('status, count(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $users = (clone $base)
            ->when($status !== null, fn (Builder $query) => $query->where('status', $status))
            ->with('invitation')
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        return ManagedUserResource::collection($users)->additional(['meta' => ['counts' => [
            'all' => (int) $counts->sum(),
            'active' => (int) ($counts[UserStatus::Active->value] ?? 0),
            'invited' => (int) ($counts[UserStatus::Invited->value] ?? 0),
            'disabled' => (int) ($counts[UserStatus::Disabled->value] ?? 0),
        ]]]);
    }
}
```

`routes/api.php`:

```php
<?php

use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/user', CurrentUserController::class)->name('auth.user');

    // Gestione utenti e amministratori: solo admin (UserPolicy)
    Route::get('/users', [UserController::class, 'index'])->can('viewAny', User::class)->name('users.index');
});
```

- [ ] **Step 5: Test**

Run: `sail artisan test --compact`
Expected: tutti PASS. Se `meta.counts` non si fonde con la paginazione, verifica che `additional()` produca `meta.counts` accanto a `meta.current_page`, poi correggi.

- [ ] **Step 6: Gate e commit**

```bash
sail bin pint app routes lang tests --format agent && sail bin pint --test && sail composer analyse
git add apps/laravel
git commit -m "feat(users): permessi della gestione utenti e lista per l'admin"
```

---

## Task 3: Inviti — creazione, reinvio, annullamento

**Files:**
- Create: `apps/laravel/app/Services/InvitationService.php`
- Create: `apps/laravel/app/Mail/InvitationMail.php`, `apps/laravel/resources/views/mail/auth/invitation.blade.php`
- Create: `apps/laravel/app/Http/Requests/Users/StoreUserRequest.php`, `apps/laravel/app/Http/Controllers/Admin/UserInvitationController.php`
- Create: `apps/laravel/lang/{it,en}/invitations.php`
- Modify: `apps/laravel/app/Http/Controllers/Admin/UserController.php` (`store`), `apps/laravel/routes/api.php`, `apps/laravel/lang/{it,en}/users.php`
- Test: `apps/laravel/tests/Feature/Users/InviteUserTest.php`, `apps/laravel/tests/Feature/Users/InvitationMailTest.php`

**Interfaces:**
- Consumes: `UserPolicy`, `ManagedUserResource`, `Invitation`, `AuthEventLogger::log(..., $actor)`.
- Produces:
  - `App\Services\InvitationService` (`final`):
    - costanti `TTL_HOURS = 72`, `RESEND_COOLDOWN_SECONDS = 60`;
    - `invite(string $name, string $email, Role $role, User $inviter, Request $request): User`;
    - `send(User $user, ?User $inviter): void` — crea o sostituisce il token e accoda l'email dopo il commit; lo usa anche il comando del Task 7;
    - `secondsUntilResend(User $user): int`;
    - `resend(User $user, User $actor, Request $request): void`;
    - `cancel(User $user, User $actor, Request $request): void`;
    - `findByToken(string $token): ?Invitation` — cerca per SHA-256, con `user` caricato;
    - `static hashToken(string $token): string`.
  - `App\Mail\InvitationMail(string $name, string $token, ?string $inviterName, CarbonInterface $expiresAt)`, con proprietà pubbliche omonime e metodo `url(): string` (`FRONTEND_URL/invitation/{token}`), `ShouldQueue` + `ShouldBeEncrypted`.
  - **Rotte:**
    - `POST /api/users` (`users.store`) → `201 {data: ManagedUser}`;
    - `POST /api/users/{user}/invitation` (`users.invitation.resend`) → `202 {message}`, `429 {message, meta: {retry_after}}` + header `Retry-After`, `409 {message}`;
    - `DELETE /api/users/{user}/invitation` (`users.invitation.cancel`) → `204`, `409`.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/InviteUserTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use App\Services\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class InviteUserTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
    }

    /**
     * @param  array<string, string>  $overrides
     * @return array<string, string>
     */
    private function payload(array $overrides = []): array
    {
        return [...['name' => 'Sara Colombo', 'email' => 'sara@example.test', 'role' => 'employee'], ...$overrides];
    }

    private function lastInvitationToken(): string
    {
        $token = '';
        Mail::assertQueued(InvitationMail::class, function (InvitationMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });

        return $token;
    }

    public function test_an_admin_invites_an_employee(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();

        $response->assertJsonPath('data.status', 'invited')->assertJsonPath('data.role', 'employee');
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();
        $this->assertSame(UserStatus::Invited, $user->status);
        $this->assertNull($user->password);
        Mail::assertQueued(InvitationMail::class, fn (InvitationMail $mail): bool => $mail->hasTo('sara@example.test')
            && $mail->inviterName === 'Anna Admin');
        $this->assertDatabaseHas('auth_events', [
            'user_id' => $user->id,
            'actor_id' => $this->admin->id,
            'event' => AuthEventType::InvitationSent->value,
        ]);
    }

    public function test_the_token_is_stored_only_as_a_hash_and_lasts_seventy_two_hours(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();

        $token = $this->lastInvitationToken();
        $invitation = Invitation::query()->sole();
        $this->assertSame(64, strlen($token));
        $this->assertSame(hash('sha256', $token), $invitation->token_hash);
        // Il database salva i secondi: tolleranza di 1 s sul confronto
        $this->assertEqualsWithDelta(now()->addHours(InvitationService::TTL_HOURS)->getTimestamp(), $invitation->expires_at->getTimestamp(), 1);
        $this->assertTrue($invitation->inviter?->is($this->admin));
    }

    public function test_admins_cannot_be_invited(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['role' => 'admin']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }

    public function test_an_email_already_in_use_is_rejected_even_with_spaces_and_capitals(): void
    {
        User::factory()->create(['email' => 'sara@example.test']);

        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['email' => '  Sara@Example.TEST ']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
        $this->assertSame(1, User::query()->where('email', 'sara@example.test')->count());
    }

    public function test_invalid_input_is_rejected(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'role']);
    }

    public function test_non_admins_cannot_invite(): void
    {
        $this->actingAs(User::factory()->manager()->create())->postJson('/api/users', $this->payload())->assertForbidden();
        Mail::assertNothingQueued();
    }

    public function test_resending_replaces_the_link_and_resets_the_expiry(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();
        $oldHash = Invitation::query()->sole()->token_hash;
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();

        $this->travel(2)->hours();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/invitation")->assertAccepted();

        $invitation = Invitation::query()->sole();
        $this->assertNotSame($oldHash, $invitation->token_hash);
        $this->assertEqualsWithDelta(now()->addHours(InvitationService::TTL_HOURS)->getTimestamp(), $invitation->expires_at->getTimestamp(), 1);
        Mail::assertQueued(InvitationMail::class, 2);
    }

    public function test_resending_waits_sixty_seconds(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/invitation")
            ->assertTooManyRequests()
            ->assertHeader('Retry-After')
            ->assertJsonStructure(['message', 'meta' => ['retry_after']]);

        $this->travel(61)->seconds();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/invitation")->assertAccepted();
    }

    public function test_only_invited_users_can_be_resent_or_cancelled(): void
    {
        $active = User::factory()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$active->id}/invitation")->assertConflict();
        $this->actingAs($this->admin)->deleteJson("/api/users/{$active->id}/invitation")->assertConflict();
        $this->assertModelExists($active);
    }

    public function test_cancelling_deletes_the_never_activated_user(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();

        $this->actingAs($this->admin)->deleteJson("/api/users/{$user->id}/invitation")->assertNoContent();

        $this->assertModelMissing($user);
        $this->assertDatabaseCount('invitations', 0);
        $this->assertDatabaseHas('auth_events', [
            'user_id' => null,
            'actor_id' => $this->admin->id,
            'event' => AuthEventType::InvitationCancelled->value,
        ]);
    }

    public function test_managers_can_be_invited(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['role' => 'manager']))->assertCreated();

        $this->assertSame(Role::Manager, User::query()->where('email', 'sara@example.test')->firstOrFail()->role);
    }
}
```

`tests/Feature/Users/InvitationMailTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Mail\InvitationMail;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvitationMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_links_to_the_spa_and_states_the_expiry(): void
    {
        app()->setLocale('en');
        config(['app.frontend_url' => 'http://localhost:5174/']);

        $mail = new InvitationMail('Sara Colombo', 'abc123', 'Anna Admin', now()->addHours(72));

        $this->assertSame('http://localhost:5174/invitation/abc123', $mail->url());
        $mail->assertHasSubject('You’re invited to Holidays');
        $mail->assertSeeInText('http://localhost:5174/invitation/abc123');
        $mail->assertSeeInText('Anna Admin');
        $mail->assertSeeInText('72 hours');
    }

    public function test_is_encrypted_in_the_queue(): void
    {
        // Il token dell'invito non deve finire in chiaro in jobs/failed_jobs
        $this->assertInstanceOf(ShouldBeEncrypted::class, new InvitationMail('Sara', 'abc', null, now()));
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/InviteUserTest.php tests/Feature/Users/InvitationMailTest.php`
Expected: FAIL. Le rotte rispondono 404/405 e la classe `InvitationMail` non esiste.

- [ ] **Step 3: Testi**

`lang/it/invitations.php`:

```php
<?php

return [
    'resend_wait' => 'Attendi :seconds secondi prima di inviare di nuovo l’invito.',
    'not_invited' => 'Questo utente ha già attivato l’account: l’invito non c’è più.',
    'mail' => [
        'subject' => 'Sei stato invitato su Holidays',
        'heading' => 'Benvenuto, :name',
        'intro_by' => ':inviter ti ha invitato su Holidays, l’app per ferie e permessi.',
        'intro' => 'Sei stato invitato su Holidays, l’app per ferie e permessi.',
        'action' => 'Attiva il tuo account',
        'expiry' => 'Il link vale :hours ore e si può usare una sola volta.',
        'fallback' => 'Se il pulsante non funziona, copia questo indirizzo nel browser: :url',
    ],
];
```

`lang/en/invitations.php`:

```php
<?php

return [
    'resend_wait' => 'Wait :seconds seconds before sending the invitation again.',
    'not_invited' => 'This user has already activated the account: there is no invitation any more.',
    'mail' => [
        'subject' => 'You’re invited to Holidays',
        'heading' => 'Welcome, :name',
        'intro_by' => ':inviter invited you to Holidays, the leave and time-off app.',
        'intro' => 'You were invited to Holidays, the leave and time-off app.',
        'action' => 'Activate your account',
        'expiry' => 'The link is valid for :hours hours and works only once.',
        'fallback' => 'If the button doesn’t work, copy this address into your browser: :url',
    ],
];
```

- [ ] **Step 4: Email dell'invito**

`app/Mail/InvitationMail.php`:

```php
<?php

namespace App\Mail;

use App\Services\InvitationService;
use App\Support\Translate;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Cifrata in coda: il token dell'invito non resta in chiaro in jobs/failed_jobs
class InvitationMail extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        #[\SensitiveParameter] public readonly string $token,
        public readonly ?string $inviterName,
        public readonly CarbonInterface $expiresAt,
    ) {}

    public function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/invitation/'.rawurlencode($this->token);
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('invitations.mail.subject'));
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.auth.invitation',
            with: [
                'url' => $this->url(),
                'hours' => InvitationService::TTL_HOURS,
            ],
        );
    }
}
```

`resources/views/mail/auth/invitation.blade.php`:

```blade
<x-mail::message>
# {{ __('invitations.mail.heading', ['name' => $name]) }}

{{ $inviterName ? __('invitations.mail.intro_by', ['inviter' => $inviterName]) : __('invitations.mail.intro') }}

<x-mail::button :url="$url">
{{ __('invitations.mail.action') }}
</x-mail::button>

{{ __('invitations.mail.expiry', ['hours' => $hours]) }}

<x-mail::subcopy>
{{ __('invitations.mail.fallback', ['url' => $url]) }}
</x-mail::subcopy>
</x-mail::message>
```

(Le proprietà pubbliche `name` e `inviterName` sono già disponibili nella view.)

- [ ] **Step 5: Service**

`app/Services/InvitationService.php` (metodi `findByToken` e `hashToken` usati dal Task 4):

```php
<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Inviti: account creati solo dall'admin, attivati dall'invitato con il link (spec §6.1).
 */
final class InvitationService
{
    public const TTL_HOURS = 72;

    public const RESEND_COOLDOWN_SECONDS = 60;

    private const TOKEN_LENGTH = 64;

    public function __construct(private readonly AuthEventLogger $events) {}

    public function invite(string $name, string $email, Role $role, User $inviter, Request $request): User
    {
        return DB::transaction(function () use ($name, $email, $role, $inviter, $request): User {
            $user = new User;
            $user->forceFill([
                'name' => $name,
                'email' => $email,
                'password' => null,
                'role' => $role,
                'status' => UserStatus::Invited,
                'locale' => app()->getLocale(),
            ])->save();

            $this->send($user, $inviter);
            $this->events->log(AuthEventType::InvitationSent, $request, $user, $inviter);

            return $user;
        });
    }

    /**
     * Nuovo token (il precedente smette di valere) e email in coda dopo il commit.
     */
    public function send(User $user, ?User $inviter): void
    {
        $token = Str::random(self::TOKEN_LENGTH);
        $expiresAt = now()->addHours(self::TTL_HOURS);

        Invitation::query()->updateOrCreate(['user_id' => $user->id], [
            'token_hash' => self::hashToken($token),
            'invited_by' => $inviter?->id,
            'expires_at' => $expiresAt,
            'accepted_at' => null,
            'last_sent_at' => now(),
        ]);

        DB::afterCommit(fn () => Mail::to($user)->send(new InvitationMail($user->name, $token, $inviter?->name, $expiresAt)));
    }

    public function secondsUntilResend(User $user): int
    {
        $lastSentAt = $user->invitation?->last_sent_at;

        if ($lastSentAt === null) {
            return 0;
        }

        return max(0, (int) ceil(now()->diffInSeconds($lastSentAt->copy()->addSeconds(self::RESEND_COOLDOWN_SECONDS))));
    }

    public function resend(User $user, User $actor, Request $request): void
    {
        DB::transaction(function () use ($user, $actor, $request): void {
            $this->send($user, $actor);
            $this->events->log(AuthEventType::InvitationSent, $request, $user, $actor);
        });
    }

    /**
     * Annulla l'invito di un utente mai attivato: utente e invito spariscono, resta l'evento con l'autore.
     */
    public function cancel(User $user, User $actor, Request $request): void
    {
        DB::transaction(function () use ($user, $actor, $request): void {
            $user->delete();
            $this->events->log(AuthEventType::InvitationCancelled, $request, null, $actor);
        });
    }

    public function findByToken(#[\SensitiveParameter] string $token): ?Invitation
    {
        return Invitation::query()->with('user')->where('token_hash', self::hashToken($token))->first();
    }

    public static function hashToken(#[\SensitiveParameter] string $token): string
    {
        return hash('sha256', $token);
    }
}
```

(La lingua dell'invitato parte da quella dell'admin che invita, poi l'utente la cambierà dal profilo nella fase 4. Il campo `locale` ha già il valore predefinito `it` nello schema.)

- [ ] **Step 6: Request, controller, rotte**

`app/Http/Requests/Users/StoreUserRequest.php`:

```php
<?php

namespace App\Http\Requests\Users;

use App\Enums\Role;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $email = $this->input('email');
        $name = $this->input('name');

        $this->merge(array_filter([
            'email' => is_string($email) ? Str::lower(trim($email)) : null,
            'name' => is_string($name) ? trim($name) : null,
        ], fn (?string $value): bool => $value !== null));
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            // Gli admin nascono solo per promozione (decisione della fase 3)
            'role' => ['required', Rule::enum(Role::class)->only([Role::Employee, Role::Manager])],
        ];
    }
}
```

`UserController::store` (aggiungi gli import `StoreUserRequest`, `InvitationService`, `Role`, `JsonResponse`, `Response`):

```php
    public function store(StoreUserRequest $request, InvitationService $invitations): JsonResponse
    {
        $user = $invitations->invite(
            $request->string('name')->value(),
            $request->string('email')->value(),
            $request->enum('role', Role::class) ?? Role::Employee,
            $request->user(),
            $request,
        );

        return (new ManagedUserResource($user->load('invitation')))->response()->setStatusCode(Response::HTTP_CREATED);
    }
```

Se Larastan segnala `$request->user()` come `User|null`, recupera l'utente con un helper tipizzato. Nei controller admin puoi aggiungere in `App\Http\Controllers\Controller` un metodo protetto `actor(Request $request): User`, che lancia `AuthenticationException` se manca e verifica `instanceof User`, e usarlo ovunque.

`app/Http/Controllers/Admin/UserInvitationController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Symfony\Component\HttpFoundation\Response;

final class UserInvitationController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function resend(Request $request, User $user): JsonResponse
    {
        if ($user->status !== UserStatus::Invited) {
            return response()->json(['message' => Translate::text('invitations.not_invited')], Response::HTTP_CONFLICT);
        }

        $wait = $this->invitations->secondsUntilResend($user);

        if ($wait > 0) {
            return response()->json([
                'message' => Translate::text('invitations.resend_wait', ['seconds' => $wait]),
                'meta' => ['retry_after' => $wait],
            ], Response::HTTP_TOO_MANY_REQUESTS, ['Retry-After' => (string) $wait]);
        }

        $this->invitations->resend($user, $this->actor($request), $request);

        return response()->json(['message' => Translate::text('users.invitation_resent')], Response::HTTP_ACCEPTED);
    }

    public function cancel(Request $request, User $user): JsonResponse|HttpResponse
    {
        if ($user->status !== UserStatus::Invited) {
            return response()->json(['message' => Translate::text('invitations.not_invited')], Response::HTTP_CONFLICT);
        }

        $this->invitations->cancel($user, $this->actor($request), $request);

        return response()->noContent();
    }
}
```

`app/Http/Controllers/Controller.php`: aggiungi l'helper che tutti i controller admin usano.

```php
    /**
     * Admin autenticato che compie l'azione (le rotte admin hanno sempre auth:sanctum).
     */
    protected function actor(Request $request): User
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        return $user;
    }
```

`lang/{it,en}/users.php`: aggiungi `'invitation_resent' => 'Invito inviato di nuovo.'` e `'invitation_resent' => 'Invitation sent again.'`.

`routes/api.php`, dentro il gruppo `auth:sanctum`:

```php
    Route::post('/users', [UserController::class, 'store'])->can('create', User::class)->name('users.store');
    Route::post('/users/{user}/invitation', [UserInvitationController::class, 'resend'])
        ->can('resendInvitation', 'user')->name('users.invitation.resend');
    Route::delete('/users/{user}/invitation', [UserInvitationController::class, 'cancel'])
        ->can('cancelInvitation', 'user')->name('users.invitation.cancel');
```

- [ ] **Step 7: Test, gate e commit**

Run: `sail artisan test --compact`, poi `sail bin pint app routes lang resources tests --format agent && sail bin pint --test && sail composer analyse`.
Expected: tutti PASS, 0 errori.

```bash
git add apps/laravel
git commit -m "feat(users): invito, reinvio e annullamento degli inviti da parte dell'admin"
```

---

## Task 4: Attivazione dell'invito (pagine pubbliche)

**Files:**
- Create: `apps/laravel/app/Http/Controllers/Auth/InvitationController.php`, `apps/laravel/app/Http/Requests/Invitations/AcceptInvitationRequest.php`
- Modify: `apps/laravel/app/Services/InvitationService.php` (`accept`), `apps/laravel/routes/web.php`, `apps/laravel/app/Providers/FortifyServiceProvider.php` (limiter `invitations`), `apps/laravel/lang/{it,en}/invitations.php`
- Test: `apps/laravel/tests/Feature/Auth/AcceptInvitationTest.php`

**Interfaces:**
- Consumes:
  - `InvitationService::findByToken()`, `send()` (Task 3);
  - `LoginChallengeService::beginFor(Request $request, User $user, bool $reportMailFailure = false)` (fase 2);
  - `config('app.privacy_notice_version')` (Task 1).
- Produces:
  - `InvitationService::accept(Invitation $invitation, string $password, Request $request): ?User`. Restituisce `null` se un'altra richiesta l'ha già accettato.
  - `GET /api/invitations/{token}` (`invitations.show`) → `200 {data: {name, email, expires_at}}` · `404 {message}` · `410 {message}`.
  - `POST /api/invitations/{token}/accept` (`invitations.accept`) `{password, password_confirmation, privacy_acknowledged}` → `200 {two_factor: true, message}` · `422` · `404` · `410`.
  - Entrambe nel gruppo `web`, con `guest:web` e `throttle:invitations` (10/min per IP).

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Auth/AcceptInvitationTest.php`:

```php
<?php

namespace Tests\Feature\Auth;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Mail\LoginCodeMail;
use App\Models\Invitation;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AcceptInvitationTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'una-frase-lunga-e-nuova';

    /**
     * Invita come farebbe l'admin e restituisce il token arrivato nell'email.
     */
    private function invite(string $email = 'sara@example.test'): string
    {
        Mail::fake();
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin)->postJson('/api/users', ['name' => 'Sara Colombo', 'email' => $email, 'role' => 'employee'])->assertCreated();
        // Le pagine dell'invito sono da ospite
        $this->app['auth']->forgetGuards();

        $token = '';
        Mail::assertQueued(InvitationMail::class, function (InvitationMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });

        return $token;
    }

    /**
     * @return array<string, string|bool>
     */
    private function acceptPayload(string $confirmation = self::PASSWORD): array
    {
        return ['password' => self::PASSWORD, 'password_confirmation' => $confirmation, 'privacy_acknowledged' => true];
    }

    public function test_shows_who_is_invited(): void
    {
        $token = $this->invite();

        $this->getJson("/api/invitations/{$token}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Sara Colombo')
            ->assertJsonPath('data.email', 'sara@example.test')
            ->assertJsonStructure(['data' => ['name', 'email', 'expires_at']]);
    }

    public function test_unknown_and_expired_links(): void
    {
        $token = $this->invite();

        $this->getJson('/api/invitations/'.str_repeat('x', 64))->assertNotFound();
        $this->travel(InvitationService::TTL_HOURS)->hours();
        $this->travel(1)->minutes();
        $this->getJson("/api/invitations/{$token}")->assertStatus(410);
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertStatus(410);
    }

    public function test_activating_sets_the_password_and_starts_the_code_step(): void
    {
        $token = $this->invite();

        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())
            ->assertOk()
            ->assertJsonPath('two_factor', true);

        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();
        $this->assertSame(UserStatus::Active, $user->status);
        $this->assertTrue(Hash::check(self::PASSWORD, (string) $user->password));
        $this->assertNotNull($user->email_verified_at);
        $this->assertSame(config('app.privacy_notice_version'), $user->privacy_notice_version);
        $this->assertNotNull($user->privacy_notice_acknowledged_at);
        $this->assertNotNull($user->invitation?->accepted_at);
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => AuthEventType::InvitationAccepted->value]);
        // Niente sessione aperta: si entra solo con il codice
        $this->assertGuest();
        $this->assertSame(LoginChallenge::query()->where('user_id', $user->id)->value('id'), session(AuthSession::CHALLENGE_ID));
        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->hasTo('sara@example.test'));
    }

    public function test_the_code_completes_the_first_sign_in(): void
    {
        $token = $this->invite();
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertOk();

        $code = '';
        Mail::assertQueued(LoginCodeMail::class, function (LoginCodeMail $mail) use (&$code): bool {
            $code = $mail->code;

            return true;
        });

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertOk()->assertJsonPath('data.email', 'sara@example.test');
    }

    public function test_a_link_works_only_once(): void
    {
        $token = $this->invite();
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertOk();

        $this->getJson("/api/invitations/{$token}")->assertNotFound();
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertNotFound();
    }

    public function test_an_old_link_stops_working_after_a_resend(): void
    {
        $oldToken = $this->invite();
        $invitation = Invitation::query()->sole();
        $this->assertNotNull(app(InvitationService::class)->findByToken($oldToken));

        $this->travel(2)->minutes();
        $this->actingAs(User::factory()->admin()->create())->postJson("/api/users/{$invitation->user_id}/invitation")->assertAccepted();
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/invitations/{$oldToken}")->assertNotFound();
    }

    public function test_a_cancelled_invitation_link_is_not_found(): void
    {
        $token = $this->invite();
        Invitation::query()->sole()->user?->delete();

        $this->getJson("/api/invitations/{$token}")->assertNotFound();
    }

    public function test_validates_password_confirmation_and_privacy(): void
    {
        $token = $this->invite();

        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload('diversa-ma-lunga-uguale'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
        $this->postJson("/api/invitations/{$token}/accept", ['password' => 'corta', 'password_confirmation' => 'corta', 'privacy_acknowledged' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
        $this->postJson("/api/invitations/{$token}/accept", ['password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('privacy_acknowledged');

        // Nessuno di questi tentativi ha consumato il link
        $this->getJson("/api/invitations/{$token}")->assertOk();
    }

    public function test_public_invitation_pages_are_limited_to_ten_per_minute_per_ip(): void
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->getJson('/api/invitations/'.str_repeat('x', 64))->assertNotFound();
        }

        $this->getJson('/api/invitations/'.str_repeat('x', 64))->assertTooManyRequests();
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Auth/AcceptInvitationTest.php`
Expected: FAIL. Le rotte `/api/invitations/*` rispondono 404/405 per tutti i casi.

- [ ] **Step 3: Testi**

In `lang/it/invitations.php` aggiungi:

```php
    'invalid' => 'Questo invito non è valido o è già stato usato.',
    'expired' => 'Questo invito è scaduto. Chiedi all’ufficio HR di inviartene uno nuovo.',
    'accepted' => 'Account attivato. Per entrare inserisci il codice che ti abbiamo inviato via email.',
```

In `lang/en/invitations.php`:

```php
    'invalid' => 'This invitation is invalid or has already been used.',
    'expired' => 'This invitation has expired. Ask HR to send you a new one.',
    'accepted' => 'Account activated. To sign in, enter the code we emailed you.',
```

- [ ] **Step 4: Service, request, controller, rotte, limite**

In `InvitationService` aggiungi gli import `App\Models\Invitation` (già presente), `Illuminate\Http\Request` (già presente) e il metodo:

```php
    /**
     * Attiva l'account dell'invitato. Null se un'altra richiesta ha già usato l'invito (riga bloccata).
     */
    public function accept(Invitation $invitation, #[\SensitiveParameter] string $password, Request $request): ?User
    {
        return DB::transaction(function () use ($invitation, $password, $request): ?User {
            $locked = Invitation::query()->with('user')->lockForUpdate()->find($invitation->id);
            $user = $locked?->user;

            if ($locked === null || $locked->isAccepted() || $user === null || $user->status !== UserStatus::Invited) {
                return null;
            }

            $user->forceFill([
                'password' => $password,
                'status' => UserStatus::Active,
                'email_verified_at' => now(),
                'privacy_notice_version' => (string) config('app.privacy_notice_version'),
                'privacy_notice_acknowledged_at' => now(),
            ])->save();
            $locked->forceFill(['accepted_at' => now()])->save();
            $this->events->log(AuthEventType::InvitationAccepted, $request, $user);

            return $user;
        });
    }
```

`app/Http/Requests/Invitations/AcceptInvitationRequest.php`:

```php
<?php

namespace App\Http\Requests\Invitations;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class AcceptInvitationRequest extends FormRequest
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
            // max: un testo enorme renderebbe costoso l'hash Argon2id
            'password' => ['required', 'string', 'max:255', 'confirmed', Password::defaults()],
            'password_confirmation' => ['required', 'string'],
            // Presa visione dell'informativa (non è un consenso: base giuridica art. 6.1.b)
            'privacy_acknowledged' => ['accepted'],
        ];
    }
}
```

`app/Http/Controllers/Auth/InvitationController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Invitations\AcceptInvitationRequest;
use App\Models\Invitation;
use App\Services\InvitationService;
use App\Services\LoginChallengeService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class InvitationController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function show(string $token): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $problem = $this->problem($invitation);

        if ($problem !== null || $invitation === null || $invitation->user === null) {
            return $problem ?? $this->notFound();
        }

        return response()->json(['data' => [
            'name' => $invitation->user->name,
            'email' => $invitation->user->email,
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]]);
    }

    /**
     * Come dopo il reset (spec §6.3): l'attivazione non apre la sessione, parte il passo del codice.
     */
    public function accept(AcceptInvitationRequest $request, string $token, LoginChallengeService $challenges): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $problem = $this->problem($invitation);

        if ($problem !== null || $invitation === null) {
            return $problem ?? $this->notFound();
        }

        $user = $this->invitations->accept($invitation, $request->string('password')->value(), $request);

        if ($user === null) {
            return $this->notFound();
        }

        // Se la coda dell'email non risponde l'errore è solo segnalato: l'account è attivo, il codice si richiede dalla pagina
        $challenges->beginFor($request, $user, reportMailFailure: true);

        return response()->json(['two_factor' => true, 'message' => Translate::text('invitations.accepted')]);
    }

    /**
     * 404 per link inesistente, usato o annullato; 410 per link scaduto.
     */
    private function problem(?Invitation $invitation): ?JsonResponse
    {
        if ($invitation === null || $invitation->isAccepted() || $invitation->user === null) {
            return $this->notFound();
        }

        if ($invitation->isExpired()) {
            return response()->json(['message' => Translate::text('invitations.expired')], Response::HTTP_GONE);
        }

        return null;
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['message' => Translate::text('invitations.invalid')], Response::HTTP_NOT_FOUND);
    }
}
```

`FortifyServiceProvider::boot()`:

```php
        // Pagine pubbliche dell'invito: 10 richieste al minuto per IP
        RateLimiter::for('invitations', fn (Request $request): Limit => Limit::perMinute(10)->by('invitations:'.$request->ip()));
```

`routes/web.php` (aggiungi l'import di `InvitationController`), dopo il gruppo `api/auth`:

```php
// Attivazione dell'invito: gruppo `web` perché l'attivazione avvia il passo del codice in sessione
Route::prefix('api/invitations')->middleware(['guest:web', 'throttle:invitations'])->group(function (): void {
    Route::get('/{token}', [InvitationController::class, 'show'])->name('invitations.show');
    Route::post('/{token}/accept', [InvitationController::class, 'accept'])->name('invitations.accept');
});
```

Attenzione: `routes/web.php` ha la precedenza solo se nessuna rotta di `api.php` copre `api/invitations/*`, e non ce ne sono.

- [ ] **Step 5: Test, gate e commit**

Run: `sail artisan test --compact`, poi `sail bin pint app routes lang tests --format agent && sail bin pint --test && sail composer analyse`.
Expected: tutti PASS, 0 errori.

```bash
git add apps/laravel
git commit -m "feat(auth): attivazione dell'invito con informativa privacy e passaggio al codice"
```

---

## Task 5: Cambio ruolo, disattivazione e riattivazione (protezioni sugli admin)

**Files:**
- Create: `apps/laravel/app/Services/UserManagementService.php`, `apps/laravel/app/Enums/AdminChange.php`
- Create: `apps/laravel/app/Mail/AdminChangeMail.php`, `apps/laravel/resources/views/mail/admin/change.blade.php`
- Create: `apps/laravel/app/Http/Requests/Concerns/ConfirmsCurrentPassword.php`, `apps/laravel/app/Http/Requests/Users/{ChangeRoleRequest,UserStatusRequest}.php`
- Create: `apps/laravel/app/Http/Controllers/Admin/{UserRoleController,UserStatusController}.php`
- Modify: `apps/laravel/routes/api.php`, `apps/laravel/lang/{it,en}/users.php`
- Test: `apps/laravel/tests/Feature/Users/ChangeRoleTest.php`, `apps/laravel/tests/Feature/Users/UserStatusTest.php`, `apps/laravel/tests/Feature/Users/AdminChangeMailTest.php`

**Interfaces:**
- Consumes: `UserPolicy` (Task 2), `AuthEventLogger` (Task 1), `AuthSession::endAllFor()` (fase 2).
- Produces:
  - **`App\Services\UserManagementService` (`final`, costruttore `AuthEventLogger $events`):**
    - `changeRole(User $target, Role $role, User $actor, Request $request): void`;
    - `disable(User $target, User $actor, Request $request): void`;
    - `enable(User $target, User $actor, Request $request): void`;
    - privati, riusati dal Task 6: `lockActiveAdmins(User $actor): Collection<int,int>` e `notifyAdmins(AdminChange $change, User $target, User $actor): void`.
  - Enum `App\Enums\AdminChange: string`, con `Granted = 'granted'`, `Revoked = 'revoked'`, `Disabled = 'disabled'`, `Enabled = 'enabled'`.
  - `App\Mail\AdminChangeMail(AdminChange $change, string $actorName, string $targetName, CarbonInterface $occurredAt)` (in coda).
  - Trait `App\Http\Requests\Concerns\ConfirmsCurrentPassword`:
    - `currentPasswordRules(): list<string>`;
    - `ensurePasswordNotLockedOut(): void`;
    - `failedValidation()` conta gli errori della password;
    - limite di 5 errori in 900 s per admin, poi `429` con `Retry-After`.
  - **Rotte:**
    - `PATCH /api/users/{user}/role` (`users.role`) `{role}` → `200 {data: ManagedUser}`;
    - `POST /api/users/{user}/disable` (`users.disable`) e `POST /api/users/{user}/enable` (`users.enable`) `{current_password?}` → `200 {data: ManagedUser}` · `409` per uno stato incompatibile · `422` per l'ultimo admin o una password errata · `429`.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/ChangeRoleTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChangeRoleTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_admin_promotes_an_employee_to_manager(): void
    {
        $admin = User::factory()->admin()->create();
        $employee = User::factory()->create();

        $this->actingAs($admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'manager'])
            ->assertOk()
            ->assertJsonPath('data.role', 'manager');

        $this->assertSame(Role::Manager, $employee->fresh()?->role);
        $this->assertDatabaseHas('auth_events', ['user_id' => $employee->id, 'actor_id' => $admin->id, 'event' => AuthEventType::RoleChanged->value]);
    }

    public function test_the_admin_role_is_never_set_or_removed_here(): void
    {
        $admin = User::factory()->admin()->create();
        $employee = User::factory()->create();
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'admin'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
        $this->actingAs($admin)->patchJson("/api/users/{$otherAdmin->id}/role", ['role' => 'employee'])->assertForbidden();
        $this->actingAs($admin)->patchJson("/api/users/{$admin->id}/role", ['role' => 'employee'])->assertForbidden();
    }

    public function test_non_admins_cannot_change_roles(): void
    {
        $this->actingAs(User::factory()->manager()->create())
            ->patchJson('/api/users/'.User::factory()->create()->id.'/role', ['role' => 'manager'])
            ->assertForbidden();
    }
}
```

`tests/Feature/Users/UserStatusTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Mail\AdminChangeMail;
use App\Models\Invitation;
use App\Models\LoginChallenge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class UserStatusTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        // La factory usa la password "password"
        $this->admin = User::factory()->admin()->create();
    }

    public function test_disabling_closes_every_session_code_and_reset_link(): void
    {
        $employee = User::factory()->create();
        DB::table('sessions')->insert(['id' => 's1', 'user_id' => $employee->id, 'ip_address' => '127.0.0.1', 'user_agent' => 't', 'payload' => '', 'last_activity' => now()->getTimestamp()]);
        LoginChallenge::query()->create(['user_id' => $employee->id, 'code_hash' => str_repeat('a', 64), 'expires_at' => now()->addMinutes(10), 'attempts' => 0, 'resend_count' => 0, 'last_sent_at' => now()]);
        DB::table('password_reset_tokens')->insert(['email' => $employee->email, 'token' => 'hash', 'created_at' => now()]);

        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")
            ->assertOk()
            ->assertJsonPath('data.status', 'disabled');

        $this->assertDatabaseMissing('sessions', ['user_id' => $employee->id]);
        $this->assertDatabaseMissing('login_challenges', ['user_id' => $employee->id]);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $employee->email]);
        $this->assertDatabaseHas('auth_events', ['user_id' => $employee->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::UserDisabled->value]);
        // Non è un admin: nessuna email agli admin
        Mail::assertNotQueued(AdminChangeMail::class);
    }

    public function test_a_disabled_user_loses_access_on_the_next_request(): void
    {
        $employee = User::factory()->create();
        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")->assertOk();

        $this->actingAs($employee->fresh() ?? $employee)->getJson('/api/auth/user')->assertUnauthorized();
    }

    public function test_admins_cannot_disable_themselves_and_state_must_fit(): void
    {
        $this->actingAs($this->admin)->postJson("/api/users/{$this->admin->id}/disable")->assertForbidden();

        $disabled = User::factory()->disabled()->create();
        $this->actingAs($this->admin)->postJson("/api/users/{$disabled->id}/disable")->assertConflict();
        $invited = Invitation::factory()->create()->user;
        $this->assertNotNull($invited);
        $this->actingAs($this->admin)->postJson("/api/users/{$invited->id}/disable")->assertConflict();
        $active = User::factory()->create();
        $this->actingAs($this->admin)->postJson("/api/users/{$active->id}/enable")->assertConflict();
    }

    public function test_enabling_a_disabled_employee(): void
    {
        $disabled = User::factory()->disabled()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$disabled->id}/enable")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
        $this->assertDatabaseHas('auth_events', ['user_id' => $disabled->id, 'event' => AuthEventType::UserEnabled->value]);
    }

    public function test_disabling_an_admin_needs_the_password_and_warns_every_admin(): void
    {
        $otherAdmin = User::factory()->admin()->create();
        $thirdAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'sbagliata'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');

        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'password'])->assertOk();

        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email));
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($thirdAdmin->email));
        // Chi agisce non riceve l'avviso della propria azione
        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($this->admin->email));
    }

    public function test_enabling_an_admin_needs_the_password(): void
    {
        $disabledAdmin = User::factory()->admin()->disabled()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$disabledAdmin->id}/enable")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->postJson("/api/users/{$disabledAdmin->id}/enable", ['current_password' => 'password'])->assertOk();
        Mail::assertQueued(AdminChangeMail::class);
    }

    public function test_five_wrong_passwords_lock_the_admin_actions_for_fifteen_minutes(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'sbagliata'])->assertUnprocessable();
        }

        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'password'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');

        $this->travel(16)->minutes();
        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'password'])->assertOk();
    }

    public function test_the_actor_who_lost_admin_rights_cannot_leave_zero_admins(): void
    {
        // Simula due revoche incrociate: l'attore è già stato declassato da un'altra richiesta
        $staleActor = User::factory()->admin()->create();
        User::query()->whereKey($staleActor->id)->update(['role' => 'employee']);

        $this->expectException(\Illuminate\Auth\Access\AuthorizationException::class);
        app(\App\Services\UserManagementService::class)->disable($this->admin, $staleActor, request());
    }
}
```

`tests/Feature/Users/AdminChangeMailTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\AdminChange;
use App\Mail\AdminChangeMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminChangeMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_says_who_did_what_to_whom_and_what_to_do_if_unexpected(): void
    {
        app()->setLocale('en');

        $mail = new AdminChangeMail(AdminChange::Granted, 'Anna Admin', 'Marco Bianchi', now());

        $mail->assertHasSubject('Holidays: admin rights granted');
        $mail->assertSeeInText('Anna Admin');
        $mail->assertSeeInText('Marco Bianchi');
        $mail->assertSeeInText('If this was not expected');
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/ChangeRoleTest.php tests/Feature/Users/UserStatusTest.php tests/Feature/Users/AdminChangeMailTest.php`
Expected: FAIL. Le rotte rispondono 404 e le classi mancano.

- [ ] **Step 3: Testi**

In `lang/it/users.php` aggiungi:

```php
    'role_changed' => 'Ruolo aggiornato.',
    'not_active' => 'L’utente non è attivo.',
    'not_disabled' => 'L’utente non è disattivato.',
    'last_admin' => 'Serve almeno un amministratore attivo: questa azione lo lascerebbe senza.',
    'no_longer_admin' => 'Non sei più amministratore.',
    'password_locked' => 'Troppi tentativi con la password. Riprova tra :minutes minuti.',
    'mail' => [
        'admin_change' => [
            'subject' => [
                'granted' => 'Holidays: nuovo amministratore',
                'revoked' => 'Holidays: ruolo di amministratore revocato',
                'disabled' => 'Holidays: amministratore disattivato',
                'enabled' => 'Holidays: amministratore riattivato',
            ],
            'body' => [
                'granted' => ':actor ha reso amministratore :target il :date.',
                'revoked' => ':actor ha revocato il ruolo di amministratore a :target il :date.',
                'disabled' => ':actor ha disattivato l’amministratore :target il :date.',
                'enabled' => ':actor ha riattivato l’amministratore :target il :date.',
            ],
            'unexpected' => 'Se non era previsto, avvisa subito il responsabile IT.',
        ],
    ],
```

In `lang/en/users.php`:

```php
    'role_changed' => 'Role updated.',
    'not_active' => 'This user is not active.',
    'not_disabled' => 'This user is not disabled.',
    'last_admin' => 'At least one active admin is required: this action would leave none.',
    'no_longer_admin' => 'You are no longer an admin.',
    'password_locked' => 'Too many password attempts. Try again in :minutes minutes.',
    'mail' => [
        'admin_change' => [
            'subject' => [
                'granted' => 'Holidays: admin rights granted',
                'revoked' => 'Holidays: admin rights revoked',
                'disabled' => 'Holidays: admin disabled',
                'enabled' => 'Holidays: admin enabled again',
            ],
            'body' => [
                'granted' => ':actor made :target an admin on :date.',
                'revoked' => ':actor revoked the admin rights of :target on :date.',
                'disabled' => ':actor disabled the admin :target on :date.',
                'enabled' => ':actor enabled the admin :target again on :date.',
            ],
            'unexpected' => 'If this was not expected, tell the IT manager right away.',
        ],
    ],
```

- [ ] **Step 4: Enum ed email**

`app/Enums/AdminChange.php`:

```php
<?php

namespace App\Enums;

enum AdminChange: string
{
    case Granted = 'granted';
    case Revoked = 'revoked';
    case Disabled = 'disabled';
    case Enabled = 'enabled';
}
```

`app/Mail/AdminChangeMail.php`:

```php
<?php

namespace App\Mail;

use App\Enums\AdminChange;
use App\Support\Translate;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Avviso a chi subisce la modifica e agli altri admin: un cambio non autorizzato viene notato subito.
 */
class AdminChangeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly AdminChange $change,
        public readonly string $actorName,
        public readonly string $targetName,
        public readonly CarbonInterface $occurredAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('users.mail.admin_change.subject.'.$this->change->value));
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.admin.change',
            with: [
                'body' => Translate::text('users.mail.admin_change.body.'.$this->change->value, [
                    'actor' => $this->actorName,
                    'target' => $this->targetName,
                    'date' => $this->occurredAt->copy()
                        ->setTimezone((string) config('app.display_timezone'))
                        ->locale(app()->getLocale())
                        ->isoFormat('LLL'),
                ]),
            ],
        );
    }
}
```

`resources/views/mail/admin/change.blade.php`:

```blade
<x-mail::message>
{{ $body }}

{{ __('users.mail.admin_change.unexpected') }}
</x-mail::message>
```

- [ ] **Step 5: Service**

`app/Services/UserManagementService.php`:

```php
<?php

namespace App\Services;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\AdminChangeMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use App\Support\Translate;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Ruoli e stato degli utenti. Le azioni sugli admin bloccano le righe degli admin attivi:
 * due richieste parallele non possono lasciare l'app senza amministratori.
 */
final class UserManagementService
{
    public function __construct(private readonly AuthEventLogger $events) {}

    public function changeRole(User $target, Role $role, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $role, $actor, $request): void {
            $target->forceFill(['role' => $role])->save();
            $this->events->log(AuthEventType::RoleChanged, $request, $target, $actor);
        });
    }

    public function disable(User $target, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $actor, $request): void {
            if ($target->isAdmin()) {
                $this->ensureAnAdminRemains($target, $this->lockActiveAdmins($actor));
            }

            $target->forceFill(['status' => UserStatus::Disabled])->save();
            AuthSession::endAllFor($target);
            LoginChallenge::query()->where('user_id', $target->id)->delete();
            DB::table((string) config('auth.passwords.users.table'))->where('email', $target->email)->delete();
            $this->events->log(AuthEventType::UserDisabled, $request, $target, $actor);

            if ($target->isAdmin()) {
                $this->notifyAdmins(AdminChange::Disabled, $target, $actor);
            }
        });
    }

    public function enable(User $target, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $actor, $request): void {
            if ($target->isAdmin()) {
                $this->lockActiveAdmins($actor);
            }

            $target->forceFill(['status' => UserStatus::Active])->save();
            $this->events->log(AuthEventType::UserEnabled, $request, $target, $actor);

            if ($target->isAdmin()) {
                $this->notifyAdmins(AdminChange::Enabled, $target, $actor);
            }
        });
    }

    /**
     * Blocca le righe degli admin attivi fino alla fine della transazione e verifica che chi agisce lo sia ancora.
     *
     * @return Collection<int, int>
     */
    private function lockActiveAdmins(User $actor): Collection
    {
        /** @var Collection<int, int> $ids */
        $ids = User::query()
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Active)
            ->lockForUpdate()
            ->pluck('id');

        // Un'altra richiesta può avergli tolto il ruolo dopo il controllo della policy
        if (! $ids->contains($actor->id)) {
            throw new AuthorizationException(Translate::text('users.no_longer_admin'));
        }

        return $ids;
    }

    /**
     * @param  Collection<int, int>  $activeAdminIds
     */
    private function ensureAnAdminRemains(User $target, Collection $activeAdminIds): void
    {
        if ($activeAdminIds->reject(fn (int $id): bool => $id === $target->id)->isEmpty()) {
            throw ValidationException::withMessages(['user' => [Translate::text('users.last_admin')]]);
        }
    }

    /**
     * Email dopo il commit a chi subisce la modifica e agli altri admin attivi (non a chi agisce).
     */
    private function notifyAdmins(AdminChange $change, User $target, User $actor): void
    {
        $occurredAt = now();
        $recipients = User::query()
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Active)
            ->whereKeyNot($actor->id)
            ->get()
            ->push($target)
            ->unique('id')
            ->reject(fn (User $user): bool => $user->is($actor));

        DB::afterCommit(function () use ($recipients, $change, $actor, $target, $occurredAt): void {
            foreach ($recipients as $recipient) {
                // Una coda non raggiungibile non annulla la modifica: l'errore è segnalato
                rescue(fn () => Mail::to($recipient)->send(new AdminChangeMail($change, $actor->name, $target->name, $occurredAt)), report: true);
            }
        });
    }
}
```

Nota: `lockActiveAdmins`, `ensureAnAdminRemains` e `notifyAdmins` restano privati. Nel Task 6 `grantAdmin` e `revokeAdmin` si aggiungono in questa stessa classe e li usano.

- [ ] **Step 6: Trait della password, request, controller, rotte**

`app/Http/Requests/Concerns/ConfirmsCurrentPassword.php`:

```php
<?php

namespace App\Http\Requests\Concerns;

use App\Support\Translate;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Password dell'admin per le azioni sugli amministratori: dopo 5 errori in 15 minuti le azioni si bloccano (429).
 */
trait ConfirmsCurrentPassword
{
    private const MAX_PASSWORD_FAILURES = 5;

    private const PASSWORD_FAILURE_DECAY_SECONDS = 900;

    /**
     * @return list<string>
     */
    protected function currentPasswordRules(): array
    {
        return ['required', 'string', 'current_password:web'];
    }

    protected function ensurePasswordNotLockedOut(): void
    {
        $key = $this->passwordFailuresKey();

        if (RateLimiter::tooManyAttempts($key, self::MAX_PASSWORD_FAILURES)) {
            $seconds = RateLimiter::availableIn($key);

            throw new ThrottleRequestsException(
                Translate::text('users.password_locked', ['minutes' => (int) ceil($seconds / 60)]),
                null,
                ['Retry-After' => (string) $seconds],
            );
        }
    }

    protected function failedValidation(Validator $validator): void
    {
        // Contano solo le password sbagliate, non il campo lasciato vuoto
        if ($this->filled('current_password') && $validator->errors()->has('current_password')) {
            RateLimiter::hit($this->passwordFailuresKey(), self::PASSWORD_FAILURE_DECAY_SECONDS);
        }

        parent::failedValidation($validator);
    }

    private function passwordFailuresKey(): string
    {
        return 'admin-password:'.$this->user()?->getAuthIdentifier();
    }
}
```

`app/Http/Requests/Users/UserStatusRequest.php` (stessa request per disattivare e riattivare):

```php
<?php

namespace App\Http\Requests\Users;

use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Disattivare o riattivare un admin chiede la password di chi agisce; per gli altri utenti basta la conferma in UI.
 */
class UserStatusRequest extends FormRequest
{
    use ConfirmsCurrentPassword;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->targetIsAdmin()) {
            $this->ensurePasswordNotLockedOut();
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->targetIsAdmin() ? ['current_password' => $this->currentPasswordRules()] : [];
    }

    private function targetIsAdmin(): bool
    {
        $target = $this->route('user');

        return $target instanceof User && $target->isAdmin();
    }
}
```

`app/Http/Requests/Users/ChangeRoleRequest.php`:

```php
<?php

namespace App\Http\Requests\Users;

use App\Enums\Role;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ChangeRoleRequest extends FormRequest
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
            // Il ruolo admin si gestisce solo dalla sezione amministratori
            'role' => ['required', Rule::enum(Role::class)->only([Role::Employee, Role::Manager])],
        ];
    }
}
```

`app/Http/Controllers/Admin/UserRoleController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\ChangeRoleRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\UserManagementService;

final class UserRoleController extends Controller
{
    public function __invoke(ChangeRoleRequest $request, User $user, UserManagementService $users): ManagedUserResource
    {
        $users->changeRole($user, $request->enum('role', Role::class) ?? Role::Employee, $this->actor($request), $request);

        return new ManagedUserResource($user->refresh()->load('invitation'));
    }
}
```

`app/Http/Controllers/Admin/UserStatusController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\UserStatusRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\UserManagementService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class UserStatusController extends Controller
{
    public function __construct(private readonly UserManagementService $users) {}

    public function disable(UserStatusRequest $request, User $user): JsonResponse|ManagedUserResource
    {
        if ($user->status !== UserStatus::Active) {
            return response()->json(['message' => Translate::text('users.not_active')], Response::HTTP_CONFLICT);
        }

        $this->users->disable($user, $this->actor($request), $request);

        return new ManagedUserResource($user->refresh());
    }

    public function enable(UserStatusRequest $request, User $user): JsonResponse|ManagedUserResource
    {
        if ($user->status !== UserStatus::Disabled) {
            return response()->json(['message' => Translate::text('users.not_disabled')], Response::HTTP_CONFLICT);
        }

        $this->users->enable($user, $this->actor($request), $request);

        return new ManagedUserResource($user->refresh());
    }
}
```

`routes/api.php`, nel gruppo `auth:sanctum`:

```php
    Route::patch('/users/{user}/role', UserRoleController::class)->can('changeRole', 'user')->name('users.role');
    Route::post('/users/{user}/disable', [UserStatusController::class, 'disable'])->can('disable', 'user')->name('users.disable');
    Route::post('/users/{user}/enable', [UserStatusController::class, 'enable'])->can('enable', 'user')->name('users.enable');
```

Per le risposte non standard (un `ManagedUserResource` restituito direttamente) Laravel risponde `200`; il test lo verifica.

- [ ] **Step 7: Test, gate e commit**

Run: `sail artisan test --compact`, poi `sail bin pint app routes lang resources tests --format agent && sail bin pint --test && sail composer analyse`.
Expected: tutti PASS, 0 errori.

```bash
git add apps/laravel
git commit -m "feat(users): cambio ruolo, disattivazione e riattivazione con protezioni sugli admin"
```

---

## Task 6: Sezione amministratori — elenco, promozione, revoca

**Files:**
- Create: `apps/laravel/app/Http/Controllers/Admin/AdministratorController.php`, `apps/laravel/app/Http/Requests/Users/{GrantAdminRequest,RevokeAdminRequest}.php`
- Modify: `apps/laravel/app/Services/UserManagementService.php` (`grantAdmin`, `revokeAdmin`), `apps/laravel/routes/api.php`, `apps/laravel/lang/{it,en}/users.php`
- Test: `apps/laravel/tests/Feature/Users/AdministratorsTest.php`

**Interfaces:**
- Consumes: `UserManagementService` (privati `lockActiveAdmins`, `ensureAnAdminRemains`, `notifyAdmins`), `ConfirmsCurrentPassword`, `ManagedUserResource`, `UserPolicy::grantAdmin/revokeAdmin` (Tasks 2, 5).
- Produces:
  - `UserManagementService::grantAdmin(User $target, User $actor, Request $request): void`;
  - `UserManagementService::revokeAdmin(User $target, Role $newRole, User $actor, Request $request): void`;
  - `GET /api/administrators` (`administrators.index`) → `200 {data: ManagedUser[]}`, tutti gli utenti con ruolo admin ordinati per nome;
  - `POST /api/administrators` (`administrators.store`) `{user_id, current_password}` → `200 {data: ManagedUser}` · `409` se il bersaglio non è attivo o è già admin · `422` · `429`;
  - `DELETE /api/administrators/{user}` (`administrators.destroy`) `{role, current_password}` → `200 {data: ManagedUser}` · `403` su sé stessi · `409` se il bersaglio non è admin · `422` (ultimo admin, password) · `429`.

- [ ] **Step 1: Test che falliscono**

`tests/Feature/Users/AdministratorsTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Mail\AdminChangeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AdministratorsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
    }

    public function test_lists_only_administrators(): void
    {
        User::factory()->admin()->create(['name' => 'Bruno Admin']);
        User::factory()->create();

        $this->actingAs($this->admin)->getJson('/api/administrators')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Anna Admin')
            ->assertJsonPath('data.0.is_current_user', true);
    }

    public function test_non_admins_cannot_see_or_change_administrators(): void
    {
        $manager = User::factory()->manager()->create();

        $this->actingAs($manager)->getJson('/api/administrators')->assertForbidden();
        $this->actingAs($manager)->postJson('/api/administrators', ['user_id' => $manager->id, 'current_password' => 'password'])->assertForbidden();
    }

    public function test_promotes_an_active_user_with_the_password(): void
    {
        $employee = User::factory()->create(['name' => 'Marco Bianchi']);
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.role', 'admin');

        $this->assertSame(Role::Admin, $employee->fresh()?->role);
        $this->assertDatabaseHas('auth_events', ['user_id' => $employee->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::AdminGranted->value]);
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($employee->email));
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email));
        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($this->admin->email));
    }

    public function test_promotion_needs_the_right_password(): void
    {
        $employee = User::factory()->create();

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'sbagliata'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->assertSame(Role::Employee, $employee->fresh()?->role);
    }

    public function test_only_active_non_admin_users_can_be_promoted(): void
    {
        foreach ([User::factory()->invited()->create(), User::factory()->disabled()->create(), User::factory()->admin()->create()] as $target) {
            $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $target->id, 'current_password' => 'password'])
                ->assertConflict();
        }

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => 999999, 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user_id');
    }

    public function test_revokes_an_admin_choosing_the_new_role(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'manager', 'current_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.role', 'manager');

        $this->assertDatabaseHas('auth_events', ['user_id' => $otherAdmin->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::AdminRevoked->value]);
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email));
    }

    public function test_cannot_revoke_themselves_nor_a_non_admin(): void
    {
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$this->admin->id}", ['role' => 'employee', 'current_password' => 'password'])
            ->assertForbidden();
        $employee = User::factory()->create();
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$employee->id}", ['role' => 'employee', 'current_password' => 'password'])
            ->assertConflict();
    }

    public function test_revoking_rejects_the_admin_role_as_target_role(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'admin', 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }

    public function test_a_revoked_admin_loses_access_on_the_next_request(): void
    {
        $otherAdmin = User::factory()->admin()->create();
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'employee', 'current_password' => 'password'])->assertOk();

        $this->actingAs($otherAdmin->fresh() ?? $otherAdmin)->getJson('/api/users')->assertForbidden();
    }

    public function test_crossed_revocations_never_leave_zero_admins(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        // Prima revoca riuscita: l'altro admin diventa dipendente
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'employee', 'current_password' => 'password'])->assertOk();

        // La revoca incrociata (partita prima che il ruolo cambiasse) arriva al service con un attore non più admin
        $this->expectException(\Illuminate\Auth\Access\AuthorizationException::class);
        app(\App\Services\UserManagementService::class)->revokeAdmin($this->admin, Role::Employee, $otherAdmin, request());
    }
}
```

- [ ] **Step 2: Verifica che falliscano**

Run: `sail artisan test --compact tests/Feature/Users/AdministratorsTest.php`
Expected: FAIL. Le rotte rispondono 404.

- [ ] **Step 3: Service**

In `UserManagementService` aggiungi:

```php
    public function grantAdmin(User $target, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $actor, $request): void {
            $this->lockActiveAdmins($actor);
            $target->forceFill(['role' => Role::Admin])->save();
            $this->events->log(AuthEventType::AdminGranted, $request, $target, $actor);
            $this->notifyAdmins(AdminChange::Granted, $target, $actor);
        });
    }

    /**
     * Revoca il ruolo admin: il nuovo ruolo è solo dipendente o responsabile (lo garantisce la request).
     */
    public function revokeAdmin(User $target, Role $newRole, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $newRole, $actor, $request): void {
            $this->ensureAnAdminRemains($target, $this->lockActiveAdmins($actor));
            $target->forceFill(['role' => $newRole])->save();
            $this->events->log(AuthEventType::AdminRevoked, $request, $target, $actor);
            $this->notifyAdmins(AdminChange::Revoked, $target, $actor);
        });
    }
```

- [ ] **Step 4: Request, controller, rotte**

`app/Http/Requests/Users/GrantAdminRequest.php`:

```php
<?php

namespace App\Http\Requests\Users;

use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GrantAdminRequest extends FormRequest
{
    use ConfirmsCurrentPassword;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->ensurePasswordNotLockedOut();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'current_password' => $this->currentPasswordRules(),
        ];
    }
}
```

`app/Http/Requests/Users/RevokeAdminRequest.php`:

```php
<?php

namespace App\Http\Requests\Users;

use App\Enums\Role;
use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RevokeAdminRequest extends FormRequest
{
    use ConfirmsCurrentPassword;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->ensurePasswordNotLockedOut();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'role' => ['required', Rule::enum(Role::class)->only([Role::Employee, Role::Manager])],
            'current_password' => $this->currentPasswordRules(),
        ];
    }
}
```

`app/Http/Controllers/Admin/AdministratorController.php`:

```php
<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\GrantAdminRequest;
use App\Http\Requests\Users\RevokeAdminRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\UserManagementService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

final class AdministratorController extends Controller
{
    public function __construct(private readonly UserManagementService $users) {}

    public function index(): AnonymousResourceCollection
    {
        return ManagedUserResource::collection(
            User::query()->where('role', Role::Admin)->with('invitation')->orderBy('name')->orderBy('id')->get(),
        );
    }

    public function store(GrantAdminRequest $request): JsonResponse|ManagedUserResource
    {
        $target = User::query()->findOrFail($request->integer('user_id'));
        Gate::authorize('grantAdmin', $target);

        if ($target->status !== UserStatus::Active || $target->isAdmin()) {
            return response()->json(['message' => Translate::text('users.not_promotable')], Response::HTTP_CONFLICT);
        }

        $this->users->grantAdmin($target, $this->actor($request), $request);

        return new ManagedUserResource($target->refresh());
    }

    public function destroy(RevokeAdminRequest $request, User $user): JsonResponse|ManagedUserResource
    {
        if (! $user->isAdmin()) {
            return response()->json(['message' => Translate::text('users.not_admin')], Response::HTTP_CONFLICT);
        }

        $this->users->revokeAdmin($user, $request->enum('role', Role::class) ?? Role::Employee, $this->actor($request), $request);

        return new ManagedUserResource($user->refresh());
    }
}
```

`lang/it/users.php`: aggiungi `'not_promotable' => 'Si possono promuovere solo utenti attivi che non sono già amministratori.'` e `'not_admin' => 'Questo utente non è un amministratore.'`.
`lang/en/users.php`: aggiungi `'not_promotable' => 'Only active users who are not admins yet can be promoted.'` e `'not_admin' => 'This user is not an admin.'`.

`routes/api.php` (import di `AdministratorController`), nel gruppo `auth:sanctum`:

```php
    Route::get('/administrators', [AdministratorController::class, 'index'])->can('viewAny', User::class)->name('administrators.index');
    Route::post('/administrators', [AdministratorController::class, 'store'])->can('viewAny', User::class)->name('administrators.store');
    Route::delete('/administrators/{user}', [AdministratorController::class, 'destroy'])->can('revokeAdmin', 'user')->name('administrators.destroy');
```

- [ ] **Step 5: Test, gate e commit**

Run: `sail artisan test --compact`, poi `sail bin pint app routes lang tests --format agent && sail bin pint --test && sail composer analyse`.
Expected: tutti PASS, 0 errori.

```bash
git add apps/laravel
git commit -m "feat(users): sezione amministratori con promozione e revoca protette da password"
```

---

## Task 7: Comando del primo admin e documentazione

**Files:**
- Create: `apps/laravel/app/Console/Commands/CreateAdmin.php`
- Modify: `apps/laravel/lang/{it,en}/invitations.php`, `apps/laravel/CLAUDE.md`, `docs/deploy/README.md`
- Test: `apps/laravel/tests/Feature/Users/CreateAdminCommandTest.php`

**Interfaces:**
- Consumes: `InvitationService::send(User $user, ?User $inviter)` (Task 3).
- Produces: `sail artisan app:create-admin {name} {email}`. Codice di uscita `0` se ha creato l'admin invitato e inviato l'email, `1` se l'email non è valida o è già registrata.

- [ ] **Step 1: Test che fallisce**

`tests/Feature/Users/CreateAdminCommandTest.php`:

```php
<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class CreateAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_an_invited_admin_and_emails_the_invitation(): void
    {
        Mail::fake();

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => ' Giulia@Example.TEST '])->assertSuccessful();

        $admin = User::query()->where('email', 'giulia@example.test')->firstOrFail();
        $this->assertSame(Role::Admin, $admin->role);
        $this->assertSame(UserStatus::Invited, $admin->status);
        $this->assertNull($admin->password);
        Mail::assertQueued(InvitationMail::class, fn (InvitationMail $mail): bool => $mail->hasTo('giulia@example.test') && $mail->inviterName === null);
    }

    public function test_refuses_an_email_already_registered_or_invalid(): void
    {
        Mail::fake();
        User::factory()->create(['email' => 'giulia@example.test']);

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test'])->assertFailed();
        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'non-una-email'])->assertFailed();
        Mail::assertNothingQueued();
    }
}
```

- [ ] **Step 2: Verifica che fallisca**

Run: `sail artisan test --compact tests/Feature/Users/CreateAdminCommandTest.php`
Expected: FAIL, il comando `app:create-admin` non è definito.

- [ ] **Step 3: Comando e testi**

`lang/it/invitations.php`, aggiungi:

```php
    'command' => [
        'sent' => 'Invito da amministratore inviato a :email. Vale :hours ore.',
    ],
```

`lang/en/invitations.php`:

```php
    'command' => [
        'sent' => 'Admin invitation sent to :email. It is valid for :hours hours.',
    ],
```

`app/Console/Commands/CreateAdmin.php`:

```php
<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\Translate;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Primo amministratore (spec §6.1): un invito come gli altri, nessuna password passa dal terminale.
 */
class CreateAdmin extends Command
{
    protected $signature = 'app:create-admin {name : Nome e cognome} {email : Email aziendale}';

    protected $description = 'Invita un amministratore (serve per il primo admin dell’installazione)';

    public function handle(InvitationService $invitations): int
    {
        $name = trim((string) $this->argument('name'));
        $email = Str::lower(trim((string) $this->argument('email')));

        $validator = Validator::make(['name' => $name, 'email' => $email], [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        DB::transaction(function () use ($name, $email, $invitations): void {
            $admin = new User;
            $admin->forceFill([
                'name' => $name,
                'email' => $email,
                'password' => null,
                'role' => Role::Admin,
                'status' => UserStatus::Invited,
                'locale' => 'it',
            ])->save();

            $invitations->send($admin, null);
        });

        $this->info(Translate::text('invitations.command.sent', ['email' => $email, 'hours' => InvitationService::TTL_HOURS]));

        return self::SUCCESS;
    }
}
```

- [ ] **Step 4: Documentazione**

- `apps/laravel/CLAUDE.md`:
  - nella sezione "Ambiente" aggiungi: primo admin con `sail artisan app:create-admin "Nome Cognome" email@azienda.it`;
  - inviti: link di 72 ore, attivazione su `/invitation/:token`;
  - gli admin nascono solo per promozione dalla sezione "Amministratori".
- `docs/deploy/README.md`: aggiungi i punti per il primo avvio:
  - dopo `migrate`, eseguire `php artisan app:create-admin`;
  - `PRIVACY_NOTICE_VERSION` aggiornata quando cambia il testo dell'informativa.

- [ ] **Step 5: Test, gate e commit**

Run: `sail artisan test --compact`, poi `sail bin pint app lang tests --format agent && sail bin pint --test && sail composer analyse`.
Expected: tutti PASS, 0 errori.

```bash
git add apps/laravel docs/deploy/README.md
git commit -m "feat(users): comando per invitare il primo amministratore"
```

---

## Task 8: Frontend — infrastruttura admin (componenti, route protetta, menu, cache)

**Files:**
- Create (CLI): `apps/react/src/components/ui/{dialog,alert-dialog,table,select,checkbox,tabs,radio-group}.tsx`
- Create: `apps/react/src/features/auth/AdminRoute.tsx`, `apps/react/src/pages/ForbiddenPage.tsx`
- Modify: `apps/react/src/lib/queryKeys.ts`, `apps/react/src/lib/queryClient.ts`, `apps/react/src/features/auth/api.ts` (`useLogout`), `apps/react/src/components/layout/AppShell.tsx`, `apps/react/src/locales/{it,en}.json`
- Test: `apps/react/src/features/auth/AdminRoute.test.tsx`, `apps/react/src/lib/queryClient.test.ts` (aggiunta), `apps/react/src/components/layout/AppShell.test.tsx` (aggiunta)

**Interfaces:**
- Produces:
  - `adminQueryKey: readonly ['admin']` in `@/lib/queryKeys`: prefisso di tutte le query admin, per invalidarle in blocco.
  - Ogni `403` da query o mutation ricarica l'utente corrente: un admin appena revocato vede subito la pagina 403 e il menu senza "Amministrazione".
  - Il logout rimuove dalla cache tutte le query tranne l'utente, che passa a `null`.
  - `AdminRoute` (default export): `<Outlet />` per gli admin, `<ForbiddenPage />` per gli altri.
  - `ForbiddenPage`: pagina dentro la shell.
  - Menu laterale con il gruppo "Amministrazione" (solo admin), con le voci "Utenti" (`/admin/users`) e "Amministratori" (`/admin/administrators`).
  - Chiavi `nav.admin`, `nav.users`, `nav.administrators`, `forbidden.*`, `titles.users`, `titles.administrators`.

- [ ] **Step 1: Componenti shadcn**

Run (da `apps/react`): `npx shadcn@4.21.0 add dialog alert-dialog table select checkbox tabs radio-group`
Expected: file creati in `src/components/ui/`. Lint e build restano puliti; se il lint segnala qualcosa nei file generati, correggilo come nella fase 1 senza disattivare regole.

- [ ] **Step 2: Testi**

`it.json`:
- in `nav`: `"admin": "Amministrazione"`, `"users": "Utenti"`, `"administrators": "Amministratori"`;
- in `titles`: `"users": "Utenti"`, `"administrators": "Amministratori"`;
- nuova sezione: `"forbidden": { "title": "Non hai i permessi per questa pagina", "description": "Se pensi che sia un errore, chiedi a un amministratore.", "back": "Torna alla home" }`.

`en.json`:
- in `nav`: `"admin": "Administration"`, `"users": "Users"`, `"administrators": "Administrators"`;
- in `titles`: `"users": "Users"`, `"administrators": "Administrators"`;
- nuova sezione: `"forbidden": { "title": "You don’t have access to this page", "description": "If you think this is a mistake, ask an administrator.", "back": "Back to home" }`.

- [ ] **Step 3: Test che falliscono**

`src/features/auth/AdminRoute.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AdminRoute from '@/features/auth/AdminRoute'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ element: <AdminRoute />, children: [{ path: '/admin/users', element: <p>users-page</p> }] }]

describe('AdminRoute', () => {
  it('lets admins through', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))
    renderRoutes(routes, ['/admin/users'])

    expect(await screen.findByText('users-page')).toBeInTheDocument()
  })

  it('shows the forbidden page to everyone else', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: { ...adminUser, role: 'employee', role_label: 'Dipendente' } })))
    renderRoutes(routes, ['/admin/users'])

    expect(await screen.findByRole('heading', { name: 'Non hai i permessi per questa pagina' })).toBeInTheDocument()
    expect(screen.queryByText('users-page')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla home' })).toHaveAttribute('href', '/')
  })
})
```

In `src/lib/queryClient.test.ts` aggiungi (segui lo stile dei test esistenti nel file, che creano il client con `createQueryClient` e osservano `invalidateQueries`):

```ts
  it('refreshes the current user when any request is forbidden (the role may have changed)', async () => {
    const client = createQueryClient({ retry: false })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await client
      .fetchQuery({ queryKey: ['admin', 'users'], queryFn: () => Promise.reject(new ApiError({ status: 403, kind: 'forbidden', message: 'no' })) })
      .catch(() => undefined)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: userQueryKey })
  })
```

In `src/components/layout/AppShell.test.tsx` aggiungi due test, sul modello di quelli esistenti per il menu:
- "shows the administration group only to admins": con `adminUser` i link "Utenti" e "Amministratori" esistono con `href` `/admin/users` e `/admin/administrators`; con un dipendente non esistono.
- "logging out drops every cached admin query":
  1. imposta in cache `queryClient.setQueryData(['admin', 'users', {}], { data: [] })`;
  2. fai il logout dal menu account (il server MSW risponde `204` a `POST /api/auth/logout`);
  3. verifica che `queryClient.getQueryData(['admin', 'users', {}])` sia `undefined` e che l'utente in cache sia `null`.

- [ ] **Step 4: Verifica che falliscano**

Run: `npx vitest run src/features/auth/AdminRoute.test.tsx src/lib/queryClient.test.ts src/components/layout/AppShell.test.tsx`
Expected: FAIL (`AdminRoute` non esiste, nessuna invalidazione su 403, menu e logout non aggiornati).

- [ ] **Step 5: Implementazione**

`src/lib/queryKeys.ts`, aggiungi:

```ts
/** Prefisso di tutte le query dell'area admin: si invalidano in blocco dopo ogni modifica. */
export const adminQueryKey: readonly ['admin'] = ['admin']
```

`src/lib/queryClient.ts`, negli `onError` di `QueryCache` e `MutationCache`: oltre al `401`, un `403` ricarica l'utente.

```ts
      onError: (error, query) => {
        // 401: sessione scaduta; 403: il ruolo può essere cambiato (es. admin revocato). In entrambi i casi si rilegge l'utente
        if ((isApiError(error, 'unauthenticated') || isApiError(error, 'forbidden')) && !isUserQuery(query.queryKey)) {
          void client.invalidateQueries({ queryKey: userQueryKey })
        }
      },
```

```ts
      onError: (error) => {
        if (isApiError(error, 'unauthenticated') || isApiError(error, 'forbidden')) void client.invalidateQueries({ queryKey: userQueryKey })
      },
```

`useLogout` in `src/features/auth/api.ts`:

```ts
export const useLogout = () => {
  const queryClient = useQueryClient()
  const signOut = () => {
    // Dati dell'area admin o di altri utenti: non devono restare per chi usa il browser dopo
    queryClient.removeQueries({ predicate: (query) => !isUserQuery(query.queryKey) })
    // null (e non "nessun dato"): le route protette mostrano l'avviso di uscita
    queryClient.setQueryData(userQueryKey, null)
  }
  return useMutation({
    mutationFn: () => request('POST', '/api/auth/logout'),
    onSuccess: signOut,
    onError: (error) => {
      // Su altri errori (rete, 5xx) la sessione potrebbe essere ancora attiva: l'utente resta dentro
      if (isAlreadySignedOut(error)) signOut()
    },
  })
}
```

(Importa `isUserQuery` da `@/lib/queryKeys`.)

`src/pages/ForbiddenPage.tsx`:

```tsx
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'

/** 403 dentro la shell: la pagina esiste ma non è per il ruolo di chi la apre. */
const ForbiddenPage = () => {
  const { t } = useTranslation()
  return (
    <div className="max-w-md">
      <PageHeading icon={<ShieldAlert className="size-5" aria-hidden="true" />} title={t('forbidden.title')} description={t('forbidden.description')} />
      <Button asChild>
        <Link to="/">{t('forbidden.back')}</Link>
      </Button>
    </div>
  )
}

export default ForbiddenPage
```

`src/features/auth/AdminRoute.tsx`:

```tsx
import { Outlet } from 'react-router'
import { useCurrentUser } from '@/features/auth/api'
import ForbiddenPage from '@/pages/ForbiddenPage'

/** Pagine dell'area admin. Sta dentro ProtectedRoute: l'utente c'è già, qui conta solo il ruolo. */
const AdminRoute = () => {
  const { data: user } = useCurrentUser()

  if (user?.role !== 'admin') return <ForbiddenPage />

  return <Outlet />
}

export default AdminRoute
```

`AppShell.tsx`:
- dentro `<nav>`, dopo il primo `SidebarGroup`, aggiungi un secondo gruppo mostrato solo se `user.role === 'admin'`;
- usa `SidebarGroupLabel` dal file sidebar, aggiungendolo all'import;
- icone `Users` e `ShieldCheck` da lucide.

```tsx
            {user.role === 'admin' && (
              <SidebarGroup>
                <SidebarGroupLabel>{t('nav.admin')}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip={t('nav.users')}>
                        <NavLink to="/admin/users">
                          <Users aria-hidden="true" />
                          <span>{t('nav.users')}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip={t('nav.administrators')}>
                        <NavLink to="/admin/administrators">
                          <ShieldCheck aria-hidden="true" />
                          <span>{t('nav.administrators')}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
```

Le route delle pagine si aggiungono nei Task 9 e 11. Fino ad allora i link portano alla 404, e va bene dentro il branch.

- [ ] **Step 6: Test e gate**

Run: `npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add apps/react
git commit -m "feat(ui): area admin protetta, menu amministrazione e cache svuotata al logout"
```

---

## Task 9: Frontend — pagina Utenti (lista, filtri, ricerca, paginazione)

**Files:**
- Create: `apps/react/src/features/users/api.ts`, `apps/react/src/features/users/useUserListParams.ts`
- Create: `apps/react/src/features/users/components/{RoleBadge,StatusBadge,UserStatusTabs,UsersTable,UsersPagination}.tsx`
- Create: `apps/react/src/features/users/pages/UsersPage.tsx` (+ `UsersPage.test.tsx`)
- Create: `apps/react/src/test/usersFixtures.ts`
- Modify: `apps/react/src/routes.tsx`, `apps/react/src/locales/{it,en}.json`

**Interfaces:**
- Consumes: `adminQueryKey`, `AdminRoute`, `request`/`requestData` da `@/lib/api`, `GET /api/users` (Task 2).
- Produces:
  - `managedUserSchema`, `type ManagedUser`, `type UserStatusFilter = 'all' | 'active' | 'invited' | 'disabled'`, `interface UserListParams { status: UserStatusFilter; search: string; page: number }`;
  - `usersQueryKey(params: UserListParams)`, `useManagedUsers(params: UserListParams)`, che restituisce `{ data: ManagedUser[], meta: { current_page, last_page, per_page, total, counts: { all, active, invited, disabled } } }`;
  - `useUserListParams(): { params: UserListParams; setParams: (next: Partial<UserListParams>) => void }`, che sincronizza con l'URL `?status=&q=&page=`;
  - `UsersTable` con la prop `renderActions?: (user: ManagedUser) => ReactNode` per la colonna azioni, usata dal Task 10;
  - in `UsersPage` uno slot per il pulsante "Invita utente" (Task 10);
  - route `/admin/users` dentro `AdminRoute` (titolo `titles.users`).

- [ ] **Step 1: Testi**

`it.json`, nuova sezione:

```json
  "users": {
    "title": "Utenti",
    "subtitle": "Inviti, ruoli e accessi di chi usa Holidays.",
    "invite": "Invita utente",
    "search": "Cerca per nome o email",
    "tabs": { "label": "Filtra per stato", "all": "Tutti", "active": "Attivi", "invited": "Invitati", "disabled": "Disattivati" },
    "columns": { "person": "Persona", "role": "Ruolo", "status": "Stato", "details": "Dettagli", "actions": "Azioni" },
    "you": "Tu",
    "inviteExpires": "Invito scade il {{date}}",
    "inviteExpired": "Invito scaduto",
    "empty": "Nessun utente trovato.",
    "clearFilters": "Azzera filtri",
    "loadError": "Non è stato possibile caricare gli utenti.",
    "pagination": { "label": "Pagine", "previous": "Precedente", "next": "Successiva", "status": "Pagina {{page}} di {{pages}}" }
  },
```

`en.json`:

```json
  "users": {
    "title": "Users",
    "subtitle": "Invitations, roles and access of everyone using Holidays.",
    "invite": "Invite user",
    "search": "Search by name or email",
    "tabs": { "label": "Filter by status", "all": "All", "active": "Active", "invited": "Invited", "disabled": "Disabled" },
    "columns": { "person": "Person", "role": "Role", "status": "Status", "details": "Details", "actions": "Actions" },
    "you": "You",
    "inviteExpires": "Invitation expires on {{date}}",
    "inviteExpired": "Invitation expired",
    "empty": "No users found.",
    "clearFilters": "Clear filters",
    "loadError": "Users couldn’t be loaded.",
    "pagination": { "label": "Pages", "previous": "Previous", "next": "Next", "status": "Page {{page}} of {{pages}}" }
  },
```

- [ ] **Step 2: Fixture e test che falliscono**

`src/test/usersFixtures.ts`:

```ts
import type { ManagedUser } from '@/features/users/api'

export const managedUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: 2,
  name: 'Marco Bianchi',
  email: 'marco@holidays.test',
  role: 'employee',
  role_label: 'Dipendente',
  status: 'active',
  status_label: 'Attivo',
  invitation_expires_at: null,
  is_current_user: false,
  ...overrides,
})

export const userListResponse = (users: ManagedUser[], counts = { all: users.length, active: users.length, invited: 0, disabled: 0 }) => ({
  data: users,
  links: {},
  meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length, counts },
})
```

`src/features/users/pages/UsersPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UsersPage from '@/features/users/pages/UsersPage'
import { expectNoA11yViolations } from '@/test/axe'
import { managedUser, userListResponse } from '@/test/usersFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/admin/users', element: <UsersPage /> }]

const respondWith = (onRequest: (url: URL) => void = () => undefined, users = [managedUser({ id: 1, name: 'Anna Admin', role: 'admin', role_label: 'HR / Admin', is_current_user: true }), managedUser()]) =>
  server.use(
    http.get('/api/users', ({ request }) => {
      onRequest(new URL(request.url))
      return HttpResponse.json(userListResponse(users, { all: 3, active: 2, invited: 1, disabled: 0 }))
    }),
  )

describe('UsersPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists people with textual role and status badges and marks the current user', async () => {
    respondWith()
    renderRoutes(routes, ['/admin/users'])

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Marco Bianchi')).toBeInTheDocument()
    expect(within(table).getAllByText('Attivo').length).toBeGreaterThan(0)
    expect(within(table).getByText('Tu')).toBeInTheDocument()
  })

  it('shows the counts on the status tabs and filters through the URL', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/admin/users'])

    await user.click(await screen.findByRole('tab', { name: /Invitati.*1/ }))

    expect(router.state.location.search).toBe('?status=invited')
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[status]')).toBe('invited'))
  })

  it('reads filter, search and page from the URL', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    renderRoutes(routes, ['/admin/users?status=disabled&q=rossi&page=2'])

    await screen.findByRole('table')
    const last = urls.at(-1)
    expect(last?.searchParams.get('filter[status]')).toBe('disabled')
    expect(last?.searchParams.get('search')).toBe('rossi')
    expect(last?.searchParams.get('page')).toBe('2')
    expect(screen.getByRole('searchbox', { name: 'Cerca per nome o email' })).toHaveValue('rossi')
  })

  it('debounces the search and goes back to page one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    respondWith()
    const { user, router } = renderRoutes(routes, ['/admin/users?page=3'], { advanceTimers: vi.advanceTimersByTime })

    await user.type(await screen.findByRole('searchbox', { name: 'Cerca per nome o email' }), 'mar')
    expect(router.state.location.search).toBe('?page=3')
    vi.advanceTimersByTime(300)

    await vi.waitFor(() => expect(router.state.location.search).toBe('?q=mar'))
  })

  it('shows an empty state with a way to clear the filters', async () => {
    respondWith(() => undefined, [])
    const { user, router } = renderRoutes(routes, ['/admin/users?status=disabled&q=zzz'])

    expect(await screen.findByText('Nessun utente trovato.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Azzera filtri' }))
    expect(router.state.location.search).toBe('')
  })

  it('shows an error with retry', async () => {
    server.use(http.get('/api/users', () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    renderRoutes(routes, ['/admin/users'])

    expect(await screen.findByText('Non è stato possibile caricare gli utenti.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })

  it('shows when an invitation expires', async () => {
    respondWith(() => undefined, [managedUser({ status: 'invited', status_label: 'Invitato', invitation_expires_at: '2099-10-16T10:00:00+00:00' })])
    renderRoutes(routes, ['/admin/users'])

    expect(await screen.findByText(/Invito scade il/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    respondWith()
    const { container } = renderRoutes(routes, ['/admin/users'])

    await screen.findByRole('table')
    await expectNoA11yViolations(container)
  })
})
```

Nota: su mobile la tabella diventa una lista. Il test usa jsdom, senza media query, e il componente rende **entrambe** le viste, nascondendo con CSS (`hidden md:block` / `md:hidden`). Quindi `findByRole('table')` trova la tabella, mentre la lista mobile è una `<ul>` con le stesse persone. Se le query trovano duplicati, limitale con `within(table)` come sopra.

- [ ] **Step 3: Verifica che falliscano**

Run: `npx vitest run src/features/users`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 4: API e parametri dell'URL**

`src/features/users/api.ts`:

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { requestData } from '@/lib/api'
import { adminQueryKey } from '@/lib/queryKeys'

export const managedUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['employee', 'manager', 'admin']),
  role_label: z.string(),
  status: z.enum(['invited', 'active', 'disabled']),
  status_label: z.string(),
  invitation_expires_at: z.string().nullable(),
  is_current_user: z.boolean(),
})

export type ManagedUser = z.infer<typeof managedUserSchema>

export type UserStatusFilter = 'all' | 'active' | 'invited' | 'disabled'

export interface UserListParams {
  status: UserStatusFilter
  search: string
  page: number
}

const userListSchema = z.object({
  data: z.array(managedUserSchema),
  meta: z.object({
    current_page: z.number(),
    last_page: z.number(),
    per_page: z.number(),
    total: z.number(),
    counts: z.object({ all: z.number(), active: z.number(), invited: z.number(), disabled: z.number() }),
  }),
})

export type UserList = z.infer<typeof userListSchema>

// Chiave tipizzata con un'annotazione: `as const` è vietato dalle regole di progetto
export const usersQueryKey = (params: UserListParams): readonly ['admin', 'users', UserListParams] => [adminQueryKey[0], 'users', params]

const toQueryString = ({ status, search, page }: UserListParams): string => {
  const query = new URLSearchParams()
  if (status !== 'all') query.set('filter[status]', status)
  if (search !== '') query.set('search', search)
  if (page > 1) query.set('page', String(page))
  const text = query.toString()
  return text === '' ? '' : `?${text}`
}

export const fetchUsers = (params: UserListParams): Promise<UserList> => requestData('GET', `/api/users${toQueryString(params)}`, userListSchema)

/** Lista per l'admin: durante il cambio di filtro o pagina restano visibili i dati precedenti. */
export const useManagedUsers = (params: UserListParams) =>
  useQuery({ queryKey: usersQueryKey(params), queryFn: () => fetchUsers(params), placeholderData: keepPreviousData })
```

`src/features/users/useUserListParams.ts`:

```ts
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { UserListParams, UserStatusFilter } from '@/features/users/api'

const STATUSES: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']

const isStatus = (value: string | null): value is UserStatusFilter => value !== null && STATUSES.some((status) => status === value)

const toPage = (value: string | null): number => {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isNaN(page) || page < 1 ? 1 : page
}

/** Filtro, ricerca e pagina nell'URL: "indietro" e i link condivisi riportano alla stessa vista. */
export const useUserListParams = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status')
  const params: UserListParams = {
    status: isStatus(status) ? status : 'all',
    search: searchParams.get('q') ?? '',
    page: toPage(searchParams.get('page')),
  }

  const setParams = useCallback(
    (next: Partial<UserListParams>) => {
      setSearchParams((current) => {
        const currentStatus = current.get('status')
        const merged: UserListParams = {
          status: next.status ?? (isStatus(currentStatus) ? currentStatus : 'all'),
          search: next.search ?? current.get('q') ?? '',
          page: next.page ?? toPage(current.get('page')),
        }
        const query = new URLSearchParams()
        if (merged.status !== 'all') query.set('status', merged.status)
        if (merged.search !== '') query.set('q', merged.search)
        if (merged.page > 1) query.set('page', String(merged.page))
        return query
      })
    },
    [setSearchParams],
  )

  return { params, setParams }
}
```

- [ ] **Step 5: Componenti**

`src/features/users/components/RoleBadge.tsx` e `StatusBadge.tsx` (un componente per file, props `{ user: ManagedUser }`):
- mostrano `role_label` e `status_label` con `Badge`;
- varianti: `active` → `secondary`, `invited` → `outline`, `disabled` → `outline` con testo `text-muted-foreground`, `admin` → `default`;
- il testo è sempre visibile: il colore non è mai l'unico segnale.

`src/features/users/components/UserStatusTabs.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { UserList, UserStatusFilter } from '@/features/users/api'

interface UserStatusTabsProps {
  value: UserStatusFilter
  counts: UserList['meta']['counts'] | undefined
  onChange: (status: UserStatusFilter) => void
}

const FILTERS: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']

const isFilter = (value: string): value is UserStatusFilter => FILTERS.some((filter) => filter === value)

/** Schede per stato con il conteggio (calcolato con la ricerca corrente). */
const UserStatusTabs = ({ value, counts, onChange }: UserStatusTabsProps) => {
  const { t } = useTranslation()
  return (
    <Tabs value={value} onValueChange={(next) => isFilter(next) && onChange(next)}>
      <TabsList aria-label={t('users.tabs.label')} className="max-w-full flex-wrap">
        {FILTERS.map((filter) => (
          <TabsTrigger key={filter} value={filter} className="gap-1.5">
            {t(`users.tabs.${filter}`)}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{counts?.[filter] ?? 0}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export default UserStatusTabs
```

`src/features/users/components/UsersTable.tsx`:
- **Props:** `{ users: ManagedUser[]; renderActions?: (user: ManagedUser) => ReactNode }`.
- **Desktop (`hidden md:block`):** `Table` con caption `sr-only` (`users.title`) e colonne Persona (nome in grassetto ed email sotto, badge "Tu" se `is_current_user`), Ruolo (`RoleBadge`), Stato (`StatusBadge`), Dettagli e Azioni (header `sr-only`).
- **Colonna Dettagli:**
  - invitato con scadenza futura: `users.inviteExpires` con data `Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })`;
  - invitato con scadenza passata: `users.inviteExpired`;
  - altrimenti vuoto.
- **Mobile (`md:hidden`):** `<ul>` di schede (`rounded-lg border p-4`) con nome, email, badge, dettagli e azioni in fondo.
- **Nessuna larghezza fissa:** l'email va a capo (`break-all`), così a 360 px non c'è scroll orizzontale.

`src/features/users/components/UsersPagination.tsx`:
- **Props:** `{ page: number; lastPage: number; onChange: (page: number) => void }`.
- Se `lastPage <= 1` non rende nulla.
- Altrimenti un `<nav aria-label={t('users.pagination.label')}>` con:
  - "Precedente" (disattivato a pagina 1);
  - il testo `users.pagination.status` in `aria-live="polite"`;
  - "Successiva" (disattivato all'ultima).

`src/features/users/pages/UsersPage.tsx`:

```tsx
import { Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useManagedUsers, type ManagedUser } from '@/features/users/api'
import UserStatusTabs from '@/features/users/components/UserStatusTabs'
import UsersPagination from '@/features/users/components/UsersPagination'
import UsersTable from '@/features/users/components/UsersTable'
import { useUserListParams } from '@/features/users/useUserListParams'

const SEARCH_DEBOUNCE_MS = 300

interface UsersPageProps {
  /** Pulsante "Invita utente" (Task 10) */
  headerAction?: ReactNode
  /** Menu azioni per riga (Task 10) */
  renderActions?: (user: ManagedUser) => ReactNode
}

const UsersPage = ({ headerAction, renderActions }: UsersPageProps) => {
  const { t } = useTranslation()
  const { params, setParams } = useUserListParams()
  const [draft, setDraft] = useState(params.search)
  const users = useManagedUsers(params)

  // Ricerca aggiornata 300 ms dopo l'ultima battuta; si torna a pagina 1
  useEffect(() => {
    if (draft === params.search) return
    const id = window.setTimeout(() => setParams({ search: draft, page: 1 }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [draft, params.search, setParams])

  const clearFilters = () => {
    setDraft('')
    setParams({ status: 'all', search: '', page: 1 })
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('users.title')} description={t('users.subtitle')} />
        {headerAction}
      </div>
      <div className="mb-4 grid gap-3 md:flex md:items-center md:justify-between">
        <UserStatusTabs value={params.status} counts={users.data?.meta.counts} onChange={(status) => setParams({ status, page: 1 })} />
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label={t('users.search')} placeholder={t('users.search')} value={draft} onChange={(event) => setDraft(event.target.value)} className="pl-9" />
        </div>
      </div>
      {users.isPending ? (
        <div className="grid gap-2" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      ) : users.isError ? (
        <div className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>{t('users.loadError')}</p>
          <Button variant="outline" onClick={() => void users.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : users.data.data.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>{t('users.empty')}</p>
          <Button variant="outline" onClick={clearFilters}>
            {t('users.clearFilters')}
          </Button>
        </div>
      ) : (
        <>
          <UsersTable users={users.data.data} renderActions={renderActions} />
          <UsersPagination page={users.data.meta.current_page} lastPage={users.data.meta.last_page} onChange={(page) => setParams({ page })} />
        </>
      )}
    </>
  )
}

export default UsersPage
```

Il debounce chiama `setParams` dentro un timeout, non in modo sincrono nell'effect: è conforme al lint React Hooks v7. Se il lint lo segnala comunque, sposta il timer in un `useRef` gestito dal solo `onChange`.

**Nota sul Task 10:** il componente che collega le azioni (`UsersAdminPage`) monta `UsersPage` passando `headerAction` e `renderActions`. In questo task la route usa `UsersPage` senza azioni.

`src/routes.tsx`: importa `AdminRoute` e `UsersPage`, poi nei figli di `AppShell`:

```tsx
            children: [
              { path: '/', element: <HomePage />, handle: { titleKey: 'titles.home' } },
              {
                element: <AdminRoute />,
                children: [{ path: '/admin/users', element: <UsersPage />, handle: { titleKey: 'titles.users' } }],
              },
            ],
```

- [ ] **Step 6: Test e gate**

Run: `npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add apps/react
git commit -m "feat(ui): pagina utenti con filtri, ricerca e paginazione nell'url"
```

---

## Task 10: Frontend — azioni sugli utenti (invito, reinvio, annullamento, ruolo, stato)

**Files:**
- Create: `apps/react/src/features/users/actions.ts` (+ `actions.test.ts`)
- Create: `apps/react/src/features/users/components/{InviteUserDialog,UserActionsMenu,ConfirmUserActionDialog,ChangeRoleDialog}.tsx`
- Create: `apps/react/src/features/users/pages/UsersAdminPage.tsx` (+ `UsersAdminPage.test.tsx`)
- Modify: `apps/react/src/features/users/api.ts` (mutation), `apps/react/src/routes.tsx`, `apps/react/src/locales/{it,en}.json`

**Interfaces:**
- Consumes: `UsersPage` con `headerAction` e `renderActions`; `adminQueryKey`; le API dei Task 3 e 5.
- Produces:
  - `type UserAction = 'resend' | 'cancel' | 'changeRole' | 'disable' | 'enable'`;
  - `availableActions(user: ManagedUser): UserAction[]` (funzione pura) e `needsPassword(user: ManagedUser, action: UserAction): boolean`;
  - mutation `useInviteUser`, `useResendInvitation`, `useCancelInvitation`, `useChangeRole`, `useDisableUser`, `useEnableUser`, tutte con `invalidateQueries({ queryKey: adminQueryKey })` in caso di successo;
  - `UsersAdminPage`: `UsersPage` con le azioni, montata su `/admin/users`.

- [ ] **Step 1: Testi**

`it.json`, dentro `users`:

```json
    "actions": {
      "menu": "Azioni per {{name}}",
      "resend": "Reinvia invito",
      "cancel": "Annulla invito",
      "changeRole": "Cambia ruolo",
      "disable": "Disattiva",
      "enable": "Riattiva"
    },
    "inviteDialog": {
      "title": "Invita utente",
      "description": "Riceverà un’email con il link per attivare l’account. Il link vale 72 ore.",
      "name": "Nome e cognome",
      "email": "Email aziendale",
      "role": "Ruolo",
      "submit": "Invia invito",
      "submitting": "Invio in corso…",
      "done": "Invito inviato a {{email}}."
    },
    "roles": { "employee": "Dipendente", "manager": "Responsabile" },
    "roleDialog": { "title": "Cambia ruolo di {{name}}", "submit": "Salva ruolo", "done": "Ruolo di {{name}} aggiornato." },
    "confirm": {
      "resend": { "title": "Reinviare l’invito a {{name}}?", "description": "Il link precedente smetterà di funzionare.", "action": "Reinvia", "done": "Invito inviato di nuovo." },
      "cancel": { "title": "Annullare l’invito di {{name}}?", "description": "L’account non attivato verrà eliminato.", "action": "Annulla invito di {{name}}", "done": "Invito annullato." },
      "disable": { "title": "Disattivare {{name}}?", "description": "Perderà subito l’accesso e verrà disconnesso da tutti i dispositivi.", "action": "Disattiva {{name}}", "done": "{{name}} è stato disattivato." },
      "enable": { "title": "Riattivare {{name}}?", "description": "Potrà di nuovo accedere con la sua password e il codice via email.", "action": "Riattiva {{name}}", "done": "{{name}} è stato riattivato." },
      "adminNotice": "È un amministratore: tutti gli amministratori riceveranno un’email.",
      "password": "La tua password",
      "back": "Indietro"
    }
```

`en.json`, dentro `users`:

```json
    "actions": {
      "menu": "Actions for {{name}}",
      "resend": "Resend invitation",
      "cancel": "Cancel invitation",
      "changeRole": "Change role",
      "disable": "Disable",
      "enable": "Enable"
    },
    "inviteDialog": {
      "title": "Invite user",
      "description": "They’ll get an email with a link to activate the account. The link is valid for 72 hours.",
      "name": "Full name",
      "email": "Work email",
      "role": "Role",
      "submit": "Send invitation",
      "submitting": "Sending…",
      "done": "Invitation sent to {{email}}."
    },
    "roles": { "employee": "Employee", "manager": "Manager" },
    "roleDialog": { "title": "Change {{name}}’s role", "submit": "Save role", "done": "{{name}}’s role updated." },
    "confirm": {
      "resend": { "title": "Resend the invitation to {{name}}?", "description": "The previous link will stop working.", "action": "Resend", "done": "Invitation sent again." },
      "cancel": { "title": "Cancel {{name}}’s invitation?", "description": "The account was never activated and will be deleted.", "action": "Cancel {{name}}’s invitation", "done": "Invitation cancelled." },
      "disable": { "title": "Disable {{name}}?", "description": "They’ll lose access right away and be signed out on every device.", "action": "Disable {{name}}", "done": "{{name}} has been disabled." },
      "enable": { "title": "Enable {{name}} again?", "description": "They’ll be able to sign in again with their password and the emailed code.", "action": "Enable {{name}}", "done": "{{name}} has been enabled again." },
      "adminNotice": "This person is an administrator: every administrator will get an email.",
      "password": "Your password",
      "back": "Back"
    }
```

In `validation` (entrambe le lingue) aggiungi `"nameRequired": "Inserisci nome e cognome."` / `"Enter the full name."`.

- [ ] **Step 2: Test che falliscono**

`src/features/users/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { availableActions, needsPassword } from '@/features/users/actions'
import { managedUser } from '@/test/usersFixtures'

describe('availableActions', () => {
  it('offers nothing on your own row', () => {
    expect(availableActions(managedUser({ is_current_user: true }))).toEqual([])
  })

  it('offers resend and cancel to invited users', () => {
    expect(availableActions(managedUser({ status: 'invited' }))).toEqual(['resend', 'cancel'])
  })

  it('offers role change and disable to active employees and managers', () => {
    expect(availableActions(managedUser())).toEqual(['changeRole', 'disable'])
    expect(availableActions(managedUser({ role: 'manager' }))).toEqual(['changeRole', 'disable'])
  })

  it('never offers a role change to admins', () => {
    expect(availableActions(managedUser({ role: 'admin' }))).toEqual(['disable'])
  })

  it('offers enable to disabled users', () => {
    expect(availableActions(managedUser({ status: 'disabled' }))).toEqual(['enable'])
  })
})

describe('needsPassword', () => {
  it('asks for the password only to disable or enable an admin', () => {
    expect(needsPassword(managedUser({ role: 'admin' }), 'disable')).toBe(true)
    expect(needsPassword(managedUser({ role: 'admin', status: 'disabled' }), 'enable')).toBe(true)
    expect(needsPassword(managedUser(), 'disable')).toBe(false)
  })
})
```

`src/features/users/pages/UsersAdminPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import UsersAdminPage from '@/features/users/pages/UsersAdminPage'
import { expectNoA11yViolations } from '@/test/axe'
import { managedUser, userListResponse } from '@/test/usersFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/admin/users', element: <UsersAdminPage /> }]

const listing = (users = [managedUser()]) => server.use(http.get('/api/users', () => HttpResponse.json(userListResponse(users))))

const openMenu = async (user: ReturnType<typeof renderRoutes>['user'], name: string) => {
  const table = await screen.findByRole('table')
  await user.click(within(table).getByRole('button', { name: `Azioni per ${name}` }))
}

describe('UsersAdminPage', () => {
  it('invites a user and shows the server errors under the fields', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.post('/api/users', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'x', errors: { email: ['L’email è già in uso.'] } }, { status: 422 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await user.type(within(dialog).getByLabelText('Nome e cognome'), 'Sara Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    expect(await within(dialog).findByText('L’email è già in uso.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email aziendale')).toHaveFocus()
    expect(body).toEqual({ name: 'Sara Colombo', email: 'sara@holidays.test', role: 'employee' })
  })

  it('closes the invite dialog and refreshes the list on success', async () => {
    let listCalls = 0
    server.use(
      http.get('/api/users', () => {
        listCalls += 1
        return HttpResponse.json(userListResponse([managedUser()]))
      }),
      http.post('/api/users', () => HttpResponse.json({ data: managedUser({ id: 9, status: 'invited' }) }, { status: 201 })),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await user.type(within(dialog).getByLabelText('Nome e cognome'), 'Sara Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    expect(await screen.findByText('Invito inviato a sara@holidays.test.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(listCalls).toBeGreaterThan(1)
  })

  it('shows only the actions that fit the row', async () => {
    listing([managedUser({ status: 'invited', name: 'Luca Ferrari' })])
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Luca Ferrari')

    expect(await screen.findByRole('menuitem', { name: 'Reinvia invito' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Annulla invito' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Disattiva' })).not.toBeInTheDocument()
  })

  it('disables an employee after an explicit confirmation', async () => {
    listing([managedUser()])
    let called = false
    server.use(
      http.post('/api/users/2/disable', () => {
        called = true
        return HttpResponse.json({ data: managedUser({ status: 'disabled' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Marco Bianchi?' })
    expect(within(dialog).queryByLabelText('La tua password')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Marco Bianchi' }))

    expect(await screen.findByText('Marco Bianchi è stato disattivato.')).toBeInTheDocument()
    expect(called).toBe(true)
  })

  it('asks for the password to disable an admin and shows a wrong password under the field', async () => {
    listing([managedUser({ role: 'admin', role_label: 'HR / Admin', name: 'Bruno Admin' })])
    server.use(
      http.post('/api/users/2/disable', () => HttpResponse.json({ message: 'x', errors: { current_password: ['La password non è corretta.'] } }, { status: 422 })),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Bruno Admin')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Bruno Admin?' })
    expect(within(dialog).getByText('È un amministratore: tutti gli amministratori riceveranno un’email.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('La tua password'), 'sbagliata')
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Bruno Admin' }))

    expect(await within(dialog).findByText('La password non è corretta.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('La tua password')).toHaveFocus()
  })

  it('changes the role between employee and manager only', async () => {
    listing([managedUser()])
    let body: unknown = null
    server.use(
      http.patch('/api/users/2/role', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ role: 'manager', role_label: 'Responsabile' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia ruolo di Marco Bianchi' })
    expect(within(dialog).queryByRole('radio', { name: /Admin/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva ruolo' }))

    expect(await screen.findByText('Ruolo di Marco Bianchi aggiornato.')).toBeInTheDocument()
    expect(body).toEqual({ role: 'manager' })
  })

  it('shows the wait when resending too early', async () => {
    listing([managedUser({ status: 'invited', name: 'Luca Ferrari' })])
    server.use(http.post('/api/users/2/invitation', () => HttpResponse.json({ message: 'Attendi 42 secondi prima di inviare di nuovo l’invito.', meta: { retry_after: 42 } }, { status: 429, headers: { 'Retry-After': '42' } })))
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Luca Ferrari')
    await user.click(await screen.findByRole('menuitem', { name: 'Reinvia invito' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reinvia' }))

    expect(await screen.findByText('Attendi 42 secondi prima di inviare di nuovo l’invito.')).toBeInTheDocument()
  })

  it('has no accessibility violations with the invite dialog open', async () => {
    listing()
    const { user, baseElement } = renderRoutes(routes, ['/admin/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    await screen.findByRole('dialog', { name: 'Invita utente' })
    await expectNoA11yViolations(baseElement)
  })
})
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npx vitest run src/features/users`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 4: Logica delle azioni e mutation**

`src/features/users/actions.ts`:

```ts
import type { ManagedUser } from '@/features/users/api'

export type UserAction = 'resend' | 'cancel' | 'changeRole' | 'disable' | 'enable'

/** Azioni del menu di riga: solo quelle che il backend accetta per quello stato e quel ruolo. */
export const availableActions = (user: ManagedUser): UserAction[] => {
  if (user.is_current_user) return []
  if (user.status === 'invited') return ['resend', 'cancel']
  if (user.status === 'disabled') return ['enable']
  // Il ruolo admin si gestisce solo nella sezione amministratori
  return user.role === 'admin' ? ['disable'] : ['changeRole', 'disable']
}

/** Disattivare o riattivare un admin chiede la password di chi agisce (spec fase 3 §5.6). */
export const needsPassword = (user: ManagedUser, action: UserAction): boolean =>
  user.role === 'admin' && (action === 'disable' || action === 'enable')
```

In `src/features/users/api.ts` aggiungi le mutation:

```ts
export type ManagedRole = 'employee' | 'manager'

export interface InviteUserInput {
  name: string
  email: string
  role: ManagedRole
}

const userResourceSchema = z.object({ data: managedUserSchema })

/** Dopo ogni modifica si ricaricano tutte le query admin (lista utenti, amministratori, conteggi). */
const useAdminMutation = <TInput>(mutationFn: (input: TInput) => Promise<unknown>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKey }),
  })
}

export const useInviteUser = () => useAdminMutation((input: InviteUserInput) => requestData('POST', '/api/users', userResourceSchema, input))

export const useResendInvitation = () => useAdminMutation((id: number) => request('POST', `/api/users/${id}/invitation`))

export const useCancelInvitation = () => useAdminMutation((id: number) => request('DELETE', `/api/users/${id}/invitation`))

export const useChangeRole = () =>
  useAdminMutation(({ id, role }: { id: number; role: ManagedRole }) => requestData('PATCH', `/api/users/${id}/role`, userResourceSchema, { role }))

export interface UserStatusInput {
  id: number
  currentPassword?: string
}

const statusBody = ({ currentPassword }: UserStatusInput) => (currentPassword === undefined ? undefined : { current_password: currentPassword })

export const useDisableUser = () =>
  useAdminMutation((input: UserStatusInput) => requestData('POST', `/api/users/${input.id}/disable`, userResourceSchema, statusBody(input)))

export const useEnableUser = () =>
  useAdminMutation((input: UserStatusInput) => requestData('POST', `/api/users/${input.id}/enable`, userResourceSchema, statusBody(input)))
```

(Importa `useMutation`, `useQueryClient` e `request`.)

- [ ] **Step 5: Componenti**

Struttura e comportamento (scrivili seguendo i pattern dei form di `LoginPage` e `ResetPasswordPage`: react-hook-form, zod, `Field`, `FieldError`, `aria-invalid`, `aria-describedby`, focus sul primo errore, errori `422` del server mappati con `form.setError(field, …, { shouldFocus: true })`):

1. **`InviteUserDialog.tsx`**
   - Contenuto: `Dialog` con `DialogTrigger` (pulsante "Invita utente", icona `UserPlus`), `DialogTitle` `users.inviteDialog.title` e `DialogDescription`.
   - Form:
     - "Nome e cognome" (`autoComplete="name"`, zod `trim().min(1, validation.nameRequired)`);
     - "Email aziendale" (`emailField(t)` da `@/features/auth/validation`, `autoComplete="email"`);
     - "Ruolo" come `RadioGroup` con Dipendente (predefinito) e Responsabile.
   - Invio con `useInviteUser`:
     - **successo:** chiudi il dialog, `toast.success(t('users.inviteDialog.done', { email }))`, reset del form;
     - **`422`:** errori sotto i campi;
     - **rete o altro:** `toast.error` con `errors.network` o `errors.generic`.
   - Mentre l'invio è in corso il pulsante è disattivato e mostra "Invio in corso…".
2. **`UserActionsMenu.tsx`**
   - Props `{ user: ManagedUser; onSelect: (action: UserAction) => void }`. Se `availableActions(user)` è vuoto non rende nulla.
   - Altrimenti un `DropdownMenu` con:
     - trigger `Button variant="ghost" size="icon"`, icona `Ellipsis` e `aria-label` = `users.actions.menu` con il nome;
     - una voce per azione, con testo `users.actions.<azione>`;
     - la voce `disable` con stile distruttivo (`variant="destructive"` se il componente lo supporta, altrimenti `className="text-destructive"`).
3. **`ConfirmUserActionDialog.tsx`**
   - Props `{ user: ManagedUser | null; action: 'resend' | 'cancel' | 'disable' | 'enable' | null; onClose: () => void }`.
   - Struttura:
     - `AlertDialog` aperto quando `user` e `action` ci sono;
     - titolo e descrizione `users.confirm.<azione>.*` con il nome;
     - se `needsPassword(user, action)`: avviso `users.confirm.adminNotice` e campo "La tua password" (`PasswordInput`, `autoComplete="current-password"`, errore server `current_password` sotto il campo con focus);
     - pulsante di conferma con il testo `users.confirm.<azione>.action`, distruttivo per `cancel` e `disable`, e "Indietro" per chiudere.
   - **Mutation per azione:** `resend` → `useResendInvitation`; `cancel` → `useCancelInvitation`; `disable` → `useDisableUser`; `enable` → `useEnableUser`.
   - **Esiti:**
     - **successo:** `toast.success(t('users.confirm.<azione>.done', { name }))` e chiusura;
     - **`429` o `409`:** `toast.error(error.message)`, il messaggio del server già tradotto, e chiusura;
     - **`422` su `current_password`:** errore sotto il campo e dialog aperto.
   - Usa `AlertDialogAction` solo se non chiude da solo prima della risposta; altrimenti usa un `Button` dentro `AlertDialogFooter` e chiudi a mano dopo il successo.
4. **`ChangeRoleDialog.tsx`**
   - Props `{ user: ManagedUser | null; onClose: () => void }`.
   - `Dialog` con titolo `users.roleDialog.title`, `RadioGroup` Dipendente/Responsabile preselezionato sul ruolo attuale e pulsante "Salva ruolo".
   - Invio con `useChangeRole`; in caso di successo `toast.success(t('users.roleDialog.done', { name }))` e chiusura.

`src/features/users/pages/UsersAdminPage.tsx`:

```tsx
import { useState } from 'react'
import type { ManagedUser } from '@/features/users/api'
import type { UserAction } from '@/features/users/actions'
import ChangeRoleDialog from '@/features/users/components/ChangeRoleDialog'
import ConfirmUserActionDialog from '@/features/users/components/ConfirmUserActionDialog'
import InviteUserDialog from '@/features/users/components/InviteUserDialog'
import UserActionsMenu from '@/features/users/components/UserActionsMenu'
import UsersPage from '@/features/users/pages/UsersPage'

type ConfirmAction = Exclude<UserAction, 'changeRole'>

/** Pagina Utenti con invito e azioni di riga. */
const UsersAdminPage = () => {
  const [confirm, setConfirm] = useState<{ user: ManagedUser; action: ConfirmAction } | null>(null)
  const [roleTarget, setRoleTarget] = useState<ManagedUser | null>(null)

  const onSelect = (user: ManagedUser, action: UserAction) => {
    if (action === 'changeRole') setRoleTarget(user)
    else setConfirm({ user, action })
  }

  return (
    <>
      <UsersPage headerAction={<InviteUserDialog />} renderActions={(user) => <UserActionsMenu user={user} onSelect={(action) => onSelect(user, action)} />} />
      <ConfirmUserActionDialog user={confirm?.user ?? null} action={confirm?.action ?? null} onClose={() => setConfirm(null)} />
      <ChangeRoleDialog user={roleTarget} onClose={() => setRoleTarget(null)} />
    </>
  )
}

export default UsersAdminPage
```

`src/routes.tsx`: la route `/admin/users` usa `UsersAdminPage` al posto di `UsersPage`.

- [ ] **Step 6: Test e gate**

Run: `npm test && npm run lint && npm run build`
Expected: tutto verde, test senza avvisi (attenzione agli avvisi `act(...)` dei dialog Radix: attendi sempre gli elementi con `findBy…`).

- [ ] **Step 7: Commit**

```bash
git add apps/react
git commit -m "feat(ui): invito utenti e azioni di riga con conferme e password per gli admin"
```

---

## Task 11: Frontend — sezione Amministratori

**Files:**
- Create: `apps/react/src/features/administrators/api.ts`
- Create: `apps/react/src/features/administrators/components/{GrantAdminDialog,RevokeAdminDialog}.tsx`
- Create: `apps/react/src/features/administrators/pages/AdministratorsPage.tsx` (+ `AdministratorsPage.test.tsx`)
- Modify: `apps/react/src/routes.tsx`, `apps/react/src/locales/{it,en}.json`

**Interfaces:**
- Consumes:
  - `managedUserSchema`, `ManagedUser`, `ManagedRole`, `useManagedUsers` (Tasks 9-10);
  - `RoleBadge`, `StatusBadge`;
  - `adminQueryKey`;
  - API del Task 6.
- Produces:
  - `useAdministrators()`, `useGrantAdmin()` (`{ userId: number; currentPassword: string }`), `useRevokeAdmin()` (`{ id: number; role: ManagedRole; currentPassword: string }`);
  - route `/admin/administrators` dentro `AdminRoute` (titolo `titles.administrators`).

- [ ] **Step 1: Testi**

`it.json`, nuova sezione:

```json
  "administrators": {
    "title": "Amministratori",
    "subtitle": "Chi può gestire utenti e impostazioni. Ogni modifica viene comunicata via email a tutti gli amministratori.",
    "add": "Aggiungi admin",
    "revoke": "Revoca",
    "revokeFor": "Revoca {{name}}",
    "onlyYou": "Sei l’unico amministratore. Aggiungine un altro prima di lasciare il ruolo: serve sempre almeno un amministratore.",
    "loadError": "Non è stato possibile caricare gli amministratori.",
    "grant": {
      "title": "Aggiungi un amministratore",
      "description": "Scegli un utente attivo. Riceverà un’email, come tutti gli altri amministratori.",
      "search": "Cerca un utente attivo",
      "noResults": "Nessun utente attivo trovato.",
      "candidates": "Utenti attivi",
      "password": "La tua password",
      "submit": "Rendi amministratore",
      "pickUser": "Scegli un utente.",
      "done": "{{name}} ora è amministratore."
    },
    "revokeDialog": {
      "title": "Revocare il ruolo di amministratore a {{name}}?",
      "description": "Perderà subito l’accesso all’amministrazione. Tutti gli amministratori riceveranno un’email.",
      "newRole": "Nuovo ruolo",
      "password": "La tua password",
      "submit": "Revoca {{name}}",
      "done": "{{name}} non è più amministratore."
    }
  },
```

`en.json`:

```json
  "administrators": {
    "title": "Administrators",
    "subtitle": "Who can manage users and settings. Every change is emailed to all administrators.",
    "add": "Add admin",
    "revoke": "Revoke",
    "revokeFor": "Revoke {{name}}",
    "onlyYou": "You are the only administrator. Add another one before giving up the role: at least one administrator is always required.",
    "loadError": "Administrators couldn’t be loaded.",
    "grant": {
      "title": "Add an administrator",
      "description": "Pick an active user. They and every other administrator will get an email.",
      "search": "Search an active user",
      "noResults": "No active users found.",
      "candidates": "Active users",
      "password": "Your password",
      "submit": "Make administrator",
      "pickUser": "Pick a user.",
      "done": "{{name}} is now an administrator."
    },
    "revokeDialog": {
      "title": "Revoke {{name}}’s administrator role?",
      "description": "They’ll lose access to administration right away. Every administrator will get an email.",
      "newRole": "New role",
      "password": "Your password",
      "submit": "Revoke {{name}}",
      "done": "{{name}} is no longer an administrator."
    }
  },
```

- [ ] **Step 2: Test che falliscono**

`src/features/administrators/pages/AdministratorsPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AdministratorsPage from '@/features/administrators/pages/AdministratorsPage'
import { expectNoA11yViolations } from '@/test/axe'
import { managedUser, userListResponse } from '@/test/usersFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/admin/administrators', element: <AdministratorsPage /> }]

const me = managedUser({ id: 1, name: 'Anna Admin', role: 'admin', role_label: 'HR / Admin', is_current_user: true })
const bruno = managedUser({ id: 3, name: 'Bruno Admin', role: 'admin', role_label: 'HR / Admin' })

const admins = (list = [me, bruno]) => server.use(http.get('/api/administrators', () => HttpResponse.json({ data: list })))

describe('AdministratorsPage', () => {
  it('lists administrators, marks you and offers revoke only on others', async () => {
    admins()
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByText('Bruno Admin')).toBeInTheDocument()
    expect(screen.getByText('Tu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revoca Bruno Admin' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoca Anna Admin' })).not.toBeInTheDocument()
  })

  it('explains that you cannot leave when you are the only admin', async () => {
    admins([me])
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByText(/Sei l’unico amministratore/)).toBeInTheDocument()
  })

  it('promotes an active user with your password', async () => {
    admins()
    let body: unknown = null
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' }), bruno]))),
      http.post('/api/administrators', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 7, name: 'Marco Bianchi', role: 'admin' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    // Gli admin esistenti non compaiono tra i candidati
    expect(within(dialog).queryByRole('radio', { name: /Bruno Admin/ })).not.toBeInTheDocument()
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await screen.findByText('Marco Bianchi ora è amministratore.')).toBeInTheDocument()
    expect(body).toEqual({ user_id: 7, current_password: 'password' })
  })

  it('requires picking a user before sending', async () => {
    admins()
    server.use(http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7 })]))))
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await within(dialog).findByText('Scegli un utente.')).toBeInTheDocument()
  })

  it('revokes choosing the new role, employee preselected', async () => {
    admins()
    let body: unknown = null
    server.use(
      http.delete('/api/administrators/3', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 3, name: 'Bruno Admin', role: 'manager' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Revoca Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Revocare il ruolo di amministratore a Bruno Admin?' })
    expect(within(dialog).getByRole('radio', { name: 'Dipendente' })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))

    expect(await screen.findByText('Bruno Admin non è più amministratore.')).toBeInTheDocument()
    expect(body).toEqual({ role: 'manager', current_password: 'password' })
  })

  it('shows the lockout after too many wrong passwords', async () => {
    admins()
    server.use(http.delete('/api/administrators/3', () => HttpResponse.json({ message: 'Troppi tentativi con la password. Riprova tra 15 minuti.' }, { status: 429, headers: { 'Retry-After': '900' } })))
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Revoca Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))

    expect(await within(dialog).findByText('Troppi tentativi con la password. Riprova tra 15 minuti.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    admins()
    const { container } = renderRoutes(routes, ['/admin/administrators'])

    await screen.findByText('Bruno Admin')
    await expectNoA11yViolations(container)
  })
})
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npx vitest run src/features/administrators`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 4: API**

`src/features/administrators/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { requestData } from '@/lib/api'
import { adminQueryKey } from '@/lib/queryKeys'
import { managedUserSchema, type ManagedRole } from '@/features/users/api'

const listSchema = z.object({ data: z.array(managedUserSchema) })
const resourceSchema = z.object({ data: managedUserSchema })

export const administratorsQueryKey: readonly ['admin', 'administrators'] = [adminQueryKey[0], 'administrators']

export const useAdministrators = () =>
  useQuery({ queryKey: administratorsQueryKey, queryFn: async () => (await requestData('GET', '/api/administrators', listSchema)).data })

export interface GrantAdminInput {
  userId: number
  currentPassword: string
}

export interface RevokeAdminInput {
  id: number
  role: ManagedRole
  currentPassword: string
}

export const useGrantAdmin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, currentPassword }: GrantAdminInput) =>
      requestData('POST', '/api/administrators', resourceSchema, { user_id: userId, current_password: currentPassword }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKey }),
  })
}

export const useRevokeAdmin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role, currentPassword }: RevokeAdminInput) =>
      requestData('DELETE', `/api/administrators/${id}`, resourceSchema, { role, current_password: currentPassword }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKey }),
  })
}
```

Il client `request` accetta già un corpo anche per `DELETE`: `send()` lo serializza per qualunque metodo.

- [ ] **Step 5: Componenti e pagina**

1. **`AdministratorsPage.tsx`**
   - **Intestazione:** `PageHeading` con titolo e sottotitolo, a destra `GrantAdminDialog`.
   - **Lista** (`<ul>` di righe a schede, adatta a mobile e desktop):
     - nome, email, `StatusBadge` e badge "Tu" se `is_current_user`;
     - sulle righe degli altri il pulsante `variant="outline"` con testo "Revoca" e `aria-label` `administrators.revokeFor`, che apre `RevokeAdminDialog`.
   - **Nota:** se nella lista c'è solo l'utente corrente, il testo `administrators.onlyYou` in un `Alert` non distruttivo.
   - **Stati:** caricamento con skeleton, errore con `administrators.loadError` e "Riprova".
2. **`GrantAdminDialog.tsx`**
   - **Contenuto:** `Dialog` con trigger "Aggiungi admin" (icona `ShieldPlus` o `UserPlus`), titolo e descrizione.
   - **Ricerca:**
     - campo con `aria-label` `administrators.grant.search`, debounce di 300 ms come nella pagina utenti;
     - risultati da `useManagedUsers({ status: 'active', search, page: 1 })`, filtrando via chi ha `role === 'admin'`;
     - `RadioGroup` con `aria-label` `administrators.grant.candidates`; ogni opzione mostra nome ed email e ha come nome accessibile "Nome (email)";
     - nessun risultato: `administrators.grant.noResults`.
   - **Password e invio:** campo "La tua password" (`PasswordInput`, `autoComplete="current-password"`) e pulsante "Rendi amministratore".
   - **Validazione client:** utente scelto (`administrators.grant.pickUser`) e password non vuota (`validation.passwordRequired`).
   - **Esiti:**
     - **successo:** `toast.success(t('administrators.grant.done', { name }))`, chiusura e reset;
     - **`422`:** `current_password` sotto il campo con focus; `user_id` come errore sulla scelta;
     - **`409`:** `toast.error(message)`;
     - **`429`:** messaggio del server in un `Alert` nel dialog, con pulsante di invio disattivato.
3. **`RevokeAdminDialog.tsx`**
   - **Contenuto:** `AlertDialog` per l'admin scelto, con titolo e descrizione `administrators.revokeDialog.*`, `RadioGroup` "Nuovo ruolo" (Dipendente preselezionato, Responsabile) e "La tua password".
   - **Pulsante:** distruttivo, testo `administrators.revokeDialog.submit`.
   - **Esiti:**
     - **successo:** toast `administrators.revokeDialog.done` e chiusura;
     - **`422`:** password sotto il campo; il messaggio "ultimo admin" (chiave `user`) va in un `Alert` nel dialog;
     - **`403` o `409`:** `toast.error(message)` e chiusura;
     - **`429`:** `Alert` nel dialog.

`src/routes.tsx`: dentro `AdminRoute` aggiungi `{ path: '/admin/administrators', element: <AdministratorsPage />, handle: { titleKey: 'titles.administrators' } }`.

- [ ] **Step 6: Test e gate**

Run: `npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add apps/react
git commit -m "feat(ui): sezione amministratori con promozione e revoca protette da password"
```

---

## Task 12: Frontend — attivazione dell'invito, informativa privacy, avviso sulla pagina del codice

**Files:**
- Create: `apps/react/src/features/invitations/api.ts`, `apps/react/src/features/invitations/pages/AcceptInvitationPage.tsx` (+ test)
- Create: `apps/react/src/pages/PrivacyPage.tsx`
- Modify: `apps/react/src/features/auth/pages/VerifyCodePage.tsx` (+ test), `apps/react/src/routes.tsx`, `apps/react/src/locales/{it,en}.json`

**Interfaces:**
- Consumes: le API pubbliche del Task 4 e i pattern di `ResetPasswordPage`: email in sola lettura attenuata, password e conferma con `deps`, guardia del doppio invio con `useRef`, blocco su `429`, focus su `#page-title` quando cambia il contenuto.
- Produces:
  - `useInvitation(token: string)`, query con `retry: false` che restituisce `{ name, email, expires_at }`;
  - `useAcceptInvitation(token: string)`, mutation con `{ password, password_confirmation, privacy_acknowledged: true }`;
  - route pubbliche:
    - `/invitation/:token` (`GuestRoute` + `AuthLayout`, titolo `titles.invitation`);
    - `/privacy` (`AuthLayout` senza `GuestRoute`, raggiungibile anche da loggati, titolo `titles.privacy`).
  - Navigazione dopo l'attivazione: `navigate('/login/verify', { replace: true, state: { email, invitationAccepted: true } })`.

- [ ] **Step 1: Testi**

`it.json`:
- in `titles`: `"invitation": "Attiva account"`, `"privacy": "Informativa privacy"`;
- in `verify`: `"invitationAccepted": "Account attivato. Per entrare inserisci il codice che ti abbiamo inviato."`;
- nuove sezioni:

```json
  "invitation": {
    "title": "Benvenuto, {{name}}",
    "subtitle": "Scegli la password per attivare il tuo account Holidays.",
    "password": "Password",
    "confirmation": "Conferma password",
    "hint": "Almeno 12 caratteri. Una frase facile da ricordare va benissimo.",
    "privacy": "Ho preso visione dell’informativa privacy",
    "privacyLink": "Leggi l’informativa (si apre in una nuova scheda)",
    "privacyRequired": "Per continuare conferma di aver preso visione dell’informativa.",
    "submit": "Attiva account",
    "submitting": "Attivazione in corso…",
    "throttled": "Troppi tentativi. Potrai riprovare tra {{count}} secondi.",
    "invalidTitle": "Invito non valido",
    "invalid": "Questo invito non è valido o è già stato usato.",
    "expiredTitle": "Invito scaduto",
    "expired": "Gli inviti valgono 72 ore.",
    "askHr": "Chiedi all’ufficio HR di inviartene uno nuovo.",
    "toLogin": "Vai all’accesso"
  },
  "privacy": {
    "title": "Informativa privacy",
    "placeholder": "Testo segnaposto: l’informativa definitiva sarà validata dal DPO prima del rilascio. Holidays tratta nome, email, ruolo e i dati di ferie e permessi per gestire le assenze (art. 6.1.b GDPR); i log di accesso servono solo alla sicurezza e si conservano 180 giorni."
  },
```

`en.json`:
- in `titles`: `"invitation": "Activate account"`, `"privacy": "Privacy notice"`;
- in `verify`: `"invitationAccepted": "Account activated. To sign in, enter the code we just sent you."`;
- nuove sezioni:

```json
  "invitation": {
    "title": "Welcome, {{name}}",
    "subtitle": "Choose a password to activate your Holidays account.",
    "password": "Password",
    "confirmation": "Confirm password",
    "hint": "At least 12 characters. An easy-to-remember phrase works great.",
    "privacy": "I have read the privacy notice",
    "privacyLink": "Read the notice (opens in a new tab)",
    "privacyRequired": "To continue, confirm you have read the privacy notice.",
    "submit": "Activate account",
    "submitting": "Activating…",
    "throttled": "Too many attempts. You can try again in {{count}} seconds.",
    "invalidTitle": "Invalid invitation",
    "invalid": "This invitation is invalid or has already been used.",
    "expiredTitle": "Invitation expired",
    "expired": "Invitations are valid for 72 hours.",
    "askHr": "Ask HR to send you a new one.",
    "toLogin": "Go to sign in"
  },
  "privacy": {
    "title": "Privacy notice",
    "placeholder": "Placeholder text: the final notice will be validated by the DPO before release. Holidays processes name, email, role and leave data to manage absences (art. 6.1.b GDPR); access logs are used only for security and kept for 180 days."
  },
```

- [ ] **Step 2: Test che falliscono**

`src/features/invitations/pages/AcceptInvitationPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AcceptInvitationPage from '@/features/invitations/pages/AcceptInvitationPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/invitation/:token', element: <AcceptInvitationPage /> },
  { path: '/login/verify', element: <p>verify-page</p> },
  { path: '/login', element: <p>login-page</p> },
]

const PASSWORD = 'una-frase-lunga-e-nuova'

const validInvitation = () =>
  server.use(http.get('/api/invitations/abc', () => HttpResponse.json({ data: { name: 'Sara Colombo', email: 'sara@holidays.test', expires_at: '2099-01-01T00:00:00+00:00' } })))

const fillForm = async (user: ReturnType<typeof renderRoutes>['user']) => {
  await user.type(await screen.findByLabelText('Password', { exact: true }), PASSWORD)
  await user.type(screen.getByLabelText('Conferma password'), PASSWORD)
  await user.click(screen.getByRole('checkbox', { name: 'Ho preso visione dell’informativa privacy' }))
}

describe('AcceptInvitationPage', () => {
  it('greets the invited person with the email read-only', async () => {
    validInvitation()
    renderRoutes(routes, ['/invitation/abc'])

    expect(await screen.findByRole('heading', { name: 'Benvenuto, Sara Colombo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('sara@holidays.test')
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
    expect(screen.getByRole('link', { name: 'Leggi l’informativa (si apre in una nuova scheda)' })).toHaveAttribute('target', '_blank')
  })

  it('activates and moves to the code step', async () => {
    validInvitation()
    let body: unknown = null
    server.use(
      http.post('/api/invitations/abc/accept', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ two_factor: true, message: 'ok' })
      }),
    )
    const { user, router } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByText('verify-page')).toBeInTheDocument()
    expect(body).toEqual({ password: PASSWORD, password_confirmation: PASSWORD, privacy_acknowledged: true })
    expect(router.state.location.state).toEqual({ email: 'sara@holidays.test', invitationAccepted: true })
  })

  it('requires matching passwords and the privacy acknowledgment', async () => {
    validInvitation()
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await user.type(await screen.findByLabelText('Password', { exact: true }), PASSWORD)
    await user.type(screen.getByLabelText('Conferma password'), 'diversa-ma-abbastanza-lunga')
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByText('Le due password non coincidono.')).toBeInTheDocument()
    expect(screen.getByText('Per continuare conferma di aver preso visione dell’informativa.')).toBeInTheDocument()
  })

  it('explains an expired invitation', async () => {
    server.use(http.get('/api/invitations/abc', () => HttpResponse.json({ message: 'expired' }, { status: 410 })))
    renderRoutes(routes, ['/invitation/abc'])

    expect(await screen.findByRole('heading', { name: 'Invito scaduto' })).toBeInTheDocument()
    expect(screen.getByText('Chiedi all’ufficio HR di inviartene uno nuovo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vai all’accesso' })).toHaveAttribute('href', '/login')
  })

  it('explains an invalid or used invitation, also when it fails on submit', async () => {
    validInvitation()
    server.use(http.post('/api/invitations/abc/accept', () => HttpResponse.json({ message: 'invalid' }, { status: 404 })))
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByRole('heading', { name: 'Invito non valido' })).toHaveFocus()
  })

  it('shows a server password error under the field', async () => {
    validInvitation()
    server.use(http.post('/api/invitations/abc/accept', () => HttpResponse.json({ message: 'x', errors: { password: ['Password trafugata.'] } }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByText('Password trafugata.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password', { exact: true })).toHaveFocus()
  })

  it('has no accessibility violations', async () => {
    validInvitation()
    const { container } = renderRoutes(routes, ['/invitation/abc'])

    await screen.findByRole('heading', { name: 'Benvenuto, Sara Colombo' })
    await expectNoA11yViolations(container)
  })
})
```

In `VerifyCodePage.test.tsx` aggiungi:

```tsx
  it('confirms the activation when coming from an invitation', async () => {
    renderRoutes(routes, [{ pathname: '/login/verify', state: { email: 'sara@holidays.test', invitationAccepted: true } }])

    expect(await screen.findByText('Account attivato. Per entrare inserisci il codice che ti abbiamo inviato.')).toBeInTheDocument()
  })
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npx vitest run src/features/invitations src/features/auth/pages/VerifyCodePage.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implementazione**

`src/features/invitations/api.ts`:

```ts
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'

const invitationSchema = z.object({ data: z.object({ name: z.string(), email: z.string(), expires_at: z.string() }) })

export type Invitation = z.infer<typeof invitationSchema>['data']

export interface AcceptInvitationInput {
  password: string
  password_confirmation: string
  privacy_acknowledged: true
}

// Token nel percorso: codificato per sicurezza anche se è alfanumerico
const invitationPath = (token: string): string => `/api/invitations/${encodeURIComponent(token)}`

export const useInvitation = (token: string) =>
  useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => (await requestData('GET', invitationPath(token), invitationSchema)).data,
    retry: false,
    staleTime: Infinity,
  })

export const useAcceptInvitation = (token: string) =>
  useMutation({ mutationFn: (input: AcceptInvitationInput) => request('POST', `${invitationPath(token)}/accept`, input) })
```

`src/features/invitations/pages/AcceptInvitationPage.tsx`: segui la struttura di `ResetPasswordPage` (stessi import, guardia `submitting` con `useRef`, `useCountdown` per il `429`, focus su `#page-title` quando cambia lo stato).

- **Caricamento e stati di errore:**
  - `useInvitation(token)` in caricamento → skeleton in un contenitore `aria-busy`;
  - errore `404` → stato "non valido"; errore con `status === 410` → stato "scaduto";
  - in entrambi: `PageHeading` con icona `LinkIcon`, titolo `invitation.invalidTitle` o `invitation.expiredTitle`, descrizione `invitation.invalid` o `invitation.expired`, poi il paragrafo `invitation.askHr` e il pulsante-link "Vai all'accesso" (`/login`);
  - altri errori (rete o 5xx) → `ServerErrorState` con retry.
- **Form:**
  - `PageHeading` con titolo `invitation.title` (con il nome) e descrizione;
  - email in sola lettura con lo stile attenuato di `ResetPasswordPage` (`bg-muted text-muted-foreground`, `autoComplete="username"`);
  - "Password" (`new-password`, descrizione `invitation.hint`, `register('password', { deps: 'confirmation' })`) e "Conferma password" (`new-password`);
  - checkbox shadcn `Checkbox` con label "Ho preso visione dell'informativa privacy" e, sotto, il link `invitation.privacyLink` a `/privacy` con `target="_blank" rel="noopener noreferrer"`;
  - pulsante "Attiva account".
- **Schema zod:**
  - `password`: `min(12, validation.passwordMin)`;
  - `confirmation`, con refine di uguaglianza (`validation.passwordMismatch`, sul campo `confirmation`);
  - `privacy`: `z.literal(true, { error: invitation.privacyRequired })`. Il valore del checkbox va collegato con `Controller` di react-hook-form, perché il `Checkbox` Radix non è un input nativo.
- **Invio:** `{ password, password_confirmation: confirmation, privacy_acknowledged: true }`.
- **Esiti:**
  - **successo:** `navigate('/login/verify', { replace: true, state: { email, invitationAccepted: true } })`;
  - **`422`:** `password` → errore sotto "Password" con focus; `privacy_acknowledged` → errore sotto il checkbox;
  - **`404` o `410`:** passa allo stato "non valido" o "scaduto", con focus sul titolo;
  - **`429`:** countdown come in `ResetPasswordPage` (`invitation.throttled`);
  - **rete o altro:** `Alert` destructive.

`src/pages/PrivacyPage.tsx`: `PageHeading` con `privacy.title`, il paragrafo `privacy.placeholder` e il link "Vai all'accesso".

`VerifyCodePage.tsx`:
- estendi lo schema dello stato di navigazione con `invitationAccepted: z.boolean().optional()`;
- quando vale `true` mostra l'avviso `verify.invitationAccepted`, con lo stesso stile e la stessa posizione dell'avviso `passwordReset` esistente.

`src/routes.tsx`:
- dentro il gruppo `GuestRoute` → `AuthLayout` aggiungi `{ path: '/invitation/:token', element: <AcceptInvitationPage />, handle: { titleKey: 'titles.invitation' } }`;
- aggiungi poi, fuori da `GuestRoute` e accanto alla 404, un ramo `{ element: <AuthLayout />, children: [{ path: '/privacy', element: <PrivacyPage />, handle: { titleKey: 'titles.privacy' } }] }`.

- [ ] **Step 5: Test e gate**

Run: `npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 6: Commit**

```bash
git add apps/react
git commit -m "feat(ui): attivazione dell'invito con informativa privacy e passaggio al codice"
```

---

## Task 13: E2E — invito, amministratori, disattivazione, WCAG e mobile

**Files:**
- Create: `apps/react/e2e/auth.ts`, `apps/react/e2e/admin-users.spec.ts`
- Modify: `apps/react/e2e/mailpit.ts`, `apps/react/CLAUDE.md`

**Interfaces:**
- Consumes: tutto il flusso (Task 1-12); Sail acceso con la coda; `sail artisan migrate` (nuove tabelle) e `sail artisan cache:clear` prima dell'esecuzione; utenti di sviluppo `admin@holidays.test` ed `employee@holidays.test` con password `holidays-dev-password`.
- Produces:
  - in `e2e/auth.ts`: `signIn(page: Page, email: string, password: string): Promise<void>` (login + codice da Mailpit fino alla home);
  - in `e2e/mailpit.ts`:
    - `waitForInvitationLink(email: string, timeoutMs?: number): Promise<string>`, che restituisce `/invitation/<token>`;
    - `waitForSubject(email: string, subject: RegExp, timeoutMs?: number): Promise<void>`.

- [ ] **Step 1: Helper**

`e2e/mailpit.ts`:
- aggiungi `Subject: z.string()` allo schema della lista;
- aggiungi:

```ts
/** Attende l'email di invito e ne estrae il percorso del link (l'host dipende da FRONTEND_URL). */
export const waitForInvitationLink = (email: string, timeoutMs = 20_000): Promise<string> =>
  waitForMatch(email, /https?:\/\/[^/\s]+(\/invitation\/[A-Za-z0-9]+)/, timeoutMs)

/** Attende un'email per `email` con l'oggetto indicato (es. l'avviso agli admin). */
export const waitForSubject = async (email: string, subject: RegExp, timeoutMs = 20_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const list = listSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json())
    if (list.messages.some((item) => item.To.some((to) => to.Address === email) && subject.test(item.Subject))) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Nessuna email "${subject.source}" per ${email}`)
}
```

`e2e/auth.ts`:

```ts
import { expect, type Page } from '@playwright/test'
import { waitForLoginCode } from './mailpit.ts'

/** Login completo con il codice letto da Mailpit. La casella va svuotata prima, se serve un codice nuovo. */
export const signIn = async (page: Page, email: string, password: string): Promise<void> => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(email))
  await expect(page.getByRole('heading', { name: /^Ciao, / })).toBeVisible()
}
```

- [ ] **Step 2: Spec**

`e2e/admin-users.spec.ts`:
- `test.describe.configure({ mode: 'serial' })`;
- **un solo login admin** per file, in `beforeAll` con un `BrowserContext` condiviso: il limite di login è 5 al minuto per email e IP, e `login.spec.ts` usa già lo stesso admin;
- prima del login `clearInbox()`;
- costanti: `ADMIN = 'admin@holidays.test'`, `EMPLOYEE = 'employee@holidays.test'`, `PASSWORD = 'holidays-dev-password'`, `NEW_USER = \`e2e-${Date.now()}@holidays.test\``.

**Test 1 — "an admin invites a user who activates the account and enters with the code"**
1. Sulla pagina admin: `/admin/users` → "Invita utente" → nome `E2E Invitato`, email `NEW_USER` → "Invia invito" → toast `Invito inviato a …`.
2. `waitForInvitationLink(NEW_USER)` → apri il link in un **nuovo contesto** (ospite).
3. Il titolo è "Benvenuto, E2E Invitato". Compila password e conferma (una frase unica), spunta l'informativa e premi "Attiva account".
4. Compare la pagina del codice con l'avviso "Account attivato…".
5. Codice da Mailpit → home "Ciao, E2E".
6. Tieni aperto il contesto del nuovo utente per il Test 3.

**Test 2 — "an admin promotes and revokes another admin, every admin is warned"**
1. Su `/admin/administrators` → "Aggiungi admin" → cerca `E2E` → scegli `E2E Invitato` → "La tua password" `PASSWORD` → "Rendi amministratore" → toast.
2. `waitForSubject(NEW_USER, /nuovo amministratore/)`.
3. "Revoca E2E Invitato" → nuovo ruolo Dipendente → password → conferma → toast "non è più amministratore".
4. `waitForSubject(NEW_USER, /revocato/)`.

**Test 3 — "disabling a user signs them out on the next request"**
1. Su `/admin/users?q=e2e-` → menu azioni di `E2E Invitato` → "Disattiva" → conferma → toast.
2. Nel contesto del nuovo utente: `page.reload()` → la pagina finisce su `/login` con l'avviso di sessione terminata o scaduta (accetta uno dei due testi del login).

**Test 4 — "admin pages have no WCAG violations in light and dark mode"**
- Riusa lo schema di `login.spec.ts`: `AxeBuilder` con i tag WCAG e `emulateMedia` chiaro e scuro, senza ricaricare. Pagine e stati da controllare:
  - `/admin/users`;
  - `/admin/users` con il dialog "Invita utente" aperto;
  - `/admin/administrators`;
  - `/privacy`;
  - `/invitation/token-inesistente`, nello stato non valido, da un contesto ospite.

**Test 5 — "employees see the forbidden page"**
1. Nuovo contesto: `signIn(page, EMPLOYEE, PASSWORD)`, con `clearInbox()` prima.
2. `goto('/admin/users')` → titolo "Non hai i permessi per questa pagina", niente link "Amministrazione" nel menu.
3. axe chiaro e scuro su questa pagina.

**Test 6 — "admin pages fit a phone screen and work with the keyboard"**
1. Viewport 360×740 → `/admin/users` e `/admin/administrators`: nessun overflow orizzontale (`document.documentElement.scrollWidth - window.innerWidth <= 0`).
2. Da tastiera, a 1280 px, su `/admin/users`:
   - `Tab` fino al pulsante "Azioni per Marco Bianchi" (utente di sviluppo `manager@holidays.test`; se non è in prima pagina, cercalo con `?q=marco`);
   - `Enter` apre il menu, le frecce scorrono le voci, `Escape` lo chiude e il focus torna sul pulsante.

**Pulizia:**
- l'utente `NEW_USER` resta disattivato: un account attivato non si può cancellare;
- ogni esecuzione aggiunge un utente `e2e-…` disattivato al database di sviluppo, ed è accettato;
- documentalo nel passo 4.

- [ ] **Step 3: Esecuzione**

Da `apps/laravel`: `sail artisan migrate` e `sail artisan cache:clear`. Poi da `apps/react`: `npm run test:e2e`.
Expected: tutti gli spec PASS (`login`, `password-reset`, `admin-users`).

Se un E2E rivela un bug dell'app (non del test), segnalalo nel report invece di correggerlo qui.

- [ ] **Step 4: Documentazione e commit**

`apps/react/CLAUDE.md`, nella riga di `npm run test:e2e`, aggiungi:
- `admin-users.spec.ts` crea a ogni esecuzione un utente `e2e-<timestamp>@holidays.test`, che resta disattivato;
- richiede `sail artisan migrate` dopo questa fase.

```bash
git add apps/react/e2e apps/react/CLAUDE.md
git commit -m "test(e2e): invito, amministratori, disattivazione, wcag e schermi piccoli"
```

---

## Verifica finale (dopo i task)

1. Gate completi, rilanciati dal controller:
   - backend: test, Larastan, Pint, `composer audit`;
   - frontend: test, lint, build, `npm audit`;
   - E2E completi.
2. Controllo visivo con Playwright a 360, 768 e 1280 px, in chiaro e in scuro:
   - `/admin/users` (lista e dialog);
   - `/admin/administrators`;
   - `/invitation/:token` (form, scaduto, non valido);
   - `/privacy`;
   - 403.
3. Code review dell'intero branch e security review della fase. Punti da guardare nella security review:
   - escalation di privilegi;
   - IDOR sulle rotte `{user}`;
   - token dell'invito;
   - limite di finalità;
   - email agli admin;
   - race sull'ultimo admin.

   Poi la correzione dei problemi trovati.
