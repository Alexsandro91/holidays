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
        User::factory()->admin()->create(['first_name' => 'Giulia', 'last_name' => 'Rossi', 'email' => 'admin@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->manager()->create(['first_name' => 'Marco', 'last_name' => 'Bianchi', 'email' => 'manager@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->create(['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'employee@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->disabled()->create(['first_name' => 'Elena', 'last_name' => 'Romano', 'email' => 'disabled@holidays.test', 'password' => self::PASSWORD]);
        // Usato dall'E2E del recupero password: la sua password cambia a ogni esecuzione
        User::factory()->create(['first_name' => 'Paolo', 'last_name' => 'Greco', 'email' => 'reset@holidays.test', 'password' => self::PASSWORD]);
        // Usato dall'E2E del profilo: cambia la password e la rimette a fine test
        User::factory()->create(['first_name' => 'Paolo', 'last_name' => 'Ferri', 'email' => 'profile@holidays.test', 'password' => self::PASSWORD]);
        User::factory()->invited()->create(['first_name' => 'Luca', 'last_name' => 'Ferrari', 'email' => 'invited@holidays.test']);
    }
}
