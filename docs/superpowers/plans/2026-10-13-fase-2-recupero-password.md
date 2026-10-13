# Fase 2 — Recupero password: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chi ha dimenticato la password la chiede da `/forgot-password`, riceve un link (valido 60 minuti, uso singolo) e da `/reset-password/:token` sceglie una nuova password. Tutte le sue sessioni vengono chiuse, riceve un'email "password cambiata" e il login successivo chiede comunque il codice.

**Architecture:** il backend usa il password broker di Laravel dentro un `PasswordResetService` nostro, con due controller sottili. Le rotte di accesso sono registrate a mano (`Fortify::ignoreRoutes()`): così si sceglie un limite per ogni rotta e spariscono le rotte Fortify inutilizzate (`user/confirm-password`, `user/confirmed-password-status`, oggi senza limite). La risposta alla richiesta del link è sempre `202` con lo stesso messaggio e la stessa durata minima (`Timebox`), e l'email parte solo per gli utenti `active`. Il frontend ha due pagine nel layout di accesso (react-hook-form + zod, TanStack Query) e un link "Password dimenticata?" nel login.

**Tech Stack:** Laravel 13 · Fortify 1.40 (solo la pipeline di login) · password broker Laravel · PHPUnit · Larastan 6 · React 19 · React Router 8 · TanStack Query 5 · react-hook-form 7 + zod 4 · i18next · Vitest + MSW · Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-09-30-fondamenta-autenticazione-design.md` (§6.3, §6.5, §8.1, §8.2, §9.1, §9.3, §10)

**Perimetro di questa fase:** §6.3 recupero password; regole password §8.2 (`min:12`, `uncompromised`); limiti §8.1 per recupero e reset; pagine `/forgot-password` e `/reset-password/:token`. Fuori perimetro: inviti e gestione utenti (fase 3), profilo e cambio password, pulizia schedulata di `password_reset_tokens` (`auth:clear-resets`, fase 4).

**Scostamento motivato dalla spec §5:** la spec diceva "Fortify, feature attive: solo `resetPasswords`". Qui il reset usa controller nostri. Il controller Fortify:
- risponde `422` per email inesistenti, e la spec la vuole sempre `202`;
- invia il link anche a utenti `invited`/`disabled`;
- in `CompletePasswordReset` scrive `remember_token`, colonna rimossa dalla tabella `users`;
- non permette di applicare il limite per email + IP.

## Global Constraints

- Branch di lavoro: `feature/auth-fase-2`, creato da `feature/auth-fase-1`. Commit piccoli in Conventional Commits in italiano (`tipo(scope): descrizione`), mai push.
- Comandi Laravel da `apps/laravel` con `./vendor/bin/sail …` (qui abbreviato `sail`); comandi frontend da `apps/react`.
- Regole di progetto in `apps/laravel/CLAUDE.md` e `apps/react/CLAUDE.md`: valgono quelle, **non** le guide Dieffetech escluse (niente antd/DF, `useApi`, SWR, classi base del template).
- Identificatori in inglese, **commenti in italiano**, testi per l'utente solo da traduzioni (`lang/{it,en}` in Laravel, `src/locales/{it,en}.json` in React).
- Laravel: `env()` solo in `config/`; input con FormRequest; log con context array; email **dopo il commit**; ogni chiamata a un servizio esterno loggata su un channel dedicato; testi PHP con `App\Support\Translate::text()`; dopo ogni modifica PHP `sail bin pint <file modificati> --format agent` (`--dirty` non funziona nel container).
- React: niente `any`, niente `as` (né `as const`), `interface` per le props, componenti arrow function, niente `console.*`, classi condizionali con `cn`, dati server solo con TanStack Query. Con i React Hooks v7 non si legge né scrive `ref.current` durante il render e non si chiama `setState` in modo sincrono in un `useEffect`.
- Tempi e limiti (spec §6.3, §8.1): link valido **60 minuti** (`auth.passwords.users.expire = 60`), uso singolo. Richiesta del link **3 ogni 15 minuti per email + IP**, reset **10/min per IP**. Un nuovo link per lo stesso utente al massimo ogni **60 s** (throttle del broker, `auth.passwords.users.throttle = 60`).
- Password (spec §8.2): `min:12`, nessun obbligo di simboli, `uncompromised()` (HIBP); hash Argon2id. Nei test HIBP è spento (`AUTH_PASSWORD_UNCOMPROMISED=false` in `phpunit.xml`).
- Gate a fine di ogni task backend: `sail artisan test --compact`, `sail composer analyse`, `sail bin pint --test`. A fine di ogni task frontend: `npm test`, `npm run lint`, `npm run build`.

## Review Focus

1. **Email con "+" o maiuscole nel link** (`giulia+hr@azienda.it`): il `+` non deve diventare uno spazio nel passaggio email → URL → form. Test in Task 2 (URL della mail) e Task 5 (pagina di reset).
2. **Link già usato o scaduto** (riaperto dalla cronologia, cliccato due volte, aperto dopo un'ora): messaggio chiaro "Link non valido" con l'azione "Chiedi un nuovo link", mai un form che fallisce in silenzio. Test in Task 3 e Task 5.
3. **Link troncato dal client email** (manca `?email=`): la pagina mostra subito lo stato di link non valido. Test in Task 5.
4. **"Invia di nuovo" premuto subito**: il broker ignora per 60 s una nuova richiesta e l'email non arriverebbe. Il pulsante resta disattivato per 60 s con il conto alla rovescia. Test in Task 4.
5. **Doppio invio del form della nuova password** (doppio click o Invio ripetuto): parte una sola richiesta, così il secondo invio non trova il token già consumato e non mostra "link non valido" dopo un successo. Test in Task 5.

## Struttura dei file

**Laravel (`apps/laravel`)**

| File | Responsabilità |
|---|---|
| `routes/web.php` | Rotte di accesso registrate a mano, ognuna con il suo limite |
| `app/Providers/FortifyServiceProvider.php` | `Fortify::ignoreRoutes()`, rate limiter `forgot-password` e `reset-password` |
| `config/fortify.php` · `config/auth.php` · `config/logging.php` · `phpunit.xml` | Commento sulle feature; flag HIBP; channel `hibp` |
| `app/Providers/AppServiceProvider.php` | `Password::defaults()` e log delle chiamate HIBP |
| `app/Listeners/LogPwnedPasswordsRequest.php` | Log delle chiamate a HIBP sul channel `hibp` |
| `app/Services/PasswordResetService.php` | Invio del link e reset con il broker |
| `app/Http/Controllers/Auth/{ForgotPasswordController,ResetPasswordController}.php` | Endpoint |
| `app/Http/Requests/Auth/{ForgotPasswordRequest,ResetPasswordRequest}.php` | Validazione |
| `app/Mail/{ResetPasswordMail,PasswordChangedMail}.php` + `resources/views/mail/auth/{reset-password,password-changed}.blade.php` | Email |
| `app/Models/User.php` | `sendPasswordResetNotification()` con la nostra email |
| `app/Support/AuthSession.php` | `endAllFor(User)`: chiude tutte le sessioni dell'utente |
| `lang/{it,en}/password_reset.php` | Testi |
| `database/seeders/DevUserSeeder.php` | Utente `reset@holidays.test` per l'E2E |

**React (`apps/react`)**

| File | Responsabilità |
|---|---|
| `src/features/auth/validation.ts` | Campo email e schema dello stato di navigazione condivisi |
| `src/features/auth/api.ts` | `useForgotPassword`, `useResetPassword` |
| `src/features/auth/pages/{ForgotPasswordPage,ResetPasswordPage}.tsx` (+ test) | Pagine |
| `src/features/auth/pages/LoginPage.tsx` (+ test) | Link "Password dimenticata?", avviso dopo il reset, email precompilata |
| `src/routes.tsx` · `src/locales/{it,en}.json` | Route e testi |
| `e2e/mailpit.ts` · `e2e/password-reset.spec.ts` | E2E |

---

## Task 1: Rotte di accesso registrate a mano

**Files:**
- Modify: `apps/laravel/app/Providers/FortifyServiceProvider.php`
- Modify: `apps/laravel/routes/web.php`
- Modify: `apps/laravel/config/fortify.php` (commento sopra `'features'`)
- Test: `apps/laravel/tests/Feature/Auth/AuthRoutesTest.php`

**Interfaces:**
- Produces: rotte con nome `login.store` (`POST /api/auth/login`, `guest:web` + `throttle:login`), `logout` (`POST /api/auth/logout`, `auth:web`), `auth.two-factor` e `auth.two-factor.resend` (invariate). Un gruppo `Route::prefix('api/auth')` in `routes/web.php`, dove i Task 2 e 3 aggiungono le loro rotte nel sottogruppo `guest:web`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AuthRoutesTest extends TestCase
{
    use RefreshDatabase;

    public function test_unused_fortify_routes_are_not_registered(): void
    {
        // Rotte Fortify senza limite ai tentativi e mai usate dalla SPA
        $this->postJson('/api/auth/user/confirm-password', ['password' => 'x'])->assertNotFound();
        $this->getJson('/api/auth/user/confirmed-password-status')->assertNotFound();
    }

    public function test_login_and_logout_keep_their_middleware(): void
    {
        $login = Route::getRoutes()->getByName('login.store');
        $logout = Route::getRoutes()->getByName('logout');

        $this->assertNotNull($login);
        $this->assertNotNull($logout);
        $this->assertSame('api/auth/login', $login->uri());
        $this->assertContains('guest:web', $login->gatherMiddleware());
        $this->assertContains('throttle:login', $login->gatherMiddleware());
        $this->assertContains('auth:web', $logout->gatherMiddleware());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sail artisan test --compact tests/Feature/Auth/AuthRoutesTest.php`
Expected: FAIL. `test_unused_fortify_routes_are_not_registered` riceve `401` invece di `404`.

- [ ] **Step 3: Implementation**

In `FortifyServiceProvider` aggiungi `register()` sopra `boot()`:

```php
    public function register(): void
    {
        // Rotte registrate a mano in routes/web.php: solo quelle usate dalla SPA, ognuna col suo limite
        Fortify::ignoreRoutes();
    }
```

Sostituisci `routes/web.php` con:

```php
<?php

use App\Http\Controllers\Auth\TwoFactorChallengeController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Http\Controllers\AuthenticatedSessionController;

Route::get('/', function () {
    return view('welcome');
});

// Rotte di accesso (Fortify::ignoreRoutes): gruppo `web` per sessione e CSRF della SPA sulla stessa origine
Route::prefix('api/auth')->group(function (): void {
    Route::middleware('guest:web')->group(function (): void {
        // Il login passa dalla pipeline di Fortify (FortifyServiceProvider::authenticateThrough)
        Route::post('/login', [AuthenticatedSessionController::class, 'store'])
            ->middleware('throttle:login')
            ->name('login.store');

        Route::middleware('throttle:two-factor')->group(function (): void {
            Route::post('/two-factor', [TwoFactorChallengeController::class, 'store'])->name('auth.two-factor');
            Route::post('/two-factor/resend', [TwoFactorChallengeController::class, 'resend'])->name('auth.two-factor.resend');
        });
    });

    Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])
        ->middleware('auth:web')
        ->name('logout');
});
```

In `config/fortify.php` sostituisci il commento sopra `'features' => [],` con:

```php
    // Nessuna feature Fortify attiva e rotte registrate a mano (routes/web.php, Fortify::ignoreRoutes):
    // il secondo fattore via email e il recupero password sono nostri, TOTP e passkey nel sotto-progetto 2.
```

- [ ] **Step 4: Run tests**

Run: `sail artisan test --compact`
Expected: tutti PASS. I test di login, codice e logout della fase 1 restano verdi.

- [ ] **Step 5: Gate e commit**

```bash
sail bin pint app/Providers/FortifyServiceProvider.php routes/web.php config/fortify.php tests/Feature/Auth/AuthRoutesTest.php --format agent
sail composer analyse
git add apps/laravel/app/Providers/FortifyServiceProvider.php apps/laravel/routes/web.php apps/laravel/config/fortify.php apps/laravel/tests/Feature/Auth/AuthRoutesTest.php
git commit -m "refactor(auth): rotte di accesso registrate a mano senza quelle fortify inutilizzate"
```

---

## Task 2: Richiesta del link di recupero

**Files:**
- Create: `apps/laravel/lang/it/password_reset.php`, `apps/laravel/lang/en/password_reset.php`
- Create: `apps/laravel/app/Mail/ResetPasswordMail.php`, `apps/laravel/resources/views/mail/auth/reset-password.blade.php`
- Create: `apps/laravel/app/Services/PasswordResetService.php`
- Create: `apps/laravel/app/Http/Requests/Auth/ForgotPasswordRequest.php`
- Create: `apps/laravel/app/Http/Controllers/Auth/ForgotPasswordController.php`
- Modify: `apps/laravel/app/Models/User.php`, `apps/laravel/app/Providers/FortifyServiceProvider.php`, `apps/laravel/routes/web.php`
- Test: `apps/laravel/tests/Feature/Auth/ForgotPasswordTest.php`, `apps/laravel/tests/Feature/Auth/ResetPasswordMailTest.php`

**Interfaces:**
- Consumes: gruppo `api/auth` + `guest:web` di `routes/web.php` (Task 1).
- Produces:
  - `POST /api/auth/forgot-password` `{email}` → `202 {"message": string}` sempre (`422` solo per un'email malformata, `429` oltre il limite). Rotta `password.email`.
  - `App\Services\PasswordResetService::sendLink(string $email): void` (classe `final`, senza costruttore: lo aggiunge il Task 3).
  - `App\Mail\ResetPasswordMail(string $email, string $token)` con proprietà pubbliche `email`, `token` e metodo `url(): string`.
  - Chiavi di traduzione `password_reset.link_sent`, `password_reset.mail.link.*` (il Task 3 aggiunge le sue).

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Auth/ForgotPasswordTest.php`:

```php
<?php

namespace Tests\Feature\Auth;

use App\Mail\ResetPasswordMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ForgotPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const SENT = ['message' => 'Se l’indirizzo corrisponde a un account attivo, riceverai un’email con il link per scegliere una nuova password.'];

    public function test_an_active_user_receives_the_reset_link(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertAccepted()
            ->assertExactJson(self::SENT);

        Mail::assertQueued(ResetPasswordMail::class, fn (ResetPasswordMail $mail): bool => $mail->hasTo($user->email) && $mail->email === $user->email);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_the_token_is_stored_only_as_a_hash(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertAccepted();

        $token = '';
        Mail::assertQueued(ResetPasswordMail::class, function (ResetPasswordMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });
        $stored = (string) DB::table('password_reset_tokens')->where('email', $user->email)->value('token');
        $this->assertNotSame($token, $stored);
        $this->assertTrue(Hash::check($token, $stored));
    }

    public function test_an_unknown_email_gets_the_same_response_and_no_email(): void
    {
        Mail::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'nessuno@example.test'])
            ->assertAccepted()
            ->assertExactJson(self::SENT);

        Mail::assertNothingQueued();
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_invited_and_disabled_users_get_the_same_response_and_no_email(): void
    {
        Mail::fake();
        $invited = User::factory()->invited()->create();
        $disabled = User::factory()->disabled()->create();

        foreach ([$invited, $disabled] as $user) {
            $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
                ->assertAccepted()
                ->assertExactJson(self::SENT);
        }

        Mail::assertNothingQueued();
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_email_with_spaces_and_capitals_is_accepted(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email' => 'giulia.rossi@example.test']);

        $this->postJson('/api/auth/forgot-password', ['email' => '  Giulia.Rossi@Example.TEST '])->assertAccepted();

        Mail::assertQueued(ResetPasswordMail::class, fn (ResetPasswordMail $mail): bool => $mail->hasTo($user->email));
    }

    public function test_a_malformed_email_is_rejected(): void
    {
        $this->postJson('/api/auth/forgot-password', ['email' => 'giulia'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->postJson('/api/auth/forgot-password', ['email' => ['a@b.test']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_a_second_request_within_a_minute_sends_no_new_email(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertAccepted();
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertAccepted()
            ->assertExactJson(self::SENT);

        Mail::assertQueued(ResetPasswordMail::class, 1);
    }

    public function test_requests_are_limited_to_three_every_fifteen_minutes_per_email(): void
    {
        Mail::fake();

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->postJson('/api/auth/forgot-password', ['email' => 'giulia@example.test'])->assertAccepted();
        }

        $this->postJson('/api/auth/forgot-password', ['email' => 'giulia@example.test'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
        // Il limite è per email + IP: un'altra email dallo stesso IP passa
        $this->postJson('/api/auth/forgot-password', ['email' => 'marco@example.test'])->assertAccepted();

        $this->travel(15)->minutes();
        $this->postJson('/api/auth/forgot-password', ['email' => 'giulia@example.test'])->assertAccepted();
    }
}
```

`tests/Feature/Auth/ResetPasswordMailTest.php`:

```php
<?php

namespace Tests\Feature\Auth;

use App\Mail\ResetPasswordMail;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ResetPasswordMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_link_points_to_the_spa_with_the_encoded_email(): void
    {
        config(['app.frontend_url' => 'http://localhost:5174/']);

        $mail = new ResetPasswordMail('giulia+hr@example.test', 'abc123');

        // "+" codificato: in una query string non codificata diventerebbe uno spazio
        $this->assertSame('http://localhost:5174/reset-password/abc123?email=giulia%2Bhr%40example.test', $mail->url());
    }

    public function test_contains_the_link_and_the_expiry(): void
    {
        app()->setLocale('en');
        config(['app.frontend_url' => 'http://localhost:5174']);

        $mail = new ResetPasswordMail('giulia@example.test', 'abc123');

        $mail->assertHasSubject('Reset your Holidays password');
        $mail->assertSeeInText('http://localhost:5174/reset-password/abc123?email=giulia%40example.test');
        $mail->assertSeeInText('60 minutes');
    }

    public function test_is_queued_in_the_recipient_language(): void
    {
        Mail::fake();
        $user = User::factory()->create(['locale' => 'en']);

        $user->sendPasswordResetNotification('abc123');

        Mail::assertQueued(ResetPasswordMail::class, fn (ResetPasswordMail $mail): bool => $mail->locale === 'en' && $mail->token === 'abc123');
    }

    public function test_is_encrypted_in_the_queue(): void
    {
        // Il token del link non deve finire in chiaro in jobs/failed_jobs
        $this->assertInstanceOf(ShouldBeEncrypted::class, new ResetPasswordMail('giulia@example.test', 'abc123'));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sail artisan test --compact tests/Feature/Auth/ForgotPasswordTest.php tests/Feature/Auth/ResetPasswordMailTest.php`
Expected: FAIL. La rotta risponde `404` e la classe `App\Mail\ResetPasswordMail` non esiste.

- [ ] **Step 3: Traduzioni**

`lang/it/password_reset.php`:

```php
<?php

return [
    'link_sent' => 'Se l’indirizzo corrisponde a un account attivo, riceverai un’email con il link per scegliere una nuova password.',
    'mail' => [
        'link' => [
            'subject' => 'Reimposta la password di Holidays',
            'heading' => 'Reimposta la password',
            'intro' => 'Abbiamo ricevuto una richiesta per reimpostare la password del tuo account.',
            'action' => 'Scegli una nuova password',
            'expiry' => 'Il link vale :minutes minuti e si può usare una sola volta.',
            'not_you' => 'Se non hai chiesto tu il link, ignora questa email: la password attuale resta valida.',
            'fallback' => 'Se il pulsante non funziona, copia questo indirizzo nel browser: :url',
        ],
    ],
];
```

`lang/en/password_reset.php`:

```php
<?php

return [
    'link_sent' => 'If the address matches an active account, you’ll get an email with a link to choose a new password.',
    'mail' => [
        'link' => [
            'subject' => 'Reset your Holidays password',
            'heading' => 'Reset your password',
            'intro' => 'We received a request to reset the password of your account.',
            'action' => 'Choose a new password',
            'expiry' => 'The link is valid for :minutes minutes and works only once.',
            'not_you' => 'If you didn’t ask for this link, ignore this email: your current password still works.',
            'fallback' => 'If the button doesn’t work, copy this address into your browser: :url',
        ],
    ],
];
```

- [ ] **Step 4: Email del link**

`app/Mail/ResetPasswordMail.php`:

```php
<?php

namespace App\Mail;

use App\Support\Translate;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Cifrata in coda: il token del link non resta in chiaro in jobs/failed_jobs
class ResetPasswordMail extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $email,
        #[\SensitiveParameter] public readonly string $token,
    ) {}

    /**
     * Link alla pagina della SPA. Email codificata RFC 3986: un "+" resta "+" (non diventa uno spazio).
     */
    public function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/')
            .'/reset-password/'.rawurlencode($this->token)
            .'?'.http_build_query(['email' => $this->email], '', '&', PHP_QUERY_RFC3986);
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('password_reset.mail.link.subject'));
    }

    public function content(): Content
    {
        // content() gira già nella lingua del destinatario (HasLocalePreference)
        return new Content(
            markdown: 'mail.auth.reset-password',
            with: [
                'url' => $this->url(),
                'minutes' => (int) config('auth.passwords.users.expire'),
            ],
        );
    }
}
```

`resources/views/mail/auth/reset-password.blade.php`:

```blade
<x-mail::message>
# {{ __('password_reset.mail.link.heading') }}

{{ __('password_reset.mail.link.intro') }}

<x-mail::button :url="$url">
{{ __('password_reset.mail.link.action') }}
</x-mail::button>

{{ __('password_reset.mail.link.expiry', ['minutes' => $minutes]) }}

{{ __('password_reset.mail.link.not_you') }}

<x-mail::subcopy>
{{ __('password_reset.mail.link.fallback', ['url' => $url]) }}
</x-mail::subcopy>
</x-mail::message>
```

In `app/Models/User.php` aggiungi gli import `use App\Mail\ResetPasswordMail;` e `use Illuminate\Support\Facades\Mail;` e questo metodo dopo `preferredLocale()`:

```php
    /**
     * Link di recupero con la nostra email (in coda, cifrata, nella lingua dell'utente) al posto della notifica di Laravel.
     *
     * @param  string  $token
     */
    public function sendPasswordResetNotification(#[\SensitiveParameter] $token): void
    {
        Mail::to($this)->send(new ResetPasswordMail($this->email, $token));
    }
```

(Il parametro resta senza tipo nativo, come nel trait `CanResetPassword`: un tipo più stretto del genitore è un errore fatale in PHP.)

- [ ] **Step 5: Service, request, controller, limiter e rotta**

`app/Services/PasswordResetService.php`:

```php
<?php

namespace App\Services;

use App\Enums\UserStatus;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Timebox;

/**
 * Recupero password con il broker di Laravel: link solo agli utenti attivi, nessun indizio sull'esistenza dell'email.
 */
final class PasswordResetService
{
    /** Durata minima della richiesta del link: uguale con e senza invio (hash del token, scrittura in coda). */
    private const MIN_LINK_DURATION_MICROSECONDS = 400_000;

    /**
     * Invia il link se l'email è di un utente attivo. Negli altri casi non succede nulla, con gli stessi tempi.
     */
    public function sendLink(string $email): void
    {
        (new Timebox)->call(function () use ($email): void {
            // Esito ignorato di proposito: utente inesistente, non attivo o link già chiesto da meno di 60 s
            $this->broker()->sendResetLink(['email' => $email, 'status' => UserStatus::Active->value]);
        }, self::MIN_LINK_DURATION_MICROSECONDS);
    }

    private function broker(): PasswordBroker
    {
        return Password::broker((string) config('fortify.passwords'));
    }
}
```

`app/Http/Requests/Auth/ForgotPasswordRequest.php`:

```php
<?php

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class ForgotPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // Email copiata da un'altra app: spazi e maiuscole non contano, come nel login
        $email = $this->input('email');

        if (is_string($email)) {
            $this->merge(['email' => Str::lower(trim($email))]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
        ];
    }
}
```

`app/Http/Controllers/Auth/ForgotPasswordController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Services\PasswordResetService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class ForgotPasswordController extends Controller
{
    /**
     * Sempre 202 con lo stesso messaggio: la risposta non rivela se l'email è registrata.
     */
    public function __invoke(ForgotPasswordRequest $request, PasswordResetService $passwords): JsonResponse
    {
        $passwords->sendLink($request->string('email')->value());

        return response()->json(['message' => Translate::text('password_reset.link_sent')], Response::HTTP_ACCEPTED);
    }
}
```

In `FortifyServiceProvider::boot()` estrai la normalizzazione dell'email in un metodo privato, riusalo nel limiter `login` e aggiungi il limiter `forgot-password`:

```php
        RateLimiter::for('login', fn (Request $request): array => [
            Limit::perMinute(5)->by('login:'.self::normalizedEmail($request).'|'.$request->ip()),
            Limit::perMinute(20)->by('login-ip:'.$request->ip()),
        ]);

        // Richiesta del link di recupero: 3 ogni 15 minuti per email + IP
        RateLimiter::for('forgot-password', fn (Request $request): Limit => Limit::perMinutes(15, 3)
            ->by('forgot-password:'.self::normalizedEmail($request).'|'.$request->ip()));
```

```php
    /**
     * Email per le chiavi dei limiti. Input non stringa (es. email[]=…) trattato come vuoto: niente errori di conversione.
     */
    private static function normalizedEmail(Request $request): string
    {
        $email = $request->input('email');

        return is_string($email) ? Str::lower(trim($email)) : '';
    }
```

In `routes/web.php` aggiungi `use App\Http\Controllers\Auth\ForgotPasswordController;` e, nel gruppo `guest:web` dopo la rotta di login:

```php
        Route::post('/forgot-password', ForgotPasswordController::class)
            ->middleware('throttle:forgot-password')
            ->name('password.email');
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `sail artisan test --compact`
Expected: tutti PASS.

- [ ] **Step 7: Gate e commit**

```bash
sail bin pint app/Mail/ResetPasswordMail.php app/Models/User.php app/Services/PasswordResetService.php app/Http/Requests/Auth/ForgotPasswordRequest.php app/Http/Controllers/Auth/ForgotPasswordController.php app/Providers/FortifyServiceProvider.php routes/web.php lang/it/password_reset.php lang/en/password_reset.php tests/Feature/Auth/ForgotPasswordTest.php tests/Feature/Auth/ResetPasswordMailTest.php --format agent
sail composer analyse
git add apps/laravel
git commit -m "feat(auth): richiesta del link di recupero password sempre con la stessa risposta"
```

---

## Task 3: Nuova password dal link

**Files:**
- Create: `apps/laravel/app/Mail/PasswordChangedMail.php`, `apps/laravel/resources/views/mail/auth/password-changed.blade.php`
- Create: `apps/laravel/app/Http/Requests/Auth/ResetPasswordRequest.php`, `apps/laravel/app/Http/Controllers/Auth/ResetPasswordController.php`
- Create: `apps/laravel/app/Listeners/LogPwnedPasswordsRequest.php`
- Modify: `apps/laravel/app/Services/PasswordResetService.php`, `apps/laravel/app/Support/AuthSession.php`, `apps/laravel/app/Providers/AppServiceProvider.php`, `apps/laravel/app/Providers/FortifyServiceProvider.php`, `apps/laravel/routes/web.php`, `apps/laravel/config/auth.php`, `apps/laravel/config/logging.php`, `apps/laravel/phpunit.xml`, `apps/laravel/lang/{it,en}/password_reset.php`, `apps/laravel/.env.example`
- Test: `apps/laravel/tests/Feature/Auth/ResetPasswordTest.php`, `apps/laravel/tests/Feature/Auth/PasswordChangedMailTest.php`

**Interfaces:**
- Consumes: `PasswordResetService` (Task 2), `AuthEventLogger::log()` (fase 1); `ResetPasswordMail::$token` nei test.
- Produces:
  - `POST /api/auth/reset-password` `{token, email, password}` → `200 {"message"}`. Se mancano o non sono validi la password o i campi: `422` con `errors.password`, `errors.email` o `errors.token`. Link non valido, scaduto, usato o di un utente non attivo: `422 {"message", "errors": {"token": [msg]}}`. Oltre il limite: `429`. Rotta `password.update`.
  - `PasswordResetService::reset(array{email: string, token: string, password: string} $credentials, Request $request): bool`.
  - `AuthSession::endAllFor(User $user): void`, che la fase 3 riusa per la disattivazione.
  - `Password::defaults()` = `min(12)` + `uncompromised()` (spento con `config('auth.password_uncompromised') === false`).

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Auth/ResetPasswordTest.php`:

```php
<?php

namespace Tests\Feature\Auth;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Mail\LoginCodeMail;
use App\Mail\PasswordChangedMail;
use App\Mail\ResetPasswordMail;
use App\Models\LoginChallenge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ResetPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const NEW_PASSWORD = 'una-frase-lunga-e-nuova';

    private const INVALID_LINK = 'Il link non è valido o è scaduto. Chiedine uno nuovo.';

    /**
     * Chiede il link come farebbe l'utente e restituisce il token arrivato nell'email.
     */
    private function requestToken(User $user): string
    {
        Mail::fake();
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertAccepted();

        $token = '';
        Mail::assertQueued(ResetPasswordMail::class, function (ResetPasswordMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });

        return $token;
    }

    /**
     * @return array<string, string>
     */
    private function payload(User $user, string $token, string $password = self::NEW_PASSWORD): array
    {
        return ['email' => $user->email, 'token' => $token, 'password' => $password];
    }

    public function test_a_valid_link_sets_the_new_password(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))
            ->assertOk()
            ->assertExactJson(['message' => 'Password aggiornata. Accedi con la nuova password.']);

        $this->assertTrue(Hash::check(self::NEW_PASSWORD, (string) $user->fresh()?->password));
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => AuthEventType::PasswordReset->value]);
        Mail::assertQueued(PasswordChangedMail::class, fn (PasswordChangedMail $mail): bool => $mail->hasTo($user->email));
        // Il reset non apre la sessione: si passa sempre dal login con il codice
        $this->assertGuest();
    }

    public function test_the_next_login_still_asks_for_the_code(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => self::NEW_PASSWORD])
            ->assertOk()
            ->assertExactJson(['two_factor' => true]);

        $this->assertGuest();
        Mail::assertQueued(LoginCodeMail::class);
    }

    public function test_all_sessions_and_pending_codes_of_the_user_are_closed(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        foreach ([$user, $other] as $index => $owner) {
            DB::table('sessions')->insert([
                'id' => 'session-'.$index,
                'user_id' => $owner->id,
                'ip_address' => '127.0.0.1',
                'user_agent' => 'test',
                'payload' => '',
                'last_activity' => now()->getTimestamp(),
            ]);
        }
        LoginChallenge::query()->create([
            'user_id' => $user->id,
            'code_hash' => str_repeat('a', 64),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
            'resend_count' => 0,
            'last_sent_at' => now(),
        ]);
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->assertDatabaseHas('sessions', ['user_id' => $other->id]);
        $this->assertDatabaseMissing('login_challenges', ['user_id' => $user->id]);
    }

    public function test_a_link_works_only_once(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, 'un-altra-frase-ancora'))
            ->assertUnprocessable()
            ->assertJsonPath('message', self::INVALID_LINK)
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);

        $this->assertTrue(Hash::check(self::NEW_PASSWORD, (string) $user->fresh()?->password));
    }

    public function test_a_link_expires_after_sixty_minutes(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->travel(61)->minutes();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
    }

    public function test_a_wrong_token_or_another_email_gets_the_same_error(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, str_repeat('0', 64)))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
        $this->postJson('/api/auth/reset-password', $this->payload($other, $token))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
        $this->postJson('/api/auth/reset-password', ['email' => 'nessuno@example.test', 'token' => $token, 'password' => self::NEW_PASSWORD])
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
    }

    public function test_a_user_disabled_after_the_request_cannot_use_the_link(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $user->forceFill(['status' => UserStatus::Disabled])->save();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);

        Mail::assertNotQueued(PasswordChangedMail::class);
    }

    public function test_a_short_password_is_rejected_and_the_link_stays_valid(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, 'troppo-corta'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();
    }

    public function test_a_compromised_password_is_rejected(): void
    {
        config(['auth.password_uncompromised' => true]);
        $password = 'password-trafugata-1';
        $suffix = strtoupper(substr(sha1($password), 5));
        Http::fake(['api.pwnedpasswords.com/*' => Http::response($suffix.':42')]);
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, $password))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
    }

    public function test_missing_or_malformed_fields_are_rejected(): void
    {
        $this->postJson('/api/auth/reset-password', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'token', 'password']);

        $this->postJson('/api/auth/reset-password', ['email' => ['x'], 'token' => ['x'], 'password' => ['x']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'token', 'password']);
    }

    public function test_requests_are_limited_to_ten_per_minute_per_ip(): void
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->postJson('/api/auth/reset-password', ['email' => 'a@example.test', 'token' => 'x', 'password' => self::NEW_PASSWORD])
                ->assertUnprocessable();
        }

        $this->postJson('/api/auth/reset-password', ['email' => 'a@example.test', 'token' => 'x', 'password' => self::NEW_PASSWORD])
            ->assertTooManyRequests();
    }
}
```

`tests/Feature/Auth/PasswordChangedMailTest.php`:

```php
<?php

namespace Tests\Feature\Auth;

use App\Mail\PasswordChangedMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PasswordChangedMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_tells_when_and_from_where_the_password_was_changed(): void
    {
        app()->setLocale('en');

        $mail = new PasswordChangedMail('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', now());

        $mail->assertHasSubject('Your Holidays password was changed');
        $mail->assertSeeInText('Chrome on macOS');
        $mail->assertSeeInText('signed you out everywhere');
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sail artisan test --compact tests/Feature/Auth/ResetPasswordTest.php tests/Feature/Auth/PasswordChangedMailTest.php`
Expected: FAIL. La rotta risponde `404` e la classe `App\Mail\PasswordChangedMail` non esiste.

- [ ] **Step 3: Regole password, flag HIBP e log delle chiamate esterne**

`config/auth.php`: aggiungi in fondo all'array, dopo `'password_timeout'`:

```php
    /*
    | Controllo delle password trafugate (Have I Been Pwned): spento solo nei test (phpunit.xml),
    | dove non si fanno richieste di rete.
    */
    'password_uncompromised' => (bool) env('AUTH_PASSWORD_UNCOMPROMISED', true),
```

`phpunit.xml`, dentro `<php>`: `<env name="AUTH_PASSWORD_UNCOMPROMISED" value="false"/>`.

`.env.example`: aggiungi dopo `HASH_DRIVER=argon2id` la riga `AUTH_PASSWORD_UNCOMPROMISED=true`.

`config/logging.php`, dentro `'channels'`:

```php
        // Chiamate a Have I Been Pwned (controllo password trafugate): mai l'hash, solo esito e durata
        'hibp' => [
            'driver' => 'daily',
            'path' => storage_path('logs/hibp.log'),
            'level' => env('LOG_LEVEL', 'debug'),
            'days' => 30,
            'replace_placeholders' => true,
        ],
```

`app/Listeners/LogPwnedPasswordsRequest.php`:

```php
<?php

namespace App\Listeners;

use Illuminate\Http\Client\Events\ConnectionFailed;
use Illuminate\Http\Client\Events\ResponseReceived;
use Illuminate\Support\Facades\Log;

/**
 * Log delle chiamate a HIBP. Se HIBP non risponde la password viene accettata (fail-open di Laravel):
 * il warning rende visibile quando il controllo è saltato.
 */
final class LogPwnedPasswordsRequest
{
    private const HOST = 'api.pwnedpasswords.com';

    public function handle(ResponseReceived|ConnectionFailed $event): void
    {
        if (parse_url($event->request->url(), PHP_URL_HOST) !== self::HOST) {
            return;
        }

        if ($event instanceof ConnectionFailed) {
            Log::channel('hibp')->warning('HIBP unreachable, password check skipped');

            return;
        }

        $context = ['status' => $event->response->status()];

        if ($event->response->successful()) {
            Log::channel('hibp')->info('HIBP range query', $context);
        } else {
            Log::channel('hibp')->warning('HIBP error, password check skipped', $context);
        }
    }
}
```

`app/Providers/AppServiceProvider.php`, in `boot()` (con gli import `App\Listeners\LogPwnedPasswordsRequest`, `Illuminate\Http\Client\Events\ConnectionFailed`, `Illuminate\Http\Client\Events\ResponseReceived`, `Illuminate\Support\Facades\Event`, `Illuminate\Validation\Rules\Password`):

```php
    public function boot(): void
    {
        // Regole password (spec §8.2): almeno 12 caratteri, nessun obbligo di simboli, mai una password trafugata
        Password::defaults(function (): Password {
            $rule = Password::min(12);

            return config('auth.password_uncompromised') ? $rule->uncompromised() : $rule;
        });

        Event::listen([ResponseReceived::class, ConnectionFailed::class], LogPwnedPasswordsRequest::class);
    }
```

Aggiungi in `ResetPasswordTest` un test per il log (stessa classe, import `Illuminate\Support\Facades\Log`):

```php
    public function test_the_hibp_call_is_logged_on_its_channel(): void
    {
        config(['auth.password_uncompromised' => true]);
        Http::fake(['api.pwnedpasswords.com/*' => Http::response('')]);
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $channel = Log::spy();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $channel->shouldHaveReceived('channel')->with('hibp');
    }
```

(Con `Log::spy()` la chiamata `channel('hibp')` restituisce `null` e `->info()` fallirebbe. Se succede, nel test sostituisci lo spy con `Log::shouldReceive('channel')->with('hibp')->once()->andReturnSelf()` e `Log::shouldReceive('info')->once()`, lasciando passare le altre chiamate con `Log::shouldReceive('channel')->andReturnSelf()->byDefault()`.)

- [ ] **Step 4: Email "password cambiata" e traduzioni**

Aggiungi in `lang/it/password_reset.php` le chiavi `invalid_link` e `done` al primo livello, e `changed` dentro `mail`:

```php
    'invalid_link' => 'Il link non è valido o è scaduto. Chiedine uno nuovo.',
    'done' => 'Password aggiornata. Accedi con la nuova password.',
```

```php
        'changed' => [
            'subject' => 'La password di Holidays è stata cambiata',
            'heading' => 'Password cambiata',
            'intro' => 'La password del tuo account è stata cambiata da :device il :date. Per sicurezza abbiamo chiuso tutte le sessioni aperte.',
            'not_you' => 'Se non sei stato tu, chiedi subito un nuovo link dalla pagina di accesso e avvisa l’ufficio HR.',
        ],
```

In `lang/en/password_reset.php`:

```php
    'invalid_link' => 'This link is invalid or has expired. Ask for a new one.',
    'done' => 'Password updated. Sign in with your new password.',
```

```php
        'changed' => [
            'subject' => 'Your Holidays password was changed',
            'heading' => 'Password changed',
            'intro' => 'The password of your account was changed from :device on :date. For your security we signed you out everywhere.',
            'not_you' => 'If this wasn’t you, ask for a new link from the sign-in page right away and tell HR.',
        ],
```

`app/Mail/PasswordChangedMail.php`:

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

class PasswordChangedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $userAgent,
        public readonly CarbonInterface $changedAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('password_reset.mail.changed.subject'));
    }

    public function content(): Content
    {
        // content() gira già nella lingua del destinatario (HasLocalePreference)
        return new Content(
            markdown: 'mail.auth.password-changed',
            with: [
                'device' => UserAgentSummary::describe($this->userAgent),
                'date' => $this->changedAt->copy()
                    ->setTimezone((string) config('app.display_timezone'))
                    ->locale(app()->getLocale())
                    ->isoFormat('LLL'),
            ],
        );
    }
}
```

`resources/views/mail/auth/password-changed.blade.php`:

```blade
<x-mail::message>
# {{ __('password_reset.mail.changed.heading') }}

{{ __('password_reset.mail.changed.intro', ['device' => $device, 'date' => $date]) }}

{{ __('password_reset.mail.changed.not_you') }}
</x-mail::message>
```

- [ ] **Step 5: Chiusura delle sessioni, service, request, controller, limiter e rotta**

`app/Support/AuthSession.php`: aggiungi gli import `App\Models\User` e `Illuminate\Support\Facades\DB`, poi:

```php
    /**
     * Chiude tutte le sessioni dell'utente su ogni dispositivo (driver `database`, spec §6.4): reset password e disattivazione.
     */
    public static function endAllFor(User $user): void
    {
        DB::table((string) config('session.table', 'sessions'))->where('user_id', $user->getKey())->delete();
    }
```

In `PasswordResetService` aggiungi il costruttore `public function __construct(private readonly AuthEventLogger $events) {}`, gli import (`App\Enums\AuthEventType`, `App\Mail\PasswordChangedMail`, `App\Models\LoginChallenge`, `App\Models\User`, `App\Support\AuthSession`, `Illuminate\Http\Request`, `Illuminate\Support\Facades\DB`, `Illuminate\Support\Facades\Mail`) e il metodo:

```php
    /**
     * Imposta la nuova password se il link è valido, non scaduto e di un utente attivo.
     *
     * @param  array{email: string, token: string, password: string}  $credentials
     */
    public function reset(#[\SensitiveParameter] array $credentials, Request $request): bool
    {
        $status = $this->broker()->reset(
            [...$credentials, 'status' => UserStatus::Active->value],
            function (User $user, string $password) use ($request): void {
                DB::transaction(function () use ($user, $password): void {
                    $user->forceFill(['password' => $password])->save();
                    // Chi aveva rubato la password perde subito l'accesso e i codici in attesa
                    AuthSession::endAllFor($user);
                    LoginChallenge::query()->where('user_id', $user->id)->delete();
                });

                $this->events->log(AuthEventType::PasswordReset, $request, $user);
                // Dopo il commit: l'email non deve annullare il cambio di password
                DB::afterCommit(fn () => Mail::to($user)->send(new PasswordChangedMail((string) $request->userAgent(), now())));
            },
        );

        return $status === PasswordBroker::PASSWORD_RESET;
    }
```

`app/Http/Requests/Auth/ResetPasswordRequest.php`:

```php
<?php

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $email = $this->input('email');

        if (is_string($email)) {
            $this->merge(['email' => Str::lower(trim($email))]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            // max: un testo enorme renderebbe costoso l'hash Argon2id
            'password' => ['required', 'string', 'max:255', Password::defaults()],
        ];
    }
}
```

`app/Http/Controllers/Auth/ResetPasswordController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Services\PasswordResetService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class ResetPasswordController extends Controller
{
    public function __invoke(ResetPasswordRequest $request, PasswordResetService $passwords): JsonResponse
    {
        $done = $passwords->reset([
            'email' => $request->string('email')->value(),
            'token' => $request->string('token')->value(),
            'password' => $request->string('password')->value(),
        ], $request);

        if (! $done) {
            // Stesso messaggio per token sbagliato, scaduto, già usato, email diversa o utente non attivo
            $message = Translate::text('password_reset.invalid_link');

            return response()->json(['message' => $message, 'errors' => ['token' => [$message]]], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['message' => Translate::text('password_reset.done')]);
    }
}
```

In `FortifyServiceProvider::boot()`:

```php
        // Nuova password dal link: 10 richieste al minuto per IP
        RateLimiter::for('reset-password', fn (Request $request): Limit => Limit::perMinute(10)->by('reset-password:'.$request->ip()));
```

In `routes/web.php` aggiungi `use App\Http\Controllers\Auth\ResetPasswordController;` e, nel gruppo `guest:web` dopo `forgot-password`:

```php
        Route::post('/reset-password', ResetPasswordController::class)
            ->middleware('throttle:reset-password')
            ->name('password.update');
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `sail artisan test --compact`
Expected: tutti PASS.

- [ ] **Step 7: Gate e commit**

```bash
sail bin pint app config routes lang tests --format agent
sail bin pint --test
sail composer analyse
git add apps/laravel
git commit -m "feat(auth): nuova password dal link con chiusura delle sessioni ed email di conferma"
```

---

## Task 4: Frontend — pagina "Password dimenticata" e link dal login

**Files:**
- Create: `apps/react/src/features/auth/validation.ts`
- Create: `apps/react/src/features/auth/pages/ForgotPasswordPage.tsx`, `apps/react/src/features/auth/pages/ForgotPasswordPage.test.tsx`
- Modify: `apps/react/src/features/auth/api.ts`, `apps/react/src/features/auth/pages/LoginPage.tsx`, `apps/react/src/features/auth/pages/LoginPage.test.tsx`, `apps/react/src/routes.tsx`, `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`

**Interfaces:**
- Consumes: `POST /api/auth/forgot-password` (Task 2).
- Produces:
  - `emailField(t: TFunction)`: schema zod della stringa email (trim, obbligatoria, ben formata), da `@/features/auth/validation`.
  - `emailStateSchema = z.object({ email: z.string() })`: stato di navigazione con l'email da precompilare.
  - `useForgotPassword()`: mutation `(email: string) => Promise<unknown>`.
  - Route `/forgot-password` (titolo `titles.forgotPassword`).
  - `LoginPage` precompila l'email da `location.state.email` e mostra l'avviso `?reason=password-reset` (chiavi aggiunte qui, usate dal Task 5).

- [ ] **Step 1: Testi**

In `src/locales/it.json`:
- dentro `login` aggiungi `"forgot": "Password dimenticata?"`;
- dentro `login.notice` aggiungi `"password-reset": "Password aggiornata. Accedi con la nuova password."`;
- dentro `validation` aggiungi `"passwordMin": "La password deve avere almeno 12 caratteri."`;
- dentro `titles` aggiungi `"forgotPassword": "Password dimenticata"` e `"resetPassword": "Nuova password"`;
- aggiungi la sezione `forgot` dopo `verify`:

```json
  "forgot": {
    "title": "Password dimenticata?",
    "subtitle": "Inserisci la tua email aziendale: ti invieremo un link per sceglierne una nuova.",
    "submit": "Invia il link",
    "submitting": "Invio in corso…",
    "sentTitle": "Controlla la tua email",
    "sent": "Se {{email}} corrisponde a un account attivo, riceverai a breve un link per scegliere una nuova password. Il link vale 60 minuti.",
    "resend": "Invia di nuovo il link",
    "resendIn": "Nuovo link tra {{count}} s",
    "resent": "Link inviato di nuovo. Usa quello dell’ultima email: il precedente non vale più.",
    "throttled_one": "Troppe richieste. Potrai riprovare tra {{count}} minuto.",
    "throttled_other": "Troppe richieste. Potrai riprovare tra {{count}} minuti.",
    "backToLogin": "Torna all’accesso"
  },
```

In `src/locales/en.json`, stesse chiavi:
- `login.forgot`: `"Forgot your password?"`;
- `login.notice.password-reset`: `"Password updated. Sign in with your new password."`;
- `validation.passwordMin`: `"Your password must be at least 12 characters long."`;
- `titles.forgotPassword`: `"Forgot password"` e `titles.resetPassword`: `"New password"`;
- la sezione `forgot`:

```json
  "forgot": {
    "title": "Forgot your password?",
    "subtitle": "Enter your work email and we’ll send you a link to choose a new one.",
    "submit": "Send the link",
    "submitting": "Sending…",
    "sentTitle": "Check your email",
    "sent": "If {{email}} matches an active account, you’ll soon get a link to choose a new password. The link is valid for 60 minutes.",
    "resend": "Send the link again",
    "resendIn": "New link in {{count}} s",
    "resent": "Link sent again. Use the one in the latest email: the previous one no longer works.",
    "throttled_one": "Too many requests. You can try again in {{count}} minute.",
    "throttled_other": "Too many requests. You can try again in {{count}} minutes.",
    "backToLogin": "Back to sign in"
  },
```

- [ ] **Step 2: Write the failing tests**

`src/features/auth/pages/ForgotPasswordPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/login', element: <p>login-page</p> },
]

const SENT = { message: 'ok' }

const acceptRequests = (onRequest: (body: unknown) => void = () => undefined) =>
  server.use(
    http.post('/api/auth/forgot-password', async ({ request }) => {
      onRequest(await request.json())
      return HttpResponse.json(SENT, { status: 202 })
    }),
  )

describe('ForgotPasswordPage', () => {
  it('validates the email before calling the API', async () => {
    let calls = 0
    acceptRequests(() => {
      calls += 1
    })
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.click(await screen.findByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText('Inserisci la tua email.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(calls).toBe(0)
  })

  it('sends the trimmed email and confirms without revealing if it exists', async () => {
    let body: unknown = null
    acceptRequests((value) => {
      body = value
    })
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), '  giulia@example.test ')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    const heading = await screen.findByRole('heading', { name: 'Controlla la tua email' })
    expect(heading).toHaveFocus()
    expect(screen.getByText(/Se giulia@example\.test corrisponde a un account attivo/)).toBeInTheDocument()
    expect(body).toEqual({ email: 'giulia@example.test' })
  })

  it('prefills the email typed on the login page', async () => {
    renderRoutes(routes, [{ pathname: '/forgot-password', state: { email: 'giulia@example.test' } }])

    expect(await screen.findByLabelText('Email')).toHaveValue('giulia@example.test')
  })

  it('keeps "send again" disabled for 60 seconds, then sends again', async () => {
    let calls = 0
    acceptRequests(() => {
      calls += 1
    })
    const { user } = renderRoutes(routes, ['/forgot-password'])
    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    // il broker ignora un nuovo link entro 60 s: il pulsante non deve promettere un'email che non arriva
    const resend = await screen.findByRole('button', { name: /Nuovo link tra \d+ s/ })
    expect(resend).toBeDisabled()
    expect(calls).toBe(1)
  })

  it('shows the wait in minutes when throttled', async () => {
    server.use(
      http.post('/api/auth/forgot-password', () => HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '600' } })),
    )
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    const messages = await screen.findAllByText('Troppe richieste. Potrai riprovare tra 10 minuti.')
    expect(messages).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Invia il link' })).toBeDisabled()
  })

  it('shows the server validation error under the field', async () => {
    server.use(
      http.post('/api/auth/forgot-password', () =>
        HttpResponse.json({ message: 'x', errors: { email: ['Il campo email deve essere un indirizzo email valido.'] } }, { status: 422 }),
      ),
    )
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText('Il campo email deve essere un indirizzo email valido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('tells a network problem apart', async () => {
    server.use(http.post('/api/auth/forgot-password', () => HttpResponse.error()))
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText('Impossibile contattare il server. Controlla la connessione e riprova.')).toBeInTheDocument()
  })

  it('has no accessibility violations in both states', async () => {
    acceptRequests()
    const { user, container } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await expectNoA11yViolations(container)
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))
    await screen.findByRole('heading', { name: 'Controlla la tua email' })
    await expectNoA11yViolations(container)
  })
})
```

Aggiungi in `LoginPage.test.tsx` la route `{ path: '/forgot-password', element: <p>forgot-page</p> }` all'array `routes` e questi test:

```tsx
  it('links to the forgot password page carrying the typed email', async () => {
    const { user, router } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), ' giulia@example.test ')
    await user.click(screen.getByRole('link', { name: 'Password dimenticata?' }))

    expect(await screen.findByText('forgot-page')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ email: 'giulia@example.test' })
  })

  it('confirms the password reset and prefills the email', async () => {
    renderRoutes(routes, [{ pathname: '/login', search: '?reason=password-reset', state: { email: 'giulia@example.test' } }])

    expect(await screen.findByText('Password aggiornata. Accedi con la nuova password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('giulia@example.test')
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/auth/pages/ForgotPasswordPage.test.tsx src/features/auth/pages/LoginPage.test.tsx`
Expected: FAIL. `ForgotPasswordPage` non esiste e il link manca nel login.

- [ ] **Step 4: Schema condiviso e hook**

`src/features/auth/validation.ts`:

```ts
import type { TFunction } from 'i18next'
import { z } from 'zod'

/** Email dei form di accesso: spazi tolti, obbligatoria e ben formata. */
export const emailField = (t: TFunction) => z.string().trim().min(1, t('validation.emailRequired')).pipe(z.email(t('validation.emailInvalid')))

/** Stato di navigazione con l'email da precompilare (WCAG 3.3.7: niente dati da reinserire). */
export const emailStateSchema = z.object({ email: z.string() })
```

In `src/features/auth/api.ts`, dopo `useResendCode`:

```ts
export const useForgotPassword = () =>
  useMutation({ mutationFn: (email: string) => request('POST', '/api/auth/forgot-password', { email }) })
```

- [ ] **Step 5: Pagina "Password dimenticata"**

`src/features/auth/pages/ForgotPasswordPage.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { ArrowLeft, CircleAlert, Clock, LoaderCircle, MailCheck, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import { Alert, AlertDescription, alertVariants } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useForgotPassword } from '@/features/auth/api'
import { emailField, emailStateSchema } from '@/features/auth/validation'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'

// Il broker di Laravel ignora un nuovo link per lo stesso utente entro 60 s
const RESEND_COOLDOWN_SECONDS = 60

const createForgotSchema = (t: TFunction) => z.object({ email: emailField(t) })

type ForgotValues = z.infer<ReturnType<typeof createForgotSchema>>

const toMinutes = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60))

const ForgotPasswordPage = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const forgot = useForgotPassword()
  const cooldown = useCountdown()
  const lock = useCountdown()
  // minuti iniziali del blocco: testo costante per gli screen reader, così non è riannunciato a ogni tick
  const [lockedFor, setLockedFor] = useState(0)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const schema = useMemo(() => createForgotSchema(t), [t])
  const initialState = emailStateSchema.safeParse(location.state)
  const form = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialState.success ? initialState.data.email : '' },
  })
  const { errors } = form.formState

  // Il contenuto cambia senza cambiare pagina: il focus va sul nuovo titolo (lo annuncia anche agli screen reader)
  useEffect(() => {
    if (sentTo !== null) document.getElementById('page-title')?.focus()
  }, [sentTo])

  const send = async (email: string, isResend: boolean) => {
    setFormError(null)
    // Svuota la regione di stato: lo stesso messaggio ripetuto viene annunciato di nuovo
    setInfo(null)
    try {
      await forgot.mutateAsync(email)
      setSentTo(email)
      cooldown.start(RESEND_COOLDOWN_SECONDS)
      if (isResend) setInfo(t('forgot.resent'))
    } catch (error) {
      if (isApiError(error, 'throttled')) {
        const seconds = error.retryAfter ?? RESEND_COOLDOWN_SECONDS
        setLockedFor(seconds)
        lock.start(seconds)
        return
      }
      const fieldError = isApiError(error, 'validation') ? error.fieldErrors.email?.[0] : undefined
      if (fieldError && !isResend) {
        form.setError('email', { message: fieldError }, { shouldFocus: true })
        return
      }
      setFormError(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
    }
  }

  const onSubmit = form.handleSubmit((values) => send(values.email, false))

  const notices =
    lock.secondsLeft > 0 ? (
      <Alert>
        <Clock aria-hidden="true" />
        <AlertDescription>
          <span className="sr-only">{t('forgot.throttled', { count: toMinutes(lockedFor) })}</span>
          <span aria-hidden="true" className="tabular-nums">
            {t('forgot.throttled', { count: toMinutes(lock.secondsLeft) })}
          </span>
        </AlertDescription>
      </Alert>
    ) : (
      formError && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )
    )

  const backToLogin = (
    <Button asChild variant="link" className="justify-self-start px-0">
      <Link to="/login">
        <ArrowLeft aria-hidden="true" />
        {t('forgot.backToLogin')}
      </Link>
    </Button>
  )

  if (sentTo !== null) {
    return (
      <>
        <PageHeading icon={<MailCheck className="size-5" aria-hidden="true" />} title={t('forgot.sentTitle')} description={t('forgot.sent', { email: sentTo })} />
        <div className="grid gap-4">
          {notices}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full tabular-nums"
            disabled={forgot.isPending || cooldown.secondsLeft > 0 || lock.secondsLeft > 0}
            onClick={() => void send(sentTo, true)}
          >
            <RotateCw aria-hidden="true" />
            {cooldown.secondsLeft > 0 ? t('forgot.resendIn', { count: cooldown.secondsLeft }) : t('forgot.resend')}
          </Button>
          {backToLogin}
          {/* Unica live region: il messaggio ha lo stile di Alert, senza role="alert" */}
          <div aria-live="polite">
            {info && (
              <div data-slot="alert" className={alertVariants()}>
                <AlertDescription>{info}</AlertDescription>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeading title={t('forgot.title')} description={t('forgot.subtitle')} />
      <div className="grid gap-4">
        {notices}
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
            <Button type="submit" size="lg" className="w-full" disabled={forgot.isPending || lock.secondsLeft > 0}>
              {forgot.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('forgot.submitting')}
                </>
              ) : (
                t('forgot.submit')
              )}
            </Button>
          </FieldGroup>
        </form>
        {backToLogin}
      </div>
    </>
  )
}

export default ForgotPasswordPage
```

Il lint React Hooks v7 potrebbe segnalare il `useEffect` sul focus perché tocca il DOM. In quel caso sposta il focus nel gestore: chiamalo dentro `send` dopo `setSentTo`, con `window.requestAnimationFrame(() => document.getElementById('page-title')?.focus())`.

- [ ] **Step 6: Login — link, avviso ed email precompilata**

In `LoginPage.tsx`:
- importa `Link`, `useLocation` da `react-router`, `useWatch` da `react-hook-form`, e `emailField`, `emailStateSchema` da `@/features/auth/validation`;
- usa `emailField(t)` per il campo email dello schema (al posto dello schema scritto nel file);
- estendi le notice:

```tsx
type Notice = 'expired' | 'logged-out' | 'restart' | 'password-reset'

const isNotice = (value: string | null): value is Notice =>
  value === 'expired' || value === 'logged-out' || value === 'restart' || value === 'password-reset'
```

- precompila l'email dallo stato di navigazione:

```tsx
  const location = useLocation()
  const initialState = emailStateSchema.safeParse(location.state)
  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialState.success ? initialState.data.email : '', password: '' },
  })
  const typedEmail = useWatch({ control: form.control, name: 'email' })
```

- tra il `Field` della password e il pulsante di invio aggiungi:

```tsx
            <Button asChild variant="link" size="sm" className="-mt-2 justify-self-end px-0">
              <Link to="/forgot-password" state={{ email: typedEmail.trim() }}>
                {t('login.forgot')}
              </Link>
            </Button>
```

L'ordine di tabulazione resta email → password → mostra password → "Password dimenticata?" → Continua.

- [ ] **Step 7: Route**

In `src/routes.tsx` importa `ForgotPasswordPage` e aggiungi dentro `AuthLayout`:

```tsx
              { path: '/forgot-password', element: <ForgotPasswordPage />, handle: { titleKey: 'titles.forgotPassword' } },
```

- [ ] **Step 8: Run tests and gates**

Run: `npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 9: Commit**

```bash
git add apps/react/src
git commit -m "feat(auth): pagina password dimenticata e link dal login"
```

---

## Task 5: Frontend — pagina della nuova password

**Files:**
- Create: `apps/react/src/features/auth/pages/ResetPasswordPage.tsx`, `apps/react/src/features/auth/pages/ResetPasswordPage.test.tsx`
- Modify: `apps/react/src/features/auth/api.ts`, `apps/react/src/routes.tsx`, `apps/react/src/locales/it.json`, `apps/react/src/locales/en.json`

**Interfaces:**
- Consumes: `POST /api/auth/reset-password` (Task 3), `emailStateSchema`, la notice `password-reset` del login e le chiavi `validation.passwordMin` e `titles.resetPassword` (Task 4).
- Produces: `useResetPassword()`, mutation `(input: ResetPasswordInput) => Promise<unknown>` con `interface ResetPasswordInput { token: string; email: string; password: string }`; route `/reset-password/:token`.

- [ ] **Step 1: Testi**

In `it.json`, sezione `reset` dopo `forgot`:

```json
  "reset": {
    "title": "Scegli una nuova password",
    "subtitle": "Poi accederai con la nuova password e il codice che ti mandiamo via email.",
    "password": "Nuova password",
    "hint": "Almeno 12 caratteri. Una frase facile da ricordare va benissimo.",
    "submit": "Salva la password",
    "submitting": "Salvataggio in corso…",
    "throttled": "Troppi tentativi. Potrai riprovare tra {{count}} secondi.",
    "invalidTitle": "Link non valido",
    "invalid": "Il link è scaduto o è già stato usato. I link valgono 60 minuti e funzionano una sola volta.",
    "requestNew": "Chiedi un nuovo link"
  },
```

In `en.json`:

```json
  "reset": {
    "title": "Choose a new password",
    "subtitle": "Then you’ll sign in with the new password and the code we email you.",
    "password": "New password",
    "hint": "At least 12 characters. An easy-to-remember phrase works great.",
    "submit": "Save password",
    "submitting": "Saving…",
    "throttled": "Too many attempts. You can try again in {{count}} seconds.",
    "invalidTitle": "Invalid link",
    "invalid": "This link has expired or was already used. Links are valid for 60 minutes and work only once.",
    "requestNew": "Ask for a new link"
  },
```

- [ ] **Step 2: Write the failing tests**

`src/features/auth/pages/ResetPasswordPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },
  { path: '/login', element: <p>login-page</p> },
  { path: '/forgot-password', element: <p>forgot-page</p> },
]

const LINK = '/reset-password/abc123?email=giulia%2Bhr%40example.test'
const NEW_PASSWORD = 'una-frase-lunga-e-nuova'
const INVALID = { message: 'x', errors: { token: ['Il link non è valido o è scaduto. Chiedine uno nuovo.'] } }

describe('ResetPasswordPage', () => {
  it('sends token, decoded email and password, then goes to the login', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/auth/reset-password', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { user, router } = renderRoutes(routes, [LINK])

    // "+" decodificato correttamente, non trasformato in spazio
    expect(await screen.findByLabelText('Email')).toHaveValue('giulia+hr@example.test')
    await user.type(screen.getByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(body).toEqual({ token: 'abc123', email: 'giulia+hr@example.test', password: NEW_PASSWORD })
    expect(router.state.location.search).toBe('?reason=password-reset')
    expect(router.state.location.state).toEqual({ email: 'giulia+hr@example.test' })
  })

  it('checks the length before calling the API', async () => {
    let calls = 0
    server.use(
      http.post('/api/auth/reset-password', () => {
        calls += 1
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), 'corta')
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText('La password deve avere almeno 12 caratteri.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nuova password')).toHaveFocus()
    expect(calls).toBe(0)
  })

  it('shows the server password error under the field', async () => {
    const message = 'Password è presente negli archivi dei dati trafugati.'
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json({ message, errors: { password: [message] } }, { status: 422 })))
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Nuova password')).toHaveFocus()
  })

  it('turns into "invalid link" with a way to ask for a new one', async () => {
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json(INVALID, { status: 422 })))
    const { user, router } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByRole('heading', { name: 'Link non valido' })).toHaveFocus()
    expect(screen.queryByLabelText('Nuova password')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Chiedi un nuovo link' }))
    expect(await screen.findByText('forgot-page')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ email: 'giulia+hr@example.test' })
  })

  it('treats a link without the email as invalid', async () => {
    renderRoutes(routes, ['/reset-password/abc123'])

    expect(await screen.findByRole('heading', { name: 'Link non valido' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nuova password')).not.toBeInTheDocument()
  })

  it('sends a single request on double submit', async () => {
    let calls = 0
    server.use(
      http.post('/api/auth/reset-password', async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.keyboard('{Enter}{Enter}')

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('locks the form while throttled', async () => {
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '30' } })))
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    const messages = await screen.findAllByText(/Troppi tentativi\. Potrai riprovare tra \d+ secondi\./)
    expect(messages[0]).toHaveTextContent('tra 30 secondi.')
    expect(screen.getByRole('button', { name: 'Salva la password' })).toBeDisabled()
  })

  it('has no accessibility violations in the form and in the invalid state', async () => {
    const { container, unmount } = renderRoutes(routes, [LINK])
    await screen.findByLabelText('Nuova password')
    await expectNoA11yViolations(container)
    unmount()

    const invalid = renderRoutes(routes, ['/reset-password/abc123'])
    await screen.findByRole('heading', { name: 'Link non valido' })
    await expectNoA11yViolations(invalid.container)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/auth/pages/ResetPasswordPage.test.tsx`
Expected: FAIL. `ResetPasswordPage` non esiste.

- [ ] **Step 4: Hook e pagina**

In `api.ts`:

```ts
export interface ResetPasswordInput {
  token: string
  email: string
  password: string
}

export const useResetPassword = () =>
  useMutation({ mutationFn: (input: ResetPasswordInput) => request('POST', '/api/auth/reset-password', input) })
```

`src/features/auth/pages/ResetPasswordPage.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { ArrowLeft, CircleAlert, Clock, LinkIcon, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useResetPassword } from '@/features/auth/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'

const MIN_PASSWORD_LENGTH = 12

const createResetSchema = (t: TFunction) => z.object({ password: z.string().min(MIN_PASSWORD_LENGTH, t('validation.passwordMin')) })

type ResetValues = z.infer<ReturnType<typeof createResetSchema>>

const ResetPasswordPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const reset = useResetPassword()
  const lock = useCountdown()
  // secondi iniziali del blocco: testo costante per gli screen reader
  const [lockedFor, setLockedFor] = useState(0)
  const [rejected, setRejected] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Evita il doppio invio (doppio click, Invio ripetuto): letto solo nei gestori di evento
  const submitting = useRef(false)
  const schema = useMemo(() => createResetSchema(t), [t])
  const form = useForm<ResetValues>({ resolver: zodResolver(schema), defaultValues: { password: '' } })
  const { errors } = form.formState

  // Link troncato dal client email (senza email o token) o rifiutato dal server: il form non serve più
  const linkInvalid = rejected || token === '' || !z.email().safeParse(email).success

  // Il contenuto cambia senza cambiare pagina: il focus va sul nuovo titolo
  useEffect(() => {
    if (rejected) document.getElementById('page-title')?.focus()
  }, [rejected])

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (submitting.current) return
    submitting.current = true
    setFormError(null)
    try {
      await reset.mutateAsync({ token, email, password })
      navigate('/login?reason=password-reset', { replace: true, state: { email } })
    } catch (error) {
      if (isApiError(error, 'throttled')) {
        const seconds = error.retryAfter ?? 60
        setLockedFor(seconds)
        lock.start(seconds)
        return
      }
      if (isApiError(error, 'validation')) {
        const passwordError = error.fieldErrors.password?.[0]
        if (passwordError) {
          form.setError('password', { message: passwordError }, { shouldFocus: true })
          return
        }
        setRejected(true)
        return
      }
      setFormError(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
    } finally {
      submitting.current = false
    }
  })

  const backToLogin = (
    <Button asChild variant="link" className="justify-self-start px-0">
      <Link to="/login">
        <ArrowLeft aria-hidden="true" />
        {t('forgot.backToLogin')}
      </Link>
    </Button>
  )

  if (linkInvalid) {
    return (
      <>
        <PageHeading icon={<LinkIcon className="size-5" aria-hidden="true" />} title={t('reset.invalidTitle')} description={t('reset.invalid')} />
        <div className="grid gap-4">
          <Button asChild size="lg" className="w-full">
            <Link to="/forgot-password" state={email ? { email } : undefined}>
              {t('reset.requestNew')}
            </Link>
          </Button>
          {backToLogin}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeading title={t('reset.title')} description={t('reset.subtitle')} />
      <div className="grid gap-4">
        {lock.secondsLeft > 0 ? (
          <Alert>
            <Clock aria-hidden="true" />
            <AlertDescription>
              <span className="sr-only">{t('reset.throttled', { count: lockedFor })}</span>
              <span aria-hidden="true" className="tabular-nums">
                {t('reset.throttled', { count: lock.secondsLeft })}
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          formError && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )
        )}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {/* Email visibile e in sola lettura: il gestore di password la associa alla nuova password */}
            <Field>
              <FieldLabel htmlFor="email">{t('login.email')}</FieldLabel>
              <Input id="email" type="email" autoComplete="username" value={email} readOnly />
            </Field>
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">{t('reset.password')}</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-hint password-error' : 'password-hint'}
                {...form.register('password')}
              />
              <FieldDescription id="password-hint">{t('reset.hint')}</FieldDescription>
              <FieldError id="password-error">{errors.password?.message}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={reset.isPending || lock.secondsLeft > 0}>
              {reset.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('reset.submitting')}
                </>
              ) : (
                t('reset.submit')
              )}
            </Button>
          </FieldGroup>
        </form>
        {backToLogin}
      </div>
    </>
  )
}

export default ResetPasswordPage
```

(Se il lint React Hooks segnala il `useEffect` sul focus, applica la stessa soluzione del Task 4: focus con `requestAnimationFrame` nel gestore, subito dopo `setRejected(true)`.)

- [ ] **Step 5: Route**

In `routes.tsx` importa `ResetPasswordPage` e aggiungi dentro `AuthLayout`:

```tsx
              { path: '/reset-password/:token', element: <ResetPasswordPage />, handle: { titleKey: 'titles.resetPassword' } },
```

- [ ] **Step 6: Run tests and gates**

Run: `npm test && npm run lint && npm run build`
Expected: tutto verde.

- [ ] **Step 7: Commit**

```bash
git add apps/react/src
git commit -m "feat(auth): pagina della nuova password con gestione del link non valido"
```

---

## Task 6: E2E del recupero password, WCAG e schermi piccoli

**Files:**
- Modify: `apps/laravel/database/seeders/DevUserSeeder.php`, `apps/laravel/CLAUDE.md`, `apps/react/CLAUDE.md`
- Modify: `apps/react/e2e/mailpit.ts`
- Create: `apps/react/e2e/password-reset.spec.ts`

**Interfaces:**
- Consumes: tutto il flusso (Task 1–5); Sail acceso con `queue`; `sail artisan migrate:fresh --seed` e `sail artisan cache:clear` prima degli E2E (come per la fase 1).
- Produces: `waitForResetLink(email: string, timeoutMs?: number): Promise<string>` in `e2e/mailpit.ts`, che restituisce percorso e query (`/reset-password/…?email=…`); utente di sviluppo `reset@holidays.test`.

- [ ] **Step 1: Utente per l'E2E**

In `DevUserSeeder::run()` aggiungi:

```php
        // Usato dall'E2E del recupero password: la sua password cambia a ogni esecuzione
        User::factory()->create(['name' => 'Paolo Greco', 'email' => 'reset@holidays.test', 'password' => self::PASSWORD]);
```

In `apps/laravel/CLAUDE.md`, nella riga degli utenti di sviluppo, aggiungi: `reset@holidays.test` (riservato all'E2E del recupero password, la password cambia a ogni esecuzione).

- [ ] **Step 2: Helper Mailpit**

Sostituisci in `e2e/mailpit.ts` la funzione `waitForLoginCode` con una ricerca generica che scorre tutte le email del destinatario (dalla più recente):

```ts
/** Attende un'email per `email` il cui testo contiene `pattern` e restituisce il primo gruppo catturato. */
const waitForMatch = async (email: string, pattern: RegExp, timeoutMs: number): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const list = listSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json())
    for (const message of list.messages.filter((item) => item.To.some((to) => to.Address === email))) {
      const detail = messageSchema.parse(await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json())
      const match = pattern.exec(detail.Text)
      if (match) return match[1]
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Nessuna email attesa ricevuta per ${email}`)
}

/** Attende l'email di login (la coda la invia in pochi secondi) e ne estrae il codice. */
export const waitForLoginCode = (email: string, timeoutMs = 20_000): Promise<string> => waitForMatch(email, /\b(\d{6})\b/, timeoutMs)

/** Attende l'email di recupero e ne estrae percorso e query del link (l'host dipende da FRONTEND_URL). */
export const waitForResetLink = (email: string, timeoutMs = 20_000): Promise<string> =>
  waitForMatch(email, /https?:\/\/[^/\s]+(\/reset-password\/[A-Za-z0-9]+\?email=[^\s)\]]+)/, timeoutMs)
```

- [ ] **Step 3: Spec E2E**

`e2e/password-reset.spec.ts`:

```ts
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { clearInbox, waitForLoginCode, waitForResetLink } from './mailpit.ts'

const RESET_USER = 'reset@holidays.test'
// Email inesistente: la risposta è identica, nessuna email parte
const UNKNOWN_USER = 'nessuno@holidays.test'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

const expectNoViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const violations = results.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
  expect(violations).toEqual([])
}

const expectNoViolationsInBothSchemes = async (page: Page): Promise<void> => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    const html = page.locator('html')
    if (colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
    else await expect(html).not.toHaveClass(/\bdark\b/)
    await expectNoViolations(page)
  }
}

test.beforeEach(async () => {
  await clearInbox()
})

test('a user resets the password from the emailed link and signs in with the new one', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(RESET_USER)
  await page.getByRole('link', { name: 'Password dimenticata?' }).click()
  await expect(page.getByRole('heading', { name: 'Password dimenticata?' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(RESET_USER)

  await page.getByRole('button', { name: 'Invia il link' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()

  const link = await waitForResetLink(RESET_USER)
  const newPassword = `nuova-frase-segreta-${Date.now()}`
  await page.goto(link)
  await expect(page.getByLabel('Email')).toHaveValue(RESET_USER)
  await page.getByLabel('Nuova password').fill(newPassword)
  await page.getByRole('button', { name: 'Salva la password' }).click()
  await expect(page.getByText('Password aggiornata. Accedi con la nuova password.')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(RESET_USER)

  // Il link funziona una sola volta
  await page.goto(link)
  await page.getByLabel('Nuova password').fill(`${newPassword}-bis`)
  await page.getByRole('button', { name: 'Salva la password' }).click()
  await expect(page.getByRole('heading', { name: 'Link non valido' })).toBeVisible()

  // Il login con la nuova password chiede comunque il codice
  await clearInbox()
  await page.goto('/login')
  await page.getByLabel('Email').fill(RESET_USER)
  await page.getByLabel('Password', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(RESET_USER))
  await expect(page.getByRole('heading', { name: 'Ciao, Paolo' })).toBeVisible()
})

test('password recovery pages have no WCAG violations in light and dark mode', async ({ page }) => {
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { name: 'Password dimenticata?' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)

  await page.getByLabel('Email').fill(UNKNOWN_USER)
  await page.getByRole('button', { name: 'Invia il link' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)

  await page.goto(`/reset-password/token-finto?email=${encodeURIComponent(UNKNOWN_USER)}`)
  await expect(page.getByRole('heading', { name: 'Scegli una nuova password' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)

  await page.getByLabel('Nuova password').fill('una-frase-lunga-qualsiasi')
  await page.getByRole('button', { name: 'Salva la password' }).click()
  await expect(page.getByRole('heading', { name: 'Link non valido' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)
})

test('access pages fit a phone screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  const paths = ['/login', '/forgot-password', `/reset-password/token-finto?email=${encodeURIComponent(UNKNOWN_USER)}`, '/reset-password/token-finto']
  for (const path of paths) {
    await page.goto(path)
    await expect(page.locator('#page-title')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})

test('password recovery works with the keyboard only', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').focus()
  await page.keyboard.type(UNKNOWN_USER)
  // email → password → mostra password → "Password dimenticata?"
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Password dimenticata?' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Password dimenticata?' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(UNKNOWN_USER)
})
```

Nota: `UNKNOWN_USER` consuma la richiesta di link in due test. Il limite è 3 ogni 15 minuti per email + IP, quindi prima di ogni esecuzione serve `sail artisan cache:clear` (già richiesto dagli E2E della fase 1).

- [ ] **Step 4: Run E2E**

Da `apps/laravel`: `sail up -d`, `sail artisan migrate:fresh --seed`, `sail artisan cache:clear`. Poi da `apps/react`: `npm run test:e2e`.
Expected: tutti i test PASS, sia `login.spec.ts` sia `password-reset.spec.ts`.

- [ ] **Step 5: Aggiorna le note E2E e fai il commit**

In `apps/react/CLAUDE.md`, nella riga di `npm run test:e2e`, aggiungi: gli E2E del recupero password usano `reset@holidays.test` e richiedono `cache:clear` (limite di 3 richieste di link ogni 15 minuti).

```bash
git add apps/laravel/database/seeders/DevUserSeeder.php apps/laravel/CLAUDE.md apps/react/CLAUDE.md apps/react/e2e
git commit -m "test(e2e): recupero password completo, wcag e schermi piccoli"
```

---

## Verifica finale (dopo i task)

1. Gate completi: backend (`sail artisan test --compact`, `sail composer analyse`, `sail bin pint --test`, `sail composer audit`) e frontend (`npm test`, `npm run lint`, `npm run build`, `npm audit`, `npm run test:e2e`).
2. Controllo visivo con Playwright a 360, 768 e 1280 px, in chiaro e in scuro, delle pagine `/login`, `/forgot-password` (form e conferma), `/reset-password/:token` (form e link non valido).
3. Code review dell'intero branch (correttezza e qualità) e security review del recupero password (enumerazione, tempi, token, limiti, sessioni, CSRF, link nelle email), con correzione dei problemi trovati.
