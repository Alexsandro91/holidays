<?php

namespace Tests\Feature\Leave;

use App\Enums\LeaveRequestStatus;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Transizioni di stato delle richieste (spec §4, §6). Oggi è mercoledì 21 ottobre 2026, ore 9 a Roma.
 */
class LeaveTransitionsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Azione => [rotta relativa, stato di partenza ammesso, stato di arrivo, agisce il proprietario].
     */
    private const ACTIONS = [
        'withdraw' => ['withdraw', 'pending', 'withdrawn', true],
        'cancellation' => ['cancellation', 'approved', 'cancellation_requested', true],
        'approve' => ['approve', 'pending', 'approved', false],
        'reject' => ['reject', 'pending', 'rejected', false],
        'approve_cancellation' => ['cancellation/approve', 'cancellation_requested', 'cancelled', false],
        'reject_cancellation' => ['cancellation/reject', 'cancellation_requested', 'approved', false],
        'cancel' => ['cancel', 'approved', 'cancelled', false],
    ];

    private Location $location;

    private User $owner;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        $this->location = Location::factory()->create();
        $this->owner = User::factory()->at($this->location)->create();
        $this->manager = User::factory()->manager()->at($this->location)->create();
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function statesAndActions(): iterable
    {
        foreach (LeaveRequestStatus::cases() as $status) {
            foreach (array_keys(self::ACTIONS) as $action) {
                yield "{$status->value} × {$action}" => [$status->value, $action];
            }
        }
    }

    #[DataProvider('statesAndActions')]
    public function test_every_state_and_action(string $status, string $action): void
    {
        [$path, $from, $to, $byOwner] = self::ACTIONS[$action];
        $request = $this->requestIn(LeaveRequestStatus::from($status));
        $actor = $byOwner ? $this->owner : $this->manager;

        $response = $this->actingAs($actor)->postJson("/api/leave-requests/{$request->id}/{$path}");

        if ($status !== $from) {
            $response->assertConflict()->assertJsonPath('message', __('leave.state_changed'));
            $this->assertSame($status, $request->fresh()?->status->value);

            return;
        }

        $response->assertOk()->assertJsonPath('data.status', $to)->assertJsonPath('data.id', $request->id);
        $fresh = $request->fresh();
        $this->assertNotNull($fresh);
        $this->assertSame($to, $fresh->status->value);
        $now = CarbonImmutable::now()->toIso8601String();

        match ($action) {
            'approve', 'reject' => $this->assertSame(
                [$this->manager->id, $now, null, null],
                [$fresh->decided_by, $fresh->decided_at?->toIso8601String(), $fresh->cancelled_by, $fresh->cancelled_at],
            ),
            'withdraw' => $this->assertSame(
                [null, null, null, null],
                [$fresh->decided_by, $fresh->decided_at, $fresh->cancelled_by, $fresh->cancelled_at],
            ),
            'cancellation' => $this->assertSame(
                [$now, null, null],
                [$fresh->cancellation_requested_at?->toIso8601String(), $fresh->cancelled_by, $fresh->cancelled_at],
            ),
            'approve_cancellation', 'cancel' => $this->assertSame(
                [$this->manager->id, $now],
                [$fresh->cancelled_by, $fresh->cancelled_at?->toIso8601String()],
            ),
            'reject_cancellation' => $this->assertSame(
                [null, null, null],
                [$fresh->cancellation_requested_at, $fresh->cancelled_by, $fresh->cancelled_at],
            ),
        };

        if ($action === 'approve' || $action === 'reject') {
            $response->assertJsonPath('data.decided_by_name', $this->manager->name);
        }

        if ($action === 'approve_cancellation' || $action === 'cancel') {
            $response->assertJsonPath('data.cancelled_by_name', $this->manager->name);
        }
    }

    public function test_cancellation_only_before_start(): void
    {
        // Giornata intera che inizia oggi: già iniziata
        $today = $this->requestIn(LeaveRequestStatus::Approved, '2026-10-21');
        $this->actingAs($this->owner)->postJson("/api/leave-requests/{$today->id}/cancellation")
            ->assertConflict()->assertJsonPath('message', __('leave.already_started'));
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$today->id}/cancel")
            ->assertConflict()->assertJsonPath('message', __('leave.already_started'));
        $this->assertSame(LeaveRequestStatus::Approved, $today->fresh()?->status);

        // A ore oggi dalle 15: alle 10 non è ancora iniziata
        $hours = LeaveRequest::factory()->for($this->owner)->approved()->hours('2026-10-21', '15:00', '17:00')->create();
        $other = LeaveRequest::factory()->for($this->owner)->approved()->hours('2026-10-21', '15:00', '17:00')->create();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 10:00', 'Europe/Rome'));

        $this->actingAs($this->owner)->getJson("/api/leave-requests/{$hours->id}")->assertOk()
            ->assertJsonPath('data.can.request_cancellation', true);
        $this->actingAs($this->owner)->postJson("/api/leave-requests/{$hours->id}/cancellation")
            ->assertOk()->assertJsonPath('data.status', 'cancellation_requested');
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$other->id}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');

        // Alle 16 sì
        $late = LeaveRequest::factory()->for($this->owner)->approved()->hours('2026-10-21', '15:00', '17:00')->create();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 16:00', 'Europe/Rome'));

        $this->actingAs($this->owner)->getJson("/api/leave-requests/{$late->id}")->assertOk()
            ->assertJsonPath('data.can.request_cancellation', false);
        $this->actingAs($this->manager)->getJson("/api/leave-requests/{$late->id}")->assertOk()
            ->assertJsonPath('data.can.cancel', false);
        $this->actingAs($this->owner)->postJson("/api/leave-requests/{$late->id}/cancellation")
            ->assertConflict()->assertJsonPath('message', __('leave.already_started'));
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$late->id}/cancel")
            ->assertConflict()->assertJsonPath('message', __('leave.already_started'));
    }

    public function test_approve_after_start_is_allowed(): void
    {
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-19', '2026-10-23')->create();

        $this->actingAs($this->manager)->getJson("/api/leave-requests/{$request->id}")->assertOk()
            ->assertJsonPath('data.can.approve', true)
            ->assertJsonPath('data.can.reject', true);
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")
            ->assertOk()->assertJsonPath('data.status', 'approved');

        // Il ritiro di una richiesta in attesa è ammesso in qualunque momento
        $pending = LeaveRequest::factory()->for($this->owner)->between('2026-10-20', '2026-10-20')->create();
        $this->actingAs($this->owner)->postJson("/api/leave-requests/{$pending->id}/withdraw")
            ->assertOk()->assertJsonPath('data.status', 'withdrawn');
    }

    public function test_reject_note_optional_max_500(): void
    {
        $first = $this->requestIn(LeaveRequestStatus::Pending);
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$first->id}/reject", ['decision_note' => str_repeat('a', 501)])
            ->assertUnprocessable()->assertJsonValidationErrors('decision_note');
        $this->assertSame(LeaveRequestStatus::Pending, $first->fresh()?->status);

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$first->id}/reject", ['decision_note' => str_repeat('a', 500)])
            ->assertOk()->assertJsonPath('data.decision_note', str_repeat('a', 500));

        $second = $this->requestIn(LeaveRequestStatus::Pending, '2026-11-02');
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$second->id}/reject")
            ->assertOk()->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.decision_note', null);
    }

    public function test_can_follows_policy_state_and_start(): void
    {
        $pending = $this->requestIn(LeaveRequestStatus::Pending);
        $this->actingAs($this->owner)->getJson("/api/leave-requests/{$pending->id}")->assertOk()->assertJsonPath('data.can', [
            'withdraw' => true, 'request_cancellation' => false, 'approve' => false, 'reject' => false,
            'approve_cancellation' => false, 'reject_cancellation' => false, 'cancel' => false,
        ]);
        $this->actingAs($this->manager)->getJson("/api/leave-requests/{$pending->id}")->assertOk()->assertJsonPath('data.can', [
            'withdraw' => false, 'request_cancellation' => false, 'approve' => true, 'reject' => true,
            'approve_cancellation' => false, 'reject_cancellation' => false, 'cancel' => false,
        ]);

        $approved = $this->requestIn(LeaveRequestStatus::Approved, '2026-11-02');
        $this->actingAs($this->owner)->getJson("/api/leave-requests/{$approved->id}")->assertOk()->assertJsonPath('data.can', [
            'withdraw' => false, 'request_cancellation' => true, 'approve' => false, 'reject' => false,
            'approve_cancellation' => false, 'reject_cancellation' => false, 'cancel' => false,
        ]);
        $this->actingAs($this->manager)->getJson("/api/leave-requests/{$approved->id}")->assertOk()->assertJsonPath('data.can', [
            'withdraw' => false, 'request_cancellation' => false, 'approve' => false, 'reject' => false,
            'approve_cancellation' => false, 'reject_cancellation' => false, 'cancel' => true,
        ]);

        $requested = $this->requestIn(LeaveRequestStatus::CancellationRequested, '2026-11-03');
        $this->actingAs($this->manager)->getJson("/api/leave-requests/{$requested->id}")->assertOk()->assertJsonPath('data.can', [
            'withdraw' => false, 'request_cancellation' => false, 'approve' => false, 'reject' => false,
            'approve_cancellation' => true, 'reject_cancellation' => true, 'cancel' => false,
        ]);

        // Il responsabile che chiede per sé ha entrambe le parti
        $own = LeaveRequest::factory()->for($this->manager)->between('2026-11-04', '2026-11-04')->create();
        $this->actingAs($this->manager)->getJson("/api/leave-requests/{$own->id}")->assertOk()
            ->assertJsonPath('data.can.withdraw', true)
            ->assertJsonPath('data.can.approve', true);
    }

    public function test_each_transition_is_logged(): void
    {
        Log::spy();
        $request = $this->requestIn(LeaveRequestStatus::Pending);

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();

        Log::shouldHaveReceived('info')->withArgs(fn (string $message, array $context): bool => $message === 'Leave request transition'
            && $context['leave_request_id'] === $request->id
            && $context['action'] === 'approve'
            && $context['from'] === 'pending'
            && $context['to'] === 'approved'
            && $context['actor_id'] === $this->manager->id)->once();
    }

    /**
     * Richiesta di ferie del proprietario, un giorno nel futuro (lunedì 26 ottobre se non indicato).
     */
    private function requestIn(LeaveRequestStatus $status, string $day = '2026-10-26'): LeaveRequest
    {
        return LeaveRequest::factory()->for($this->owner)->between($day, $day)->create([
            'status' => $status,
            'decided_at' => in_array($status, [LeaveRequestStatus::Pending, LeaveRequestStatus::Withdrawn], true) ? null : now(),
            'cancellation_requested_at' => $status === LeaveRequestStatus::CancellationRequested ? now() : null,
            'cancelled_at' => $status === LeaveRequestStatus::Cancelled ? now() : null,
        ]);
    }
}
