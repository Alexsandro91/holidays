<?php

namespace App\Services;

use App\Models\Closure as CompanyClosure;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Chiusure aziendali (spec §2.4): si creano, modificano e cancellano a qualunque data. Il log applicativo tiene
 * traccia di chi le ha cambiate (spec §4.7).
 */
final class ClosureService
{
    /**
     * @param  array<string, mixed>  $data  `location_id` (null = tutte le sedi), date e descrizione validate
     */
    public function create(array $data, User $actor): CompanyClosure
    {
        $closure = new CompanyClosure;
        $closure->forceFill($data)->save();
        Log::info('Closure created', ['closure_id' => $closure->id, 'location_id' => $closure->location_id, 'actor_id' => $actor->id]);

        return $closure;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(CompanyClosure $closure, array $data, User $actor): CompanyClosure
    {
        $closure->forceFill($data)->save();
        Log::info('Closure updated', ['closure_id' => $closure->id, 'location_id' => $closure->location_id, 'actor_id' => $actor->id]);

        return $closure;
    }

    public function delete(CompanyClosure $closure, User $actor): void
    {
        $closure->delete();
        Log::info('Closure deleted', ['closure_id' => $closure->id, 'location_id' => $closure->location_id, 'actor_id' => $actor->id]);
    }
}
