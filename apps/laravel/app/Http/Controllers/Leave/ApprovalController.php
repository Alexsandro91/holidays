<?php

namespace App\Http\Controllers\Leave;

use App\Http\Controllers\Controller;
use App\Http\Requests\Leave\ListApprovalsRequest;
use App\Http\Resources\LeaveRequestResource;
use App\Services\LeaveApprovers;
use App\Services\LeaveAvailability;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Da approvare (spec §6): richieste e annullamenti in attesa che l'attore può decidere, dalla più vecchia, con gli
 * avvisi calcolati al momento. L'ordine segue l'ingresso in coda (creazione o richiesta di annullamento).
 */
final class ApprovalController extends Controller
{
    public const LIMIT = 200;

    public function __construct(
        private readonly LeaveApprovers $approvers,
        private readonly LeaveAvailability $availability,
    ) {}

    public function index(ListApprovalsRequest $request): AnonymousResourceCollection
    {
        $location = $request->locationFilter();

        $query = $this->approvers->pendingQuery($this->actor($request))
            ->when($location !== null, fn ($query) => $query->whereHas('user', fn ($user) => $user->where('location_id', $location)));

        $count = (clone $query)->count();

        $requests = $query
            ->with(LeaveRequestResource::RELATIONS)
            // In coda da quando l'elemento è entrato: un annullamento dal momento in cui è stato chiesto
            ->orderByRaw('COALESCE(cancellation_requested_at, created_at)')
            ->orderBy('id')
            ->limit(self::LIMIT)
            ->get();

        // Gli avvisi non si salvano: sono un attributo della sola risposta, impostato dopo l'ultima lettura
        $warnings = $this->availability->warningsForRequests($requests);
        foreach ($requests as $leaveRequest) {
            $leaveRequest->setAttribute('warnings', $warnings[$leaveRequest->id]);
        }

        return LeaveRequestResource::collection($requests)->additional(['meta' => ['count' => $count]]);
    }
}
