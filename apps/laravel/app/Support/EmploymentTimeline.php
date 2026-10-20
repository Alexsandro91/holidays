<?php

namespace App\Support;

use App\Enums\EmploymentType;
use App\Enums\UserHistoryEvent;
use App\Enums\UserStatus;
use App\Models\User;
use App\Models\UserHistory;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Stato del rapporto di una persona a un istante (spec §4.3), ricostruito all'indietro dallo stato attuale annullando
 * gli eventi successivi, dal più recente. Puro: gli eventi li carica chi lo chiama.
 */
final class EmploymentTimeline
{
    /**
     * @param  Collection<int, UserHistory>  $events  dal più recente
     */
    private function __construct(
        private readonly UserStatus $status,
        private readonly EmploymentType $employmentType,
        private readonly CarbonImmutable $createdAt,
        private readonly Collection $events,
    ) {}

    /**
     * @param  Collection<int, UserHistory>  $events  della persona, in qualunque ordine
     */
    public static function for(User $user, Collection $events): self
    {
        return new self(
            $user->status,
            $user->employment_type,
            CarbonImmutable::instance($user->created_at),
            // A parità di istante vale l'ordine di scrittura (id)
            $events->sort(fn (UserHistory $a, UserHistory $b): int => [$b->created_at, $b->id] <=> [$a->created_at, $a->id])->values(),
        );
    }

    /**
     * Dipendente attivo a quell'istante; prima della creazione la persona non esiste.
     */
    public function isActiveEmployeeAt(CarbonImmutable $instant): bool
    {
        if ($instant->lessThan($this->createdAt)) {
            return false;
        }

        $status = $this->status;
        $type = $this->employmentType;

        foreach ($this->events as $event) {
            if ($event->created_at->lessThanOrEqualTo($instant)) {
                break;
            }

            switch ($event->event) {
                case UserHistoryEvent::EmploymentTypeChanged:
                    $type = EmploymentType::tryFrom((string) $event->old_value) ?? $type;
                    break;
                case UserHistoryEvent::Activated:
                    $status = UserStatus::Invited;
                    break;
                case UserHistoryEvent::Disabled:
                    $status = UserStatus::Active;
                    break;
                case UserHistoryEvent::Enabled:
                    $status = UserStatus::Disabled;
                    break;
                default:
                    break;
            }
        }

        return $status === UserStatus::Active && $type === EmploymentType::Employee;
    }
}
