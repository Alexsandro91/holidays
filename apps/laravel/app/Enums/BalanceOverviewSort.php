<?php

namespace App\Enums;

/**
 * Ordinamenti della pagina Saldi: per nome (cognome, poi nome) o per sede, con `-` per l'ordine decrescente.
 */
enum BalanceOverviewSort: string
{
    case Name = 'name';
    case NameDesc = '-name';
    case Location = 'location';
    case LocationDesc = '-location';

    public function direction(): string
    {
        return str_starts_with($this->value, '-') ? 'desc' : 'asc';
    }

    public function byLocation(): bool
    {
        return in_array($this, [self::Location, self::LocationDesc], true);
    }
}
