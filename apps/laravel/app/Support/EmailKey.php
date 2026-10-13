<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Email normalizzata per le chiavi dei limiti ai tentativi.
 */
final class EmailKey
{
    /**
     * Minuscole, senza spazi e senza accenti: il database confronta le email con una collation che ignora gli accenti
     * (`émployee@…` trova `employee@…`), quindi le varianti devono finire nello stesso contatore.
     * Input non stringa (es. email[]=…) trattato come vuoto: niente errori di conversione.
     */
    public static function from(mixed $email): string
    {
        return is_string($email) ? Str::ascii(Str::lower(trim($email))) : '';
    }
}
