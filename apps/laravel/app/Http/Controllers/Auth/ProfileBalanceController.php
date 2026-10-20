<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Balances\BalanceMovementsRequest;
use App\Http\Requests\Balances\BalanceYearRequest;
use App\Http\Resources\BalanceMovementResource;
use App\Http\Resources\BalanceSummaryResource;
use App\Services\BalanceLedger;
use App\Services\BalanceSummaryService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Saldi di chi è collegato (spec §6.2): nessuna azione possibile e movimenti senza chi ha agito, come lo storico.
 */
final class ProfileBalanceController extends Controller
{
    public function __construct(
        private readonly BalanceSummaryService $summaries,
        private readonly BalanceLedger $ledger,
    ) {}

    public function summary(BalanceYearRequest $request): BalanceSummaryResource
    {
        return BalanceSummaryResource::of(
            $this->summaries->summary($this->actor($request), $request->year()),
            ['adjust' => false, 'manage_accrual' => false],
        );
    }

    public function movements(BalanceMovementsRequest $request): AnonymousResourceCollection
    {
        return BalanceMovementResource::collection(
            $this->ledger->movements($this->actor($request), $request->balance(), $request->yearFilter(), withActor: false),
        );
    }
}
