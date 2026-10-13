<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\ChangeRoleRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\UserManagementService;

final class UserRoleController extends Controller
{
    public function __invoke(ChangeRoleRequest $request, User $user, UserManagementService $users): ManagedUserResource
    {
        $users->changeRole($user, $request->enum('role', Role::class) ?? Role::Employee, $this->actor($request), $request);

        return new ManagedUserResource($user->refresh()->load('invitation'));
    }
}
