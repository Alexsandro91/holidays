<?php

namespace App\Support;

/**
 * Descrizione leggibile del dispositivo ("Chrome su macOS") per le email di sicurezza.
 */
final class UserAgentSummary
{
    public static function describe(?string $userAgent): string
    {
        $agent = (string) $userAgent;

        $browser = match (true) {
            str_contains($agent, 'Edg/') => 'Edge',
            str_contains($agent, 'Firefox/') => 'Firefox',
            str_contains($agent, 'Chrome/') => 'Chrome',
            str_contains($agent, 'Safari/') => 'Safari',
            default => Translate::text('login.unknown_browser'),
        };

        $os = match (true) {
            str_contains($agent, 'iPhone'), str_contains($agent, 'iPad') => 'iOS',
            str_contains($agent, 'Mac OS X') => 'macOS',
            str_contains($agent, 'Windows') => 'Windows',
            str_contains($agent, 'Android') => 'Android',
            str_contains($agent, 'Linux') => 'Linux',
            default => Translate::text('login.unknown_os'),
        };

        return Translate::text('login.device', ['browser' => $browser, 'os' => $os]);
    }
}
