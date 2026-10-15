<?php

namespace Tests\Feature\Users;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Orario personale (spec §2.3, §4.4): solo admin.
 */
class UserScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    private const PART_TIME = [240, 240, 240, 0, 0, 0, 0];

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        // Lunedì 3 giugno 2030, mattina a Roma
        $this->travelTo(CarbonImmutable::parse('2030-06-03 10:00:00', 'Europe/Rome'));
        $this->admin = User::factory()->admin()->create();
        $this->employee = User::factory()->create();
    }

    public function test_the_admin_sees_personal_versions_and_the_location_schedule_in_force(): void
    {
        WorkSchedule::factory()->forUser($this->employee)->validFrom('2030-01-01')->minutes(self::PART_TIME)->create();

        $this->actingAs($this->admin)->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.schedules.0.minutes', self::PART_TIME)
            ->assertJsonPath('data.schedules.0.is_started', true)
            ->assertJsonPath('data.location_schedule.minutes', [480, 480, 480, 480, 480, 0, 0]);
    }

    public function test_a_part_time_schedule_and_then_back_to_the_location_schedule(): void
    {
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::PART_TIME])
            ->assertCreated()
            ->assertJsonPath('data.follows_location', false)
            ->assertJsonPath('data.minutes', self::PART_TIME);
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'follows_location' => true])
            ->assertCreated()
            ->assertJsonPath('data.follows_location', true)
            ->assertJsonPath('data.minutes', [0, 0, 0, 0, 0, 0, 0]);

        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'follows_location' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-02', 'minutes' => self::PART_TIME])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-10-01', 'minutes' => [0, 0, 0, 0, 0, 0, 0]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('minutes');
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-10-01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('minutes');

        $this->assertSame(2, $this->employee->schedules()->count());
        // Un solo proprietario: la persona, mai la sede (spec §2.3)
        $this->assertSame(0, WorkSchedule::query()->where('user_id', $this->employee->id)->whereNotNull('location_id')->count());
        $this->assertSame(2, WorkSchedule::query()->where('user_id', $this->employee->id)->whereNull('location_id')->count());
    }

    public function test_a_second_version_on_the_same_day_explains_what_to_do(): void
    {
        // Già iniziata oggi: non si cancella, quindi si chiede una data da domani
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::PART_TIME])->assertCreated();
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'follows_location' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['valid_from' => __('locations.schedule_started_today', [], 'it')]);

        // Futura: si può cancellare prima di crearne un'altra
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'follows_location' => true])->assertCreated();
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'minutes' => self::PART_TIME])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['valid_from' => __('locations.schedule_exists', [], 'it')]);
    }

    public function test_only_admins_manage_personal_schedules(): void
    {
        $manager = User::factory()->manager()->create();
        $stranger = User::factory()->at(Location::factory()->create())->create();

        $this->actingAs($manager)->getJson($this->url())->assertForbidden();
        $this->actingAs($manager)->postJson($this->url(), ['valid_from' => '2030-07-01', 'minutes' => self::PART_TIME])->assertForbidden();
        $this->actingAs(User::factory()->create())->getJson($this->url())->assertForbidden();
        // Una persona di un'altra sede per il responsabile non esiste
        $this->actingAs($manager)->getJson("/api/users/{$stranger->id}/schedules")->assertNotFound();
        $this->assertSame(0, $this->employee->schedules()->count());
    }

    public function test_the_access_matrix_covers_every_schedule_route(): void
    {
        $schedule = WorkSchedule::factory()->forUser($this->employee)->validFrom('2030-09-01')->create();
        $routes = [
            ['GET', $this->url()],
            ['POST', $this->url()],
            ['DELETE', $this->url($schedule->id)],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $user) {
            foreach ($routes as [$method, $uri]) {
                $this->actingAs($user)->json($method, $uri)->assertForbidden();
            }
        }

        $this->actingAs($this->admin)->getJson('/api/users/999999/schedules')->assertNotFound();
        $this->actingAs($this->admin)->postJson('/api/users/999999/schedules', [])->assertNotFound();
        $this->actingAs($this->admin)->deleteJson($this->url(999999))->assertNotFound();
        $this->assertModelExists($schedule);
    }

    public function test_the_start_date_is_today_in_the_location_timezone_not_in_utc(): void
    {
        // Mezzanotte passata a Tokyo (UTC+9) ma ancora il giorno prima in UTC
        $tokyo = Location::factory()->create(['timezone' => 'Asia/Tokyo']);
        $person = User::factory()->at($tokyo)->create();
        $this->travelTo(CarbonImmutable::parse('2030-06-04 00:30:00', 'Asia/Tokyo'));

        $this->actingAs($this->admin)->postJson("/api/users/{$person->id}/schedules", ['valid_from' => '2030-06-04', 'minutes' => self::PART_TIME])->assertCreated();
        $this->actingAs($this->admin)->postJson("/api/users/{$person->id}/schedules", ['valid_from' => '2030-06-03', 'minutes' => self::PART_TIME])
            ->assertUnprocessable()->assertJsonValidationErrors('valid_from');
    }

    public function test_only_future_versions_of_this_person_can_be_deleted(): void
    {
        $started = WorkSchedule::factory()->forUser($this->employee)->validFrom('2030-01-01')->create();
        $future = WorkSchedule::factory()->forUser($this->employee)->validFrom('2030-09-01')->create();
        $someoneElse = WorkSchedule::factory()->forUser(User::factory()->create())->validFrom('2030-09-01')->create();

        $this->actingAs($this->admin)->deleteJson($this->url($started->id))->assertConflict();
        $this->actingAs($this->admin)->deleteJson($this->url($someoneElse->id))->assertNotFound();
        $this->actingAs($this->admin)->deleteJson($this->url($future->id))->assertNoContent();

        $this->assertModelMissing($future);
        $this->assertModelExists($started);
    }

    private function url(?int $scheduleId = null): string
    {
        return "/api/users/{$this->employee->id}/schedules".($scheduleId === null ? '' : "/{$scheduleId}");
    }
}
