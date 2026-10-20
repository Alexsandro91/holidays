<?php

namespace Tests\Feature\Leave;

use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Matrice dei permessi sulle transizioni (spec §6, §10.1): approvatori con `decide`, ritiro e annullamento solo dal
 * proprietario, fuori sede 404. Oggi è mercoledì 21 ottobre 2026.
 */
class LeavePermissionsTest extends TestCase
{
    use RefreshDatabase;

    private Location $location;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        $this->location = Location::factory()->create();
        $this->manager = User::factory()->manager()->at($this->location)->create();
    }

    public function test_employee_cannot_decide_others_or_own_requests(): void
    {
        $employee = User::factory()->at($this->location)->create();
        $colleague = User::factory()->at($this->location)->create();
        $request = $this->pendingOf($colleague);

        $this->actingAs($employee)->postJson("/api/leave-requests/{$request->id}/approve")->assertForbidden();

        $own = $this->pendingOf($employee, '2026-10-27');
        foreach (['approve', 'reject', 'cancellation/approve', 'cancellation/reject', 'cancel'] as $path) {
            $this->actingAs($employee)->postJson("/api/leave-requests/{$own->id}/{$path}")->assertForbidden();
        }
    }

    public function test_manager_decides_people_of_the_location_but_not_admins(): void
    {
        $employee = User::factory()->at($this->location)->create();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$this->pendingOf($employee)->id}/approve")->assertOk();

        // Auto-approvazione
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$this->pendingOf($this->manager)->id}/approve")->assertOk();

        $otherManager = User::factory()->manager()->at($this->location)->create();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$this->pendingOf($otherManager)->id}/approve")->assertOk();

        $admin = User::factory()->admin()->at($this->location)->create();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$this->pendingOf($admin)->id}/approve")->assertForbidden();
    }

    public function test_manager_of_another_location_gets_not_found(): void
    {
        $employee = User::factory()->at($this->location)->create();
        $stranger = User::factory()->manager()->at(Location::factory()->create())->create();

        $this->actingAs($stranger)->postJson("/api/leave-requests/{$this->pendingOf($employee)->id}/approve")->assertNotFound();
    }

    public function test_admin_decides_anyone_including_self(): void
    {
        $admin = User::factory()->admin()->at(Location::factory()->create())->create();
        $employee = User::factory()->at($this->location)->create();
        $otherAdmin = User::factory()->admin()->at($this->location)->create();

        $this->actingAs($admin)->postJson("/api/leave-requests/{$this->pendingOf($employee)->id}/approve")->assertOk();
        $this->actingAs($admin)->postJson("/api/leave-requests/{$this->pendingOf($this->manager)->id}/approve")->assertOk();
        $this->actingAs($admin)->postJson("/api/leave-requests/{$this->pendingOf($otherAdmin)->id}/approve")->assertOk();
        $this->actingAs($admin)->postJson("/api/leave-requests/{$this->pendingOf($admin)->id}/approve")->assertOk();
    }

    public function test_guest_gets_unauthorized(): void
    {
        $request = $this->pendingOf(User::factory()->at($this->location)->create());

        foreach (['withdraw', 'cancellation', 'approve', 'reject', 'cancellation/approve', 'cancellation/reject', 'cancel'] as $path) {
            $this->postJson("/api/leave-requests/{$request->id}/{$path}")->assertUnauthorized();
        }
    }

    public function test_withdraw_and_cancellation_only_by_owner(): void
    {
        $employee = User::factory()->at($this->location)->create();
        $admin = User::factory()->admin()->create();
        $pending = $this->pendingOf($employee);
        $approved = LeaveRequest::factory()->for($employee)->approved()->between('2026-11-02', '2026-11-02')->create();

        foreach ([$this->manager, $admin] as $approver) {
            $this->actingAs($approver)->postJson("/api/leave-requests/{$pending->id}/withdraw")->assertForbidden();
            $this->actingAs($approver)->postJson("/api/leave-requests/{$approved->id}/cancellation")->assertForbidden();
        }

        $this->actingAs($employee)->postJson("/api/leave-requests/{$pending->id}/withdraw")->assertOk();
        $this->actingAs($employee)->postJson("/api/leave-requests/{$approved->id}/cancellation")->assertOk();
    }

    private function pendingOf(User $user, string $day = '2026-10-26'): LeaveRequest
    {
        return LeaveRequest::factory()->for($user)->between($day, $day)->create();
    }
}
