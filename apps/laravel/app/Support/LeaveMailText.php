<?php

namespace App\Support;

use App\Enums\DayHalf;
use App\Enums\LeaveUnit;
use App\Models\LeaveRequest;

/**
 * Descrizione di una richiesta per le email, nella lingua corrente (date nel formato del destinatario).
 */
final class LeaveMailText
{
    /**
     * Tipo, periodo e, per mezze giornate e ore, la fascia: "Ferie, dal 26 ottobre 2026 al 30 ottobre 2026".
     */
    public static function describe(LeaveRequest $request): string
    {
        $locale = app()->getLocale();
        $from = $request->starts_on->locale($locale)->isoFormat('LL');
        $to = $request->ends_on->locale($locale)->isoFormat('LL');

        $period = $request->starts_on->equalTo($request->ends_on)
            ? Translate::text('leave.mail.on_day', ['date' => $from])
            : Translate::text('leave.mail.in_range', ['from' => $from, 'to' => $to]);

        $detail = match ($request->unit) {
            LeaveUnit::Days => '',
            LeaveUnit::HalfDay => ' ('.Translate::text('leave.mail.half.'.($request->half ?? DayHalf::Morning)->value).')',
            LeaveUnit::Hours => ' ('.Translate::text('leave.mail.hours', ['from' => (string) $request->starts_at, 'to' => (string) $request->ends_at]).')',
        };

        return $request->absenceType->displayName().', '.$period.$detail;
    }
}
