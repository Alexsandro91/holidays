<?php

namespace App\Http\Resources;

use App\Enums\BalanceType;
use App\Models\AccrualSetting;
use App\Support\EffectiveAccrual;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Valori annui di un livello (`null` = eredita) e valori effettivi con la provenienza (spec §6.2).
 *
 * @property array{setting: AccrualSetting|null, effective: EffectiveAccrual} $resource
 */
final class AccrualResource extends JsonResource
{
    public static function of(?AccrualSetting $setting, EffectiveAccrual $effective): self
    {
        return new self(['setting' => $setting, 'effective' => $effective]);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $setting = $this->resource['setting'];
        $effective = $this->resource['effective'];
        $values = [];
        $effectiveValues = [];

        foreach (BalanceType::cases() as $balance) {
            $values[$balance->settingColumn()] = $setting?->valueFor($balance);
            $effectiveValues[$balance->value] = ['minutes' => $effective->minutes($balance), 'source' => $effective->source($balance)];
        }

        return ['values' => $values, 'effective' => $effectiveValues];
    }
}
