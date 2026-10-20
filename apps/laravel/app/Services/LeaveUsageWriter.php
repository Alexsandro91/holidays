<?php

namespace App\Services;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Models\AbsenceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestDay;
use App\Models\User;
use App\Support\LeaveComputation;
use Carbon\CarbonImmutable;
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

        $months = $this->minutesByMonth($request, null);
        $this->write($request, $type->balance, $months, -1, $actor);

        Log::info('Leave usage charged', [
            'leave_request_id' => $request->id,
            'user_id' => $request->user_id,
            'balance' => $type->balance->value,
            'minutes' => -array_sum(array_column($months, 'minutes')),
            'months' => array_keys($months),
            'actor_id' => $actor?->id,
        ]);
    }

    /**
     * Restituisce il saldo: un movimento positivo per ogni mese con minuti, solo per i giorni da `$fromDay` se dato.
     * Il saldo è quello dei movimenti già scritti per la richiesta, non quello attuale del tipo (che l'admin può aver
     * cambiato): senza movimenti non c'è niente da restituire.
     */
    public function refund(LeaveRequest $request, ?User $actor, ?CarbonImmutable $fromDay = null): void
    {
        /** @var BalanceType|null $balance */
        $balance = $request->movements()->where('kind', BalanceMovementKind::Usage)->value('balance');

        if ($balance === null) {
            return;
        }

        $months = $this->minutesByMonth($request, $fromDay);
        $this->write($request, $balance, $months, 1, $actor);

        Log::info('Leave usage refunded', [
            'leave_request_id' => $request->id,
            'user_id' => $request->user_id,
            'balance' => $balance->value,
            'minutes' => array_sum(array_column($months, 'minutes')),
            'months' => array_keys($months),
            'from_day' => $fromDay?->toDateString(),
            'actor_id' => $actor?->id,
        ]);
    }

    /**
     * Minuti per mese dai giorni della richiesta, eventualmente solo da `$fromDay`.
     *
     * @return array<string, array{first_day: string, minutes: int}>
     */
    private function minutesByMonth(LeaveRequest $request, ?CarbonImmutable $fromDay): array
    {
        $days = $request->days()
            ->when($fromDay !== null, fn ($query) => $query->where('date', '>=', $fromDay?->toDateString()))
            ->orderBy('date')
            ->get()
            ->map(fn (LeaveRequestDay $day): array => ['date' => $day->date->toDateString(), 'minutes' => $day->minutes])
            ->values()
            ->all();

        return (new LeaveComputation($days, (int) array_sum(array_column($days, 'minutes')), 0.0))->minutesByMonth();
    }

    /**
     * Un movimento per mese, in una sola insert; `$sign` −1 scala, +1 restituisce.
     *
     * @param  array<string, array{first_day: string, minutes: int}>  $months
     */
    private function write(LeaveRequest $request, BalanceType $balance, array $months, int $sign, ?User $actor): void
    {
        if ($months === []) {
            return;
        }

        $createdAt = now();
        $rows = [];

        foreach ($months as $month) {
            $rows[] = [
                'user_id' => $request->user_id,
                'balance' => $balance->value,
                'kind' => BalanceMovementKind::Usage->value,
                'minutes' => $sign * $month['minutes'],
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
    }
}
