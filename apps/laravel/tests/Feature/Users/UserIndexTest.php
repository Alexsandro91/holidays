<?php

namespace Tests\Feature\Users;

use App\Http\Resources\ManagedUserResource;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class UserIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_get_401_employees_403_and_managers_the_list(): void
    {
        $this->getJson('/api/users')->assertUnauthorized();
        $this->actingAs(User::factory()->create())->getJson('/api/users')->assertForbidden();
        $this->actingAs(User::factory()->manager()->create())->getJson('/api/users')->assertOk();
    }

    public function test_lists_users_with_exactly_the_managed_fields(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
        User::factory()->create(['name' => 'Bruno Bianchi', 'last_login_at' => now()]);

        $response = $this->actingAs($admin)->getJson('/api/users')->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(
            ['id', 'name', 'email', 'role', 'role_label', 'status', 'status_label', 'invitation_expires_at', 'is_current_user', 'can'],
            array_keys($response->json('data.0')),
        );
        // Limite di finalità (spec §7.3): niente ultimo accesso nella gestione utenti
        $response->assertJsonMissingPath('data.1.last_login_at');
        $response->assertJsonPath('data.0.is_current_user', true);
        $response->assertJsonPath('data.1.is_current_user', false);
    }

    public function test_each_row_says_what_the_viewer_may_do(): void
    {
        $manager = User::factory()->manager()->create(['name' => 'A Manager']);
        User::factory()->admin()->create(['name' => 'B Admin']);
        User::factory()->create(['name' => 'C Employee']);
        $all = ['resend_invitation' => true, 'cancel_invitation' => true, 'change_role' => true, 'disable' => true, 'enable' => true];
        $none = array_map(fn (): bool => false, $all);

        $this->actingAs($manager)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.can', [...$all, 'change_role' => false, 'disable' => false])
            ->assertJsonPath('data.1.can', $none)
            ->assertJsonPath('data.2.can', $all);
    }

    public function test_an_admin_may_act_on_other_admins_except_changing_their_role(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'A Admin']);
        User::factory()->admin()->create(['name' => 'B Admin']);

        $this->actingAs($admin)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.can', ['resend_invitation' => true, 'cancel_invitation' => true, 'change_role' => false, 'disable' => false, 'enable' => true])
            ->assertJsonPath('data.1.can', ['resend_invitation' => true, 'cancel_invitation' => true, 'change_role' => false, 'disable' => true, 'enable' => true]);
    }

    public function test_the_permissions_of_a_row_need_no_query(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        $request = Request::create('/api/users');
        $request->setUserResolver(fn (): User => $admin);
        $queries = 0;
        DB::listen(function () use (&$queries): void {
            $queries++;
        });

        $row = (new ManagedUserResource($target))->toArray($request);

        $this->assertSame(0, $queries);
        $this->assertTrue($row['can']['disable']);
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

    public function test_filters_by_name_and_email_ignoring_case_and_counts_within_the_filters(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin', 'email' => 'anna@example.test']);
        User::factory()->create(['name' => 'Marco Rossi', 'email' => 'm.rossi@example.test']);
        User::factory()->disabled()->create(['name' => 'Giulia ROSSI', 'email' => 'giulia@example.test']);
        User::factory()->create(['name' => 'Paolo Verdi', 'email' => 'paolo.rossi@example.test']);

        $this->actingAs($admin)->getJson('/api/users?filter[name]=rossi')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.counts', ['all' => 2, 'active' => 1, 'invited' => 0, 'disabled' => 1]);

        $this->actingAs($admin)->getJson('/api/users?filter[email]=ROSSI')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Marco Rossi')
            ->assertJsonPath('data.1.name', 'Paolo Verdi');

        // I due filtri valgono insieme
        $this->actingAs($admin)->getJson('/api/users?filter[name]=rossi&filter[email]=m.rossi')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Marco Rossi');
    }

    public function test_counts_follow_name_email_and_role_but_not_the_status(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
        User::factory()->manager()->create(['name' => 'Marco Rossi']);
        User::factory()->manager()->disabled()->create(['name' => 'Giulia Rossi']);
        User::factory()->manager()->invited()->create(['name' => 'Paolo Rossi']);
        User::factory()->create(['name' => 'Sara Rossi']);

        $this->actingAs($admin)->getJson('/api/users?filter[role]=manager&filter[name]=rossi&filter[status]=disabled')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Giulia Rossi')
            ->assertJsonPath('meta.counts', ['all' => 3, 'active' => 1, 'invited' => 1, 'disabled' => 1]);
    }

    public function test_like_wildcards_are_literal(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin', 'email' => 'anna@example.test']);
        User::factory()->create(['name' => 'Mario_Rossi 100%', 'email' => 'mario_rossi@example.test']);
        User::factory()->create(['name' => 'Mario Bianchi', 'email' => 'marioxrossi@example.test']);
        User::factory()->create(['name' => 'Back\\slash', 'email' => 'backslash@example.test']);

        // %, _ e \ (codificati nell'URL dove serve)
        foreach (['%25', '_', '%5C'] as $wildcard) {
            $this->actingAs($admin)->getJson("/api/users?filter[name]={$wildcard}")->assertOk()->assertJsonCount(1, 'data');
        }

        $this->actingAs($admin)->getJson('/api/users?filter[email]=o_r')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', 'mario_rossi@example.test');
        $this->actingAs($admin)->getJson('/api/users?filter[email]=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_the_old_search_parameter_no_longer_filters(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
        User::factory()->create(['name' => 'Marco Rossi']);

        $this->actingAs($admin)->getJson('/api/users?search=rossi')->assertOk()->assertJsonCount(2, 'data');
    }

    /**
     * @return array<string, array{string, list<string>}>
     */
    public static function sorts(): array
    {
        return [
            'nome' => ['name', ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena']],
            'nome decrescente' => ['-name', ['Elena', 'Dario', 'Carla', 'Bruno', 'Anna']],
            'email' => ['email', ['Bruno', 'Carla', 'Anna', 'Dario', 'Elena']],
            'email decrescente' => ['-email', ['Elena', 'Dario', 'Anna', 'Carla', 'Bruno']],
            // Gerarchia (dipendente, responsabile, admin), non ordine alfabetico; spareggio sempre per id crescente
            'ruolo' => ['role', ['Bruno', 'Carla', 'Elena', 'Anna', 'Dario']],
            'ruolo decrescente' => ['-role', ['Dario', 'Anna', 'Bruno', 'Carla', 'Elena']],
            // Attivo, invitato, disattivato
            'stato' => ['status', ['Dario', 'Anna', 'Elena', 'Bruno', 'Carla']],
            'stato decrescente' => ['-status', ['Carla', 'Bruno', 'Dario', 'Anna', 'Elena']],
        ];
    }

    /**
     * @param  list<string>  $expected
     */
    #[DataProvider('sorts')]
    public function test_sorts_by_every_column_in_both_directions(string $sort, array $expected): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Dario', 'email' => 'd@example.test']);
        User::factory()->manager()->create(['name' => 'Anna', 'email' => 'c@example.test']);
        User::factory()->invited()->create(['name' => 'Bruno', 'email' => 'a@example.test']);
        User::factory()->disabled()->create(['name' => 'Carla', 'email' => 'b@example.test']);
        User::factory()->create(['name' => 'Elena', 'email' => 'e@example.test']);

        $response = $this->actingAs($admin)->getJson("/api/users?sort={$sort}")->assertOk();

        $this->assertSame($expected, array_column($response->json('data'), 'name'));
    }

    public function test_sorts_by_name_by_default_with_the_id_as_tie_break(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Zeno']);
        $first = User::factory()->create(['name' => 'Mario']);
        $second = User::factory()->create(['name' => 'Mario']);

        $this->actingAs($admin)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.id', $first->id)
            ->assertJsonPath('data.1.id', $second->id)
            ->assertJsonPath('data.2.id', $admin->id);
    }

    public function test_the_page_size_can_be_ten_or_fifty(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(54)->create();

        $this->actingAs($admin)->getJson('/api/users?per_page=10&page=3')
            ->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('meta.last_page', 6)
            ->assertJsonPath('meta.total', 55);
        $this->actingAs($admin)->getJson('/api/users?per_page=50&page=2')
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.per_page', 50);
    }

    public function test_the_page_links_keep_filters_and_sort(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(12)->create();

        $next = $this->actingAs($admin)->getJson('/api/users?per_page=10&sort=-email&filter[role]=employee')
            ->assertOk()
            ->json('links.next');

        $this->assertIsString($next);
        $this->assertStringContainsString('sort=-email', urldecode($next));
        $this->assertStringContainsString('filter[role]=employee', urldecode($next));
        $this->assertStringContainsString('per_page=10', $next);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function invalidQueries(): array
    {
        return [
            'stato sconosciuto' => ['filter[status]=deleted', 'filter.status'],
            'ruolo sconosciuto' => ['filter[role]=root', 'filter.role'],
            'nome troppo lungo' => ['filter[name]='.str_repeat('a', 101), 'filter.name'],
            'email troppo lunga' => ['filter[email]='.str_repeat('a', 101), 'filter.email'],
            'nome non testo' => ['filter[name][]=a', 'filter.name'],
            'ordinamento sconosciuto' => ['sort=password', 'sort'],
            'doppio meno' => ['sort=--name', 'sort'],
            'più colonne' => ['sort=name,email', 'sort'],
            'righe per pagina non ammesse' => ['per_page=20', 'per_page'],
            'righe per pagina non numeriche' => ['per_page=tutte', 'per_page'],
            'pagina zero' => ['page=0', 'page'],
        ];
    }

    #[DataProvider('invalidQueries')]
    public function test_rejects_invalid_values(string $query, string $field): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->getJson("/api/users?{$query}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);
    }

    public function test_paginates_by_twenty_five_by_default(): void
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
}
