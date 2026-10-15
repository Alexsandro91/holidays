<?php

namespace Tests\Feature\Locations;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Orario standard della sede e calendario dell'anno (spec §2.3, §3.2, §4.2).
 */
class LocationScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    private const WEEK = [480, 480, 480, 480, 240, 0, 0];

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        // Lunedì 3 giugno 2030, mattina a Roma
        $this->travelTo(CarbonImmutable::parse('2030-06-03 10:00:00', 'Europe/Rome'));
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);
    }

    public function test_lists_the_versions_newest_first(): void
    {
        WorkSchedule::factory()->forLocation($this->milano)->validFrom('2030-09-01')->create();

        $this->actingAs($this->admin)->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.0.valid_from', '2030-09-01')
            ->assertJsonPath('data.0.is_started', false)
            ->assertJsonPath('data.1.valid_from', '2000-01-01')
            ->assertJsonPath('data.1.is_started', true)
            ->assertJsonPath('data.1.minutes', [480, 480, 480, 480, 480, 0, 0])
            ->assertJsonPath('data.1.follows_location', false);
    }

    public function test_a_new_version_starts_today_or_later_never_in_the_past_nor_twice_on_a_day(): void
    {
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-02', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $response = $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::WEEK])
            ->assertCreated()
            ->assertJsonPath('data.valid_from', '2030-06-03')
            ->assertJsonPath('data.minutes', self::WEEK)
            ->assertJsonPath('data.is_started', true);
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');

        // Un solo proprietario per riga (spec §2.3): la sede, mai una persona
        $row = WorkSchedule::query()->findOrFail($response->json('data.id'));
        $this->assertSame($this->milano->id, $row->location_id);
        $this->assertNull($row->user_id);
        $this->assertSame(self::WEEK, $row->minutes());
    }

    public function test_a_second_version_on_the_same_day_explains_what_to_do(): void
    {
        // Già iniziata oggi: non si cancella, quindi si chiede una data da domani
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::WEEK])->assertCreated();
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-03', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['valid_from' => __('locations.schedule_started_today', [], 'it')]);

        // Futura: si può cancellare prima di crearne un'altra
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'minutes' => self::WEEK])->assertCreated();
        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-09-01', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['valid_from' => __('locations.schedule_exists', [], 'it')]);
    }

    public function test_today_is_the_day_in_the_location_time_zone(): void
    {
        // Le 22:30 UTC del 14 giugno sono già le 00:30 del 15 a Roma
        $this->travelTo(CarbonImmutable::parse('2030-06-14 22:30:00', 'UTC'));

        $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-14', 'minutes' => self::WEEK])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('valid_from');
        $id = $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-06-15', 'minutes' => self::WEEK])
            ->assertCreated()
            ->assertJsonPath('data.is_started', true)
            ->json('data.id');

        // A Roma è già in vigore: non si cancella più, anche se in UTC è ancora il 14
        $this->actingAs($this->admin)->deleteJson($this->url($id))->assertConflict();
        $this->assertModelExists(WorkSchedule::query()->findOrFail($id));
    }

    public function test_minutes_are_seven_quarter_hours_up_to_twelve_hours_with_at_least_one_working_day(): void
    {
        $invalid = [
            [480, 480, 480, 480, 480, 0],
            [721, 0, 0, 0, 0, 0, 0],
            [470, 480, 480, 480, 480, 0, 0],
            [-15, 480, 480, 480, 480, 0, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ];

        foreach ($invalid as $minutes) {
            $this->actingAs($this->admin)->postJson($this->url(), ['valid_from' => '2030-07-01', 'minutes' => $minutes])->assertUnprocessable();
        }

        $this->assertSame(1, $this->milano->schedules()->count());
    }

    public function test_only_future_versions_of_this_location_can_be_deleted(): void
    {
        $future = WorkSchedule::factory()->forLocation($this->milano)->validFrom('2030-09-01')->create();
        $started = $this->milano->schedules()->where('valid_from', '2000-01-01')->sole();
        $elsewhere = WorkSchedule::factory()->forLocation(Location::factory()->create())->validFrom('2030-09-01')->create();

        $this->actingAs($this->admin)->deleteJson($this->url($started->id))
            ->assertConflict()
            ->assertJsonPath('message', __('locations.schedule_started', [], 'it'));
        $this->actingAs($this->admin)->deleteJson($this->url($elsewhere->id))->assertNotFound();
        $this->actingAs($this->admin)->deleteJson($this->url($future->id))->assertNoContent();

        $this->assertModelMissing($future);
        $this->assertModelExists($started);
        $this->assertModelExists($elsewhere);
    }

    public function test_the_calendar_lists_the_non_working_days_of_the_year_with_their_labels(): void
    {
        $response = $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar?year=2026")
            ->assertOk()
            ->assertJsonPath('data.year', 2026)
            ->assertJsonCount(1, 'data.schedules')
            ->assertJsonPath('data.schedules.0.valid_from', '2000-01-01');

        $days = collect($response->json('data.days'))->keyBy('date');
        // 13 festivi nazionali nel 2026 più il patrono
        $this->assertCount(14, $days);
        $this->assertSame([['type' => 'national_holiday', 'label' => 'Lunedì dell’Angelo']], $days['2026-04-06']['reasons']);
        $this->assertSame([['type' => 'patron', 'label' => 'Patrono (Milano)']], $days['2026-12-07']['reasons']);
        // Pasqua è di domenica: c'è, con il riposo e il festivo; le domeniche normali no
        $this->assertSame(['weekly_rest', 'national_holiday'], array_column($days['2026-04-05']['reasons'], 'type'));
        $this->assertArrayNotHasKey('2026-10-18', $days->all());

        $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar?year=1999")->assertUnprocessable();
        $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar")->assertUnprocessable();
    }

    public function test_the_calendar_lists_the_versions_in_force_during_the_year(): void
    {
        WorkSchedule::factory()->forLocation($this->milano)->validFrom('2030-09-01')->create();
        WorkSchedule::factory()->forLocation($this->milano)->validFrom('2031-03-01')->create();

        $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar?year=2030")
            ->assertOk()
            ->assertJsonCount(2, 'data.schedules')
            ->assertJsonPath('data.schedules.0.valid_from', '2000-01-01')
            ->assertJsonPath('data.schedules.1.valid_from', '2030-09-01');
        $this->actingAs($this->admin)->getJson("/api/locations/{$this->milano->id}/calendar?year=2032")
            ->assertOk()
            ->assertJsonCount(1, 'data.schedules')
            ->assertJsonPath('data.schedules.0.valid_from', '2031-03-01');
    }

    private function url(?int $scheduleId = null): string
    {
        return "/api/locations/{$this->milano->id}/schedules".($scheduleId === null ? '' : "/{$scheduleId}");
    }
}
