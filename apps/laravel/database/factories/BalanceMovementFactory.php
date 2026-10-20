<?php

namespace Database\Factories;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Per default una rettifica di ferie di oggi. `for(User)` è quello di Laravel (relazione `user`).
 *
 * @extends Factory<BalanceMovement>
 */
class BalanceMovementFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'balance' => BalanceType::Vacation,
            'kind' => BalanceMovementKind::Adjustment,
            'minutes' => 60,
            'effective_on' => now()->toDateString(),
            'period' => null,
            'target_minutes' => null,
            'note' => 'Rettifica',
            'actor_id' => null,
        ];
    }

    /**
     * Maturazione del mese `YYYY-MM`, datata il primo del mese.
     */
    public function accrual(string $period, int $minutes): static
    {
        return $this->state(fn (array $attributes): array => [
            'kind' => BalanceMovementKind::Accrual,
            'minutes' => $minutes,
            'period' => $period,
            'effective_on' => $period.'-01',
            'note' => null,
        ]);
    }

    public function adjustment(int $minutes): static
    {
        return $this->state(fn (array $attributes): array => [
            'kind' => BalanceMovementKind::Adjustment,
            'minutes' => $minutes,
            'period' => null,
        ]);
    }

    /**
     * Allineamento alla busta paga del giorno `$date`: `$minutes` è la differenza, `$target` il valore letto.
     */
    public function alignment(string $date, int $minutes, int $target): static
    {
        return $this->state(fn (array $attributes): array => [
            'kind' => BalanceMovementKind::Alignment,
            'minutes' => $minutes,
            'effective_on' => $date,
            'period' => null,
            'target_minutes' => $target,
            'note' => null,
        ]);
    }

    /**
     * Utilizzo (di norma negativo) con effetto il giorno `$date`, collegato a una richiesta se data.
     */
    public function usage(string $date, int $minutes, ?LeaveRequest $request = null): static
    {
        return $this->state(fn (array $attributes): array => [
            'kind' => BalanceMovementKind::Usage,
            'minutes' => $minutes,
            'effective_on' => $date,
            'period' => null,
            'target_minutes' => null,
            'note' => null,
            'leave_request_id' => $request?->id,
        ]);
    }
}
