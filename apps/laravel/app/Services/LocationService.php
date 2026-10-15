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
     * Nuova sede in Italia, con l'orario che la principale applica oggi (valido da oggi, nel fuso della sede).
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
     * Si blocca solo la riga della sede, poi si contano le persone senza bloccarle. Un invito o uno spostamento verso
     * questa sede blocca la stessa riga (dopo le persone coinvolte), quindi non finisce in una sede appena archiviata.
     * Bloccare qui anche le persone invertirebbe l'ordine persona → sede di quei flussi: rischio di deadlock.
     */
    public function archive(Location $location, User $actor): Location
    {
        $archived = DB::transaction(function () use ($location): Location {
            $fresh = Location::query()->lockForUpdate()->findOrFail($location->id);

            if ($fresh->isPrimary()) {
                throw new ConflictHttpException(Translate::text('locations.primary'));
            }

            // Persone in qualunque stato, invitati e disattivati compresi. Questo `exists()` non bloccante deve restare
            // la prima lettura consistente della transazione, dopo il blocco della sede: la fotografia REPEATABLE READ
            // nasce qui, quindi vede gli inviti e gli spostamenti già committati da chi aveva la sede prima di noi.
            // Una lettura semplice aggiunta prima del blocco fisserebbe la fotografia troppo presto e riaprirebbe la
            // corsa tra archiviazione e invito.
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
