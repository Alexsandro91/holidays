<?php

namespace App\Listeners;

use Illuminate\Http\Client\Events\ConnectionFailed;
use Illuminate\Http\Client\Events\ResponseReceived;
use Illuminate\Support\Facades\Log;

/**
 * Log delle chiamate a HIBP. Se HIBP non risponde la password viene accettata (fail-open di Laravel):
 * il warning rende visibile quando il controllo è saltato.
 */
final class LogPwnedPasswordsRequest
{
    private const HOST = 'api.pwnedpasswords.com';

    private const CHANNEL = 'hibp';

    public function handle(ResponseReceived|ConnectionFailed $event): void
    {
        if (parse_url($event->request->url(), PHP_URL_HOST) !== self::HOST) {
            return;
        }

        if ($event instanceof ConnectionFailed) {
            Log::channel(self::CHANNEL)->warning('HIBP unreachable, password check skipped');

            return;
        }

        $context = ['status' => $event->response->status()];

        if ($event->response->successful()) {
            Log::channel(self::CHANNEL)->info('HIBP range query', $context);
        } else {
            Log::channel(self::CHANNEL)->warning('HIBP error, password check skipped', $context);
        }
    }
}
