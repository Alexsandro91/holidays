<?php

namespace App\Services;

use App\Enums\BalanceMovementKind;
use App\Models\AbsenceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestDay;
use App\Models\User;
use App\Support\LeaveComputation;
use Illuminate\Support\Facades\Log;

/**
 * Unico punto che scrive i movimenti `usage` delle richieste (spec §3.3, §5.3): uno per richiesta e per mese, datato
 * al primo giorno di assenza di quel mese. Solo per i tipi con saldo. Lo chiama `LeaveRequestService`, dentro la
 * transazione e sotto lock della riga dell'utente.
 */
final class LeaveUsageWriter
{
    /**
     * Scala il saldo: un movimento negativo per ogni mese con minuti.
     */
    public function charge(LeaveRequest $request, ?User $actor): void
    {
        /** @var AbsenceType $type */
        $type = $request->absenceType()->firstOrFail();

        if ($type->balance === null) {
            return;
        }

        $days = $request->days()->orderBy('date')->get()
            ->map(fn (LeaveRequestDay $day): array => ['date' => $day->date->toDateString(), 'minutes' => $day->minutes])
            ->values()
            ->all();
        $months = (new LeaveComputation($days, $request->minutes, (float) $request->working_days))->minutesByMonth();

        if ($months === []) {
            return;
        }

        $createdAt = now();
        $rows = [];

        foreach ($months as $month) {
            $rows[] = [
                'user_id' => $request->user_id,
                'balance' => $type->balance->value,
                'kind' => BalanceMovementKind::Usage->value,
                'minutes' => -$month['minutes'],
                'effective_on' => $month['first_day'],
                'period' => null,
                'target_minutes' => null,
                'note' => null,
                'actor_id' => $actor?->id,
                'leave_request_id' => $request->id,
                'created_at' => $createdAt,
            ];
        }

        BalanceMovement::query()->insert($rows);

        Log::info('Leave usage charged', [
            'leave_request_id' => $request->id,
            'user_id' => $request->user_id,
            'balance' => $type->balance->value,
            'minutes' => -array_sum(array_column($months, 'minutes')),
            'months' => array_keys($months),
            'actor_id' => $actor?->id,
        ]);
    }
}
