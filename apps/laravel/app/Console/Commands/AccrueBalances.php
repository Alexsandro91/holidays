<?php

namespace App\Console\Commands;

use App\Models\Location;
use App\Services\BalanceAccrualService;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Maturazione mensile dei saldi (spec §4.3): gira ogni giorno e matura il mese corrente per chi ne ha diritto e non
 * l'ha ancora. Con `--month` recupera a mano un mese passato (o il corrente), mai uno futuro.
 */
class AccrueBalances extends Command
{
    protected $signature = 'balances:accrue
        {--month= : Mese da maturare, YYYY-MM (di norma quello corrente)}';

    protected $description = 'Matura ferie, ROL ed ex festività del mese per chi ne ha diritto';

    public function handle(BalanceAccrualService $accruals): int
    {
        $now = CarbonImmutable::now();
        $currentMonth = $now->setTimezone(Location::DEFAULT_TIMEZONE)->startOfMonth();
        $option = $this->option('month');
        $month = $currentMonth;

        if ($option !== null) {
            $month = $this->parseMonth((string) $option);

            if ($month === null) {
                $this->error(Translate::text('balances.command.invalid_month'));

                return self::FAILURE;
            }

            if ($month->greaterThan($currentMonth)) {
                $this->error(Translate::text('balances.command.future_month'));

                return self::FAILURE;
            }
        }

        $period = $month->format('Y-m');
        $count = $accruals->accrue($month, $now);

        Log::info('Balances accrued', ['period' => $period, 'count' => $count]);
        $this->info(Translate::text('balances.command.accrued', ['count' => $count, 'period' => $period]));

        return self::SUCCESS;
    }

    /**
     * Primo giorno del mese nel fuso di riferimento, `null` se il formato non è `YYYY-MM`.
     */
    private function parseMonth(string $value): ?CarbonImmutable
    {
        if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $value) !== 1) {
            return null;
        }

        return CarbonImmutable::createFromFormat('!Y-m', $value, Location::DEFAULT_TIMEZONE) ?: null;
    }
}
