<?php

namespace App\Http\Requests\Leave;

use App\Enums\DayHalf;
use App\Enums\LeaveUnit;
use App\Models\AbsenceType;
use App\Models\LeaveRequest;
use App\Models\User;
use App\Support\LeaveDraft;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Bozza di una richiesta per sé, uguale per anteprima e creazione (spec §5.1). Qui solo la forma dell'input: date,
 * `ends_on` ≥ `starts_on` (il calcolatore lo presuppone), unità, metà, orari `H:i`, nota. Il resto lo controlla
 * `LeaveRequestService`.
 */
class LeaveDraftRequest extends FormRequest
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
            'absence_type_id' => ['required', 'integer', Rule::exists('absence_types', 'id')],
            'unit' => ['required', Rule::enum(LeaveUnit::class)],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
            'half' => [Rule::requiredIf($this->input('unit') === LeaveUnit::HalfDay->value), 'nullable', Rule::enum(DayHalf::class)],
            'starts_at' => [Rule::requiredIf($this->input('unit') === LeaveUnit::Hours->value), 'nullable', 'date_format:H:i'],
            'ends_at' => [Rule::requiredIf($this->input('unit') === LeaveUnit::Hours->value), 'nullable', 'date_format:H:i'],
            'note' => ['sometimes', 'nullable', 'string', 'max:'.LeaveRequest::NOTE_MAX_LENGTH],
        ];
    }

    /**
     * Bozza per chi è collegato. Metà e orari solo per la loro unità.
     */
    public function draft(): LeaveDraft
    {
        $user = $this->user();
        assert($user instanceof User);

        $unit = LeaveUnit::from((string) $this->validated('unit'));

        return new LeaveDraft(
            $user,
            AbsenceType::query()->findOrFail((int) $this->validated('absence_type_id')),
            $unit,
            CarbonImmutable::parse((string) $this->validated('starts_on')),
            CarbonImmutable::parse((string) $this->validated('ends_on')),
            $unit === LeaveUnit::HalfDay ? DayHalf::from((string) $this->validated('half')) : null,
            $unit === LeaveUnit::Hours ? (string) $this->validated('starts_at') : null,
            $unit === LeaveUnit::Hours ? (string) $this->validated('ends_at') : null,
        );
    }

    public function note(): ?string
    {
        $note = $this->validated('note');

        return is_string($note) && $note !== '' ? $note : null;
    }
}
