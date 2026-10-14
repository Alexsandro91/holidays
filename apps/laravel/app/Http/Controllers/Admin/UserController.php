<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Enums\UserSort;
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
    /**
     * Gerarchia per l'ordinamento di ruolo e stato: mai l'ordine alfabetico dei valori.
     *
     * @var array<string, list<string>>
     */
    private const RANKS = [
        'role' => [Role::Employee->value, Role::Manager->value, Role::Admin->value],
        'status' => [UserStatus::Active->value, UserStatus::Invited->value, UserStatus::Disabled->value],
    ];

    public function index(ListUsersRequest $request): AnonymousResourceCollection
    {
        $name = $request->textFilter('name');
        $email = $request->textFilter('email');
        $role = $request->enum('filter.role', Role::class);
        $status = $request->enum('filter.status', UserStatus::class);

        // Nome, email e ruolo valgono anche per i conteggi delle schede; lo stato filtra solo la lista
        $base = User::query()
            ->when($name !== '', fn (Builder $query) => $query->whereLike('name', $this->containsPattern($name)))
            ->when($email !== '', fn (Builder $query) => $query->whereLike('email', $this->containsPattern($email)))
            ->when($role !== null, fn (Builder $query) => $query->where('role', $role));

        $counts = (clone $base)->toBase()
            ->select('status')
            ->selectRaw('count(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $users = (clone $base)
            ->when($status !== null, fn (Builder $query) => $query->where('status', $status))
            ->with('invitation')
            ->tap(fn (Builder $query) => $this->applySort($query, $request->sort()))
            ->paginate($request->perPage())
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

    /**
     * Ricerca "contiene": %, _ e \ digitati dall'utente valgono come caratteri, non come jolly.
     */
    private function containsPattern(string $text): string
    {
        return '%'.addcslashes($text, '%_\\').'%';
    }

    /**
     * @param  Builder<User>  $query
     */
    private function applySort(Builder $query, UserSort $sort): void
    {
        $column = $sort->column();
        $ranks = self::RANKS[$column] ?? null;

        if ($ranks === null) {
            $query->orderBy($column, $sort->direction());
        } else {
            // CASE portabile tra i database, con valori e posizioni in binding
            $cases = implode(' ', array_fill(0, count($ranks), 'WHEN ? THEN ?'));
            $bindings = array_merge(...array_map(fn (string $value, int $rank): array => [$value, $rank], $ranks, array_keys($ranks)));
            $query->orderByRaw("CASE {$query->getQuery()->getGrammar()->wrap($column)} {$cases} END {$sort->direction()}", $bindings);
        }

        // Spareggio stabile per la paginazione
        $query->orderBy('id');
    }
}
