<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Users\AddUserScheduleRequest;
use App\Http\Resources\UserSchedulesResource;
use App\Http\Resources\WorkScheduleResource;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\WorkScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Orario personale (spec §4.4): solo admin (UserPolicy::manageSchedule). `{schedule}` è risolto dentro la persona.
 */
final class UserScheduleController extends Controller
{
    public function __construct(private readonly WorkScheduleService $schedules) {}

    public function index(User $user): UserSchedulesResource
    {
        $location = $user->location()->firstOrFail();
        $user->setRelation('location', $location);
        $versions = $user->schedules()->orderByDesc('valid_from')->get()
            ->each(fn (WorkSchedule $schedule) => $schedule->setRelation('user', $user));
        $locationSchedule = $this->schedules->currentForLocation($location);
        $locationSchedule?->setRelation('location', $location);

        return new UserSchedulesResource(['schedules' => $versions, 'location_schedule' => $locationSchedule]);
    }

    public function store(AddUserScheduleRequest $request, User $user): JsonResponse
    {
        $schedule = $this->schedules->addForUser(
            $user,
            $request->validFrom(),
            $request->followsLocation() ? null : $request->minutesList(),
            $this->actor($request),
        );
        $user->setRelation('location', $user->location()->firstOrFail());
        $schedule->setRelation('user', $user);

        return (new WorkScheduleResource($schedule))->response()->setStatusCode(HttpResponse::HTTP_CREATED);
    }

    public function destroy(Request $request, User $user, WorkSchedule $schedule): Response
    {
        $this->schedules->delete($schedule, $this->actor($request));

        return response()->noContent();
    }
}
