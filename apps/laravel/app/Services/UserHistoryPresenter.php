<?php

namespace App\Services;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use App\Support\HistoryEntry;
use App\Support\Translate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * Storico di una persona per il profilo e per lo staff (spec §8.3): pagine da 20, dalla tappa più recente, con il
 * testo tradotto nella lingua della richiesta. I nomi delle sedi si leggono con una sola query per pagina.
 */
final class UserHistoryPresenter
{
    public const PER_PAGE = 20;

    private const UNKNOWN = '—';

    /**
     * @param  bool  $withActor  solo per lo staff: nel profilo chi ha agito non si mostra
     * @return LengthAwarePaginator<int, HistoryEntry>
     */
    public function page(User $user, bool $withActor): LengthAwarePaginator
    {
        $page = UserHistory::query()
            ->where('user_id', $user->id)
            ->when($withActor, fn (Builder $query) => $query->with('actor:id,first_name,last_name'))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE);
        $locationNames = $this->locationNames($page->getCollection());

        /** @var LengthAwarePaginator<int, HistoryEntry> $entries */
        $entries = $page->through(fn (UserHistory $entry): HistoryEntry => new HistoryEntry(
            $entry,
            $this->summary($entry, $locationNames),
            $withActor ? $entry->actor?->name : null,
        ));

        return $entries;
    }

    /**
     * @param  Collection<int, string>  $locationNames  id → nome attuale
     */
    private function summary(UserHistory $entry, Collection $locationNames): string
    {
        $context = $entry->context ?? [];

        return match ($entry->event) {
            UserHistoryEvent::Imported, UserHistoryEvent::Invited => Translate::text('history.'.$entry->event->value, [
                'type' => EmploymentType::tryFrom((string) ($context['employment_type'] ?? ''))?->label() ?? self::UNKNOWN,
                'role' => Role::tryFrom((string) ($context['role'] ?? ''))?->label() ?? self::UNKNOWN,
                'location' => $locationNames->get((int) ($context['location_id'] ?? 0), self::UNKNOWN),
            ]),
            UserHistoryEvent::RoleChanged => Translate::text('history.role_changed', [
                'from' => Role::tryFrom((string) $entry->old_value)?->label() ?? self::UNKNOWN,
                'to' => Role::tryFrom((string) $entry->new_value)?->label() ?? self::UNKNOWN,
            ]),
            UserHistoryEvent::EmploymentTypeChanged => Translate::text('history.employment_type_changed', [
                'from' => EmploymentType::tryFrom((string) $entry->old_value)?->label() ?? self::UNKNOWN,
                'to' => EmploymentType::tryFrom((string) $entry->new_value)?->label() ?? self::UNKNOWN,
            ]),
            UserHistoryEvent::LocationChanged => Translate::text('history.location_changed', [
                'from' => $locationNames->get((int) $entry->old_value, self::UNKNOWN),
                'to' => $locationNames->get((int) $entry->new_value, self::UNKNOWN),
            ]),
            UserHistoryEvent::Activated, UserHistoryEvent::Disabled, UserHistoryEvent::Enabled => Translate::text('history.'.$entry->event->value),
        };
    }

    /**
     * Nomi attuali delle sedi citate nella pagina: una sede rinominata compare con il nome nuovo.
     *
     * @param  Collection<int, UserHistory>  $entries
     * @return Collection<int, string>
     */
    private function locationNames(Collection $entries): Collection
    {
        $ids = $entries->flatMap(fn (UserHistory $entry): array => match ($entry->event) {
            UserHistoryEvent::LocationChanged => [(int) $entry->old_value, (int) $entry->new_value],
            UserHistoryEvent::Imported, UserHistoryEvent::Invited => [(int) ($entry->context['location_id'] ?? 0)],
            default => [],
        })->filter()->unique()->values();

        if ($ids->isEmpty()) {
            return new Collection;
        }

        /** @var Collection<int, string> $names */
        $names = Location::query()->whereIn('id', $ids)->pluck('name', 'id');

        return $names;
    }
}
