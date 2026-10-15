<?php

namespace App\Support;

use App\Models\UserHistory;

/**
 * Una tappa pronta da mostrare: testo tradotto e, solo per lo staff, chi ha agito.
 */
final readonly class HistoryEntry
{
    public function __construct(
        public UserHistory $entry,
        public string $summary,
        public ?string $actorName,
    ) {}
}
