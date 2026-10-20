<?php

namespace App\Models;

use App\Enums\BalanceType;
use Illuminate\Database\Eloquent\Model;

/**
 * Valori annui di maturazione (spec §4.1), in minuti per un tempo pieno. Una riga per livello: azienda
 * (`location_id` e `user_id` null, sempre una), sede o persona. `NULL` in una colonna = eredita dal livello sopra.
 *
 * Si scrive solo da `AccrualSettingsService`, con `forceFill`.
 *
 * @property int|null $location_id
 * @property int|null $user_id
 * @property int|null $vacation_minutes
 * @property int|null $rol_minutes
 * @property int|null $ex_holidays_minutes
 */
class AccrualSetting extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'vacation_minutes' => 'integer',
            'rol_minutes' => 'integer',
            'ex_holidays_minutes' => 'integer',
        ];
    }

    /**
     * La riga azienda: la crea la migration, ce n'è una sola.
     */
    public static function company(): self
    {
        return self::query()->whereNull('location_id')->whereNull('user_id')->firstOrFail();
    }

    public function valueFor(BalanceType $balance): ?int
    {
        $value = $this->getAttribute($balance->settingColumn());

        return is_int($value) ? $value : null;
    }
}
