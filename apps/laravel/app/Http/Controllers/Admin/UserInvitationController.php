<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Symfony\Component\HttpFoundation\Response;

final class UserInvitationController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function resend(Request $request, User $user): JsonResponse
    {
        if ($user->status !== UserStatus::Invited) {
            return response()->json(['message' => Translate::text('invitations.not_invited')], Response::HTTP_CONFLICT);
        }

        $wait = $this->invitations->secondsUntilResend($user);

        if ($wait > 0) {
            return response()->json([
                'message' => Translate::text('invitations.resend_wait', ['seconds' => $wait]),
                'meta' => ['retry_after' => $wait],
            ], Response::HTTP_TOO_MANY_REQUESTS, ['Retry-After' => (string) $wait]);
        }

        $this->invitations->resend($user, $this->actor($request), $request);

        return response()->json(['message' => Translate::text('users.invitation_resent')], Response::HTTP_ACCEPTED);
    }

    public function cancel(Request $request, User $user): JsonResponse|HttpResponse
    {
        if ($user->status !== UserStatus::Invited) {
            return response()->json(['message' => Translate::text('invitations.not_invited')], Response::HTTP_CONFLICT);
        }

        $this->invitations->cancel($user, $this->actor($request), $request);

        return response()->noContent();
    }
}
