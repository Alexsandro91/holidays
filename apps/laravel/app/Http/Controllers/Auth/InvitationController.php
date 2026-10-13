<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Invitations\AcceptInvitationRequest;
use App\Models\Invitation;
use App\Services\InvitationService;
use App\Services\LoginChallengeService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class InvitationController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function show(string $token): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $problem = $this->problem($invitation);

        if ($problem !== null || $invitation === null || $invitation->user === null) {
            return $problem ?? $this->notFound();
        }

        return response()->json(['data' => [
            'name' => $invitation->user->name,
            'email' => $invitation->user->email,
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]]);
    }

    /**
     * Come dopo il reset (spec §6.3): l'attivazione non apre la sessione, parte il passo del codice.
     */
    public function accept(AcceptInvitationRequest $request, string $token, LoginChallengeService $challenges): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $problem = $this->problem($invitation);

        if ($problem !== null || $invitation === null) {
            return $problem ?? $this->notFound();
        }

        $user = $this->invitations->accept($invitation, $request->string('password')->value(), $request);

        if ($user === null) {
            return $this->notFound();
        }

        // Se la coda dell'email non risponde l'errore è solo segnalato: l'account è attivo, il codice si richiede dalla pagina
        $challenges->beginFor($request, $user, reportMailFailure: true);

        return response()->json(['two_factor' => true, 'message' => Translate::text('invitations.accepted')]);
    }

    /**
     * 404 per link inesistente, usato o annullato; 410 per link scaduto.
     */
    private function problem(?Invitation $invitation): ?JsonResponse
    {
        if ($invitation === null || $invitation->isAccepted() || $invitation->user === null) {
            return $this->notFound();
        }

        if ($invitation->isExpired()) {
            return response()->json(['message' => Translate::text('invitations.expired')], Response::HTTP_GONE);
        }

        return null;
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['message' => Translate::text('invitations.invalid')], Response::HTTP_NOT_FOUND);
    }
}
