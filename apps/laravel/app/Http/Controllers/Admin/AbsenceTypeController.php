<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\AbsenceTypes\AbsenceTypeRequest;
use App\Http\Requests\AbsenceTypes\ListAbsenceTypesRequest;
use App\Http\Requests\AbsenceTypes\ReorderAbsenceTypesRequest;
use App\Http\Resources\AbsenceTypeResource;
use App\Models\AbsenceType;
use App\Services\AbsenceTypeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response as HttpResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tipi di assenza (spec §3.3): solo admin, lo garantiscono le rotte con AbsenceTypePolicy.
 */
final class AbsenceTypeController extends Controller
{
    /**
     * Non paginata: i tipi sono pochi.
     */
    private const LIMIT = 200;

    public function __construct(private readonly AbsenceTypeService $types) {}

    public function index(ListAbsenceTypesRequest $request): AnonymousResourceCollection
    {
        $types = AbsenceType::query()
            ->when(
                $request->wantsArchived(),
                fn ($query) => $query->whereNotNull('archived_at'),
                fn ($query) => $query->active(),
            )
            ->withCount('enabledUsers')
            ->ordered()
            ->limit(self::LIMIT)
            ->get();

        return AbsenceTypeResource::collection($types)->additional(['meta' => ['counts' => [
            'active' => AbsenceType::query()->active()->count(),
            'archived' => AbsenceType::query()->whereNotNull('archived_at')->count(),
        ]]]);
    }

    public function store(AbsenceTypeRequest $request): JsonResponse
    {
        $type = $this->types->create($request->typeData(), $this->actor($request));

        return (new AbsenceTypeResource($type))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function update(AbsenceTypeRequest $request, AbsenceType $absenceType): AbsenceTypeResource
    {
        return new AbsenceTypeResource($this->types->update($absenceType, $request->typeData(), $this->actor($request)));
    }

    public function archive(Request $request, AbsenceType $absenceType): AbsenceTypeResource
    {
        return new AbsenceTypeResource($this->types->archive($absenceType, $this->actor($request)));
    }

    public function restore(Request $request, AbsenceType $absenceType): AbsenceTypeResource
    {
        return new AbsenceTypeResource($this->types->restore($absenceType, $this->actor($request)));
    }

    public function order(ReorderAbsenceTypesRequest $request): HttpResponse
    {
        $this->types->reorder($request->ids(), $this->actor($request));

        return response()->noContent();
    }
}
