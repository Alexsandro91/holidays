<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Utenti di prova per lo sviluppo locale: finché non esistono gli inviti è l'unico modo per accedere.
 */
class DevUserSeeder extends Seeder
{
    public const PASSWORD = 'holidays-dev-password';

    public function run(): void
    {
        User::factory()->admin()->create(['name' => 'Giulia Rossi', 'email' => 'admin@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->manager()->create(['name' => 'Marco Bianchi', 'email' => 'manager@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->create(['name' => 'Sara Colombo', 'email' => 'employee@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->disabled()->create(['name' => 'Elena Romano', 'email' => 'disabled@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->invited()->create(['name' => 'Luca Ferrari', 'email' => 'invited@holidays.test']);
    }
}
