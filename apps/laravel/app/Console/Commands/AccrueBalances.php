<?php

namespace App\Console\Commands;

use App\Models\Location;
use App\Services\BalanceAccrualService;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Maturazione mensile dei saldi (spec §4.3): gira ogni giorno e matura il mese precedente e il corrente per chi ne ha
 * diritto e non li ha ancora. Il mese precedente si riprende con le regole di `--month` (punti di controllo il 1° e il
 * 16, fermo davanti a un allineamento datato dal suo 1° in poi): così uno scheduler fermo a cavallo di due mesi non fa
 * perdere il mese a chi è entrato tra l'ultimo giro e il 16. Con `--month` recupera a mano un solo mese passato (o il
 * corrente), mai uno futuro.
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
        $months = [$currentMonth->subMonthNoOverflow(), $currentMonth];

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

            $months = [$month];
        }

        $failed = 0;

        foreach ($months as $month) {
            $failed += $this->accrueMonth($accruals, $month, $now);
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Matura un mese, ne logga e stampa il conteggio; restituisce le persone fallite.
     */
    private function accrueMonth(BalanceAccrualService $accruals, CarbonImmutable $month, CarbonImmutable $now): int
    {
        $period = $month->format('Y-m');
        $run = $accruals->accrue($month, $now);

        Log::info('Balances accrued', ['period' => $period, 'count' => $run->written, 'failed' => $run->failed]);
        $this->info(Translate::text('balances.command.accrued', ['count' => $run->written, 'period' => $period]));

        if ($run->failed > 0) {
            // Ogni errore è già segnalato e loggato per persona: qui solo il totale, e il comando risulta fallito
            $this->error(Translate::text('balances.command.failed', ['count' => $run->failed, 'period' => $period]));
        }

        return $run->failed;
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
