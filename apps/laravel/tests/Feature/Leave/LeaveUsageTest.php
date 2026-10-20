<?php

namespace Tests\Feature\Leave;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Enums\LeaveRequestStatus;
use App\Models\AbsenceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use App\Services\BalanceLedger;
use App\Services\LeaveRequestService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

/**
 * Effetti delle transizioni sul saldo (spec §3.3, §4, §5.3): movimenti `usage` per mese, restituzione, concorrenza e
 * disattivazione. Oggi è mercoledì 21 ottobre 2026, ore 9 a Roma.
 */
class LeaveUsageTest extends TestCase
{
    use RefreshDatabase;

    private Location $location;

    private User $owner;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        $this->location = Location::factory()->create();
        $this->owner = User::factory()->at($this->location)->create();
        $this->manager = User::factory()->manager()->at($this->location)->create();
    }

    public function test_approve_charges_by_month(): void
    {
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-30')->create();

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();

        $this->assertSame([['vacation', 'usage', -2400, '2026-10-26', $this->manager->id, $request->id, $this->owner->id]], $this->movementsOf($request));
    }

    public function test_usage_is_split_by_month_and_year(): void
    {
        // Dal lunedì 28 dicembre al martedì 5 gennaio: l'1/1 è festivo, il 2 e il 3 sono weekend
        $id = $this->actingAs($this->owner)->postJson('/api/leave-requests', [
            'absence_type_id' => $this->type('vacation')->id,
            'unit' => 'days',
            'starts_on' => '2026-12-28',
            'ends_on' => '2027-01-05',
        ])->assertCreated()->json('data.id');
        $request = LeaveRequest::query()->findOrFail($id);

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$id}/approve")->assertOk();

        $this->assertSame([
            ['vacation', 'usage', -1920, '2026-12-28', $this->manager->id, $request->id, $this->owner->id],
            ['vacation', 'usage', -960, '2027-01-04', $this->manager->id, $request->id, $this->owner->id],
        ], $this->movementsOf($request));

        // Il riepilogo dell'anno mette l'usato negli anni giusti
        $ledger = app(BalanceLedger::class);
        $this->assertSame(-1920, $ledger->yearSummary($this->owner, 2026, CarbonImmutable::parse('2026-12-31'))['vacation']->used);
        $this->assertSame(-960, $ledger->yearSummary($this->owner, 2027, CarbonImmutable::parse('2027-12-31'))['vacation']->used);
    }

    public function test_cancellation_refunds(): void
    {
        // Da giovedì 29 ottobre a martedì 3 novembre: due mesi
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-29', '2026-11-03')->create();

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->owner)->postJson("/api/leave-requests/{$request->id}/cancellation")->assertOk();
        // Annullamento chiesto: il saldo resta scalato
        $this->assertSame(-1920, $this->usageSum($request));
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/cancellation/approve")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertSame(0, $this->usageSum($request));
        $this->assertSame([
            ['vacation', 'usage', -960, '2026-10-29', $this->manager->id, $request->id, $this->owner->id],
            ['vacation', 'usage', 960, '2026-10-29', $this->manager->id, $request->id, $this->owner->id],
            ['vacation', 'usage', -960, '2026-11-02', $this->manager->id, $request->id, $this->owner->id],
            ['vacation', 'usage', 960, '2026-11-02', $this->manager->id, $request->id, $this->owner->id],
        ], $this->movementsOf($request));

        // Annullamento diretto: stessa restituzione
        $direct = LeaveRequest::factory()->for($this->owner)->between('2026-11-09', '2026-11-10')->create();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$direct->id}/approve")->assertOk();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$direct->id}/cancel")->assertOk();
        $this->assertSame(0, $this->usageSum($direct));
        $this->assertSame(2, BalanceMovement::query()->where('leave_request_id', $direct->id)->count());
    }

    public function test_rejected_cancellation_keeps_charge(): void
    {
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-27')->create();

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->owner)->postJson("/api/leave-requests/{$request->id}/cancellation")->assertOk();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/cancellation/reject")
            ->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertSame([['vacation', 'usage', -960, '2026-10-26', $this->manager->id, $request->id, $this->owner->id]], $this->movementsOf($request));
    }

    public function test_types_without_balance_write_nothing(): void
    {
        $request = LeaveRequest::factory()->for($this->owner)->ofType($this->type('blood_donation'))->between('2026-10-26', '2026-10-26')->create();

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/cancel")->assertOk();

        $this->assertSame(0, BalanceMovement::query()->count());
    }

    public function test_refund_follows_the_charged_balance_even_if_the_type_changes(): void
    {
        $type = AbsenceType::factory()->withBalance(BalanceType::Rol)->create();
        $request = LeaveRequest::factory()->for($this->owner)->ofType($type)->between('2026-10-26', '2026-10-26')->create();

        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();
        $type->forceFill(['balance' => null])->save();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/cancel")->assertOk();

        $this->assertSame([
            ['rol', 'usage', -480, '2026-10-26', $this->manager->id, $request->id, $this->owner->id],
            ['rol', 'usage', 480, '2026-10-26', $this->manager->id, $request->id, $this->owner->id],
        ], $this->movementsOf($request));
    }

    public function test_concurrent_decision_writes_once(): void
    {
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-30')->create();
        $other = User::factory()->manager()->at($this->location)->create();

        // Doppio clic: la seconda approvazione trova la richiesta già approvata
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($other)->postJson("/api/leave-requests/{$request->id}/approve")
            ->assertConflict()->assertJsonPath('message', __('leave.state_changed'));
        $this->assertSame(1, BalanceMovement::query()->where('leave_request_id', $request->id)->count());

        // Corsa: la richiesta letta in attesa viene approvata da un altro prima del lock
        $racing = LeaveRequest::factory()->for($this->owner)->between('2026-11-02', '2026-11-03')->create();
        $stale = LeaveRequest::query()->with('user')->findOrFail($racing->id);
        app(LeaveRequestService::class)->approve(LeaveRequest::query()->with('user')->findOrFail($racing->id), $other);

        try {
            app(LeaveRequestService::class)->approve($stale, $this->manager);
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException $exception) {
            $this->assertSame(__('leave.state_changed'), $exception->getMessage());
        }

        $this->assertSame(1, BalanceMovement::query()->where('leave_request_id', $racing->id)->count());
        $this->assertSame($other->id, $racing->fresh()?->decided_by);

        // Anche rifiuto e annullamento ricontrollano lo stato sotto lock
        $stalePending = LeaveRequest::query()->with('user')->findOrFail(
            LeaveRequest::factory()->for($this->owner)->between('2026-11-09', '2026-11-09')->create()->id,
        );
        LeaveRequest::query()->whereKey($stalePending->id)->update(['status' => LeaveRequestStatus::Withdrawn->value]);
        $this->expectException(ConflictHttpException::class);
        app(LeaveRequestService::class)->reject($stalePending, $this->manager, null);
    }

    public function test_policy_is_rechecked_under_lock(): void
    {
        $service = app(LeaveRequestService::class);

        // Il proprietario diventa admin dopo la lettura: il responsabile non può più decidere
        $promoted = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-26')->create();
        $stale = LeaveRequest::query()->with('user')->findOrFail($promoted->id);
        User::query()->whereKey($this->owner->id)->update(['role' => 'admin']);

        try {
            $service->approve($stale, $this->manager);
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException $exception) {
            $this->assertSame(__('leave.state_changed'), $exception->getMessage());
        }

        // Un'altra persona cambia sede dopo la lettura
        $mover = User::factory()->at($this->location)->create();
        $moved = LeaveRequest::factory()->for($mover)->between('2026-10-27', '2026-10-27')->create();
        $staleMoved = LeaveRequest::query()->with('user')->findOrFail($moved->id);
        User::query()->whereKey($mover->id)->update(['location_id' => Location::factory()->create()->id]);

        try {
            $service->reject($staleMoved, $this->manager, null);
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException $exception) {
            $this->assertSame(__('leave.state_changed'), $exception->getMessage());
        }

        $this->assertSame(LeaveRequestStatus::Pending, $promoted->fresh()?->status);
        $this->assertNull($promoted->fresh()?->decided_by);
        $this->assertSame(LeaveRequestStatus::Pending, $moved->fresh()?->status);
        $this->assertNull($moved->fresh()?->decided_by);
        $this->assertSame(0, BalanceMovement::query()->count());
    }

    public function test_transitions_lock_user_then_request(): void
    {
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-26')->create();
        $this->actingAs($this->manager);
        DB::enableQueryLog();

        $this->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();

        $queries = array_column(DB::getQueryLog(), 'query');
        $userLock = $this->firstIndex($queries, fn (string $sql): bool => str_starts_with($sql, 'select * from `users`') && str_ends_with($sql, 'for update'));
        $requestLock = $this->firstIndex($queries, fn (string $sql): bool => str_starts_with($sql, 'select * from `leave_requests`') && str_ends_with($sql, 'for update'));
        $insert = $this->firstIndex($queries, fn (string $sql): bool => str_starts_with($sql, 'insert into `balance_movements`'));

        $this->assertNotNull($userLock);
        $this->assertNotNull($requestLock);
        $this->assertNotNull($insert);
        $this->assertLessThan($requestLock, $userLock);
        $this->assertLessThan($insert, $requestLock);
    }

    public function test_disable_cancels_future_requests(): void
    {
        Mail::fake();
        $service = app(LeaveRequestService::class);
        $pending = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-27')->create();
        // In attesa e già iniziata ieri: si ritira comunque (ruling R4)
        $startedPending = LeaveRequest::factory()->for($this->owner)->between('2026-10-20', '2026-10-21')->create();
        $approved = LeaveRequest::factory()->for($this->owner)->between('2026-11-02', '2026-11-03')->create();
        $service->approve($approved->load('user'), $this->manager);
        $requested = LeaveRequest::factory()->for($this->owner)->between('2026-11-09', '2026-11-09')->create();
        $service->approve($requested->load('user'), $this->manager);
        $service->requestCancellation($requested->fresh(['user']) ?? $requested, $this->owner);
        // A ore oggi dalle 15: alle 10 non è ancora iniziata
        $rol = AbsenceType::factory()->withBalance(BalanceType::Rol)->create();
        $hours = LeaveRequest::factory()->for($this->owner)->ofType($rol)->hours('2026-10-21', '15:00', '17:00')->create();
        $service->approve($hours->load('user'), $this->manager);
        // Approvata e iniziata ieri: resta com'è
        $started = LeaveRequest::factory()->for($this->owner)->between('2026-10-20', '2026-10-23')->create();
        $service->approve($started->load('user'), $this->manager);
        $other = User::factory()->at($this->location)->create();
        $otherPending = LeaveRequest::factory()->for($other)->between('2026-10-26', '2026-10-26')->create();
        $admin = User::factory()->admin()->create();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 10:00', 'Europe/Rome'));
        // Le email dei passaggi di preparazione non contano: la disattivazione non ne manda (R4)
        Mail::fake();

        $this->actingAs($admin)->postJson("/api/users/{$this->owner->id}/disable")->assertOk();

        foreach ([$pending, $startedPending] as $request) {
            $fresh = $request->fresh();
            $this->assertSame(LeaveRequestStatus::Withdrawn, $fresh?->status);
            $this->assertNull($fresh?->cancelled_by);
        }

        foreach ([$approved, $requested, $hours] as $request) {
            $fresh = $request->fresh();
            $this->assertSame(LeaveRequestStatus::Cancelled, $fresh?->status);
            $this->assertSame($admin->id, $fresh?->cancelled_by);
            $this->assertNotNull($fresh?->cancelled_at);
            $this->assertSame(0, $this->usageSum($request));
        }

        // Restituzione completa, a nome di chi disattiva
        $this->assertSame([960, 480, 120], [
            (int) BalanceMovement::query()->where('leave_request_id', $approved->id)->where('minutes', '>', 0)->sum('minutes'),
            (int) BalanceMovement::query()->where('leave_request_id', $requested->id)->where('minutes', '>', 0)->sum('minutes'),
            (int) BalanceMovement::query()->where('leave_request_id', $hours->id)->where('minutes', '>', 0)->sum('minutes'),
        ]);
        $this->assertSame('rol', BalanceMovement::query()->where('leave_request_id', $hours->id)->where('minutes', '>', 0)->value('balance')?->value);
        $this->assertSame($admin->id, BalanceMovement::query()->where('leave_request_id', $approved->id)->where('minutes', '>', 0)->value('actor_id'));

        $this->assertSame(LeaveRequestStatus::Approved, $started->fresh()?->status);
        $this->assertSame(-1920, $this->usageSum($started));
        $this->assertSame(1, BalanceMovement::query()->where('leave_request_id', $started->id)->count());
        $this->assertSame(LeaveRequestStatus::Pending, $otherPending->fresh()?->status);

        Mail::assertNothingQueued();
        Mail::assertNothingSent();
    }

    public function test_usage_logs_wait_for_the_commit(): void
    {
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-26')->create();
        Log::spy();

        try {
            DB::transaction(function () use ($request): void {
                app(LeaveRequestService::class)->approve($request->load('user'), $this->manager);

                throw new RuntimeException('rollback');
            });
        } catch (RuntimeException) {
            // Atteso: la transazione esterna si annulla
        }

        $this->assertSame(LeaveRequestStatus::Pending, $request->fresh()?->status);
        Log::shouldNotHaveReceived('info', fn (string $message): bool => $message === 'Leave usage charged');

        app(LeaveRequestService::class)->approve($request->load('user'), $this->manager);
        Log::shouldHaveReceived('info')->withArgs(fn (string $message, array $context): bool => $message === 'Leave usage charged'
            && $context['leave_request_id'] === $request->id
            && $context['minutes'] === -480)->once();
    }

    public function test_movement_resource_exposes_leave_request(): void
    {
        BalanceMovement::factory()->for($this->owner)->accrual('2026-09', 1000)->create();
        $request = LeaveRequest::factory()->for($this->owner)->between('2026-10-26', '2026-10-27')->create();
        $this->actingAs($this->manager)->postJson("/api/leave-requests/{$request->id}/approve")->assertOk();

        $expected = [
            'id' => $request->id,
            'absence_type_name' => $this->type('vacation')->displayName(),
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-27',
            'source' => 'request',
        ];

        DB::enableQueryLog();
        $movements = $this->actingAs($this->owner)->getJson('/api/profile/balance-movements?balance=vacation')->assertOk()->json('data');
        $profileQueries = count(DB::getQueryLog());
        $this->assertSame($expected, $movements[0]['leave_request']);
        $this->assertSame('usage', $movements[0]['kind']);
        $this->assertNull($movements[1]['leave_request']);

        $this->actingAs($this->manager)->getJson("/api/users/{$this->owner->id}/balance-movements?balance=vacation")->assertOk()
            ->assertJsonPath('data.0.leave_request', $expected)
            ->assertJsonPath('data.1.leave_request', null);

        // Più movimenti di richieste: stesse query (relazioni caricate a blocchi)
        foreach (['2026-11-02', '2026-11-09', '2026-11-16'] as $day) {
            $more = LeaveRequest::factory()->for($this->owner)->between($day, $day)->create();
            $this->actingAs($this->manager)->postJson("/api/leave-requests/{$more->id}/approve")->assertOk();
        }
        DB::flushQueryLog();
        $this->actingAs($this->owner)->getJson('/api/profile/balance-movements?balance=vacation')->assertOk()->assertJsonCount(5, 'data');
        $this->assertSame($profileQueries, count(DB::getQueryLog()));
    }

    /**
     * @return list<array{string, string, int, string, ?int, ?int, int}>
     */
    private function movementsOf(LeaveRequest $request): array
    {
        return BalanceMovement::query()->where('leave_request_id', $request->id)->orderBy('effective_on')->orderBy('id')->get()
            ->map(fn (BalanceMovement $m): array => [$m->balance->value, $m->kind->value, $m->minutes, $m->effective_on->toDateString(), $m->actor_id, $m->leave_request_id, $m->user_id])
            ->values()
            ->all();
    }

    private function usageSum(LeaveRequest $request): int
    {
        return (int) BalanceMovement::query()
            ->where('leave_request_id', $request->id)
            ->where('kind', BalanceMovementKind::Usage)
            ->sum('minutes');
    }

    /**
     * @param  list<string>  $queries
     * @param  callable(string): bool  $match
     */
    private function firstIndex(array $queries, callable $match): ?int
    {
        foreach ($queries as $index => $sql) {
            if ($match($sql)) {
                return $index;
            }
        }

        return null;
    }

    private function type(string $code): AbsenceType
    {
        return AbsenceType::query()->where('code', $code)->firstOrFail();
    }
}
