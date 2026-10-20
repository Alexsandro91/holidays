<?php

namespace Database\Factories;

use App\Enums\AbsenceDayCount;
use App\Enums\BalanceType;
use App\Models\AbsenceType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Per default un tipo personalizzato: senza `code`, a giorni, senza saldo, con approvazione, vale per tutti.
 *
 * @extends Factory<AbsenceType>
 */
class AbsenceTypeFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => null,
            'name' => fake()->unique()->words(2, true).' '.fake()->unique()->numberBetween(1, 99999),
            'allows_days' => true,
            'allows_half_days' => false,
            'allows_hours' => false,
            'balance' => null,
            'requires_approval' => true,
            'employment_types' => ['employee', 'contractor', 'intern'],
            'requires_enablement' => false,
            'day_count' => AbsenceDayCount::Working,
            'requires_certificate' => false,
            'limit_amount' => null,
            'limit_unit' => null,
            'limit_period' => null,
            'position' => fn (): int => ((int) AbsenceType::query()->max('position')) + 1,
            'archived_at' => null,
        ];
    }

    /**
     * Tipo di partenza: ha un codice e il nome tradotto (`name` null).
     */
    public function system(string $code): static
    {
        return $this->state(fn (array $attributes): array => ['code' => $code, 'name' => null]);
    }

    public function withBalance(BalanceType $balance): static
    {
        return $this->state(fn (array $attributes): array => [
            'balance' => $balance,
            'employment_types' => ['employee'],
        ]);
    }

    public function requiringEnablement(): static
    {
        return $this->state(fn (array $attributes): array => ['requires_enablement' => true]);
    }

    public function archived(): static
    {
        return $this->state(fn (array $attributes): array => ['archived_at' => now()]);
    }
}
