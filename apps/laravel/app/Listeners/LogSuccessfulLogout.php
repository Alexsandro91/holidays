<?php

namespace App\Listeners;

use App\Enums\AuthEventType;
use App\Models\User;
use App\Services\AuthEventLogger;
use Illuminate\Auth\Events\Logout;

final class LogSuccessfulLogout
{
    public function __construct(private readonly AuthEventLogger $events) {}

    public function handle(Logout $event): void
    {
        if ($event->user instanceof User) {
            $this->events->log(AuthEventType::LoggedOut, request(), $event->user);
        }
    }
}
