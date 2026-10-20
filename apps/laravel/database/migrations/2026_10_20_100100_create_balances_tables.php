<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Valori annui di maturazione, movimenti di saldo e allineamenti (sotto-progetto 2, fase 2, spec §4.1, §5, §5.2).
 * Inserisce la riga azienda dei valori annui: valori letterali, niente Enum né servizi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accrual_settings', function (Blueprint $table): void {
            $table->id();
            // Al massimo uno tra i due (lo garantisce il servizio); entrambi NULL = riga azienda
            $table->foreignId('location_id')->nullable()->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->unique()->constrained()->cascadeOnDelete();
            // Monte annuo per un tempo pieno, in minuti; NULL = eredita dal livello sopra
            $table->unsignedInteger('vacation_minutes')->nullable();
            $table->unsignedInteger('rol_minutes')->nullable();
            $table->unsignedInteger('ex_holidays_minutes')->nullable();
            $table->timestamps();
        });

        Schema::create('balance_movements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('balance', 20);
            $table->string('kind', 20);
            // Variazione con segno, in minuti
            $table->integer('minutes');
            $table->date('effective_on');
            // YYYY-MM, solo per la maturazione
            $table->char('period', 7)->nullable();
            // Solo per l'allineamento: il valore letto in busta paga
            $table->integer('target_minutes')->nullable();
            $table->string('note', 255)->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();
            // I NULL di `period` non collidono: la maturazione di un mese è una sola
            $table->unique(['user_id', 'balance', 'period']);
            $table->index(['user_id', 'balance', 'effective_on']);
        });

        Schema::create('balance_alignments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('aligned_on');
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->index(['user_id', 'aligned_on']);
        });

        $now = now();
        DB::table('accrual_settings')->insert([
            'location_id' => null,
            'user_id' => null,
            // 160 h di ferie (4 settimane a 40 ore, minimo di legge), ROL ed ex festività da impostare
            'vacation_minutes' => 9600,
            'rol_minutes' => 0,
            'ex_holidays_minutes' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('balance_alignments');
        Schema::dropIfExists('balance_movements');
        Schema::dropIfExists('accrual_settings');
    }
};
