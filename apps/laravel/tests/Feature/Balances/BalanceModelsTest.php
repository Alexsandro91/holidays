<?php

namespace Tests\Feature\Balances;

use App\Enums\BalanceType;
use App\Enums\EmploymentType;
use App\Models\AbsenceType;
use App\Models\AccrualSetting;
use App\Models\BalanceMovement;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BalanceModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_display_name_uses_translation_until_renamed(): void
    {
        app()->setLocale('it');
        $vacation = AbsenceType::query()->where('code', 'vacation')->sole();

        $this->assertSame('Ferie', $vacation->displayName());

        $vacation->forceFill(['name' => 'Vacanze']);
        $this->assertSame('Vacanze', $vacation->displayName());
    }

    public function test_applies_to_checks_employment_types(): void
    {
        $vacation = AbsenceType::query()->where('code', 'vacation')->sole();
        $sickness = AbsenceType::query()->where('code', 'sickness')->sole();

        $this->assertTrue($vacation->appliesTo(EmploymentType::Employee));
        $this->assertFalse($vacation->appliesTo(EmploymentType::Contractor));
        $this->assertTrue($sickness->appliesTo(EmploymentType::Intern));
    }

    public function test_unique_accrual_period_per_user_and_balance(): void
    {
        $user = User::factory()->create();
        BalanceMovement::factory()->for($user)->accrual('2026-10', 800)->create();

        BalanceMovement::factory()->for($user)->adjustment(60)->create();
        BalanceMovement::factory()->for($user)->adjustment(-30)->create();
        BalanceMovement::factory()->for($user)->accrual('2026-10', 800)->state(['balance' => BalanceType::Rol])->create();
        $this->assertSame(4, $user->balanceMovements()->count());

        $this->expectException(UniqueConstraintViolationException::class);
        BalanceMovement::factory()->for($user)->accrual('2026-10', 800)->create();
    }

    public function test_user_cascade_deletes_movements_and_settings(): void
    {
        $user = User::factory()->create();
        $type = AbsenceType::factory()->requiringEnablement()->create();
        BalanceMovement::factory()->for($user)->adjustment(60)->create();
        AccrualSetting::query()->forceCreate(['user_id' => $user->id, 'vacation_minutes' => 4800]);
        $user->enabledAbsenceTypes()->attach($type->id);

        $user->delete();

        $this->assertSame(0, BalanceMovement::query()->count());
        // Resta solo la riga azienda
        $this->assertSame(1, AccrualSetting::query()->count());
        $this->assertSame(0, $type->enabledUsers()->count());
    }

    public function test_factory_states(): void
    {
        $type = AbsenceType::factory()->system('custom_code')->withBalance(BalanceType::Rol)->archived()->create();
        $alignment = BalanceMovement::factory()->alignment('2026-09-30', -120, 4000)->create();

        $this->assertTrue($type->isSystem() && $type->isArchived());
        $this->assertSame(['employee'], $type->employment_types);
        $this->assertSame(4000, $alignment->target_minutes);
        $this->assertSame('2026-09-30', $alignment->effective_on->toDateString());
    }
}
