<?php

namespace App\Support;

use App\Enums\NonWorkingReason;
use Carbon\CarbonImmutable;

/**
 * Un giorno del calendario lavorativo: minuti di lavoro (0 se non lavorativo) e i motivi per cui non lo è.
 */
final readonly class WorkDay
{
    /**
     * @param  list<array{type: NonWorkingReason, label: string}>  $reasons
     */
    public function __construct(
        public CarbonImmutable $date,
        public int $minutes,
        public array $reasons,
    ) {}

    public function isWorking(): bool
    {
        return $this->minutes > 0 && $this->reasons === [];
    }
}
