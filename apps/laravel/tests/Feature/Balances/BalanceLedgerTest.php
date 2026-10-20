<?php

namespace Tests\Feature\Balances;

use App\Enums\BalanceType;
use App\Models\BalanceMovement;
use App\Models\User;
use App\Services\BalanceLedger;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Lettura dei saldi (spec §5, §5.3): il saldo è la somma dei movimenti fino a una data.
 */
class BalanceLedgerTest extends TestCase
{
    use RefreshDatabase;

    private BalanceLedger $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00', 'Europe/Rome'));
        $this->ledger = app(BalanceLedger::class);
    }

    public function test_balance_at_sums_movements_up_to_the_date(): void
    {
        $user = User::factory()->create();
        BalanceMovement::factory()->for($user)->accrual('2026-09', 800)->create();
        BalanceMovement::factory()->for($user)->accrual('2026-10', 800)->create();
        BalanceMovement::factory()->for($user)->adjustment(-60)->create(['effective_on' => '2026-09-30']);
        BalanceMovement::factory()->for($user)->accrual('2026-10', 360)->create(['balance' => BalanceType::Rol]);
        // Un'altra persona non conta
        BalanceMovement::factory()->accrual('2026-09', 5000)->create();

        $this->assertSame(0, $this->ledger->balanceAt($user, BalanceType::Vacation, CarbonImmutable::parse('2026-08-31')));
        $this->assertSame(740, $this->ledger->balanceAt($user, BalanceType::Vacation, CarbonImmutable::parse('2026-09-30')));
        $this->assertSame(1540, $this->ledger->balanceAt($user, BalanceType::Vacation, CarbonImmutable::parse('2026-10-01')));
        $this->assertSame(
            ['vacation' => 1540, 'rol' => 360, 'ex_holidays' => 0],
            $this->ledger->balancesAt($user, CarbonImmutable::parse('2026-10-20')),
        );
    }

    public function test_year_summary_adds_up(): void
    {
        $user = User::factory()->create();
        // Residuo: 2400 dai movimenti del 2025
        BalanceMovement::factory()->for($user)->accrual('2025-11', 1600)->create();
        BalanceMovement::factory()->for($user)->accrual('2025-12', 800)->create();

        foreach (range(1, 10) as $month) {
            BalanceMovement::factory()->for($user)->accrual(sprintf('2026-%02d', $month), 800)->create();
        }

        BalanceMovement::factory()->for($user)->adjustment(-300)->create(['effective_on' => '2026-06-10']);
        BalanceMovement::factory()->for($user)->alignment('2026-09-30', 120, 9420)->create();

        $summary = $this->ledger->yearSummary($user, 2026, CarbonImmutable::parse('2026-10-20'))['vacation'];

        $this->assertSame(2400, $summary->opening);
        $this->assertSame(8000, $summary->accrued);
        $this->assertSame(0, $summary->used);
        $this->assertSame(-180, $summary->corrections);
        $this->assertSame(10220, $summary->closing);
        $this->assertSame($summary->closing, $summary->opening + $summary->accrued + $summary->used + $summary->corrections);
        $this->assertSame(10220, $this->ledger->balanceAt($user, BalanceType::Vacation, CarbonImmutable::parse('2026-10-20')));
    }

    public function test_past_year_closes_at_december_31(): void
    {
        $user = User::factory()->create();
        BalanceMovement::factory()->for($user)->accrual('2024-12', 500)->create();
        BalanceMovement::factory()->for($user)->accrual('2025-03', 800)->create();
        BalanceMovement::factory()->for($user)->adjustment(100)->create(['effective_on' => '2025-12-31']);
        BalanceMovement::factory()->for($user)->accrual('2026-01', 800)->create();

        $summary = $this->ledger->yearSummary($user, 2025, CarbonImmutable::parse('2026-10-20'));

        $this->assertSame(500, $summary['vacation']->opening);
        $this->assertSame(800, $summary['vacation']->accrued);
        $this->assertSame(100, $summary['vacation']->corrections);
        $this->assertSame(1400, $summary['vacation']->closing);
        $this->assertSame(0, $summary['rol']->closing);
    }

    public function test_current_for_uses_one_query(): void
    {
        $count = function (int $people): int {
            $users = User::factory()->count($people)->create();
            $users->each(fn (User $user) => BalanceMovement::factory()->for($user)->accrual('2026-10', 800)->create());
            // Un movimento futuro non conta nel saldo attuale
            BalanceMovement::factory()->for($users->first())->adjustment(50)->create(['effective_on' => '2026-10-21']);

            DB::flushQueryLog();
            DB::enableQueryLog();
            $current = $this->ledger->currentFor($users, CarbonImmutable::parse('2026-10-20'));
            DB::disableQueryLog();

            $this->assertCount($people, $current);
            $this->assertSame(['vacation' => 800, 'rol' => 0, 'ex_holidays' => 0], $current[$users->first()->id]);

            return count(DB::getQueryLog());
        };

        $this->assertSame(1, $count(5));
        $this->assertSame(1, $count(50));
    }
}
