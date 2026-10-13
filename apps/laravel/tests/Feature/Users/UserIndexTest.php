<?php

namespace Tests\Feature\Users;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_get_401_and_non_admins_get_403(): void
    {
        $this->getJson('/api/users')->assertUnauthorized();
        $this->actingAs(User::factory()->create())->getJson('/api/users')->assertForbidden();
        $this->actingAs(User::factory()->manager()->create())->getJson('/api/users')->assertForbidden();
    }

    public function test_lists_users_with_exactly_the_managed_fields(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
        User::factory()->create(['name' => 'Bruno Bianchi', 'last_login_at' => now()]);

        $response = $this->actingAs($admin)->getJson('/api/users')->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(
            ['id', 'name', 'email', 'role', 'role_label', 'status', 'status_label', 'invitation_expires_at', 'is_current_user'],
            array_keys($response->json('data.0')),
        );
        // Limite di finalità (spec §7.3): niente ultimo accesso nella gestione utenti
        $response->assertJsonMissingPath('data.1.last_login_at');
        $response->assertJsonPath('data.0.is_current_user', true);
        $response->assertJsonPath('data.1.is_current_user', false);
    }

    public function test_filters_by_status_and_counts_every_status(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(2)->create();
        User::factory()->disabled()->create();
        Invitation::factory()->create();

        $response = $this->actingAs($admin)->getJson('/api/users?filter[status]=active')->assertOk();

        $response->assertJsonCount(3, 'data');
        $response->assertJsonPath('meta.counts', ['all' => 5, 'active' => 3, 'invited' => 1, 'disabled' => 1]);
    }

    public function test_searches_name_and_email_and_counts_within_the_search(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin', 'email' => 'anna@example.test']);
        User::factory()->create(['name' => 'Marco Rossi', 'email' => 'm.rossi@example.test']);
        User::factory()->create(['name' => 'Giulia Verdi', 'email' => 'giulia.rossi@example.test']);

        $response = $this->actingAs($admin)->getJson('/api/users?search=rossi')->assertOk();

        $response->assertJsonCount(2, 'data');
        $response->assertJsonPath('meta.counts.all', 2);
    }

    public function test_search_wildcards_are_literal(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->create(['name' => 'Mario']);

        $this->actingAs($admin)->getJson('/api/users?search=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_paginates_by_twenty_five(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(30)->create();

        $this->actingAs($admin)->getJson('/api/users?page=2')
            ->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonPath('meta.per_page', 25)
            ->assertJsonPath('meta.current_page', 2);
    }

    public function test_invited_users_show_when_the_invitation_expires(): void
    {
        $admin = User::factory()->admin()->create();
        $invitation = Invitation::factory()->create();

        $this->actingAs($admin)->getJson('/api/users?filter[status]=invited')
            ->assertOk()
            ->assertJsonPath('data.0.invitation_expires_at', $invitation->expires_at->toIso8601String());
    }

    public function test_rejects_unknown_filters(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->getJson('/api/users?filter[status]=deleted')->assertUnprocessable();
        $this->actingAs($admin)->getJson('/api/users?filter[role]=root')->assertUnprocessable();
    }
}
