<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Richieste di assenza (sotto-progetto 2, fase 3, spec §3): richieste, giorni, collegamento dai movimenti di saldo.
 * Archivia malattia e infortunio: valori letterali, niente Enum né servizi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('absence_type_id')->constrained()->restrictOnDelete();
            // Sede della persona al momento della richiesta
            $table->foreignId('location_id')->constrained();
            // days, half_day, hours
            $table->string('unit', 20);
            // Uguali per half_day e hours
            $table->date('starts_on');
            $table->date('ends_on');
            // morning o afternoon, solo per half_day
            $table->string('half', 20)->nullable();
            // Solo per hours, a multipli di 30 minuti
            $table->time('starts_at')->nullable();
            $table->time('ends_at')->nullable();
            $table->unsignedInteger('minutes');
            $table->decimal('working_days', 5, 2);
            $table->string('status', 30);
            $table->string('note', 500)->nullable();
            $table->string('decision_note', 500)->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamp('cancellation_requested_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            // request; closure dalla tappa 2
            $table->string('source', 20);
            // La richiesta resta anche se la chiusura viene cancellata
            $table->foreignId('closure_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->index(['user_id', 'starts_on']);
            $table->index(['status', 'location_id']);
        });

        Schema::create('leave_request_days', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('leave_request_id')->constrained()->cascadeOnDelete();
            $table->date('date')->index();
            // Minuti scalati quel giorno
            $table->unsignedInteger('minutes');
            $table->unique(['leave_request_id', 'date']);
        });

        Schema::table('balance_movements', function (Blueprint $table): void {
            $table->foreignId('leave_request_id')->nullable()->after('actor_id')->constrained()->nullOnDelete();
        });

        DB::table('absence_types')
            ->whereIn('code', ['sickness', 'injury'])
            ->whereNull('archived_at')
            ->update(['archived_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('balance_movements', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('leave_request_id');
        });
        Schema::dropIfExists('leave_request_days');
        Schema::dropIfExists('leave_requests');

        DB::table('absence_types')->whereIn('code', ['sickness', 'injury'])->update(['archived_at' => null]);
    }
};
