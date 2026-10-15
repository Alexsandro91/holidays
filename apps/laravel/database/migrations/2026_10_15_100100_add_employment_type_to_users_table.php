<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tipo di rapporto (spec §7.1): dipendente, collaboratore esterno o stagista, separato dal ruolo.
 * Il default porta tutti gli utenti esistenti a `employee` (valore letterale).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('employment_type', 20)->default('employee')->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('employment_type');
        });
    }
};
