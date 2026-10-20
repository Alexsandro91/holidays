<?php

namespace Database\Factories;

use App\Enums\DayHalf;
use App\Enums\LeaveRequestStatus;
use App\Enums\LeaveSource;
use App\Enums\LeaveUnit;
use App\Models\AbsenceType;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Per default ferie a giorni, in attesa, nel primo giorno feriale da domani. I minuti e i giorni sono quelli di una
 * settimana standard (lun-ven, 8 ore, nessun festivo): non passano dal calcolatore. Le righe di `leave_request_days`
 * si creano insieme alla richiesta. `for(User)` è quello di Laravel (relazione `user`, la sede segue la persona).
 *
 * @extends Factory<LeaveRequest>
 */
class LeaveRequestFactory extends Factory
{
    private const DAY_MINUTES = 480;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $day = CarbonImmutable::tomorrow();
        while ($day->isWeekend()) {
            $day = $day->addDay();
        }

        return [
            'user_id' => User::factory(),
            'absence_type_id' => fn (): int => AbsenceType::query()->where('code', 'vacation')->value('id'),
            'location_id' => fn (array $attributes): int => User::query()->findOrFail($attributes['user_id'])->location_id,
            'unit' => LeaveUnit::Days,
            'starts_on' => $day->toDateString(),
            'ends_on' => $day->toDateString(),
            'half' => null,
            'starts_at' => null,
            'ends_at' => null,
            'minutes' => 0,
            'working_days' => 0,
            'status' => LeaveRequestStatus::Pending,
            'note' => null,
            'decision_note' => null,
            'decided_by' => null,
            'decided_at' => null,
            'cancellation_requested_at' => null,
            'cancelled_by' => null,
            'cancelled_at' => null,
            'source' => LeaveSource::Request,
            'closure_id' => null,
        ];
    }

    public function configure(): static
    {
        return $this
            ->afterMaking(function (LeaveRequest $request): void {
                $days = $this->daysOf($request);
                $minutes = array_sum($days);
                $request->minutes = $minutes;
                $request->working_days = $this->workingDaysOf($days);
            })
            ->afterCreating(function (LeaveRequest $request): void {
                foreach ($this->daysOf($request) as $date => $minutes) {
                    $request->days()->forceCreate(['leave_request_id' => $request->id, 'date' => $date, 'minutes' => $minutes]);
                }
            });
    }

    public function approved(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => LeaveRequestStatus::Approved,
            'decided_at' => now(),
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => LeaveRequestStatus::Rejected,
            'decided_at' => now(),
        ]);
    }

    public function withdrawn(): static
    {
        return $this->state(fn (array $attributes): array => ['status' => LeaveRequestStatus::Withdrawn]);
    }

    public function cancellationRequested(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => LeaveRequestStatus::CancellationRequested,
            'decided_at' => now(),
            'cancellation_requested_at' => now(),
        ]);
    }

    public function cancelled(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => LeaveRequestStatus::Cancelled,
            'decided_at' => now(),
            'cancelled_at' => now(),
        ]);
    }

    public function ofType(AbsenceType $type): static
    {
        return $this->state(fn (array $attributes): array => ['absence_type_id' => $type->id]);
    }

    public function between(string $startsOn, string $endsOn): static
    {
        return $this->state(fn (array $attributes): array => [
            'unit' => LeaveUnit::Days,
            'starts_on' => $startsOn,
            'ends_on' => $endsOn,
        ]);
    }

    public function hours(string $day, string $from, string $to): static
    {
        return $this->state(fn (array $attributes): array => [
            'unit' => LeaveUnit::Hours,
            'starts_on' => $day,
            'ends_on' => $day,
            'half' => null,
            'starts_at' => $from,
            'ends_at' => $to,
        ]);
    }

    public function halfDay(string $day, DayHalf $half): static
    {
        return $this->state(fn (array $attributes): array => [
            'unit' => LeaveUnit::HalfDay,
            'starts_on' => $day,
            'ends_on' => $day,
            'half' => $half,
            'starts_at' => null,
            'ends_at' => null,
        ]);
    }

    /**
     * Minuti per giorno (`Y-m-d` => minuti) coerenti con l'unità dichiarata.
     *
     * @return array<string, int>
     */
    private function daysOf(LeaveRequest $request): array
    {
        if ($request->unit === LeaveUnit::Hours) {
            $minutes = (int) CarbonImmutable::parse((string) $request->starts_at)->diffInMinutes(CarbonImmutable::parse((string) $request->ends_at));

            return [$request->starts_on->toDateString() => $minutes];
        }

        if ($request->unit === LeaveUnit::HalfDay) {
            return [$request->starts_on->toDateString() => intdiv(self::DAY_MINUTES, 2)];
        }

        $days = [];
        for ($day = $request->starts_on; $day <= $request->ends_on; $day = $day->addDay()) {
            $days[$day->toDateString()] = $day->isWeekend() ? 0 : self::DAY_MINUTES;
        }

        return $days;
    }

    /**
     * @param  array<string, int>  $days
     */
    private function workingDaysOf(array $days): string
    {
        return number_format(array_sum($days) / self::DAY_MINUTES, 2, '.', '');
    }
}
