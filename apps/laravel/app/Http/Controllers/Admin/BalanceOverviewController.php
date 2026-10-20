<?php

namespace App\Http\Controllers\Admin;

use App\Enums\BalanceType;
use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Balances\ListBalancesRequest;
use App\Http\Resources\BalanceOverviewResource;
use App\Models\BalanceMovement;
use App\Models\Location;
use App\Models\User;
use App\Services\AccrualSettingsService;
use App\Services\BalanceLedger;
use App\Services\WeeklyMinutes;
use App\Services\WorkScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;

/**
 * Pagina Saldi (spec §6.2, §7.2): le persone che chi guarda può vedere, con saldi attuali e valore annuo. Tutto a
 * blocchi sulla pagina: il numero di query non dipende dalle righe.
 */
final class BalanceOverviewController extends Controller
{
    /**
     * Parole distinte della ricerca prese in considerazione: le successive si ignorano.
     */
    private const MAX_SEARCH_WORDS = 5;

    public function __construct(
        private readonly BalanceLedger $ledger,
        private readonly AccrualSettingsService $accruals,
        private readonly WeeklyMinutes $weeklyMinutes,
        private readonly WorkScheduleService $schedules,
    ) {}

    public function __invoke(ListBalancesRequest $request): AnonymousResourceCollection
    {
        $actor = $this->actor($request);
        $page = $this->query($request, $actor)
            ->with('location')
            ->paginate(ListBalancesRequest::PER_PAGE)
            ->withQueryString();

        /** @var Collection<int, User> $users */
        $users = $page->getCollection();
        $rows = $this->rows($users);

        return BalanceOverviewResource::collection($page->through(fn (User $user): array => [
            'user' => $user,
            ...$rows[$user->id],
            'can_adjust' => $actor->can('adjustBalances', $user),
        ]));
    }

    /**
     * Dipendenti attivi, più chi ha movimenti (gli ex dipendenti con un residuo); un responsabile non vede gli admin.
     *
     * @return Builder<User>
     */
    private function query(ListBalancesRequest $request, User $actor): Builder
    {
        $locationId = $request->locationFilter();
        $words = preg_split('/\s+/u', mb_strtolower($request->search()), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $words = array_slice(array_values(array_unique($words)), 0, self::MAX_SEARCH_WORDS);
        $sort = $request->sort();

        $query = User::query()
            ->visibleTo($actor)
            ->where('status', UserStatus::Active)
            ->where(fn (Builder $query) => $query
                ->where('employment_type', EmploymentType::Employee)
                ->orWhereExists(BalanceMovement::query()->selectRaw('1')->whereColumn('balance_movements.user_id', 'users.id')))
            ->when(! $actor->isAdmin(), fn (Builder $query) => $query->where('role', '!=', Role::Admin))
            ->when($locationId !== null, fn (Builder $query) => $query->where('location_id', $locationId));

        // Ogni parola deve comparire in nome, cognome o email
        foreach ($words as $word) {
            $pattern = '%'.addcslashes($word, '%_\\').'%';
            $query->where(fn (Builder $query) => $query
                ->whereLike('first_name', $pattern)->orWhereLike('last_name', $pattern)->orWhereLike('email', $pattern));
        }

        if ($request->onlyNegative()) {
            // Almeno un saldo sotto zero a oggi (nel fuso della sede principale)
            $today = CarbonImmutable::now(Location::DEFAULT_TIMEZONE)->toDateString();
            $query->whereIn('id', BalanceMovement::query()
                ->select('user_id')
                ->where('effective_on', '<=', $today)
                ->groupBy('user_id', 'balance')
                ->havingRaw('SUM(minutes) < 0'));
        }

        if ($sort->byLocation()) {
            $query->orderBy(Location::query()->select('name')->whereColumn('locations.id', 'users.location_id'), $sort->direction());
            $query->orderBy('last_name')->orderBy('first_name');
        } else {
            $query->orderBy('last_name', $sort->direction())->orderBy('first_name', $sort->direction());
        }

        return $query->orderBy('id');
    }

    /**
     * Saldi, orari e valori annui della pagina. "Oggi" è nel fuso della sede della persona: si raggruppa per giorno
     * (di norma uno solo) e per ogni gruppo le query sono le stesse.
     *
     * @param  Collection<int, User>  $users
     * @return array<int, array{weekly_minutes: int, location_weekly_minutes: int, average_day_minutes: int, current: array<string, int>, annual: array<string, int>, last_aligned_on: ?string}>
     */
    private function rows(Collection $users): array
    {
        $accruals = $this->accruals->forUsers($users);
        $aligned = $this->ledger->lastAlignedOn($users);
        $rows = [];

        $byDay = $users->groupBy(fn (User $user): string => $this->schedules->today($user->location)->toDateString());

        foreach ($byDay as $day => $group) {
            $today = CarbonImmutable::parse($day);
            $current = $this->ledger->currentFor($group, $today);
            $weekly = $this->weeklyMinutes->forUsers($group, $today);

            foreach ($group as $user) {
                $hours = $weekly[$user->id];
                $annual = [];

                foreach (BalanceType::cases() as $balance) {
                    $effective = $accruals[$user->id]->minutes($balance);
                    // Valore annuo proporzionato all'orario della persona rispetto a quello della sede
                    $annual[$balance->value] = $hours['location_weekly'] > 0
                        ? (int) round($effective * $hours['weekly'] / $hours['location_weekly'])
                        : $effective;
                }

                $rows[$user->id] = [
                    'weekly_minutes' => $hours['weekly'],
                    'location_weekly_minutes' => $hours['location_weekly'],
                    'average_day_minutes' => $hours['average_day'],
                    'current' => $current[$user->id],
                    'annual' => $annual,
                    'last_aligned_on' => $aligned[$user->id],
                ];
            }
        }

        return $rows;
    }
}
