<?php

namespace App\Services;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Models\BalanceAlignment;
use App\Models\BalanceMovement;
use App\Models\User;
use App\Services\Concerns\RechecksUserPermissions;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Rettifiche e allineamenti alla busta paga (spec §5.1, §5.2). Ogni scrittura blocca la riga della persona, come la
 * maturazione, e ricontrolla sulle righe rilette che chi agisce possa ancora farlo e che la persona abbia i saldi.
 */
final class BalanceCorrectionService
{
    use RechecksUserPermissions;

    /**
     * Tentativi della transazione: un deadlock si ripete da capo, rileggendo tutto sotto blocco.
     */
    private const TRANSACTION_ATTEMPTS = 3;

    public function __construct(
        private readonly BalanceLedger $ledger,
        private readonly WorkScheduleService $schedules,
    ) {}

    /**
     * Rettifica di un saldo: minuti con segno (mai 0), motivo obbligatorio, datata oggi nel fuso della sede.
     */
    public function adjust(User $target, BalanceType $balance, int $minutes, string $note, User $actor): BalanceMovement
    {
        if ($minutes === 0) {
            throw new InvalidArgumentException('An adjustment cannot be zero.');
        }

        $movement = DB::transaction(function () use ($target, $balance, $minutes, $note, $actor): BalanceMovement {
            $fresh = $this->lockTarget($target, $actor);

            $movement = new BalanceMovement;
            $movement->forceFill([
                'user_id' => $fresh->id,
                'balance' => $balance,
                'kind' => BalanceMovementKind::Adjustment,
                'minutes' => $minutes,
                'effective_on' => $this->schedules->today($fresh->location()->firstOrFail())->toDateString(),
                'period' => null,
                'target_minutes' => null,
                'note' => $note,
                'actor_id' => $actor->id,
            ])->save();

            return $movement;
        }, self::TRANSACTION_ATTEMPTS);

        Log::info('Balance adjusted', [
            'user_id' => $target->id,
            'actor_id' => $actor->id,
            'balance' => $balance->value,
            'minutes' => $minutes,
            'movement_id' => $movement->id,
        ]);

        return $movement;
    }

    /**
     * Allinea i saldi indicati al valore della busta paga del giorno `$alignedOn` (spec §5.2): per ognuno scrive la
     * differenza rispetto al saldo a quella data (solo se diversa da 0) e una riga di allineamento (sempre). I movimenti
     * datati dopo restano e si sommano al valore allineato.
     *
     * @param  array<string, int>  $values  minuti per `BalanceType->value`, almeno uno
     * @return array<string, int> differenza scritta per ogni saldo indicato, anche 0
     */
    public function align(User $target, CarbonImmutable $alignedOn, array $values, ?string $note, User $actor): array
    {
        $balances = $this->balancesIn($values);
        $given = [];

        foreach ($balances as $balance) {
            $given[$balance->value] = $values[$balance->value];
        }

        $alignedOn = $alignedOn->startOfDay();

        $deltas = DB::transaction(function () use ($target, $alignedOn, $values, $balances, $note, $actor): array {
            $fresh = $this->lockTarget($target, $actor);
            $today = $this->schedules->today($fresh->location()->firstOrFail());

            if ($alignedOn->toDateString() > $today->toDateString()) {
                throw ValidationException::withMessages(['aligned_on' => [Translate::text('balances.alignment_future')]]);
            }

            // Tutti i controlli prima di scrivere: un saldo rifiutato non lascia a metà gli altri
            foreach ($balances as $balance) {
                $last = $this->ledger->lastAlignmentFor($fresh, $balance);

                if ($last !== null && $alignedOn->lessThan($last)) {
                    throw ValidationException::withMessages(['aligned_on' => [Translate::text('balances.alignment_before_last', [
                        'date' => $last->locale(app()->getLocale())->isoFormat('L'),
                    ])]]);
                }
            }

            $createdAt = now();
            $deltas = [];
            $movements = [];
            $alignments = [];

            foreach ($balances as $balance) {
                $targetMinutes = $values[$balance->value];
                $delta = $targetMinutes - $this->ledger->balanceAt($fresh, $balance, $alignedOn);
                $deltas[$balance->value] = $delta;

                if ($delta !== 0) {
                    $movements[] = [
                        'user_id' => $fresh->id,
                        'balance' => $balance->value,
                        'kind' => BalanceMovementKind::Alignment->value,
                        'minutes' => $delta,
                        'effective_on' => $alignedOn->toDateString(),
                        'period' => null,
                        'target_minutes' => $targetMinutes,
                        'note' => $note,
                        'actor_id' => $actor->id,
                        'created_at' => $createdAt,
                    ];
                }

                $alignments[] = [
                    'user_id' => $fresh->id,
                    'balance' => $balance->value,
                    'aligned_on' => $alignedOn->toDateString(),
                    'actor_id' => $actor->id,
                    'created_at' => $createdAt,
                ];
            }

            if ($movements !== []) {
                BalanceMovement::query()->insert($movements);
            }

            BalanceAlignment::query()->insert($alignments);

            return $deltas;
        }, self::TRANSACTION_ATTEMPTS);

        Log::info('Balances aligned', [
            'user_id' => $target->id,
            'actor_id' => $actor->id,
            'aligned_on' => $alignedOn->toDateString(),
            'values' => $given,
            'deltas' => $deltas,
        ]);

        return $deltas;
    }

    /**
     * Blocca la riga della persona e ricontrolla tutto sulle righe rilette: chi agisce deve poter ancora gestire gli
     * utenti (altrimenti 403) e correggere questa persona (per esempio è ancora nella sua sede, altrimenti 409
     * `users.state_changed`); la persona deve avere i saldi (409 `balances.not_applicable`).
     */
    private function lockTarget(User $target, User $actor): User
    {
        $fresh = User::query()->lockForUpdate()->findOrFail($target->id);
        $freshActor = $this->ensureStillManagesUsers(User::query()->find($actor->id));
        $this->ensureStillAllowed('adjustBalances', $actor, $freshActor, $fresh);

        if (! $this->ledger->applies($fresh)) {
            throw new ConflictHttpException(Translate::text('balances.not_applicable'));
        }

        return $fresh;
    }

    /**
     * Saldi indicati, nell'ordine dei saldi.
     *
     * @param  array<string, int>  $values
     * @return list<BalanceType>
     */
    private function balancesIn(array $values): array
    {
        $balances = array_values(array_filter(BalanceType::cases(), fn (BalanceType $balance): bool => array_key_exists($balance->value, $values)));

        if ($balances === []) {
            throw ValidationException::withMessages(['values' => [Translate::text('balances.alignment_empty')]]);
        }

        return $balances;
    }
}
