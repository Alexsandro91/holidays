<?php

namespace Tests\Feature\Balances;

use App\Enums\EmploymentType;
use App\Enums\UserHistoryEvent;
use App\Enums\UserStatus;
use App\Models\User;
use App\Models\UserHistory;
use App\Support\EmploymentTimeline;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stato del rapporto a una data ricostruito dallo storico (spec §4.3), con i giorni pensati in Europe/Rome.
 */
class EmploymentTimelineTest extends TestCase
{
    use RefreshDatabase;

    public function test_current_state_without_events(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $timeline = EmploymentTimeline::for($user, collect());

        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-01')));
        $this->assertFalse($timeline->isActiveEmployeeAt($this->endOf('2026-08-31')));
    }

    public function test_activation_is_undone_before_it_happened(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $timeline = EmploymentTimeline::for($user, collect([$this->event($user, UserHistoryEvent::Activated, '2026-10-10 09:00')]));

        $this->assertFalse($timeline->isActiveEmployeeAt($this->endOf('2026-10-05')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-10')));
    }

    public function test_disabled_and_enabled(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $timeline = EmploymentTimeline::for($user, collect([
            $this->event($user, UserHistoryEvent::Disabled, '2026-10-10 10:00'),
            $this->event($user, UserHistoryEvent::Enabled, '2026-10-20 10:00'),
        ]));

        $this->assertFalse($timeline->isActiveEmployeeAt($this->endOf('2026-10-15')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-25')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-05')));
    }

    public function test_employment_type_change(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $timeline = EmploymentTimeline::for($user, collect([
            $this->event($user, UserHistoryEvent::EmploymentTypeChanged, '2026-10-12 10:00', EmploymentType::Intern->value, EmploymentType::Employee->value),
        ]));

        $this->assertFalse($timeline->isActiveEmployeeAt($this->endOf('2026-10-01')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-16')));
    }

    public function test_events_are_applied_whatever_the_order_they_are_given(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $timeline = EmploymentTimeline::for($user, collect([
            $this->event($user, UserHistoryEvent::Enabled, '2026-10-20 10:00'),
            $this->event($user, UserHistoryEvent::Disabled, '2026-10-10 10:00'),
        ]));

        $this->assertFalse($timeline->isActiveEmployeeAt($this->endOf('2026-10-15')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-05')));
    }

    public function test_imported_users_use_current_state_from_creation(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $timeline = EmploymentTimeline::for($user, collect([$this->event($user, UserHistoryEvent::Imported, '2026-09-01 08:00')]));

        $this->assertFalse($timeline->isActiveEmployeeAt($this->endOf('2026-08-31')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-09-01')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-20')));
    }

    public function test_events_with_the_same_instant_follow_the_writing_order(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        // Disattivato e riattivato nello stesso secondo: prima vale lo stato precedente a entrambi
        $this->event($user, UserHistoryEvent::Disabled, '2026-10-10 10:00')->save();
        $this->event($user, UserHistoryEvent::Enabled, '2026-10-10 10:00')->save();
        $timeline = EmploymentTimeline::for($user, UserHistory::query()->where('user_id', $user->id)->orderBy('id')->get());

        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-09')));
        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-10')));
    }

    public function test_an_event_at_the_instant_has_already_happened(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $user->forceFill(['status' => UserStatus::Disabled])->save();
        $instant = CarbonImmutable::parse('2026-10-10 10:00', 'Europe/Rome');
        $timeline = EmploymentTimeline::for($user, collect([$this->event($user, UserHistoryEvent::Disabled, '2026-10-10 10:00')]));

        $this->assertFalse($timeline->isActiveEmployeeAt($instant));
        $this->assertTrue($timeline->isActiveEmployeeAt($instant->subSecond()));
    }

    public function test_an_event_after_midnight_in_rome_belongs_to_the_next_day(): void
    {
        $user = $this->userCreatedOn('2026-09-01');
        $user->forceFill(['status' => UserStatus::Disabled])->save();
        // Alle 00:30 di Roma del 10 è ancora il 9 in UTC
        $timeline = EmploymentTimeline::for($user, collect([$this->event($user, UserHistoryEvent::Disabled, '2026-10-10 00:30')]));

        $this->assertTrue($timeline->isActiveEmployeeAt($this->endOf('2026-10-09')));
        $this->assertFalse($timeline->isActiveEmployeeAt($this->endOf('2026-10-10')));
    }

    private function userCreatedOn(string $day): User
    {
        $user = User::factory()->create(['status' => UserStatus::Active]);
        $user->forceFill(['created_at' => CarbonImmutable::parse("{$day} 10:00", 'Europe/Rome')->utc()])->save();

        return $user;
    }

    private function endOf(string $day): CarbonImmutable
    {
        return CarbonImmutable::parse($day, 'Europe/Rome')->endOfDay();
    }

    private function event(User $user, UserHistoryEvent $event, string $romeTime, ?string $old = null, ?string $new = null): UserHistory
    {
        return (new UserHistory)->forceFill([
            'user_id' => $user->id,
            'event' => $event,
            'old_value' => $old,
            'new_value' => $new,
            'created_at' => CarbonImmutable::parse($romeTime, 'Europe/Rome')->utc(),
        ]);
    }
}
