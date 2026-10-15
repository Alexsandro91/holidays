<?php

namespace Tests\Feature\Locations;

use App\Support\Holidays\HolidayCalendars;
use App\Support\Holidays\ItalianHolidayCalendar;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class HolidayCalendarTest extends TestCase
{
    /**
     * @return array<string, array{int, string, string}>
     */
    public static function easters(): array
    {
        return [
            '2011, Pasquetta il 25 aprile' => [2011, '2011-04-24', '2011-04-25'],
            '2024, Pasqua in marzo' => [2024, '2024-03-31', '2024-04-01'],
            '2025' => [2025, '2025-04-20', '2025-04-21'],
            '2026' => [2026, '2026-04-05', '2026-04-06'],
            '2038, Pasqua il 25 aprile' => [2038, '2038-04-25', '2038-04-26'],
        ];
    }

    #[DataProvider('easters')]
    public function test_easter_and_easter_monday_fall_on_the_right_day(int $year, string $easter, string $easterMonday): void
    {
        $holidays = (new ItalianHolidayCalendar)->holidays($year);

        $this->assertContains('holidays.easter', $holidays[$easter]);
        $this->assertContains('holidays.easter_monday', $holidays[$easterMonday]);
    }

    public function test_two_holidays_on_the_same_day_are_both_listed(): void
    {
        $calendar = new ItalianHolidayCalendar;

        $this->assertSame(['holidays.liberation_day', 'holidays.easter_monday'], $calendar->holidays(2011)['2011-04-25']);
        $this->assertSame(['holidays.liberation_day', 'holidays.easter'], $calendar->holidays(2038)['2038-04-25']);
    }

    public function test_saint_francis_is_a_national_holiday_from_2026(): void
    {
        $calendar = new ItalianHolidayCalendar;

        $this->assertArrayNotHasKey('2025-10-04', $calendar->holidays(2025));
        $this->assertSame(['holidays.st_francis'], $calendar->holidays(2026)['2026-10-04']);
        $this->assertCount(12, $calendar->holidays(2025));
        $this->assertCount(13, $calendar->holidays(2026));
    }

    public function test_the_dates_are_sorted_and_every_label_is_translated(): void
    {
        app()->setLocale('it');
        $holidays = (new ItalianHolidayCalendar)->holidays(2026);

        $this->assertSame(array_keys($holidays), collect(array_keys($holidays))->sort()->values()->all());
        $this->assertSame('Ferragosto', __('holidays.assumption'));

        foreach (array_merge(...array_values($holidays)) as $key) {
            $this->assertNotSame($key, __($key));
        }
    }

    public function test_years_out_of_range_and_unknown_countries_are_refused(): void
    {
        foreach ([1999, 2101] as $year) {
            try {
                (new ItalianHolidayCalendar)->holidays($year);
                $this->fail("{$year}: expected InvalidArgumentException");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertInstanceOf(ItalianHolidayCalendar::class, HolidayCalendars::for('IT'));
        $this->expectException(InvalidArgumentException::class);
        HolidayCalendars::for('FR');
    }
}
