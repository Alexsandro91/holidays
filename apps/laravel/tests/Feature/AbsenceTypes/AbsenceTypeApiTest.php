<?php

namespace Tests\Feature\AbsenceTypes;

use App\Enums\BalanceType;
use App\Models\AbsenceType;
use App\Models\User;
use App\Services\AbsenceTypeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Tipi di assenza (spec §3.3): solo admin.
 */
class AbsenceTypeApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-20 10:00');
        $this->admin = User::factory()->admin()->create();
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function routes(): array
    {
        return [
            'index' => ['GET', '/api/absence-types'],
            'store' => ['POST', '/api/absence-types'],
            'order' => ['PUT', '/api/absence-types/order'],
            'update' => ['PATCH', '/api/absence-types/{id}'],
            'archive' => ['POST', '/api/absence-types/{id}/archive'],
            'restore' => ['POST', '/api/absence-types/{id}/restore'],
        ];
    }

    #[DataProvider('routes')]
    public function test_route_matrix(string $method, string $uri): void
    {
        $id = AbsenceType::factory()->create()->id;
        $uri = str_replace('{id}', (string) $id, $uri);

        $this->json($method, $uri)->assertUnauthorized();

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $user) {
            $this->actingAs($user)->json($method, $uri)->assertForbidden();
        }

        if (str_contains($uri, (string) $id)) {
            $this->actingAs($this->admin)->json($method, str_replace((string) $id, '999999', $uri))->assertNotFound();
        }

        $this->assertDatabaseCount('absence_types', 17);
    }

    public function test_index_lists_active_types_by_position_with_counts(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/absence-types')
            ->assertOk()
            ->assertJsonCount(16, 'data')
            ->assertJsonPath('meta.counts', ['active' => 16, 'archived' => 0])
            ->assertJsonPath('data.0.name', 'Ferie')
            ->assertJsonPath('data.0.code', 'vacation')
            ->assertJsonPath('data.0.is_system', true)
            ->assertJsonPath('data.0.custom_name', null)
            ->assertJsonPath('data.0.balance', 'vacation')
            ->assertJsonPath('data.0.enabled_users_count', null)
            ->assertJsonPath('data.6.code', 'law_104')
            ->assertJsonPath('data.6.enabled_users_count', 0)
            ->assertJsonPath('data.6.limit', ['amount' => 3, 'unit' => 'days', 'period' => 'month']);
    }

    public function test_index_counts_enabled_users_and_filters_archived(): void
    {
        $type = AbsenceType::query()->where('code', 'law_104')->firstOrFail();
        $type->enabledUsers()->attach(User::factory()->create()->id);
        AbsenceType::factory()->archived()->create(['name' => 'Vecchio']);

        $this->actingAs($this->admin)->getJson('/api/absence-types')
            ->assertJsonPath('data.6.enabled_users_count', 1)
            ->assertJsonPath('meta.counts.archived', 1);

        $this->actingAs($this->admin)->getJson('/api/absence-types?filter[status]=archived')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Vecchio');

        $this->actingAs($this->admin)->getJson('/api/absence-types?filter[status]=wrong')->assertUnprocessable();
    }

    public function test_store_appends_a_custom_type(): void
    {
        $this->actingAs($this->admin)->postJson('/api/absence-types', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.name', 'Corso sicurezza')
            ->assertJsonPath('data.position', 17)
            ->assertJsonPath('data.is_system', false)
            ->assertJsonPath('data.code', null)
            ->assertJsonPath('data.limit', null);

        $this->assertDatabaseHas('absence_types', ['name' => 'Corso sicurezza', 'code' => null, 'position' => 17]);
    }

    public function test_store_saves_balance_and_limit(): void
    {
        $this->actingAs($this->admin)->postJson('/api/absence-types', $this->payload([
            'balance' => 'rol',
            'employment_types' => ['employee'],
            'limit' => ['amount' => 8, 'unit' => 'hours', 'period' => 'year'],
        ]))
            ->assertCreated()
            ->assertJsonPath('data.balance', 'rol')
            ->assertJsonPath('data.limit', ['amount' => 8, 'unit' => 'hours', 'period' => 'year']);

        $this->assertSame(BalanceType::Rol, AbsenceType::query()->where('name', 'Corso sicurezza')->firstOrFail()->balance);
    }

    public function test_code_in_the_body_is_ignored_on_store(): void
    {
        $this->actingAs($this->admin)->postJson('/api/absence-types', $this->payload(['code' => 'hacked', 'position' => 1]))
            ->assertCreated()
            ->assertJsonPath('data.code', null)
            ->assertJsonPath('data.position', 17);
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string|null}>
     */
    public static function invalidPayloads(): array
    {
        return [
            'no unit' => [['allows_days' => false, 'allows_half_days' => false, 'allows_hours' => false], 'allows_days', 'You must choose'],
            'half days without days' => [['allows_days' => false, 'allows_half_days' => true, 'allows_hours' => true], 'allows_half_days', null],
            'balance for non employees' => [['balance' => 'vacation', 'employment_types' => ['employee', 'intern']], 'employment_types', null],
            'incomplete limit' => [['limit' => ['unit' => 'days', 'period' => 'year']], 'limit.amount', null],
            'limit amount zero' => [['limit' => ['amount' => 0, 'unit' => 'days', 'period' => 'year']], 'limit.amount', null],
            'name of a starting type, uppercase' => [['name' => 'FERIE'], 'name', null],
            'name of an archived type' => [['name' => 'Archiviato'], 'name', null],
            'name of an active custom type, other case' => [['name' => 'ESISTENTE'], 'name', null],
            'missing name' => [['name' => null], 'name', null],
            'blank name' => [['name' => '   '], 'name', null],
            'name too long' => [['name' => 'x'], 'name', null],
            'no employment types' => [['employment_types' => []], 'employment_types', null],
            'invalid day count' => [['day_count' => 'weekly'], 'day_count', null],
        ];
    }

    /**
     * @param  array<string, mixed>  $override
     */
    #[DataProvider('invalidPayloads')]
    public function test_validation_rules(array $override, string $field, ?string $unused): void
    {
        AbsenceType::factory()->archived()->create(['name' => 'Archiviato']);
        AbsenceType::factory()->create(['name' => 'Esistente']);

        if (($override['name'] ?? null) === 'x') {
            $override['name'] = str_repeat('x', 101);
        }

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload($override))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertDatabaseCount('absence_types', 18);
    }

    public function test_validation_messages_use_the_contract_keys(): void
    {
        $this->admin = $this->englishAdmin();

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['allows_days' => false, 'allows_hours' => false]))
            ->assertJsonValidationErrors(['allows_days' => 'Choose at least one option: days, half days or hours.']);

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['allows_days' => false, 'allows_half_days' => true]))
            ->assertJsonValidationErrors(['allows_half_days' => 'Half days require whole days.']);

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['balance' => 'rol', 'employment_types' => ['employee', 'intern']]))
            ->assertJsonValidationErrors(['employment_types' => 'A type with a balance only applies to employees.']);

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['limit' => ['unit' => 'days', 'period' => 'year']]))
            ->assertJsonValidationErrors(['limit.amount' => 'Provide amount, unit and period of the limit, or none of them.']);

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['name' => 'VACATION']))
            ->assertJsonValidationErrors(['name' => 'An absence type with this name already exists.']);
    }

    public function test_name_uniqueness_ignores_case_among_custom_types(): void
    {
        $this->admin = $this->englishAdmin();
        AbsenceType::factory()->create(['name' => 'Corso sicurezza']);

        $this->actingAs($this->admin)->postJson('/api/absence-types', $this->payload(['name' => 'CORSO SICUREZZA']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name' => 'An absence type with this name already exists.']);
    }

    public function test_translated_name_is_checked_in_the_request_language(): void
    {
        $this->admin = $this->englishAdmin();

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['name' => 'vacation']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');

        // "Ferie" in inglese non coincide con nessun nome tradotto
        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['name' => 'Ferie']))
            ->assertCreated();
    }

    public function test_a_renamed_starting_type_frees_its_translated_name(): void
    {
        $vacation = AbsenceType::query()->where('code', 'vacation')->firstOrFail();
        $vacation->forceFill(['name' => 'Vacanze'])->save();

        $this->actingAs($this->admin)
            ->postJson('/api/absence-types', $this->payload(['name' => 'ferie']))
            ->assertCreated();
    }

    public function test_system_type_can_be_renamed_and_reset(): void
    {
        $vacation = AbsenceType::query()->where('code', 'vacation')->firstOrFail();

        $this->actingAs($this->admin)
            ->patchJson("/api/absence-types/{$vacation->id}", ['name' => 'Vacanze', 'code' => 'hacked'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Vacanze')
            ->assertJsonPath('data.custom_name', 'Vacanze')
            ->assertJsonPath('data.code', 'vacation');

        $this->actingAs($this->admin)
            ->patchJson("/api/absence-types/{$vacation->id}", ['name' => null])
            ->assertOk()
            ->assertJsonPath('data.name', 'Ferie')
            ->assertJsonPath('data.custom_name', null)
            ->assertJsonPath('data.code', 'vacation');

        $this->assertSame('vacation', $vacation->fresh()->code);
    }

    public function test_a_system_type_may_keep_its_own_translated_name(): void
    {
        $vacation = AbsenceType::query()->where('code', 'vacation')->firstOrFail();

        $this->actingAs($this->admin)
            ->patchJson("/api/absence-types/{$vacation->id}", ['requires_approval' => false])
            ->assertOk()
            ->assertJsonPath('data.requires_approval', false)
            ->assertJsonPath('data.name', 'Ferie');
    }

    public function test_custom_type_cannot_lose_its_name(): void
    {
        $type = AbsenceType::factory()->create();

        $this->actingAs($this->admin)->patchJson("/api/absence-types/{$type->id}", ['name' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');

        $this->assertNotNull($type->fresh()->name);
    }

    public function test_update_checks_cross_field_rules_against_the_stored_values(): void
    {
        $vacation = AbsenceType::query()->where('code', 'vacation')->firstOrFail();

        // Le ferie hanno un saldo: aggiungere un tipo di rapporto non dipendente è vietato
        $this->actingAs($this->admin)->patchJson("/api/absence-types/{$vacation->id}", ['employment_types' => ['employee', 'intern']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employment_types');

        // Le ferie sono a giorni: togliere i giorni lasciando le mezze giornate è vietato
        $this->actingAs($this->admin)->patchJson("/api/absence-types/{$vacation->id}", ['allows_days' => false])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('allows_half_days');

        // Il limite si toglie con null e si sostituisce per intero
        $law = AbsenceType::query()->where('code', 'law_104')->firstOrFail();
        $this->actingAs($this->admin)->patchJson("/api/absence-types/{$law->id}", ['limit' => null])
            ->assertOk()->assertJsonPath('data.limit', null);
        $this->actingAs($this->admin)->patchJson("/api/absence-types/{$law->id}", ['limit' => ['amount' => 5, 'unit' => 'hours', 'period' => 'month']])
            ->assertOk()->assertJsonPath('data.limit', ['amount' => 5, 'unit' => 'hours', 'period' => 'month']);
    }

    public function test_archive_and_restore(): void
    {
        $type = AbsenceType::factory()->create(['name' => 'Da archiviare']);

        $this->actingAs($this->admin)->postJson("/api/absence-types/{$type->id}/archive")
            ->assertOk()->assertJsonPath('data.name', 'Da archiviare');
        $this->assertNotNull($type->fresh()->archived_at);

        $active = $this->actingAs($this->admin)->getJson('/api/absence-types?filter[status]=active')
            ->assertJsonCount(16, 'data')
            ->assertJsonPath('meta.counts.archived', 1);
        $this->assertNotContains($type->id, array_column($active->json('data'), 'id'));

        $this->actingAs($this->admin)->postJson("/api/absence-types/{$type->id}/restore")
            ->assertOk()->assertJsonPath('data.archived_at', null);
        $this->assertNull($type->fresh()->archived_at);
    }

    public function test_reorder_requires_the_full_active_list(): void
    {
        $this->admin = $this->englishAdmin();
        $archived = AbsenceType::factory()->archived()->create();
        $ids = AbsenceType::query()->active()->ordered()->pluck('id')->all();
        $reversed = array_reverse($ids);

        $this->actingAs($this->admin)->putJson('/api/absence-types/order', ['ids' => $reversed])->assertNoContent();

        $this->assertSame($reversed, AbsenceType::query()->active()->ordered()->pluck('id')->all());
        $this->assertSame(1, AbsenceType::query()->findOrFail($reversed[0])->position);

        $this->actingAs($this->admin)
            ->putJson('/api/absence-types/order', ['ids' => array_slice($ids, 1)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ids');

        $this->actingAs($this->admin)->putJson('/api/absence-types/order', ['ids' => [...$ids, $archived->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['ids' => 'The list does not match the active types.']);

        $this->actingAs($this->admin)->putJson('/api/absence-types/order', ['ids' => [...array_slice($ids, 1), $ids[1]]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ids.15');

        $this->assertSame($reversed, AbsenceType::query()->active()->ordered()->pluck('id')->all());
    }

    public function test_unique_index_race_on_name_answers_422(): void
    {
        $service = app(AbsenceTypeService::class);
        AbsenceType::factory()->create(['name' => 'Corso sicurezza']);

        // Salta la validazione (come farebbe la seconda di due richieste in corsa): risponde l'indice
        try {
            $service->create(['name' => 'corso SICUREZZA', 'allows_days' => true, 'allows_half_days' => false, 'allows_hours' => false,
                'requires_approval' => true, 'employment_types' => ['employee'], 'requires_enablement' => false,
                'day_count' => 'working', 'requires_certificate' => false], $this->admin);
            $this->fail('Il nome doppio doveva essere rifiutato.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('name', $exception->errors());
        }
    }

    public function test_changes_are_logged(): void
    {
        Log::spy();

        $created = $this->actingAs($this->admin)->postJson('/api/absence-types', $this->payload())->json('data.id');
        $this->actingAs($this->admin)->patchJson("/api/absence-types/{$created}", ['requires_approval' => false]);
        $this->actingAs($this->admin)->postJson("/api/absence-types/{$created}/archive");
        $this->actingAs($this->admin)->postJson("/api/absence-types/{$created}/restore");
        $this->actingAs($this->admin)->putJson('/api/absence-types/order', ['ids' => AbsenceType::query()->active()->ordered()->pluck('id')->all()]);

        $actor = fn (array $context): bool => $context['actor_id'] === $this->admin->id && isset($context['absence_type_id']);

        Log::shouldHaveReceived('info')->with('Absence type created', Mockery::on($actor))->once();
        Log::shouldHaveReceived('info')->with('Absence type updated', Mockery::on(fn (array $c): bool => $actor($c) && $c['changed_fields'] === ['requires_approval']))->once();
        Log::shouldHaveReceived('info')->with('Absence type archived', Mockery::on($actor))->once();
        Log::shouldHaveReceived('info')->with('Absence type restored', Mockery::on($actor))->once();
        Log::shouldHaveReceived('info')->with('Absence types reordered', Mockery::on(fn (array $c): bool => $c['actor_id'] === $this->admin->id && $c['count'] === 17))->once();
    }

    /**
     * La lingua dell'utente prevale su Accept-Language (SetLocale): per i testi inglesi serve un admin inglese.
     */
    private function englishAdmin(): User
    {
        return User::factory()->admin()->create(['locale' => 'en']);
    }

    /**
     * @param  array<string, mixed>  $override
     * @return array<string, mixed>
     */
    private function payload(array $override = []): array
    {
        return [
            'name' => 'Corso sicurezza',
            'allows_days' => false,
            'allows_half_days' => false,
            'allows_hours' => true,
            'balance' => null,
            'requires_approval' => true,
            'employment_types' => ['employee', 'contractor', 'intern'],
            'requires_enablement' => false,
            'day_count' => 'working',
            'requires_certificate' => false,
            'limit' => null,
            ...$override,
        ];
    }
}
