<?php

namespace App\Support;

/**
 * Risultato del calcolo di una richiesta: i giorni con i minuti scalati (anche quelli a 0), il totale e i giorni contati.
 */
final readonly class LeaveComputation
{
    /**
     * @param  list<array{date: string, minutes: int}>  $days
     */
    public function __construct(
        public array $days,
        public int $minutes,
        public float $workingDays,
    ) {}

    /**
     * Minuti per mese di calendario (spec §3.3): chiave `YYYY-MM`, primo giorno con minuti del mese e loro somma.
     * I mesi senza minuti non compaiono.
     *
     * @return array<string, array{first_day: string, minutes: int}>
     */
    public function minutesByMonth(): array
    {
        $months = [];

        foreach ($this->days as $day) {
            if ($day['minutes'] <= 0) {
                continue;
            }

            $month = substr($day['date'], 0, 7);
            $months[$month] ??= ['first_day' => $day['date'], 'minutes' => 0];
            $months[$month]['minutes'] += $day['minutes'];
        }

        return $months;
    }
}
