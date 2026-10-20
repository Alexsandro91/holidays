<?php

namespace Tests\Feature\Leave;

use App\Enums\AbsenceLimitPeriod;
use App\Enums\AbsenceLimitUnit;
use App\Enums\BalanceType;
use App\Enums\LeaveUnit;
use App\Models\AbsenceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use App\Services\LeaveAvailability;
use App\Services\LeaveCalculator;
use App\Support\LeaveDraft;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Disponibile e avvisi di una richiesta (spec §5.2). Oggi è il 21 ottobre 2026.
 */
class LeaveAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private LeaveAvailability $availability;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        app()->setLocale('it');
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        $this->availability = app(LeaveAvailability::class);
        $this->user = User::factory()->at(Location::factory()->create())->create();
    }

    public function test_available_subtracts_planned_and_pending(): void
    {
        $this->balance(4800);
        $approved = LeaveRequest::factory()->for($this->user)->approved()->between('2026-11-02', '2026-11-03')->create();
        BalanceMovement::factory()->for($this->user)->usage('2026-11-02', -960, $approved)->create();
        $pending = LeaveRequest::factory()->for($this->user)->between('2026-11-04', '2026-11-04')->create();
        $today = CarbonImmutable::parse('2026-10-21');

        $this->assertSame(960, $this->availability->planned($this->user, BalanceType::Vacation, $today));
        $this->assertSame(480, $this->availability->pending($this->user, BalanceType::Vacation));
        $this->assertSame(3360, $this->availability->available($this->user, BalanceType::Vacation, $today));
        $this->assertSame(3840, $this->availability->available($this->user, BalanceType::Vacation, $today, $pending->id));
        // L'usato passato è già nel saldo, non si sottrae due volte
        BalanceMovement::factory()->for($this->user)->usage('2026-10-01', -100)->create();
        $this->assertSame(960, $this->availability->planned($this->user, BalanceType::Vacation, $today));
        $this->assertSame(3260, $this->availability->available($this->user, BalanceType::Vacation, $today));
    }

    public function test_balance_warning(): void
    {
        $this->balance(400);
        $type = AbsenceType::query()->where('code', 'vacation')->firstOrFail();

        $warnings = $this->warnings($type, '2026-11-02', '2026-11-02');
        $this->assertSame([['code' => 'balance_insufficient', 'params' => ['after_minutes' => -80]]], $warnings);

        $this->balance(480);
        $this->assertSame([], $this->warnings($type, '2026-11-02', '2026-11-02'));
    }

    public function test_balance_warning_excludes_the_request_under_review(): void
    {
        $this->balance(600);
        $type = AbsenceType::query()->where('code', 'vacation')->firstOrFail();
        $pending = LeaveRequest::factory()->for($this->user)->between('2026-11-02', '2026-11-02')->create();

        $draft = $this->draft($type, '2026-11-02', '2026-11-02');
        $computation = app(LeaveCalculator::class)->compute($draft);

        $this->assertSame('balance_insufficient', $this->availability->warnings($draft, $computation)[0]['code']);
        $this->assertSame([], $this->availability->warnings($draft, $computation, $pending->id));
    }

    public function test_types_without_balance_have_no_balance_warning(): void
    {
        $type = AbsenceType::factory()->create();

        $this->assertSame([], $this->warnings($type, '2026-11-02', '2026-11-04'));
    }

    public function test_limit_warning_month_days(): void
    {
        $type = $this->limitedType(3, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Month);
        LeaveRequest::factory()->for($this->user)->ofType($type)->approved()->between('2026-10-22', '2026-10-23')->create();
        LeaveRequest::factory()->for($this->user)->ofType($type)->hours('2026-10-27', '09:00', '13:00')->create();

        $this->assertSame(
            [['code' => 'limit_exceeded', 'params' => ['limit' => 3, 'unit' => 'days', 'period' => 'month', 'total' => 3.5]]],
            $this->warnings($type, '2026-10-28', '2026-10-28'),
        );
        $this->assertSame([], $this->warnings($type, '2026-11-03', '2026-11-03'));
    }

    public function test_limit_ignores_withdrawn_and_other_users_requests(): void
    {
        $type = $this->limitedType(3, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Month);
        LeaveRequest::factory()->for($this->user)->ofType($type)->withdrawn()->between('2026-10-22', '2026-10-23')->create();
        LeaveRequest::factory()->ofType($type)->approved()->between('2026-10-22', '2026-10-23')->create();

        $this->assertSame([], $this->warnings($type, '2026-10-28', '2026-10-29'));
    }

    public function test_limit_counts_hours_as_fraction(): void
    {
        $type = $this->limitedType(1, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Month);
        $type->forceFill(['allows_hours' => true])->save();
        LeaveRequest::factory()->for($this->user)->ofType($type)->approved()->hours('2026-10-22', '09:00', '13:00')->create();

        $draft = $this->draft($type, '2026-10-26', '2026-10-26', LeaveUnit::Hours, '09:00', '13:00');
        $computation = app(LeaveCalculator::class)->compute($draft);
        $this->assertSame([], $this->availability->warnings($draft, $computation));

        $draft = $this->draft($type, '2026-10-26', '2026-10-26', LeaveUnit::Hours, '09:00', '14:00');
        $computation = app(LeaveCalculator::class)->compute($draft);
        $this->assertSame(1.13, $this->availability->warnings($draft, $computation)[0]['params']['total']);
    }

    public function test_limit_per_request(): void
    {
        $type = $this->limitedType(15, AbsenceLimitUnit::Days, AbsenceLimitPeriod::Request, calendar: true);
        // Un'altra richiesta dello stesso tipo non si somma
        LeaveRequest::factory()->for($this->user)->ofType($type)->approved()->between('2026-12-01', '2026-12-10')->create();

        $this->assertSame([], $this->warnings($type, '2026-11-02', '2026-11-16'));
        $warnings = $this->warnings($type, '2026-11-02', '2026-11-17');
        $this->assertSame('limit_exceeded', $warnings[0]['code']);
        $this->assertSame(['limit' => 15, 'unit' => 'days', 'period' => 'request', 'total' => 16.0], $warnings[0]['params']);
    }

    public function test_limit_in_hours(): void
    {
        $type = $this->limitedType(10, AbsenceLimitUnit::Hours, AbsenceLimitPeriod::Year);
        $type->forceFill(['allows_hours' => true])->save();
        // 9 ore già approvate in due richieste, una a fine anno scorso non conta
        LeaveRequest::factory()->for($this->user)->ofType($type)->approved()->hours('2026-11-03', '09:00', '14:00')->create();
        LeaveRequest::factory()->for($this->user)->ofType($type)->hours('2026-11-04', '09:00', '13:00')->create();

        $draft = $this->draft($type, '2026-11-05', '2026-11-05', LeaveUnit::Hours, '09:00', '09:30');
        $this->assertSame([], $this->availability->warnings($draft, app(LeaveCalculator::class)->compute($draft)));

        $draft = $this->draft($type, '2026-11-05', '2026-11-05', LeaveUnit::Hours, '09:00', '10:30');
        $warnings = $this->availability->warnings($draft, app(LeaveCalculator::class)->compute($draft));
        $this->assertSame(['limit' => 10, 'unit' => 'hours', 'period' => 'year', 'total' => 10.5], $warnings[0]['params']);
    }

    private function balance(int $minutes): void
    {
        BalanceMovement::query()->where('user_id', $this->user->id)->delete();
        BalanceMovement::factory()->for($this->user)->accrual('2026-09', $minutes)->create();
    }

    private function limitedType(int $amount, AbsenceLimitUnit $unit, AbsenceLimitPeriod $period, bool $calendar = false): AbsenceType
    {
        return AbsenceType::factory()->create([
            'limit_amount' => $amount,
            'limit_unit' => $unit,
            'limit_period' => $period,
            'day_count' => $calendar ? 'calendar' : 'working',
        ]);
    }

    private function draft(AbsenceType $type, string $from, string $to, LeaveUnit $unit = LeaveUnit::Days, ?string $startsAt = null, ?string $endsAt = null): LeaveDraft
    {
        return new LeaveDraft($this->user, $type, $unit, CarbonImmutable::parse($from), CarbonImmutable::parse($to), null, $startsAt, $endsAt);
    }

    /**
     * @return list<array{code: string, params: array<string, int|float|string>}>
     */
    private function warnings(AbsenceType $type, string $from, string $to): array
    {
        $draft = $this->draft($type, $from, $to);

        return $this->availability->warnings($draft, app(LeaveCalculator::class)->compute($draft));
    }
}
