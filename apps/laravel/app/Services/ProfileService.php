<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Models\User;
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
        return DB::transaction(function () use ($user, $data, $request): User {
            $fresh = User::query()->lockForUpdate()->findOrFail($user->id);
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
    }

    /**
     * Nuova password: chiude le altre sessioni (non quella corrente), annulla i link di recupero, registra l'evento
     * e avvisa l'utente nella sua lingua dopo il commit. Rigenerare l'id della sessione corrente tocca al chiamante.
     */
    public function changePassword(User $user, #[\SensitiveParameter] string $password, Request $request): void
    {
        DB::transaction(function () use ($user, $password, $request): void {
            $fresh = User::query()->lockForUpdate()->findOrFail($user->id);
            $fresh->forceFill(['password' => $password])->save();

            DB::table((string) config('session.table', 'sessions'))
                ->where('user_id', $fresh->id)
                ->when($request->hasSession(), fn ($query) => $query->where('id', '!=', $request->session()->getId()))
                ->delete();

            $this->passwordResets->forgetResetTokens($fresh);
            $this->events->log(AuthEventType::PasswordChanged, $request, $fresh, $fresh);
            $this->passwordResets->queueChangedMail($fresh, $request);
        }, self::TRANSACTION_ATTEMPTS);
    }
}
