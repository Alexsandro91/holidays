<?php

namespace Tests\Feature\Users;

use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use App\Services\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\GoneHttpException;
use Tests\Fakes\FailingMailFake;
use Tests\TestCase;

/**
 * Il servizio riverifica lo stato sulle righe bloccate: le istanze lette prima possono essere vecchie.
 */
class InvitationServiceTest extends TestCase
{
    use RefreshDatabase;

    private InvitationService $service;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->service = app(InvitationService::class);
        $this->admin = User::factory()->admin()->create();
    }

    public function test_cancel_refuses_a_user_activated_after_loading(): void
    {
        $invitation = Invitation::factory()->create();
        $stale = $invitation->user()->firstOrFail();
        User::query()->whereKey($stale->id)->update(['status' => UserStatus::Active->value]);
        $invitation->forceFill(['accepted_at' => now()])->save();

        try {
            $this->service->cancel($stale, $this->admin, Request::create('/'));
            $this->fail('Annullare un invito già usato deve dare conflitto');
        } catch (ConflictHttpException) {
            $this->assertModelExists($stale);
            $this->assertModelExists($invitation);
        }
    }

    public function test_resend_refuses_an_accepted_invitation_and_leaves_it_untouched(): void
    {
        $invitation = Invitation::factory()->accepted()->create(['last_sent_at' => now()->subHour()]);
        $stale = $invitation->user()->firstOrFail();
        $acceptedAt = $invitation->accepted_at?->toDateTimeString();

        try {
            $this->service->resend($stale, $this->admin, Request::create('/'));
            $this->fail('Reinviare un invito già usato deve dare conflitto');
        } catch (ConflictHttpException) {
            $this->assertSame($acceptedAt, $invitation->fresh()?->accepted_at?->toDateTimeString());
            Mail::assertNothingQueued();
        }
    }

    public function test_accept_refuses_an_invitation_that_expired_after_loading(): void
    {
        $token = str_repeat('a', 64);
        Invitation::factory()->create(['token_hash' => InvitationService::hashToken($token)]);
        $loaded = $this->service->findByToken($token);
        $this->assertNotNull($loaded);
        Invitation::query()->whereKey($loaded->id)->update(['expires_at' => now()->subMinute()]);

        $this->expectException(GoneHttpException::class);
        $this->service->accept($loaded, 'una-frase-lunga-e-nuova', Request::create('/'));
    }

    public function test_accept_ignores_an_invitation_replaced_or_accepted_after_loading(): void
    {
        $token = str_repeat('b', 64);
        $invitation = Invitation::factory()->create(['token_hash' => InvitationService::hashToken($token)]);
        $loaded = $this->service->findByToken($token);
        $this->assertNotNull($loaded);

        // Un reinvio cambia il token: la riga bloccata per hash non è più quella letta
        $invitation->forceFill(['token_hash' => InvitationService::hashToken(str_repeat('c', 64))])->save();
        $this->assertNull($this->service->accept($loaded, 'una-frase-lunga-e-nuova', Request::create('/')));
        $this->assertSame(UserStatus::Invited, $invitation->user()->firstOrFail()->status);
    }

    public function test_a_queue_failure_does_not_undo_the_invitation(): void
    {
        Exceptions::fake();
        FailingMailFake::install(InvitationMail::class);

        $this->actingAs($this->admin)
            ->postJson('/api/users', ['name' => 'Sara Colombo', 'email' => 'sara@example.test', 'role' => 'employee'])
            ->assertCreated();

        $this->assertDatabaseHas('users', ['email' => 'sara@example.test', 'status' => UserStatus::Invited->value]);
        $this->assertDatabaseCount('invitations', 1);
        Exceptions::assertReported(RuntimeException::class);
    }
}
