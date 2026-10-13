<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Mail\PasswordChangedMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Timebox;

/**
 * Recupero password con il broker di Laravel: link solo agli utenti attivi, nessun indizio sull'esistenza dell'email.
 */
final class PasswordResetService
{
    /** Durata minima della richiesta del link: uguale con e senza invio (hash del token, scrittura in coda). */
    private const MIN_LINK_DURATION_MICROSECONDS = 400_000;

    public function __construct(private readonly AuthEventLogger $events) {}

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

    /**
     * Imposta la nuova password se il link è valido, non scaduto e di un utente attivo.
     * Restituisce l'utente del link, oppure null se il link non vale.
     *
     * @param  array{email: string, token: string, password: string}  $credentials
     */
    public function reset(#[\SensitiveParameter] array $credentials, Request $request): ?User
    {
        $resetUser = null;

        $status = $this->broker()->reset(
            [...$credentials, 'status' => UserStatus::Active->value],
            function (User $user, string $password) use ($request, &$resetUser): void {
                $resetUser = $user;

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

        return $status === PasswordBroker::PASSWORD_RESET ? $resetUser : null;
    }

    private function broker(): PasswordBroker
    {
        return Password::broker((string) config('fortify.passwords'));
    }
}
