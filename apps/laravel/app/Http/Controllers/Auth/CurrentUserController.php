<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CurrentUserController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        // Stato esplicito: senza, un utente appena creato risponderebbe 201
        return (new UserResource($request->user()))->response()->setStatusCode(Response::HTTP_OK);
    }
}
