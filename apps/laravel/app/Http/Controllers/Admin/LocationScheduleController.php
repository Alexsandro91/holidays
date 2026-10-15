<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\AddLocationScheduleRequest;
use App\Http\Resources\WorkScheduleResource;
use App\Models\Location;
use App\Models\WorkSchedule;
use App\Services\WorkScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Versioni dell'orario standard di una sede (spec §4.2). `{schedule}` è risolto dentro la sede (scopeBindings).
 */
final class LocationScheduleController extends Controller
{
    public function __construct(private readonly WorkScheduleService $schedules) {}

    public function index(Location $location): AnonymousResourceCollection
    {
        $versions = $location->schedules()->orderByDesc('valid_from')->get()
            ->each(fn (WorkSchedule $schedule) => $schedule->setRelation('location', $location));

        return WorkScheduleResource::collection($versions);
    }

    public function store(AddLocationScheduleRequest $request, Location $location): JsonResponse
    {
        $schedule = $this->schedules->addForLocation($location, $request->validFrom(), $request->minutesList(), $this->actor($request));
        $schedule->setRelation('location', $location);

        return (new WorkScheduleResource($schedule))->response()->setStatusCode(HttpResponse::HTTP_CREATED);
    }

    public function destroy(Request $request, Location $location, WorkSchedule $schedule): Response
    {
        $this->schedules->delete($schedule, $this->actor($request));

        return response()->noContent();
    }
}
