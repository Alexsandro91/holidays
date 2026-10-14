<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nomi dei campi cambiati da una modifica utente (`user_updated`, spec del 14/10 §7.3): mai i valori.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('auth_events', function (Blueprint $table): void {
            $table->json('changed_fields')->nullable()->after('event');
        });
    }

    public function down(): void
    {
        Schema::table('auth_events', function (Blueprint $table): void {
            $table->dropColumn('changed_fields');
        });
    }
};
