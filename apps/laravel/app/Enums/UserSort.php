<?php

namespace App\Enums;

/**
 * Ordinamenti della lista utenti (spec del 14/10, §3): la colonna, con il prefisso `-` per l'ordine decrescente.
 */
enum UserSort: string
{
    case Name = 'name';
    case NameDesc = '-name';
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
