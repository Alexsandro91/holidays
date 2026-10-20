<?php

namespace App\Support;

/**
 * Esito della maturazione di un mese: movimenti scritti e persone saltate per un errore (già segnalato e loggato).
 */
final readonly class AccrualRun
{
    public function __construct(
        public int $written,
        public int $failed,
    ) {}
}
