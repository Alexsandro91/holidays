<?php

namespace App\Http\Requests\Concerns;

use App\Models\WorkSchedule;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Validator;

/**
 * Una versione di orario (spec §2.3): sette valori a quarti d'ora fino a 12 ore, almeno un giorno lavorativo, da oggi
 * in poi nel fuso di chi la possiede.
 */
trait ValidatesWeeklySchedule
{
    /**
     * @return array<string, list<string>>
     */
    protected function weeklyScheduleRules(): array
    {
        return [
            'valid_from' => ['required', 'date_format:Y-m-d'],
            'minutes' => ['required', 'array', 'list', 'size:'.count(WorkSchedule::DAYS)],
            'minutes.*' => ['required', 'integer', 'between:0,'.WorkSchedule::MAX_DAILY_MINUTES, 'multiple_of:'.WorkSchedule::MINUTE_STEP],
        ];
    }

    /**
     * "Oggi" è il giorno nel fuso `$timezone` di chi possiede la versione, mai in UTC.
     */
    protected function checkWeeklySchedule(Validator $validator, string $timezone, bool $requireWorkingDay): void
    {
        $validFrom = $this->input('valid_from');

        if (! $validator->errors()->has('valid_from') && is_string($validFrom) && $validFrom < CarbonImmutable::now($timezone)->toDateString()) {
            $validator->errors()->add('valid_from', Translate::text('locations.schedule_past'));
        }

        if ($requireWorkingDay && ! $validator->errors()->hasAny(['minutes', 'minutes.*']) && array_sum($this->minutesList()) === 0) {
            $validator->errors()->add('minutes', Translate::text('locations.schedule_empty'));
        }
    }

    /**
     * Data di calendario della richiesta: si confronta sempre come `Y-m-d`.
     */
    public function validFrom(): CarbonImmutable
    {
        return CarbonImmutable::parse($this->string('valid_from')->value())->startOfDay();
    }

    /**
     * @return list<int>
     */
    public function minutesList(): array
    {
        return array_values(array_map(intval(...), $this->array('minutes')));
    }
}
