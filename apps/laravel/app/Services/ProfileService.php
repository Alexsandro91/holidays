<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Profilo di chi è collegato (fase 4): nome, lingua e password, sempre e solo sul proprio account.
 */
final class ProfileService
{
    private const TRANSACTION_ATTEMPTS = 3;

    public function __construct(
        private readonly AuthEventLogger $events,
        private readonly PasswordResetService $passwordResets,
    ) {}

    /**
     * Salva i campi ricevuti. `user_updated` elenca i nomi dei campi di anagrafica cambiati, mai i valori:
     * la lingua è una preferenza e da sola non produce eventi.
     *
     * @param  array{first_name?: string, last_name?: string, locale?: string}  $data
     */
    public function update(User $user, array $data, Request $request): User
    {
        $fresh = DB::transaction(function () use ($user, $data, $request): User {
            $fresh = User::query()->lockForUpdate()->findOrFail($user->id);

            // Disattivato dopo il middleware: nessun salvataggio (la risposta la dà il chiamante, fuori dalla transazione)
            if (! $fresh->isActive()) {
                return $fresh;
            }

            $fresh->fill($data);
            $changedFields = array_values(array_intersect(array_keys($fresh->getDirty()), ['first_name', 'last_name']));

            if (! $fresh->isDirty()) {
                return $fresh;
            }

            $fresh->save();

            if ($changedFields !== []) {
                $this->events->log(AuthEventType::UserUpdated, $request, $fresh, $fresh, $changedFields);
            }

            return $fresh;
        }, self::TRANSACTION_ATTEMPTS);

        return $this->ensureActive($fresh, $request);
    }

    /**
     * Nuova password: chiude le altre sessioni (non quella corrente) e i login in attesa del codice, annulla i link di
     * recupero, registra l'evento e avvisa l'utente nella sua lingua dopo il commit. Restituisce l'utente aggiornato:
     * il chiamante lo mette nel guard e rigenera l'id della sessione.
     */
    public function changePassword(User $user, #[\SensitiveParameter] string $password, Request $request): User
    {
        $fresh = DB::transaction(function () use ($user, $password, $request): User {
            $fresh = User::query()->lockForUpdate()->findOrFail($user->id);

            // Disattivato dopo il middleware: niente cambio, niente email
            if (! $fresh->isActive()) {
                return $fresh;
            }

            $fresh->forceFill(['password' => $password])->save();

            DB::table((string) config('session.table', 'sessions'))
                ->where('user_id', $fresh->id)
                ->when($request->hasSession(), fn ($query) => $query->where('id', '!=', $request->session()->getId()))
                ->delete();

            // Come il reset: un login rimasto al passo del codice con la vecchia password non si può più completare
            LoginChallenge::query()->where('user_id', $fresh->id)->delete();
            $this->passwordResets->forgetResetTokens($fresh);
            $this->events->log(AuthEventType::PasswordChanged, $request, $fresh, $fresh);
            $this->passwordResets->queueChangedMail($fresh, $request);

            return $fresh;
        }, self::TRANSACTION_ATTEMPTS);

        return $this->ensureActive($fresh, $request);
    }

    /**
     * Utente non più attivo: stessa risposta 401 `account_disabled` del middleware, con la sessione chiusa.
     */
    private function ensureActive(User $fresh, Request $request): User
    {
        if (! $fresh->isActive()) {
            throw new HttpResponseException(AuthSession::disabledResponse($request));
        }

        return $fresh;
    }
}
