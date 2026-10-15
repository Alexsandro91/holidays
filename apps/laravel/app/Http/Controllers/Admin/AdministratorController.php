<?php

namespace App\Http\Controllers\Admin;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\GrantAdminRequest;
use App\Http\Requests\Users\InviteAdminRequest;
use App\Http\Requests\Users\RevokeAdminRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\UserManagementService;
use App\Support\Translate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

final class AdministratorController extends Controller
{
    public function __construct(private readonly UserManagementService $users) {}

    public function index(): AnonymousResourceCollection
    {
        return ManagedUserResource::collection(
            User::query()->where('role', Role::Admin)->with(['invitation', 'location'])->orderBy('last_name')->orderBy('first_name')->orderBy('id')->get(),
        );
    }

    public function store(GrantAdminRequest $request): JsonResponse|ManagedUserResource
    {
        $target = User::query()->findOrFail($request->integer('user_id'));
        Gate::authorize('grantAdmin', $target);

        if ($target->status !== UserStatus::Active || $target->isAdmin()) {
            return response()->json(['message' => Translate::text('users.not_promotable')], Response::HTTP_CONFLICT);
        }

        return new ManagedUserResource($this->users->grantAdmin($target, $this->actor($request), $request)->load(['invitation', 'location']));
    }

    /**
     * Nuovo admin invitato per email (spec del 14/10, §4): diventa un admin attivo quando accetta l'invito.
     */
    public function invite(InviteAdminRequest $request): JsonResponse
    {
        $actor = $this->actor($request);
        $invited = $this->users->inviteAdmin(
            $request->string('first_name')->value(),
            $request->string('last_name')->value(),
            $request->string('email')->value(),
            $request->chosenEmploymentType() ?? EmploymentType::Employee,
            $request->invitationLocation($actor),
            $actor,
            $request,
        );

        return (new ManagedUserResource($invited->load(['invitation', 'location'])))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function destroy(RevokeAdminRequest $request, User $user): JsonResponse|ManagedUserResource
    {
        if (! $user->isAdmin()) {
            return response()->json(['message' => Translate::text('users.not_admin')], Response::HTTP_CONFLICT);
        }

        if ($user->status !== UserStatus::Active) {
            return response()->json(['message' => Translate::text('users.admin_not_active')], Response::HTTP_CONFLICT);
        }

        return new ManagedUserResource($this->users->revokeAdmin($user, Role::from($request->validated('role')), $this->actor($request), $request)->load(['invitation', 'location']));
    }
}
