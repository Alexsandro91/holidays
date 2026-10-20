<?php

namespace App\Support;

use App\Enums\DayHalf;
use App\Enums\LeaveUnit;
use App\Models\AbsenceType;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Bozza di una richiesta di assenza, già validata nella forma dalla FormRequest: le regole che dipendono da calendario
 * e ora le applica `LeaveCalculator`. `startsAt` ed `endsAt` sono orari `H:i`, solo per l'unità `hours`.
 */
final readonly class LeaveDraft
{
    public function __construct(
        public User $user,
        public AbsenceType $type,
        public LeaveUnit $unit,
        public CarbonImmutable $startsOn,
        public CarbonImmutable $endsOn,
        public ?DayHalf $half = null,
        public ?string $startsAt = null,
        public ?string $endsAt = null,
    ) {}
}
