<?php

namespace App\Http\Resources;

use App\Support\LeaveComputation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Anteprima di una richiesta (spec §6): giorni con i minuti, totale, giorni contati, saldo del tipo (se ne ha uno) e
 * avvisi. Nessuna scrittura.
 *
 * @property array{computation: LeaveComputation, balance: ?array{balance: string, current_minutes: int, available_minutes: int, after_minutes: int}, warnings: list<array{code: string, params: array<string, int|float|string>}>} $resource
 */
final class LeavePreviewResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $computation = $this->resource['computation'];

        return [
            'days' => $computation->days,
            'minutes' => $computation->minutes,
            'working_days' => $computation->workingDays,
            'balance' => $this->resource['balance'],
            'warnings' => $this->resource['warnings'],
        ];
    }
}
