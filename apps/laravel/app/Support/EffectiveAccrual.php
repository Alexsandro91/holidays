<?php

namespace App\Support;

use App\Enums\BalanceType;

/**
 * Valori annui in vigore per una persona o una sede (spec §4.1): per ogni saldo i minuti e il livello da cui
 * vengono (`company`, `location` o `user`).
 */
final readonly class EffectiveAccrual
{
    /**
     * @param  array<string, array{minutes: int, source: 'company'|'location'|'user'}>  $values  indicizzato per `BalanceType->value`
     */
    public function __construct(public array $values) {}

    public function minutes(BalanceType $balance): int
    {
        return $this->values[$balance->value]['minutes'];
    }

    /**
     * @return 'company'|'location'|'user'
     */
    public function source(BalanceType $balance): string
    {
        return $this->values[$balance->value]['source'];
    }
}
