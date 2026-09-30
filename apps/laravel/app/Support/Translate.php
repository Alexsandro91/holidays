<?php

namespace App\Support;

/**
 * Traduzione garantita come stringa: `__()` può restituire un array se la chiave punta a un gruppo.
 */
final class Translate
{
    /**
     * @param  array<string, string|int>  $replace
     */
    public static function text(string $key, array $replace = []): string
    {
        $value = __($key, $replace);

        return is_string($value) ? $value : $key;
    }
}
