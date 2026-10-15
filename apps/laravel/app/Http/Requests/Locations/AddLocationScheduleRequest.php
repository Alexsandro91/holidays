<?php

namespace App\Http\Requests\Locations;

use App\Http\Requests\Concerns\ValidatesWeeklySchedule;
use App\Models\Location;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class AddLocationScheduleRequest extends FormRequest
{
    use ValidatesWeeklySchedule;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->weeklyScheduleRules();
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $location = $this->route('location');

            assert($location instanceof Location);

            $this->checkWeeklySchedule($validator, $location->timezone, requireWorkingDay: true);
        }];
    }
}
