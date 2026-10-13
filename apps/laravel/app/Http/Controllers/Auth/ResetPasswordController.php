<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Services\PasswordResetService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class ResetPasswordController extends Controller
{
    public function __invoke(ResetPasswordRequest $request, PasswordResetService $passwords): JsonResponse
    {
        $done = $passwords->reset([
            'email' => $request->string('email')->value(),
            'token' => $request->string('token')->value(),
            'password' => $request->string('password')->value(),
        ], $request);

        if (! $done) {
            // Stesso messaggio per token sbagliato, scaduto, già usato, email diversa o utente non attivo
            $message = Translate::text('password_reset.invalid_link');

            return response()->json(['message' => $message, 'errors' => ['token' => [$message]]], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['message' => Translate::text('password_reset.done')]);
    }
}
