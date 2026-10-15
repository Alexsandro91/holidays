<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Storico della persona (spec §8.2): dura quanto l'account, a differenza di `auth_events`. Ogni utente esistente
 * riceve una tappa `imported` con la data di creazione e ruolo, tipo e sede attuali (valori letterali, una sola
 * INSERT … SELECT).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_history', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('event', 40);
            // Valore dell'enum per ruolo e tipo, id per la sede
            $table->string('old_value', 40)->nullable();
            $table->string('new_value', 40)->nullable();
            // Solo per `invited` e `imported`: ruolo, tipo e id della sede di partenza
            $table->json('context')->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->index(['user_id', 'created_at']);
        });

        DB::statement(<<<'SQL'
            INSERT INTO user_history (user_id, event, context, created_at)
            SELECT id, 'imported', JSON_OBJECT('role', role, 'employment_type', employment_type, 'location_id', location_id), COALESCE(created_at, CURRENT_TIMESTAMP)
            FROM users
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('user_history');
    }
};
