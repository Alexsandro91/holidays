<?php

namespace Tests\Feature\AbsenceTypes;

use App\Models\AbsenceType;
use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Abilitazioni per persona (spec §3.4): le gestisce solo l'admin, la persona vede i tipi che può usare.
 */
class EnablementApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $intern;

    private AbsenceType $law104;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-20 10:00');

        // La migration della fase 3 archivia malattia e infortunio: qui servono tutti e 16 i tipi di partenza
        AbsenceType::query()->whereIn('code', ['sickness', 'injury'])->update(['archived_at' => null]);
        $this->admin = User::factory()->admin()->create();
        $this->intern = User::factory()->intern()->create();
        $this->law104 = AbsenceType::query()->where('code', 'law_104')->firstOrFail();
    }

    private function type(string $code): AbsenceType
    {
        return AbsenceType::query()->where('code', $code)->firstOrFail();
    }

    public function test_admin_lists_types_for_the_person(): void
    {
        $response = $this->actingAs($this->admin)->getJson("/api/users/{$this->intern->id}/absence-types")->assertOk();

        $byId = collect($response->json('data'))->keyBy('id');
        $this->assertTrue($byId->has($this->type('sickness')->id));
        $this->assertTrue($byId->has($this->law104->id));
        $this->assertFalse($byId->has($this->type('vacation')->id));
        $this->assertFalse($byId->has($this->type('marriage_leave')->id));
        $this->assertFalse($byId[$this->law104->id]['enabled']);
        $this->assertTrue($byId[$this->law104->id]['requires_enablement']);
        $this->assertFalse($byId[$this->type('sickness')->id]['requires_enablement']);
    }

    public function test_admin_enables_and_disables(): void
    {
        $url = "/api/users/{$this->intern->id}/absence-type-enablements";
        Log::spy();

        $this->actingAs($this->admin)->putJson($url, ['absence_type_ids' => [$this->law104->id]])->assertNoContent();

        $this->assertDatabaseHas('absence_type_user', ['user_id' => $this->intern->id, 'absence_type_id' => $this->law104->id, 'actor_id' => $this->admin->id]);
        Log::shouldHaveReceived('info')->withArgs(fn (string $message, array $context): bool => $message === 'Absence type enablements changed'
            && $context['before'] === [] && $context['after'] === [$this->law104->id]);
        $this->actingAs($this->admin)->getJson("/api/users/{$this->intern->id}/absence-types")
            ->assertJsonFragment(['id' => $this->law104->id, 'enabled' => true]);

        $this->actingAs($this->admin)->putJson($url, ['absence_type_ids' => []])->assertNoContent();
        $this->assertSame(0, DB::table('absence_type_user')->where('user_id', $this->intern->id)->count());
    }

    public function test_only_enablement_types_are_accepted(): void
    {
        $url = "/api/users/{$this->intern->id}/absence-type-enablements";
        $archived = AbsenceType::factory()->requiringEnablement()->archived()->create();

        foreach ([$this->type('vacation')->id, $archived->id] as $id) {
            $this->actingAs($this->admin)->putJson($url, ['absence_type_ids' => [$id]])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['absence_type_ids.0' => __('absence_types.not_enablement', [], 'it')]);
        }
        $this->assertSame(0, DB::table('absence_type_user')->count());
    }

    public function test_managers_and_employees_cannot_manage_enablements(): void
    {
        $location = $this->intern->location;
        $manager = User::factory()->manager()->at($location)->create();
        $stranger = User::factory()->manager()->at(Location::factory()->create())->create();
        $employee = User::factory()->at($location)->create();

        foreach ([$manager, $employee] as $actor) {
            $this->actingAs($actor)->getJson("/api/users/{$this->intern->id}/absence-types")->assertForbidden();
            $this->actingAs($actor)->putJson("/api/users/{$this->intern->id}/absence-type-enablements", ['absence_type_ids' => []])->assertForbidden();
        }
        $this->actingAs($stranger)->getJson("/api/users/{$this->intern->id}/absence-types")->assertNotFound();
        $this->actingAs($stranger)->putJson("/api/users/{$this->intern->id}/absence-type-enablements", ['absence_type_ids' => []])->assertNotFound();
    }

    public function test_profile_lists_usable_types_only(): void
    {
        $employee = User::factory()->create();
        $archived = AbsenceType::factory()->archived()->create();

        $ids = fn (): array => collect($this->actingAs($employee)->getJson('/api/profile/absence-types')->assertOk()->json('data'))->pluck('id')->all();

        $this->assertNotContains($this->law104->id, $ids());
        $this->assertContains($this->type('vacation')->id, $ids());
        $this->assertNotContains($archived->id, $ids());

        $employee->enabledAbsenceTypes()->attach($this->law104->id, ['actor_id' => $this->admin->id, 'created_at' => now()]);
        $this->assertContains($this->law104->id, $ids());
        $this->actingAs($employee)->getJson('/api/profile/absence-types')
            ->assertJsonFragment(['id' => $this->law104->id, 'enabled' => true]);
    }

    public function test_managed_user_resource_exposes_manage_absence_types(): void
    {
        $manager = User::factory()->manager()->at($this->intern->location)->create();

        $can = fn (User $actor): array => collect($this->actingAs($actor)->getJson('/api/users')->assertOk()->json('data'))
            ->pluck('can.manage_absence_types')->unique()->values()->all();

        // Ogni riga visibile: vero per l'admin, falso per il responsabile
        $this->assertSame([true], $can($this->admin));
        $this->assertSame([false], $can($manager));
    }

    public function test_employment_type_change_keeps_enablements(): void
    {
        $this->intern->enabledAbsenceTypes()->attach($this->law104->id, ['actor_id' => $this->admin->id, 'created_at' => now()]);

        $this->actingAs($this->admin)->patchJson("/api/users/{$this->intern->id}", [
            'first_name' => $this->intern->first_name,
            'last_name' => $this->intern->last_name,
            'employment_type' => 'contractor',
        ])->assertOk();

        $this->assertDatabaseHas('absence_type_user', ['user_id' => $this->intern->id, 'absence_type_id' => $this->law104->id]);
    }

    public function test_saving_keeps_enablements_the_admin_cannot_see(): void
    {
        $url = "/api/users/{$this->intern->id}/absence-type-enablements";
        $archived = AbsenceType::factory()->requiringEnablement()->create();
        $visible = AbsenceType::factory()->requiringEnablement()->create();
        $this->intern->enabledAbsenceTypes()->attach([
            $archived->id => ['actor_id' => $this->admin->id, 'created_at' => now()],
            $this->law104->id => ['actor_id' => $this->admin->id, 'created_at' => now()],
        ]);
        $archived->forceFill(['archived_at' => now()])->save();
        // Tipo che non vale per il rapporto attuale (stagista)
        $employeesOnly = AbsenceType::factory()->requiringEnablement()->create(['employment_types' => ['employee']]);
        $this->intern->enabledAbsenceTypes()->attach($employeesOnly->id, ['actor_id' => $this->admin->id, 'created_at' => now()]);

        $this->actingAs($this->admin)->putJson($url, ['absence_type_ids' => [$visible->id]])->assertNoContent();

        $kept = DB::table('absence_type_user')->where('user_id', $this->intern->id)->pluck('absence_type_id')->all();
        $this->assertEqualsCanonicalizing([$archived->id, $employeesOnly->id, $visible->id], $kept);
    }

    public function test_a_no_op_save_does_not_log(): void
    {
        $this->intern->enabledAbsenceTypes()->attach($this->law104->id, ['actor_id' => $this->admin->id, 'created_at' => now()]);
        Log::spy();

        $this->actingAs($this->admin)->putJson("/api/users/{$this->intern->id}/absence-type-enablements", ['absence_type_ids' => [$this->law104->id]])
            ->assertNoContent();

        Log::shouldNotHaveReceived('info', ['Absence type enablements changed', \Mockery::any()]);
    }
}
