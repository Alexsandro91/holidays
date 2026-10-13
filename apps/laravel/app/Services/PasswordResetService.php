<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Mail\PasswordChangedMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Auth\Passwords\PasswordBroker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Timebox;
use LogicException;

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
            // Un errore dell'infrastruttura (token, coda) è segnalato ma non cambia la risposta:
            // un 500 solo per le email registrate rivelerebbe quali account esistono
            rescue(function () use ($email): void {
                // Esito ignorato di proposito: utente inesistente, non attivo o link già chiesto da meno di 60 s
                $this->broker()->sendResetLink(['email' => $email, 'status' => UserStatus::Active->value]);
            }, report: true);
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

                DB::transaction(function () use ($user, $password, $request): void {
                    $user->forceFill(['password' => $password])->save();
                    // Chi aveva rubato la password perde subito l'accesso e i codici in attesa
                    AuthSession::endAllFor($user);
                    LoginChallenge::query()->where('user_id', $user->id)->delete();
                    $this->events->log(AuthEventType::PasswordReset, $request, $user);
                    // Link annullato insieme al cambio: un errore dopo il commit non lo lascia riusabile
                    $this->broker()->deleteToken($user);

                    // Dopo il commit: un errore della coda è segnalato, non annulla il cambio né la risposta
                    DB::afterCommit(fn () => rescue(
                        fn () => Mail::to($user)->send(new PasswordChangedMail((string) $request->userAgent(), now())),
                        report: true,
                    ));
                });
            },
        );

        return $status === PasswordBroker::PASSWORD_RESET ? $resetUser : null;
    }

    private function broker(): PasswordBroker
    {
        $broker = Password::broker((string) config('fortify.passwords'));

        // Serve la classe concreta per deleteToken(), che il contratto non espone
        if (! $broker instanceof PasswordBroker) {
            throw new LogicException('Unexpected password broker implementation.');
        }

        return $broker;
    }
}
