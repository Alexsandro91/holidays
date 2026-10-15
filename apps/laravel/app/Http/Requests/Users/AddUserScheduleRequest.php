<?php

namespace App\Http\Requests\Users;

use App\Http\Requests\Concerns\ValidatesWeeklySchedule;
use App\Models\Location;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Versione dell'orario personale: i sette giorni, oppure `follows_location` per tornare all'orario della sede.
 * "Oggi" è quello della sede della persona.
 */
class AddUserScheduleRequest extends FormRequest
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
        $rules = $this->weeklyScheduleRules();

        return [
            'follows_location' => ['sometimes', 'boolean'],
            'valid_from' => $rules['valid_from'],
            'minutes' => ['exclude_if:follows_location,true', ...$rules['minutes']],
            'minutes.*' => ['exclude_if:follows_location,true', ...$rules['minutes.*']],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $target = $this->route('user');

            assert($target instanceof User);

            $timezone = Location::query()->findOrFail($target->location_id)->timezone;
            $this->checkWeeklySchedule($validator, $timezone, requireWorkingDay: ! $this->followsLocation());
        }];
    }

    public function followsLocation(): bool
    {
        return $this->boolean('follows_location');
    }
}
