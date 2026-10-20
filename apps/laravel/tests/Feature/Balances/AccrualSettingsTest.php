<?php

namespace Tests\Feature\Balances;

use App\Enums\BalanceType;
use App\Models\AccrualSetting;
use App\Models\Location;
use App\Models\User;
use App\Services\AccrualSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Valori annui di maturazione (spec §4.1, §6.2): azienda, sede, persona.
 */
class AccrualSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->admin()->create();
    }

    public function test_effective_values_inherit_user_location_company(): void
    {
        $milano = Location::factory()->create(['name' => 'Milano']);
        AccrualSetting::query()->newModelInstance()->forceFill(['location_id' => $milano->id, 'rol_minutes' => 4320])->save();
        $person = User::factory()->at($milano)->create();
        AccrualSetting::query()->newModelInstance()->forceFill(['user_id' => $person->id, 'vacation_minutes' => 12000])->save();

        $effective = app(AccrualSettingsService::class)->forUser($person);

        $this->assertSame(12000, $effective->minutes(BalanceType::Vacation));
        $this->assertSame('user', $effective->source(BalanceType::Vacation));
        $this->assertSame(4320, $effective->minutes(BalanceType::Rol));
        $this->assertSame('location', $effective->source(BalanceType::Rol));
        $this->assertSame(0, $effective->minutes(BalanceType::ExHolidays));
        $this->assertSame('company', $effective->source(BalanceType::ExHolidays));

        $this->actingAs($this->admin)->getJson("/api/users/{$person->id}/accrual")->assertOk()
            ->assertExactJson(['data' => [
                'values' => ['vacation_minutes' => 12000, 'rol_minutes' => null, 'ex_holidays_minutes' => null],
                'effective' => [
                    'vacation' => ['minutes' => 12000, 'source' => 'user'],
                    'rol' => ['minutes' => 4320, 'source' => 'location'],
                    'ex_holidays' => ['minutes' => 0, 'source' => 'company'],
                ],
            ]]);
    }

    public function test_null_restores_inheritance(): void
    {
        $person = User::factory()->create();
        $payload = ['vacation_minutes' => 12000, 'rol_minutes' => 600, 'ex_holidays_minutes' => null];

        $this->actingAs($this->admin)->putJson("/api/users/{$person->id}/accrual", $payload)->assertOk()
            ->assertJsonPath('data.effective.vacation.source', 'user');

        $this->putJson("/api/users/{$person->id}/accrual", [...$payload, 'vacation_minutes' => null])->assertOk()
            ->assertJsonPath('data.values.vacation_minutes', null)
            ->assertJsonPath('data.effective.vacation', ['minutes' => 9600, 'source' => 'company'])
            ->assertJsonPath('data.effective.rol', ['minutes' => 600, 'source' => 'user']);

        $this->assertSame(1, AccrualSetting::query()->where('user_id', $person->id)->count());

        $this->putJson("/api/users/{$person->id}/accrual", ['vacation_minutes' => null, 'rol_minutes' => null, 'ex_holidays_minutes' => null])
            ->assertOk()->assertJsonPath('data.effective.rol.source', 'company');

        $this->assertSame(0, AccrualSetting::query()->where('user_id', $person->id)->count());
    }

    public function test_location_row_is_created_on_first_put_and_removed_when_all_null(): void
    {
        $milano = Location::factory()->create();

        $this->actingAs($this->admin)->getJson("/api/locations/{$milano->id}/accrual")->assertOk()
            ->assertJsonPath('data.values.vacation_minutes', null)
            ->assertJsonPath('data.effective.vacation.source', 'company');

        $this->putJson("/api/locations/{$milano->id}/accrual", ['vacation_minutes' => 10000, 'rol_minutes' => null, 'ex_holidays_minutes' => 0])
            ->assertOk()
            ->assertJsonPath('data.effective.vacation', ['minutes' => 10000, 'source' => 'location'])
            ->assertJsonPath('data.effective.ex_holidays', ['minutes' => 0, 'source' => 'location']);

        $this->putJson("/api/locations/{$milano->id}/accrual", ['vacation_minutes' => null, 'rol_minutes' => null, 'ex_holidays_minutes' => null])->assertOk();

        $this->assertSame(0, AccrualSetting::query()->where('location_id', $milano->id)->count());
    }

    public function test_company_values_are_required(): void
    {
        $valid = ['vacation_minutes' => 9600, 'rol_minutes' => 0, 'ex_holidays_minutes' => 0];

        foreach ([null, 60001, -1] as $bad) {
            $this->actingAs($this->admin)->patchJson('/api/settings/accrual', [...$valid, 'vacation_minutes' => $bad])
                ->assertUnprocessable()->assertJsonValidationErrors('vacation_minutes');
        }

        $this->patchJson('/api/settings/accrual', ['vacation_minutes' => 9600])
            ->assertUnprocessable()->assertJsonValidationErrors(['rol_minutes', 'ex_holidays_minutes']);

        $this->patchJson('/api/settings/accrual', ['vacation_minutes' => 12000, 'rol_minutes' => 60000, 'ex_holidays_minutes' => 0])
            ->assertOk()->assertJsonPath('data.values.vacation_minutes', 12000)
            ->assertJsonPath('data.effective.rol', ['minutes' => 60000, 'source' => 'company']);

        $this->assertSame(1, AccrualSetting::query()->whereNull('location_id')->whereNull('user_id')->count());
        $this->assertSame(12000, AccrualSetting::company()->vacation_minutes);
    }

    public function test_override_payload_requires_all_three_keys_present(): void
    {
        $person = User::factory()->create();
        $milano = Location::factory()->create();

        foreach (["/api/users/{$person->id}/accrual", "/api/locations/{$milano->id}/accrual"] as $uri) {
            $this->actingAs($this->admin)->putJson($uri, ['vacation_minutes' => 1000, 'rol_minutes' => null])
                ->assertUnprocessable()->assertJsonValidationErrors('ex_holidays_minutes');
            $this->putJson($uri, ['vacation_minutes' => 60001, 'rol_minutes' => -1, 'ex_holidays_minutes' => 'abc'])
                ->assertUnprocessable()->assertJsonValidationErrors(['vacation_minutes', 'rol_minutes', 'ex_holidays_minutes']);
        }

        $this->assertSame(0, AccrualSetting::query()->whereNotNull('user_id')->orWhereNotNull('location_id')->count());
    }

    public function test_for_users_uses_constant_queries(): void
    {
        $service = app(AccrualSettingsService::class);
        $queries = function (int $count) use ($service): int {
            $users = new Collection;

            for ($i = 0; $i < $count; $i++) {
                $location = Location::factory()->create();
                AccrualSetting::query()->newModelInstance()->forceFill(['location_id' => $location->id, 'rol_minutes' => 100 + $i])->save();
                $user = User::factory()->at($location)->create();
                AccrualSetting::query()->newModelInstance()->forceFill(['user_id' => $user->id, 'vacation_minutes' => 200 + $i])->save();
                $users->push($user);
            }

            DB::enableQueryLog();
            $result = $service->forUsers($users);
            $count = count(DB::getQueryLog());
            DB::disableQueryLog();
            DB::flushQueryLog();

            $this->assertCount($users->count(), $result);
            $this->assertSame('user', $result[$users->last()->id]->source(BalanceType::Vacation));
            $this->assertSame('location', $result[$users->last()->id]->source(BalanceType::Rol));

            return $count;
        };

        $this->assertSame($queries(3), $queries(30));
    }

    public function test_route_matrix(): void
    {
        $milano = Location::factory()->create();
        $person = User::factory()->at($milano)->create();
        $manager = User::factory()->manager()->at($milano)->create();
        $routes = [
            ['GET', '/api/settings/accrual', null],
            ['PATCH', '/api/settings/accrual', ['vacation_minutes' => 1, 'rol_minutes' => 1, 'ex_holidays_minutes' => 1]],
            ['GET', "/api/locations/{$milano->id}/accrual", null],
            ['PUT', "/api/locations/{$milano->id}/accrual", ['vacation_minutes' => 1, 'rol_minutes' => 1, 'ex_holidays_minutes' => 1]],
            ['GET', "/api/users/{$person->id}/accrual", null],
            ['PUT', "/api/users/{$person->id}/accrual", ['vacation_minutes' => 1, 'rol_minutes' => 1, 'ex_holidays_minutes' => 1]],
        ];

        foreach ($routes as [$method, $uri, $body]) {
            $this->json($method, $uri, $body ?? [])->assertUnauthorized();
        }

        foreach ([$manager, $person] as $actor) {
            foreach ($routes as [$method, $uri, $body]) {
                $this->actingAs($actor)->json($method, $uri, $body ?? [])->assertForbidden();
            }
        }

        // Il responsabile non vede nemmeno chi sta in un'altra sede
        $other = User::factory()->create();
        $this->actingAs($manager)->getJson("/api/users/{$other->id}/accrual")->assertNotFound();
        $this->putJson("/api/users/{$other->id}/accrual", ['vacation_minutes' => 1, 'rol_minutes' => 1, 'ex_holidays_minutes' => 1])->assertNotFound();

        foreach ($routes as [$method, $uri, $body]) {
            $this->actingAs($this->admin)->json($method, $uri, $body ?? [])->assertOk();
        }

        $this->actingAs($this->admin)->getJson('/api/locations/999999/accrual')->assertNotFound();
        $this->getJson('/api/users/999999/accrual')->assertNotFound();
        $this->assertSame(0, AccrualSetting::query()->where('user_id', $other->id)->count());
    }

    public function test_changes_are_logged(): void
    {
        Log::spy();
        $person = User::factory()->create();
        $milano = Location::factory()->create();

        $this->actingAs($this->admin)->patchJson('/api/settings/accrual', ['vacation_minutes' => 12000, 'rol_minutes' => 0, 'ex_holidays_minutes' => 0])->assertOk();
        $this->putJson("/api/users/{$person->id}/accrual", ['vacation_minutes' => 13000, 'rol_minutes' => null, 'ex_holidays_minutes' => null])->assertOk();
        $this->putJson("/api/users/{$person->id}/accrual", ['vacation_minutes' => null, 'rol_minutes' => null, 'ex_holidays_minutes' => null])->assertOk();
        $this->putJson("/api/locations/{$milano->id}/accrual", ['vacation_minutes' => null, 'rol_minutes' => 300, 'ex_holidays_minutes' => null])->assertOk();

        Log::shouldHaveReceived('info')->with('Accrual settings updated', [
            'level' => 'company', 'location_id' => null, 'user_id' => null,
            'before' => ['vacation_minutes' => 9600, 'rol_minutes' => 0, 'ex_holidays_minutes' => 0],
            'after' => ['vacation_minutes' => 12000, 'rol_minutes' => 0, 'ex_holidays_minutes' => 0],
            'actor_id' => $this->admin->id,
        ])->once();
        Log::shouldHaveReceived('info')->with('Accrual settings updated', [
            'level' => 'user', 'location_id' => null, 'user_id' => $person->id,
            'before' => ['vacation_minutes' => null, 'rol_minutes' => null, 'ex_holidays_minutes' => null],
            'after' => ['vacation_minutes' => 13000, 'rol_minutes' => null, 'ex_holidays_minutes' => null],
            'actor_id' => $this->admin->id,
        ])->once();
        Log::shouldHaveReceived('info')->with('Accrual settings updated', [
            'level' => 'user', 'location_id' => null, 'user_id' => $person->id,
            'before' => ['vacation_minutes' => 13000, 'rol_minutes' => null, 'ex_holidays_minutes' => null],
            'after' => ['vacation_minutes' => null, 'rol_minutes' => null, 'ex_holidays_minutes' => null],
            'actor_id' => $this->admin->id,
        ])->once();
        Log::shouldHaveReceived('info')->with('Accrual settings updated', [
            'level' => 'location', 'location_id' => $milano->id, 'user_id' => null,
            'before' => ['vacation_minutes' => null, 'rol_minutes' => null, 'ex_holidays_minutes' => null],
            'after' => ['vacation_minutes' => null, 'rol_minutes' => 300, 'ex_holidays_minutes' => null],
            'actor_id' => $this->admin->id,
        ])->once();
    }
}
