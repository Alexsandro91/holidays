<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\ListUsersRequest;
use App\Http\Requests\Users\StoreUserRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\InvitationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

final class UserController extends Controller
{
    private const PER_PAGE = 25;

    public function index(ListUsersRequest $request): AnonymousResourceCollection
    {
        $search = $request->string('search')->trim()->value();
        $status = $request->enum('filter.status', UserStatus::class);
        $role = $request->enum('filter.role', Role::class);

        // Ricerca e ruolo valgono anche per i conteggi delle schede; lo stato filtra solo la lista
        $base = User::query()
            ->when($search !== '', function (Builder $query) use ($search): void {
                $pattern = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn (Builder $inner) => $inner->where('name', 'like', $pattern)->orWhere('email', 'like', $pattern));
            })
            ->when($role !== null, fn (Builder $query) => $query->where('role', $role));

        $counts = (clone $base)->toBase()
            ->selectRaw('status, count(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $users = (clone $base)
            ->when($status !== null, fn (Builder $query) => $query->where('status', $status))
            ->with('invitation')
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        return ManagedUserResource::collection($users)->additional(['meta' => ['counts' => [
            'all' => (int) $counts->sum(),
            'active' => (int) ($counts[UserStatus::Active->value] ?? 0),
            'invited' => (int) ($counts[UserStatus::Invited->value] ?? 0),
            'disabled' => (int) ($counts[UserStatus::Disabled->value] ?? 0),
        ]]]);
    }

    public function store(StoreUserRequest $request, InvitationService $invitations): JsonResponse
    {
        $user = $invitations->invite(
            $request->string('name')->value(),
            $request->string('email')->value(),
            $request->enum('role', Role::class) ?? Role::Employee,
            $this->actor($request),
            $request,
        );

        return (new ManagedUserResource($user->load('invitation')))->response()->setStatusCode(Response::HTTP_CREATED);
    }
}
