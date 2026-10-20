<?php

namespace App\Http\Requests\Leave;

use App\Services\WorkCalendar;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Intervallo del calendario personale (spec §6): `to` ≥ `from`, al massimo 366 giorni (limite di `WorkCalendar`).
 */
class ProfileCalendarRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['from', 'to'])) {
                return;
            }

            if ((int) $this->fromDate()->diffInDays($this->toDate()) + 1 > WorkCalendar::MAX_DAYS) {
                $validator->errors()->add('to', Translate::text('leave.range_too_long', ['max' => WorkCalendar::MAX_DAYS]));
            }
        }];
    }

    public function fromDate(): CarbonImmutable
    {
        return CarbonImmutable::parse((string) $this->input('from'))->startOfDay();
    }

    public function toDate(): CarbonImmutable
    {
        return CarbonImmutable::parse((string) $this->input('to'))->startOfDay();
    }
}
