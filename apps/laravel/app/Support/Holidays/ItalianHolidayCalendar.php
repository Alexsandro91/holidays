<?php

namespace App\Support\Holidays;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Festivi nazionali italiani (spec §2.5). Pasqua con l'algoritmo gregoriano anonimo (Meeus/Jones/Butcher).
 */
final class ItalianHolidayCalendar implements HolidayCalendar
{
    /**
     * Festivi a data fissa: mese-giorno → nome (chiave in lang/it/holidays.php e lang/en/holidays.php).
     *
     * @var array<string, string>
     */
    private const FIXED = [
        '01-01' => 'new_year',
        '01-06' => 'epiphany',
        '04-25' => 'liberation_day',
        '05-01' => 'labour_day',
        '06-02' => 'republic_day',
        '08-15' => 'assumption',
        '11-01' => 'all_saints',
        '12-08' => 'immaculate_conception',
        '12-25' => 'christmas',
        '12-26' => 'st_stephen',
    ];

    /**
     * San Francesco d'Assisi (4 ottobre) è di nuovo festa nazionale dal 2026.
     */
    private const ST_FRANCIS_FROM = 2026;

    public function holidays(int $year): array
    {
        if ($year < self::MIN_YEAR || $year > self::MAX_YEAR) {
            throw new InvalidArgumentException("Year {$year} is outside the supported range.");
        }

        $fixed = self::FIXED;

        if ($year >= self::ST_FRANCIS_FROM) {
            $fixed['10-04'] = 'st_francis';
        }

        $days = [];

        foreach ($fixed as $monthDay => $name) {
            $days["{$year}-{$monthDay}"][] = "holidays.{$name}";
        }

        // Dopo quelli fissi: nel giorno in comune il festivo civile viene prima (es. 2011-04-25)
        $easter = $this->easterSunday($year);
        $days[$easter->toDateString()][] = 'holidays.easter';
        $days[$easter->addDay()->toDateString()][] = 'holidays.easter_monday';

        ksort($days);

        return $days;
    }

    private function easterSunday(int $year): CarbonImmutable
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;

        return CarbonImmutable::create($year, $month, $day);
    }
}
