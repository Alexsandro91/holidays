<?php

namespace App\Http\Controllers\Leave;

use App\Http\Controllers\Controller;
use App\Http\Requests\Leave\LeaveDraftRequest;
use App\Http\Requests\Leave\MyLeaveRequestsRequest;
use App\Http\Resources\LeavePreviewResource;
use App\Http\Resources\LeaveRequestResource;
use App\Models\LeaveRequest;
use App\Services\LeaveRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Richieste di assenza per sé (spec §6): le mie, anteprima, creazione e dettaglio. Il dettaglio lo vedono anche gli
 * approvatori (`LeaveRequestPolicy::view`); chi è fuori sede riceve 404 dalla risoluzione di `{leaveRequest}`.
 */
final class LeaveRequestController extends Controller
{
    public const PER_PAGE = 20;

    public function __construct(private readonly LeaveRequestService $requests) {}

    /**
     * Le proprie richieste in tutti gli stati, dalla più recente; con l'anno, quelle che lo toccano.
     */
    public function index(MyLeaveRequestsRequest $request): AnonymousResourceCollection
    {
        $year = $request->year();

        $page = $this->actor($request)->leaveRequests()
            ->when($year !== null, fn ($query) => $query
                ->where('starts_on', '<=', "{$year}-12-31")
                ->where('ends_on', '>=', "{$year}-01-01"))
            ->with(LeaveRequestResource::RELATIONS)
            ->orderByDesc('starts_on')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE);

        return LeaveRequestResource::collection($page);
    }

    public function preview(LeaveDraftRequest $request): LeavePreviewResource
    {
        return new LeavePreviewResource($this->requests->preview($request->draft()));
    }

    public function store(LeaveDraftRequest $request): JsonResponse
    {
        $leaveRequest = $this->requests->create($request->draft(), $request->note());

        return (new LeaveRequestResource($leaveRequest->load(LeaveRequestResource::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function show(LeaveRequest $leaveRequest): LeaveRequestResource
    {
        return new LeaveRequestResource($leaveRequest->load([...LeaveRequestResource::RELATIONS, 'days']));
    }
}
