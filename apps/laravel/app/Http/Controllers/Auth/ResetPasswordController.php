<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Services\LoginChallengeService;
use App\Services\PasswordResetService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class ResetPasswordController extends Controller
{
    /**
     * Il reset non apre la sessione: se riesce parte il passo del codice, come dopo la password (spec §6.3).
     */
    public function __invoke(ResetPasswordRequest $request, PasswordResetService $passwords, LoginChallengeService $challenges): JsonResponse
    {
        $user = $passwords->reset([
            'email' => $request->string('email')->value(),
            'token' => $request->string('token')->value(),
            'password' => $request->string('password')->value(),
        ], $request);

        if ($user === null) {
            // Stesso messaggio per token sbagliato, scaduto, già usato, email diversa o utente non attivo
            $message = Translate::text('password_reset.invalid_link');

            return response()->json(['message' => $message, 'errors' => ['token' => [$message]]], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // Codice solo all'utente del link: le challenge in attesa sono già state cancellate dal reset
        // Se la coda dell'email non risponde l'errore è solo segnalato: il reset è già riuscito e il link consumato
        $challenges->beginFor($request, $user, reportMailFailure: true);

        return response()->json(['two_factor' => true, 'message' => Translate::text('password_reset.done')]);
    }
}
