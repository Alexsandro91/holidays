<?php

namespace App\Http\Resources;

use App\Enums\BalanceType;
use App\Models\Location;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Riga della pagina Saldi (spec §6.2): persona, orari, saldi attuali con il valore annuo già proporzionato all'orario,
 * ultimo allineamento. I dati li prepara il controller a blocchi: nessuna query qui.
 *
 * @property array{user: User, weekly_minutes: int, location_weekly_minutes: int, average_day_minutes: int, current: array<string, int>, annual: array<string, int>, last_aligned_on: ?string, can_adjust: bool} $resource
 */
final class BalanceOverviewResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $row = $this->resource;
        $user = $row['user'];
        $location = $user->location;
        $balances = [];

        foreach (BalanceType::cases() as $balance) {
            $balances[$balance->value] = [
                'current_minutes' => $row['current'][$balance->value],
                'annual_minutes' => $row['annual'][$balance->value],
            ];
        }

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role->value,
                'role_label' => $user->role->label(),
                'location' => $location instanceof Location ? ['id' => $location->id, 'name' => $location->name] : null,
            ],
            'weekly_minutes' => $row['weekly_minutes'],
            'location_weekly_minutes' => $row['location_weekly_minutes'],
            'average_day_minutes' => $row['average_day_minutes'],
            'balances' => $balances,
            'last_aligned_on' => $row['last_aligned_on'],
            'can' => ['adjust' => $row['can_adjust']],
        ];
    }
}
