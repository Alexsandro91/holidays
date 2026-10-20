<?php

namespace Tests\Feature\Leave;

use App\Enums\AbsenceLimitPeriod;
use App\Enums\AbsenceLimitUnit;
use App\Enums\LeaveSource;
use App\Models\AbsenceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Da approvare e contatore (spec §6, §7.2). Oggi è mercoledì 21 ottobre 2026, ore 9 a Roma.
 */
class ApprovalsTest extends TestCase
{
    use RefreshDatabase;

    private Location $location;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        app()->setLocale('it');
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        $this->location = Location::factory()->create();
        $this->manager = User::factory()->manager()->at($this->location)->create();
    }

    public function test_manager_sees_his_location_pending_and_cancellations(): void
    {
        $employee = User::factory()->at($this->location)->create();
        $otherManager = User::factory()->manager()->at($this->location)->create();
        $admin = User::factory()->admin()->at($this->location)->create();
        $elsewhere = User::factory()->at(Location::factory()->create())->create();

        $mine = LeaveRequest::factory()->for($this->manager)->create(['created_at' => '2026-10-10 10:00:00']);
        $theirs = LeaveRequest::factory()->for($employee)->cancellationRequested()->create(['created_at' => '2026-10-05 10:00:00']);
        $colleague = LeaveRequest::factory()->for($otherManager)->create(['created_at' => '2026-10-15 10:00:00']);
        LeaveRequest::factory()->for($admin)->create();
        LeaveRequest::factory()->for($elsewhere)->create();
        LeaveRequest::factory()->for($employee)->approved()->create();
        LeaveRequest::factory()->for($employee)->rejected()->create();
        LeaveRequest::factory()->for($employee)->create(['source' => LeaveSource::Closure]);

        $this->actingAs($this->manager)
            ->getJson('/api/approvals')
            ->assertOk()
            ->assertJsonPath('meta.count', 3)
            // Dalla più vecchia
            ->assertJsonPath('data.*.id', [$theirs->id, $mine->id, $colleague->id])
            ->assertJsonPath('data.0.status', 'cancellation_requested')
            ->assertJsonPath('data.0.can.approve_cancellation', true)
            ->assertJsonPath('data.1.can.approve', true)
            ->assertJsonMissingPath('data.0.days');
    }

    public function test_admin_sees_all_with_location_filter(): void
    {
        $admin = User::factory()->admin()->at($this->location)->create();
        $other = Location::factory()->create();
        $here = LeaveRequest::factory()->for(User::factory()->at($this->location)->create())->create();
        $there = LeaveRequest::factory()->for(User::factory()->at($other)->create())->create();
        $own = LeaveRequest::factory()->for($admin)->create();

        $this->actingAs($admin)->getJson('/api/approvals')
            ->assertOk()
            ->assertJsonPath('meta.count', 3)
            ->assertJsonCount(3, 'data');

        $this->actingAs($admin)->getJson("/api/approvals?filter[location]={$other->id}")
            ->assertOk()
            ->assertJsonPath('data.*.id', [$there->id])
            ->assertJsonPath('meta.count', 1);

        $this->assertNotSame($here->id, $own->id);

        $this->actingAs($this->manager)->getJson("/api/approvals?filter[location]={$other->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('filter.location');
    }

    public function test_employee_gets_403(): void
    {
        $this->actingAs(User::factory()->at($this->location)->create())
            ->getJson('/api/approvals')
            ->assertForbidden();
    }

    public function test_rows_include_fresh_warnings(): void
    {
        $employee = User::factory()->at($this->location)->create();
        BalanceMovement::factory()->for($employee)->accrual('2026-10', 480)->create();
        $limited = AbsenceType::factory()->create([
            'limit_amount' => 1,
            'limit_unit' => AbsenceLimitUnit::Days,
            'limit_period' => AbsenceLimitPeriod::Month,
            'day_count' => 'working',
        ]);

        // Due giorni di ferie su 1 di saldo; il tipo con limite supera 1 giorno al mese con due richieste
        $vacation = LeaveRequest::factory()->for($employee)->between('2026-11-02', '2026-11-03')->create();
        $first = LeaveRequest::factory()->for($employee)->ofType($limited)->between('2026-11-04', '2026-11-04')->create();
        $second = LeaveRequest::factory()->for($employee)->ofType($limited)->between('2026-11-05', '2026-11-05')->create();
        $cancelling = LeaveRequest::factory()->for($employee)->cancellationRequested()->create();

        $rows = collect($this->actingAs($this->manager)->getJson('/api/approvals')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame(
            [['code' => 'balance_insufficient', 'params' => ['after_minutes' => -480]]],
            $rows[$vacation->id]['warnings'],
        );
        $this->assertSame('limit_exceeded', $rows[$first->id]['warnings'][0]['code']);
        $this->assertEquals(2, $rows[$second->id]['warnings'][0]['params']['total']);
        // Un annullamento non consuma nulla: nessun avviso
        $this->assertSame([], $rows[$cancelling->id]['warnings']);

        // Con il saldo che basta l'avviso sparisce: è calcolato a ogni lettura, non salvato
        BalanceMovement::factory()->for($employee)->accrual('2026-09', 960)->create();
        $this->actingAs($this->manager)->getJson('/api/approvals')
            ->assertJsonPath('data.0.warnings', fn (array $warnings): bool => array_column($warnings, 'code') !== ['balance_insufficient']);
    }

    public function test_query_count_constant(): void
    {
        $limited = AbsenceType::factory()->create([
            'limit_amount' => 2,
            'limit_unit' => AbsenceLimitUnit::Days,
            'limit_period' => AbsenceLimitPeriod::Month,
            'day_count' => 'working',
        ]);

        $count = function (int $requests) use ($limited): int {
            LeaveRequest::query()->delete();

            for ($i = 0; $i < $requests; $i++) {
                $user = User::factory()->at($this->location)->create();
                BalanceMovement::factory()->for($user)->accrual('2026-10', 480)->create();
                LeaveRequest::factory()->for($user)->create();
                LeaveRequest::factory()->for($user)->ofType($limited)->create();
            }

            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($this->manager)->getJson('/api/approvals')->assertOk()->assertJsonCount($requests * 2, 'data');
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $small = $count(5);
        $this->assertSame($small, $count(30));
    }

    public function test_pending_approvals_meta(): void
    {
        $employee = User::factory()->at($this->location)->create();
        LeaveRequest::factory()->for($employee)->count(2)->create();
        LeaveRequest::factory()->for($employee)->cancellationRequested()->create();
        LeaveRequest::factory()->for($employee)->approved()->create();
        LeaveRequest::factory()->for(User::factory()->at(Location::factory()->create())->create())->create();

        $this->actingAs($this->manager)->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('meta.pending_approvals', 3);

        $this->actingAs(User::factory()->admin()->at($this->location)->create())->getJson('/api/auth/user')
            ->assertJsonPath('meta.pending_approvals', 4);

        $this->actingAs($employee)->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('meta.pending_approvals', null);

        // Una query in più al massimo rispetto a chi non è approvatore
        $queries = function (User $user): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($user)->getJson('/api/auth/user')->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $this->assertLessThanOrEqual($queries($employee) + 1, $queries($this->manager));
    }
}
