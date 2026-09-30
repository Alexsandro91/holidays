<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => Role::Employee,
            'status' => UserStatus::Active,
            'locale' => 'it',
        ];
    }

    public function admin(): static
    {
        return $this->state(fn (array $attributes): array => ['role' => Role::Admin]);
    }

    public function manager(): static
    {
        return $this->state(fn (array $attributes): array => ['role' => Role::Manager]);
    }

    public function invited(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => UserStatus::Invited,
            'password' => null,
            'email_verified_at' => null,
        ]);
    }

    public function disabled(): static
    {
        return $this->state(fn (array $attributes): array => ['status' => UserStatus::Disabled]);
    }
}
