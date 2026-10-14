<?php

namespace App\Services\Concerns;

use App\Models\User;
use App\Support\Translate;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Secondo controllo dei permessi dentro la transazione, sulle righe rilette: la policy della rotta ha visto
 * attore e destinatario prima che un'altra richiesta potesse cambiarli (spec del 14/10, §2).
 */
trait RechecksUserPermissions
{
    /**
     * Chi agisce, riletto: deve esistere, essere attivo e poter ancora gestire gli utenti (altrimenti 403).
     */
    private function ensureStillManagesUsers(?User $freshActor): User
    {
        if ($freshActor === null || ! $freshActor->isActive() || Gate::forUser($freshActor)->denies('viewAny', User::class)) {
            throw new AuthorizationException(Translate::text('users.no_longer_allowed'));
        }

        return $freshActor;
    }

    /**
     * Permesso sul destinatario riletto: se ora è negato, è cambiata la situazione del destinatario (409).
     */
    private function ensureStillAllowed(string $ability, User $freshActor, User $freshTarget): void
    {
        if (Gate::forUser($freshActor)->denies($ability, $freshTarget)) {
            throw new ConflictHttpException(Translate::text('users.state_changed'));
        }
    }
}
