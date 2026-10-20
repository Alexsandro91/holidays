<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Giorno di una richiesta di assenza (fase 3, spec §3.2) con i minuti scalati quel giorno.
 *
 * @property int $leave_request_id
 * @property CarbonImmutable $date
 * @property int $minutes
 */
class LeaveRequestDay extends Model
{
    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'date' => 'immutable_date',
            'minutes' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<LeaveRequest, $this>
     */
    public function leaveRequest(): BelongsTo
    {
        return $this->belongsTo(LeaveRequest::class);
    }
}
