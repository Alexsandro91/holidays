<?php

namespace App\Http\Controllers\Admin;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\UserStatusRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\UserManagementService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class UserStatusController extends Controller
{
    public function __construct(private readonly UserManagementService $users) {}

    public function disable(UserStatusRequest $request, User $user): JsonResponse|ManagedUserResource
    {
        if ($user->status !== UserStatus::Active) {
            return response()->json(['message' => Translate::text('users.not_active')], Response::HTTP_CONFLICT);
        }

        $this->users->disable($user, $this->actor($request), $request);

        return new ManagedUserResource($user->refresh());
    }

    public function enable(UserStatusRequest $request, User $user): JsonResponse|ManagedUserResource
    {
        if ($user->status !== UserStatus::Disabled) {
            return response()->json(['message' => Translate::text('users.not_disabled')], Response::HTTP_CONFLICT);
        }

        $this->users->enable($user, $this->actor($request), $request);

        return new ManagedUserResource($user->refresh());
    }
}
