<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\ChangePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Resources\CurrentUserResource;
use App\Models\User;
use App\Services\ProfileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Profilo di chi è collegato: agisce sempre su `$request->user()`, mai su un utente scelto dalla richiesta.
 */
final class ProfileController extends Controller
{
    public function update(UpdateProfileRequest $request, ProfileService $profile): JsonResponse
    {
        $user = $this->currentUser($request);
        $updated = $profile->update($user, $request->validated(), $request);

        // Con la lingua cambiata la risposta è già nella nuova
        App::setLocale($updated->locale);

        return (new CurrentUserResource($updated))->response()->setStatusCode(HttpResponse::HTTP_OK);
    }

    public function password(ChangePasswordRequest $request, ProfileService $profile): Response
    {
        $updated = $profile->changePassword($this->currentUser($request), $request->string('password')->value(), $request);

        // AuthenticateSession salva in sessione l'hash dell'utente del guard: deve essere quello nuovo, altrimenti
        // la richiesta successiva scollega chi ha appena cambiato la password
        Auth::guard('web')->setUser($updated);

        // Nuovo id di sessione dopo il commit: l'utente resta collegato, il vecchio id non vale più
        if ($request->hasSession()) {
            $request->session()->migrate(true);
        }

        return response()->noContent();
    }

    private function currentUser(UpdateProfileRequest|ChangePasswordRequest $request): User
    {
        $user = $request->user();

        assert($user instanceof User);

        return $user;
    }
}
