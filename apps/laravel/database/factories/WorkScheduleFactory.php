<?php

namespace Database\Factories;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkSchedule>
 */
class WorkScheduleFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // Default sulla principale: una sede nuova dalla factory crea già il suo orario dal 2000-01-01
            // (LocationFactory::configure), un secondo orario con la stessa data violerebbe l'indice unico
            'location_id' => fn (): int => Location::primary()->id,
            'user_id' => null,
            'valid_from' => '2000-01-01',
            'follows_location' => false,
            ...$this->minuteColumns([480, 480, 480, 480, 480, 0, 0]),
        ];
    }

    public function forLocation(Location $location): static
    {
        return $this->state(fn (array $attributes): array => ['location_id' => $location->id, 'user_id' => null]);
    }

    public function forUser(User $user): static
    {
        return $this->state(fn (array $attributes): array => ['location_id' => null, 'user_id' => $user->id]);
    }

    public function validFrom(string $date): static
    {
        return $this->state(fn (array $attributes): array => ['valid_from' => $date]);
    }

    /**
     * @param  list<int>  $minutes  sette valori, lunedì primo
     */
    public function minutes(array $minutes): static
    {
        return $this->state(fn (array $attributes): array => $this->minuteColumns($minutes));
    }

    /**
     * Riga personale che riporta all'orario della sede.
     */
    public function followsLocation(): static
    {
        return $this->state(fn (array $attributes): array => [
            'follows_location' => true,
            ...$this->minuteColumns([0, 0, 0, 0, 0, 0, 0]),
        ]);
    }

    /**
     * @param  list<int>  $minutes
     * @return array<string, int>
     */
    private function minuteColumns(array $minutes): array
    {
        return array_combine(array_map(fn (string $day): string => "{$day}_minutes", WorkSchedule::DAYS), $minutes);
    }
}
