<?php

namespace App\Services;

use App\Models\AbsenceType;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Abilitazioni per persona (spec §3.4): chi può usare i tipi che le richiedono. Il cambio di tipo di rapporto non le
 * tocca: restano registrate e il tipo torna utilizzabile se la persona torna in un rapporto a cui vale.
 */
final class AbsenceTypeEnablementService
{
    /**
     * Tipi attivi che valgono per il tipo di rapporto della persona, in ordine, con `enabled` calcolato (sempre falso
     * per i tipi che non richiedono abilitazione).
     *
     * @return Collection<int, AbsenceType>
     */
    public function forUser(User $user): Collection
    {
        $enabledIds = $this->enabledIds($user);

        return $this->listed($user)
            ->each(fn (AbsenceType $type) => $type->setAttribute('enabled', $type->requires_enablement && in_array($type->id, $enabledIds, true)))
            ->values();
    }

    /**
     * Tipi attivi che valgono per il rapporto attuale: gli unici che l'admin vede e può cambiare.
     *
     * @return Collection<int, AbsenceType>
     */
    private function listed(User $user): Collection
    {
        return AbsenceType::query()->active()->ordered()->get()
            ->filter(fn (AbsenceType $type): bool => $type->appliesTo($user->employment_type))
            ->values();
    }

    /**
     * @return list<int>
     */
    private function enabledIds(User $user): array
    {
        return $user->enabledAbsenceTypes()->pluck('absence_types.id')->map(intval(...))->values()->all();
    }

    /**
     * Il nuovo elenco sostituisce il precedente limitatamente ai tipi che `forUser` mostra: chi manca viene disabilitato,
     * i nuovi registrano chi li ha abilitati. Le abilitazioni su tipi archiviati o non validi per il rapporto attuale
     * restano com'erano (tornano utili se il tipo si ripristina o il rapporto cambia di nuovo).
     * Che gli id siano tipi attivi con abilitazione lo verifica la richiesta.
     *
     * @param  list<int>  $typeIds
     */
    public function sync(User $target, array $typeIds, User $actor): void
    {
        [$before, $after] = DB::transaction(function () use ($target, $typeIds, $actor): array {
            // Blocca la riga della persona: due salvataggi insieme si accodano
            User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();

            $visible = $this->listed($target)->pluck('id')->map(intval(...))->all();
            $before = array_values(array_intersect($this->enabledIds($target), $visible));
            sort($before);
            $after = array_values(array_intersect(array_unique($typeIds), $visible));
            sort($after);

            $removed = array_values(array_diff($before, $after));
            if ($removed !== []) {
                $target->enabledAbsenceTypes()->detach($removed);
            }

            $added = array_values(array_diff($after, $before));
            if ($added !== []) {
                $target->enabledAbsenceTypes()->attach(array_fill_keys($added, ['actor_id' => $actor->id, 'created_at' => now()]));
            }

            return [$before, $after];
        });

        if ($before !== $after) {
            Log::info('Absence type enablements changed', [
                'user_id' => $target->id,
                'before' => $before,
                'after' => $after,
                'actor_id' => $actor->id,
            ]);
        }
    }
}
