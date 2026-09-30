# Fase 1 — Basi e login: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un dipendente attivo apre `http://localhost:5174`, accede con email + password + codice di 6 cifre ricevuto via email (Mailpit), vede l'area riservata e può uscire; il tutto in italiano/inglese, tema chiaro/scuro, accessibile.

**Architecture:** SPA React (Vite) e API Laravel sulla stessa origine grazie al proxy di Vite; sessione Sanctum in cookie `httpOnly`. Il login passa dalla pipeline di Fortify, con un passo custom che verifica le credenziali senza aprire la sessione e invia il codice; la verifica del codice è un controller nostro. Il frontend usa un client `fetch` unico, TanStack Query per lo stato server e componenti shadcn con i token del prototipo.

**Tech Stack:** Laravel 13.34 · PHP 8.5 · Sail · Fortify 1.40 · Sanctum 4 · PHPUnit · Larastan · React 19 · Vite 8 · TypeScript 6 · Tailwind 4.3 · shadcn 4.21 (Radix) · React Router 8.4 · TanStack Query 5 · react-hook-form 7 + zod 4 · i18next 26 · next-themes · Vitest 5 · MSW 3 · Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-30-fondamenta-autenticazione-design.md`

**Perimetro di questa fase:** §5 architettura, §6.2 login con codice, §6.4 (scadenze di sessione e logout, senza profilo e senza avviso di scadenza), §7.1 tabelle `users`/`login_challenges`/`auth_events`, §8 (limiti, credenziali, sessioni, header API), §9 (pagine `/login`, `/login/verify`, `/`, 404). Recupero password, inviti, gestione utenti, profilo, avviso di scadenza sessione, pulizia automatica e informativa privacy sono nelle fasi 2–4, ognuna con il proprio piano scritto dopo questa fase.

## Global Constraints

- Branch di lavoro: `feature/auth-fase-1` creato da `develop`. Commit piccoli, Conventional Commits in italiano (`tipo(scope): descrizione`), mai push.
- Comandi Laravel sempre da `apps/laravel` con `./vendor/bin/sail …` (in questo piano abbreviato `sail`); comandi frontend da `apps/react`.
- Identificatori in inglese; **commenti in italiano**; stringhe per l'utente solo tramite traduzioni (`lang/{it,en}` in Laravel, `src/locales/{it,en}.json` in React).
- Laravel: `env()` solo in `config/`; log con context array; niente `dd()`/`dump()`; output solo tramite API Resource; input tramite FormRequest; Enum backed in `app/Enums/`; dopo ogni modifica PHP `sail bin pint --dirty --format agent`.
- React: niente `any`, niente type assertion `as` (neanche `as const`: usare annotazioni di tipo), `interface` per le props, componenti arrow function, niente `console.*`, niente `dangerouslySetInnerHTML`, classi condizionali con `cn` da `@/lib/utils`, dati server solo con TanStack Query, risposte API validate con zod. `tsconfig` ha `erasableSyntaxOnly`: **niente `enum` TypeScript né parameter properties** nei costruttori.
- Lint React Hooks v7: vietato leggere/scrivere `ref.current` durante il render e chiamare `setState` in modo sincrono nel corpo di un `useEffect`.
- Tempi e limiti (spec §6.2, §8.1): codice valido **10 minuti**, **5** tentativi, nuovo codice dopo **60 s** e al massimo **3** volte; sessione inattiva **120 minuti** (`SESSION_LIFETIME=120`), assoluta **720 minuti** (`SESSION_ABSOLUTE_LIFETIME=720`); login **5/min per email+IP** e **20/min per IP**; endpoint del codice **10/min per IP**.
- Password: hash **Argon2id** (`HASH_DRIVER=argon2id`), bcrypt solo nei test per velocità.
- Stile (spec §9.2): accento Laguna (`--primary: hsl(177 72% 26%)` chiaro, `hsl(174 58% 48%)` scuro), font **Inter** da `@fontsource-variable/inter`, `--radius: 0.625rem`.
- Versioni: `laravel/fortify:^1.40`, `larastan/larastan:^3.12`, `laravel-lang/common:^6.8`; CLI `shadcn@4.21.0` (preset `nova`, base `radix`); `tailwindcss@4.3.3`, `react-router@8.4.0`, `i18next@26.4.2`, `react-i18next@17.0.15`, `react-hook-form@7.89.0`, `zod@4.6.5`, `@hookform/resolvers@5.9.1`, `@fontsource-variable/inter@5.3.0`, `vitest@5.0.3`, `jsdom@30.1.1`, `@testing-library/react@16.3.3`, `@testing-library/user-event@14.6.7`, `@testing-library/jest-dom@7.0.1`, `msw@3.0.1`, `@playwright/test@1.63.0`, `@axe-core/playwright@4.13.0`.

## Review Focus

1. **Email con spazi o maiuscole** (`"  Admin@Holidays.test "`, copiata da un'altra app): il login deve funzionare come con l'email pulita → test in Task 7.
2. **Codice incollato con spazi o trattino** (`"482 913"`, `"482-913"`, come lo formattano alcuni client email): va accettato → test in Task 16.
3. **Refresh della pagina del codice** (lo stato di navigazione con l'email si perde): la pagina resta usabile con un testo generico → test in Task 16.
4. **Doppio invio del codice** (auto-invio al sesto numero + Invio o doppio click): una sola richiesta, nessun tentativo bruciato → test in Task 16.
5. **Sessione scaduta mentre si usa l'app** (un 401 da una richiesta qualsiasi): si torna al login con l'avviso "Sessione scaduta" e il ritorno alla pagina di partenza → test in Task 13 e Task 14.

## Struttura dei file

**Laravel (`apps/laravel`)**

| File | Responsabilità |
|---|---|
| `phpstan.neon` | Configurazione Larastan |
| `database/migrations/0001_01_01_000000_create_users_table.php` | Tabella `users` (modificata) |
| `database/migrations/*_create_auth_events_table.php` · `*_create_login_challenges_table.php` | Nuove tabelle |
| `app/Enums/{Role,UserStatus,AuthEventType,ChallengeResult}.php` | Enum di dominio |
| `app/Models/{User,AuthEvent,LoginChallenge}.php` | Model |
| `app/Support/Translate.php` | Traduzione tipizzata `string` |
| `app/Support/AuthSession.php` | Chiavi di sessione e chiusura sessione |
| `app/Support/UserAgentSummary.php` | "Chrome su macOS" per l'email |
| `app/Services/{AuthEventLogger,LoginChallengeService}.php` | Log di sicurezza; ciclo di vita del codice |
| `app/Actions/Fortify/StartEmailLoginChallenge.php` | Passo della pipeline di login |
| `app/Mail/LoginCodeMail.php` + `resources/views/mail/auth/login-code.blade.php` | Email con il codice |
| `app/Http/Controllers/Auth/{CurrentUserController,TwoFactorChallengeController}.php` | Utente corrente; verifica e reinvio del codice |
| `app/Http/Requests/Auth/TwoFactorCodeRequest.php` | Validazione del codice |
| `app/Http/Resources/UserResource.php` | Output utente |
| `app/Http/Middleware/{SetLocale,SecurityHeaders,EnsureUserIsActive,EnforceAbsoluteSessionLifetime}.php` | Middleware |
| `app/Listeners/LogSuccessfulLogout.php` | Evento `logged_out` |
| `app/Providers/FortifyServiceProvider.php` + `config/fortify.php` | Fortify headless e rate limiter |
| `database/seeders/DevUserSeeder.php` | Utenti di prova (solo `local`) |
| `lang/{it,en}/{enums,login}.php` | Traduzioni nostre |
| `tests/Concerns/CompletesLogin.php` | Helper di login nei test |

**React (`apps/react`)**

| File | Responsabilità |
|---|---|
| `src/index.css` | Tailwind, token Laguna chiaro/scuro, font |
| `src/components/ui/*` | Componenti shadcn (generati, alcuni ritoccati) |
| `src/lib/{api,queryClient,queryKeys,i18n,safeRedirect,routeTitle,initials,appName,utils}.ts` | Infrastruttura |
| `src/locales/{it,en}.json` | Traduzioni |
| `src/hooks/useCountdown.ts` | Conto alla rovescia |
| `src/components/brand/Logo.tsx` | Logo |
| `src/components/preferences/{LanguageMenu,ThemeMenu}.tsx` | Lingua e tema |
| `src/components/layout/{AuthLayout,TeamCalendar,AppShell,RootLayout,RouteAnnouncer,PageHeading,SkipLink,FullPageLoader,ServerErrorState}.tsx` | Layout |
| `src/components/PasswordInput.tsx` | Campo password con "mostra" |
| `src/features/auth/api.ts` | Schemi zod e hook di autenticazione |
| `src/features/auth/{ProtectedRoute,GuestRoute}.tsx` | Protezione delle route |
| `src/features/auth/pages/{LoginPage,VerifyCodePage}.tsx` | Pagine di accesso |
| `src/pages/{HomePage,NotFoundPage}.tsx` | Pagine |
| `src/routes.tsx` · `src/main.tsx` | Router e bootstrap |
| `src/test/{setup,server,render,axe,fixtures}.ts(x)` | Infrastruttura test |
| `e2e/{mailpit,login.spec}.ts` · `playwright.config.ts` | Test end-to-end |

---

## Task 1: Strumenti backend — Larastan e traduzioni it/en

**Files:**
- Create: `apps/laravel/phpstan.neon`
- Modify: `apps/laravel/composer.json` (via composer + script `analyse`)
- Create: `apps/laravel/lang/en/*`, `apps/laravel/lang/it/*`, `apps/laravel/lang/it.json` (via artisan)

**Interfaces:**
- Produces: comando `sail composer analyse`; file di traduzione del framework in `lang/it` e `lang/en`.

- [ ] **Step 1: Crea il branch e verifica la base**

```bash
cd /Users/alessandro/Progetti/GitHub/holidays
git switch develop && git switch -c feature/auth-fase-1
cd apps/laravel
./vendor/bin/sail up -d
./vendor/bin/sail artisan test --compact
```
Expected: 2 test passati (gli `ExampleTest` dello skeleton).

- [ ] **Step 2: Installa Larastan e laravel-lang**

```bash
./vendor/bin/sail composer require --dev larastan/larastan:^3.12 laravel-lang/common:^6.8
```

- [ ] **Step 3: Configura Larastan**

`apps/laravel/phpstan.neon`:
```neon
includes:
    - vendor/larastan/larastan/extension.neon

parameters:
    paths:
        - app
        - config
        - database
        - routes
    level: 6
```

In `composer.json`, dentro `"scripts"`, aggiungi:
```json
"analyse": "phpstan analyse --memory-limit=1G"
```

- [ ] **Step 4: Esegui l'analisi**

Run: `./vendor/bin/sail composer analyse`
Expected: `[OK] No errors`. Se lo skeleton segnala errori, correggili nel codice (niente baseline, niente `ignoreErrors`).

- [ ] **Step 5: Pubblica le traduzioni**

```bash
./vendor/bin/sail artisan lang:publish
./vendor/bin/sail artisan lang:add it
./vendor/bin/sail artisan tinker --execute 'echo __("auth.failed", [], "it");'
```
Expected: una frase in italiano (non "These credentials do not match our records.").

- [ ] **Step 6: Commit**

```bash
git add -A apps/laravel
git commit -m "build(laravel): aggiungi larastan e traduzioni it/en"
```

---

## Task 2: Utenti — schema, enum, model, resource, seeder di sviluppo

**Files:**
- Modify: `apps/laravel/database/migrations/0001_01_01_000000_create_users_table.php`
- Create: `apps/laravel/app/Enums/Role.php`, `apps/laravel/app/Enums/UserStatus.php`
- Create: `apps/laravel/app/Support/Translate.php`
- Modify: `apps/laravel/app/Models/User.php`, `apps/laravel/database/factories/UserFactory.php`
- Create: `apps/laravel/app/Http/Resources/UserResource.php`
- Create: `apps/laravel/lang/it/enums.php`, `apps/laravel/lang/en/enums.php`
- Create: `apps/laravel/database/seeders/DevUserSeeder.php`; Modify: `apps/laravel/database/seeders/DatabaseSeeder.php`
- Modify: `apps/laravel/.env`, `apps/laravel/.env.example`, `apps/laravel/phpunit.xml`
- Test: `apps/laravel/tests/Feature/Users/UserModelTest.php`

**Interfaces:**
- Produces: `App\Enums\Role` (`Employee='employee'`, `Manager='manager'`, `Admin='admin'`, `label(): string`); `App\Enums\UserStatus` (`Invited`, `Active`, `Disabled`, `label(): string`); `App\Support\Translate::text(string $key, array<string, string|int> $replace = []): string`; `User::isActive(): bool`, `User::isAdmin(): bool`, `User::preferredLocale(): string`; factory states `admin()`, `manager()`, `invited()`, `disabled()`; `UserResource` con chiavi `id, name, email, role, role_label, status, locale, last_login_at`; `DevUserSeeder::PASSWORD = 'holidays-dev-password'` e utenti `admin@holidays.test` (Giulia Rossi, admin), `manager@holidays.test`, `employee@holidays.test`, `disabled@holidays.test`, `invited@holidays.test`.

- [ ] **Step 1: Scrivi il test**

`apps/laravel/tests/Feature/Users/UserModelTest.php`:
```php
<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class UserModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_factory_creates_an_active_employee_with_italian_locale(): void
    {
        $user = User::factory()->create();

        $this->assertSame(Role::Employee, $user->role);
        $this->assertSame(UserStatus::Active, $user->status);
        $this->assertSame('it', $user->preferredLocale());
        $this->assertTrue($user->isActive());
        $this->assertFalse($user->isAdmin());
    }

    public function test_invited_users_have_no_password_and_are_not_active(): void
    {
        $user = User::factory()->invited()->create();

        $this->assertNull($user->password);
        $this->assertNull($user->email_verified_at);
        $this->assertFalse($user->isActive());
    }

    public function test_role_labels_are_translated(): void
    {
        app()->setLocale('it');
        $this->assertSame('HR / Admin', Role::Admin->label());

        app()->setLocale('en');
        $this->assertSame('Manager', Role::Manager->label());
    }

    public function test_resource_exposes_only_public_fields(): void
    {
        $user = User::factory()->admin()->create(['last_login_at' => now()]);

        $data = (new UserResource($user))->toArray(Request::create('/'));

        $this->assertSame(
            ['id', 'name', 'email', 'role', 'role_label', 'status', 'locale', 'last_login_at'],
            array_keys($data),
        );
        $this->assertSame('admin', $data['role']);
        $this->assertSame('active', $data['status']);
    }
}
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `./vendor/bin/sail artisan test --compact --filter=UserModelTest`
Expected: FAIL (`Class "App\Enums\Role" not found`).

- [ ] **Step 3: Modifica la migration `users`**

Sostituisci il blocco `Schema::create('users', …)` in `0001_01_01_000000_create_users_table.php` (siamo pre-produzione, si modifica la migration iniziale):
```php
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->string('role', 20)->default('employee');
            $table->string('status', 20)->default('invited')->index();
            $table->string('locale', 5)->default('it');
            $table->timestamp('email_verified_at')->nullable();
            $table->string('privacy_notice_version', 20)->nullable();
            $table->timestamp('privacy_notice_acknowledged_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });
```
Le tabelle `password_reset_tokens` e `sessions` nello stesso file restano invariate.

- [ ] **Step 4: Crea il traduttore tipizzato e gli enum**

`apps/laravel/app/Support/Translate.php`:
```php
<?php

namespace App\Support;

/**
 * Traduzione garantita come stringa: `__()` può restituire un array se la chiave punta a un gruppo.
 */
final class Translate
{
    /**
     * @param  array<string, string|int>  $replace
     */
    public static function text(string $key, array $replace = []): string
    {
        $value = __($key, $replace);

        return is_string($value) ? $value : $key;
    }
}
```

`apps/laravel/app/Enums/Role.php`:
```php
<?php

namespace App\Enums;

use App\Support\Translate;

enum Role: string
{
    case Employee = 'employee';
    case Manager = 'manager';
    case Admin = 'admin';

    public function label(): string
    {
        return Translate::text('enums.role.'.$this->value);
    }
}
```

`apps/laravel/app/Enums/UserStatus.php`:
```php
<?php

namespace App\Enums;

use App\Support\Translate;

enum UserStatus: string
{
    case Invited = 'invited';
    case Active = 'active';
    case Disabled = 'disabled';

    public function label(): string
    {
        return Translate::text('enums.user_status.'.$this->value);
    }
}
```

`apps/laravel/lang/it/enums.php`:
```php
<?php

return [
    'role' => [
        'employee' => 'Dipendente',
        'manager' => 'Responsabile',
        'admin' => 'HR / Admin',
    ],
    'user_status' => [
        'invited' => 'Invitato',
        'active' => 'Attivo',
        'disabled' => 'Disattivato',
    ],
];
```

`apps/laravel/lang/en/enums.php`:
```php
<?php

return [
    'role' => [
        'employee' => 'Employee',
        'manager' => 'Manager',
        'admin' => 'HR / Admin',
    ],
    'user_status' => [
        'invited' => 'Invited',
        'active' => 'Active',
        'disabled' => 'Disabled',
    ],
];
```

- [ ] **Step 5: Aggiorna model e factory**

`apps/laravel/app/Models/User.php` (file completo):
```php
<?php

namespace App\Models;

use App\Enums\Role;
use App\Enums\UserStatus;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'role', 'status', 'locale'])]
#[Hidden(['password'])]
class User extends Authenticatable implements HasLocalePreference
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'privacy_notice_acknowledged_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'status' => UserStatus::class,
        ];
    }

    /**
     * Lingua usata da Laravel per email e notifiche indirizzate all'utente.
     */
    public function preferredLocale(): string
    {
        return $this->locale;
    }

    public function isActive(): bool
    {
        return $this->status === UserStatus::Active;
    }

    public function isAdmin(): bool
    {
        return $this->role === Role::Admin;
    }
}
```

`apps/laravel/database/factories/UserFactory.php` (file completo):
```php
<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => Role::Employee,
            'status' => UserStatus::Active,
            'locale' => 'it',
        ];
    }

    public function admin(): static
    {
        return $this->state(fn (array $attributes): array => ['role' => Role::Admin]);
    }

    public function manager(): static
    {
        return $this->state(fn (array $attributes): array => ['role' => Role::Manager]);
    }

    public function invited(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => UserStatus::Invited,
            'password' => null,
            'email_verified_at' => null,
        ]);
    }

    public function disabled(): static
    {
        return $this->state(fn (array $attributes): array => ['status' => UserStatus::Disabled]);
    }
}
```

- [ ] **Step 6: Crea la Resource**

`apps/laravel/app/Http/Resources/UserResource.php`:
```php
<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'status' => $this->status->value,
            'locale' => $this->locale,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
        ];
    }
}
```

- [ ] **Step 7: Seeder di sviluppo**

`apps/laravel/database/seeders/DevUserSeeder.php`:
```php
<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Utenti di prova per lo sviluppo locale: finché non esistono gli inviti è l'unico modo per accedere.
 */
class DevUserSeeder extends Seeder
{
    public const PASSWORD = 'holidays-dev-password';

    public function run(): void
    {
        User::factory()->admin()->create(['name' => 'Giulia Rossi', 'email' => 'admin@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->manager()->create(['name' => 'Marco Bianchi', 'email' => 'manager@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->create(['name' => 'Sara Colombo', 'email' => 'employee@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->disabled()->create(['name' => 'Elena Romano', 'email' => 'disabled@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->invited()->create(['name' => 'Luca Ferrari', 'email' => 'invited@holidays.test']);
    }
}
```

In `apps/laravel/database/seeders/DatabaseSeeder.php` sostituisci il corpo di `run()` e rimuovi l'import di `User`:
```php
    public function run(): void
    {
        if (app()->isLocal()) {
            $this->call(DevUserSeeder::class);
        }
    }
```

- [ ] **Step 8: Hash Argon2id**

Verifica il supporto nel container:
Run: `./vendor/bin/sail php -r "var_dump(defined('PASSWORD_ARGON2ID'));"`
Expected: `bool(true)` (se `false`, usa `HASH_DRIVER=bcrypt` e annotalo nel commit).

In `apps/laravel/.env` e `apps/laravel/.env.example`, subito dopo `BCRYPT_ROUNDS=12`, aggiungi:
```env
HASH_DRIVER=argon2id
```
In `apps/laravel/phpunit.xml`, dentro `<php>`, aggiungi (bcrypt a 4 round tiene veloci i test):
```xml
        <env name="HASH_DRIVER" value="bcrypt"/>
```

- [ ] **Step 9: Esegui migration, seeder e test**

```bash
./vendor/bin/sail artisan migrate:fresh --seed
./vendor/bin/sail artisan test --compact --filter=UserModelTest
```
Expected: migration senza errori, 5 utenti creati, 4 test PASS.

- [ ] **Step 10: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(users): ruoli, stati e preferenza lingua degli utenti"
```

---

## Task 3: Sanctum SPA, Fortify headless ed endpoint dell'utente corrente

**Files:**
- Modify: `apps/laravel/composer.json` (via composer)
- Create: `apps/laravel/config/fortify.php` (pubblicato e modificato)
- Create: `apps/laravel/app/Providers/FortifyServiceProvider.php`; Modify: `apps/laravel/bootstrap/providers.php`
- Modify: `apps/laravel/bootstrap/app.php`, `apps/laravel/routes/api.php`, `apps/laravel/config/app.php`
- Create: `apps/laravel/app/Http/Controllers/Auth/CurrentUserController.php`
- Modify: `apps/laravel/.env`, `apps/laravel/.env.example`, `apps/laravel/phpunit.xml`, `apps/laravel/tests/TestCase.php`
- Test: `apps/laravel/tests/Feature/Auth/CurrentUserTest.php`

**Interfaces:**
- Consumes: `UserResource` (Task 2).
- Produces: `GET /api/auth/user` (route `auth.user`, `auth:sanctum`); rotte Fortify `POST /api/auth/login` (`login.store`, middleware `web` + `guest` + `throttle:login`) e `POST /api/auth/logout` (`logout`); rate limiter `login`; `config('app.frontend_url')`, `config('app.display_timezone')`; `TestCase::fromFrontend(): static` (header `Origin`/`Referer` = `http://localhost:5174`).

- [ ] **Step 1: Scrivi il test**

`apps/laravel/tests/Feature/Auth/CurrentUserTest.php`:
```php
<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CurrentUserTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_receive_a_json_401(): void
    {
        $this->getJson('/api/auth/user')
            ->assertUnauthorized()
            ->assertJsonStructure(['message']);
    }

    public function test_authenticated_users_receive_their_own_resource(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonMissingPath('data.password');
    }

    public function test_fortify_routes_live_under_api_auth(): void
    {
        $this->assertSame(url('/api/auth/login'), route('login.store'));
        $this->assertSame(url('/api/auth/logout'), route('logout'));
    }
}
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `./vendor/bin/sail artisan test --compact --filter=CurrentUserTest`
Expected: FAIL (404 su `/api/auth/user`, route `login.store` inesistente).

- [ ] **Step 3: Installa Fortify e pubblica solo la configurazione**

```bash
./vendor/bin/sail composer require laravel/fortify:^1.40
./vendor/bin/sail artisan vendor:publish --tag=fortify-config
```
Non eseguire `fortify:install`: pubblicherebbe azioni e migration (2FA TOTP, passkey) che in questa fase non servono.

In `apps/laravel/config/fortify.php` imposta queste chiavi (le altre restano come pubblicate):
```php
    'views' => false,

    'home' => '/',

    'prefix' => 'api/auth',

    'lowercase_usernames' => true,

    'limiters' => [
        'login' => 'login',
        'passkeys' => null,
    ],

    // Nessuna feature Fortify attiva: il secondo fattore via email è nostro,
    // il reset password arriva nella fase 2, TOTP e passkey nel sotto-progetto 2.
    'features' => [],
```

- [ ] **Step 4: Service provider di Fortify con il rate limiter del login**

`apps/laravel/app/Providers/FortifyServiceProvider.php`:
```php
<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class FortifyServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request): array {
            $email = Str::lower($request->string('email')->trim()->value());

            return [
                Limit::perMinute(5)->by('login:'.$email.'|'.$request->ip()),
                Limit::perMinute(20)->by('login-ip:'.$request->ip()),
            ];
        });
    }
}
```

`apps/laravel/bootstrap/providers.php`:
```php
<?php

use App\Providers\AppServiceProvider;
use App\Providers\FortifyServiceProvider;

return [
    AppServiceProvider::class,
    FortifyServiceProvider::class,
];
```

- [ ] **Step 5: Sanctum stateful e redirect**

In `apps/laravel/bootstrap/app.php` sostituisci il blocco `withMiddleware`:
```php
    ->withMiddleware(function (Middleware $middleware): void {
        // La SPA sulla stessa origine usa la sessione in cookie (Sanctum SPA)
        $middleware->statefulApi();
        $middleware->redirectGuestsTo('/login');
        $middleware->redirectUsersTo('/');
    })
```

- [ ] **Step 6: Endpoint dell'utente corrente**

`apps/laravel/app/Http/Controllers/Auth/CurrentUserController.php`:
```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CurrentUserController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        // Stato esplicito: senza, un utente appena creato risponderebbe 201
        return (new UserResource($request->user()))->response()->setStatusCode(Response::HTTP_OK);
    }
}
```

`apps/laravel/routes/api.php` (file completo, sostituisce la route `/user` dello skeleton):
```php
<?php

use App\Http\Controllers\Auth\CurrentUserController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/user', CurrentUserController::class)->name('auth.user');
});
```

- [ ] **Step 7: Configurazione e ambiente**

In `apps/laravel/config/app.php`, subito dopo la chiave `'url'`, aggiungi:
```php
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),

    'display_timezone' => env('APP_DISPLAY_TIMEZONE', 'Europe/Rome'),
```

In `apps/laravel/.env` aggiungi dopo `APP_URL`:
```env
FRONTEND_URL=http://localhost:5174
SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:5174
```
In `apps/laravel/.env.example` aggiungi dopo `APP_URL`:
```env
FRONTEND_URL=http://localhost:5173
SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:5174
```
In `apps/laravel/phpunit.xml`, dentro `<php>`:
```xml
        <env name="SANCTUM_STATEFUL_DOMAINS" value="localhost:5174"/>
```

`apps/laravel/tests/TestCase.php` (file completo):
```php
<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Simula una richiesta della SPA: Sanctum avvia la sessione anche sulle rotte API.
     */
    protected function fromFrontend(): static
    {
        return $this->withHeaders([
            'Origin' => 'http://localhost:5174',
            'Referer' => 'http://localhost:5174/',
        ]);
    }
}
```

- [ ] **Step 8: Esegui i test**

Run: `./vendor/bin/sail artisan test --compact`
Expected: tutti PASS (`CurrentUserTest` 3 test).

- [ ] **Step 9: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(auth): sanctum spa, fortify headless ed endpoint utente corrente"
```

---

## Task 4: Lingua della richiesta e header di sicurezza

**Files:**
- Create: `apps/laravel/app/Http/Middleware/SetLocale.php`, `apps/laravel/app/Http/Middleware/SecurityHeaders.php`
- Modify: `apps/laravel/bootstrap/app.php`
- Test: `apps/laravel/tests/Feature/Http/SetLocaleTest.php`, `apps/laravel/tests/Feature/Http/SecurityHeadersTest.php`

**Interfaces:**
- Produces: `SetLocale::SUPPORTED = ['it', 'en']`; lingua della richiesta = `user.locale` → `Accept-Language` → `it`. Header di sicurezza su ogni risposta.

- [ ] **Step 1: Scrivi i test**

`apps/laravel/tests/Feature/Http/SetLocaleTest.php`:
```php
<?php

namespace Tests\Feature\Http;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class SetLocaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('api')->get('/api/testing/locale', fn () => response()->json(['locale' => app()->getLocale()]));
    }

    public function test_defaults_to_italian_without_a_header(): void
    {
        $this->getJson('/api/testing/locale')->assertJsonPath('locale', 'it');
    }

    public function test_uses_a_supported_accept_language(): void
    {
        $this->getJson('/api/testing/locale', ['Accept-Language' => 'en-GB,en;q=0.9'])->assertJsonPath('locale', 'en');
    }

    public function test_ignores_unsupported_languages(): void
    {
        $this->getJson('/api/testing/locale', ['Accept-Language' => 'de-DE,de;q=0.9'])->assertJsonPath('locale', 'it');
    }

    public function test_user_preference_wins_over_the_header(): void
    {
        $user = User::factory()->create(['locale' => 'en']);

        $this->actingAs($user)
            ->getJson('/api/testing/locale', ['Accept-Language' => 'it'])
            ->assertJsonPath('locale', 'en');
    }
}
```

`apps/laravel/tests/Feature/Http/SecurityHeadersTest.php`:
```php
<?php

namespace Tests\Feature\Http;

use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    public function test_api_responses_carry_security_headers(): void
    {
        $response = $this->getJson('/api/auth/user');

        $response->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeader('Permissions-Policy')
            ->assertHeaderMissing('Strict-Transport-Security');

        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }
}
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `./vendor/bin/sail artisan test --compact --filter='SetLocaleTest|SecurityHeadersTest'`
Expected: FAIL (lingua `en` non applicata, header mancanti).

- [ ] **Step 3: Implementa i middleware**

`apps/laravel/app/Http/Middleware/SetLocale.php`:
```php
<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lingua della richiesta: preferenza dell'utente, poi Accept-Language, poi italiano.
 */
final class SetLocale
{
    /** @var list<string> */
    public const SUPPORTED = ['it', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $locale = $user instanceof User ? $user->locale : null;

        if (! in_array($locale, self::SUPPORTED, true)) {
            // Con lingue non supportate Symfony restituisce la prima della lista: 'it'
            $locale = $request->getPreferredLanguage(self::SUPPORTED) ?? self::SUPPORTED[0];
        }

        App::setLocale($locale);

        return $next($request);
    }
}
```

`apps/laravel/app/Http/Middleware/SecurityHeaders.php`:
```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $headers = $response->headers;

        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

        if ($request->is('api/*')) {
            // Le risposte API contengono dati personali: mai in cache
            $headers->set('Cache-Control', 'no-store, private');
        }

        if (app()->isProduction()) {
            $headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
```

In `apps/laravel/bootstrap/app.php` aggiungi gli import `use App\Http\Middleware\SecurityHeaders;` e `use App\Http\Middleware\SetLocale;` e completa il blocco `withMiddleware`:
```php
    ->withMiddleware(function (Middleware $middleware): void {
        // La SPA sulla stessa origine usa la sessione in cookie (Sanctum SPA)
        $middleware->statefulApi();
        $middleware->redirectGuestsTo('/login');
        $middleware->redirectUsersTo('/');
        $middleware->append(SecurityHeaders::class);
        $middleware->appendToGroup('web', SetLocale::class);
        $middleware->appendToGroup('api', SetLocale::class);
    })
```

- [ ] **Step 4: Esegui i test**

Run: `./vendor/bin/sail artisan test --compact`
Expected: tutti PASS.

- [ ] **Step 5: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(http): lingua della richiesta e header di sicurezza"
```

---

## Task 5: Log degli eventi di sicurezza

**Files:**
- Create: migration `create_auth_events_table` (via artisan)
- Create: `apps/laravel/app/Enums/AuthEventType.php`, `apps/laravel/app/Models/AuthEvent.php`, `apps/laravel/app/Services/AuthEventLogger.php`
- Test: `apps/laravel/tests/Feature/Auth/AuthEventLoggerTest.php`

**Interfaces:**
- Produces: `App\Enums\AuthEventType` (valori `login_succeeded`, `login_failed`, `code_failed`, `locked_out`, `invitation_sent`, `invitation_accepted`, `password_reset`, `password_changed`, `user_disabled`, `user_enabled`, `logged_out`); `AuthEventLogger::log(AuthEventType $type, Request $request, ?User $user = null): void`.

- [ ] **Step 1: Scrivi il test**

`apps/laravel/tests/Feature/Auth/AuthEventLoggerTest.php`:
```php
<?php

namespace Tests\Feature\Auth;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\User;
use App\Services\AuthEventLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class AuthEventLoggerTest extends TestCase
{
    use RefreshDatabase;

    public function test_logs_the_event_with_request_context(): void
    {
        $user = User::factory()->create();
        $request = Request::create('/', 'POST', server: [
            'REMOTE_ADDR' => '203.0.113.7',
            'HTTP_USER_AGENT' => str_repeat('a', 400),
        ]);

        app(AuthEventLogger::class)->log(AuthEventType::LoginSucceeded, $request, $user);

        $event = AuthEvent::query()->sole();
        $this->assertSame(AuthEventType::LoginSucceeded, $event->event);
        $this->assertSame($user->id, $event->user_id);
        $this->assertSame('203.0.113.7', $event->ip_address);
        $this->assertSame(255, mb_strlen((string) $event->user_agent));
        $this->assertNotNull($event->created_at);
    }

    public function test_logs_events_without_a_user(): void
    {
        app(AuthEventLogger::class)->log(AuthEventType::LoginFailed, Request::create('/', 'POST'));

        $this->assertNull(AuthEvent::query()->sole()->user_id);
    }
}
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `./vendor/bin/sail artisan test --compact --filter=AuthEventLoggerTest`
Expected: FAIL (`Class "App\Enums\AuthEventType" not found`).

- [ ] **Step 3: Migration**

Run: `./vendor/bin/sail artisan make:migration create_auth_events_table --no-interaction`

Nel file creato, corpo di `up()`:
```php
        Schema::create('auth_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event', 40);
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('created_at')->index();
        });
```
e di `down()`: `Schema::dropIfExists('auth_events');`

- [ ] **Step 4: Enum, model e servizio**

`apps/laravel/app/Enums/AuthEventType.php`:
```php
<?php

namespace App\Enums;

enum AuthEventType: string
{
    case LoginSucceeded = 'login_succeeded';
    case LoginFailed = 'login_failed';
    case CodeFailed = 'code_failed';
    case LockedOut = 'locked_out';
    case InvitationSent = 'invitation_sent';
    case InvitationAccepted = 'invitation_accepted';
    case PasswordReset = 'password_reset';
    case PasswordChanged = 'password_changed';
    case UserDisabled = 'user_disabled';
    case UserEnabled = 'user_enabled';
    case LoggedOut = 'logged_out';
}
```

`apps/laravel/app/Models/AuthEvent.php`:
```php
<?php

namespace App\Models;

use App\Enums\AuthEventType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Evento di sicurezza. Serve solo alla sicurezza (art. 32 GDPR), mai al controllo dell'attività lavorativa.
 */
#[Fillable(['user_id', 'event', 'ip_address', 'user_agent'])]
class AuthEvent extends Model
{
    public const UPDATED_AT = null;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['event' => AuthEventType::class];
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

`apps/laravel/app/Services/AuthEventLogger.php`:
```php
<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class AuthEventLogger
{
    public function log(AuthEventType $type, Request $request, ?User $user = null): void
    {
        AuthEvent::query()->create([
            'user_id' => $user?->id,
            'event' => $type,
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 255, ''),
        ]);
    }
}
```

- [ ] **Step 5: Esegui migration e test**

```bash
./vendor/bin/sail artisan migrate
./vendor/bin/sail artisan test --compact --filter=AuthEventLoggerTest
```
Expected: 2 PASS.

- [ ] **Step 6: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(auth): registro degli eventi di sicurezza"
```

---

## Task 6: Ciclo di vita del codice di accesso

**Files:**
- Create: migration `create_login_challenges_table`
- Create: `apps/laravel/app/Models/LoginChallenge.php`, `apps/laravel/app/Enums/ChallengeResult.php`, `apps/laravel/app/Services/LoginChallengeService.php`
- Test: `apps/laravel/tests/Feature/Auth/LoginChallengeServiceTest.php`

**Interfaces:**
- Produces: `ChallengeResult` (`Valid`, `Invalid`, `Expired`, `Locked`); `LoginChallengeService` con costanti `TTL_MINUTES = 10`, `MAX_ATTEMPTS = 5`, `MAX_RESENDS = 3`, `RESEND_COOLDOWN_SECONDS = 60` e metodi `start(User $user): array{0: LoginChallenge, 1: string}`, `verify(LoginChallenge $challenge, string $code): ChallengeResult`, `attemptsLeft(LoginChallenge $challenge): int`, `secondsUntilResend(LoginChallenge $challenge): int`, `canResend(LoginChallenge $challenge): bool`, `resend(LoginChallenge $challenge): string`. `LoginChallenge::user(): BelongsTo`.

- [ ] **Step 1: Scrivi il test**

`apps/laravel/tests/Feature/Auth/LoginChallengeServiceTest.php`:
```php
<?php

namespace Tests\Feature\Auth;

use App\Enums\ChallengeResult;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\LoginChallengeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginChallengeServiceTest extends TestCase
{
    use RefreshDatabase;

    private LoginChallengeService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(LoginChallengeService::class);
    }

    public function test_start_creates_a_six_digit_code_stored_only_as_a_hash(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();

        [$challenge, $code] = $this->service->start($user);

        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);
        $this->assertSame(64, strlen($challenge->code_hash));
        $this->assertNotSame($code, $challenge->code_hash);
        $this->assertTrue($challenge->expires_at->equalTo(now()->addMinutes(10)));
    }

    public function test_start_replaces_previous_challenges_of_the_same_user(): void
    {
        $user = User::factory()->create();

        $this->service->start($user);
        $this->service->start($user);

        $this->assertSame(1, LoginChallenge::query()->where('user_id', $user->id)->count());
    }

    public function test_a_valid_code_is_accepted_once(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        $this->assertSame(ChallengeResult::Valid, $this->service->verify($challenge, $code));
        $this->assertModelMissing($challenge);
    }

    public function test_a_wrong_code_counts_as_an_attempt(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        $this->assertSame(ChallengeResult::Invalid, $this->service->verify($challenge, $this->wrongCode($code)));
        $this->assertSame(4, $this->service->attemptsLeft($challenge->fresh()));
    }

    public function test_the_fifth_wrong_code_locks_the_challenge(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        for ($i = 0; $i < 4; $i++) {
            $this->assertSame(ChallengeResult::Invalid, $this->service->verify($challenge, $this->wrongCode($code)));
        }

        $this->assertSame(ChallengeResult::Locked, $this->service->verify($challenge, $this->wrongCode($code)));
        $this->assertModelMissing($challenge);
    }

    public function test_an_expired_challenge_cannot_be_used(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        $this->travel(11)->minutes();

        $this->assertSame(ChallengeResult::Expired, $this->service->verify($challenge, $code));
        $this->assertModelMissing($challenge);
    }

    public function test_resend_waits_sixty_seconds_and_replaces_the_code(): void
    {
        $this->freezeTime();
        [$challenge, $first] = $this->service->start(User::factory()->create());

        $this->assertSame(60, $this->service->secondsUntilResend($challenge));

        $this->travel(61)->seconds();
        $this->assertSame(0, $this->service->secondsUntilResend($challenge));

        $second = $this->service->resend($challenge);
        $challenge->refresh();

        $this->assertSame(1, $challenge->resend_count);
        $this->assertSame(0, $challenge->attempts);
        if ($first !== $second) {
            $this->assertSame(ChallengeResult::Invalid, $this->service->verify($challenge, $first));
        }
        $this->assertSame(ChallengeResult::Valid, $this->service->verify($challenge->fresh(), $second));
    }

    public function test_resend_is_allowed_three_times(): void
    {
        [$challenge] = $this->service->start(User::factory()->create());

        for ($i = 0; $i < 3; $i++) {
            $this->assertTrue($this->service->canResend($challenge));
            $this->service->resend($challenge);
            $challenge->refresh();
        }

        $this->assertFalse($this->service->canResend($challenge));
    }

    private function wrongCode(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }
}
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `./vendor/bin/sail artisan test --compact --filter=LoginChallengeServiceTest`
Expected: FAIL (`Class "App\Enums\ChallengeResult" not found`).

- [ ] **Step 3: Migration**

Run: `./vendor/bin/sail artisan make:migration create_login_challenges_table --no-interaction`

Corpo di `up()`:
```php
        Schema::create('login_challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('code_hash', 64);
            $table->timestamp('expires_at');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->unsignedTinyInteger('resend_count')->default(0);
            $table->timestamp('last_sent_at');
            $table->timestamps();
        });
```
Corpo di `down()`: `Schema::dropIfExists('login_challenges');`

- [ ] **Step 4: Enum, model e servizio**

`apps/laravel/app/Enums/ChallengeResult.php`:
```php
<?php

namespace App\Enums;

enum ChallengeResult
{
    case Valid;
    case Invalid;
    case Expired;
    case Locked;
}
```

`apps/laravel/app/Models/LoginChallenge.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'code_hash', 'expires_at', 'attempts', 'resend_count', 'last_sent_at'])]
#[Hidden(['code_hash'])]
class LoginChallenge extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'attempts' => 'integer',
            'resend_count' => 'integer',
        ];
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

`apps/laravel/app/Services/LoginChallengeService.php`:
```php
<?php

namespace App\Services;

use App\Enums\ChallengeResult;
use App\Models\LoginChallenge;
use App\Models\User;

/**
 * Codice di 6 cifre inviato via email a ogni login: generazione, verifica, nuovo invio.
 */
final class LoginChallengeService
{
    public const TTL_MINUTES = 10;

    public const MAX_ATTEMPTS = 5;

    public const MAX_RESENDS = 3;

    public const RESEND_COOLDOWN_SECONDS = 60;

    /**
     * @return array{0: LoginChallenge, 1: string}
     */
    public function start(User $user): array
    {
        LoginChallenge::query()->where('user_id', $user->id)->delete();

        $code = $this->generateCode();

        $challenge = LoginChallenge::query()->create([
            'user_id' => $user->id,
            'code_hash' => $this->hash($code),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'attempts' => 0,
            'resend_count' => 0,
            'last_sent_at' => now(),
        ]);

        return [$challenge, $code];
    }

    public function verify(LoginChallenge $challenge, string $code): ChallengeResult
    {
        if ($challenge->expires_at->isPast()) {
            $challenge->delete();

            return ChallengeResult::Expired;
        }

        if ($challenge->attempts >= self::MAX_ATTEMPTS) {
            $challenge->delete();

            return ChallengeResult::Locked;
        }

        if (hash_equals($challenge->code_hash, $this->hash($code))) {
            $challenge->delete();

            return ChallengeResult::Valid;
        }

        $challenge->increment('attempts');

        if ($challenge->attempts >= self::MAX_ATTEMPTS) {
            $challenge->delete();

            return ChallengeResult::Locked;
        }

        return ChallengeResult::Invalid;
    }

    public function attemptsLeft(LoginChallenge $challenge): int
    {
        return max(0, self::MAX_ATTEMPTS - $challenge->attempts);
    }

    public function secondsUntilResend(LoginChallenge $challenge): int
    {
        $availableAt = $challenge->last_sent_at->copy()->addSeconds(self::RESEND_COOLDOWN_SECONDS);

        return max(0, (int) ceil(now()->diffInSeconds($availableAt)));
    }

    public function canResend(LoginChallenge $challenge): bool
    {
        return $challenge->resend_count < self::MAX_RESENDS;
    }

    /**
     * Sostituisce il codice (il precedente non vale più) e riparte da zero con tentativi e scadenza.
     */
    public function resend(LoginChallenge $challenge): string
    {
        $code = $this->generateCode();

        $challenge->update([
            'code_hash' => $this->hash($code),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'attempts' => 0,
            'resend_count' => $challenge->resend_count + 1,
            'last_sent_at' => now(),
        ]);

        return $code;
    }

    private function generateCode(): string
    {
        return str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
    }

    private function hash(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }
}
```

- [ ] **Step 5: Esegui migration e test**

```bash
./vendor/bin/sail artisan migrate
./vendor/bin/sail artisan test --compact --filter=LoginChallengeServiceTest
```
Expected: 8 PASS.

- [ ] **Step 6: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(auth): ciclo di vita del codice di accesso a 6 cifre"
```

---

## Task 7: Login — verifica delle credenziali ed email con il codice

**Files:**
- Create: `apps/laravel/app/Support/AuthSession.php`, `apps/laravel/app/Support/UserAgentSummary.php`
- Create: `apps/laravel/app/Mail/LoginCodeMail.php`, `apps/laravel/resources/views/mail/auth/login-code.blade.php`
- Create: `apps/laravel/lang/it/login.php`, `apps/laravel/lang/en/login.php`
- Create: `apps/laravel/app/Actions/Fortify/StartEmailLoginChallenge.php`
- Modify: `apps/laravel/app/Providers/FortifyServiceProvider.php`
- Create: `apps/laravel/tests/Concerns/CompletesLogin.php`
- Test: `apps/laravel/tests/Feature/Support/UserAgentSummaryTest.php`, `apps/laravel/tests/Feature/Auth/LoginCodeMailTest.php`, `apps/laravel/tests/Feature/Auth/LoginTest.php`

**Interfaces:**
- Consumes: `LoginChallengeService::start()` (Task 6), `AuthEventLogger::log()` (Task 5), rate limiter `login` (Task 3), `Translate::text()` (Task 2).
- Produces: `AuthSession::CHALLENGE_ID = 'login.challenge_id'`, `AuthSession::LOGGED_IN_AT = 'auth.logged_in_at'`; `POST /api/auth/login` → `200 {"two_factor": true}` o `422` con `errors.email = [__('auth.failed')]` o `429`; `LoginCodeMail(string $code, string $userAgent, CarbonInterface $requestedAt)` in coda, con proprietà pubblica `code`; trait `Tests\Concerns\CompletesLogin` con `startLogin(User $user, string $password = 'password'): string`, `lastLoginCode(): string`, `completeLogin(User $user, string $password = 'password'): void`.

- [ ] **Step 1: Scrivi i test**

`apps/laravel/tests/Concerns/CompletesLogin.php`:
```php
<?php

namespace Tests\Concerns;

use App\Mail\LoginCodeMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

trait CompletesLogin
{
    /**
     * Invia email e password e restituisce il codice finito nell'email (Mail::fake).
     */
    protected function startLogin(User $user, string $password = 'password'): string
    {
        Mail::fake();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => $password])->assertOk();

        return $this->lastLoginCode();
    }

    /**
     * Codice dell'ultima email di login messa in coda.
     */
    protected function lastLoginCode(): string
    {
        $code = '';

        Mail::assertQueued(LoginCodeMail::class, function (LoginCodeMail $mail) use (&$code): bool {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    protected function completeLogin(User $user, string $password = 'password'): void
    {
        $code = $this->startLogin($user, $password);

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertOk();
    }
}
```

`apps/laravel/tests/Feature/Support/UserAgentSummaryTest.php`:
```php
<?php

namespace Tests\Feature\Support;

use App\Support\UserAgentSummary;
use Tests\TestCase;

class UserAgentSummaryTest extends TestCase
{
    public function test_describes_common_browsers_in_italian(): void
    {
        app()->setLocale('it');

        $this->assertSame('Chrome su macOS', UserAgentSummary::describe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'));
        $this->assertSame('Safari su iOS', UserAgentSummary::describe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'));
        $this->assertSame('Edge su Windows', UserAgentSummary::describe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0'));
        $this->assertSame('Firefox su Android', UserAgentSummary::describe('Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0'));
    }

    public function test_falls_back_for_unknown_agents(): void
    {
        app()->setLocale('en');

        $this->assertSame('unknown browser on unknown system', UserAgentSummary::describe(''));
    }
}
```

`apps/laravel/tests/Feature/Auth/LoginCodeMailTest.php`:
```php
<?php

namespace Tests\Feature\Auth;

use App\Mail\LoginCodeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LoginCodeMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_contains_the_code_and_the_device(): void
    {
        app()->setLocale('en');

        $mail = new LoginCodeMail('482913', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', now());

        $mail->assertHasSubject('Your Holidays sign-in code');
        $mail->assertSeeInHtml('482913');
        $mail->assertSeeInText('Chrome on macOS');
    }

    public function test_is_queued_in_the_recipient_language(): void
    {
        Mail::fake();
        $user = User::factory()->create(['locale' => 'en']);

        Mail::to($user)->send(new LoginCodeMail('123456', '', now()));

        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->locale === 'en');
    }
}
```

`apps/laravel/tests/Feature/Auth/LoginTest.php`:
```php
<?php

namespace Tests\Feature\Auth;

use App\Mail\LoginCodeMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_valid_credentials_start_a_code_challenge_without_logging_in(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertOk()
            ->assertExactJson(['two_factor' => true]);

        $this->assertGuest();
        $this->assertSame(1, LoginChallenge::query()->where('user_id', $user->id)->count());
        $this->assertIsInt(session(AuthSession::CHALLENGE_ID));
        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->hasTo($user->email));
    }

    public function test_email_with_spaces_and_capitals_is_accepted(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email' => 'giulia.rossi@example.test']);

        $this->postJson('/api/auth/login', ['email' => '  Giulia.Rossi@Example.TEST ', 'password' => 'password'])
            ->assertOk();
    }

    public function test_wrong_password_returns_the_generic_error(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => __('auth.failed')]);

        Mail::assertNothingQueued();
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'login_failed']);
    }

    public function test_unknown_email_returns_the_same_error(): void
    {
        Mail::fake();

        $this->postJson('/api/auth/login', ['email' => 'nobody@example.test', 'password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => __('auth.failed')]);

        $this->assertDatabaseHas('auth_events', ['user_id' => null, 'event' => 'login_failed']);
    }

    public function test_invited_and_disabled_users_get_the_same_error(): void
    {
        Mail::fake();

        foreach ([User::factory()->invited()->create(), User::factory()->disabled()->create()] as $user) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['email' => __('auth.failed')]);
        }

        Mail::assertNothingQueued();
    }

    public function test_login_is_throttled_after_five_attempts(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
    }
}
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `./vendor/bin/sail artisan test --compact --filter='UserAgentSummaryTest|LoginCodeMailTest|LoginTest'`
Expected: FAIL (classi mancanti; il login Fortify di default apre la sessione invece di chiedere il codice).

- [ ] **Step 3: Traduzioni**

`apps/laravel/lang/it/login.php`:
```php
<?php

return [
    'code_invalid' => 'Codice non corretto.',
    'code_restart' => 'Il codice non è più valido. Ricomincia l’accesso.',
    'resend_wait' => 'Attendi :seconds secondi prima di chiedere un nuovo codice.',
    'resend_limit' => 'Hai raggiunto il limite di nuovi codici. Se non lo ricevi, ricomincia l’accesso.',
    'resent' => 'Nuovo codice inviato.',
    'session_expired' => 'Sessione scaduta. Accedi di nuovo.',
    'session_ended' => 'Sessione terminata. Accedi di nuovo.',
    'device' => ':browser su :os',
    'unknown_browser' => 'browser sconosciuto',
    'unknown_os' => 'sistema sconosciuto',
    'mail' => [
        'code' => [
            'subject' => 'Il tuo codice di accesso a Holidays',
            'heading' => 'Il tuo codice di accesso',
            'intro' => 'Usa questo codice per completare l’accesso. Scade tra 10 minuti e si può usare una sola volta.',
            'device' => 'Richiesto da :device il :date.',
            'not_you' => 'Se non sei stato tu, cambia subito la password e avvisa l’ufficio HR.',
        ],
    ],
];
```

`apps/laravel/lang/en/login.php`:
```php
<?php

return [
    'code_invalid' => 'Incorrect code.',
    'code_restart' => 'This code is no longer valid. Please sign in again.',
    'resend_wait' => 'Wait :seconds seconds before asking for a new code.',
    'resend_limit' => 'You reached the limit of new codes. If it doesn’t arrive, sign in again.',
    'resent' => 'New code sent.',
    'session_expired' => 'Your session expired. Please sign in again.',
    'session_ended' => 'Your session has ended. Please sign in again.',
    'device' => ':browser on :os',
    'unknown_browser' => 'unknown browser',
    'unknown_os' => 'unknown system',
    'mail' => [
        'code' => [
            'subject' => 'Your Holidays sign-in code',
            'heading' => 'Your sign-in code',
            'intro' => 'Use this code to finish signing in. It expires in 10 minutes and works only once.',
            'device' => 'Requested from :device on :date.',
            'not_you' => 'If this wasn’t you, change your password right away and tell HR.',
        ],
    ],
];
```

- [ ] **Step 4: Supporto: chiavi di sessione e descrizione del dispositivo**

`apps/laravel/app/Support/AuthSession.php`:
```php
<?php

namespace App\Support;

/**
 * Chiavi di sessione del flusso di accesso.
 */
final class AuthSession
{
    /** ID della challenge in attesa del codice (tra password e codice). */
    public const CHALLENGE_ID = 'login.challenge_id';

    /** Timestamp Unix del login completato, per la scadenza assoluta. */
    public const LOGGED_IN_AT = 'auth.logged_in_at';
}
```

`apps/laravel/app/Support/UserAgentSummary.php`:
```php
<?php

namespace App\Support;

/**
 * Descrizione leggibile del dispositivo ("Chrome su macOS") per le email di sicurezza.
 */
final class UserAgentSummary
{
    public static function describe(?string $userAgent): string
    {
        $agent = (string) $userAgent;

        $browser = match (true) {
            str_contains($agent, 'Edg/') => 'Edge',
            str_contains($agent, 'Firefox/') => 'Firefox',
            str_contains($agent, 'Chrome/') => 'Chrome',
            str_contains($agent, 'Safari/') => 'Safari',
            default => Translate::text('login.unknown_browser'),
        };

        $os = match (true) {
            str_contains($agent, 'iPhone'), str_contains($agent, 'iPad') => 'iOS',
            str_contains($agent, 'Mac OS X') => 'macOS',
            str_contains($agent, 'Windows') => 'Windows',
            str_contains($agent, 'Android') => 'Android',
            str_contains($agent, 'Linux') => 'Linux',
            default => Translate::text('login.unknown_os'),
        };

        return Translate::text('login.device', ['browser' => $browser, 'os' => $os]);
    }
}
```

- [ ] **Step 5: Email con il codice**

`apps/laravel/app/Mail/LoginCodeMail.php`:
```php
<?php

namespace App\Mail;

use App\Support\Translate;
use App\Support\UserAgentSummary;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LoginCodeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $code,
        public readonly string $userAgent,
        public readonly CarbonInterface $requestedAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('login.mail.code.subject'));
    }

    public function content(): Content
    {
        // content() gira già nella lingua del destinatario (HasLocalePreference)
        return new Content(
            markdown: 'mail.auth.login-code',
            with: [
                'device' => UserAgentSummary::describe($this->userAgent),
                'date' => $this->requestedAt->copy()
                    ->setTimezone((string) config('app.display_timezone'))
                    ->locale(app()->getLocale())
                    ->isoFormat('LLL'),
            ],
        );
    }
}
```

`apps/laravel/resources/views/mail/auth/login-code.blade.php` (nessuna riga indentata di 4 spazi: in markdown diventerebbe un blocco di codice):
```blade
<x-mail::message>
# {{ __('login.mail.code.heading') }}

{{ __('login.mail.code.intro') }}

<x-mail::panel>
<p style="margin: 0; font-size: 32px; font-weight: 600; letter-spacing: 8px; text-align: center;">{{ $code }}</p>
</x-mail::panel>

{{ __('login.mail.code.device', ['device' => $device, 'date' => $date]) }}

{{ __('login.mail.code.not_you') }}
</x-mail::message>
```

- [ ] **Step 6: Passo della pipeline di login**

`apps/laravel/app/Actions/Fortify/StartEmailLoginChallenge.php`:
```php
<?php

namespace App\Actions\Fortify;

use App\Enums\AuthEventType;
use App\Mail\LoginCodeMail;
use App\Models\User;
use App\Services\AuthEventLogger;
use App\Services\LoginChallengeService;
use App\Support\AuthSession;
use App\Support\Translate;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Timebox;
use Illuminate\Validation\ValidationException;

/**
 * Passo della pipeline di login Fortify: verifica le credenziali senza aprire la sessione
 * e invia il codice di 6 cifre via email. La sessione vera parte solo col codice giusto.
 */
final class StartEmailLoginChallenge
{
    /** Durata minima della verifica: uguale per email esistenti e inesistenti. */
    private const MIN_DURATION_MICROSECONDS = 300_000;

    public function __construct(
        private readonly LoginChallengeService $challenges,
        private readonly AuthEventLogger $events,
    ) {}

    public function handle(Request $request, Closure $next): JsonResponse
    {
        $user = $this->authenticatableUser($request);

        [$challenge, $code] = $this->challenges->start($user);

        $request->session()->regenerate();
        $request->session()->put(AuthSession::CHALLENGE_ID, $challenge->id);

        Mail::to($user)->send(new LoginCodeMail($code, (string) $request->userAgent(), now()));

        return response()->json(['two_factor' => true]);
    }

    private function authenticatableUser(Request $request): User
    {
        $email = Str::lower($request->string('email')->trim()->value());
        $password = $request->string('password')->value();

        /** @var array{0: User|null, 1: bool} $result */
        $result = (new Timebox)->call(function () use ($email, $password): array {
            $user = User::query()->where('email', $email)->first();

            if ($user === null || $user->password === null) {
                // Verifica fittizia: stesso costo anche quando l'utente non esiste o non ha password
                Hash::check($password, self::dummyHash());

                return [$user, false];
            }

            return [$user, Hash::check($password, $user->password) && $user->isActive()];
        }, self::MIN_DURATION_MICROSECONDS);

        [$user, $valid] = $result;

        if (! $valid || $user === null) {
            $this->events->log(AuthEventType::LoginFailed, $request, $user);

            throw ValidationException::withMessages(['email' => [Translate::text('auth.failed')]]);
        }

        return $user;
    }

    private static function dummyHash(): string
    {
        static $hash = null;

        return $hash ??= Hash::make(Str::random(40));
    }
}
```

In `apps/laravel/app/Providers/FortifyServiceProvider.php` aggiungi gli import `use App\Actions\Fortify\StartEmailLoginChallenge;`, `use Laravel\Fortify\Actions\CanonicalizeUsername;`, `use Laravel\Fortify\Fortify;` e, in fondo a `boot()`:
```php
        // Il limite ai tentativi lo applica il middleware throttle:login sulla rotta
        Fortify::authenticateThrough(fn (Request $request): array => [
            CanonicalizeUsername::class,
            StartEmailLoginChallenge::class,
        ]);
```

- [ ] **Step 7: Esegui i test**

Run: `./vendor/bin/sail artisan test --compact`
Expected: tutti PASS.

- [ ] **Step 8: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(auth): login con password e codice inviato via email"
```

---

## Task 8: Verifica del codice e nuovo invio

**Files:**
- Create: `apps/laravel/app/Http/Requests/Auth/TwoFactorCodeRequest.php`
- Create: `apps/laravel/app/Http/Controllers/Auth/TwoFactorChallengeController.php`
- Modify: `apps/laravel/routes/web.php`, `apps/laravel/app/Providers/FortifyServiceProvider.php`
- Test: `apps/laravel/tests/Feature/Auth/TwoFactorChallengeTest.php`

**Interfaces:**
- Consumes: `LoginChallengeService` (Task 6), `AuthSession` e `LoginCodeMail` (Task 7), `UserResource` (Task 2), `CompletesLogin` (Task 7).
- Produces: `POST /api/auth/two-factor` (`auth.two-factor`) → `200 {data: User}` · `422 {message, errors.code, meta.attempts_left}` · `422 {…, meta.restart: true}`; `POST /api/auth/two-factor/resend` (`auth.two-factor.resend`) → `202 {message}` · `429 {message, meta.retry_after}` con header `Retry-After` · `429 {message, meta.limit_reached: true}` · `422 meta.restart`. Rate limiter `two-factor` (10/min per IP). Dopo il login la sessione contiene `AuthSession::LOGGED_IN_AT` (int).

- [ ] **Step 1: Scrivi il test**

`apps/laravel/tests/Feature/Auth/TwoFactorChallengeTest.php`:
```php
<?php

namespace Tests\Feature\Auth;

use App\Enums\UserStatus;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CompletesLogin;
use Tests\TestCase;

class TwoFactorChallengeTest extends TestCase
{
    use CompletesLogin, RefreshDatabase;

    public function test_the_right_code_logs_the_user_in(): void
    {
        $user = User::factory()->create();
        $code = $this->startLogin($user);

        $this->postJson('/api/auth/two-factor', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('data.email', $user->email);

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()?->last_login_at);
        $this->assertSame(0, LoginChallenge::query()->count());
        $this->assertIsInt(session(AuthSession::LOGGED_IN_AT));
        $this->assertNull(session(AuthSession::CHALLENGE_ID));
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'login_succeeded']);
    }

    public function test_a_wrong_code_reports_the_attempts_left(): void
    {
        $code = $this->startLogin(User::factory()->create());

        $this->postJson('/api/auth/two-factor', ['code' => $this->wrongCode($code)])
            ->assertUnprocessable()
            ->assertJsonPath('meta.attempts_left', 4)
            ->assertJsonValidationErrors(['code']);

        $this->assertGuest();
    }

    public function test_the_fifth_wrong_code_forces_a_new_login(): void
    {
        $user = User::factory()->create();
        $code = $this->startLogin($user);

        for ($left = 4; $left >= 1; $left--) {
            $this->postJson('/api/auth/two-factor', ['code' => $this->wrongCode($code)])->assertJsonPath('meta.attempts_left', $left);
        }

        $this->postJson('/api/auth/two-factor', ['code' => $this->wrongCode($code)])->assertJsonPath('meta.restart', true);
        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertJsonPath('meta.restart', true);

        $this->assertGuest();
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'locked_out']);
    }

    public function test_an_expired_code_forces_a_new_login(): void
    {
        $code = $this->startLogin(User::factory()->create());

        $this->travel(11)->minutes();

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertUnprocessable()->assertJsonPath('meta.restart', true);
    }

    public function test_a_code_without_a_pending_login_forces_a_new_login(): void
    {
        $this->postJson('/api/auth/two-factor', ['code' => '123456'])->assertUnprocessable()->assertJsonPath('meta.restart', true);
    }

    public function test_a_code_cannot_be_reused_after_logout(): void
    {
        $code = $this->startLogin(User::factory()->create());

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertOk();
        $this->postJson('/api/auth/logout')->assertNoContent();

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertJsonPath('meta.restart', true);
    }

    public function test_a_user_disabled_during_login_cannot_complete_it(): void
    {
        $user = User::factory()->create();
        $code = $this->startLogin($user);

        $user->update(['status' => UserStatus::Disabled]);

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertJsonPath('meta.restart', true);
        $this->assertGuest();
    }

    public function test_resend_waits_for_the_cooldown_and_replaces_the_code(): void
    {
        $this->freezeTime();
        $first = $this->startLogin(User::factory()->create());

        $this->postJson('/api/auth/two-factor/resend')
            ->assertTooManyRequests()
            ->assertHeader('Retry-After', '60')
            ->assertJsonPath('meta.retry_after', 60);

        $this->travel(61)->seconds();
        $this->postJson('/api/auth/two-factor/resend')->assertAccepted();
        $second = $this->lastLoginCode();

        if ($first !== $second) {
            $this->postJson('/api/auth/two-factor', ['code' => $first])->assertJsonPath('meta.attempts_left', 4);
        }
        $this->postJson('/api/auth/two-factor', ['code' => $second])->assertOk();
    }

    public function test_resend_stops_after_three_new_codes(): void
    {
        $this->startLogin(User::factory()->create());

        for ($i = 0; $i < 3; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/api/auth/two-factor/resend')->assertAccepted();
        }

        $this->travel(61)->seconds();
        $this->postJson('/api/auth/two-factor/resend')
            ->assertTooManyRequests()
            ->assertJsonPath('meta.limit_reached', true);
    }

    public function test_code_endpoints_are_throttled_per_ip(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/auth/two-factor', ['code' => '123456'])->assertUnprocessable();
        }

        $this->postJson('/api/auth/two-factor', ['code' => '123456'])->assertTooManyRequests();
    }

    private function wrongCode(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }
}
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `./vendor/bin/sail artisan test --compact --filter=TwoFactorChallengeTest`
Expected: FAIL (404 su `/api/auth/two-factor`).

- [ ] **Step 3: FormRequest**

`apps/laravel/app/Http/Requests/Auth/TwoFactorCodeRequest.php`:
```php
<?php

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class TwoFactorCodeRequest extends FormRequest
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
            'code' => ['required', 'string', 'regex:/^\d{6}$/'],
        ];
    }
}
```

- [ ] **Step 4: Controller**

`apps/laravel/app/Http/Controllers/Auth/TwoFactorChallengeController.php`:
```php
<?php

namespace App\Http\Controllers\Auth;

use App\Enums\AuthEventType;
use App\Enums\ChallengeResult;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\TwoFactorCodeRequest;
use App\Http\Resources\UserResource;
use App\Mail\LoginCodeMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\AuthEventLogger;
use App\Services\LoginChallengeService;
use App\Support\AuthSession;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpFoundation\Response;

final class TwoFactorChallengeController extends Controller
{
    public function __construct(
        private readonly LoginChallengeService $challenges,
        private readonly AuthEventLogger $events,
    ) {}

    public function store(TwoFactorCodeRequest $request): JsonResponse
    {
        $challenge = $this->pendingChallenge($request);
        $user = $challenge?->user;

        if ($challenge === null || $user === null || ! $user->isActive()) {
            return $this->restart($request);
        }

        return match ($this->challenges->verify($challenge, $request->string('code')->value())) {
            ChallengeResult::Valid => $this->completeLogin($request, $user),
            ChallengeResult::Invalid => $this->invalidCode($request, $challenge, $user),
            ChallengeResult::Locked => $this->lockedOut($request, $user),
            ChallengeResult::Expired => $this->restart($request),
        };
    }

    public function resend(Request $request): JsonResponse
    {
        $challenge = $this->pendingChallenge($request);
        $user = $challenge?->user;

        if ($challenge === null || $user === null || ! $user->isActive()) {
            return $this->restart($request);
        }

        if (! $this->challenges->canResend($challenge)) {
            return response()->json([
                'message' => Translate::text('login.resend_limit'),
                'meta' => ['limit_reached' => true],
            ], Response::HTTP_TOO_MANY_REQUESTS);
        }

        $wait = $this->challenges->secondsUntilResend($challenge);

        if ($wait > 0) {
            return response()->json([
                'message' => Translate::text('login.resend_wait', ['seconds' => $wait]),
                'meta' => ['retry_after' => $wait],
            ], Response::HTTP_TOO_MANY_REQUESTS, ['Retry-After' => (string) $wait]);
        }

        $code = $this->challenges->resend($challenge);
        Mail::to($user)->send(new LoginCodeMail($code, (string) $request->userAgent(), now()));

        return response()->json(['message' => Translate::text('login.resent')], Response::HTTP_ACCEPTED);
    }

    private function pendingChallenge(Request $request): ?LoginChallenge
    {
        $id = $request->session()->get(AuthSession::CHALLENGE_ID);

        return is_int($id) ? LoginChallenge::query()->with('user')->find($id) : null;
    }

    private function completeLogin(Request $request, User $user): JsonResponse
    {
        Auth::guard('web')->login($user);

        $request->session()->regenerate();
        $request->session()->forget(AuthSession::CHALLENGE_ID);
        $request->session()->put(AuthSession::LOGGED_IN_AT, now()->getTimestamp());

        $user->forceFill(['last_login_at' => now()])->save();
        $this->events->log(AuthEventType::LoginSucceeded, $request, $user);

        return (new UserResource($user))->response()->setStatusCode(Response::HTTP_OK);
    }

    private function invalidCode(Request $request, LoginChallenge $challenge, User $user): JsonResponse
    {
        $this->events->log(AuthEventType::CodeFailed, $request, $user);
        $message = Translate::text('login.code_invalid');

        return response()->json([
            'message' => $message,
            'errors' => ['code' => [$message]],
            'meta' => ['attempts_left' => $this->challenges->attemptsLeft($challenge)],
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    private function lockedOut(Request $request, User $user): JsonResponse
    {
        $this->events->log(AuthEventType::LockedOut, $request, $user);

        return $this->restart($request);
    }

    private function restart(Request $request): JsonResponse
    {
        $request->session()->forget(AuthSession::CHALLENGE_ID);
        $message = Translate::text('login.code_restart');

        return response()->json([
            'message' => $message,
            'errors' => ['code' => [$message]],
            'meta' => ['restart' => true],
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
    }
}
```

- [ ] **Step 5: Rotte e rate limiter**

In `apps/laravel/routes/web.php` aggiungi l'import `use App\Http\Controllers\Auth\TwoFactorChallengeController;` e in fondo:
```php
// Passo del codice: gruppo `web` (sessione e CSRF) come le rotte di login di Fortify
Route::prefix('api/auth')->middleware(['guest:web', 'throttle:two-factor'])->group(function (): void {
    Route::post('/two-factor', [TwoFactorChallengeController::class, 'store'])->name('auth.two-factor');
    Route::post('/two-factor/resend', [TwoFactorChallengeController::class, 'resend'])->name('auth.two-factor.resend');
});
```

In `FortifyServiceProvider::boot()`, prima di `Fortify::authenticateThrough(...)`:
```php
        RateLimiter::for('two-factor', fn (Request $request): Limit => Limit::perMinute(10)->by('two-factor:'.$request->ip()));
```

- [ ] **Step 6: Esegui i test**

Run: `./vendor/bin/sail artisan test --compact`
Expected: tutti PASS.

- [ ] **Step 7: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(auth): verifica del codice e nuovo invio con limiti"
```

---

## Task 9: Protezione della sessione e logout

**Files:**
- Modify: `apps/laravel/app/Support/AuthSession.php` (metodo `end()`)
- Create: `apps/laravel/app/Http/Middleware/EnsureUserIsActive.php`, `apps/laravel/app/Http/Middleware/EnforceAbsoluteSessionLifetime.php`
- Create: `apps/laravel/app/Listeners/LogSuccessfulLogout.php`
- Modify: `apps/laravel/config/session.php`, `apps/laravel/bootstrap/app.php`, `apps/laravel/.env`, `apps/laravel/.env.example`
- Test: `apps/laravel/tests/Feature/Auth/SessionSecurityTest.php`

**Interfaces:**
- Consumes: `AuthSession::LOGGED_IN_AT` (Task 7), `CompletesLogin` (Task 7), `AuthEventLogger` (Task 5).
- Produces: `AuthSession::end(Request $request): void`; `config('session.absolute_lifetime')` (minuti, default 720); risposte `401 {message: login.session_ended}` per utente non attivo e `401 {message: login.session_expired}` oltre 12 ore; evento `logged_out` a ogni logout.

- [ ] **Step 1: Scrivi il test**

`apps/laravel/tests/Feature/Auth/SessionSecurityTest.php`:
```php
<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CompletesLogin;
use Tests\TestCase;

class SessionSecurityTest extends TestCase
{
    use CompletesLogin, RefreshDatabase;

    public function test_a_disabled_user_is_signed_out_on_the_next_request(): void
    {
        $user = User::factory()->disabled()->create();

        $this->actingAs($user)
            ->getJson('/api/auth/user')
            ->assertUnauthorized()
            ->assertJsonPath('message', __('login.session_ended'));
    }

    public function test_the_session_expires_twelve_hours_after_login(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->fromFrontend()
            ->withSession([AuthSession::LOGGED_IN_AT => now()->subHours(12)->subMinute()->getTimestamp()])
            ->getJson('/api/auth/user')
            ->assertUnauthorized()
            ->assertJsonPath('message', __('login.session_expired'));
    }

    public function test_a_session_younger_than_twelve_hours_is_valid(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->fromFrontend()
            ->withSession([AuthSession::LOGGED_IN_AT => now()->subHours(11)->getTimestamp()])
            ->getJson('/api/auth/user')
            ->assertOk();
    }

    public function test_a_missing_login_timestamp_starts_counting_now(): void
    {
        $this->actingAs(User::factory()->create())->fromFrontend()->getJson('/api/auth/user')->assertOk();

        $this->assertIsInt(session(AuthSession::LOGGED_IN_AT));
    }

    public function test_logout_ends_the_session_and_is_logged(): void
    {
        $user = User::factory()->create();
        $this->completeLogin($user);

        $this->postJson('/api/auth/logout')->assertNoContent();

        $this->assertGuest();
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'logged_out']);
    }
}
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `./vendor/bin/sail artisan test --compact --filter=SessionSecurityTest`
Expected: FAIL (utente disattivato ancora accettato, nessun limite di 12 ore, nessun evento di logout).

- [ ] **Step 3: Chiusura della sessione**

In `apps/laravel/app/Support/AuthSession.php` aggiungi gli import `use Illuminate\Http\Request;` e `use Illuminate\Support\Facades\Auth;` e il metodo:
```php
    /**
     * Chiude la sessione corrente: logout, sessione invalidata e nuovo token CSRF.
     */
    public static function end(Request $request): void
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }
```

- [ ] **Step 4: Middleware**

`apps/laravel/app/Http/Middleware/EnsureUserIsActive.php`:
```php
<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\AuthSession;
use App\Support\Translate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Un account disattivato perde l'accesso alla richiesta successiva, anche con una sessione aperta.
 */
final class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User && ! $user->isActive()) {
            AuthSession::end($request);

            return response()->json(['message' => Translate::text('login.session_ended')], Response::HTTP_UNAUTHORIZED);
        }

        return $next($request);
    }
}
```

`apps/laravel/app/Http/Middleware/EnforceAbsoluteSessionLifetime.php`:
```php
<?php

namespace App\Http\Middleware;

use App\Support\AuthSession;
use App\Support\Translate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Scadenza assoluta della sessione (12 ore dal login), indipendente dall'attività.
 */
final class EnforceAbsoluteSessionLifetime
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() !== null && $request->hasSession()) {
            $session = $request->session();
            $loggedInAt = $session->get(AuthSession::LOGGED_IN_AT);

            if (! is_int($loggedInAt)) {
                // Sessione senza timestamp (creata prima di questa regola o nei test): il conteggio parte ora
                $session->put(AuthSession::LOGGED_IN_AT, now()->getTimestamp());
            } elseif (now()->getTimestamp() - $loggedInAt > (int) config('session.absolute_lifetime') * 60) {
                AuthSession::end($request);

                return response()->json(['message' => Translate::text('login.session_expired')], Response::HTTP_UNAUTHORIZED);
            }
        }

        return $next($request);
    }
}
```

In `apps/laravel/config/session.php`, subito dopo `'expire_on_close' => …,` aggiungi:
```php
    /*
    | Durata massima della sessione in minuti dal login, anche con attività continua.
    */
    'absolute_lifetime' => (int) env('SESSION_ABSOLUTE_LIFETIME', 720),
```
In `apps/laravel/.env` e `.env.example`, dopo `SESSION_LIFETIME=120`: `SESSION_ABSOLUTE_LIFETIME=720`.

In `apps/laravel/bootstrap/app.php` aggiungi gli import dei due middleware e sostituisci la riga `appendToGroup('api', SetLocale::class)` con:
```php
        $middleware->appendToGroup('api', [
            SetLocale::class,
            EnsureUserIsActive::class,
            EnforceAbsoluteSessionLifetime::class,
        ]);
```

- [ ] **Step 5: Evento di logout**

`apps/laravel/app/Listeners/LogSuccessfulLogout.php` (scoperto automaticamente da Laravel):
```php
<?php

namespace App\Listeners;

use App\Enums\AuthEventType;
use App\Models\User;
use App\Services\AuthEventLogger;
use Illuminate\Auth\Events\Logout;

final class LogSuccessfulLogout
{
    public function __construct(private readonly AuthEventLogger $events) {}

    public function handle(Logout $event): void
    {
        if ($event->user instanceof User) {
            $this->events->log(AuthEventType::LoggedOut, request(), $event->user);
        }
    }
}
```

- [ ] **Step 6: Esegui i test**

Run: `./vendor/bin/sail artisan test --compact`
Expected: tutti PASS.

- [ ] **Step 7: Qualità e commit**

```bash
./vendor/bin/sail bin pint --dirty --format agent
./vendor/bin/sail composer analyse
git add -A apps/laravel
git commit -m "feat(auth): scadenza assoluta, account disattivati e log del logout"
```

---

## Task 10: Sail — servizi `queue` e `scheduler`

**Files:**
- Modify: `apps/laravel/compose.yaml`

**Interfaces:**
- Produces: le email in coda partono da sole (Mailpit su `http://localhost:8025`); lo scheduler è pronto per le pulizie della fase 4.

- [ ] **Step 1: Aggiungi i servizi**

In `apps/laravel/compose.yaml`, dopo il servizio `laravel.test` (stesso livello di indentazione), aggiungi:
```yaml
    queue:
        image: 'sail-8.5/app'
        command: ['php', 'artisan', 'queue:listen', '--tries=3', '--sleep=1']
        environment:
            WWWUSER: '${WWWUSER}'
            LARAVEL_SAIL: 1
        volumes:
            - '.:/var/www/html'
        networks:
            - sail
        depends_on:
            - laravel.test
            - mysql
            - redis
            - mailpit
        restart: unless-stopped
    scheduler:
        image: 'sail-8.5/app'
        command: ['php', 'artisan', 'schedule:work']
        environment:
            WWWUSER: '${WWWUSER}'
            LARAVEL_SAIL: 1
        volumes:
            - '.:/var/www/html'
        networks:
            - sail
        depends_on:
            - laravel.test
            - mysql
        restart: unless-stopped
```
`queue:listen` (e non `queue:work`) ricarica il codice a ogni job: in sviluppo non serve riavviare la coda dopo una modifica.

- [ ] **Step 2: Avvia e verifica**

```bash
./vendor/bin/sail up -d
./vendor/bin/sail ps
./vendor/bin/sail artisan tinker --execute 'Mail::to("prova@holidays.test")->queue(new App\Mail\LoginCodeMail("123456", "", now()));'
```
Expected: `queue` e `scheduler` in stato `running`; entro pochi secondi l'email "Il tuo codice di accesso a Holidays" compare su http://localhost:8025.

- [ ] **Step 3: Commit**

```bash
git add apps/laravel/compose.yaml
git commit -m "build(docker): servizi sail per coda e scheduler"
```

---

## Task 11: Frontend — Tailwind 4, shadcn e tema Laguna

**Files:**
- Modify: `apps/react/package.json`, `apps/react/vite.config.ts`, `apps/react/tsconfig.json`, `apps/react/tsconfig.app.json`, `apps/react/eslint.config.js`
- Create (CLI): `apps/react/components.json`, `apps/react/src/lib/utils.ts`, `apps/react/src/hooks/use-mobile.ts`, `apps/react/src/components/ui/*`
- Modify: `apps/react/src/components/ui/{button,input,input-otp}.tsx`, `apps/react/src/hooks/use-mobile.ts`
- Replace: `apps/react/src/index.css`, `apps/react/src/App.tsx`
- Delete: `apps/react/src/App.css`, `apps/react/src/assets/`
- Modify: `apps/react/CLAUDE.md`

**Interfaces:**
- Produces: alias `@/` → `src/`; componenti `@/components/ui/{button,input,label,field,input-otp,card,alert,sonner,dropdown-menu,sidebar,skeleton,badge,separator,sheet,tooltip}`; `cn` da `@/lib/utils`; token CSS `--primary`, `--primary-soft`, `--primary-soft-foreground`, `--success`, `--success-soft`, `--warning`, `--warning-soft` e classi Tailwind corrispondenti (`bg-primary-soft`, `text-success`, …); Button: taglie `default` h-10, `sm` h-9, `lg` h-11, `icon` 40px, `icon-sm` 36px.

- [ ] **Step 1: Tailwind e alias**

```bash
cd /Users/alessandro/Progetti/GitHub/holidays/apps/react
npm install -D tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
```

`apps/react/vite.config.ts` (file completo; il proxy arriva nel Task 13):
```ts
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefisso '' per leggere anche le variabili non VITE_* (es. DEV_SERVER_PORT)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      port: Number(env.DEV_SERVER_PORT) || 5173,
      strictPort: true,
    },
  }
})
```

`apps/react/tsconfig.json`: aggiungi dopo `"files": [],`:
```json
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  },
```
`apps/react/tsconfig.app.json`: dentro `compilerOptions`, dopo `"jsx": "react-jsx",`:
```json
    "paths": { "@/*": ["./src/*"] },
    "resolveJsonModule": true,
```

`apps/react/src/index.css` provvisorio (serve alla CLI per riconoscere Tailwind):
```css
@import "tailwindcss";
```

- [ ] **Step 2: Inizializza shadcn e aggiungi i componenti**

```bash
npx -y shadcn@4.21.0 init -t vite -b radix -p nova -y
npx -y shadcn@4.21.0 add input label field input-otp card alert sonner dropdown-menu sidebar skeleton badge -y
npm uninstall @fontsource-variable/geist
npm install @fontsource-variable/inter@5.3.0
```
Expected: `components.json` con `"style": "radix-nova"`, file in `src/components/ui/`, `src/lib/utils.ts`, `src/hooks/use-mobile.ts`.

- [ ] **Step 3: Token del tema (Laguna, Inter)**

Sostituisci **tutto** `apps/react/src/index.css` con:
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/inter";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-heading: var(--font-sans);
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-primary-soft: var(--primary-soft);
  --color-primary-soft-foreground: var(--primary-soft-foreground);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/* Palette "Laguna" dal prototipo approvato. `--input` più scuro del default shadcn: contrasto 3:1 (WCAG 1.4.11) */
:root {
  --radius: 0.625rem;
  --background: hsl(180 14% 97.5%);
  --foreground: hsl(200 28% 11%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(200 28% 11%);
  --popover: hsl(0 0% 100%);
  --popover-foreground: hsl(200 28% 11%);
  --primary: hsl(177 72% 26%);
  --primary-foreground: hsl(0 0% 100%);
  --primary-soft: hsl(176 45% 93%);
  --primary-soft-foreground: hsl(177 70% 20%);
  --secondary: hsl(185 16% 93%);
  --secondary-foreground: hsl(200 28% 11%);
  --muted: hsl(185 16% 93%);
  --muted-foreground: hsl(200 9% 36%);
  --accent: hsl(176 45% 93%);
  --accent-foreground: hsl(177 70% 20%);
  --destructive: hsl(0 70% 44%);
  --success: hsl(150 62% 28%);
  --success-soft: hsl(150 45% 93%);
  --warning: hsl(32 92% 32%);
  --warning-soft: hsl(40 90% 92%);
  --border: hsl(190 14% 87%);
  --input: hsl(195 9% 55%);
  --ring: hsl(177 72% 30%);
  --chart-1: hsl(177 72% 26%);
  --chart-2: hsl(177 50% 42%);
  --chart-3: hsl(190 40% 55%);
  --chart-4: hsl(32 92% 45%);
  --chart-5: hsl(200 20% 60%);
  --sidebar: hsl(0 0% 100%);
  --sidebar-foreground: hsl(200 28% 11%);
  --sidebar-primary: hsl(177 72% 26%);
  --sidebar-primary-foreground: hsl(0 0% 100%);
  --sidebar-accent: hsl(176 45% 93%);
  --sidebar-accent-foreground: hsl(177 70% 20%);
  --sidebar-border: hsl(190 14% 87%);
  --sidebar-ring: hsl(177 72% 30%);
}

.dark {
  --background: hsl(200 24% 7%);
  --foreground: hsl(185 20% 93%);
  --card: hsl(200 20% 10%);
  --card-foreground: hsl(185 20% 93%);
  --popover: hsl(200 20% 10%);
  --popover-foreground: hsl(185 20% 93%);
  --primary: hsl(174 58% 48%);
  --primary-foreground: hsl(200 40% 8%);
  --primary-soft: hsl(176 40% 14%);
  --primary-soft-foreground: hsl(174 60% 72%);
  --secondary: hsl(200 16% 15%);
  --secondary-foreground: hsl(185 20% 93%);
  --muted: hsl(200 16% 15%);
  --muted-foreground: hsl(190 10% 68%);
  --accent: hsl(176 40% 14%);
  --accent-foreground: hsl(174 60% 72%);
  --destructive: hsl(0 72% 62%);
  --success: hsl(150 50% 55%);
  --success-soft: hsl(150 35% 14%);
  --warning: hsl(38 90% 60%);
  --warning-soft: hsl(38 50% 14%);
  --border: hsl(200 14% 20%);
  --input: hsl(195 9% 45%);
  --ring: hsl(174 58% 55%);
  --chart-1: hsl(174 58% 48%);
  --chart-2: hsl(174 45% 62%);
  --chart-3: hsl(190 35% 65%);
  --chart-4: hsl(38 90% 60%);
  --chart-5: hsl(200 15% 55%);
  --sidebar: hsl(200 20% 10%);
  --sidebar-foreground: hsl(185 20% 93%);
  --sidebar-primary: hsl(174 58% 48%);
  --sidebar-primary-foreground: hsl(200 40% 8%);
  --sidebar-accent: hsl(176 40% 14%);
  --sidebar-accent-foreground: hsl(174 60% 72%);
  --sidebar-border: hsl(200 14% 20%);
  --sidebar-ring: hsl(174 58% 55%);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
  html {
    @apply font-sans;
  }
  h1,
  h2,
  h3 {
    text-wrap: balance;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Ritocchi ai componenti generati (dimensioni del prototipo e lint)**

In `src/components/ui/button.tsx`, nelle `size` di `buttonVariants`, sostituisci esattamente:
- `"h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"` (default) → `"h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3"`
- in `sm`: `h-7 gap-1` → `h-9 gap-1.5` e `px-2.5 text-[0.8rem]` → `px-3 text-sm`
- `"h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"` (lg) → `"h-11 gap-2 px-5 text-[15px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4"`
- `icon: "size-8",` → `icon: "size-10",`
- in `icon-sm`: `"size-7 ` → `"size-9 `
- `"icon-lg": "size-9",` → `"icon-lg": "size-11",`

In `src/components/ui/input.tsx`: `h-8 w-full` → `h-10 w-full`, `bg-transparent px-2.5` → `bg-card px-3`, e rimuovi `dark:bg-input/30 ` (resta `dark:disabled:bg-input/80`).

In `src/components/ui/input-otp.tsx`, in `InputOTPSlot`: `"relative flex size-8 items-center justify-center border-y border-r border-input text-sm transition-all` → `"relative flex h-14 w-11 items-center justify-center border-y border-r border-input bg-card text-2xl font-semibold transition-all sm:h-15 sm:w-12`, e rimuovi ` dark:bg-input/30`.

Sostituisci **tutto** `src/hooks/use-mobile.ts` (la versione generata viola `react-hooks/set-state-in-effect`):
```ts
import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const subscribe = (onChange: () => void): (() => void) => {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}
```

Verifica: `grep -rn "size-8\|h-8 w-full" src/components/ui/button.tsx src/components/ui/input.tsx src/components/ui/input-otp.tsx` non deve trovare le classi sostituite.

- [ ] **Step 5: Pagina provvisoria e pulizia del template Vite**

```bash
rm -rf src/App.css src/assets
```
`apps/react/src/App.tsx` (sostituito nel Task 17 dal router):
```tsx
import { Button } from '@/components/ui/button'

const App = () => (
  <main className="grid min-h-svh place-items-center p-6">
    <div className="grid gap-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Holidays</h1>
      <Button>Continua</Button>
    </div>
  </main>
)

export default App
```
In `src/main.tsx` sostituisci `import './index.css'` con `import '@/index.css'` e `import App from './App.tsx'` con `import App from '@/App'`.

- [ ] **Step 6: Regole ESLint**

`apps/react/eslint.config.js` (file completo):
```js
import js from '@eslint/js'
import pluginQuery from '@tanstack/eslint-plugin-query'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      pluginQuery.configs['flat/recommended'],
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML è vietato: rischio XSS.',
        },
      ],
    },
  },
  {
    // File generati da shadcn, router e utilità di test esportano anche costanti
    files: ['src/components/ui/**/*.tsx', 'src/routes.tsx', 'src/test/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['e2e/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
])
```

- [ ] **Step 7: Aggiorna le regole del progetto**

In `apps/react/CLAUDE.md`, nella sezione "Regole di progetto", sostituisci la riga dello styling con:
```markdown
- **Styling con Tailwind**: niente `style={{}}` per layout/spacing; classi condizionali con `cn` da `@/lib/utils`
  (sostituisce `clsx` + `tailwind-merge`). Componenti base shadcn in `src/components/ui/` (generati con
  `npx shadcn@4.21.0 add …`, modificabili).
```
e aggiungi sotto la riga di TypeScript:
```markdown
- **`erasableSyntaxOnly`**: niente `enum` TypeScript né parameter properties nei costruttori; usare unioni di stringhe.
```

- [ ] **Step 8: Verifica e commit**

```bash
npm run lint
npm run build
npm run dev
```
Expected: lint e build senza errori; su http://localhost:5174 titolo "Holidays" e pulsante blu-verde con Inter. Ferma il dev server.

```bash
git add -A apps/react
git commit -m "feat(ui): tailwind 4, componenti shadcn e tema laguna"
```

---

## Task 12: Test frontend, multilingua e tema chiaro/scuro

**Files:**
- Modify: `apps/react/package.json` (dipendenze e script `test`), `apps/react/tsconfig.node.json`
- Create: `apps/react/vitest.config.ts`
- Create: `apps/react/src/test/setup.ts`, `apps/react/src/test/server.ts`, `apps/react/src/test/axe.ts`
- Create: `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`, `apps/react/src/lib/i18n.ts`
- Create: `apps/react/src/components/brand/Logo.tsx`, `apps/react/src/components/preferences/LanguageMenu.tsx`, `apps/react/src/components/preferences/ThemeMenu.tsx`
- Modify: `apps/react/src/components/ui/sidebar.tsx`, `apps/react/src/components/ui/sheet.tsx`, `apps/react/index.html`, `apps/react/public/favicon.svg`, `apps/react/src/main.tsx`
- Delete: `apps/react/public/icons.svg`
- Test: `apps/react/src/lib/i18n.test.ts`, `apps/react/src/components/preferences/preferences.test.tsx`

**Interfaces:**
- Produces: `i18n` (default export), `setLocale(locale: Locale): Promise<void>`, `detectLocale(): Locale`, `isLocale(value: unknown): value is Locale`, `type Locale = 'it' | 'en'` da `@/lib/i18n` (chiave di storage `holidays-locale`); tema via `next-themes` con `storageKey="holidays-theme"`, `attribute="class"`; componenti `<LanguageMenu />`, `<ThemeMenu />`, `<Logo className />`; `expectNoA11yViolations(container: Element): Promise<void>` da `@/test/axe`; `server` MSW da `@/test/server` (default: `GET /sanctum/csrf-cookie` → 204 con cookie `XSRF-TOKEN=test-xsrf-token`, `GET /api/auth/user` → 401). Tutte le chiavi di traduzione della fase 1 (sotto).

- [ ] **Step 1: Dipendenze e configurazione di Vitest**

```bash
npm install react-router@8.4.0 i18next@26.4.2 react-i18next@17.0.15 react-hook-form@7.89.0 zod@4.6.5 @hookform/resolvers@5.9.1
npm install -D vitest@5.0.3 jsdom@30.1.1 @testing-library/react@16.3.3 @testing-library/user-event@14.6.7 @testing-library/jest-dom@7.0.1 msw@3.0.1 axe-core
```
In `package.json`, dentro `"scripts"`, aggiungi `"test": "vitest run"` e `"test:watch": "vitest"`.

`apps/react/vitest.config.ts`:
```ts
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
```
In `apps/react/tsconfig.node.json` sostituisci `"include": ["vite.config.ts"]` con `"include": ["vite.config.ts", "vitest.config.ts"]`.

- [ ] **Step 2: Traduzioni della fase 1**

`apps/react/src/locales/it.json`:
```json
{
  "app": { "name": "Holidays" },
  "common": {
    "close": "Chiudi",
    "retry": "Riprova",
    "loading": "Caricamento in corso…",
    "showPassword": "Mostra password"
  },
  "preferences": {
    "language": "Lingua",
    "theme": "Tema",
    "themeLight": "Chiaro",
    "themeDark": "Scuro",
    "themeSystem": "Sistema",
    "currentLanguage": "Lingua: {{language}}",
    "currentTheme": "Tema: {{theme}}"
  },
  "brand": {
    "tagline": "Le ferie del team, in chiaro.",
    "subtitle": "Richieste, approvazioni e calendario di tutta l’azienda in un unico posto.",
    "calendar": "Ottobre 2026 · assenze del team",
    "legendLeave": "Ferie",
    "legendPermit": "Permesso"
  },
  "login": {
    "title": "Accedi",
    "subtitle": "Usa l’email aziendale e la tua password.",
    "email": "Email",
    "password": "Password",
    "submit": "Continua",
    "submitting": "Verifica in corso…",
    "error": "Email o password non corrette. Controlla i dati e riprova.",
    "locked": "Troppi tentativi. Potrai riprovare tra {{count}} secondi.",
    "noAccount": "Non hai un account? Chiedi un invito all’ufficio HR.",
    "notice": {
      "expired": "Sessione scaduta. Accedi di nuovo.",
      "logged-out": "Sei uscito. A presto.",
      "restart": "Per sicurezza ricomincia l’accesso."
    }
  },
  "verify": {
    "title": "Controlla la tua email",
    "subtitle": "Abbiamo inviato un codice di 6 cifre a {{email}}. Scade tra 10 minuti.",
    "subtitleUnknown": "Abbiamo inviato un codice di 6 cifre al tuo indirizzo email. Scade tra 10 minuti.",
    "label": "Codice di verifica",
    "submit": "Verifica e accedi",
    "submitting": "Verifica in corso…",
    "incomplete": "Inserisci tutte e 6 le cifre.",
    "invalid_one": "Codice non corretto. Ti resta {{count}} tentativo.",
    "invalid_other": "Codice non corretto. Tentativi rimasti: {{count}}.",
    "throttled": "Troppi tentativi. Riprova tra {{count}} secondi.",
    "resend": "Invia un nuovo codice",
    "resendIn": "Nuovo codice tra {{count}} s",
    "resent": "Nuovo codice inviato. Il precedente non è più valido.",
    "resendLimit": "Hai raggiunto il limite di nuovi codici. Se non lo ricevi, ricomincia l’accesso.",
    "otherAccount": "Usa un altro account"
  },
  "validation": {
    "emailRequired": "Inserisci la tua email.",
    "emailInvalid": "Inserisci un indirizzo email valido, ad esempio nome@azienda.it.",
    "passwordRequired": "Inserisci la password."
  },
  "errors": {
    "generic": "Qualcosa non ha funzionato. Riprova tra poco.",
    "network": "Impossibile contattare il server. Controlla la connessione e riprova.",
    "serverTitle": "Servizio non raggiungibile"
  },
  "nav": {
    "main": "Navigazione principale",
    "mobileDescription": "Menu di navigazione dell’applicazione.",
    "toggle": "Mostra o nascondi il menu",
    "skip": "Vai al contenuto",
    "home": "Home",
    "leave": "Ferie e permessi",
    "soon": "presto"
  },
  "account": { "menu": "Menu account", "logout": "Esci" },
  "home": {
    "greeting": "Ciao, {{name}}",
    "subtitle": "Qui troverai ferie, permessi e il calendario del team.",
    "comingSoon": "La gestione di ferie e permessi arriverà nelle prossime fasi."
  },
  "notFound": {
    "title": "Pagina non trovata",
    "description": "L’indirizzo che hai aperto non esiste o non è più disponibile.",
    "back": "Torna alla home"
  },
  "titles": {
    "login": "Accedi",
    "verify": "Codice di verifica",
    "home": "Home",
    "notFound": "Pagina non trovata"
  },
  "a11y": { "pageAnnouncement": "Pagina: {{title}}" }
}
```

`apps/react/src/locales/en.json`:
```json
{
  "app": { "name": "Holidays" },
  "common": {
    "close": "Close",
    "retry": "Try again",
    "loading": "Loading…",
    "showPassword": "Show password"
  },
  "preferences": {
    "language": "Language",
    "theme": "Theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeSystem": "System",
    "currentLanguage": "Language: {{language}}",
    "currentTheme": "Theme: {{theme}}"
  },
  "brand": {
    "tagline": "Your team’s time off, at a glance.",
    "subtitle": "Requests, approvals and the company calendar in one place.",
    "calendar": "October 2026 · team absences",
    "legendLeave": "Leave",
    "legendPermit": "Time off"
  },
  "login": {
    "title": "Sign in",
    "subtitle": "Use your work email and password.",
    "email": "Email",
    "password": "Password",
    "submit": "Continue",
    "submitting": "Checking…",
    "error": "Incorrect email or password. Check your details and try again.",
    "locked": "Too many attempts. You can try again in {{count}} seconds.",
    "noAccount": "No account yet? Ask HR for an invitation.",
    "notice": {
      "expired": "Your session expired. Please sign in again.",
      "logged-out": "You signed out. See you soon.",
      "restart": "For your security, please sign in again."
    }
  },
  "verify": {
    "title": "Check your email",
    "subtitle": "We sent a 6-digit code to {{email}}. It expires in 10 minutes.",
    "subtitleUnknown": "We sent a 6-digit code to your email address. It expires in 10 minutes.",
    "label": "Verification code",
    "submit": "Verify and sign in",
    "submitting": "Checking…",
    "incomplete": "Enter all 6 digits.",
    "invalid_one": "Incorrect code. You have {{count}} attempt left.",
    "invalid_other": "Incorrect code. Attempts left: {{count}}.",
    "throttled": "Too many attempts. Try again in {{count}} seconds.",
    "resend": "Send a new code",
    "resendIn": "New code in {{count}} s",
    "resent": "New code sent. The previous one no longer works.",
    "resendLimit": "You reached the limit of new codes. If it doesn’t arrive, sign in again.",
    "otherAccount": "Use another account"
  },
  "validation": {
    "emailRequired": "Enter your email.",
    "emailInvalid": "Enter a valid email address, for example name@company.com.",
    "passwordRequired": "Enter your password."
  },
  "errors": {
    "generic": "Something went wrong. Please try again shortly.",
    "network": "Can’t reach the server. Check your connection and try again.",
    "serverTitle": "Service unavailable"
  },
  "nav": {
    "main": "Main navigation",
    "mobileDescription": "Application navigation menu.",
    "toggle": "Show or hide the menu",
    "skip": "Skip to content",
    "home": "Home",
    "leave": "Leave and time off",
    "soon": "soon"
  },
  "account": { "menu": "Account menu", "logout": "Sign out" },
  "home": {
    "greeting": "Hi, {{name}}",
    "subtitle": "Here you’ll find leave, time off and the team calendar.",
    "comingSoon": "Leave and time-off management is coming in the next phases."
  },
  "notFound": {
    "title": "Page not found",
    "description": "The address you opened doesn’t exist or is no longer available.",
    "back": "Back to home"
  },
  "titles": {
    "login": "Sign in",
    "verify": "Verification code",
    "home": "Home",
    "notFound": "Page not found"
  },
  "a11y": { "pageAnnouncement": "Page: {{title}}" }
}
```

- [ ] **Step 3: Infrastruttura dei test**

`apps/react/src/test/server.ts`:
```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const server = setupServer(
  http.get('/sanctum/csrf-cookie', () => {
    document.cookie = 'XSRF-TOKEN=test-xsrf-token; path=/'
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/auth/user', () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })),
)
```

`apps/react/src/test/setup.ts`:
```ts
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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(async () => {
  cleanup()
  server.resetHandlers()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  document.documentElement.className = ''
  window.localStorage.clear()
  await i18n.changeLanguage('it')
})

afterAll(() => server.close())
```

`apps/react/src/test/axe.ts`:
```ts
import axe from 'axe-core'
import { expect } from 'vitest'

/** Controllo axe sui componenti: contrasto e landmark si verificano negli E2E (jsdom non calcola gli stili). */
export const expectNoA11yViolations = async (container: Element): Promise<void> => {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
}
```

- [ ] **Step 4: Scrivi i test di lingua e tema**

`apps/react/src/lib/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import i18n, { detectLocale, setLocale } from '@/lib/i18n'

describe('i18n', () => {
  it('uses Italian by default', () => {
    expect(i18n.t('login.title')).toBe('Accedi')
  })

  it('switches language, updates <html lang> and remembers the choice', async () => {
    await setLocale('en')

    expect(i18n.t('login.title')).toBe('Sign in')
    expect(document.documentElement.lang).toBe('en')
    expect(detectLocale()).toBe('en')
  })
})
```

`apps/react/src/components/preferences/preferences.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { describe, expect, it } from 'vitest'
import LanguageMenu from '@/components/preferences/LanguageMenu'
import ThemeMenu from '@/components/preferences/ThemeMenu'
import { expectNoA11yViolations } from '@/test/axe'

describe('preference menus', () => {
  it('switches the interface language', async () => {
    const user = userEvent.setup()
    render(<LanguageMenu />)

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    expect(await screen.findByRole('button', { name: 'Language: English' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('applies the dark theme', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="holidays-theme">
        <ThemeMenu />
      </ThemeProvider>,
    )

    await expectNoA11yViolations(container)
    await user.click(screen.getByRole('button', { name: 'Tema: Chiaro' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Scuro' }))

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
  })
})
```

- [ ] **Step 5: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL (`@/lib/i18n` e i menu non esistono).

- [ ] **Step 6: Configurazione i18n**

`apps/react/src/lib/i18n.ts`:
```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import it from '@/locales/it.json'

export type Locale = 'it' | 'en'

const STORAGE_KEY = 'holidays-locale'

export const isLocale = (value: unknown): value is Locale => value === 'it' || value === 'en'

/** Lingua iniziale: scelta salvata, poi lingua del browser se supportata, altrimenti italiano. */
export const detectLocale = (): Locale => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // localStorage non disponibile (es. navigazione privata): si usa la lingua del browser
  }
  const browser = window.navigator.language.slice(0, 2)
  return isLocale(browser) ? browser : 'it'
}

export const setLocale = async (locale: Locale): Promise<void> => {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Preferenza non salvata: vale fino alla chiusura della pagina
  }
  await i18n.changeLanguage(locale)
}

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})

void i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en } },
  lng: detectLocale(),
  fallbackLng: 'it',
  supportedLngs: ['it', 'en'],
  interpolation: { escapeValue: false },
})

export default i18n
```

- [ ] **Step 7: Logo e menu di lingua e tema**

`apps/react/src/components/brand/Logo.tsx`:
```tsx
interface LogoProps {
  className?: string
}

/** Sole sull'orizzonte: il segno di Holidays. Decorativo, il nome dell'app è sempre nel testo vicino. */
const Logo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M3 17h18" />
    <path d="M7 17a5 5 0 0 1 10 0" />
    <path d="M12 6.5V8.5" />
    <path d="M5.9 9.4l1.4 1.4" />
    <path d="M18.1 9.4l-1.4 1.4" />
    <path d="M6.5 20.5h11" />
  </svg>
)

export default Logo
```

`apps/react/src/components/preferences/LanguageMenu.tsx`:
```tsx
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isLocale, setLocale, type Locale } from '@/lib/i18n'

interface LanguageOption {
  value: Locale
  label: string
}

// I nomi delle lingue restano nella loro lingua, così chi non capisce l'altra la riconosce
const LANGUAGES: LanguageOption[] = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
]

const LanguageMenu = () => {
  const { t, i18n } = useTranslation()
  const current = LANGUAGES.find((language) => language.value === i18n.language) ?? LANGUAGES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" aria-label={t('preferences.currentLanguage', { language: current.label })}>
          <Languages aria-hidden="true" />
          <span className="text-[13px] font-semibold uppercase">{current.value}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t('preferences.language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current.value}
          onValueChange={(value) => {
            if (isLocale(value)) void setLocale(value)
          }}
        >
          {LANGUAGES.map((language) => (
            <DropdownMenuRadioItem key={language.value} value={language.value} lang={language.value}>
              {language.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LanguageMenu
```

`apps/react/src/components/preferences/ThemeMenu.tsx`:
```tsx
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ThemeOption {
  value: 'light' | 'dark' | 'system'
  labelKey: string
  icon: LucideIcon
}

const THEMES: ThemeOption[] = [
  { value: 'light', labelKey: 'preferences.themeLight', icon: Sun },
  { value: 'dark', labelKey: 'preferences.themeDark', icon: Moon },
  { value: 'system', labelKey: 'preferences.themeSystem', icon: Monitor },
]

const ThemeMenu = () => {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const current = THEMES.find((option) => option.value === theme) ?? THEMES[2]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('preferences.currentTheme', { theme: t(current.labelKey) })}>
          <CurrentIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('preferences.theme')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current.value} onValueChange={setTheme}>
          {THEMES.map(({ value, labelKey, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" />
              {t(labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ThemeMenu
```

- [ ] **Step 8: Testi accessibili dei componenti shadcn**

In `src/components/ui/sidebar.tsx` aggiungi `import { useTranslation } from "react-i18next"`; come prima riga delle funzioni `Sidebar`, `SidebarTrigger` e `SidebarRail` aggiungi `const { t } = useTranslation()`; poi sostituisci:
- `<SheetTitle>Sidebar</SheetTitle>` → `<SheetTitle>{t("nav.main")}</SheetTitle>`
- `<SheetDescription>Displays the mobile sidebar.</SheetDescription>` → `<SheetDescription>{t("nav.mobileDescription")}</SheetDescription>`
- `<span className="sr-only">Toggle Sidebar</span>` → `<span className="sr-only">{t("nav.toggle")}</span>`
- in `SidebarRail`: `aria-label="Toggle Sidebar"` → `aria-label={t("nav.toggle")}` e `title="Toggle Sidebar"` → `title={t("nav.toggle")}`

In `src/components/ui/sheet.tsx` aggiungi lo stesso import, `const { t } = useTranslation()` come prima riga di `SheetContent` e sostituisci `<span className="sr-only">Close</span>` con `<span className="sr-only">{t("common.close")}</span>`.

Verifica: `grep -rn "Toggle Sidebar\|>Close<\|Displays the mobile" src/components/ui` non trova nulla.

- [ ] **Step 9: Tema prima del primo paint, favicon e provider**

`apps/react/index.html` (file completo):
```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>%VITE_APP_NAME%</title>
    <script>
      // Applica il tema salvato prima del primo paint: evita il lampo bianco in modalità scura
      ;(function () {
        try {
          var theme = localStorage.getItem('holidays-theme')
          var dark = theme === 'dark' || ((!theme || theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
        } catch (e) {}
      })()
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/react/public/favicon.svg` (sostituisce il logo Vite):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#127570"/><g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" transform="translate(4 4)"><path d="M3 17h18"/><path d="M7 17a5 5 0 0 1 10 0"/><path d="M12 6.5V8.5"/><path d="M5.9 9.4l1.4 1.4"/><path d="M18.1 9.4l-1.4 1.4"/><path d="M6.5 20.5h11"/></g></svg>
```
```bash
rm public/icons.svg
```

`apps/react/src/main.tsx` (file completo):
```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import '@/lib/i18n'
import App from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/queryClient'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Elemento #root mancante in index.html')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="holidays-theme" disableTransitionOnChange>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 10: Esegui test, lint e build**

```bash
npm test
npm run lint
npm run build
```
Expected: 4 test PASS; lint e build senza errori.

- [ ] **Step 11: Commit**

```bash
git add -A apps/react
git commit -m "feat(ui): multilingua it/en, tema chiaro/scuro e infrastruttura di test"
```

---

## Task 13: Client API, proxy di Vite e QueryClient

**Files:**
- Create: `apps/react/src/lib/api.ts`, `apps/react/src/lib/queryKeys.ts`, `apps/react/src/test/render.tsx`
- Replace: `apps/react/src/lib/queryClient.ts`
- Modify: `apps/react/vite.config.ts`, `apps/react/.env`, `apps/react/.env.example`, `apps/react/src/env.d.ts`, `apps/react/CLAUDE.md`
- Test: `apps/react/src/lib/api.test.ts`, `apps/react/src/lib/queryClient.test.ts`

**Interfaces:**
- Consumes: `i18n` (Task 12), `server` MSW (Task 12).
- Produces: da `@/lib/api`: `type ApiErrorKind = 'unauthenticated' | 'forbidden' | 'csrf' | 'validation' | 'throttled' | 'network' | 'server'`, `type HttpMethod`, `class ApiError` (`status`, `kind`, `message`, `fieldErrors: Record<string, string[]>`, `meta: Record<string, unknown>`, `retryAfter: number | null`), `isApiError(error: unknown, kind?: ApiErrorKind): error is ApiError`, `request(method, path, body?): Promise<unknown>`, `requestData<T>(method, path, schema: z.ZodType<T>, body?): Promise<T>`. Da `@/lib/queryKeys`: `userQueryKey`, `isUserQuery(key)`. Da `@/lib/queryClient`: `createQueryClient(options?: { retry?: boolean }): QueryClient`, `queryClient`. Da `@/test/render`: `renderRoutes(routes, initialEntries?, options?)` → `{ router, queryClient, user, ...RenderResult }`.

- [ ] **Step 1: Scrivi i test**

`apps/react/src/lib/api.test.ts`:
```ts
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isApiError, request, requestData } from '@/lib/api'
import { server } from '@/test/server'

describe('api client', () => {
  it('sends the XSRF token and the interface language', async () => {
    document.cookie = 'XSRF-TOKEN=abc%3D; path=/'
    // Oggetto contenitore: TypeScript non segue le assegnazioni fatte dentro una callback
    const captured: { headers?: Headers } = {}
    server.use(
      http.post('/api/ping', ({ request: incoming }) => {
        captured.headers = incoming.headers
        return HttpResponse.json({ ok: true })
      }),
    )

    await expect(request('POST', '/api/ping', { a: 1 })).resolves.toEqual({ ok: true })
    expect(captured.headers?.get('X-XSRF-TOKEN')).toBe('abc=')
    expect(captured.headers?.get('Accept-Language')).toBe('it')
  })

  it('fetches the CSRF cookie before the first write', async () => {
    let csrfCalls = 0
    server.use(
      http.get('/sanctum/csrf-cookie', () => {
        csrfCalls += 1
        document.cookie = 'XSRF-TOKEN=fresh; path=/'
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('/api/ping', ({ request: incoming }) => HttpResponse.json({ token: incoming.headers.get('X-XSRF-TOKEN') })),
    )

    await expect(request('POST', '/api/ping')).resolves.toEqual({ token: 'fresh' })
    expect(csrfCalls).toBe(1)
  })

  it('maps validation errors with field messages and meta', async () => {
    document.cookie = 'XSRF-TOKEN=x; path=/'
    server.use(
      http.post('/api/ping', () =>
        HttpResponse.json({ message: 'Dati non validi.', errors: { email: ['Obbligatoria.'] }, meta: { attempts_left: 2 } }, { status: 422 }),
      ),
    )

    const error = await request('POST', '/api/ping').catch((caught: unknown) => caught)

    expect(isApiError(error, 'validation')).toBe(true)
    if (!isApiError(error)) return
    expect(error.fieldErrors.email).toEqual(['Obbligatoria.'])
    expect(error.meta.attempts_left).toBe(2)
  })

  it('reads Retry-After when throttled', async () => {
    document.cookie = 'XSRF-TOKEN=x; path=/'
    server.use(http.post('/api/ping', () => HttpResponse.json({ message: 'Troppi.' }, { status: 429, headers: { 'Retry-After': '42' } })))

    const error = await request('POST', '/api/ping').catch((caught: unknown) => caught)

    expect(isApiError(error, 'throttled')).toBe(true)
    if (!isApiError(error)) return
    expect(error.retryAfter).toBe(42)
  })

  it('renews the CSRF token once after a 419', async () => {
    document.cookie = 'XSRF-TOKEN=stale; path=/'
    let attempts = 0
    server.use(
      http.post('/api/ping', () => {
        attempts += 1
        return attempts === 1 ? HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 }) : HttpResponse.json({ ok: true })
      }),
    )

    await expect(request('POST', '/api/ping')).resolves.toEqual({ ok: true })
    expect(attempts).toBe(2)
  })

  it('returns null for empty responses', async () => {
    document.cookie = 'XSRF-TOKEN=x; path=/'
    server.use(http.post('/api/ping', () => new HttpResponse(null, { status: 204 })))

    await expect(request('POST', '/api/ping')).resolves.toBeNull()
  })

  it('rejects responses that do not match the schema', async () => {
    server.use(http.get('/api/thing', () => HttpResponse.json({ id: 'not-a-number' })))

    await expect(requestData('GET', '/api/thing', z.object({ id: z.number() }))).rejects.toThrow()
  })

  it('reports network failures', async () => {
    server.use(http.get('/api/down', () => HttpResponse.error()))

    const error = await request('GET', '/api/down').catch((caught: unknown) => caught)

    expect(isApiError(error, 'network')).toBe(true)
  })
})
```

`apps/react/src/lib/queryClient.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { createQueryClient } from '@/lib/queryClient'
import { userQueryKey } from '@/lib/queryKeys'

describe('query client', () => {
  it('re-checks the current user when another request returns 401', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(userQueryKey, { id: 1 })

    await client
      .fetchQuery({
        queryKey: ['other'],
        queryFn: () => Promise.reject(new ApiError({ status: 401, kind: 'unauthenticated', message: 'Unauthenticated.' })),
      })
      .catch(() => undefined)

    expect(client.getQueryState(userQueryKey)?.isInvalidated).toBe(true)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL (`@/lib/api` non esiste).

- [ ] **Step 3: Client API**

`apps/react/src/lib/api.ts`:
```ts
import { z } from 'zod'
import i18n from '@/lib/i18n'

export type ApiErrorKind = 'unauthenticated' | 'forbidden' | 'csrf' | 'validation' | 'throttled' | 'network' | 'server'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface ApiErrorInit {
  status: number
  kind: ApiErrorKind
  message: string
  fieldErrors?: Record<string, string[]>
  meta?: Record<string, unknown>
  retryAfter?: number | null
}

/** Errore unico per tutte le chiamate: la UI decide cosa mostrare in base a `kind`. */
export class ApiError extends Error {
  readonly status: number
  readonly kind: ApiErrorKind
  readonly fieldErrors: Record<string, string[]>
  readonly meta: Record<string, unknown>
  readonly retryAfter: number | null

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.kind = init.kind
    this.fieldErrors = init.fieldErrors ?? {}
    this.meta = init.meta ?? {}
    this.retryAfter = init.retryAfter ?? null
  }
}

export const isApiError = (error: unknown, kind?: ApiErrorKind): error is ApiError =>
  error instanceof ApiError && (kind === undefined || error.kind === kind)

const errorBodySchema = z.object({
  message: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

const kindFromStatus = (status: number): ApiErrorKind => {
  switch (status) {
    case 401:
      return 'unauthenticated'
    case 403:
      return 'forbidden'
    case 419:
      return 'csrf'
    case 422:
      return 'validation'
    case 429:
      return 'throttled'
    default:
      return 'server'
  }
}

// URL assoluto sulla stessa origine: in sviluppo il proxy di Vite inoltra /api e /sanctum a Laravel
const toUrl = (path: string): string => new URL(path, window.location.origin).toString()

const readCookie = (name: string): string | null => {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}

let csrfRequest: Promise<void> | null = null

const refreshCsrfCookie = (): Promise<void> => {
  csrfRequest ??= fetch(toUrl('/sanctum/csrf-cookie'), { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(() => undefined)
    .finally(() => {
      csrfRequest = null
    })
  return csrfRequest
}

const parseRetryAfter = (value: string | null): number | null => {
  if (!value) return null
  const seconds = Number.parseInt(value, 10)
  return Number.isNaN(seconds) ? null : seconds
}

const send = async (method: HttpMethod, path: string, body: unknown): Promise<Response> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': i18n.language,
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const xsrf = readCookie('XSRF-TOKEN')
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf

  try {
    return await fetch(toUrl(path), {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError({ status: 0, kind: 'network', message: i18n.t('errors.network') })
  }
}

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Richiesta all'API Laravel: restituisce il JSON (null se vuoto) o lancia `ApiError`. */
export const request = async (method: HttpMethod, path: string, body?: unknown): Promise<unknown> => {
  if (method !== 'GET' && !readCookie('XSRF-TOKEN')) await refreshCsrfCookie()

  let response = await send(method, path, body)
  if (response.status === 419) {
    // Token CSRF scaduto: si rinnova e si riprova una sola volta
    await refreshCsrfCookie()
    response = await send(method, path, body)
  }

  const payload = await readJson(response)
  if (response.ok) return payload

  const parsed = errorBodySchema.safeParse(payload)
  const data: z.infer<typeof errorBodySchema> = parsed.success ? parsed.data : {}
  throw new ApiError({
    status: response.status,
    kind: kindFromStatus(response.status),
    message: data.message ?? i18n.t('errors.generic'),
    fieldErrors: data.errors,
    meta: data.meta,
    retryAfter: parseRetryAfter(response.headers.get('Retry-After')),
  })
}

/** Come `request`, ma valida la risposta con uno schema zod (niente cast di tipo). */
export const requestData = async <T>(method: HttpMethod, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> =>
  schema.parse(await request(method, path, body))
```

- [ ] **Step 4: Chiavi di query e QueryClient**

`apps/react/src/lib/queryKeys.ts`:
```ts
export const userQueryKey: readonly ['auth', 'user'] = ['auth', 'user']

export const isUserQuery = (key: readonly unknown[]): boolean => key[0] === 'auth' && key[1] === 'user'
```

`apps/react/src/lib/queryClient.ts` (file completo):
```ts
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/lib/api'
import { isUserQuery, userQueryKey } from '@/lib/queryKeys'

interface QueryClientOptions {
  retry?: boolean
}

/**
 * QueryClient dell'app: nessun retry sugli errori 4xx e sessione scaduta gestita in un punto solo
 * (un 401 fa ricontrollare l'utente e le route protette mandano al login).
 */
export const createQueryClient = (options: QueryClientOptions = {}): QueryClient => {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isApiError(error, 'unauthenticated') && !isUserQuery(query.queryKey)) {
          void client.invalidateQueries({ queryKey: userQueryKey })
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isApiError(error, 'unauthenticated')) void client.invalidateQueries({ queryKey: userQueryKey })
      },
    }),
    defaultOptions: {
      queries: {
        // I dati restano "freschi" per 30s: evita di rifare la stessa richiesta a ogni mount
        staleTime: 30_000,
        retry:
          options.retry === false
            ? false
            : (failureCount, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  })
  return client
}

export const queryClient = createQueryClient()
```

- [ ] **Step 5: Proxy di Vite e variabili d'ambiente**

In `apps/react/vite.config.ts`, dentro `defineConfig`, dopo `const env = …` aggiungi:
```ts
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost'
```
e nell'oggetto `server` aggiungi:
```ts
      // Stessa origine per il browser: cookie di prima parte, niente CORS
      proxy: {
        '/api': { target: apiTarget },
        '/sanctum': { target: apiTarget },
      },
```

In `apps/react/.env` e `apps/react/.env.example` sostituisci il blocco di `VITE_API_URL` con:
```env
# Backend Laravel (Sail, porta 80): letto solo da vite.config.ts per il proxy di /api e /sanctum
API_PROXY_TARGET=http://localhost
```
In `apps/react/src/env.d.ts` rimuovi la riga `readonly VITE_API_URL: string`.
In `apps/react/CLAUDE.md`, sezione "Ambiente", sostituisci la riga "Backend: API Laravel in `../laravel` (Sail), base URL in `VITE_API_URL`." con:
```markdown
- Backend: API Laravel in `../laravel` (Sail). In sviluppo il proxy di Vite inoltra `/api` e `/sanctum` a
  `API_PROXY_TARGET`: il codice chiama solo percorsi relativi, sempre tramite `src/lib/api.ts`.
```

- [ ] **Step 6: Helper di render**

`apps/react/src/test/render.tsx`:
```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/lib/queryClient'

type Entry = string | { pathname: string; search?: string; state?: unknown }

interface RenderRoutesOptions {
  advanceTimers?: (delay: number) => void
}

/** Monta le route indicate con tutti i provider dell'app (query senza retry). */
export const renderRoutes = (routes: RouteObject[], initialEntries: Entry[] = ['/'], options: RenderRoutesOptions = {}) => {
  const queryClient = createQueryClient({ retry: false })
  const router = createMemoryRouter(routes, { initialEntries })
  const user = userEvent.setup({ advanceTimers: options.advanceTimers })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="holidays-theme">
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...view, router, queryClient, user }
}
```

- [ ] **Step 7: Esegui i test**

Run: `npm test`
Expected: tutti PASS (8 test del client, 1 del QueryClient, precedenti).

- [ ] **Step 8: Commit**

```bash
git add -A apps/react
git commit -m "feat(api): client http con csrf, proxy vite e gestione centralizzata del 401"
```

---

## Task 14: Stato di autenticazione, route protette e titoli di pagina

**Files:**
- Create: `apps/react/src/features/auth/api.ts`, `apps/react/src/features/auth/ProtectedRoute.tsx`, `apps/react/src/features/auth/GuestRoute.tsx`
- Create: `apps/react/src/lib/safeRedirect.ts`, `apps/react/src/lib/routeTitle.ts`, `apps/react/src/lib/appName.ts`, `apps/react/src/lib/initials.ts`
- Create: `apps/react/src/components/layout/{FullPageLoader,ServerErrorState,PageHeading,SkipLink,RouteAnnouncer,RootLayout}.tsx`
- Create: `apps/react/src/pages/NotFoundPage.tsx`, `apps/react/src/test/fixtures.ts`
- Test: `apps/react/src/lib/safeRedirect.test.ts`, `apps/react/src/features/auth/routeGuards.test.tsx`

**Interfaces:**
- Consumes: `request`, `requestData`, `isApiError` (Task 13), `userQueryKey` (Task 13), `renderRoutes` (Task 13).
- Produces: da `@/features/auth/api`: `userSchema`, `type User`, `codeErrorMetaSchema` (`attempts_left?`, `restart?`, `limit_reached?`), `interface LoginInput { email: string; password: string }`, `useCurrentUser()` (dati `User | null`: `null` = logout esplicito), `useLogin()`, `useVerifyCode()` (al successo salva l'utente in cache), `useResendCode()`, `useLogout()` (a fine mutation imposta `null`). `safeRedirect(target: string | null | undefined, fallback?: string): string`. `useRouteTitleKey(): string | null` (legge `handle.titleKey` delle route). `APP_NAME`. `initials(name: string): string`. Componenti `<ProtectedRoute />`, `<GuestRoute />`, `<RootLayout />` (annunci di pagina + Toaster), `<PageHeading title description? icon? />` (`h1#page-title`, `tabIndex=-1`), `<SkipLink />`, `<FullPageLoader />`, `<ServerErrorState onRetry />`, `<NotFoundPage />`. Da `@/test/fixtures`: `adminUser: User` (Giulia Rossi, admin).

- [ ] **Step 1: Scrivi i test**

`apps/react/src/lib/safeRedirect.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { safeRedirect } from '@/lib/safeRedirect'

describe('safeRedirect', () => {
  it('keeps internal paths with their query string', () => {
    expect(safeRedirect('/admin/users?status=invited')).toBe('/admin/users?status=invited')
  })

  it.each([null, undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/login', '/login?x=1'])(
    'falls back to the home page for %s',
    (target) => {
      expect(safeRedirect(target)).toBe('/')
    },
  )
})
```

`apps/react/src/features/auth/routeGuards.test.tsx`:
```tsx
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import GuestRoute from '@/features/auth/GuestRoute'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import { userQueryKey } from '@/lib/queryKeys'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { element: <GuestRoute />, children: [{ path: '/login', element: <p>login-page</p> }] },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <p>home-page</p> },
      { path: '/admin', element: <p>admin-page</p> },
    ],
  },
]

const signedIn = () => server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))

describe('route guards', () => {
  it('sends guests to the login page with a way back', async () => {
    const { router } = renderRoutes(routes, ['/admin?tab=2'])

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?redirect=%2Fadmin%3Ftab%3D2')
  })

  it('shows protected pages to signed-in users', async () => {
    signedIn()
    renderRoutes(routes, ['/'])

    expect(await screen.findByText('home-page')).toBeInTheDocument()
  })

  it('sends signed-in users from the login page to the redirect target', async () => {
    signedIn()
    renderRoutes(routes, ['/login?redirect=%2Fadmin'])

    expect(await screen.findByText('admin-page')).toBeInTheDocument()
  })

  it('ignores external redirect targets', async () => {
    signedIn()
    renderRoutes(routes, ['/login?redirect=https%3A%2F%2Fevil.test'])

    expect(await screen.findByText('home-page')).toBeInTheDocument()
  })

  it('marks the session as expired when the user check starts failing', async () => {
    signedIn()
    const { router, queryClient } = renderRoutes(routes, ['/admin'])
    await screen.findByText('admin-page')

    server.use(http.get('/api/auth/user', () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })))
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKey })
    })

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?redirect=%2Fadmin&reason=expired')
  })

  it('shows the signed-out notice after a logout', async () => {
    signedIn()
    const { router, queryClient } = renderRoutes(routes, ['/'])
    await screen.findByText('home-page')

    act(() => {
      queryClient.setQueryData(userQueryKey, null)
    })

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?reason=logged-out')
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL (moduli mancanti).

- [ ] **Step 3: Utilità**

`apps/react/src/lib/safeRedirect.ts`:
```ts
/**
 * Destinazione dopo il login: solo percorsi interni. Blocca URL esterni, `//host`, schemi come
 * `javascript:` e il ritorno alla pagina di login (evita i loop).
 */
export const safeRedirect = (target: string | null | undefined, fallback = '/'): string => {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback
  if (target === '/login' || target.startsWith('/login?') || target.startsWith('/login/')) return fallback
  return target
}
```

`apps/react/src/lib/routeTitle.ts`:
```ts
import { useMatches } from 'react-router'
import { z } from 'zod'

const handleSchema = z.object({ titleKey: z.string() })

/** Chiave di traduzione del titolo della route più interna che lo dichiara in `handle.titleKey`. */
export const useRouteTitleKey = (): string | null => {
  const matches = useMatches()
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const parsed = handleSchema.safeParse(matches[index].handle)
    if (parsed.success) return parsed.data.titleKey
  }
  return null
}
```

`apps/react/src/lib/appName.ts`:
```ts
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Holidays'
```

`apps/react/src/lib/initials.ts`:
```ts
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
```

- [ ] **Step 4: Hook di autenticazione**

`apps/react/src/features/auth/api.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'
import { userQueryKey } from '@/lib/queryKeys'

export const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['employee', 'manager', 'admin']),
  role_label: z.string(),
  status: z.enum(['invited', 'active', 'disabled']),
  locale: z.enum(['it', 'en']),
  last_login_at: z.string().nullable(),
})

export type User = z.infer<typeof userSchema>

const userResponseSchema = z.object({ data: userSchema })

/** Metadati degli errori sul codice restituiti da Laravel. */
export const codeErrorMetaSchema = z.object({
  attempts_left: z.number().optional(),
  restart: z.boolean().optional(),
  limit_reached: z.boolean().optional(),
})

export interface LoginInput {
  email: string
  password: string
}

const fetchCurrentUser = async (): Promise<User> => (await requestData('GET', '/api/auth/user', userResponseSchema)).data

/** Utente corrente. `null` = logout esplicito; errore 401 = nessuna sessione (o sessione scaduta). */
export const useCurrentUser = () =>
  useQuery<User | null>({ queryKey: userQueryKey, queryFn: fetchCurrentUser, retry: false, staleTime: 5 * 60_000 })

export const useLogin = () => useMutation({ mutationFn: (input: LoginInput) => request('POST', '/api/auth/login', input) })

export const useVerifyCode = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => (await requestData('POST', '/api/auth/two-factor', userResponseSchema, { code })).data,
    onSuccess: (user) => {
      queryClient.setQueryData(userQueryKey, user)
    },
  })
}

export const useResendCode = () => useMutation({ mutationFn: () => request('POST', '/api/auth/two-factor/resend') })

export const useLogout = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request('POST', '/api/auth/logout'),
    onSettled: () => {
      // null (e non "nessun dato"): le route protette mostrano l'avviso di uscita
      queryClient.setQueryData(userQueryKey, null)
    },
  })
}
```

- [ ] **Step 5: Dati di prova e componenti di layout di base**

`apps/react/src/test/fixtures.ts`:
```ts
import type { User } from '@/features/auth/api'

export const adminUser: User = {
  id: 1,
  name: 'Giulia Rossi',
  email: 'admin@holidays.test',
  role: 'admin',
  role_label: 'HR / Admin',
  status: 'active',
  locale: 'it',
  last_login_at: null,
}
```


`apps/react/src/components/layout/FullPageLoader.tsx`:
```tsx
import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const FullPageLoader = () => {
  const { t } = useTranslation()
  return (
    <div role="status" className="grid min-h-svh place-items-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}

export default FullPageLoader
```

`apps/react/src/components/layout/ServerErrorState.tsx`:
```tsx
import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ServerErrorStateProps {
  onRetry: () => void
}

const ServerErrorState = ({ onRetry }: ServerErrorStateProps) => {
  const { t } = useTranslation()
  return (
    <main id="main" className="grid min-h-svh place-items-center px-4">
      <Alert className="max-w-md">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{t('errors.serverTitle')}</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>{t('errors.network')}</p>
          <Button variant="outline" size="sm" className="justify-self-start" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  )
}

export default ServerErrorState
```

`apps/react/src/components/layout/PageHeading.tsx`:
```tsx
import type { ReactNode } from 'react'

interface PageHeadingProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
}

/** Titolo di pagina: `#page-title` riceve il focus a ogni cambio di pagina (vedi RouteAnnouncer). */
const PageHeading = ({ title, description, icon }: PageHeadingProps) => (
  <div className="mb-7 grid gap-2">
    {icon && (
      <span className="mb-2 inline-flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">{icon}</span>
    )}
    <h1 id="page-title" tabIndex={-1} className="text-[1.65rem] leading-tight font-semibold tracking-tight outline-none">
      {title}
    </h1>
    {description && <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
  </div>
)

export default PageHeading
```

`apps/react/src/components/layout/SkipLink.tsx`:
```tsx
import { useTranslation } from 'react-i18next'

const SkipLink = () => {
  const { t } = useTranslation()
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-card px-4 py-2 text-sm font-medium shadow-lg focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
    >
      {t('nav.skip')}
    </a>
  )
}

export default SkipLink
```

`apps/react/src/components/layout/RouteAnnouncer.tsx`:
```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { APP_NAME } from '@/lib/appName'
import { useRouteTitleKey } from '@/lib/routeTitle'

/** A ogni cambio di pagina: titolo del documento, focus sull'h1 e annuncio per i lettori di schermo. */
const RouteAnnouncer = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const titleKey = useRouteTitleKey()
  const title = titleKey ? t(titleKey) : null

  useEffect(() => {
    if (!title) return
    document.title = `${title} · ${APP_NAME}`
    const frame = window.requestAnimationFrame(() => document.getElementById('page-title')?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [title, location.pathname])

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {title ? t('a11y.pageAnnouncement', { title }) : ''}
    </div>
  )
}

export default RouteAnnouncer
```

`apps/react/src/components/layout/RootLayout.tsx`:
```tsx
import { Outlet } from 'react-router'
import RouteAnnouncer from '@/components/layout/RouteAnnouncer'
import { Toaster } from '@/components/ui/sonner'

const RootLayout = () => (
  <>
    <RouteAnnouncer />
    <Outlet />
    <Toaster position="bottom-right" />
  </>
)

export default RootLayout
```

`apps/react/src/pages/NotFoundPage.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'

const NotFoundPage = () => {
  const { t } = useTranslation()
  return (
    <main id="main" className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-md">
        <PageHeading title={t('notFound.title')} description={t('notFound.description')} />
        <Button asChild>
          <Link to="/">{t('notFound.back')}</Link>
        </Button>
      </div>
    </main>
  )
}

export default NotFoundPage
```

- [ ] **Step 6: Guardie delle route**

`apps/react/src/features/auth/ProtectedRoute.tsx`:
```tsx
import { Navigate, Outlet, useLocation } from 'react-router'
import FullPageLoader from '@/components/layout/FullPageLoader'
import ServerErrorState from '@/components/layout/ServerErrorState'
import { useCurrentUser } from '@/features/auth/api'
import { isApiError } from '@/lib/api'

const ProtectedRoute = () => {
  const { data: user, error, isPending, refetch } = useCurrentUser()
  const location = useLocation()

  if (isPending) return <FullPageLoader />
  if (user === null) return <Navigate to="/login?reason=logged-out" replace />
  if (error && !isApiError(error, 'unauthenticated')) return <ServerErrorState onRetry={() => void refetch()} />

  if (error || !user) {
    const params = new URLSearchParams({ redirect: `${location.pathname}${location.search}` })
    // Dati ancora in cache ma 401: la sessione c'era ed è scaduta
    if (user) params.set('reason', 'expired')
    return <Navigate to={`/login?${params.toString()}`} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
```

`apps/react/src/features/auth/GuestRoute.tsx`:
```tsx
import { Navigate, Outlet, useSearchParams } from 'react-router'
import FullPageLoader from '@/components/layout/FullPageLoader'
import { useCurrentUser } from '@/features/auth/api'
import { safeRedirect } from '@/lib/safeRedirect'

/** Pagine di accesso: chi ha già una sessione valida va direttamente alla destinazione. */
const GuestRoute = () => {
  const { data: user, isPending, isError } = useCurrentUser()
  const [searchParams] = useSearchParams()

  if (isPending) return <FullPageLoader />
  if (user && !isError) return <Navigate to={safeRedirect(searchParams.get('redirect'))} replace />

  return <Outlet />
}

export default GuestRoute
```

- [ ] **Step 7: Esegui test, lint e tipi**

```bash
npm test
npm run lint
npx tsc -b
```
Expected: tutti PASS; nessun errore di lint o di tipi.

- [ ] **Step 8: Commit**

```bash
git add -A apps/react
git commit -m "feat(auth): stato di autenticazione, route protette e annunci di pagina"
```

---

## Task 15: Layout di accesso e pagina di login

**Files:**
- Create: `apps/react/src/hooks/useCountdown.ts`, `apps/react/src/components/PasswordInput.tsx`
- Create: `apps/react/src/components/layout/TeamCalendar.tsx`, `apps/react/src/components/layout/AuthLayout.tsx`
- Create: `apps/react/src/features/auth/pages/LoginPage.tsx`
- Test: `apps/react/src/hooks/useCountdown.test.ts`, `apps/react/src/features/auth/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useLogin`, `LoginInput` (Task 14), `isApiError` (Task 13), `PageHeading` (Task 14), `LanguageMenu`, `ThemeMenu`, `Logo` (Task 12), `renderRoutes` (Task 13), `expectNoA11yViolations` (Task 12).
- Produces: `useCountdown(initialSeconds?: number): { secondsLeft: number; start: (seconds: number) => void }`; `<PasswordInput {...inputProps} />`; `<AuthLayout />` (Outlet dentro `main#main`); `<LoginPage />`: al successo naviga a `/login/verify` con `state: { email }` e conserva `?redirect=`; avvisi da `?reason=expired|logged-out|restart`.

- [ ] **Step 1: Scrivi i test**

`apps/react/src/hooks/useCountdown.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from '@/hooks/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down from the initial seconds to zero', () => {
    const { result } = renderHook(() => useCountdown(3))
    expect(result.current.secondsLeft).toBe(3)

    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(result.current.secondsLeft).toBe(0)
  })

  it('restarts when start() is called', () => {
    const { result } = renderHook(() => useCountdown())
    expect(result.current.secondsLeft).toBe(0)

    act(() => {
      result.current.start(30)
    })
    expect(result.current.secondsLeft).toBe(30)
  })
})
```

`apps/react/src/features/auth/pages/LoginPage.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import LoginPage from '@/features/auth/pages/LoginPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/login/verify', element: <p>verify-page</p> },
]

describe('LoginPage', () => {
  it('validates the fields before calling the API and focuses the first error', async () => {
    const { user } = renderRoutes(routes, ['/login'])

    await user.click(await screen.findByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Inserisci la tua email.')).toBeInTheDocument()
    expect(screen.getByText('Inserisci la password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('rejects a malformed email', async () => {
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'giulia')
    await user.type(screen.getByLabelText('Password'), 'segreta')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Inserisci un indirizzo email valido, ad esempio nome@azienda.it.')).toBeInTheDocument()
  })

  it('moves to the code step with valid credentials', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ two_factor: true })
      }),
    )
    const { user, router } = renderRoutes(routes, ['/login?redirect=%2Fadmin'])

    await user.type(await screen.findByLabelText('Email'), '  admin@holidays.test ')
    await user.type(screen.getByLabelText('Password'), 'segreta')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('verify-page')).toBeInTheDocument()
    expect(body).toEqual({ email: 'admin@holidays.test', password: 'segreta' })
    expect(router.state.location.state).toEqual({ email: 'admin@holidays.test' })
    expect(router.state.location.search).toBe('?redirect=%2Fadmin')
  })

  it('shows a generic error and clears the password on wrong credentials', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ message: 'x', errors: { email: ['x'] } }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'admin@holidays.test')
    await user.type(screen.getByLabelText('Password'), 'sbagliata')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Email o password non corrette. Controlla i dati e riprova.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveFocus()
  })

  it('locks the form while throttled', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '30' } })))
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'admin@holidays.test')
    await user.type(screen.getByLabelText('Password'), 'sbagliata')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Troppi tentativi. Potrai riprovare tra 30 secondi.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continua' })).toBeDisabled()
  })

  it('shows the notice passed in the URL', async () => {
    renderRoutes(routes, ['/login?reason=expired'])

    expect(await screen.findByText('Sessione scaduta. Accedi di nuovo.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderRoutes(routes, ['/login'])
    await screen.findByRole('button', { name: 'Continua' })

    await expectNoA11yViolations(container)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL (moduli mancanti).

- [ ] **Step 3: Conto alla rovescia e campo password**

`apps/react/src/hooks/useCountdown.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'

interface Countdown {
  secondsLeft: number
  start: (seconds: number) => void
}

/** Conto alla rovescia in secondi. `start()` va chiamato da un gestore di evento, non durante il render. */
export const useCountdown = (initialSeconds = 0): Countdown => {
  const [deadline, setDeadline] = useState<number | null>(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : null))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) window.clearInterval(id)
    }, 250)
    return () => window.clearInterval(id)
  }, [deadline])

  const start = useCallback((seconds: number) => {
    const current = Date.now()
    setNow(current)
    setDeadline(current + seconds * 1000)
  }, [])

  return { secondsLeft: deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000)), start }
}
```

`apps/react/src/components/PasswordInput.tsx`:
```tsx
import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Campo password con pulsante "mostra" (etichetta fissa + aria-pressed, come da pattern ARIA). */
const PasswordInput = ({ className, ...props }: ComponentProps<'input'>) => {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
        aria-label={t('common.showPassword')}
        className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
      </button>
    </div>
  )
}

export default PasswordInput
```

- [ ] **Step 4: Layout delle pagine di accesso**

`apps/react/src/components/layout/TeamCalendar.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// Ottobre 2026 inizia di giovedì: tre caselle vuote in testa (settimana da lunedì)
const LEADING_BLANKS = 3
const DAYS_IN_MONTH = 31
const LEAVE_DAYS = [12, 13, 14, 15, 16, 21, 22, 23]
const PERMIT_DAYS = [8, 29]
// 5 ottobre 2026 è un lunedì: da lì si ricavano le iniziali dei giorni nella lingua corrente
const MONDAY = new Date(2026, 9, 5)

/** Calendario decorativo del pannello di accesso: il contenuto utile è nella didascalia. */
const TeamCalendar = () => {
  const { t, i18n } = useTranslation()
  const weekdayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' })
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    weekdayFormat.format(new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + index)),
  )
  const cells = [...Array.from({ length: LEADING_BLANKS }, () => null), ...Array.from({ length: DAYS_IN_MONTH }, (_, index) => index + 1)]

  return (
    <figure className="w-full max-w-sm">
      <div className="grid grid-cols-7 gap-1.5 text-center" aria-hidden="true">
        {weekdays.map((day, index) => (
          <span key={index} className="pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase opacity-70">
            {day}
          </span>
        ))}
        {cells.map((day, index) => (
          <span
            key={index}
            className={cn(
              'flex aspect-square items-center justify-center rounded-md text-[13px] font-medium tabular-nums',
              day === null && 'invisible',
              day !== null && LEAVE_DAYS.includes(day) && 'bg-primary text-primary-foreground',
              day !== null && PERMIT_DAYS.includes(day) && 'border border-primary/70',
              day !== null && !LEAVE_DAYS.includes(day) && !PERMIT_DAYS.includes(day) && 'bg-card/55',
            )}
          >
            {day}
          </span>
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] opacity-85">
        <span className="font-semibold">{t('brand.calendar')}</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" />
          {t('brand.legendLeave')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-primary" aria-hidden="true" />
          {t('brand.legendPermit')}
        </span>
      </figcaption>
    </figure>
  )
}

export default TeamCalendar
```

`apps/react/src/components/layout/AuthLayout.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import Logo from '@/components/brand/Logo'
import SkipLink from '@/components/layout/SkipLink'
import TeamCalendar from '@/components/layout/TeamCalendar'
import LanguageMenu from '@/components/preferences/LanguageMenu'
import ThemeMenu from '@/components/preferences/ThemeMenu'
import { APP_NAME } from '@/lib/appName'

const CURRENT_YEAR = new Date().getFullYear()

const AuthLayout = () => {
  const { t } = useTranslation()

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <SkipLink />
      <aside className="hidden flex-col justify-between bg-primary-soft px-12 py-10 text-primary-soft-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <div className="grid max-w-md gap-8">
          <div className="grid gap-3">
            <p className="text-[2.1rem] leading-[1.1] font-semibold tracking-tight">{t('brand.tagline')}</p>
            <p className="text-[15px] leading-relaxed opacity-80">{t('brand.subtitle')}</p>
          </div>
          <TeamCalendar />
        </div>
        <p className="text-[12.5px] opacity-70">
          © {CURRENT_YEAR} {APP_NAME}
        </p>
      </aside>
      <div className="flex min-h-svh flex-col px-4 sm:px-8">
        <header className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-2 lg:invisible">
            <Logo className="size-6 text-primary" />
            <span className="font-semibold tracking-tight">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageMenu />
            <ThemeMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center pt-4 pb-16 outline-none">
          <div className="w-full max-w-[400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AuthLayout
```

- [ ] **Step 5: Pagina di login**

`apps/react/src/features/auth/pages/LoginPage.tsx`:
```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { ArrowRight, CircleAlert, Clock, LoaderCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLogin } from '@/features/auth/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'

type Notice = 'expired' | 'logged-out' | 'restart'

const isNotice = (value: string | null): value is Notice => value === 'expired' || value === 'logged-out' || value === 'restart'

const createLoginSchema = (t: TFunction) =>
  z.object({
    email: z.string().trim().min(1, t('validation.emailRequired')).pipe(z.email(t('validation.emailInvalid'))),
    password: z.string().min(1, t('validation.passwordRequired')),
  })

type LoginValues = z.infer<ReturnType<typeof createLoginSchema>>

const LoginPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useLogin()
  const lock = useCountdown()
  const [failed, setFailed] = useState(false)
  const schema = useMemo(() => createLoginSchema(t), [t])
  const form = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors } = form.formState
  const notice = searchParams.get('reason')
  const redirect = searchParams.get('redirect')

  const onSubmit = form.handleSubmit(async (values) => {
    setFailed(false)
    try {
      await login.mutateAsync(values)
      navigate({ pathname: '/login/verify', search: redirect ? `?${new URLSearchParams({ redirect }).toString()}` : '' }, { state: { email: values.email } })
    } catch (error) {
      if (isApiError(error, 'throttled')) {
        lock.start(error.retryAfter ?? 60)
        return
      }
      setFailed(true)
      form.resetField('password')
      form.setFocus('password')
    }
  })

  return (
    <>
      <PageHeading title={t('login.title')} description={t('login.subtitle')} />
      <div className="grid gap-4">
        {isNotice(notice) && (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{t(`login.notice.${notice}`)}</AlertDescription>
          </Alert>
        )}
        {lock.secondsLeft > 0 ? (
          <Alert>
            <Clock aria-hidden="true" />
            <AlertDescription className="tabular-nums">{t('login.locked', { count: lock.secondsLeft })}</AlertDescription>
          </Alert>
        ) : (
          failed && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{t('login.error')}</AlertDescription>
            </Alert>
          )
        )}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor="email">{t('login.email')}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...form.register('email')}
              />
              <FieldError id="email-error">{errors.email?.message}</FieldError>
            </Field>
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">{t('login.password')}</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...form.register('password')}
              />
              <FieldError id="password-error">{errors.password?.message}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={login.isPending || lock.secondsLeft > 0}>
              {login.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('login.submitting')}
                </>
              ) : (
                <>
                  {t('login.submit')}
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
          </FieldGroup>
        </form>
        <p className="text-center text-[13.5px] text-muted-foreground">{t('login.noAccount')}</p>
      </div>
    </>
  )
}

export default LoginPage
```

Durante il caricamento il pulsante mostra "Verifica in corso…": nei test si clicca "Continua" solo quando il form è fermo.

- [ ] **Step 6: Esegui test, lint e tipi**

```bash
npm test
npm run lint
npx tsc -b
```
Expected: tutti PASS; nessun errore.

- [ ] **Step 7: Commit**

```bash
git add -A apps/react
git commit -m "feat(auth): layout di accesso e pagina di login"
```

---

## Task 16: Pagina del codice di verifica

**Files:**
- Create: `apps/react/src/features/auth/pages/VerifyCodePage.tsx`
- Test: `apps/react/src/features/auth/pages/VerifyCodePage.test.tsx`

**Interfaces:**
- Consumes: `useVerifyCode`, `useResendCode`, `codeErrorMetaSchema` (Task 14), `isApiError` (Task 13), `useCountdown` (Task 15), `safeRedirect` (Task 14), `PageHeading` (Task 14), `renderRoutes` (Task 13), `adminUser` (Task 14).
- Produces: `<VerifyCodePage />`: legge `location.state.email` (opzionale) e `?redirect=`; al successo naviga a `safeRedirect(redirect)`; su `meta.restart` torna a `/login?reason=restart` (conservando `redirect`).

- [ ] **Step 1: Scrivi il test**

`apps/react/src/features/auth/pages/VerifyCodePage.test.tsx`:
```tsx
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import { userQueryKey } from '@/lib/queryKeys'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/login', element: <p>login-page</p> },
  { path: '/login/verify', element: <VerifyCodePage /> },
  { path: '/', element: <p>home-page</p> },
]

const entry = { pathname: '/login/verify', state: { email: 'giulia.rossi@example.test' } }

const acceptCode = (onRequest: (code: unknown) => void) =>
  server.use(
    http.post('/api/auth/two-factor', async ({ request }) => {
      onRequest(await request.json())
      return HttpResponse.json({ data: adminUser })
    }),
  )

describe('VerifyCodePage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the masked email address', async () => {
    renderRoutes(routes, [entry])

    expect(await screen.findByText(/g•••@example\.test/)).toBeInTheDocument()
  })

  it('still works after a refresh without navigation state', async () => {
    renderRoutes(routes, ['/login/verify'])

    expect(await screen.findByText('Abbiamo inviato un codice di 6 cifre al tuo indirizzo email. Scade tra 10 minuti.')).toBeInTheDocument()
  })

  it('submits once after six digits, even when Enter follows', async () => {
    const bodies: unknown[] = []
    acceptCode((body) => bodies.push(body))
    const { user, queryClient } = renderRoutes(routes, [entry])

    await user.type(await screen.findByLabelText('Codice di verifica'), '482913{Enter}')

    expect(await screen.findByText('home-page')).toBeInTheDocument()
    expect(bodies).toEqual([{ code: '482913' }])
    expect(queryClient.getQueryData(userQueryKey)).toMatchObject({ email: 'admin@holidays.test' })
  })

  it('accepts a pasted code with spaces or dashes', async () => {
    const bodies: unknown[] = []
    acceptCode((body) => bodies.push(body))
    const { user } = renderRoutes(routes, [entry])

    await user.click(await screen.findByLabelText('Codice di verifica'))
    await user.paste('482 913')

    expect(await screen.findByText('home-page')).toBeInTheDocument()
    expect(bodies).toEqual([{ code: '482913' }])
  })

  it('reports the attempts left on a wrong code', async () => {
    server.use(
      http.post('/api/auth/two-factor', () =>
        HttpResponse.json({ message: 'Codice non corretto.', errors: { code: ['Codice non corretto.'] }, meta: { attempts_left: 3 } }, { status: 422 }),
      ),
    )
    const { user } = renderRoutes(routes, [entry])

    const input = await screen.findByLabelText('Codice di verifica')
    await user.type(input, '000000')

    expect(await screen.findByText('Codice non corretto. Tentativi rimasti: 3.')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('goes back to the login page when the server asks to restart', async () => {
    server.use(http.post('/api/auth/two-factor', () => HttpResponse.json({ message: 'x', meta: { restart: true } }, { status: 422 })))
    const { user, router } = renderRoutes(routes, [{ ...entry, search: '?redirect=%2Fadmin' }])

    await user.type(await screen.findByLabelText('Codice di verifica'), '000000')

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?reason=restart&redirect=%2Fadmin')
  })

  it('keeps "send a new code" disabled during the cooldown and enables it after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.post('/api/auth/two-factor/resend', () => HttpResponse.json({ message: 'ok' }, { status: 202 })))
    const { user } = renderRoutes(routes, [entry], { advanceTimers: vi.advanceTimersByTime })

    expect(await screen.findByRole('button', { name: /Nuovo codice tra/ })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await user.click(screen.getByRole('button', { name: 'Invia un nuovo codice' }))

    expect(await screen.findByText('Nuovo codice inviato. Il precedente non è più valido.')).toBeInTheDocument()
  })

  it('stops offering new codes when the limit is reached', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.post('/api/auth/two-factor/resend', () => HttpResponse.json({ message: 'x', meta: { limit_reached: true } }, { status: 429 })))
    const { user } = renderRoutes(routes, [entry], { advanceTimers: vi.advanceTimersByTime })
    await screen.findByRole('button', { name: /Nuovo codice tra/ })

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await user.click(screen.getByRole('button', { name: 'Invia un nuovo codice' }))

    expect(await screen.findByText('Hai raggiunto il limite di nuovi codici. Se non lo ricevi, ricomincia l’accesso.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invia un nuovo codice' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderRoutes(routes, [entry])
    await screen.findByLabelText('Codice di verifica')

    await expectNoA11yViolations(container)
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm test -- VerifyCodePage`
Expected: FAIL (`VerifyCodePage` non esiste).

- [ ] **Step 3: Implementa la pagina**

`apps/react/src/features/auth/pages/VerifyCodePage.tsx`:
```tsx
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { ArrowLeft, LoaderCircle, MailOpen, RotateCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { codeErrorMetaSchema, useResendCode, useVerifyCode } from '@/features/auth/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/safeRedirect'

const RESEND_COOLDOWN_SECONDS = 60
const CODE_PATTERN = /^\d{6}$/
const SLOT_CLASS = 'h-14 w-11 sm:h-15 sm:w-12'

const locationStateSchema = z.object({ email: z.string() })

const maskEmail = (email: string): string => {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 1)}•••@${domain}`
}

const metaOf = (error: unknown) => codeErrorMetaSchema.safeParse(isApiError(error) ? error.meta : {})

const VerifyCodePage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const verify = useVerifyCode()
  const resend = useResendCode()
  const cooldown = useCountdown(RESEND_COOLDOWN_SECONDS)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [resendBlocked, setResendBlocked] = useState(false)
  // Evita il doppio invio (auto-invio al sesto numero + Invio): letto solo nei gestori di evento
  const submitting = useRef(false)

  const parsedState = locationStateSchema.safeParse(location.state)
  const email = parsedState.success ? parsedState.data.email : null
  const redirect = searchParams.get('redirect')

  const restartLogin = () => {
    const params = new URLSearchParams({ reason: 'restart' })
    if (redirect) params.set('redirect', redirect)
    navigate(`/login?${params.toString()}`, { replace: true })
  }

  const submit = async (value: string) => {
    if (submitting.current) return
    if (!CODE_PATTERN.test(value)) {
      setError(t('verify.incomplete'))
      return
    }
    submitting.current = true
    setError(null)
    setInfo(null)
    try {
      await verify.mutateAsync(value)
      navigate(safeRedirect(redirect), { replace: true })
    } catch (caught) {
      const meta = metaOf(caught)
      if (meta.success && meta.data.restart) {
        restartLogin()
        return
      }
      if (isApiError(caught, 'throttled')) setError(t('verify.throttled', { count: caught.retryAfter ?? RESEND_COOLDOWN_SECONDS }))
      else if (meta.success && meta.data.attempts_left !== undefined) setError(t('verify.invalid', { count: meta.data.attempts_left }))
      else setError(t('errors.generic'))
      setCode('')
    } finally {
      submitting.current = false
    }
  }

  const onResend = async () => {
    setError(null)
    try {
      await resend.mutateAsync()
      setCode('')
      setInfo(t('verify.resent'))
      cooldown.start(RESEND_COOLDOWN_SECONDS)
    } catch (caught) {
      const meta = metaOf(caught)
      if (meta.success && meta.data.restart) {
        restartLogin()
        return
      }
      if (meta.success && meta.data.limit_reached) {
        setResendBlocked(true)
        setInfo(t('verify.resendLimit'))
        return
      }
      if (isApiError(caught, 'throttled')) {
        cooldown.start(caught.retryAfter ?? RESEND_COOLDOWN_SECONDS)
        return
      }
      setError(t('errors.generic'))
    }
  }

  return (
    <>
      <PageHeading
        icon={<MailOpen className="size-5" aria-hidden="true" />}
        title={t('verify.title')}
        description={email ? t('verify.subtitle', { email: maskEmail(email) }) : t('verify.subtitleUnknown')}
      />
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit(code)
        }}
      >
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="code">{t('verify.label')}</FieldLabel>
          <InputOTP
            id="code"
            maxLength={6}
            value={code}
            onChange={(value) => {
              setCode(value)
              setError(null)
            }}
            onComplete={(value) => void submit(value)}
            pattern={REGEXP_ONLY_DIGITS}
            pasteTransformer={(text) => text.replace(/\D/g, '')}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'code-error' : undefined}
            containerClassName="gap-2 sm:gap-3"
          >
            <InputOTPGroup>
              {[0, 1, 2].map((index) => (
                <InputOTPSlot key={index} index={index} className={SLOT_CLASS} />
              ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              {[3, 4, 5].map((index) => (
                <InputOTPSlot key={index} index={index} className={SLOT_CLASS} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <FieldError id="code-error">{error}</FieldError>
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={verify.isPending}>
          {verify.isPending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              {t('verify.submitting')}
            </>
          ) : (
            t('verify.submit')
          )}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="link" className="px-0" onClick={() => navigate('/login', { replace: true })}>
            <ArrowLeft aria-hidden="true" />
            {t('verify.otherAccount')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="tabular-nums"
            disabled={cooldown.secondsLeft > 0 || resendBlocked || resend.isPending}
            onClick={() => void onResend()}
          >
            <RotateCw aria-hidden="true" />
            {cooldown.secondsLeft > 0 ? t('verify.resendIn', { count: cooldown.secondsLeft }) : t('verify.resend')}
          </Button>
        </div>
        <div aria-live="polite">
          {info && (
            <Alert>
              <AlertDescription>{info}</AlertDescription>
            </Alert>
          )}
        </div>
      </form>
    </>
  )
}

export default VerifyCodePage
```

- [ ] **Step 4: Esegui test, lint e tipi**

```bash
npm test
npm run lint
npx tsc -b
```
Expected: tutti PASS; nessun errore.

- [ ] **Step 5: Commit**

```bash
git add -A apps/react
git commit -m "feat(auth): pagina del codice di verifica con nuovo invio"
```

---

## Task 17: Area riservata, home e collegamento del router

**Files:**
- Create: `apps/react/src/components/layout/AppShell.tsx`, `apps/react/src/pages/HomePage.tsx`, `apps/react/src/routes.tsx`
- Modify: `apps/react/src/main.tsx`
- Delete: `apps/react/src/App.tsx`
- Test: `apps/react/src/components/layout/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useCurrentUser`, `useLogout` (Task 14), `ProtectedRoute`, `GuestRoute`, `RootLayout`, `NotFoundPage`, `PageHeading`, `SkipLink`, `useRouteTitleKey`, `initials` (Task 14), `AuthLayout`, `LoginPage` (Task 15), `VerifyCodePage` (Task 16), `LanguageMenu`, `ThemeMenu`, `Logo` (Task 12).
- Produces: `routes: RouteObject[]` e `router` da `@/routes` (`/login`, `/login/verify`, `/`, `*`, con `handle.titleKey`); `<AppShell />`, `<HomePage />`.

- [ ] **Step 1: Scrivi il test**

`apps/react/src/components/layout/AppShell.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { routes } from '@/routes'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const signedIn = () => server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))

describe('AppShell', () => {
  it('greets the user, sets the page title and focuses the heading', async () => {
    signedIn()
    renderRoutes(routes, ['/'])

    const heading = await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(document.title).toBe('Home · Holidays')
    expect(screen.getByRole('navigation', { name: 'Navigazione principale' })).toBeInTheDocument()
  })

  it('signs out from the account menu', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { user, router } = renderRoutes(routes, ['/'])

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('shows a 404 page for unknown addresses', async () => {
    renderRoutes(routes, ['/non-esiste'])

    expect(await screen.findByRole('heading', { name: 'Pagina non trovata' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    signedIn()
    const { container } = renderRoutes(routes, ['/'])
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await expectNoA11yViolations(container)
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm test -- AppShell`
Expected: FAIL (`@/routes` non esiste).

- [ ] **Step 3: Area riservata e home**

`apps/react/src/components/layout/AppShell.tsx`:
```tsx
import { CalendarDays, ChevronsUpDown, House, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import Logo from '@/components/brand/Logo'
import SkipLink from '@/components/layout/SkipLink'
import LanguageMenu from '@/components/preferences/LanguageMenu'
import ThemeMenu from '@/components/preferences/ThemeMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useCurrentUser, useLogout } from '@/features/auth/api'
import { APP_NAME } from '@/lib/appName'
import { initials } from '@/lib/initials'
import { useRouteTitleKey } from '@/lib/routeTitle'

const AppShell = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const titleKey = useRouteTitleKey()

  // ProtectedRoute garantisce l'utente: questo ramo copre solo l'istante del logout
  if (!user) return null

  return (
    <SidebarProvider>
      <SkipLink />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-12 items-center gap-2.5 px-1">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Logo className="size-5" />
            </span>
            <span className="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">{APP_NAME}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={t('nav.main')}>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={t('nav.home')}>
                      <NavLink to="/" end>
                        <House aria-hidden="true" />
                        <span>{t('nav.home')}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled aria-disabled="true" tooltip={t('nav.leave')}>
                      <CalendarDays aria-hidden="true" />
                      <span>{t('nav.leave')}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{t('nav.soon')}</SidebarMenuBadge>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                    >
                      {initials(user.name)}
                    </span>
                    {/* Il nome accessibile contiene il testo visibile (WCAG 2.5.3) */}
                    <span className="sr-only">{t('account.menu')}: </span>
                    <span className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.role_label}</span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => logout.mutate()}>
                    <LogOut aria-hidden="true" />
                    {t('account.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{titleKey ? t(titleKey) : ''}</p>
          <LanguageMenu />
          <ThemeMenu />
        </header>
        <main id="main" tabIndex={-1} className="w-full max-w-6xl flex-1 px-4 pt-6 pb-16 outline-none md:px-8 md:pt-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AppShell
```

`apps/react/src/pages/HomePage.tsx`:
```tsx
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { Card, CardContent } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/api'

const HomePage = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const firstName = user?.name.split(' ')[0] ?? ''

  return (
    <div className="grid gap-6">
      <PageHeading title={t('home.greeting', { name: firstName })} description={t('home.subtitle')} />
      <Card>
        <CardContent className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-[15px] text-muted-foreground">{t('home.comingSoon')}</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default HomePage
```

- [ ] **Step 4: Router e bootstrap**

`apps/react/src/routes.tsx`:
```tsx
import { createBrowserRouter, type RouteObject } from 'react-router'
import AppShell from '@/components/layout/AppShell'
import AuthLayout from '@/components/layout/AuthLayout'
import RootLayout from '@/components/layout/RootLayout'
import GuestRoute from '@/features/auth/GuestRoute'
import LoginPage from '@/features/auth/pages/LoginPage'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', element: <LoginPage />, handle: { titleKey: 'titles.login' } },
              { path: '/login/verify', element: <VerifyCodePage />, handle: { titleKey: 'titles.verify' } },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [{ path: '/', element: <HomePage />, handle: { titleKey: 'titles.home' } }],
          },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: { titleKey: 'titles.notFound' } },
    ],
  },
]

export const router = createBrowserRouter(routes)
```

```bash
rm src/App.tsx
```
In `apps/react/src/main.tsx` sostituisci `import App from '@/App'` con:
```tsx
import { RouterProvider } from 'react-router'
import { router } from '@/routes'
```
e `<App />` con `<RouterProvider router={router} />` (ordina gli import come gli altri file).

- [ ] **Step 5: Esegui test, lint, tipi e build**

```bash
npm test
npm run lint
npx tsc -b
npm run build
```
Expected: tutti PASS; nessun errore.

- [ ] **Step 6: Prova manuale**

```bash
cd ../laravel && ./vendor/bin/sail artisan migrate:fresh --seed && cd ../react
npm run dev
```
Apri http://localhost:5174 → redirect a `/login`. Accedi con `admin@holidays.test` / `holidays-dev-password`, leggi il codice su http://localhost:8025, inseriscilo: compare "Ciao, Giulia". Prova tema, lingua, sidebar richiusa, menu account → Esci. Ferma il dev server.

- [ ] **Step 7: Commit**

```bash
git add -A apps/react
git commit -m "feat(ui): area riservata con barra laterale e router dell'app"
```

---

## Task 18: Test end-to-end e controlli finali

**Files:**
- Modify: `apps/react/package.json` (script `test:e2e`), `apps/react/tsconfig.node.json`
- Create: `apps/react/playwright.config.ts`, `apps/react/e2e/mailpit.ts`, `apps/react/e2e/login.spec.ts`
- Modify: `apps/react/.gitignore`, `apps/react/CLAUDE.md`, `apps/laravel/CLAUDE.md`

**Interfaces:**
- Consumes: tutta la fase (Sail acceso con `queue`, seeder di sviluppo, dev server su 5174).
- Produces: `npm run test:e2e`; helper `clearInbox(): Promise<void>` e `waitForLoginCode(email: string, timeoutMs?: number): Promise<string>`.

- [ ] **Step 1: Installa Playwright**

```bash
npm install -D @playwright/test@1.63.0 @axe-core/playwright@4.13.0
npx playwright install chromium
```
In `package.json` aggiungi lo script `"test:e2e": "playwright test"`. In `tsconfig.node.json` imposta `"include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts", "e2e"]`. In `apps/react/.gitignore` aggiungi `playwright-report` e `test-results`.

`apps/react/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

// Stessa porta del dev server (DEV_SERVER_PORT nel .env; 5174 finché ats occupa la 5173)
const port = Number(process.env.DEV_SERVER_PORT) || 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'it-IT',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

- [ ] **Step 2: Helper di Mailpit**

`apps/react/e2e/mailpit.ts`:
```ts
import { z } from 'zod'

const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:8025'

const listSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), To: z.array(z.object({ Address: z.string() })) })),
})
const messageSchema = z.object({ Text: z.string() })

export const clearInbox = async (): Promise<void> => {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
}

/** Attende l'email di login (la coda la invia in pochi secondi) e ne estrae il codice. */
export const waitForLoginCode = async (email: string, timeoutMs = 20_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const list = listSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json())
    const message = list.messages.find((item) => item.To.some((to) => to.Address === email))
    if (message) {
      const detail = messageSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json())
      const match = /\b(\d{6})\b/.exec(detail.Text)
      if (match) return match[1]
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Nessun codice ricevuto per ${email}`)
}
```

- [ ] **Step 3: Scrivi i test end-to-end**

`apps/react/e2e/login.spec.ts`:
```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { clearInbox, waitForLoginCode } from './mailpit'

const ADMIN = { email: 'admin@holidays.test', password: 'holidays-dev-password' }
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

const expectNoViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
}

test.beforeEach(async () => {
  await clearInbox()
})

test('an admin signs in with the emailed code and signs out', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?redirect=%2F$/)

  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()

  await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(ADMIN.email))
  await expect(page.getByRole('heading', { name: 'Ciao, Giulia' })).toBeVisible()
  await expect(page).toHaveTitle('Home · Holidays')

  await page.getByRole('button', { name: /Menu account/ }).click()
  await page.getByRole('menuitem', { name: 'Esci' }).click()
  await expect(page.getByText('Sei uscito. A presto.')).toBeVisible()
})

test('sign-in works with the keyboard only', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').focus()
  await page.keyboard.type(ADMIN.email)
  await page.keyboard.press('Tab')
  await page.keyboard.type(ADMIN.password)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()

  // Il campo del codice riceve il focus da solo
  await page.keyboard.type(await waitForLoginCode(ADMIN.email))
  await expect(page.getByRole('heading', { name: 'Ciao, Giulia' })).toBeVisible()
})

test('sign-in pages have no WCAG violations in light and dark mode', async ({ page }) => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible()
    await expectNoViolations(page)
  }

  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await expectNoViolations(page)
})
```

- [ ] **Step 4: Esegui gli E2E**

Prerequisiti: Sail acceso con il servizio `queue` (Task 10), database appena preparato e limiti ai tentativi azzerati.
```bash
cd ../laravel
./vendor/bin/sail artisan migrate:fresh --seed
./vendor/bin/sail artisan cache:clear
cd ../react
npm run test:e2e
```
Expected: 3 test PASS. Se axe segnala contrasti insufficienti, correggi i token in `src/index.css` (non disattivare la regola) e ripeti. Tra due esecuzioni ravvicinate ripeti `cache:clear`: il login ha un limite di 5 tentativi al minuto per email.

- [ ] **Step 5: Documenta i comandi**

In `apps/react/CLAUDE.md`, sezione "Ambiente", sostituisci la riga dei comandi con:
```markdown
- React + TypeScript + **Vite**. Comandi: `npm run dev`, `npm run build`, `npm run lint`, `npm test` (Vitest),
  `npm run test:e2e` (Playwright: richiede Sail acceso con `queue`, `migrate:fresh --seed` e `cache:clear`).
```
In `apps/laravel/CLAUDE.md`, sezione "Ambiente", aggiungi:
```markdown
- Qualità: `sail artisan test --compact`, `sail composer analyse` (Larastan), `sail bin pint --dirty --format agent`.
- Utenti di sviluppo (solo `local`, `sail artisan migrate:fresh --seed`): `admin@holidays.test`, `manager@holidays.test`,
  `employee@holidays.test` con password `holidays-dev-password`; i codici di login arrivano su Mailpit (`localhost:8025`).
- Auth: login = pipeline Fortify con `StartEmailLoginChallenge` (niente sessione fino al codice); codice in
  `TwoFactorChallengeController`; chiavi di sessione in `App\Support\AuthSession`; testi PHP con `App\Support\Translate::text()`.
```

- [ ] **Step 6: Controlli finali di tutta la fase**

```bash
cd /Users/alessandro/Progetti/GitHub/holidays/apps/laravel
./vendor/bin/sail artisan test --compact
./vendor/bin/sail composer analyse
./vendor/bin/sail bin pint --test
./vendor/bin/sail composer audit
cd ../react
npm run lint
npx tsc -b
npm test
npm run build
npm audit --omit=dev
```
Expected: tutto verde. `composer audit` e `npm audit` senza vulnerabilità note (in caso contrario riporta i pacchetti coinvolti prima di procedere).

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandro/Progetti/GitHub/holidays
git add -A apps/react apps/laravel/CLAUDE.md
git commit -m "test(e2e): login completo con mailpit, tastiera e controlli wcag"
```

---

## Fasi successive (piani separati, scritti a fine fase 1)

- **Fase 2 — Recupero password:** feature `resetPasswords` di Fortify, risposta sempre uguale, link verso `FRONTEND_URL`, chiusura sessioni, email "password cambiata", pagine `/forgot-password` e `/reset-password/:token`, regole password (`min:12`, `uncompromised`).
- **Fase 3 — Inviti e gestione utenti:** tabella `invitations`, `UserPolicy`, `/admin/users`, invito/reinvio/annullamento/disattivazione, pagina `/invitation/:token`, `app:create-admin`, informativa privacy.
- **Fase 4 — Profilo e rifinitura:** profilo (cambio password, lingua salvata), avviso di scadenza sessione con "Resta collegato", `Prunable` e scheduling delle pulizie, configurazione degli header della SPA per il deploy (CSP con hash dello script del tema), checklist OWASP ASVS e audit di sicurezza.
