<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\ListLocationsRequest;
use App\Http\Requests\Locations\StoreLocationRequest;
use App\Http\Requests\Locations\UpdateLocationRequest;
use App\Http\Resources\LocationOptionResource;
use App\Http\Resources\LocationResource;
use App\Models\Location;
use App\Services\LocationService;
use App\Services\WorkScheduleService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sezione Sedi (spec §4.2, §5.2): solo admin, lo garantiscono le rotte con LocationPolicy.
 */
final class LocationController extends Controller
{
    private const PER_PAGE = 25;

    /**
     * Le sedi sono poche: le select ne ricevono al massimo 500.
     */
    private const OPTIONS_LIMIT = 500;

    public function __construct(
        private readonly LocationService $locations,
        private readonly WorkScheduleService $schedules,
    ) {}

    public function index(ListLocationsRequest $request): AnonymousResourceCollection
    {
        $locations = Location::query()
            ->when(
                $request->wantsArchived(),
                fn (Builder $query) => $query->whereNotNull('archived_at'),
                fn (Builder $query) => $query->whereNull('archived_at'),
            )
            ->withCount($this->counts())
            ->orderBy('name', $request->sortDirection())
            ->orderBy('id')
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        return LocationResource::collection($locations)->additional(['meta' => ['counts' => [
            'active' => Location::query()->active()->count(),
            'archived' => Location::query()->whereNotNull('archived_at')->count(),
        ]]]);
    }

    public function options(): AnonymousResourceCollection
    {
        return LocationOptionResource::collection(Location::query()->active()->orderBy('name')->orderBy('id')->limit(self::OPTIONS_LIMIT)->get());
    }

    public function store(StoreLocationRequest $request): JsonResponse
    {
        $location = $this->locations->create($request->locationData(), $this->actor($request));

        return (new LocationResource($this->detailed($location)))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Location $location): LocationResource
    {
        return new LocationResource($this->detailed($location));
    }

    public function update(UpdateLocationRequest $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->update($location, $request->locationData(), $this->actor($request))));
    }

    public function primary(Request $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->makePrimary($location, $this->actor($request))));
    }

    public function archive(Request $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->archive($location, $this->actor($request))));
    }

    public function restore(Request $request, Location $location): LocationResource
    {
        return new LocationResource($this->detailed($this->locations->restore($location, $this->actor($request))));
    }

    /**
     * Persone in qualunque stato e responsabili attivi (avviso "Nessun responsabile", spec §5.2).
     *
     * @return array<int|string, mixed>
     */
    private function counts(): array
    {
        return [
            'users',
            'users as managers_count' => fn (Builder $query) => $query->where('role', Role::Manager)->where('status', UserStatus::Active),
        ];
    }

    /**
     * Conteggi e orario in vigore oggi nel fuso della sede, con la sede già impostata sulla versione (niente query
     * nella resource).
     */
    private function detailed(Location $location): Location
    {
        $location->loadCount($this->counts());
        $schedule = $this->schedules->currentForLocation($location);
        $schedule?->setRelation('location', $location);

        return $location->setRelation('currentSchedule', $schedule);
    }
}
