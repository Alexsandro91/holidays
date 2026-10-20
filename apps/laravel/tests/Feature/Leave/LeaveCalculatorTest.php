<?php

namespace Tests\Feature\Leave;

use App\Enums\DayHalf;
use App\Enums\LeaveUnit;
use App\Models\AbsenceType;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\LeaveCalculator;
use App\Support\LeaveComputation;
use App\Support\LeaveDraft;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class LeaveCalculatorTest extends TestCase
{
    use RefreshDatabase;

    private LeaveCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();
        app()->setLocale('it');
        $this->calculator = app(LeaveCalculator::class);
    }

    public function test_days_sum_working_days_only(): void
    {
        $user = $this->employee();

        // Da lunedì 26 ottobre a domenica 1 novembre 2026 (Ognissanti cade di domenica)
        $result = $this->compute($user, LeaveUnit::Days, '2026-10-26', '2026-11-01');

        $this->assertSame([480, 480, 480, 480, 480, 0, 0], array_column($result->days, 'minutes'));
        $this->assertSame('2026-10-26', $result->days[0]['date']);
        $this->assertSame('2026-11-01', $result->days[6]['date']);
        $this->assertSame(2400, $result->minutes);
        $this->assertEqualsWithDelta(5.0, $result->workingDays, 0.001);
    }

    public function test_holiday_inside_range_is_zero(): void
    {
        $user = $this->employee();

        // Lunedì 7, martedì 8 (Immacolata), mercoledì 9 dicembre 2026
        $result = $this->compute($user, LeaveUnit::Days, '2026-12-07', '2026-12-09');

        $this->assertSame([
            ['date' => '2026-12-07', 'minutes' => 480],
            ['date' => '2026-12-08', 'minutes' => 0],
            ['date' => '2026-12-09', 'minutes' => 480],
        ], $result->days);
        $this->assertSame(960, $result->minutes);
        $this->assertEqualsWithDelta(2.0, $result->workingDays, 0.001);
    }

    public function test_part_time_day_minutes(): void
    {
        $user = $this->employee();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-01-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $day = $this->compute($user, LeaveUnit::Days, '2026-10-26', '2026-10-26');
        $half = $this->compute($user, LeaveUnit::HalfDay, '2026-10-26', '2026-10-26', DayHalf::Afternoon);

        $this->assertSame(240, $day->minutes);
        $this->assertEqualsWithDelta(1.0, $day->workingDays, 0.001);
        $this->assertSame(120, $half->minutes);
        $this->assertSame([['date' => '2026-10-26', 'minutes' => 120]], $half->days);
    }

    public function test_half_day_rounds_odd_minutes_half_up(): void
    {
        $user = $this->employee();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-01-01')->minutes([455, 455, 455, 455, 455, 0, 0])->create();

        $this->assertSame(228, $this->compute($user, LeaveUnit::HalfDay, '2026-10-26', '2026-10-26', DayHalf::Morning)->minutes);
    }

    public function test_half_day(): void
    {
        $user = $this->employee();

        $result = $this->compute($user, LeaveUnit::HalfDay, '2026-10-26', '2026-10-26', DayHalf::Morning);

        $this->assertSame(240, $result->minutes);
        $this->assertEqualsWithDelta(0.5, $result->workingDays, 0.001);
        $this->assertSame([['date' => '2026-10-26', 'minutes' => 240]], $result->days);

        $this->assertRejected($this->draft($user, LeaveUnit::HalfDay, '2026-10-26', '2026-10-27', DayHalf::Morning), 'starts_on', 'leave.single_day');
        // Sabato 24 ottobre
        $this->assertRejected($this->draft($user, LeaveUnit::HalfDay, '2026-10-24', '2026-10-24', DayHalf::Morning), 'starts_on', 'leave.not_working_day');
    }

    public function test_hours(): void
    {
        $user = $this->employee();

        $result = $this->compute($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '09:00', '11:30');

        $this->assertSame(150, $result->minutes);
        $this->assertSame([['date' => '2026-10-22', 'minutes' => 150]], $result->days);
        $this->assertEqualsWithDelta(0.31, $result->workingDays, 0.001);

        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '09:15', '11:30'), 'starts_at', 'leave.hours_step');
        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '09:00', '11:45'), 'ends_at', 'leave.hours_step');
        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '08:00', '17:30'), 'ends_at', 'leave.hours_too_long');
        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '09:00', '09:00'), 'ends_at', 'leave.hours_order');
        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '11:00', '09:00'), 'ends_at', 'leave.hours_order');
        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-23', null, '09:00', '11:00'), 'starts_on', 'leave.single_day');
        // Domenica 25 ottobre
        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-25', '2026-10-25', null, '09:00', '11:00'), 'starts_on', 'leave.not_working_day');
    }

    public function test_today_follows_location_timezone(): void
    {
        // A Roma è già giovedì 22 ottobre, all'01:30
        $this->travelTo(CarbonImmutable::parse('2026-10-21 23:30', 'UTC'));
        $user = User::factory()->at(Location::factory()->create())->create();

        $this->assertRejected($this->draft($user, LeaveUnit::Days, '2026-10-21', '2026-10-21'), 'starts_on', 'leave.past');
        $this->assertRejected($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '01:00', '03:00'), 'starts_at', 'leave.hours_past');

        $result = $this->calculator->compute($this->draft($user, LeaveUnit::Hours, '2026-10-22', '2026-10-22', null, '09:00', '10:00'));

        $this->assertSame(60, $result->minutes);
    }

    public function test_starts_today_with_days_is_allowed(): void
    {
        $user = $this->employee();

        $this->assertSame(480, $this->compute($user, LeaveUnit::Days, '2026-10-21', '2026-10-21')->minutes);
    }

    public function test_no_working_days(): void
    {
        $user = $this->employee();

        // Sabato 24 e domenica 25 ottobre
        $this->assertRejected($this->draft($user, LeaveUnit::Days, '2026-10-24', '2026-10-25'), 'starts_on', 'leave.no_working_days');
        // Solo l'Immacolata
        $this->assertRejected($this->draft($user, LeaveUnit::Days, '2026-12-08', '2026-12-08'), 'starts_on', 'leave.no_working_days');
    }

    public function test_calendar_day_count_type(): void
    {
        $user = $this->employee();
        $type = AbsenceType::query()->where('code', 'marriage_leave')->firstOrFail();

        // Da lunedì 26 ottobre a domenica 8 novembre 2026: 14 giorni di calendario, 10 lavorativi
        $result = $this->calculator->compute(new LeaveDraft(
            $user, $type, LeaveUnit::Days, CarbonImmutable::parse('2026-10-26'), CarbonImmutable::parse('2026-11-08'), null, null, null,
        ));

        $this->assertCount(14, $result->days);
        $this->assertEqualsWithDelta(14.0, $result->workingDays, 0.001);
        $this->assertSame(10 * 480, $result->minutes);
    }

    public function test_calendar_day_count_type_accepts_only_rest_days(): void
    {
        $user = $this->employee();
        $type = AbsenceType::query()->where('code', 'marriage_leave')->firstOrFail();

        $result = $this->calculator->compute(new LeaveDraft(
            $user, $type, LeaveUnit::Days, CarbonImmutable::parse('2026-10-24'), CarbonImmutable::parse('2026-10-25'), null, null, null,
        ));

        $this->assertSame(0, $result->minutes);
        $this->assertEqualsWithDelta(2.0, $result->workingDays, 0.001);
    }

    public function test_range_limit(): void
    {
        $user = $this->employee();

        // 367 giorni: dal 26/10/2026 al 27/10/2027 compreso
        $this->assertRejected($this->draft($user, LeaveUnit::Days, '2026-10-26', '2027-10-27'), 'ends_on', 'leave.range_too_long', ['max' => 366]);

        // 366 giorni passano
        $this->assertCount(366, $this->compute($user, LeaveUnit::Days, '2026-10-26', '2027-10-26')->days);
    }

    public function test_minutes_by_month(): void
    {
        $user = $this->employee();

        // Da lunedì 28 dicembre 2026 a martedì 5 gennaio 2027: 1/1 festivo, 2 e 3 weekend, 6/1 fuori intervallo
        $result = $this->compute($user, LeaveUnit::Days, '2026-12-28', '2027-01-05');

        $this->assertSame([
            '2026-12' => ['first_day' => '2026-12-28', 'minutes' => 4 * 480],
            '2027-01' => ['first_day' => '2027-01-04', 'minutes' => 2 * 480],
        ], $result->minutesByMonth());
        $this->assertSame(6 * 480, $result->minutes);
    }

    public function test_minutes_by_month_skips_months_without_minutes(): void
    {
        $computation = new LeaveComputation([
            ['date' => '2026-10-31', 'minutes' => 0],
            ['date' => '2026-11-01', 'minutes' => 0],
            ['date' => '2026-11-02', 'minutes' => 480],
        ], 480, 1.0);

        $this->assertSame(['2026-11' => ['first_day' => '2026-11-02', 'minutes' => 480]], $computation->minutesByMonth());
    }

    /**
     * Persona a tempo pieno (sede lun-ven 480) con "oggi" mercoledì 21 ottobre 2026, 09:00 a Roma.
     */
    private function employee(): User
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));

        return User::factory()->at(Location::factory()->create())->create();
    }

    private function compute(User $user, LeaveUnit $unit, string $from, string $to, ?DayHalf $half = null, ?string $startsAt = null, ?string $endsAt = null): LeaveComputation
    {
        return $this->calculator->compute($this->draft($user, $unit, $from, $to, $half, $startsAt, $endsAt));
    }

    private function draft(User $user, LeaveUnit $unit, string $from, string $to, ?DayHalf $half = null, ?string $startsAt = null, ?string $endsAt = null): LeaveDraft
    {
        $type = AbsenceType::factory()->create(['allows_half_days' => true, 'allows_hours' => true]);

        return new LeaveDraft($user, $type, $unit, CarbonImmutable::parse($from), CarbonImmutable::parse($to), $half, $startsAt, $endsAt);
    }

    /**
     * @param  array<string, string|int>  $replace
     */
    private function assertRejected(LeaveDraft $draft, string $field, string $key, array $replace = []): void
    {
        try {
            $this->calculator->compute($draft);
            $this->fail("Atteso un errore su {$field}: {$key}");
        } catch (ValidationException $exception) {
            $this->assertSame([$field => [Translate::text($key, $replace)]], $exception->errors());
        }
    }
}
