<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sedi, orari di lavoro e chiusure (sotto-progetto 2, fase 1, spec §2). Ogni ambiente nasce con la "Sede principale"
 * (lunedì-venerdì, 8 ore, valido da oggi) e ogni utente esistente ci viene associato. È l'unica migration che
 * inserisce dati: valori letterali, niente Enum né servizi.
 */
return new class extends Migration
{
    private const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    public function up(): void
    {
        Schema::create('locations', function (Blueprint $table): void {
            $table->id();
            // Collation case-insensitive (utf8mb4_unicode_ci): "Milano" e "milano" sono lo stesso nome
            $table->string('name', 100)->unique();
            $table->string('city', 100)->nullable();
            $table->char('country', 2);
            $table->string('timezone', 64);
            $table->unsignedTinyInteger('patron_day')->nullable();
            $table->unsignedTinyInteger('patron_month')->nullable();
            // 1 per la principale, NULL per le altre: l'indice unico ammette più NULL ma un solo 1
            $table->unsignedTinyInteger('primary_marker')->nullable()->unique();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });

        Schema::create('work_schedules', function (Blueprint $table): void {
            $table->id();
            // Esattamente uno dei due: orario standard della sede o orario personale (lo garantisce il servizio)
            $table->foreignId('location_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('valid_from');
            $table->boolean('follows_location')->default(false);

            foreach (self::DAYS as $day) {
                $table->unsignedSmallInteger("{$day}_minutes")->default(0);
            }

            $table->timestamps();
            $table->unique(['location_id', 'valid_from']);
            $table->unique(['user_id', 'valid_from']);
        });

        Schema::create('closures', function (Blueprint $table): void {
            $table->id();
            // NULL = tutte le sedi
            $table->foreignId('location_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('description', 100);
            $table->timestamps();
            $table->index(['starts_on', 'ends_on']);
        });

        $now = now();
        $primaryId = DB::table('locations')->insertGetId([
            'name' => 'Sede principale',
            'city' => null,
            'country' => 'IT',
            'timezone' => 'Europe/Rome',
            'primary_marker' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('work_schedules')->insert([
            'location_id' => $primaryId,
            'user_id' => null,
            // "Oggi" nel fuso della sede
            'valid_from' => $now->copy()->setTimezone('Europe/Rome')->toDateString(),
            'follows_location' => false,
            'monday_minutes' => 480,
            'tuesday_minutes' => 480,
            'wednesday_minutes' => 480,
            'thursday_minutes' => 480,
            'friday_minutes' => 480,
            'saturday_minutes' => 0,
            'sunday_minutes' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('location_id')->nullable()->after('role')->constrained()->restrictOnDelete();
        });

        DB::table('users')->update(['location_id' => $primaryId]);

        // Le sedi non si cancellano, si archiviano: la colonna diventa obbligatoria
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('location_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('location_id');
        });

        Schema::dropIfExists('closures');
        Schema::dropIfExists('work_schedules');
        Schema::dropIfExists('locations');
    }
};
