<?php

namespace App\Enums;

/**
 * Motivo leggibile dalla macchina nelle risposte di errore della sessione (`meta.reason`).
 * Contratto fisso col frontend: i valori non vanno cambiati.
 */
enum AuthErrorReason: string
{
    /** 401: l'account è stato disattivato mentre la sessione era aperta. */
    case AccountDisabled = 'account_disabled';

    /** 401: la sessione ha superato la durata massima dal login. */
    case SessionExpired = 'session_expired';

    /** 409: una rotta riservata agli ospiti chiamata con una sessione già aperta. */
    case AlreadyAuthenticated = 'already_authenticated';
}
