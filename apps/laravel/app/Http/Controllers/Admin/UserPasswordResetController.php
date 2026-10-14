<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Users\UserStatusRequest;
use App\Models\User;
use App\Services\UserManagementService;
use Illuminate\Http\Response;

/**
 * Link di reset della password inviato da admin o responsabile (fase 4, §6): solo il link, all'email della persona.
 */
final class UserPasswordResetController extends Controller
{
    public function __invoke(UserStatusRequest $request, User $user, UserManagementService $users): Response
    {
        // Lo stato lo ricontrolla il servizio sotto blocco (409 `users.not_active`)
        $users->sendPasswordReset($user, $this->actor($request), $request, $user->isAdmin());

        return response()->noContent(202);
    }
}
