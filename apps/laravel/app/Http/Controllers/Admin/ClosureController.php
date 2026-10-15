<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\ClosureRequest;
use App\Http\Requests\Locations\ListClosuresRequest;
use App\Http\Resources\ClosureResource;
use App\Models\Closure as CompanyClosure;
use App\Services\ClosureService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Chiusure aziendali (spec §4.3): solo admin, lo garantiscono le rotte con LocationPolicy::manageClosures.
 */
final class ClosureController extends Controller
{
    /**
     * Le chiusure di un anno sono poche: un tetto contro le liste senza limite.
     */
    private const MAX_PER_YEAR = 500;

    public function __construct(private readonly ClosureService $closures) {}

    /**
     * Chiusure che toccano l'anno; con `filter[location]` quelle della sede più quelle di tutte le sedi.
     */
    public function index(ListClosuresRequest $request): AnonymousResourceCollection
    {
        $year = $request->integer('year');
        $locationId = $request->locationFilter();

        $closures = CompanyClosure::query()
            ->with('location:id,name')
            ->where('starts_on', '<=', "{$year}-12-31")
            ->where('ends_on', '>=', "{$year}-01-01")
            ->when($locationId !== null, fn (Builder $query) => $query->where(
                fn (Builder $inner) => $inner->whereNull('location_id')->orWhere('location_id', $locationId),
            ))
            ->orderBy('starts_on')
            ->orderBy('id')
            ->limit(self::MAX_PER_YEAR)
            ->get();

        return ClosureResource::collection($closures);
    }

    public function store(ClosureRequest $request): JsonResponse
    {
        $closure = $this->closures->create($request->closureData(), $this->actor($request));

        return (new ClosureResource($closure->load('location:id,name')))->response()->setStatusCode(HttpResponse::HTTP_CREATED);
    }

    public function update(ClosureRequest $request, CompanyClosure $closure): ClosureResource
    {
        return new ClosureResource($this->closures->update($closure, $request->closureData(), $this->actor($request))->load('location:id,name'));
    }

    public function destroy(Request $request, CompanyClosure $closure): Response
    {
        $this->closures->delete($closure, $this->actor($request));

        return response()->noContent();
    }
}
