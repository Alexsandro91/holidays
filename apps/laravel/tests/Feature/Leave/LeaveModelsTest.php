<?php

namespace Tests\Feature\Leave;

use App\Enums\LeaveRequestStatus;
use App\Models\BalanceMovement;
use App\Models\Closure;
use App\Models\LeaveRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeaveModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_status_helpers(): void
    {
        $active = [LeaveRequestStatus::Pending, LeaveRequestStatus::Approved, LeaveRequestStatus::CancellationRequested];
        $charging = [LeaveRequestStatus::Approved, LeaveRequestStatus::CancellationRequested];

        foreach (LeaveRequestStatus::cases() as $status) {
            $this->assertSame(in_array($status, $active, true), $status->isActive(), $status->value);
            $this->assertSame(in_array($status, $charging, true), $status->chargesBalance(), $status->value);
        }
    }

    public function test_factory_builds_days_matching_minutes(): void
    {
        $request = LeaveRequest::factory()->between('2026-11-02', '2026-11-08')->create();

        $this->assertSame(7, $request->days()->count());
        $this->assertSame((int) $request->days()->sum('minutes'), $request->minutes);
        $this->assertSame(5 * 480, $request->minutes);
        $this->assertSame(LeaveRequestStatus::Pending, $request->status);
    }

    public function test_active_scope_excludes_closed_states(): void
    {
        LeaveRequest::factory()->create();
        LeaveRequest::factory()->approved()->create();
        LeaveRequest::factory()->cancellationRequested()->create();
        LeaveRequest::factory()->rejected()->create();
        LeaveRequest::factory()->withdrawn()->create();
        LeaveRequest::factory()->cancelled()->create();

        $this->assertSame(3, LeaveRequest::query()->active()->count());
    }

    public function test_days_cascade_with_request(): void
    {
        $request = LeaveRequest::factory()->between('2026-11-02', '2026-11-04')->create();
        $this->assertSame(3, $request->days()->count());

        $request->delete();

        $this->assertDatabaseCount('leave_request_days', 0);
    }

    public function test_closure_delete_keeps_request(): void
    {
        $closure = Closure::factory()->create();
        $request = LeaveRequest::factory()->create();
        $request->forceFill(['closure_id' => $closure->id])->save();

        $closure->delete();

        $this->assertNull($request->fresh()?->closure_id);
        $this->assertDatabaseHas('leave_requests', ['id' => $request->id]);
    }

    public function test_movement_links_request(): void
    {
        $request = LeaveRequest::factory()->approved()->create();
        $movement = BalanceMovement::factory()->for($request->user)->usage('2026-11-03', -480, $request)->create();

        $this->assertTrue($movement->leaveRequest?->is($request));
        $this->assertSame(1, $request->movements()->count());

        $request->delete();

        $this->assertNull($movement->fresh()?->leave_request_id);
    }
}
