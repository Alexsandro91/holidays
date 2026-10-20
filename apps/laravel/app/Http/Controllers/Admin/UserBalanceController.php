<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Balances\AdjustBalanceRequest;
use App\Http\Requests\Balances\AlignBalancesRequest;
use App\Http\Requests\Balances\BalanceMovementsRequest;
use App\Http\Requests\Balances\BalancesAtRequest;
use App\Http\Requests\Balances\BalanceYearRequest;
use App\Http\Resources\BalanceAlignmentResource;
use App\Http\Resources\BalanceMovementResource;
use App\Http\Resources\BalancesAtResource;
use App\Http\Resources\BalanceSummaryResource;
use App\Models\User;
use App\Services\BalanceCorrectionService;
use App\Services\BalanceLedger;
use App\Services\BalanceSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

/**
 * Saldi di una persona per admin e responsabile (spec §6.2): vista con `viewBalances`, rettifiche e allineamenti con
 * `adjustBalances` (rotte). Sede e admin: policy e `{user}` (fuori sede 404).
 */
final class UserBalanceController extends Controller
{
    public function __construct(
        private readonly BalanceSummaryService $summaries,
        private readonly BalanceLedger $ledger,
        private readonly BalanceCorrectionService $corrections,
    ) {}

    public function summary(BalanceYearRequest $request, User $user): BalanceSummaryResource
    {
        $actor = $this->actor($request);

        return BalanceSummaryResource::of($this->summaries->summary($user, $request->year()), [
            'adjust' => $actor->can('adjustBalances', $user),
            'manage_accrual' => $actor->can('manageAccrual', $user),
        ]);
    }

    public function at(BalancesAtRequest $request, User $user): BalancesAtResource
    {
        $day = $request->day();

        return new BalancesAtResource(['date' => $day, ...$this->summaries->at($user, $day)]);
    }

    public function movements(BalanceMovementsRequest $request, User $user): AnonymousResourceCollection
    {
        return BalanceMovementResource::collection(
            $this->ledger->movements($user, $request->balance(), $request->yearFilter(), withActor: true),
        );
    }

    public function adjust(AdjustBalanceRequest $request, User $user): JsonResponse
    {
        $actor = $this->actor($request);
        $movement = $this->corrections->adjust($user, $request->balance(), $request->minutes(), $request->note(), $actor);
        $movement->setRelation('actor', $actor);

        return (new BalanceMovementResource($movement))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function align(AlignBalancesRequest $request, User $user): JsonResponse
    {
        $alignedOn = $request->alignedOn();
        $deltas = $this->corrections->align($user, $alignedOn, $request->values(), $request->note(), $this->actor($request));

        return (new BalanceAlignmentResource(['aligned_on' => $alignedOn, 'deltas' => $deltas]))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }
}
