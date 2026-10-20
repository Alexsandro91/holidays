<?php

namespace Tests\Feature\Migrations;

use App\Enums\AbsenceDayCount;
use App\Enums\AbsenceLimitPeriod;
use App\Enums\AbsenceLimitUnit;
use App\Enums\BalanceType;
use App\Models\AbsenceType;
use App\Models\AccrualSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Dati di partenza della fase 2 (spec §3.2, §4.1): le migration girano davvero.
 */
class SubProject2Phase2MigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeds_the_sixteen_default_absence_types_in_order(): void
    {
        $codes = AbsenceType::query()->ordered()->pluck('code')->all();
        $this->assertSame(['vacation', 'rol', 'ex_holidays', 'sickness', 'injury', 'medical_visit', 'law_104', 'bereavement',
            'marriage_leave', 'blood_donation', 'maternity_leave', 'paternity_leave', 'parental_leave', 'election_leave',
            'study_leave', 'unpaid_leave'], $codes);
        $this->assertSame(range(1, 16), AbsenceType::query()->ordered()->pluck('position')->all());
    }

    public function test_default_types_follow_the_spec_table(): void
    {
        $vacation = AbsenceType::query()->where('code', 'vacation')->sole();
        $this->assertTrue($vacation->allows_days && $vacation->allows_half_days && ! $vacation->allows_hours);
        $this->assertSame(BalanceType::Vacation, $vacation->balance);
        $this->assertSame(['employee'], $vacation->employment_types);

        $sickness = AbsenceType::query()->where('code', 'sickness')->sole();
        $this->assertFalse($sickness->requires_approval);
        $this->assertTrue($sickness->requires_certificate);
        $this->assertSame(AbsenceDayCount::Calendar, $sickness->day_count);
        $this->assertSame(['employee', 'contractor', 'intern'], $sickness->employment_types);

        $this->assertTrue(AbsenceType::query()->where('code', 'blood_donation')->sole()->requires_approval);

        $law104 = AbsenceType::query()->where('code', 'law_104')->sole();
        $this->assertTrue($law104->requires_enablement);
        $this->assertSame([3, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Month], [$law104->limit_amount, $law104->limit_unit, $law104->limit_period]);

        $marriage = AbsenceType::query()->where('code', 'marriage_leave')->sole();
        $this->assertSame([15, AbsenceLimitPeriod::Request, AbsenceDayCount::Calendar], [$marriage->limit_amount, $marriage->limit_period, $marriage->day_count]);
        $bereavement = AbsenceType::query()->where('code', 'bereavement')->sole();
        $this->assertSame([3, AbsenceLimitPeriod::Year], [$bereavement->limit_amount, $bereavement->limit_period]);
    }

    /**
     * @param  list<string>  $employmentTypes
     * @param  array{0: int|null, 1: AbsenceLimitUnit|null, 2: AbsenceLimitPeriod|null}  $limit
     */
    #[DataProvider('defaultTypes')]
    public function test_each_default_type_matches_the_spec_row(
        string $code,
        bool $days,
        bool $halfDays,
        bool $hours,
        ?BalanceType $balance,
        bool $approval,
        array $employmentTypes,
        bool $enablement,
        AbsenceDayCount $dayCount,
        bool $certificate,
        array $limit,
    ): void {
        $type = AbsenceType::query()->where('code', $code)->sole();

        $this->assertSame([$days, $halfDays, $hours], [$type->allows_days, $type->allows_half_days, $type->allows_hours]);
        $this->assertSame($balance, $type->balance);
        $this->assertSame($approval, $type->requires_approval);
        $this->assertSame($employmentTypes, $type->employment_types);
        $this->assertSame($enablement, $type->requires_enablement);
        $this->assertSame($dayCount, $type->day_count);
        $this->assertSame($certificate, $type->requires_certificate);
        $this->assertSame($limit, [$type->limit_amount, $type->limit_unit, $type->limit_period]);
        $this->assertNull($type->name);
        // Malattia e infortunio li archivia la migration della fase 3 (vedi SubProject2Phase3MigrationTest)
        if (! in_array($code, ['sickness', 'injury'], true)) {
            $this->assertNull($type->archived_at);
        }
    }

    /**
     * code, giorni, mezze, ore, saldo, approvazione, vale per, abilitazione, conteggio, certificato, limite.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function defaultTypes(): array
    {
        return [
            'vacation' => ['vacation', true, true, false, BalanceType::Vacation, true, ['employee'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'rol' => ['rol', false, false, true, BalanceType::Rol, true, ['employee'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'ex_holidays' => ['ex_holidays', false, false, true, BalanceType::ExHolidays, true, ['employee'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'sickness' => ['sickness', true, false, false, null, false, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Calendar, true, [null, null, null]],
            'injury' => ['injury', true, false, false, null, false, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Calendar, true, [null, null, null]],
            'medical_visit' => ['medical_visit', false, false, true, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'law_104' => ['law_104', true, false, true, null, true, ['employee', 'contractor', 'intern'], true, AbsenceDayCount::Working, false, [3, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Month]],
            'bereavement' => ['bereavement', true, false, false, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Working, false, [3, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Year]],
            'marriage_leave' => ['marriage_leave', true, false, false, null, true, ['employee'], false, AbsenceDayCount::Calendar, false, [15, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Request]],
            'blood_donation' => ['blood_donation', true, false, false, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'maternity_leave' => ['maternity_leave', true, false, false, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Calendar, false, [null, null, null]],
            'paternity_leave' => ['paternity_leave', true, false, false, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'parental_leave' => ['parental_leave', true, true, true, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'election_leave' => ['election_leave', true, false, false, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'study_leave' => ['study_leave', false, false, true, null, true, ['employee'], false, AbsenceDayCount::Working, false, [null, null, null]],
            'unpaid_leave' => ['unpaid_leave', true, false, true, null, true, ['employee', 'contractor', 'intern'], false, AbsenceDayCount::Working, false, [null, null, null]],
        ];
    }

    public function test_creates_the_company_accrual_row(): void
    {
        $company = AccrualSetting::company();
        $this->assertSame([9600, 0, 0], [$company->vacation_minutes, $company->rol_minutes, $company->ex_holidays_minutes]);
        $this->assertSame(1, AccrualSetting::query()->whereNull('location_id')->whereNull('user_id')->count());
    }
}
