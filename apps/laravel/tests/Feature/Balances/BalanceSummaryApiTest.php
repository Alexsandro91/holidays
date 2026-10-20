<?php

namespace Tests\Feature\Balances;

use App\Enums\BalanceType;
use App\Models\BalanceAlignment;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Saldi di una persona per lo staff e nel profilo (spec §5.3, §6.2). Oggi è il 20 ottobre 2026.
 */
class BalanceSummaryApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00', 'Europe/Rome'));
        $this->admin = User::factory()->admin()->create();
        $this->employee = User::factory()->create();
        // Residuo 2025: 2400; nel 2026 maturati gennaio-ottobre e una rettifica
        BalanceMovement::factory()->for($this->employee)->accrual('2025-12', 2400)->create();

        foreach (range(1, 10) as $month) {
            BalanceMovement::factory()->for($this->employee)->accrual(sprintf('2026-%02d', $month), 800)->create();
        }

        BalanceMovement::factory()->for($this->employee)->adjustment(-300)->create(['effective_on' => '2026-06-10', 'actor_id' => $this->admin->id]);
    }

    public function test_summary_shape(): void
    {
        $response = $this->actingAs($this->admin)->getJson("/api/users/{$this->employee->id}/balances")->assertOk();

        $response->assertJsonPath('data.applicable', true)
            ->assertJsonPath('data.year', 2026)
            ->assertJsonPath('data.weekly_minutes', 2400)
            ->assertJsonPath('data.location_weekly_minutes', 2400)
            ->assertJsonPath('data.average_day_minutes', 480)
            ->assertJsonPath('data.last_aligned_on', null)
            ->assertJsonPath('data.can', ['adjust' => true, 'manage_accrual' => true])
            ->assertJsonCount(3, 'data.balances')
            ->assertJsonPath('data.balances.0', [
                'balance' => 'vacation',
                'label' => __('enums.balance_type.vacation', [], 'it'),
                'current_minutes' => 10100,
                'summary' => ['opening' => 2400, 'accrued' => 8000, 'used' => 0, 'corrections' => -300, 'closing' => 10100],
                'annual' => ['minutes' => 9600, 'source' => 'company'],
                'monthly_quota_minutes' => 800,
                'planned_minutes' => 0,
                'pending_minutes' => 0,
                'available_minutes' => 10100,
            ])
            ->assertJsonPath('data.balances.1.balance', 'rol')
            ->assertJsonPath('data.balances.1.annual', ['minutes' => 0, 'source' => 'company'])
            ->assertJsonPath('data.balances.1.monthly_quota_minutes', 0)
            ->assertJsonPath('data.balances.2.balance', 'ex_holidays');

        $manager = User::factory()->manager()->create();
        $this->actingAs($manager)->getJson("/api/users/{$this->employee->id}/balances")
            ->assertOk()->assertJsonPath('data.can', ['adjust' => true, 'manage_accrual' => false]);
        // I propri saldi dalla scheda dello staff: si vedono, non si correggono
        $this->actingAs($manager)->getJson("/api/users/{$manager->id}/balances")
            ->assertOk()->assertJsonPath('data.can', ['adjust' => false, 'manage_accrual' => false]);
    }

    public function test_summary_includes_planned_pending_available(): void
    {
        $approved = LeaveRequest::factory()->for($this->employee)->approved()->between('2026-11-02', '2026-11-03')->create();
        BalanceMovement::factory()->for($this->employee)->usage('2026-11-02', -960, $approved)->create();
        LeaveRequest::factory()->for($this->employee)->between('2026-11-04', '2026-11-04')->create();

        $this->actingAs($this->admin)->getJson("/api/users/{$this->employee->id}/balances")->assertOk()
            ->assertJsonPath('data.balances.0.current_minutes', 10100)
            ->assertJsonPath('data.balances.0.planned_minutes', 960)
            ->assertJsonPath('data.balances.0.pending_minutes', 480)
            ->assertJsonPath('data.balances.0.available_minutes', 8660)
            ->assertJsonPath('data.balances.1.available_minutes', 0);
        $this->actingAs($this->employee)->getJson('/api/profile/balances')->assertOk()
            ->assertJsonPath('data.balances.0.available_minutes', 8660);
    }

    public function test_view_permissions(): void
    {
        $manager = User::factory()->manager()->create();
        $elsewhere = User::factory()->at(Location::factory()->create())->create();
        $admin = User::factory()->admin()->create();

        foreach (['balances', 'balances/at?date=2026-09-30', 'balance-movements'] as $path) {
            $this->actingAs($manager)->getJson("/api/users/{$elsewhere->id}/{$path}")->assertNotFound();
            $this->actingAs($manager)->getJson("/api/users/{$admin->id}/{$path}")->assertForbidden();
            $this->actingAs($this->employee)->getJson("/api/users/{$manager->id}/{$path}")->assertForbidden();
            $this->actingAs($this->admin)->getJson("/api/users/{$elsewhere->id}/{$path}")->assertOk();
        }
    }

    public function test_year_parameter(): void
    {
        $this->actingAs($this->admin)->getJson("/api/users/{$this->employee->id}/balances?year=2025")
            ->assertOk()
            ->assertJsonPath('data.year', 2025)
            ->assertJsonPath('data.balances.0.summary', ['opening' => 0, 'accrued' => 2400, 'used' => 0, 'corrections' => 0, 'closing' => 2400])
            // Il saldo attuale resta quello di oggi
            ->assertJsonPath('data.balances.0.current_minutes', 10100);

        $this->getJson("/api/users/{$this->employee->id}/balances?year=2027")->assertUnprocessable()->assertJsonValidationErrors('year');
        $this->getJson("/api/users/{$this->employee->id}/balances?year=1999")->assertUnprocessable()->assertJsonValidationErrors('year');
        $this->getJson('/api/profile/balances?year=2027')->assertUnprocessable()->assertJsonValidationErrors('year');
    }

    public function test_balances_at(): void
    {
        (new BalanceAlignment)->forceFill(['user_id' => $this->employee->id, 'balance' => BalanceType::Vacation, 'aligned_on' => '2026-09-30', 'actor_id' => $this->admin->id])->save();
        BalanceMovement::factory()->for($this->employee)->accrual('2026-09', 360)->create(['balance' => BalanceType::Rol]);

        $this->actingAs($this->admin)->getJson("/api/users/{$this->employee->id}/balances/at?date=2026-09-30")
            ->assertOk()
            ->assertExactJson(['data' => [
                'date' => '2026-09-30',
                'balances' => ['vacation' => 2400 + 9 * 800 - 300, 'rol' => 360, 'ex_holidays' => 0],
                'last_alignment' => ['vacation' => '2026-09-30', 'rol' => null, 'ex_holidays' => null],
            ]]);

        $this->getJson("/api/users/{$this->employee->id}/balances/at")->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->getJson("/api/users/{$this->employee->id}/balances/at?date=30-09-2026")->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->getJson("/api/users/{$this->employee->id}/balance-movements?balance=holidays")->assertUnprocessable()->assertJsonValidationErrors('balance');
    }

    public function test_movements_are_paginated_and_filtered(): void
    {
        $person = User::factory()->create();

        foreach (range(1, 20) as $day) {
            BalanceMovement::factory()->for($person)->adjustment($day)->create(['effective_on' => sprintf('2026-03-%02d', $day), 'actor_id' => $this->admin->id]);
        }

        $rol = BalanceMovement::factory()->for($person)->adjustment(10)->count(3)->create(['balance' => BalanceType::Rol, 'effective_on' => '2026-05-05']);
        BalanceMovement::factory()->for($person)->adjustment(5)->count(2)->create(['effective_on' => '2025-06-01']);
        $url = "/api/users/{$person->id}/balance-movements";

        $first = $this->actingAs($this->admin)->getJson($url)->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.total', 25);
        $this->assertSame($rol->pluck('id')->reverse()->values()->all(), array_slice($first->json('data.*.id'), 0, 3));
        $first->assertJsonPath('data.3.effective_on', '2026-03-20')
            ->assertJsonPath('data.3.actor_name', $this->admin->name)
            ->assertJsonPath('data.3.kind', 'adjustment')
            ->assertJsonPath('data.3.minutes', 20);
        $this->getJson("{$url}?page=2")->assertOk()->assertJsonCount(5, 'data')->assertJsonPath('data.4.effective_on', '2025-06-01');

        $this->getJson("{$url}?balance=rol&year=2026")->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('data.0.balance', 'rol');
        $this->getJson("{$url}?balance=vacation&year=2026")->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.total', 20);
        $this->getJson("{$url}?year=2025")->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_profile_hides_the_actor(): void
    {
        $this->actingAs($this->employee)->getJson('/api/profile/balance-movements?balance=vacation&year=2026')
            ->assertOk()
            ->assertJsonCount(11, 'data')
            ->assertJsonPath('data.0.actor_name', null)
            ->assertJsonPath('data.4.note', 'Rettifica')
            ->assertJsonPath('data.4.actor_name', null);

        $this->getJson('/api/profile/balances')
            ->assertOk()
            ->assertJsonPath('data.applicable', true)
            ->assertJsonPath('data.balances.0.current_minutes', 10100)
            ->assertJsonPath('data.can', ['adjust' => false, 'manage_accrual' => false]);

        // Anche l'admin, nel proprio profilo, non ha azioni
        $this->actingAs($this->admin)->getJson('/api/profile/balances')
            ->assertOk()->assertJsonPath('data.can', ['adjust' => false, 'manage_accrual' => false]);
    }

    public function test_profile_of_an_intern(): void
    {
        $intern = User::factory()->intern()->create();

        $response = $this->actingAs($intern)->getJson('/api/profile/balances')->assertOk()->assertJsonPath('data.applicable', false);

        foreach ([0, 1, 2] as $index) {
            $response->assertJsonPath("data.balances.{$index}.current_minutes", 0)
                ->assertJsonPath("data.balances.{$index}.summary", ['opening' => 0, 'accrued' => 0, 'used' => 0, 'corrections' => 0, 'closing' => 0])
                ->assertJsonPath("data.balances.{$index}.monthly_quota_minutes", 0);
        }

        $this->getJson('/api/profile/balance-movements')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_managed_user_resource_permissions(): void
    {
        $manager = User::factory()->manager()->create();

        $rows = collect($this->actingAs($manager)->getJson('/api/users')->assertOk()->json('data'))->keyBy('id');

        $this->assertTrue($rows[$this->employee->id]['can']['view_balances']);
        $this->assertTrue($rows[$this->employee->id]['can']['adjust_balances']);
        $this->assertTrue($rows[$manager->id]['can']['view_balances']);
        $this->assertFalse($rows[$manager->id]['can']['adjust_balances']);

        $adminRows = collect($this->actingAs($this->admin)->getJson('/api/users')->assertOk()->json('data'));
        $this->assertSame([true], $adminRows->pluck('can.adjust_balances')->unique()->values()->all());
    }
}
