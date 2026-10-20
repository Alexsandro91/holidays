<?php

namespace App\Services;

use App\Enums\AbsenceDayCount;
use App\Enums\DayHalf;
use App\Enums\LeaveRequestStatus;
use App\Enums\LeaveSource;
use App\Enums\LeaveUnit;
use App\Models\AbsenceType;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestDay;
use App\Models\Location;
use App\Models\User;
use App\Support\LeaveComputation;
use App\Support\LeaveDraft;
use App\Support\Translate;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Unico servizio delle richieste di assenza (spec §4, §5). Le regole che dipendono da calendario, ora o dati (tipo
 * richiedibile, giorni lavorativi, sovrapposizione) stanno qui; quelle sulla sola forma dell'input nella FormRequest.
 * Le scritture bloccano la riga dell'utente: due richieste insieme si accodano e la seconda vede la prima.
 */
final class LeaveRequestService
{
    /**
     * Tentativi della transazione: un deadlock si ripete da capo, rileggendo tutto sotto blocco.
     */
    private const TRANSACTION_ATTEMPTS = 3;

    public function __construct(
        private readonly LeaveCalculator $calculator,
        private readonly LeaveAvailability $availability,
        private readonly LeaveUsageWriter $usage,
        private readonly BalanceLedger $ledger,
        private readonly WorkScheduleService $schedules,
    ) {}

    /**
     * Anteprima senza scritture: giorni, minuti, saldo (se il tipo ne ha uno) e avvisi. Stessi controlli della
     * creazione, senza lock.
     *
     * @return array{computation: LeaveComputation, balance: ?array{balance: string, current_minutes: int, available_minutes: int, after_minutes: int}, warnings: list<array{code: string, params: array<string, int|float|string>}>}
     *
     * @throws ValidationException
     */
    public function preview(LeaveDraft $draft): array
    {
        $computation = $this->validate($draft);

        return [
            'computation' => $computation,
            'balance' => $this->balance($draft, $computation),
            'warnings' => $this->availability->warnings($draft, $computation),
        ];
    }

    /**
     * Crea la richiesta per chi la chiede. I tipi senza approvazione nascono approvati, senza chi ha deciso, e
     * scalano subito il saldo. Gli avvisi restano in `warnings` (non persistiti).
     *
     * @throws ValidationException
     */
    public function create(LeaveDraft $draft, ?string $note): LeaveRequest
    {
        [$request, $warnings] = DB::transaction(function () use ($draft, $note): array {
            // Blocca la riga della persona prima dei controlli: due richieste insieme non si sovrappongono
            /** @var User $user */
            $user = User::query()->whereKey($draft->user->id)->lockForUpdate()->firstOrFail();

            $computation = $this->validate($draft);
            // Prima di inserire: la nuova richiesta non conta tra quelle in attesa
            $warnings = $this->availability->warnings($draft, $computation);
            $approved = ! $draft->type->requires_approval;

            $request = new LeaveRequest;
            $request->forceFill([
                'user_id' => $user->id,
                'absence_type_id' => $draft->type->id,
                // Sede al momento della richiesta (snapshot)
                'location_id' => $user->location_id,
                'unit' => $draft->unit,
                'starts_on' => $draft->startsOn->toDateString(),
                'ends_on' => $draft->endsOn->toDateString(),
                'half' => $draft->unit === LeaveUnit::HalfDay ? $draft->half : null,
                'starts_at' => $draft->unit === LeaveUnit::Hours ? $draft->startsAt : null,
                'ends_at' => $draft->unit === LeaveUnit::Hours ? $draft->endsAt : null,
                'minutes' => $computation->minutes,
                'working_days' => $computation->workingDays,
                'status' => $approved ? LeaveRequestStatus::Approved : LeaveRequestStatus::Pending,
                'note' => $note,
                'decided_by' => null,
                'decided_at' => $approved ? now() : null,
                'source' => LeaveSource::Request,
            ])->save();

            LeaveRequestDay::query()->insert(array_map(fn (array $day): array => [
                'leave_request_id' => $request->id,
                'date' => $day['date'],
                'minutes' => $day['minutes'],
            ], $computation->days));

            if ($approved) {
                // Approvata dal sistema: nessuno ha deciso, nessuno ha agito sul saldo
                $this->usage->charge($request, null);
            }

            return [$request, $warnings];
        }, self::TRANSACTION_ATTEMPTS);

        Log::info('Leave request created', [
            'leave_request_id' => $request->id,
            'user_id' => $request->user_id,
            'absence_type_id' => $request->absence_type_id,
            'unit' => $request->unit->value,
            'starts_on' => $request->starts_on->toDateString(),
            'ends_on' => $request->ends_on->toDateString(),
            'minutes' => $request->minutes,
            'status' => $request->status->value,
            'warnings' => array_column($warnings, 'code'),
        ]);

        // Attributo solo per la risposta: si imposta dopo l'ultimo salvataggio
        $request->setAttribute('warnings', $warnings);

        return $request;
    }

    /**
     * Tipo richiedibile, unità permessa, calcolo dei minuti e sovrapposizione, in quest'ordine.
     *
     * @throws ValidationException
     */
    private function validate(LeaveDraft $draft): LeaveComputation
    {
        $this->ensureRequestable($draft->user, $draft->type);
        $this->ensureUnitAllowed($draft->type, $draft->unit);
        $computation = $this->calculator->compute($draft);
        $this->ensureNoOverlap($draft, $computation);

        return $computation;
    }

    /**
     * Richiedibile (spec §3.4): attivo, valido per il tipo di rapporto attuale e, se lo richiede, abilitato.
     */
    private function ensureRequestable(User $user, AbsenceType $type): void
    {
        $requestable = ! $type->isArchived()
            && $type->appliesTo($user->employment_type)
            && (! $type->requires_enablement || $user->enabledAbsenceTypes()->whereKey($type->id)->exists());

        if (! $requestable) {
            $this->fail('absence_type_id', 'leave.type_not_requestable');
        }
    }

    private function ensureUnitAllowed(AbsenceType $type, LeaveUnit $unit): void
    {
        $allowed = match ($unit) {
            LeaveUnit::Days => $type->allows_days,
            LeaveUnit::HalfDay => $type->allows_half_days,
            LeaveUnit::Hours => $type->allows_hours,
        };

        if (! $allowed) {
            $this->fail('unit', 'leave.unit_not_allowed');
        }
    }

    /**
     * Sovrapposizione con le richieste attive della persona (spec §5.1): contano i giorni con minuti e, per i tipi a
     * giorni di calendario, tutti i giorni. Sullo stesso giorno convivono solo due mezze giornate opposte o due fasce
     * orarie che non si toccano.
     */
    private function ensureNoOverlap(LeaveDraft $draft, LeaveComputation $computation): void
    {
        $candidate = $this->occupiedDates($computation->days, $draft->type->day_count);

        if ($candidate === []) {
            return;
        }

        $from = $draft->startsOn->toDateString();
        $to = $draft->endsOn->toDateString();
        $existing = LeaveRequest::query()
            ->where('user_id', $draft->user->id)
            ->active()
            ->where('starts_on', '<=', $to)
            ->where('ends_on', '>=', $from)
            ->with([
                'absenceType:id,day_count',
                'days' => fn ($query) => $query->whereBetween('date', [$from, $to]),
            ])
            ->get();

        foreach ($existing as $other) {
            /** @var AbsenceType $otherType */
            $otherType = $other->absenceType;
            $days = $other->days
                ->map(fn (LeaveRequestDay $day): array => ['date' => $day->date->toDateString(), 'minutes' => $day->minutes])
                ->values()
                ->all();

            if (array_intersect($candidate, $this->occupiedDates($days, $otherType->day_count)) === []) {
                continue;
            }

            if (! $this->canShareDay($draft, $other)) {
                $this->fail('starts_on', 'leave.overlap');
            }
        }
    }

    /**
     * @param  list<array{date: string, minutes: int}>  $days
     * @return list<string>
     */
    private function occupiedDates(array $days, AbsenceDayCount $dayCount): array
    {
        $calendar = $dayCount === AbsenceDayCount::Calendar;

        return array_values(array_map(
            fn (array $day): string => $day['date'],
            array_filter($days, fn (array $day): bool => $calendar || $day['minutes'] > 0),
        ));
    }

    /**
     * Due richieste di un solo giorno che possono stare insieme: mezze giornate opposte o fasce orarie disgiunte.
     */
    private function canShareDay(LeaveDraft $draft, LeaveRequest $other): bool
    {
        if ($draft->unit === LeaveUnit::HalfDay && $other->unit === LeaveUnit::HalfDay) {
            return $draft->half instanceof DayHalf && $other->half instanceof DayHalf && $draft->half !== $other->half;
        }

        if ($draft->unit === LeaveUnit::Hours && $other->unit === LeaveUnit::Hours) {
            // Orari `H:i` a due cifre: il confronto tra stringhe segue l'ordine del giorno
            return (string) $draft->endsAt <= (string) $other->starts_at || (string) $other->ends_at <= (string) $draft->startsAt;
        }

        return false;
    }

    /**
     * Saldo del tipo, se ne ha uno: a oggi, disponibile (spec §5.2) e dopo la richiesta.
     *
     * @return array{balance: string, current_minutes: int, available_minutes: int, after_minutes: int}|null
     */
    private function balance(LeaveDraft $draft, LeaveComputation $computation): ?array
    {
        $balance = $draft->type->balance;

        if ($balance === null) {
            return null;
        }

        /** @var Location $location */
        $location = $draft->user->location()->firstOrFail();
        $today = $this->schedules->today($location);
        $available = $this->availability->available($draft->user, $balance, $today);

        return [
            'balance' => $balance->value,
            'current_minutes' => $this->ledger->balanceAt($draft->user, $balance, $today),
            'available_minutes' => $available,
            'after_minutes' => $available - $computation->minutes,
        ];
    }

    /**
     * @throws ValidationException
     */
    private function fail(string $field, string $key): never
    {
        throw ValidationException::withMessages([$field => [Translate::text($key)]]);
    }
}
