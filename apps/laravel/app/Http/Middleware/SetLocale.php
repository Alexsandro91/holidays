<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lingua della richiesta: preferenza dell'utente, poi Accept-Language, poi italiano.
 */
final class SetLocale
{
    /** @var list<string> */
    public const SUPPORTED = ['it', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $locale = $user instanceof User ? $user->locale : null;

        if (! in_array($locale, self::SUPPORTED, true)) {
            // Con lingue non supportate Symfony restituisce la prima della lista: 'it'
            $locale = $request->getPreferredLanguage(self::SUPPORTED) ?? self::SUPPORTED[0];
        }

        App::setLocale($locale);

        return $next($request);
    }
}
