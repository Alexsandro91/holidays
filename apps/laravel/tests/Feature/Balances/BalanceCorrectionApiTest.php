<?php

namespace Tests\Feature\Balances;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Models\BalanceAlignment;
use App\Models\BalanceMovement;
use App\Models\Location;
use App\Models\User;
use App\Services\BalanceCorrectionService;
use App\Services\BalanceLedger;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

/**
 * Rettifiche e allineamenti alla busta paga (spec §5.1, §5.2, §6.1). Oggi è il 3 ottobre: la maturazione di ottobre è
 * già scritta, il saldo ferie al 30/09 è 4920 minuti (82 h).
 */
class BalanceCorrectionApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-03 10:00', 'Europe/Rome'));
        $this->admin = User::factory()->admin()->create();
        $this->employee = User::factory()->create();
        $this->withMovements($this->employee);
    }

    public function test_adjustment_requires_a_note(): void
    {
        $url = "/api/users/{$this->employee->id}/balance-adjustments";

        $this->actingAs($this->admin)->postJson($url, ['balance' => 'vacation', 'minutes' => -240])
            ->assertUnprocessable()->assertJsonValidationErrors('note');
        $this->postJson($url, ['balance' => 'vacation', 'minutes' => -240, 'note' => '   '])
            ->assertUnprocessable()->assertJsonValidationErrors('note');
        $this->postJson($url, ['balance' => 'vacation', 'minutes' => 0, 'note' => 'Nulla'])
            ->assertUnprocessable()->assertJsonValidationErrors('minutes');
        $this->postJson($url, ['balance' => 'vacation', 'minutes' => 600001, 'note' => 'Troppo'])
            ->assertUnprocessable()->assertJsonValidationErrors('minutes');
        $this->postJson($url, ['balance' => 'holidays', 'minutes' => 60, 'note' => 'Saldo sbagliato'])
            ->assertUnprocessable()->assertJsonValidationErrors('balance');
        $this->assertSame(0, BalanceMovement::query()->where('kind', BalanceMovementKind::Adjustment)->where('user_id', $this->employee->id)->where('effective_on', '2026-10-03')->count());

        $this->postJson($url, ['balance' => 'vacation', 'minutes' => -240, 'note' => 'Ferie godute prima dell\'app'])
            ->assertCreated()
            ->assertJsonPath('data.balance', 'vacation')
            ->assertJsonPath('data.kind', 'adjustment')
            ->assertJsonPath('data.minutes', -240)
            ->assertJsonPath('data.effective_on', '2026-10-03')
            ->assertJsonPath('data.note', 'Ferie godute prima dell\'app')
            ->assertJsonPath('data.actor_name', $this->admin->name);

        $movement = BalanceMovement::query()->latest('id')->firstOrFail();
        $this->assertSame(BalanceMovementKind::Adjustment, $movement->kind);
        $this->assertSame('2026-10-03', $movement->effective_on->toDateString());
        $this->assertSame($this->admin->id, $movement->actor_id);
        $this->assertSame(5480, $this->ledger()->balanceAt($this->employee, BalanceType::Vacation, CarbonImmutable::parse('2026-10-03')));
    }

    public function test_alignment_writes_the_delta(): void
    {
        $this->assertSame(4920, $this->ledger()->balanceAt($this->employee, BalanceType::Vacation, CarbonImmutable::parse('2026-09-30')));

        $this->actingAs($this->admin)->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 4452], 'note' => 'Busta paga di settembre'])
            ->assertCreated()
            ->assertExactJson(['data' => ['aligned_on' => '2026-09-30', 'deltas' => ['vacation' => -468]]]);

        $movement = BalanceMovement::query()->where('kind', BalanceMovementKind::Alignment)->sole();
        $this->assertSame(-468, $movement->minutes);
        $this->assertSame(4452, $movement->target_minutes);
        $this->assertSame('2026-09-30', $movement->effective_on->toDateString());
        $this->assertSame('Busta paga di settembre', $movement->note);
        $this->assertSame($this->admin->id, $movement->actor_id);
        $this->assertSame(BalanceType::Vacation, $movement->balance);

        $alignment = BalanceAlignment::query()->sole();
        $this->assertSame($this->employee->id, $alignment->user_id);
        $this->assertSame(BalanceType::Vacation, $alignment->balance);
        $this->assertSame('2026-09-30', $alignment->aligned_on->toDateString());
        $this->assertSame($this->admin->id, $alignment->actor_id);
        $this->assertSame(4452, $this->ledger()->balanceAt($this->employee, BalanceType::Vacation, CarbonImmutable::parse('2026-09-30')));
    }

    public function test_alignment_keeps_later_movements(): void
    {
        $this->actingAs($this->admin)->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 4452]])
            ->assertCreated();

        // La busta paga di settembre non conosce ottobre: la quota del 1° ottobre resta
        $this->assertSame(4452 + 800, $this->ledger()->balanceAt($this->employee, BalanceType::Vacation, CarbonImmutable::parse('2026-10-03')));
    }

    public function test_alignment_with_zero_delta_records_the_date(): void
    {
        $this->actingAs($this->admin)->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 4920, 'rol' => 0]])
            ->assertCreated()
            ->assertExactJson(['data' => ['aligned_on' => '2026-09-30', 'deltas' => ['vacation' => 0, 'rol' => 0]]]);

        $this->assertSame(0, BalanceMovement::query()->where('kind', BalanceMovementKind::Alignment)->count());
        $this->assertSame(
            ['rol', 'vacation'],
            BalanceAlignment::query()->where('user_id', $this->employee->id)->where('aligned_on', '2026-09-30')->orderBy('balance')->get()
                ->map(fn (BalanceAlignment $alignment): ?string => $alignment->balance?->value)->all(),
        );
        $this->assertSame('2026-09-30', $this->ledger()->lastAlignmentFor($this->employee, BalanceType::Vacation)?->toDateString());
        $this->assertNull($this->ledger()->lastAlignmentFor($this->employee, BalanceType::ExHolidays));
    }

    public function test_alignment_rules(): void
    {
        $this->actingAs($this->admin);

        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-10-04', 'values' => ['vacation' => 100]])
            ->assertUnprocessable()->assertJsonValidationErrors(['aligned_on' => __('balances.alignment_future', [], 'it')]);
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30'])
            ->assertUnprocessable()->assertJsonValidationErrors(['values' => __('balances.alignment_empty', [], 'it')]);
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => null]])
            ->assertUnprocessable()->assertJsonValidationErrors(['values' => __('balances.alignment_empty', [], 'it')]);
        $this->postJson($this->alignUrl(), ['aligned_on' => '30/09/2026', 'values' => ['vacation' => 100]])
            ->assertUnprocessable()->assertJsonValidationErrors('aligned_on');
        $this->postJson($this->alignUrl(), ['aligned_on' => '1999-12-31', 'values' => ['vacation' => 100]])
            ->assertUnprocessable()->assertJsonValidationErrors('aligned_on');
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['holidays' => 100]])
            ->assertUnprocessable()->assertJsonValidationErrors('values');
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => -600001]])
            ->assertUnprocessable()->assertJsonValidationErrors('values.vacation');
        $this->assertSame(0, BalanceAlignment::query()->count());

        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 4452]])->assertCreated();

        // Prima dell'ultimo allineamento dello stesso saldo: no
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-08-31', 'values' => ['vacation' => 3000]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['aligned_on' => __('balances.alignment_before_last', ['date' => '30/09/2026'], 'it')]);
        // Anche se insieme a un saldo mai allineato: non si scrive nulla
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-08-31', 'values' => ['rol' => 100, 'vacation' => 3000]])
            ->assertUnprocessable()->assertJsonValidationErrors('aligned_on');
        $this->assertSame(1, BalanceAlignment::query()->count());

        // Stessa data: corregge un valore sbagliato
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 4500]])
            ->assertCreated()->assertJsonPath('data.deltas.vacation', 48);
        // Prima dell'ultimo allineamento di un altro saldo: sì
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-08-31', 'values' => ['rol' => 100]])
            ->assertCreated()->assertJsonPath('data.deltas.rol', 100);

        $this->assertSame(4500 + 800, $this->ledger()->balanceAt($this->employee, BalanceType::Vacation, CarbonImmutable::parse('2026-10-03')));
    }

    public function test_negative_values_are_allowed(): void
    {
        $this->actingAs($this->admin)->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['ex_holidays' => -240]])
            ->assertCreated()
            ->assertExactJson(['data' => ['aligned_on' => '2026-09-30', 'deltas' => ['ex_holidays' => -240]]]);

        $this->assertSame(-240, $this->ledger()->balanceAt($this->employee, BalanceType::ExHolidays, CarbonImmutable::parse('2026-10-03')));
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: int}>
     */
    public static function permissionCases(): array
    {
        return [
            'admin su dipendente' => ['admin', 'employee', 201],
            'admin su sé stesso' => ['admin', 'self', 403],
            'responsabile su dipendente della sua sede' => ['manager', 'employee', 201],
            'responsabile su sé stesso' => ['manager', 'self', 403],
            'responsabile su un altro responsabile della sua sede' => ['manager', 'manager', 201],
            'responsabile su un admin della sua sede' => ['manager', 'admin', 403],
            'responsabile su persona di altra sede' => ['manager', 'elsewhere', 404],
            'dipendente' => ['employee', 'employee', 403],
            'ospite' => ['guest', 'employee', 401],
        ];
    }

    #[DataProvider('permissionCases')]
    public function test_permission_matrix(string $actorKind, string $targetKind, int $status): void
    {
        $actor = match ($actorKind) {
            'admin' => $this->admin,
            'manager' => User::factory()->manager()->create(),
            'employee' => User::factory()->create(),
            default => null,
        };
        $target = match ($targetKind) {
            'self' => $actor,
            'employee' => $this->employee,
            'manager' => User::factory()->manager()->create(),
            'admin' => User::factory()->admin()->create(),
            default => User::factory()->at(Location::factory()->create())->create(),
        };
        $this->assertNotNull($target);

        if (! $target->is($this->employee)) {
            $this->withMovements($target);
        }

        $before = BalanceMovement::query()->count();

        if ($actor !== null) {
            $this->actingAs($actor);
        }

        $this->postJson("/api/users/{$target->id}/balance-adjustments", ['balance' => 'vacation', 'minutes' => -60, 'note' => 'Prova'])
            ->assertStatus($status);
        $this->postJson("/api/users/{$target->id}/balance-alignments", ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 4000]])
            ->assertStatus($status);

        $written = $status === 201 ? 2 : 0;
        $this->assertSame($before + $written, BalanceMovement::query()->count());
        $this->assertSame($status === 201 ? 1 : 0, BalanceAlignment::query()->count());
    }

    public function test_not_applicable(): void
    {
        $contractor = User::factory()->contractor()->create();
        $invited = User::factory()->invited()->create();
        $formerEmployee = User::factory()->contractor()->create();
        BalanceMovement::factory()->for($formerEmployee)->accrual('2026-08', 800)->create();
        $this->actingAs($this->admin);

        foreach ([$contractor, $invited] as $person) {
            $this->postJson("/api/users/{$person->id}/balance-adjustments", ['balance' => 'vacation', 'minutes' => 60, 'note' => 'Prova'])
                ->assertConflict()->assertJsonPath('message', __('balances.not_applicable', [], 'it'));
            $this->postJson("/api/users/{$person->id}/balance-alignments", ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 60]])
                ->assertConflict()->assertJsonPath('message', __('balances.not_applicable', [], 'it'));
        }

        $this->assertSame(0, BalanceMovement::query()->whereIn('user_id', [$contractor->id, $invited->id])->count());
        $this->assertSame(0, BalanceAlignment::query()->count());

        $this->postJson("/api/users/{$formerEmployee->id}/balance-adjustments", ['balance' => 'vacation', 'minutes' => -800, 'note' => 'Residuo liquidato'])
            ->assertCreated();
    }

    public function test_location_changed_meanwhile(): void
    {
        $manager = User::factory()->manager()->create();
        $milano = Location::factory()->create();
        $service = app(BalanceCorrectionService::class);
        $calls = [
            'adjust' => fn (User $stale) => $service->adjust($stale, BalanceType::Vacation, 60, 'Prova', $manager),
            'align' => fn (User $stale) => $service->align($stale, CarbonImmutable::parse('2026-09-30'), ['vacation' => 100], null, $manager),
        ];

        foreach ($calls as $action => $call) {
            $stale = User::factory()->create();
            // L'admin l'ha appena spostata a Milano: l'istanza in memoria è ancora nella sede del responsabile
            User::query()->whereKey($stale->id)->update(['location_id' => $milano->id]);

            try {
                $call($stale);
                $this->fail("{$action}: expected ConflictHttpException");
            } catch (ConflictHttpException $exception) {
                $this->assertSame(__('users.state_changed'), $exception->getMessage());
            }

            $this->assertSame(0, BalanceMovement::query()->where('user_id', $stale->id)->count());
        }

        $this->assertSame(0, BalanceAlignment::query()->count());
    }

    public function test_corrections_are_logged(): void
    {
        Log::spy();
        $this->actingAs($this->admin);

        $this->postJson("/api/users/{$this->employee->id}/balance-adjustments", ['balance' => 'rol', 'minutes' => 120, 'note' => 'Recupero'])
            ->assertCreated();
        $this->postJson($this->alignUrl(), ['aligned_on' => '2026-09-30', 'values' => ['vacation' => 4452, 'rol' => 0]])
            ->assertCreated();

        Log::shouldHaveReceived('info')->with('Balance adjusted', Mockery::on(fn (array $context): bool => $context['user_id'] === $this->employee->id
            && $context['actor_id'] === $this->admin->id
            && $context['balance'] === 'rol'
            && $context['minutes'] === 120))->once();
        Log::shouldHaveReceived('info')->with('Balances aligned', Mockery::on(fn (array $context): bool => $context['user_id'] === $this->employee->id
            && $context['actor_id'] === $this->admin->id
            && $context['aligned_on'] === '2026-09-30'
            && $context['values'] === ['vacation' => 4452, 'rol' => 0]
            && $context['deltas'] === ['vacation' => -468, 'rol' => 0]))->once();
    }

    /**
     * Ferie: rettifica di 4120 ad agosto, maturazioni di settembre e ottobre (800 l'una).
     */
    private function withMovements(User $user): void
    {
        BalanceMovement::factory()->for($user)->adjustment(4120)->create(['effective_on' => '2026-08-20']);
        BalanceMovement::factory()->for($user)->accrual('2026-09', 800)->create();
        BalanceMovement::factory()->for($user)->accrual('2026-10', 800)->create();
    }

    private function alignUrl(): string
    {
        return "/api/users/{$this->employee->id}/balance-alignments";
    }

    private function ledger(): BalanceLedger
    {
        return app(BalanceLedger::class);
    }
}
