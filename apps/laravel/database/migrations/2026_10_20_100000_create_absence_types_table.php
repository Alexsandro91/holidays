<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tipi di assenza e abilitazioni (sotto-progetto 2, fase 2, spec §3). Inserisce i 16 tipi di partenza della tabella
 * §3.2: valori letterali, niente Enum né servizi.
 */
return new class extends Migration
{
    private const ALL = ['employee', 'contractor', 'intern'];

    private const EMPLOYEES = ['employee'];

    public function up(): void
    {
        Schema::create('absence_types', function (Blueprint $table): void {
            $table->id();
            // NULL per i tipi creati dall'admin; non modificabile
            $table->string('code', 40)->nullable()->unique();
            // Collation case-insensitive (utf8mb4_unicode_ci); NULL nei tipi di partenza = nome tradotto
            $table->string('name', 100)->nullable()->unique();
            $table->boolean('allows_days')->default(false);
            $table->boolean('allows_half_days')->default(false);
            $table->boolean('allows_hours')->default(false);
            $table->string('balance', 20)->nullable();
            $table->boolean('requires_approval')->default(true);
            $table->json('employment_types');
            $table->boolean('requires_enablement')->default(false);
            $table->string('day_count', 20)->default('working');
            $table->boolean('requires_certificate')->default(false);
            $table->unsignedSmallInteger('limit_amount')->nullable();
            $table->string('limit_unit', 20)->nullable();
            $table->string('limit_period', 20)->nullable();
            $table->unsignedSmallInteger('position');
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });

        Schema::create('absence_type_user', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('absence_type_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->unique(['absence_type_id', 'user_id']);
        });

        $now = now();
        $position = 0;

        foreach ($this->defaultTypes() as $type) {
            DB::table('absence_types')->insert([
                'code' => $type['code'],
                'name' => null,
                'allows_days' => $type['days'],
                'allows_half_days' => $type['half'],
                'allows_hours' => $type['hours'],
                'balance' => $type['balance'] ?? null,
                'requires_approval' => $type['approval'] ?? true,
                'employment_types' => json_encode($type['for'] ?? self::ALL),
                'requires_enablement' => $type['enablement'] ?? false,
                'day_count' => $type['day_count'] ?? 'working',
                'requires_certificate' => $type['certificate'] ?? false,
                'limit_amount' => $type['limit'][0] ?? null,
                'limit_unit' => $type['limit'][1] ?? null,
                'limit_period' => $type['limit'][2] ?? null,
                'position' => ++$position,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('absence_type_user');
        Schema::dropIfExists('absence_types');
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function defaultTypes(): array
    {
        return [
            ['code' => 'vacation', 'days' => true, 'half' => true, 'hours' => false, 'balance' => 'vacation', 'for' => self::EMPLOYEES],
            ['code' => 'rol', 'days' => false, 'half' => false, 'hours' => true, 'balance' => 'rol', 'for' => self::EMPLOYEES],
            ['code' => 'ex_holidays', 'days' => false, 'half' => false, 'hours' => true, 'balance' => 'ex_holidays', 'for' => self::EMPLOYEES],
            ['code' => 'sickness', 'days' => true, 'half' => false, 'hours' => false, 'approval' => false, 'day_count' => 'calendar', 'certificate' => true],
            ['code' => 'injury', 'days' => true, 'half' => false, 'hours' => false, 'approval' => false, 'day_count' => 'calendar', 'certificate' => true],
            ['code' => 'medical_visit', 'days' => false, 'half' => false, 'hours' => true],
            ['code' => 'law_104', 'days' => true, 'half' => false, 'hours' => true, 'enablement' => true, 'limit' => [3, 'days', 'month']],
            ['code' => 'bereavement', 'days' => true, 'half' => false, 'hours' => false, 'limit' => [3, 'days', 'year']],
            ['code' => 'marriage_leave', 'days' => true, 'half' => false, 'hours' => false, 'for' => self::EMPLOYEES, 'day_count' => 'calendar', 'limit' => [15, 'days', 'request']],
            ['code' => 'blood_donation', 'days' => true, 'half' => false, 'hours' => false],
            ['code' => 'maternity_leave', 'days' => true, 'half' => false, 'hours' => false, 'day_count' => 'calendar'],
            ['code' => 'paternity_leave', 'days' => true, 'half' => false, 'hours' => false],
            ['code' => 'parental_leave', 'days' => true, 'half' => true, 'hours' => true],
            ['code' => 'election_leave', 'days' => true, 'half' => false, 'hours' => false],
            ['code' => 'study_leave', 'days' => false, 'half' => false, 'hours' => true, 'for' => self::EMPLOYEES],
            ['code' => 'unpaid_leave', 'days' => true, 'half' => false, 'hours' => true],
        ];
    }
};
