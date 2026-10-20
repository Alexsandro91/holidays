<?php

namespace Tests\Feature\Leave;

use App\Models\Closure as CompanyClosure;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Calendario personale (spec §6): giorni con minuti e motivi, e le proprie richieste dell'intervallo.
 */
class ProfileCalendarTest extends TestCase
{
    use RefreshDatabase;

    private Location $location;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        // Milano: Sant'Ambrogio il 7 dicembre
        $this->location = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);
        $this->user = User::factory()->at($this->location)->create();
    }

    public function test_days_have_minutes_and_reasons(): void
    {
        CompanyClosure::factory()->forLocation($this->location)->between('2026-12-09', '2026-12-09')->create(['description' => 'Inventario']);

        $days = $this->actingAs($this->user)->getJson('/api/profile/calendar?from=2026-12-05&to=2026-12-10')
            ->assertOk()->json('data.days');

        $this->assertSame(
            ['2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10'],
            array_column($days, 'date'),
        );
        $this->assertSame([0, 0, 0, 0, 0, 480], array_column($days, 'minutes'));
        $this->assertSame(
            [['weekly_rest'], ['weekly_rest'], ['patron'], ['national_holiday'], ['closure'], []],
            array_map(fn (array $day): array => array_column($day['reasons'], 'type'), $days),
        );
        $this->assertSame('Inventario', $days[4]['reasons'][0]['label']);
        $this->assertIsString($days[2]['reasons'][0]['label']);
    }

    public function test_requests_in_range_without_withdrawn(): void
    {
        $pending = LeaveRequest::factory()->for($this->user)->between('2026-10-30', '2026-11-02')->create();
        $rejected = LeaveRequest::factory()->for($this->user)->rejected()->between('2026-11-05', '2026-11-05')->create();
        LeaveRequest::factory()->for($this->user)->withdrawn()->between('2026-11-03', '2026-11-03')->create();
        LeaveRequest::factory()->for($this->user)->between('2026-12-01', '2026-12-01')->create();
        LeaveRequest::factory()->between('2026-11-04', '2026-11-04')->create();

        $response = $this->actingAs($this->user)->getJson('/api/profile/calendar?from=2026-11-01&to=2026-11-30')->assertOk();

        $this->assertSame([$pending->id, $rejected->id], array_column($response->json('data.requests'), 'id'));
        $response->assertJsonPath('data.requests.0.status', 'pending')
            ->assertJsonPath('data.requests.0.can.withdraw', true)
            ->assertJsonPath('data.requests.1.can.withdraw', false)
            ->assertJsonCount(30, 'data.days');
    }

    public function test_range_is_validated(): void
    {
        $this->actingAs($this->user)->getJson('/api/profile/calendar?from=2026-01-01&to=2027-01-02')
            ->assertUnprocessable()->assertJsonValidationErrors(['to' => __('leave.range_too_long', ['max' => 366], 'it')]);
        $this->actingAs($this->user)->getJson('/api/profile/calendar?from=2026-01-01&to=2027-01-01')->assertOk();
        $this->actingAs($this->user)->getJson('/api/profile/calendar?from=2026-02-01&to=2026-01-31')
            ->assertUnprocessable()->assertJsonValidationErrors('to');
        $this->actingAs($this->user)->getJson('/api/profile/calendar')
            ->assertUnprocessable()->assertJsonValidationErrors(['from', 'to']);
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/profile/calendar?from=2026-11-01&to=2026-11-30')->assertUnauthorized();
        $this->getJson('/api/leave-requests')->assertUnauthorized();
        $this->postJson('/api/leave-requests', [])->assertUnauthorized();
        $this->postJson('/api/leave-requests/preview', [])->assertUnauthorized();
    }
}
