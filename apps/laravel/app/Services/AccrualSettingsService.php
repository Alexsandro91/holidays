<?php

namespace App\Services;

use App\Enums\BalanceType;
use App\Models\AccrualSetting;
use App\Models\Location;
use App\Models\User;
use App\Support\EffectiveAccrual;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Valori annui di maturazione (spec §4.1): lettura dei valori effettivi (persona, sede, azienda) e scrittura dei tre
 * livelli. Le righe di sede e persona nascono alla prima scrittura e spariscono quando tornano tutte a `null`.
 */
final class AccrualSettingsService
{
    public function forUser(User $user): EffectiveAccrual
    {
        return $this->forUsers(collect([$user]))[$user->id];
    }

    /**
     * Query costanti: la riga azienda più le righe delle persone e delle loro sedi in una sola.
     *
     * @param  Collection<int, User>  $users
     * @return array<int, EffectiveAccrual>
     */
    public function forUsers(Collection $users): array
    {
        if ($users->isEmpty()) {
            return [];
        }

        $company = AccrualSetting::company();
        $userIds = $users->pluck('id')->all();
        $locationIds = $users->pluck('location_id')->filter()->unique()->values()->all();

        $rows = AccrualSetting::query()
            ->where(fn ($query) => $query->whereIn('user_id', $userIds)->orWhereIn('location_id', $locationIds))
            ->get();
        $byUser = $rows->whereNotNull('user_id')->keyBy('user_id');
        $byLocation = $rows->whereNotNull('location_id')->keyBy('location_id');

        $result = [];

        foreach ($users as $user) {
            $result[$user->id] = $this->resolve($company, $byLocation->get($user->location_id), $byUser->get($user->id));
        }

        return $result;
    }

    public function forCompany(): EffectiveAccrual
    {
        return $this->resolve(AccrualSetting::company(), null, null);
    }

    /**
     * La riga della sede, se l'admin ne ha impostata una.
     */
    public function locationSetting(Location $location): ?AccrualSetting
    {
        return AccrualSetting::query()->where('location_id', $location->id)->first();
    }

    public function forLocation(Location $location): EffectiveAccrual
    {
        return $this->resolve(AccrualSetting::company(), $this->locationSetting($location), null);
    }

    /**
     * @param  array<string, int>  $values  chiavi = colonne `*_minutes`, tutte obbligatorie
     */
    public function updateCompany(array $values, User $actor): AccrualSetting
    {
        [$setting, $before] = DB::transaction(function () use ($values): array {
            $setting = AccrualSetting::query()->whereNull('location_id')->whereNull('user_id')->lockForUpdate()->firstOrFail();
            $before = $this->snapshot($setting);
            $setting->forceFill($this->onlyColumns($values))->save();

            return [$setting, $before];
        });

        $this->log('company', null, null, $before, $setting, $actor);

        return $setting;
    }

    /**
     * @param  array<string, int|null>  $values  `null` = eredita dall'azienda
     */
    public function updateLocation(Location $location, array $values, User $actor): AccrualSetting
    {
        // Si blocca la sede: la riga può non esserci ancora e il lock su una riga assente non serializza
        [$setting, $before] = DB::transaction(function () use ($location, $values): array {
            Location::query()->whereKey($location->id)->lockForUpdate()->firstOrFail();

            return $this->saveOverride(AccrualSetting::query()->where('location_id', $location->id), ['location_id' => $location->id], $values);
        });

        $this->log('location', $location->id, null, $before, $setting, $actor);

        return $setting;
    }

    /**
     * @param  array<string, int|null>  $values  `null` = eredita dalla sede o dall'azienda
     */
    public function updateUser(User $user, array $values, User $actor): AccrualSetting
    {
        [$setting, $before] = DB::transaction(function () use ($user, $values): array {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            return $this->saveOverride(AccrualSetting::query()->where('user_id', $user->id), ['user_id' => $user->id], $values);
        });

        $this->log('user', null, $user->id, $before, $setting, $actor);

        return $setting;
    }

    /**
     * Crea o aggiorna la riga del livello; se i tre valori sono `null` la cancella e restituisce una riga vuota non salvata.
     *
     * @param  Builder<AccrualSetting>  $query
     * @param  array<string, int>  $owner  `location_id` o `user_id`
     * @param  array<string, int|null>  $values
     * @return array{0: AccrualSetting, 1: array<string, int|null>}
     */
    private function saveOverride($query, array $owner, array $values): array
    {
        $setting = $query->firstOrNew();
        $before = $this->snapshot($setting);
        $columns = $this->onlyColumns($values);

        if (array_filter($columns, fn (?int $value): bool => $value !== null) === []) {
            if ($setting->exists) {
                $setting->delete();
            }

            return [(new AccrualSetting)->forceFill($columns), $before];
        }

        $setting->forceFill([...$owner, ...$columns])->save();

        return [$setting, $before];
    }

    /**
     * @param  array<string, int|null>  $values
     * @return array<string, int|null>
     */
    private function onlyColumns(array $values): array
    {
        $columns = [];

        foreach (BalanceType::cases() as $balance) {
            $columns[$balance->settingColumn()] = $values[$balance->settingColumn()] ?? null;
        }

        return $columns;
    }

    /**
     * @return array<string, int|null>
     */
    private function snapshot(AccrualSetting $setting): array
    {
        $values = [];

        foreach (BalanceType::cases() as $balance) {
            $values[$balance->settingColumn()] = $setting->valueFor($balance);
        }

        return $values;
    }

    private function resolve(AccrualSetting $company, ?AccrualSetting $location, ?AccrualSetting $user): EffectiveAccrual
    {
        $values = [];

        foreach (BalanceType::cases() as $balance) {
            $personal = $user?->valueFor($balance);
            $local = $location?->valueFor($balance);

            $values[$balance->value] = match (true) {
                $personal !== null => ['minutes' => $personal, 'source' => 'user'],
                $local !== null => ['minutes' => $local, 'source' => 'location'],
                default => ['minutes' => $company->valueFor($balance) ?? 0, 'source' => 'company'],
            };
        }

        return new EffectiveAccrual($values);
    }

    /**
     * @param  array<string, int|null>  $before
     */
    private function log(string $level, ?int $locationId, ?int $userId, array $before, AccrualSetting $after, User $actor): void
    {
        Log::info('Accrual settings updated', [
            'level' => $level,
            'location_id' => $locationId,
            'user_id' => $userId,
            'before' => $before,
            'after' => $this->snapshot($after),
            'actor_id' => $actor->id,
        ]);
    }
}
