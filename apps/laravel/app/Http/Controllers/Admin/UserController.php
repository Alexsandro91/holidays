<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Enums\UserSort;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\ListUsersRequest;
use App\Http\Requests\Users\StoreUserRequest;
use App\Http\Requests\Users\UpdateUserRequest;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\InvitationService;
use App\Services\UserManagementService;
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
        'role' => [Role::Employee->value, Role::Manager->value],
        'status' => [UserStatus::Active->value, UserStatus::Invited->value, UserStatus::Disabled->value],
    ];

    /**
     * Campi in cui cerca `filter[search]` e colonne dei filtri "contiene".
     */
    private const SEARCHABLE = ['first_name', 'last_name', 'email'];

    /**
     * Parole distinte della ricerca prese in considerazione: le successive si ignorano.
     */
    private const MAX_SEARCH_WORDS = 5;

    public function index(ListUsersRequest $request): AnonymousResourceCollection
    {
        $words = preg_split('/\s+/u', mb_strtolower($request->textFilter('search')), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $words = array_slice(array_values(array_unique($words)), 0, self::MAX_SEARCH_WORDS);
        $role = $request->enum('filter.role', Role::class);
        $status = $request->enum('filter.status', UserStatus::class);

        // Gli admin non sono mai in questa lista (si gestiscono dalla pagina Amministratori), né nei conteggi.
        // Ricerca, filtri per campo e ruolo valgono anche per i conteggi delle schede; lo stato filtra solo la lista
        $base = User::query()
            ->where('role', '!=', Role::Admin)
            ->when($role !== null, fn (Builder $query) => $query->where('role', $role));

        // Ogni parola deve comparire in nome, cognome o email: "Mario Rossi" e "Rossi Mario" trovano la stessa persona
        foreach ($words as $word) {
            $pattern = $this->containsPattern($word);
            $base->where(function (Builder $query) use ($pattern): void {
                foreach (self::SEARCHABLE as $column) {
                    $query->orWhereLike($column, $pattern);
                }
            });
        }

        foreach (self::SEARCHABLE as $column) {
            $text = $request->textFilter($column);

            if ($text !== '') {
                $base->whereLike($column, $this->containsPattern($text));
            }
        }

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
            $request->string('first_name')->value(),
            $request->string('last_name')->value(),
            $request->string('email')->value(),
            $request->enum('role', Role::class) ?? Role::Employee,
            $this->actor($request),
            $request,
        );

        return (new ManagedUserResource($user->load('invitation')))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function update(UpdateUserRequest $request, User $user, UserManagementService $users): ManagedUserResource
    {
        $updated = $users->update(
            $user,
            $request->string('first_name')->value(),
            $request->string('last_name')->value(),
            $request->newEmail(),
            $this->actor($request),
            $request,
            passwordConfirmed: $request->targetIsAnotherAdmin(),
        );

        return new ManagedUserResource($updated->load('invitation'));
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

            // A parità di cognome conta il nome e viceversa (default: cognome, nome, id)
            match ($column) {
                'last_name' => $query->orderBy('first_name'),
                'first_name' => $query->orderBy('last_name'),
                default => null,
            };
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
