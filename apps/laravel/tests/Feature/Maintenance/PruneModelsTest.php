<?php

namespace Tests\Feature\Maintenance;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\Invitation;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\LoginChallengeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pulizie programmate (spec §7.3): `model:prune` ogni giorno.
 */
class PruneModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_dead_login_challenges_are_pruned(): void
    {
        $user = User::factory()->create();
        $maxAge = LoginChallengeService::MAX_AGE_MINUTES;

        // Codice scaduto e login iniziato da oltre MAX_AGE: nessun nuovo invio può riattivarlo
        $dead = $this->challenge($user, createdMinutesAgo: $maxAge + 15, expiresInMinutes: -5);
        // Codice scaduto ma login recente: il nuovo invio è ancora possibile e rinnova la scadenza
        $resendable = $this->challenge(User::factory()->create(), createdMinutesAgo: 12, expiresInMinutes: -2);
        // Codice ancora valido dopo un nuovo invio, anche se il login è iniziato da più di MAX_AGE
        $valid = $this->challenge(User::factory()->create(), createdMinutesAgo: $maxAge + 5, expiresInMinutes: 3);

        $this->artisan('model:prune', ['--model' => [LoginChallenge::class]])->assertSuccessful();

        $this->assertModelMissing($dead);
        $this->assertModelExists($resendable);
        $this->assertModelExists($valid);
    }

    public function test_unaccepted_invitations_are_pruned_thirty_days_after_they_expire(): void
    {
        $old = Invitation::factory()->create(['expires_at' => now()->subDays(30)->subMinute()]);
        $recentlyExpired = Invitation::factory()->create(['expires_at' => now()->subDays(29)]);
        $pending = Invitation::factory()->create();
        $acceptedLongAgo = Invitation::factory()->accepted()->create(['expires_at' => now()->subDays(90)]);

        $this->artisan('model:prune', ['--model' => [Invitation::class]])->assertSuccessful();

        $this->assertModelMissing($old);
        $this->assertModelExists($recentlyExpired);
        $this->assertModelExists($pending);
        $this->assertModelExists($acceptedLongAgo);
        // L'utente invitato resta: l'admin può reinviare o annullare
        $this->assertModelExists($old->user()->firstOrFail());
    }

    public function test_auth_events_are_kept_for_the_configured_number_of_days(): void
    {
        config(['auth.events_retention_days' => 180]);
        $user = User::factory()->create();
        $old = $this->event($user, now()->subDays(180)->subMinute());
        $recent = $this->event($user, now()->subDays(179));

        $this->artisan('model:prune', ['--model' => [AuthEvent::class]])->assertSuccessful();

        $this->assertModelMissing($old);
        $this->assertModelExists($recent);
    }

    public function test_the_retention_of_auth_events_defaults_to_180_days(): void
    {
        $this->assertSame(180, config('auth.events_retention_days'));
    }

    private function challenge(User $user, int $createdMinutesAgo, int $expiresInMinutes): LoginChallenge
    {
        return LoginChallenge::query()->forceCreate([
            'user_id' => $user->id,
            'code_hash' => str_repeat('a', 64),
            'expires_at' => now()->addMinutes($expiresInMinutes),
            'attempts' => 0,
            'resend_count' => 0,
            'last_sent_at' => now()->subMinutes($createdMinutesAgo),
            'created_at' => now()->subMinutes($createdMinutesAgo),
            'updated_at' => now()->subMinutes($createdMinutesAgo),
        ]);
    }

    private function event(User $user, \DateTimeInterface $at): AuthEvent
    {
        return AuthEvent::query()->forceCreate([
            'user_id' => $user->id,
            'event' => AuthEventType::LoginSucceeded,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'test',
            'created_at' => $at,
        ]);
    }
}
