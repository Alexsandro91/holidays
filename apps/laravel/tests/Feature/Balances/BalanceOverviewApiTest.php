<?php

namespace Tests\Feature\Balances;

use App\Enums\BalanceType;
use App\Models\BalanceAlignment;
use App\Models\BalanceMovement;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Pagina Saldi: elenco delle persone con saldi e valori annui (spec §6.2, §7.2). Oggi è il 20 ottobre 2026.
 */
class BalanceOverviewApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00', 'Europe/Rome'));
    }

    public function test_manager_sees_active_people_of_his_location(): void
    {
        $manager = User::factory()->manager()->create(['last_name' => 'Resp']);
        $employee = User::factory()->create(['last_name' => 'Dip']);
        $former = User::factory()->contractor()->create(['last_name' => 'Ex']);
        BalanceMovement::factory()->for($former)->create();
        // Fuori dall'elenco
        $other = Location::factory()->create();
        User::factory()->at($other)->create();
        User::factory()->invited()->create();
        User::factory()->disabled()->create();
        User::factory()->contractor()->create();
        User::factory()->admin()->create();

        $response = $this->actingAs($manager)->getJson('/api/balances')->assertOk();

        $users = array_column(array_column($response->json('data'), 'user'), 'id');
        sort($users);
        $expected = [$manager->id, $employee->id, $former->id];
        sort($expected);
        $this->assertSame($expected, $users);
    }

    public function test_row_shape(): void
    {
        $manager = User::factory()->manager()->create(['first_name' => 'Anna', 'last_name' => 'Resp']);
        $partTime = User::factory()->create(['first_name' => 'Pia', 'last_name' => 'Part']);
        WorkSchedule::factory()->forUser($partTime)->validFrom('2026-01-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        BalanceMovement::factory()->for($partTime)->accrual('2026-10', 400)->create();
        BalanceMovement::factory()->for($partTime)->accrual('2026-11', 999)->create(['effective_on' => '2026-11-01']);
        (new BalanceAlignment)->forceFill(['user_id' => $partTime->id, 'balance' => BalanceType::Vacation, 'aligned_on' => '2026-09-30'])->save();
        $location = $partTime->location;

        $response = $this->actingAs($manager)->getJson('/api/balances?filter[search]=Pia')->assertOk();

        $response->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0', [
                'user' => [
                    'id' => $partTime->id,
                    'name' => $partTime->name,
                    'role' => 'employee',
                    'role_label' => __('enums.role.employee', [], 'it'),
                    'location' => ['id' => $location->id, 'name' => $location->name],
                ],
                'weekly_minutes' => 1200,
                'location_weekly_minutes' => 2400,
                'average_day_minutes' => 240,
                'balances' => [
                    'vacation' => ['current_minutes' => 400, 'annual_minutes' => 4800],
                    'rol' => ['current_minutes' => 0, 'annual_minutes' => 0],
                    'ex_holidays' => ['current_minutes' => 0, 'annual_minutes' => 0],
                ],
                'last_aligned_on' => '2026-09-30',
                'can' => ['adjust' => true],
            ]);

        $own = $this->actingAs($manager)->getJson('/api/balances?filter[search]=Resp')->assertOk();
        $own->assertJsonPath('data.0.can.adjust', false)
            ->assertJsonPath('data.0.last_aligned_on', null)
            ->assertJsonPath('data.0.balances.vacation.annual_minutes', 9600);
    }

    public function test_filters(): void
    {
        $admin = User::factory()->admin()->create(['last_name' => 'Zeta']);
        $anna = User::factory()->create(['first_name' => 'Anna', 'last_name' => 'Bianchi', 'email' => 'anna@example.test']);
        $mario = User::factory()->create(['first_name' => 'Mario', 'last_name' => 'Rossi', 'email' => 'mr@example.test']);
        $other = Location::factory()->create();
        $remote = User::factory()->at($other)->create(['last_name' => 'Remoto']);
        BalanceMovement::factory()->for($mario)->create(['minutes' => -60, 'effective_on' => '2026-10-01']);
        BalanceMovement::factory()->for($anna)->create(['minutes' => 500, 'effective_on' => '2026-10-01']);
        // Negativo solo da domani: oggi non conta
        BalanceMovement::factory()->for($anna)->create(['balance' => BalanceType::Rol, 'minutes' => -60, 'effective_on' => '2026-10-21']);

        $names = fn (string $query): array => array_column(array_column($this->actingAs($admin)->getJson("/api/balances{$query}")->assertOk()->json('data'), 'user'), 'name');

        $this->assertSame([$mario->name], $names('?filter[search]=rossi'));
        $this->assertSame([$anna->name], $names('?filter[search]=anna@example'));
        $this->assertSame([$mario->name], $names('?filter[negative]=1'));
        $this->assertSame([$remote->name], $names("?filter[location]={$other->id}"));
        $this->assertSame([$anna->name, $remote->name, $mario->name, $admin->name], $names('?sort=name'));
        $this->assertSame([$admin->name, $mario->name, $remote->name, $anna->name], $names('?sort=-name'));

        $manager = User::factory()->manager()->create();
        $this->actingAs($manager)->getJson("/api/balances?filter[location]={$other->id}")
            ->assertUnprocessable()->assertJsonValidationErrors('filter.location');
        $this->actingAs($admin)->getJson('/api/balances?sort=bogus')->assertUnprocessable()->assertJsonValidationErrors('sort');
    }

    public function test_pagination_25(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(29)->create();

        $first = $this->actingAs($admin)->getJson('/api/balances')->assertOk();
        $first->assertJsonCount(25, 'data')->assertJsonPath('meta.per_page', 25)->assertJsonPath('meta.total', 30);
        $this->actingAs($admin)->getJson('/api/balances?page=2')->assertOk()->assertJsonCount(5, 'data');
    }

    public function test_constant_queries(): void
    {
        $admin = User::factory()->admin()->create();
        $count = function (int $people) use ($admin): int {
            User::query()->where('id', '!=', $admin->id)->delete();
            $users = User::factory()->count($people)->create();
            $users->each(function (User $user): void {
                BalanceMovement::factory()->for($user)->create();
                WorkSchedule::factory()->forUser($user)->validFrom('2026-01-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
            });
            $queries = 0;
            DB::listen(function () use (&$queries): void {
                $queries++;
            });
            $this->actingAs($admin)->getJson('/api/balances')->assertOk()->assertJsonCount($people + 1, 'data');

            return $queries;
        };

        $this->assertSame($count(5), $count(24));
    }

    public function test_employee_gets_403_guest_401(): void
    {
        $this->getJson('/api/balances')->assertUnauthorized();
        $this->actingAs(User::factory()->create())->getJson('/api/balances')->assertForbidden();
    }
}
