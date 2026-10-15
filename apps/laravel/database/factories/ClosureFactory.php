<?php

namespace Database\Factories;

use App\Models\Closure;
use App\Models\Location;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Closure>
 */
class ClosureFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'location_id' => null,
            'starts_on' => '2026-08-10',
            'ends_on' => '2026-08-14',
            'description' => 'Chiusura estiva',
        ];
    }

    public function forLocation(Location $location): static
    {
        return $this->state(fn (array $attributes): array => ['location_id' => $location->id]);
    }

    public function between(string $startsOn, string $endsOn): static
    {
        return $this->state(fn (array $attributes): array => ['starts_on' => $startsOn, 'ends_on' => $endsOn]);
    }
}
