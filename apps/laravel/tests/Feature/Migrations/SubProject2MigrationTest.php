<?php

namespace Tests\Feature\Migrations;

use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Migration del sotto-progetto 2 su un database che ha già utenti (spec §2.6): lo schema di prima della fase, gli
 * utenti di allora, poi le migration nuove.
 */
class SubProject2MigrationTest extends TestCase
{
    use DatabaseMigrations;

    /**
     * Prima migration del sotto-progetto 2: le precedenti formano lo schema "di prima".
     */
    private const FIRST_NEW_MIGRATION = '2026_10_15_100000';

    public function test_existing_users_move_to_the_new_primary_location(): void
    {
        $this->legacyDatabaseWith([
            ['first_name' => 'Giulia', 'last_name' => 'Rossi', 'email' => 'giulia@example.test', 'role' => 'admin'],
            ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara@example.test', 'role' => 'employee'],
        ]);

        $primary = Location::primary();
        $this->assertSame(['giulia@example.test', 'sara@example.test'], DB::table('users')->where('location_id', $primary->id)->orderBy('email')->pluck('email')->all());
        $this->assertFalse(collect(Schema::getColumns('users'))->firstWhere('name', 'location_id')['nullable']);
        $this->assertSame(1, Location::query()->count());
    }

    /**
     * Ricrea lo schema di prima della fase, inserisce gli utenti di allora e applica le migration nuove.
     *
     * @param  list<array{first_name: string, last_name: string, email: string, role: string}>  $users
     */
    private function legacyDatabaseWith(array $users): void
    {
        $before = collect(glob(database_path('migrations/*.php')) ?: [])
            ->filter(fn (string $path): bool => basename($path) < self::FIRST_NEW_MIGRATION)
            ->values()
            ->all();

        $this->artisan('migrate:fresh', ['--path' => $before, '--realpath' => true])->assertSuccessful();

        foreach ($users as $user) {
            DB::table('users')->insert([
                ...$user,
                'password' => null,
                'status' => 'active',
                'locale' => 'it',
                'created_at' => '2026-03-03 09:00:00',
                'updated_at' => '2026-03-03 09:00:00',
            ]);
        }

        $this->artisan('migrate')->assertSuccessful();
    }
}
