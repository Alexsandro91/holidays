<?php

namespace App\Services;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\User;
use App\Models\UserHistory;

/**
 * Unico punto che scrive lo storico (spec §8.2): i servizi lo chiamano dentro la stessa transazione della modifica,
 * così una modifica annullata non lascia tappe. Un cambio verso lo stesso valore non scrive nulla.
 */
final class UserHistoryRecorder
{
    public function invited(User $user, ?User $actor): void
    {
        $this->write($user, UserHistoryEvent::Invited, $actor, context: [
            'role' => $user->role->value,
            'employment_type' => $user->employment_type->value,
            'location_id' => $user->location_id,
        ]);
    }

    /**
     * Invito accettato: l'autore è la persona stessa.
     */
    public function activated(User $user): void
    {
        $this->write($user, UserHistoryEvent::Activated, $user);
    }

    public function roleChanged(User $user, Role $from, Role $to, ?User $actor): void
    {
        if ($from !== $to) {
            $this->write($user, UserHistoryEvent::RoleChanged, $actor, $from->value, $to->value);
        }
    }

    public function employmentTypeChanged(User $user, EmploymentType $from, EmploymentType $to, ?User $actor): void
    {
        if ($from !== $to) {
            $this->write($user, UserHistoryEvent::EmploymentTypeChanged, $actor, $from->value, $to->value);
        }
    }

    /**
     * Si salvano gli id: lo storico mostra il nome attuale della sede (spec §8.2).
     */
    public function locationChanged(User $user, int $fromLocationId, int $toLocationId, ?User $actor): void
    {
        if ($fromLocationId !== $toLocationId) {
            $this->write($user, UserHistoryEvent::LocationChanged, $actor, (string) $fromLocationId, (string) $toLocationId);
        }
    }

    public function disabled(User $user, ?User $actor): void
    {
        $this->write($user, UserHistoryEvent::Disabled, $actor);
    }

    public function enabled(User $user, ?User $actor): void
    {
        $this->write($user, UserHistoryEvent::Enabled, $actor);
    }

    /**
     * @param  array<string, string|int>|null  $context
     */
    private function write(User $user, UserHistoryEvent $event, ?User $actor, ?string $oldValue = null, ?string $newValue = null, ?array $context = null): void
    {
        (new UserHistory)->forceFill([
            'user_id' => $user->id,
            'event' => $event,
            'old_value' => $oldValue,
            'new_value' => $newValue,
            'context' => $context,
            'actor_id' => $actor?->id,
        ])->save();
    }
}
