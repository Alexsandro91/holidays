<?php

namespace App\Http\Controllers\Leave;

use App\Http\Controllers\Controller;
use App\Http\Requests\Leave\RejectLeaveRequest;
use App\Http\Resources\LeaveRequestResource;
use App\Models\LeaveRequest;
use App\Services\LeaveRequestService;
use Illuminate\Http\Request;

/**
 * Transizioni di una richiesta (spec §4, §6). Il permesso lo controllano le rotte (`withdraw`, `requestCancellation`,
 * `decide`); stato e "prima che inizi" li ricontrolla `LeaveRequestService` sotto lock (409).
 */
final class LeaveDecisionController extends Controller
{
    public function __construct(private readonly LeaveRequestService $requests) {}

    public function withdraw(Request $request, LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return $this->respond($this->requests->withdraw($leaveRequest, $this->actor($request)));
    }

    public function requestCancellation(Request $request, LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return $this->respond($this->requests->requestCancellation($leaveRequest, $this->actor($request)));
    }

    public function approve(Request $request, LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return $this->respond($this->requests->approve($leaveRequest, $this->actor($request)));
    }

    public function reject(RejectLeaveRequest $request, LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return $this->respond($this->requests->reject($leaveRequest, $this->actor($request), $request->note()));
    }

    public function approveCancellation(Request $request, LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return $this->respond($this->requests->approveCancellation($leaveRequest, $this->actor($request)));
    }

    public function rejectCancellation(Request $request, LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return $this->respond($this->requests->rejectCancellation($leaveRequest, $this->actor($request)));
    }

    public function cancel(Request $request, LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return $this->respond($this->requests->cancel($leaveRequest, $this->actor($request)));
    }

    private function respond(LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return new LeaveRequestResource($leaveRequest->load([...LeaveRequestResource::RELATIONS, 'days']));
    }
}
