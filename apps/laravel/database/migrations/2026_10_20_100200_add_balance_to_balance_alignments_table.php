<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Allineamenti registrati per saldo (spec §4.3, §5.2): una riga per ogni saldo indicato, anche senza differenza, così
 * "mai prima dell'ultimo allineamento" e lo stop della maturazione si leggono saldo per saldo. Nullable solo per le
 * eventuali righe scritte prima di questa migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('balance_alignments', function (Blueprint $table): void {
            $table->string('balance', 20)->nullable()->after('user_id');
            $table->index(['user_id', 'balance', 'aligned_on']);
        });
    }

    public function down(): void
    {
        Schema::table('balance_alignments', function (Blueprint $table): void {
            $table->dropIndex(['user_id', 'balance', 'aligned_on']);
            $table->dropColumn('balance');
        });
    }
};
