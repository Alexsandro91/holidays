<?php

namespace Tests\Feature\Auth;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\User;
use App\Services\AuthEventLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class AuthEventLoggerTest extends TestCase
{
    use RefreshDatabase;

    public function test_logs_the_event_with_request_context(): void
    {
        $user = User::factory()->create();
        $request = Request::create('/', 'POST', server: [
            'REMOTE_ADDR' => '203.0.113.7',
            'HTTP_USER_AGENT' => str_repeat('a', 400),
        ]);

        app(AuthEventLogger::class)->log(AuthEventType::LoginSucceeded, $request, $user);

        $event = AuthEvent::query()->sole();
        $this->assertSame(AuthEventType::LoginSucceeded, $event->event);
        $this->assertSame($user->id, $event->user_id);
        $this->assertSame('203.0.113.7', $event->ip_address);
        $this->assertSame(255, mb_strlen((string) $event->user_agent));
        $this->assertNotNull($event->created_at);
    }

    public function test_logs_events_without_a_user(): void
    {
        app(AuthEventLogger::class)->log(AuthEventType::LoginFailed, Request::create('/', 'POST'));

        $this->assertNull(AuthEvent::query()->sole()->user_id);
    }
}
