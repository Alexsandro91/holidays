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
        $manager = User::factory()->manager()->create(['first_name' => 'Anna', 'last_name' => 'Aldi']);
        User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Bianchi', 'last_login_at' => now()]);

        $response = $this->actingAs($manager)->getJson('/api/users')->assertOk();

        $response->assertJsonCount(2, 'data');
        $this->assertSame(
            ['id', 'first_name', 'last_name', 'name', 'email', 'role', 'role_label', 'employment_type', 'employment_type_label', 'status', 'status_label', 'location', 'invitation_expires_at', 'is_current_user', 'can'],
            array_keys($response->json('data.0')),
        );
        $response->assertJsonPath('data.0.first_name', 'Anna')
            ->assertJsonPath('data.0.last_name', 'Aldi')
            ->assertJsonPath('data.0.name', 'Anna Aldi');
        // Limite di finalità (spec §7.3): niente ultimo accesso nella gestione utenti
        $response->assertJsonMissingPath('data.1.last_login_at');
        $response->assertJsonPath('data.0.is_current_user', true);
        $response->assertJsonPath('data.1.is_current_user', false);
    }

    public function test_each_row_says_what_the_viewer_may_do(): void
    {
        $manager = User::factory()->manager()->create(['last_name' => 'A']);
        User::factory()->create(['last_name' => 'C']);
        $all = ['resend_invitation' => true, 'cancel_invitation' => true, 'change_role' => true, 'disable' => true, 'enable' => true, 'update' => true, 'send_password_reset' => true, 'change_location' => false, 'manage_schedule' => false, 'view_history' => true, 'manage_absence_types' => false, 'view_balances' => true, 'adjust_balances' => true];

        $this->actingAs($manager)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.can', [...$all, 'change_role' => false, 'disable' => false, 'send_password_reset' => false, 'adjust_balances' => false])
            ->assertJsonPath('data.1.can', $all);
    }

    public function test_an_admin_may_act_on_other_admins_except_changing_their_role(): void
    {
        $admin = User::factory()->admin()->create(['last_name' => 'A']);
        User::factory()->admin()->create(['last_name' => 'B']);

        // Gli admin non sono più nella lista utenti: i loro permessi si leggono dalla pagina Amministratori
        $this->actingAs($admin)->getJson('/api/administrators')
            ->assertOk()
            ->assertJsonPath('data.0.can', ['resend_invitation' => true, 'cancel_invitation' => true, 'change_role' => false, 'disable' => false, 'enable' => true, 'update' => true, 'send_password_reset' => false, 'change_location' => true, 'manage_schedule' => true, 'view_history' => true, 'manage_absence_types' => true, 'view_balances' => true, 'adjust_balances' => false])
            ->assertJsonPath('data.1.can', ['resend_invitation' => true, 'cancel_invitation' => true, 'change_role' => false, 'disable' => true, 'enable' => true, 'update' => true, 'send_password_reset' => true, 'change_location' => true, 'manage_schedule' => true, 'view_history' => true, 'manage_absence_types' => true, 'view_balances' => true, 'adjust_balances' => true]);
    }

    public function test_admins_never_appear_in_the_list_nor_in_the_counts(): void
    {
        $admin = User::factory()->admin()->create(['last_name' => 'Attivo']);
        User::factory()->admin()->invited()->create(['last_name' => 'Invitato']);
        User::factory()->admin()->disabled()->create(['last_name' => 'Disattivo']);
        $employee = User::factory()->create(['last_name' => 'Dipendente']);
        $manager = User::factory()->manager()->create(['last_name' => 'Responsabile']);

        foreach ([$admin, $manager] as $actor) {
            $response = $this->actingAs($actor)->getJson('/api/users')->assertOk();

            $ids = array_column($response->json('data'), 'id');
            sort($ids);
            $this->assertSame([$employee->id, $manager->id], $ids);
            $response->assertJsonPath('meta.counts', ['all' => 2, 'active' => 2, 'invited' => 0, 'disabled' => 0]);

            $this->actingAs($actor)->getJson('/api/users?filter[status]=disabled')->assertOk()->assertJsonCount(0, 'data');
            $this->actingAs($actor)->getJson('/api/users?filter[search]=Attivo')->assertOk()->assertJsonCount(0, 'data');
        }
    }

    public function test_the_role_filter_does_not_accept_admin(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->getJson('/api/users?filter[role]=admin')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('filter.role');
        $this->actingAs($admin)->getJson('/api/users?filter[role]=manager')->assertOk();
        $this->actingAs($admin)->getJson('/api/users?filter[role]=employee')->assertOk();
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

        $response->assertJsonCount(2, 'data');
        $response->assertJsonPath('meta.counts', ['all' => 4, 'active' => 2, 'invited' => 1, 'disabled' => 1]);
    }

    private function createSearchFixture(): User
    {
        $admin = User::factory()->admin()->create(['first_name' => 'Anna', 'last_name' => 'Admin', 'email' => 'anna@example.test']);
        User::factory()->create(['first_name' => 'Mario', 'last_name' => 'Rossi', 'email' => 'mario.r@example.test']);
        User::factory()->disabled()->create(['first_name' => 'Maria', 'last_name' => 'ROSSINI', 'email' => 'mrossini@example.test']);
        User::factory()->create(['first_name' => 'Paolo', 'last_name' => 'Verdi', 'email' => 'paolo.rossi@example.test']);
        User::factory()->create(['first_name' => 'Mario', 'last_name' => 'Bianchi', 'email' => 'mbianchi@example.test']);

        return $admin;
    }

    /**
     * @param  list<string>  $expected
     */
    #[DataProvider('searches')]
    public function test_the_search_matches_every_word_in_first_name_last_name_or_email(string $search, array $expected): void
    {
        $admin = $this->createSearchFixture();

        $response = $this->actingAs($admin)->getJson('/api/users?sort=email&filter[search]='.rawurlencode($search))->assertOk();

        $this->assertSame($expected, array_column($response->json('data'), 'email'));
        $this->assertSame(count($expected), $response->json('meta.counts.all'));
    }

    /**
     * @return array<string, array{string, list<string>}>
     */
    public static function searches(): array
    {
        return [
            'nome e cognome' => ['Mario Rossi', ['mario.r@example.test']],
            'cognome e nome' => ['rossi mario', ['mario.r@example.test']],
            'parte di email' => ['rossi@', ['paolo.rossi@example.test']],
            'una parola in campi diversi' => ['ross', ['mario.r@example.test', 'mrossini@example.test', 'paolo.rossi@example.test']],
            'spazi in eccesso' => ['  mario   bianchi ', ['mbianchi@example.test']],
            'nessun risultato' => ['mario verdi', []],
            // Contano solo le prime 5 parole distinte: la sesta ("zzz") è ignorata
            'oltre cinque parole' => ['mario rossi mario example test r zzz', ['mario.r@example.test']],
        ];
    }

    public function test_filters_by_first_name_last_name_and_email_ignoring_case(): void
    {
        $admin = $this->createSearchFixture();

        $this->actingAs($admin)->getJson('/api/users?filter[first_name]=MARI')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.counts', ['all' => 3, 'active' => 2, 'invited' => 0, 'disabled' => 1]);
        $this->actingAs($admin)->getJson('/api/users?filter[last_name]=rossi')->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($admin)->getJson('/api/users?filter[email]=ROSSI')->assertOk()->assertJsonCount(2, 'data');

        // I filtri valgono insieme, anche con la ricerca
        $this->actingAs($admin)->getJson('/api/users?filter[first_name]=mario&filter[last_name]=rossi')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Mario Rossi');
        $this->actingAs($admin)->getJson('/api/users?filter[search]=ross&filter[email]=example&filter[first_name]=maria')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', 'mrossini@example.test');
    }

    public function test_counts_follow_search_fields_and_role_but_not_the_status(): void
    {
        $admin = User::factory()->admin()->create(['first_name' => 'Anna', 'last_name' => 'Admin']);
        User::factory()->manager()->create(['first_name' => 'Marco', 'last_name' => 'Rossi']);
        User::factory()->manager()->disabled()->create(['first_name' => 'Giulia', 'last_name' => 'Rossi']);
        User::factory()->manager()->invited()->create(['first_name' => 'Paolo', 'last_name' => 'Rossi']);
        User::factory()->create(['first_name' => 'Sara', 'last_name' => 'Rossi']);

        $this->actingAs($admin)->getJson('/api/users?filter[role]=manager&filter[search]=rossi&filter[status]=disabled')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Giulia Rossi')
            ->assertJsonPath('meta.counts', ['all' => 3, 'active' => 1, 'invited' => 1, 'disabled' => 1]);
        // Marco e Paolo hanno una "o" nel nome
        $this->actingAs($admin)->getJson('/api/users?filter[last_name]=rossi&filter[first_name]=o')
            ->assertOk()
            ->assertJsonPath('meta.counts', ['all' => 2, 'active' => 1, 'invited' => 1, 'disabled' => 0]);
    }

    public function test_like_wildcards_are_literal(): void
    {
        $admin = User::factory()->admin()->create(['first_name' => 'Anna', 'last_name' => 'Admin', 'email' => 'anna@example.test']);
        User::factory()->create(['first_name' => 'Mario_Rossi', 'last_name' => '100%', 'email' => 'mario_rossi@example.test']);
        User::factory()->create(['first_name' => 'Mario', 'last_name' => 'Bianchi', 'email' => 'marioxrossi@example.test']);
        User::factory()->create(['first_name' => 'Back\\slash', 'last_name' => 'Verdi', 'email' => 'backslash@example.test']);

        // %, _ e \ (codificati nell'URL), sia nella ricerca sia nei filtri per campo
        foreach (['%25', '_', '%5C'] as $wildcard) {
            $this->actingAs($admin)->getJson("/api/users?filter[search]={$wildcard}")->assertOk()->assertJsonCount(1, 'data');
        }

        $this->actingAs($admin)->getJson('/api/users?filter[last_name]=%25')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($admin)->getJson('/api/users?filter[first_name]=o_r')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($admin)->getJson('/api/users?filter[email]=o_r')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', 'mario_rossi@example.test');
        $this->actingAs($admin)->getJson('/api/users?filter[email]=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_old_parameters_no_longer_filter(): void
    {
        $admin = User::factory()->admin()->create(['first_name' => 'Anna', 'last_name' => 'Admin']);
        User::factory()->create(['first_name' => 'Marco', 'last_name' => 'Rossi']);
        User::factory()->create(['first_name' => 'Luca', 'last_name' => 'Verdi']);

        $this->actingAs($admin)->getJson('/api/users?search=rossi')->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($admin)->getJson('/api/users?filter[name]=rossi')->assertOk()->assertJsonCount(2, 'data');
    }

    /**
     * @return array<string, array{string, list<string>}>
     */
    public static function sorts(): array
    {
        return [
            'nome' => ['first_name', ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena']],
            'nome decrescente' => ['-first_name', ['Elena', 'Dario', 'Carla', 'Bruno', 'Anna']],
            'cognome' => ['last_name', ['Bruno', 'Carla', 'Anna', 'Elena', 'Dario']],
            'cognome decrescente' => ['-last_name', ['Dario', 'Elena', 'Anna', 'Carla', 'Bruno']],
            'email' => ['email', ['Bruno', 'Carla', 'Anna', 'Dario', 'Elena']],
            'email decrescente' => ['-email', ['Elena', 'Dario', 'Anna', 'Carla', 'Bruno']],
            // Gerarchia (dipendente, responsabile), non ordine alfabetico; spareggio per id crescente
            'ruolo' => ['role', ['Bruno', 'Carla', 'Elena', 'Dario', 'Anna']],
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
        $admin = User::factory()->admin()->create();
        User::factory()->manager()->create(['first_name' => 'Dario', 'last_name' => 'Esposito', 'email' => 'd@example.test']);
        User::factory()->manager()->create(['first_name' => 'Anna', 'last_name' => 'Conti', 'email' => 'c@example.test']);
        User::factory()->invited()->create(['first_name' => 'Bruno', 'last_name' => 'Arena', 'email' => 'a@example.test']);
        User::factory()->disabled()->create(['first_name' => 'Carla', 'last_name' => 'Bruni', 'email' => 'b@example.test']);
        User::factory()->create(['first_name' => 'Elena', 'last_name' => 'Dini', 'email' => 'e@example.test']);

        $response = $this->actingAs($admin)->getJson("/api/users?sort={$sort}")->assertOk();

        $this->assertSame($expected, array_column($response->json('data'), 'first_name'));
    }

    public function test_sorts_by_last_name_then_first_name_then_id_by_default(): void
    {
        $admin = User::factory()->admin()->create();
        $zeno = User::factory()->create(['first_name' => 'Zeno', 'last_name' => 'Bianchi']);
        $mario = User::factory()->create(['first_name' => 'Mario', 'last_name' => 'Rossi']);
        $firstAnna = User::factory()->create(['first_name' => 'Anna', 'last_name' => 'Rossi']);
        $secondAnna = User::factory()->create(['first_name' => 'Anna', 'last_name' => 'Rossi']);

        $response = $this->actingAs($admin)->getJson('/api/users')->assertOk();

        $this->assertSame([$zeno->id, $firstAnna->id, $secondAnna->id, $mario->id], array_column($response->json('data'), 'id'));
    }

    public function test_the_page_size_can_be_ten_or_fifty(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(55)->create();

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
            'ricerca troppo lunga' => ['filter[search]='.str_repeat('a', 101), 'filter.search'],
            'nome troppo lungo' => ['filter[first_name]='.str_repeat('a', 101), 'filter.first_name'],
            'cognome troppo lungo' => ['filter[last_name]='.str_repeat('a', 101), 'filter.last_name'],
            'email troppo lunga' => ['filter[email]='.str_repeat('a', 101), 'filter.email'],
            'cognome non testo' => ['filter[last_name][]=a', 'filter.last_name'],
            'ricerca non testo' => ['filter[search][]=a', 'filter.search'],
            'ordinamento sconosciuto' => ['sort=password', 'sort'],
            'vecchio ordinamento per nome' => ['sort=name', 'sort'],
            'doppio meno' => ['sort=--last_name', 'sort'],
            'più colonne' => ['sort=last_name,email', 'sort'],
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
        User::factory()->count(31)->create();

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
