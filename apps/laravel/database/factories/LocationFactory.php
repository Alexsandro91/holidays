<?php

namespace Database\Factories;

use App\Models\Location;
use App\Models\WorkSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Location>
 */
class LocationFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->city().' '.fake()->unique()->numberBetween(1, 99999),
            'city' => fake()->city(),
            'country' => Location::DEFAULT_COUNTRY,
            'timezone' => Location::DEFAULT_TIMEZONE,
            'patron_day' => null,
            'patron_month' => null,
            'primary_marker' => null,
            'archived_at' => null,
        ];
    }

    /**
     * Ogni sede ha un orario standard, come quelle create dal servizio: lunedì-venerdì 8 ore, dal 2000.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (Location $location): void {
            WorkSchedule::factory()->forLocation($location)->create();
        });
    }

    public function primary(): static
    {
        return $this->state(fn (array $attributes): array => ['primary_marker' => 1]);
    }

    public function archived(): static
    {
        return $this->state(fn (array $attributes): array => ['archived_at' => now()]);
    }

    public function withPatron(int $day, int $month): static
    {
        return $this->state(fn (array $attributes): array => ['patron_day' => $day, 'patron_month' => $month]);
    }
}
