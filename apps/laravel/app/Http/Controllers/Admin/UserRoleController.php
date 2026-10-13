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
        $updated = $users->changeRole($user, Role::from($request->validated('role')), $this->actor($request), $request);

        return new ManagedUserResource($updated->load('invitation'));
    }
}
