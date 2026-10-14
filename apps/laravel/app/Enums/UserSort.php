<?php

namespace App\Enums;

/**
 * Ordinamenti della lista utenti (spec del 14/10, §7.2): la colonna, con il prefisso `-` per l'ordine decrescente.
 */
enum UserSort: string
{
    case FirstName = 'first_name';
    case FirstNameDesc = '-first_name';
    case LastName = 'last_name';
    case LastNameDesc = '-last_name';
    case Email = 'email';
    case EmailDesc = '-email';
    case Role = 'role';
    case RoleDesc = '-role';
    case Status = 'status';
    case StatusDesc = '-status';

    public function column(): string
    {
        return ltrim($this->value, '-');
    }

    public function direction(): string
    {
        return str_starts_with($this->value, '-') ? 'desc' : 'asc';
    }
}
