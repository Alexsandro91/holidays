<?php

namespace Tests\Feature\Profile;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Models\AuthEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Profilo (fase 4, §2.2): ognuno modifica solo sé stesso, qualunque sia il ruolo.
 */
class UpdateProfileTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string}>
     */
    public static function roles(): array
    {
        return ['employee' => ['employee'], 'manager' => ['manager'], 'admin' => ['admin']];
    }

    private function userWithRole(string $role): User
    {
        $factory = User::factory();

        return match ($role) {
            'manager' => $factory->manager()->create(['first_name' => 'Anna', 'last_name' => 'Verdi']),
            'admin' => $factory->admin()->create(['first_name' => 'Anna', 'last_name' => 'Verdi']),
            default => $factory->create(['first_name' => 'Anna', 'last_name' => 'Verdi']),
        };
    }

    public function test_guests_get_401(): void
    {
        $this->patchJson('/api/profile', ['first_name' => 'Zoe'])->assertUnauthorized();
    }

    #[DataProvider('roles')]
    public function test_every_role_updates_only_itself(string $role): void
    {
        $user = $this->userWithRole($role);
        $other = User::factory()->create(['first_name' => 'Luca', 'last_name' => 'Neri']);

        $this->actingAs($user)->fromFrontend()->patchJson('/api/profile', ['first_name' => ' Zoe ', 'last_name' => 'Bianchi'])
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.first_name', 'Zoe')
            ->assertJsonPath('data.last_name', 'Bianchi')
            ->assertJsonPath('data.name', 'Zoe Bianchi')
            ->assertJsonStructure(['meta' => ['session' => ['idle_timeout_seconds', 'absolute_remaining_seconds']]]);

        $this->assertSame('Zoe', $user->fresh()->first_name);
        $this->assertSame('Luca', $other->fresh()->first_name);
    }

    public function test_a_route_parameter_cannot_target_another_user(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->fromFrontend()->patchJson('/api/profile/'.User::factory()->create()->id, ['first_name' => 'Zoe'])
            ->assertNotFound();
    }

    public function test_the_event_lists_only_the_changed_fields_and_never_the_values(): void
    {
        $user = $this->userWithRole('employee');

        $this->actingAs($user)->fromFrontend()->patchJson('/api/profile', ['first_name' => 'Zoe', 'last_name' => 'Verdi'])->assertOk();

        $event = AuthEvent::query()->where('event', AuthEventType::UserUpdated)->sole();
        $this->assertSame($user->id, $event->user_id);
        $this->assertSame($user->id, $event->actor_id);
        $this->assertSame(['first_name'], $event->changed_fields);
        $this->assertStringNotContainsString('Zoe', json_encode($event->toArray(), JSON_THROW_ON_ERROR));
    }

    public function test_no_event_without_changes_or_for_the_language_alone(): void
    {
        $user = $this->userWithRole('employee');

        $this->actingAs($user)->fromFrontend()->patchJson('/api/profile', ['first_name' => 'Anna', 'last_name' => 'Verdi'])->assertOk();
        $this->actingAs($user)->fromFrontend()->patchJson('/api/profile', ['locale' => 'en'])->assertOk();

        $this->assertSame(0, AuthEvent::query()->where('event', AuthEventType::UserUpdated)->count());
        $this->assertSame('en', $user->fresh()->locale);
    }

    public function test_the_response_is_already_in_the_new_language(): void
    {
        $user = $this->userWithRole('employee');

        $this->actingAs($user)->fromFrontend()->patchJson('/api/profile', ['locale' => 'en'])->assertOk()->assertJsonPath('data.locale', 'en');
        $this->assertSame('en', app()->getLocale());
    }

    public function test_an_unsupported_locale_is_rejected(): void
    {
        $this->actingAs($this->userWithRole('employee'))->patchJson('/api/profile', ['locale' => 'fr'])
            ->assertUnprocessable()->assertJsonValidationErrors(['locale']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidNames(): array
    {
        return [
            'empty first name' => [['first_name' => ''], 'first_name'],
            'html in first name' => [['first_name' => 'A<b>'], 'first_name'],
            'brackets in last name' => [['last_name' => '[x]'], 'last_name'],
            'long last name' => [['last_name' => str_repeat('a', 256)], 'last_name'],
            'array' => [['first_name' => ['x']], 'first_name'],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('invalidNames')]
    public function test_names_follow_the_invitation_rules(array $payload, string $field): void
    {
        $this->actingAs($this->userWithRole('employee'))->patchJson('/api/profile', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors([$field]);
    }

    public function test_email_role_and_status_cannot_be_changed_from_the_profile(): void
    {
        $user = $this->userWithRole('employee');

        $this->actingAs($user)->fromFrontend()->patchJson('/api/profile', ['email' => 'x@example.test', 'role' => 'admin', 'status' => 'disabled'])->assertOk();

        $fresh = $user->fresh();
        $this->assertSame($user->email, $fresh->email);
        $this->assertSame($user->role, $fresh->role);
        $this->assertSame(UserStatus::Active, $fresh->status);
    }
}
