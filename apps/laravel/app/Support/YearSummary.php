<?php

namespace App\Support;

/**
 * Riepilogo di un saldo in un anno (spec §5.3), in minuti: residuo al 1° gennaio, maturato, usato, correzioni
 * (rettifiche e allineamenti) e saldo. Residuo + maturato + usato + correzioni = saldo.
 */
final readonly class YearSummary
{
    public function __construct(
        public int $opening,
        public int $accrued,
        public int $used,
        public int $corrections,
        public int $closing,
    ) {}
}
