<?php

namespace App\Http\Controllers\Leave;

use App\Enums\LeaveRequestStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Leave\ProfileCalendarRequest;
use App\Http\Resources\LeaveRequestResource;
use App\Http\Resources\ProfileCalendarResource;
use App\Services\WorkCalendar;

/**
 * Calendario di chi è collegato (spec §6): giorni con minuti e motivi da `WorkCalendar::forUser` e le proprie
 * richieste che toccano l'intervallo, escluse quelle ritirate.
 */
final class ProfileCalendarController extends Controller
{
    public function __invoke(ProfileCalendarRequest $request, WorkCalendar $calendar): ProfileCalendarResource
    {
        $user = $this->actor($request);
        $from = $request->fromDate();
        $to = $request->toDate();

        $requests = $user->leaveRequests()
            ->where('status', '!=', LeaveRequestStatus::Withdrawn)
            ->where('starts_on', '<=', $to->toDateString())
            ->where('ends_on', '>=', $from->toDateString())
            ->with(LeaveRequestResource::RELATIONS)
            ->orderBy('starts_on')
            ->orderBy('id')
            ->get();

        return new ProfileCalendarResource([
            'days' => $calendar->forUser($user, $from, $to),
            'requests' => $requests,
        ]);
    }
}
