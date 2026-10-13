<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Services\PasswordResetService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class ForgotPasswordController extends Controller
{
    /**
     * Sempre 202 con lo stesso messaggio: la risposta non rivela se l'email è registrata.
     */
    public function __invoke(ForgotPasswordRequest $request, PasswordResetService $passwords): JsonResponse
    {
        $passwords->sendLink($request->string('email')->value());

        return response()->json(['message' => Translate::text('password_reset.link_sent')], Response::HTTP_ACCEPTED);
    }
}
