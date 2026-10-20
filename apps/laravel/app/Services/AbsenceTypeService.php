<?php

namespace App\Services;

use App\Models\AbsenceType;
use App\Models\User;
use App\Support\Translate;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Tipi di assenza (spec §3): si creano, si modificano, si archiviano e si ordinano, mai si cancellano. `code`,
 * `position` e `archived_at` si scrivono solo qui. Ogni modifica finisce nel log applicativo.
 */
final class AbsenceTypeService
{
    /**
     * Va in fondo all'elenco.
     *
     * @param  array<string, mixed>  $attributes  campi validati (senza `code`)
     */
    public function create(array $attributes, User $actor): AbsenceType
    {
        $type = $this->rejectingDuplicateName(fn (): AbsenceType => DB::transaction(function () use ($attributes): AbsenceType {
            $position = ((int) AbsenceType::query()->lockForUpdate()->max('position')) + 1;

            $type = new AbsenceType;
            $type->forceFill([...$attributes, 'code' => null, 'position' => $position, 'archived_at' => null])->save();

            return $type;
        }));

        Log::info('Absence type created', ['absence_type_id' => $type->id, 'actor_id' => $actor->id]);

        return $type;
    }

    /**
     * @param  array<string, mixed>  $attributes  campi validati (senza `code`)
     */
    public function update(AbsenceType $type, array $attributes, User $actor): AbsenceType
    {
        $updated = $this->rejectingDuplicateName(fn (): AbsenceType => DB::transaction(function () use ($type, $attributes): AbsenceType {
            $fresh = AbsenceType::query()->lockForUpdate()->findOrFail($type->id);
            unset($attributes['code'], $attributes['position'], $attributes['archived_at']);
            $fresh->forceFill($attributes)->save();

            return $fresh;
        }));

        Log::info('Absence type updated', [
            'absence_type_id' => $updated->id,
            'changed_fields' => array_values(array_diff(array_keys($updated->getChanges()), ['updated_at'])),
            'actor_id' => $actor->id,
        ]);

        return $updated;
    }

    public function archive(AbsenceType $type, User $actor): AbsenceType
    {
        $archived = DB::transaction(function () use ($type): AbsenceType {
            $fresh = AbsenceType::query()->lockForUpdate()->findOrFail($type->id);

            if (! $fresh->isArchived()) {
                $fresh->forceFill(['archived_at' => now()])->save();
            }

            return $fresh;
        });

        Log::info('Absence type archived', ['absence_type_id' => $archived->id, 'actor_id' => $actor->id]);

        return $archived;
    }

    public function restore(AbsenceType $type, User $actor): AbsenceType
    {
        $restored = DB::transaction(function () use ($type): AbsenceType {
            $fresh = AbsenceType::query()->lockForUpdate()->findOrFail($type->id);
            $fresh->forceFill(['archived_at' => null])->save();

            return $fresh;
        });

        Log::info('Absence type restored', ['absence_type_id' => $restored->id, 'actor_id' => $actor->id]);

        return $restored;
    }

    /**
     * Nuovo ordine: l'elenco deve contenere tutti e soli i tipi attivi (verificato sotto lock). I tipi archiviati
     * non si spostano.
     *
     * @param  list<int>  $ids
     */
    public function reorder(array $ids, User $actor): void
    {
        DB::transaction(function () use ($ids): void {
            $activeIds = AbsenceType::query()->active()->ordered()->lockForUpdate()->pluck('id')->map(intval(...))->all();

            if (count($ids) !== count($activeIds) || array_diff($ids, $activeIds) !== []) {
                throw ValidationException::withMessages(['ids' => Translate::text('absence_types.order_mismatch')]);
            }

            foreach ($ids as $index => $id) {
                AbsenceType::query()->whereKey($id)->update(['position' => $index + 1]);
            }
        });

        Log::info('Absence types reordered', ['count' => count($ids), 'actor_id' => $actor->id]);
    }

    /**
     * Due richieste con lo stesso nome superano entrambe `unique`: la seconda viola l'indice. Fuori dalla transazione
     * diventa lo stesso 422 su `name` della validazione.
     *
     * @template TResult
     *
     * @param  Closure(): TResult  $callback
     * @return TResult
     */
    private function rejectingDuplicateName(Closure $callback): mixed
    {
        try {
            return $callback();
        } catch (UniqueConstraintViolationException $exception) {
            // Solo l'indice del nome è unico oltre al codice, che qui non arriva mai dal body
            if (str_contains($exception->getMessage(), 'name')) {
                throw ValidationException::withMessages(['name' => Translate::text('absence_types.name_taken')]);
            }

            throw $exception;
        }
    }
}
