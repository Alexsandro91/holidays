<?php

namespace Tests\Feature\Leave;

use App\Enums\LeaveRequestStatus;
use App\Mail\LeaveRequestDecidedMail;
use App\Mail\LeaveRequestSubmittedMail;
use App\Models\AbsenceType;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Email delle richieste (spec §7.4): destinatari, eventi, coda dopo il commit e lingua. Oggi è mercoledì 21 ottobre 2026.
 */
class LeaveMailTest extends TestCase
{
    use RefreshDatabase;

    private Location $location;

    private User $person;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        Mail::fake();
        $this->location = Location::factory()->create();
        $this->person = User::factory()->at($this->location)->create();
    }

    public function test_new_request_goes_to_location_managers(): void
    {
        $first = User::factory()->manager()->at($this->location)->create();
        $second = User::factory()->manager()->at($this->location)->create();
        $disabled = User::factory()->manager()->disabled()->at($this->location)->create();
        $elsewhere = User::factory()->manager()->at(Location::factory()->create())->create();
        $admin = User::factory()->admin()->create();

        $this->store($this->person)->assertCreated();

        $this->assertSubmittedTo([$first, $second], 'submitted');
        foreach ([$this->person, $disabled, $elsewhere, $admin] as $other) {
            Mail::assertNotQueued(LeaveRequestSubmittedMail::class, fn (LeaveRequestSubmittedMail $mail): bool => $mail->hasTo($other->email));
        }
    }

    public function test_invited_manager_is_not_a_recipient(): void
    {
        User::factory()->manager()->invited()->at($this->location)->create();
        $admin = User::factory()->admin()->create();

        $this->store($this->person)->assertCreated();

        $this->assertSubmittedTo([$admin], 'submitted');
    }

    public function test_location_without_managers_goes_to_admins(): void
    {
        $adminA = User::factory()->admin()->create();
        $adminB = User::factory()->admin()->create();
        User::factory()->admin()->disabled()->create();

        $this->store($this->person)->assertCreated();

        $this->assertSubmittedTo([$adminA, $adminB], 'submitted');
    }

    public function test_manager_request_goes_to_other_managers_not_self(): void
    {
        $manager = User::factory()->manager()->at($this->location)->create();
        $other = User::factory()->manager()->at($this->location)->create();
        $admin = User::factory()->admin()->create();

        $this->store($manager)->assertCreated();

        $this->assertSubmittedTo([$other], 'submitted');
        Mail::assertNotQueued(LeaveRequestSubmittedMail::class, fn (LeaveRequestSubmittedMail $mail): bool => $mail->hasTo($manager->email) || $mail->hasTo($admin->email));
    }

    public function test_manager_request_without_other_managers_goes_to_admins(): void
    {
        $manager = User::factory()->manager()->at($this->location)->create();
        $admin = User::factory()->admin()->create();

        $this->store($manager)->assertCreated();

        $this->assertSubmittedTo([$admin], 'submitted');
        Mail::assertNotQueued(LeaveRequestSubmittedMail::class, fn (LeaveRequestSubmittedMail $mail): bool => $mail->hasTo($manager->email));
    }

    public function test_admin_request_goes_to_other_admins(): void
    {
        $self = User::factory()->admin()->at($this->location)->create();
        $other = User::factory()->admin()->create();
        User::factory()->manager()->at($this->location)->create();

        $this->store($self)->assertCreated();

        $this->assertSubmittedTo([$other], 'submitted');
    }

    public function test_auto_approved_type_sends_notice(): void
    {
        $manager = User::factory()->manager()->at($this->location)->create();
        $free = AbsenceType::factory()->create(['requires_approval' => false]);

        $this->store($this->person, ['absence_type_id' => $free->id])->assertCreated()->assertJsonPath('data.status', 'approved');

        $this->assertSubmittedTo([$manager], 'auto_approved');
        Mail::assertNotQueued(LeaveRequestDecidedMail::class);
    }

    public function test_cancellation_requested_goes_to_approvers(): void
    {
        $manager = User::factory()->manager()->at($this->location)->create();
        $request = LeaveRequest::factory()->for($this->person)->approved()->create();

        $this->actingAs($this->person)->postJson("/api/leave-requests/{$request->id}/cancellation")->assertOk();

        $this->assertSubmittedTo([$manager], 'cancellation_requested');
    }

    /**
     * Azione => [rotta, stato di partenza, evento atteso].
     *
     * @return iterable<string, array{string, LeaveRequestStatus, string}>
     */
    public static function decisions(): iterable
    {
        yield 'approve' => ['approve', LeaveRequestStatus::Pending, 'approved'];
        yield 'reject' => ['reject', LeaveRequestStatus::Pending, 'rejected'];
        yield 'approve cancellation' => ['cancellation/approve', LeaveRequestStatus::CancellationRequested, 'cancellation_approved'];
        yield 'reject cancellation' => ['cancellation/reject', LeaveRequestStatus::CancellationRequested, 'cancellation_rejected'];
        yield 'cancel' => ['cancel', LeaveRequestStatus::Approved, 'cancelled'];
    }

    #[DataProvider('decisions')]
    public function test_decisions_go_to_requester(string $path, LeaveRequestStatus $from, string $event): void
    {
        $manager = User::factory()->manager()->at($this->location)->create(['first_name' => 'Marta', 'last_name' => 'Rossi']);
        $request = $this->requestIn($from);
        $body = $path === 'reject' ? ['decision_note' => 'Periodo di chiusura progetto'] : [];

        $this->actingAs($manager)->postJson("/api/leave-requests/{$request->id}/{$path}", $body)->assertOk();

        Mail::assertQueued(LeaveRequestDecidedMail::class, 1);
        Mail::assertQueued(LeaveRequestDecidedMail::class, function (LeaveRequestDecidedMail $mail) use ($event, $manager): bool {
            $html = $mail->render();

            return $mail->hasTo($this->person->email)
                && $mail->event === $event
                && str_contains($html, $manager->name);
        });
        Mail::assertNotQueued(LeaveRequestSubmittedMail::class);
    }

    public function test_rejection_mail_contains_the_reason(): void
    {
        $manager = User::factory()->manager()->at($this->location)->create();
        $request = $this->requestIn(LeaveRequestStatus::Pending);

        $this->actingAs($manager)->postJson("/api/leave-requests/{$request->id}/reject", ['decision_note' => 'Periodo di chiusura progetto'])->assertOk();

        Mail::assertQueued(LeaveRequestDecidedMail::class, fn (LeaveRequestDecidedMail $mail): bool => str_contains($mail->render(), 'Periodo di chiusura progetto'));
    }

    public function test_mails_link_back_to_the_app(): void
    {
        config(['app.frontend_url' => 'http://localhost:5174/']);
        $request = LeaveRequest::factory()->for($this->person)->create();

        // Chi deve decidere arriva su Da approvare, chi ha chiesto sulle sue richieste
        foreach (['submitted', 'cancellation_requested'] as $event) {
            $this->assertStringContainsString('href="http://localhost:5174/leave?tab=approvals"', (new LeaveRequestSubmittedMail($request, $event))->render());
        }
        $this->assertStringNotContainsString('tab=approvals', (new LeaveRequestSubmittedMail($request, 'auto_approved'))->render());
        $this->assertStringContainsString('href="http://localhost:5174/leave"', (new LeaveRequestDecidedMail($request, 'approved', 'Marco Bianchi'))->render());
    }

    public function test_requester_deciding_alone_gets_no_outcome_mail(): void
    {
        $manager = User::factory()->manager()->at($this->location)->create();
        $other = User::factory()->manager()->at($this->location)->create();
        $request = LeaveRequest::factory()->for($manager)->create();

        $this->actingAs($manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();

        Mail::assertNotQueued(LeaveRequestDecidedMail::class);
        // Chi ha deciso da sola non riceve l'esito, gli altri responsabili non sono coinvolti
        Mail::assertNotQueued(LeaveRequestDecidedMail::class, fn (LeaveRequestDecidedMail $mail): bool => $mail->hasTo($other->email));
        $this->assertSame(LeaveRequestStatus::Approved, $request->fresh()?->status);
    }

    public function test_withdraw_sends_nothing(): void
    {
        User::factory()->manager()->at($this->location)->create();
        $request = $this->requestIn(LeaveRequestStatus::Pending);

        $this->actingAs($this->person)->postJson("/api/leave-requests/{$request->id}/withdraw")->assertOk();

        Mail::assertNothingOutgoing();
    }

    public function test_mail_is_queued_after_commit_and_localized(): void
    {
        $manager = User::factory()->manager()->at($this->location)->create(['locale' => 'en']);

        $this->assertInstanceOf(ShouldQueue::class, new LeaveRequestSubmittedMail(LeaveRequest::factory()->for($this->person)->create(), 'submitted'));
        $this->store($this->person)->assertCreated();

        Mail::assertQueued(LeaveRequestSubmittedMail::class, function (LeaveRequestSubmittedMail $mail) use ($manager): bool {
            $subject = trans('leave.mail.submitted.subject.submitted', [], (string) $mail->locale);

            return $mail->hasTo($manager->email) && $mail->locale === 'en' && $subject === 'Holidays: new leave request';
        });
    }

    public function test_failed_transaction_sends_nothing(): void
    {
        User::factory()->manager()->at($this->location)->create();

        try {
            DB::transaction(function (): void {
                $this->store($this->person)->assertCreated();

                throw new \RuntimeException('rollback');
            });
        } catch (\RuntimeException) {
        }

        Mail::assertNothingOutgoing();
        $this->assertSame(0, LeaveRequest::query()->count());
    }

    /**
     * @param  list<User>  $recipients
     */
    private function assertSubmittedTo(array $recipients, string $event): void
    {
        Mail::assertQueued(LeaveRequestSubmittedMail::class, count($recipients));

        foreach ($recipients as $recipient) {
            Mail::assertQueued(LeaveRequestSubmittedMail::class, fn (LeaveRequestSubmittedMail $mail): bool => $mail->hasTo($recipient->email) && $mail->event === $event);
        }
    }

    private function requestIn(LeaveRequestStatus $status): LeaveRequest
    {
        $factory = LeaveRequest::factory()->for($this->person);

        return match ($status) {
            LeaveRequestStatus::Approved => $factory->approved()->create(),
            LeaveRequestStatus::CancellationRequested => $factory->cancellationRequested()->create(),
            default => $factory->create(),
        };
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function store(User $user, array $data = []): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/leave-requests', [
            'absence_type_id' => AbsenceType::query()->where('code', 'vacation')->value('id'),
            'unit' => 'days',
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-26',
            ...$data,
        ]);
    }
}
