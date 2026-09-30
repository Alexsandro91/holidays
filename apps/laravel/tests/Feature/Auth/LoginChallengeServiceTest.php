<?php

namespace Tests\Feature\Auth;

use App\Enums\ChallengeResult;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\LoginChallengeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginChallengeServiceTest extends TestCase
{
    use RefreshDatabase;

    private LoginChallengeService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(LoginChallengeService::class);
    }

    public function test_start_creates_a_six_digit_code_stored_only_as_a_hash(): void
    {
        // Secondo intero: il database salva i timestamp senza microsecondi.
        $this->freezeSecond();
        $user = User::factory()->create();

        [$challenge, $code] = $this->service->start($user);

        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);
        $this->assertSame(64, strlen($challenge->code_hash));
        $this->assertNotSame($code, $challenge->code_hash);
        $this->assertTrue($challenge->expires_at->equalTo(now()->addMinutes(10)));
    }

    public function test_start_replaces_previous_challenges_of_the_same_user(): void
    {
        $user = User::factory()->create();

        $this->service->start($user);
        $this->service->start($user);

        $this->assertSame(1, LoginChallenge::query()->where('user_id', $user->id)->count());
    }

    public function test_a_valid_code_is_accepted_once(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        $this->assertSame(ChallengeResult::Valid, $this->service->verify($challenge, $code));
        $this->assertModelMissing($challenge);
    }

    public function test_a_wrong_code_counts_as_an_attempt(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        $this->assertSame(ChallengeResult::Invalid, $this->service->verify($challenge, $this->wrongCode($code)));
        $this->assertSame(4, $this->service->attemptsLeft($challenge->fresh()));
    }

    public function test_the_fifth_wrong_code_locks_the_challenge(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        for ($i = 0; $i < 4; $i++) {
            $this->assertSame(ChallengeResult::Invalid, $this->service->verify($challenge, $this->wrongCode($code)));
        }

        $this->assertSame(ChallengeResult::Locked, $this->service->verify($challenge, $this->wrongCode($code)));
        $this->assertModelMissing($challenge);
    }

    public function test_an_expired_challenge_cannot_be_used(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        $this->travel(11)->minutes();

        $this->assertSame(ChallengeResult::Expired, $this->service->verify($challenge, $code));
        $this->assertModelMissing($challenge);
    }

    public function test_resend_waits_sixty_seconds_and_replaces_the_code(): void
    {
        $this->freezeTime();
        [$challenge, $first] = $this->service->start(User::factory()->create());

        $this->assertSame(60, $this->service->secondsUntilResend($challenge));

        $this->travel(61)->seconds();
        $this->assertSame(0, $this->service->secondsUntilResend($challenge));

        $second = $this->service->resend($challenge);
        $challenge->refresh();

        $this->assertSame(1, $challenge->resend_count);
        $this->assertSame(0, $challenge->attempts);
        if ($first !== $second) {
            $this->assertSame(ChallengeResult::Invalid, $this->service->verify($challenge, $first));
        }
        $this->assertSame(ChallengeResult::Valid, $this->service->verify($challenge->fresh(), $second));
    }

    public function test_resend_is_allowed_three_times(): void
    {
        [$challenge] = $this->service->start(User::factory()->create());

        for ($i = 0; $i < 3; $i++) {
            $this->assertTrue($this->service->canResend($challenge));
            $this->service->resend($challenge);
            $challenge->refresh();
        }

        $this->assertFalse($this->service->canResend($challenge));
    }

    public function test_a_stale_instance_cannot_bypass_the_attempts_limit(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());
        $stale = $challenge->fresh();

        $challenge->forceFill(['attempts' => 4])->save();

        $this->assertSame(ChallengeResult::Locked, $this->service->verify($stale, $this->wrongCode($code)));
        $this->assertModelMissing($challenge);
    }

    public function test_a_code_cannot_be_used_twice_from_two_instances(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());
        $copy = $challenge->fresh();

        $this->assertSame(ChallengeResult::Valid, $this->service->verify($challenge, $code));
        $this->assertSame(ChallengeResult::Expired, $this->service->verify($copy, $code));
    }

    public function test_attempts_left_is_in_sync_on_the_same_instance_after_a_wrong_code(): void
    {
        [$challenge, $code] = $this->service->start(User::factory()->create());

        $this->service->verify($challenge, $this->wrongCode($code));

        $this->assertSame(4, $this->service->attemptsLeft($challenge));
    }

    private function wrongCode(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }
}
