<?php

namespace Tests\Feature\Users;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\AdminChangeMail;
use App\Mail\InvitationMail;
use App\Models\AuthEvent;
use App\Models\Invitation;
use App\Models\User;
use App\Services\InvitationService;
use App\Services\UserManagementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

/**
 * Modifica di nome, cognome ed email (spec del 14/10, §7.3).
 */
class UpdateUserTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create(['first_name' => 'Anna', 'last_name' => 'Admin']);
    }

    /**
     * @param  array<string, string>  $overrides
     * @return array<string, string>
     */
    private function payload(array $overrides = []): array
    {
        return [...['first_name' => 'Sara', 'last_name' => 'Colombo'], ...$overrides];
    }

    private function changedFields(User $user): mixed
    {
        return AuthEvent::query()->where('user_id', $user->id)->where('event', AuthEventType::UserUpdated)->sole()->changed_fields;
    }

    public function test_an_admin_renames_a_user_and_the_event_lists_only_the_changed_fields(): void
    {
        $employee = User::factory()->create(['first_name' => 'Sara', 'last_name' => 'Rossi', 'email' => 'sara@example.test']);

        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", $this->payload(['last_name' => ' Colombo ', 'email' => 'Sara@Example.test']))
            ->assertOk()
            ->assertJsonPath('data.first_name', 'Sara')
            ->assertJsonPath('data.last_name', 'Colombo')
            ->assertJsonPath('data.name', 'Sara Colombo')
            ->assertJsonPath('data.email', 'sara@example.test')
            ->assertJsonPath('data.can.update', true);

        $this->assertSame('Colombo', $employee->fresh()?->last_name);
        $this->assertDatabaseHas('auth_events', ['user_id' => $employee->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::UserUpdated->value]);
        // Solo i nomi dei campi, mai i valori
        $this->assertSame(['last_name'], $this->changedFields($employee));
        Mail::assertNothingQueued();
    }

    public function test_nothing_changed_means_no_event(): void
    {
        $employee = User::factory()->create(['first_name' => 'Sara', 'last_name' => 'Colombo']);

        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", $this->payload())->assertOk();

        $this->assertDatabaseCount('auth_events', 0);
    }

    /**
     * @return array<string, array{string, string, int}>
     */
    public static function whoEditsWhom(): array
    {
        return [
            'admin su dipendente' => ['admin', 'employee', 200],
            'admin su responsabile' => ['admin', 'manager', 200],
            'admin su un altro admin' => ['admin', 'admin', 200],
            'admin su sé stesso' => ['admin', 'self', 200],
            'responsabile su dipendente' => ['manager', 'employee', 200],
            'responsabile su responsabile' => ['manager', 'manager', 200],
            'responsabile su sé stesso' => ['manager', 'self', 200],
            'responsabile su admin' => ['manager', 'admin', 403],
            'dipendente su dipendente' => ['employee', 'employee', 403],
            'dipendente su sé stesso' => ['employee', 'self', 403],
        ];
    }

    #[DataProvider('whoEditsWhom')]
    public function test_who_can_edit_whom(string $actorRole, string $target, int $expected): void
    {
        $actor = User::factory()->create(['role' => $actorRole]);
        $subject = $target === 'self' ? $actor : User::factory()->create(['role' => $target]);

        // La password serve solo su un altro admin: inviarla agli altri destinatari non cambia nulla
        $this->actingAs($actor)->patchJson("/api/users/{$subject->id}", $this->payload(['current_password' => 'password']))->assertStatus($expected);

        $this->assertSame($expected === 200 ? 'Colombo' : $subject->last_name, $subject->fresh()?->last_name);
    }

    public function test_the_email_of_an_invited_user_changes_with_a_new_link(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sbagliata@example.test', 'role' => 'employee'])->assertCreated();
        $invited = User::query()->where('email', 'sbagliata@example.test')->firstOrFail();
        $oldHash = Invitation::query()->sole()->token_hash;

        $this->actingAs($this->admin)->patchJson("/api/users/{$invited->id}", $this->payload(['email' => ' Sara@Example.test ']))
            ->assertOk()
            ->assertJsonPath('data.email', 'sara@example.test')
            ->assertJsonPath('data.status', 'invited');

        $invitation = Invitation::query()->sole();
        $this->assertNotSame($oldHash, $invitation->token_hash);
        $this->assertFalse($invitation->isExpired());
        $this->assertEqualsWithDelta(now()->addHours(InvitationService::TTL_HOURS)->getTimestamp(), $invitation->expires_at->getTimestamp(), 1);
        $token = '';
        Mail::assertQueued(InvitationMail::class, function (InvitationMail $mail) use (&$token): bool {
            if ($mail->hasTo('sara@example.test')) {
                $token = $mail->token;
            }

            return true;
        });
        Mail::assertQueued(InvitationMail::class, 2);
        $this->assertTrue(app(InvitationService::class)->findByToken($token)?->is($invitation));
        $this->assertSame(['email'], $this->changedFields($invited));
        $this->assertSame(2, AuthEvent::query()->where('user_id', $invited->id)->where('event', AuthEventType::InvitationSent)->count());
    }

    public function test_the_email_of_a_user_who_is_not_invited_cannot_change(): void
    {
        foreach ([User::factory()->create(['email' => 'sara@example.test']), User::factory()->disabled()->create(['email' => 'luca@example.test'])] as $user) {
            $this->actingAs($this->admin)->withHeader('Accept-Language', 'it')
                ->patchJson("/api/users/{$user->id}", $this->payload(['email' => 'nuova@example.test']))
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['email' => __('users.email_locked', [], 'it')]);
            $this->assertNotSame('nuova@example.test', $user->fresh()?->email);
        }

        // La stessa email (anche con maiuscole e spazi) non è una modifica
        $active = User::query()->where('email', 'sara@example.test')->firstOrFail();
        $this->actingAs($this->admin)->patchJson("/api/users/{$active->id}", $this->payload(['email' => ' SARA@example.test']))->assertOk();
        Mail::assertNothingQueued();
    }

    public function test_the_email_must_stay_unique(): void
    {
        User::factory()->create(['email' => 'presa@example.test']);
        $invited = User::factory()->invited()->create(['email' => 'sara@example.test']);

        $this->actingAs($this->admin)->patchJson("/api/users/{$invited->id}", $this->payload(['email' => 'PRESA@example.test']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
        $this->assertSame('sara@example.test', $invited->fresh()?->email);
    }

    public function test_names_follow_the_rules_of_the_invitation(): void
    {
        $employee = User::factory()->create();

        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['first_name', 'last_name']);
        $this->actingAs($this->admin)->withHeader('Accept-Language', 'it')
            ->patchJson("/api/users/{$employee->id}", ['first_name' => '[Verifica](https://phish.example)', 'last_name' => 'Rossi <b>'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'first_name' => 'Il nome non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
                'last_name' => 'Il cognome non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
            ]);
    }

    public function test_an_invitation_accepted_meanwhile_keeps_its_email(): void
    {
        $stale = User::factory()->invited()->create(['email' => 'sara@example.test']);
        User::query()->whereKey($stale->id)->update(['status' => 'active']);

        try {
            app(UserManagementService::class)->update($stale, 'Sara', 'Colombo', 'nuova@example.test', $this->admin, Request::create('/'));
            $this->fail('Expected ValidationException');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('email', $exception->errors());
            $this->assertSame('sara@example.test', $stale->fresh()?->email);
            $this->assertDatabaseCount('auth_events', 0);
            Mail::assertNothingQueued();
        }
    }

    public function test_a_manager_on_a_user_promoted_meanwhile_gets_a_conflict(): void
    {
        $manager = User::factory()->manager()->create();
        $stale = User::factory()->create(['last_name' => 'Rossi']);
        User::query()->whereKey($stale->id)->update(['role' => Role::Admin->value]);

        try {
            app(UserManagementService::class)->update($stale, 'Sara', 'Colombo', null, $manager, Request::create('/'));
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException) {
            $this->assertSame('Rossi', $stale->fresh()?->last_name);
        }
    }

    public function test_two_parallel_edits_to_the_same_email_give_422_not_500(): void
    {
        // L'altra richiesta ha preso l'indirizzo dopo la validazione di questa
        User::factory()->create(['email' => 'presa@example.test']);
        $invited = User::factory()->invited()->create(['email' => 'sara@example.test']);

        try {
            app(UserManagementService::class)->update($invited, 'Sara', 'Colombo', 'presa@example.test', $this->admin, Request::create('/'));
            $this->fail('Expected ValidationException');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('email', $exception->errors());
            $this->assertSame('sara@example.test', $invited->fresh()?->email);
            $this->assertSame(UserStatus::Invited, $invited->fresh()?->status);
            Mail::assertNothingQueued();
        }
    }

    public function test_editing_another_admin_needs_the_password(): void
    {
        $otherAdmin = User::factory()->admin()->create(['first_name' => 'Bruno', 'last_name' => 'Admin']);

        $this->actingAs($this->admin)->patchJson("/api/users/{$otherAdmin->id}", $this->payload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->patchJson("/api/users/{$otherAdmin->id}", $this->payload(['current_password' => 'sbagliata']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->assertSame('Admin', $otherAdmin->fresh()?->last_name);
        $this->assertDatabaseHas('auth_events', ['user_id' => $this->admin->id, 'event' => AuthEventType::AdminPasswordFailed->value]);

        $this->actingAs($this->admin)->patchJson("/api/users/{$otherAdmin->id}", $this->payload(['current_password' => 'password']))
            ->assertOk()
            ->assertJsonPath('data.name', 'Sara Colombo');
        // Rinominare un admin attivo non avvisa nessuno: l'avviso è per il cambio di email
        Mail::assertNothingQueued();
    }

    public function test_five_wrong_passwords_lock_the_edit_of_an_admin_and_the_other_admin_actions(): void
    {
        $otherAdmin = User::factory()->admin()->create();
        $employee = User::factory()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($this->admin)->patchJson("/api/users/{$otherAdmin->id}", $this->payload(['current_password' => 'sbagliata']))->assertUnprocessable();
        }

        $this->actingAs($this->admin)->patchJson("/api/users/{$otherAdmin->id}", $this->payload(['current_password' => 'password']))
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'password'])
            ->assertTooManyRequests();
        // Chi non è admin si modifica senza password, anche durante il blocco
        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", $this->payload())->assertOk();
    }

    public function test_successful_edits_of_an_admin_do_not_use_up_password_attempts(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->actingAs($this->admin)->patchJson("/api/users/{$otherAdmin->id}", $this->payload(['last_name' => "Colombo {$attempt}", 'current_password' => 'password']))->assertOk();
        }
    }

    public function test_an_admin_edits_themselves_without_the_password(): void
    {
        $this->actingAs($this->admin)->patchJson("/api/users/{$this->admin->id}", $this->payload())
            ->assertOk()
            ->assertJsonPath('data.name', 'Sara Colombo');
        Mail::assertNothingQueued();
    }

    public function test_changing_the_email_of_an_invited_admin_warns_the_other_active_admins(): void
    {
        $otherAdmin = User::factory()->admin()->create();
        $disabledAdmin = User::factory()->admin()->disabled()->create();
        $invitedAdmin = User::factory()->admin()->invited()->create(['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test']);

        $this->actingAs($this->admin)->patchJson("/api/users/{$invitedAdmin->id}", ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'altra@example.test'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->assertSame('nora@example.test', $invitedAdmin->fresh()?->email);

        $this->actingAs($this->admin)->patchJson("/api/users/{$invitedAdmin->id}", ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'altra@example.test', 'current_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.email', 'altra@example.test');

        Mail::assertQueued(InvitationMail::class, fn (InvitationMail $mail): bool => $mail->hasTo('altra@example.test'));
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email)
            && $mail->change === AdminChange::EmailChanged
            && $mail->targetName === 'Nora Neri');
        Mail::assertQueued(AdminChangeMail::class, 1);
        foreach ([$this->admin->email, $disabledAdmin->email, 'nora@example.test', 'altra@example.test'] as $notTold) {
            Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($notTold));
        }
        $this->assertSame(['email'], $this->changedFields($invitedAdmin));
    }

    public function test_a_target_promoted_after_the_request_without_password_conflicts(): void
    {
        $stale = User::factory()->create(['last_name' => 'Rossi']);
        User::query()->whereKey($stale->id)->update(['role' => Role::Admin->value]);

        try {
            app(UserManagementService::class)->update($stale, 'Sara', 'Colombo', null, $this->admin, Request::create('/'), passwordConfirmed: false);
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException $exception) {
            $this->assertSame(__('users.state_changed'), $exception->getMessage());
            $this->assertSame('Rossi', $stale->fresh()?->last_name);
            $this->assertDatabaseCount('auth_events', 0);
        }
    }
}
