<?php

namespace App\Http\Controllers\Auth;

use App\Enums\AuthEventType;
use App\Enums\ChallengeResult;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\TwoFactorCodeRequest;
use App\Http\Resources\UserResource;
use App\Mail\LoginCodeMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\AuthEventLogger;
use App\Services\LoginChallengeService;
use App\Support\AuthSession;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpFoundation\Response;

final class TwoFactorChallengeController extends Controller
{
    public function __construct(
        private readonly LoginChallengeService $challenges,
        private readonly AuthEventLogger $events,
    ) {}

    public function store(TwoFactorCodeRequest $request): JsonResponse
    {
        $challenge = $this->pendingChallenge($request);
        $user = $challenge?->user;

        if ($challenge === null || $user === null || ! $user->isActive()) {
            return $this->restart($request);
        }

        return match ($this->challenges->verify($challenge, $request->string('code')->value())) {
            ChallengeResult::Valid => $this->completeLogin($request, $user),
            ChallengeResult::Invalid => $this->invalidCode($request, $challenge, $user),
            ChallengeResult::Locked => $this->lockedOut($request, $user),
            ChallengeResult::Expired => $this->restart($request),
        };
    }

    public function resend(Request $request): JsonResponse
    {
        $challenge = $this->pendingChallenge($request);
        $user = $challenge?->user;

        if ($challenge === null || $user === null || ! $user->isActive()) {
            return $this->restart($request);
        }

        if (! $this->challenges->canResend($challenge)) {
            return response()->json([
                'message' => Translate::text('login.resend_limit'),
                'meta' => ['limit_reached' => true],
            ], Response::HTTP_TOO_MANY_REQUESTS);
        }

        $wait = $this->challenges->secondsUntilResend($challenge);

        if ($wait > 0) {
            return response()->json([
                'message' => Translate::text('login.resend_wait', ['seconds' => $wait]),
                'meta' => ['retry_after' => $wait],
            ], Response::HTTP_TOO_MANY_REQUESTS, ['Retry-After' => (string) $wait]);
        }

        $code = $this->challenges->resend($challenge);
        Mail::to($user)->send(new LoginCodeMail($code, (string) $request->userAgent(), now()));

        return response()->json(['message' => Translate::text('login.resent')], Response::HTTP_ACCEPTED);
    }

    private function pendingChallenge(Request $request): ?LoginChallenge
    {
        $id = $request->session()->get(AuthSession::CHALLENGE_ID);

        return is_int($id) ? LoginChallenge::query()->with('user')->find($id) : null;
    }

    private function completeLogin(Request $request, User $user): JsonResponse
    {
        Auth::guard('web')->login($user);

        $request->session()->regenerate();
        $request->session()->forget(AuthSession::CHALLENGE_ID);
        $request->session()->put(AuthSession::LOGGED_IN_AT, now()->getTimestamp());

        $user->forceFill(['last_login_at' => now()])->save();
        $this->events->log(AuthEventType::LoginSucceeded, $request, $user);

        return (new UserResource($user))->response()->setStatusCode(Response::HTTP_OK);
    }

    private function invalidCode(Request $request, LoginChallenge $challenge, User $user): JsonResponse
    {
        $this->events->log(AuthEventType::CodeFailed, $request, $user);
        $message = Translate::text('login.code_invalid');

        return response()->json([
            'message' => $message,
            'errors' => ['code' => [$message]],
            'meta' => ['attempts_left' => $this->challenges->attemptsLeft($challenge)],
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    private function lockedOut(Request $request, User $user): JsonResponse
    {
        $this->events->log(AuthEventType::LockedOut, $request, $user);

        return $this->restart($request);
    }

    private function restart(Request $request): JsonResponse
    {
        $request->session()->forget(AuthSession::CHALLENGE_ID);
        $message = Translate::text('login.code_restart');

        return response()->json([
            'message' => $message,
            'errors' => ['code' => [$message]],
            'meta' => ['restart' => true],
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
    }
}
