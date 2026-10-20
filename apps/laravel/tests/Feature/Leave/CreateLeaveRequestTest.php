<?php

namespace Tests\Feature\Leave;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Enums\LeaveRequestStatus;
use App\Models\AbsenceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestDay;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Creazione, anteprima e letture delle proprie richieste (spec §5.1, §6). Oggi è mercoledì 21 ottobre 2026.
 */
class CreateLeaveRequestTest extends TestCase
{
    use RefreshDatabase;

    private Location $location;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-21 09:00', 'Europe/Rome'));
        $this->location = Location::factory()->create();
        $this->user = User::factory()->at($this->location)->create();
    }

    public function test_create_days_request(): void
    {
        $response = $this->store([
            'absence_type_id' => $this->type('vacation')->id,
            'unit' => 'days',
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-30',
            'note' => 'Viaggio',
        ])->assertCreated();

        $response->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.minutes', 2400)
            ->assertJsonPath('data.working_days', 5)
            ->assertJsonPath('data.unit', 'days')
            ->assertJsonPath('data.user.id', $this->user->id)
            ->assertJsonPath('data.absence_type.balance', 'vacation')
            ->assertJsonPath('data.note', 'Viaggio')
            ->assertJsonPath('data.source', 'request')
            ->assertJsonPath('data.can.withdraw', true)
            ->assertJsonPath('data.can.approve', false)
            // Senza saldo: l'avviso c'è ma non blocca
            ->assertJsonPath('data.warnings.0.code', 'balance_insufficient')
            ->assertJsonMissingPath('data.days');

        $request = LeaveRequest::query()->sole();
        $this->assertSame($this->location->id, $request->location_id);
        $this->assertSame(LeaveRequestStatus::Pending, $request->status);
        $this->assertNull($request->decided_at);
        $this->assertSame(
            [480, 480, 480, 480, 480],
            LeaveRequestDay::query()->where('leave_request_id', $request->id)->orderBy('date')->pluck('minutes')->all(),
        );
        $this->assertSame(0, BalanceMovement::query()->where('kind', BalanceMovementKind::Usage)->count());
    }

    public function test_create_locks_the_user_row_before_overlap_check_and_insert(): void
    {
        $this->actingAs($this->user);
        DB::enableQueryLog();

        $this->postJson('/api/leave-requests', [
            'absence_type_id' => $this->type('vacation')->id,
            'unit' => 'days',
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-26',
        ])->assertCreated();

        $queries = array_column(DB::getQueryLog(), 'query');
        $lock = $this->firstIndex($queries, fn (string $sql): bool => str_starts_with($sql, 'select * from `users`') && str_ends_with($sql, 'for update'));
        $overlap = $this->firstIndex($queries, fn (string $sql): bool => str_starts_with($sql, 'select * from `leave_requests`') && str_contains($sql, '`status` in'));
        $insert = $this->firstIndex($queries, fn (string $sql): bool => str_starts_with($sql, 'insert into `leave_requests`'));

        $this->assertNotNull($lock);
        $this->assertNotNull($overlap);
        $this->assertNotNull($insert);
        $this->assertLessThan($overlap, $lock);
        $this->assertLessThan($insert, $overlap);
    }

    public function test_preview_has_balance_and_warnings_and_writes_nothing(): void
    {
        BalanceMovement::factory()->for($this->user)->accrual('2026-09', 1000)->create();

        $this->postJson('/api/leave-requests/preview', [
            'absence_type_id' => $this->type('vacation')->id,
            'unit' => 'days',
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-30',
        ], $this->auth())->assertOk()->assertExactJson(['data' => [
            'days' => [
                ['date' => '2026-10-26', 'minutes' => 480],
                ['date' => '2026-10-27', 'minutes' => 480],
                ['date' => '2026-10-28', 'minutes' => 480],
                ['date' => '2026-10-29', 'minutes' => 480],
                ['date' => '2026-10-30', 'minutes' => 480],
            ],
            'minutes' => 2400,
            'working_days' => 5,
            'balance' => ['balance' => 'vacation', 'current_minutes' => 1000, 'available_minutes' => 1000, 'after_minutes' => -1400],
            'warnings' => [['code' => 'balance_insufficient', 'params' => ['after_minutes' => -1400]]],
        ]]);

        $this->assertSame(0, LeaveRequest::query()->count());
        $this->assertSame(0, LeaveRequestDay::query()->count());
        $this->assertSame(1, BalanceMovement::query()->count());

        // Un tipo senza saldo: niente saldo, niente avvisi
        $this->postJson('/api/leave-requests/preview', [
            'absence_type_id' => $this->type('blood_donation')->id,
            'unit' => 'days',
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-26',
        ], $this->auth())->assertOk()->assertJsonPath('data.balance', null)->assertJsonPath('data.warnings', []);
    }

    public function test_preview_reports_calculator_and_overlap_errors(): void
    {
        $this->postJson('/api/leave-requests/preview', [
            'absence_type_id' => $this->type('vacation')->id,
            'unit' => 'days',
            'starts_on' => '2026-10-24',
            'ends_on' => '2026-10-25',
        ], $this->auth())->assertUnprocessable()->assertJsonValidationErrors(['starts_on' => __('leave.no_working_days', [], 'it')]);

        LeaveRequest::factory()->for($this->user)->between('2026-10-26', '2026-10-26')->create();
        $this->postJson('/api/leave-requests/preview', [
            'absence_type_id' => $this->type('vacation')->id,
            'unit' => 'days',
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-27',
        ], $this->auth())->assertUnprocessable()->assertJsonValidationErrors(['starts_on' => __('leave.overlap', [], 'it')]);
    }

    public function test_unit_must_be_allowed_by_type(): void
    {
        $this->store([
            'absence_type_id' => $this->type('rol')->id,
            'unit' => 'days',
            'starts_on' => '2026-10-26',
            'ends_on' => '2026-10-26',
        ])->assertUnprocessable()->assertJsonValidationErrors(['unit' => __('leave.unit_not_allowed', [], 'it')]);

        $this->assertSame(0, LeaveRequest::query()->count());
    }

    public function test_type_must_be_requestable(): void
    {
        $message = __('leave.type_not_requestable', [], 'it');
        $days = ['unit' => 'days', 'starts_on' => '2026-10-26', 'ends_on' => '2026-10-26'];

        // Malattia è archiviata dalla migration
        $this->store(['absence_type_id' => $this->type('sickness')->id, ...$days])
            ->assertUnprocessable()->assertJsonValidationErrors(['absence_type_id' => $message]);

        // Le ferie non valgono per uno stagista
        $intern = User::factory()->intern()->at($this->location)->create();
        $this->actingAs($intern)->postJson('/api/leave-requests', ['absence_type_id' => $this->type('vacation')->id, ...$days])
            ->assertUnprocessable()->assertJsonValidationErrors(['absence_type_id' => $message]);

        // Legge 104 richiede l'abilitazione
        $law104 = $this->type('law_104');
        $this->store(['absence_type_id' => $law104->id, ...$days])
            ->assertUnprocessable()->assertJsonValidationErrors(['absence_type_id' => $message]);

        $admin = User::factory()->admin()->create();
        $this->user->enabledAbsenceTypes()->attach($law104->id, ['actor_id' => $admin->id, 'created_at' => now()]);
        $this->store(['absence_type_id' => $law104->id, ...$days])->assertCreated();
    }

    public function test_overlap(): void
    {
        $vacation = $this->type('vacation')->id;
        $rol = $this->type('rol')->id;
        $overlap = ['starts_on' => __('leave.overlap', [], 'it')];

        // Un'altra richiesta attiva sugli stessi giorni
        LeaveRequest::factory()->for($this->user)->between('2026-10-26', '2026-10-27')->create();
        $this->store(['absence_type_id' => $vacation, 'unit' => 'days', 'starts_on' => '2026-10-27', 'ends_on' => '2026-10-28'])
            ->assertUnprocessable()->assertJsonValidationErrors($overlap);

        // Anche approvata o con annullamento chiesto
        LeaveRequest::factory()->for($this->user)->approved()->between('2026-10-29', '2026-10-29')->create();
        LeaveRequest::factory()->for($this->user)->cancellationRequested()->between('2026-10-30', '2026-10-30')->create();
        $this->store(['absence_type_id' => $vacation, 'unit' => 'days', 'starts_on' => '2026-10-29', 'ends_on' => '2026-10-29'])
            ->assertUnprocessable()->assertJsonValidationErrors($overlap);
        $this->store(['absence_type_id' => $rol, 'unit' => 'hours', 'starts_on' => '2026-10-30', 'ends_on' => '2026-10-30', 'starts_at' => '09:00', 'ends_at' => '10:00'])
            ->assertUnprocessable()->assertJsonValidationErrors($overlap);

        // Mattina e pomeriggio dello stesso giorno: sì; una giornata intera quel giorno: no
        $half = ['absence_type_id' => $vacation, 'unit' => 'half_day', 'starts_on' => '2026-11-02', 'ends_on' => '2026-11-02'];
        $this->store([...$half, 'half' => 'morning'])->assertCreated();
        $this->store([...$half, 'half' => 'morning'])->assertUnprocessable()->assertJsonValidationErrors($overlap);
        $this->store([...$half, 'half' => 'afternoon'])->assertCreated();
        $this->store([...$half, 'unit' => 'days'])->assertUnprocessable()->assertJsonValidationErrors($overlap);

        // Fasce orarie che non si toccano: sì; che si sovrappongono: no
        $hours = ['absence_type_id' => $rol, 'unit' => 'hours', 'starts_on' => '2026-11-03', 'ends_on' => '2026-11-03'];
        $this->store([...$hours, 'starts_at' => '09:00', 'ends_at' => '11:00'])->assertCreated();
        $this->store([...$hours, 'starts_at' => '11:00', 'ends_at' => '13:00'])->assertCreated();
        $this->store([...$hours, 'starts_at' => '12:30', 'ends_at' => '14:00'])->assertUnprocessable()->assertJsonValidationErrors($overlap);
        // Mezza giornata e ore lo stesso giorno: no
        $this->store([...$half, 'starts_on' => '2026-11-03', 'ends_on' => '2026-11-03', 'half' => 'afternoon'])
            ->assertUnprocessable()->assertJsonValidationErrors($overlap);

        // Richieste rifiutate, ritirate o annullate non contano
        LeaveRequest::factory()->for($this->user)->rejected()->between('2026-11-04', '2026-11-04')->create();
        LeaveRequest::factory()->for($this->user)->withdrawn()->between('2026-11-04', '2026-11-04')->create();
        LeaveRequest::factory()->for($this->user)->cancelled()->between('2026-11-04', '2026-11-04')->create();
        $this->store(['absence_type_id' => $vacation, 'unit' => 'days', 'starts_on' => '2026-11-04', 'ends_on' => '2026-11-04'])->assertCreated();

        // Le richieste di un altro non contano
        LeaveRequest::factory()->between('2026-11-05', '2026-11-05')->create();
        $this->store(['absence_type_id' => $vacation, 'unit' => 'days', 'starts_on' => '2026-11-05', 'ends_on' => '2026-11-05'])->assertCreated();
    }

    public function test_overlap_counts_only_days_with_minutes_except_calendar_types(): void
    {
        $vacation = $this->type('vacation')->id;
        $marriage = $this->type('marriage_leave');

        // Ferie venerdì-lunedì: sabato e domenica sono a 0, quindi un'altra richiesta solo sul weekend non si scontra
        LeaveRequest::factory()->for($this->user)->between('2026-11-06', '2026-11-09')->create();
        $this->store(['absence_type_id' => $marriage->id, 'unit' => 'days', 'starts_on' => '2026-11-07', 'ends_on' => '2026-11-08'])->assertCreated();

        // Un tipo a giorni di calendario occupa anche i giorni a 0 minuti
        LeaveRequest::factory()->for($this->user)->ofType($marriage)->between('2026-11-14', '2026-11-15')->create();
        $this->store(['absence_type_id' => $marriage->id, 'unit' => 'days', 'starts_on' => '2026-11-15', 'ends_on' => '2026-11-15'])
            ->assertUnprocessable()->assertJsonValidationErrors(['starts_on' => __('leave.overlap', [], 'it')]);
        $this->store(['absence_type_id' => $vacation, 'unit' => 'days', 'starts_on' => '2026-11-13', 'ends_on' => '2026-11-16'])->assertCreated();
    }

    public function test_note_max_500(): void
    {
        $data = ['absence_type_id' => $this->type('vacation')->id, 'unit' => 'days', 'starts_on' => '2026-10-26', 'ends_on' => '2026-10-26'];

        $this->store([...$data, 'note' => str_repeat('a', 501)])->assertUnprocessable()->assertJsonValidationErrors('note');
        $this->store([...$data, 'note' => str_repeat('a', 500)])->assertCreated();
    }

    /**
     * @param  array<string, string>  $data
     * @param  list<string>  $errors
     */
    #[DataProvider('invalidShapes')]
    public function test_validation_shapes(array $data, array $errors): void
    {
        $data = ['absence_type_id' => $this->type('vacation')->id, 'unit' => 'days', 'starts_on' => '2026-10-27', 'ends_on' => '2026-10-27', ...$data];

        // La stessa forma vale per l'anteprima e per la creazione
        $this->postJson('/api/leave-requests/preview', $data, $this->auth())->assertUnprocessable()->assertJsonValidationErrors($errors);
        $this->store($data)->assertUnprocessable()->assertJsonValidationErrors($errors);
        $this->assertSame(0, LeaveRequest::query()->count());
    }

    /**
     * @return array<string, array{array<string, string>, list<string>}>
     */
    public static function invalidShapes(): array
    {
        return [
            'fine prima dell\'inizio' => [['starts_on' => '2026-10-28', 'ends_on' => '2026-10-27'], ['ends_on']],
            'data non valida' => [['starts_on' => '27/10/2026'], ['starts_on']],
            'unità sconosciuta' => [['unit' => 'weeks'], ['unit']],
            'mezza giornata senza metà' => [['unit' => 'half_day'], ['half']],
            'metà sconosciuta' => [['unit' => 'half_day', 'half' => 'evening'], ['half']],
            'ore senza orari' => [['unit' => 'hours'], ['starts_at', 'ends_at']],
            'orario non H:i' => [['unit' => 'hours', 'starts_at' => '9:00', 'ends_at' => '11:00:00'], ['starts_at', 'ends_at']],
            'tipo inesistente' => [['absence_type_id' => '999999'], ['absence_type_id']],
        ];
    }

    public function test_requestable_type_without_approval_is_born_approved(): void
    {
        $type = AbsenceType::factory()->withBalance(BalanceType::Rol)->create(['requires_approval' => false]);

        // Da giovedì 29 ottobre a martedì 3 novembre: due mesi, due movimenti
        $response = $this->store(['absence_type_id' => $type->id, 'unit' => 'days', 'starts_on' => '2026-10-29', 'ends_on' => '2026-11-03'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.decided_by_name', null);

        $request = LeaveRequest::query()->findOrFail($response->json('data.id'));
        $this->assertSame(LeaveRequestStatus::Approved, $request->status);
        $this->assertNull($request->decided_by);
        $this->assertNotNull($request->decided_at);

        $movements = BalanceMovement::query()->where('leave_request_id', $request->id)->orderBy('effective_on')->get();
        $this->assertSame(
            [['rol', 'usage', -960, '2026-10-29', null], ['rol', 'usage', -960, '2026-11-02', null]],
            $movements->map(fn (BalanceMovement $m): array => [$m->balance->value, $m->kind->value, $m->minutes, $m->effective_on->toDateString(), $m->actor_id])->all(),
        );
        $this->assertSame($this->user->id, $movements->first()?->user_id);

        // Un tipo senza saldo nasce approvato senza movimenti
        $free = AbsenceType::factory()->create(['requires_approval' => false]);
        $this->store(['absence_type_id' => $free->id, 'unit' => 'days', 'starts_on' => '2026-11-10', 'ends_on' => '2026-11-10'])
            ->assertCreated()->assertJsonPath('data.status', 'approved');
        $this->assertSame(2, BalanceMovement::query()->where('kind', BalanceMovementKind::Usage)->count());
    }

    public function test_my_requests(): void
    {
        LeaveRequest::factory()->for($this->user)->count(21)
            ->sequence(fn ($sequence): array => [
                'starts_on' => CarbonImmutable::parse('2026-01-05')->addWeeks($sequence->index)->toDateString(),
                'ends_on' => CarbonImmutable::parse('2026-01-05')->addWeeks($sequence->index)->toDateString(),
            ])
            ->create();
        LeaveRequest::factory()->for($this->user)->withdrawn()->between('2025-12-29', '2026-01-02')->create();
        LeaveRequest::factory()->for($this->user)->between('2025-06-02', '2025-06-03')->create();
        LeaveRequest::factory()->between('2026-03-02', '2026-03-02')->create();

        $page = $this->getJson('/api/leave-requests?year=2026', $this->auth())->assertOk();
        // Le 21 dell'anno più quella a cavallo dell'anno (anche ritirata)
        $page->assertJsonPath('meta.total', 22)->assertJsonPath('meta.per_page', 20)->assertJsonCount(20, 'data');
        $this->assertSame('2026-05-25', $page->json('data.0.starts_on'));
        $this->assertSame([$this->user->id], collect($page->json('data'))->pluck('user.id')->unique()->all());

        $this->getJson('/api/leave-requests?year=2026&page=2', $this->auth())->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.1.starts_on', '2025-12-29')
            ->assertJsonPath('data.1.status', 'withdrawn');

        $this->getJson('/api/leave-requests', $this->auth())->assertOk()->assertJsonPath('meta.total', 23);
        $this->getJson('/api/leave-requests?year=abc', $this->auth())->assertUnprocessable()->assertJsonValidationErrors('year');
    }

    public function test_show(): void
    {
        $request = LeaveRequest::factory()->for($this->user)->between('2026-10-26', '2026-10-27')->create();
        $url = "/api/leave-requests/{$request->id}";

        $this->getJson($url, $this->auth())->assertOk()
            ->assertJsonPath('data.id', $request->id)
            ->assertJsonPath('data.days', [['date' => '2026-10-26', 'minutes' => 480], ['date' => '2026-10-27', 'minutes' => 480]])
            ->assertJsonPath('data.can.withdraw', true)
            ->assertJsonMissingPath('data.warnings');

        $colleague = User::factory()->at($this->location)->create();
        $this->actingAs($colleague)->getJson($url)->assertForbidden();

        $otherManager = User::factory()->manager()->at(Location::factory()->create())->create();
        $this->actingAs($otherManager)->getJson($url)->assertNotFound();

        $manager = User::factory()->manager()->at($this->location)->create();
        $this->actingAs($manager)->getJson($url)->assertOk()->assertJsonPath('data.can.withdraw', false);

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin)->getJson($url)->assertOk();

        $this->actingAs($admin)->getJson('/api/leave-requests/999999')->assertNotFound();
    }

    public function test_profile_absence_types_expose_units_and_limits(): void
    {
        $types = collect($this->getJson('/api/profile/absence-types', $this->auth())->assertOk()->json('data'))->keyBy('id');

        $this->assertSame([
            'id' => $this->type('vacation')->id,
            'name' => $this->type('vacation')->displayName(),
            'requires_enablement' => false,
            'enabled' => false,
            'allows_days' => true,
            'allows_half_days' => true,
            'allows_hours' => false,
            'balance' => 'vacation',
            'day_count' => 'working',
            'limit' => null,
        ], $types[$this->type('vacation')->id]);

        $marriage = $types[$this->type('marriage_leave')->id];
        $this->assertSame('calendar', $marriage['day_count']);
        $this->assertNull($marriage['balance']);
        $this->assertSame(['amount' => 15, 'unit' => 'days', 'period' => 'request'], $marriage['limit']);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return TestResponse<JsonResponse>
     */
    private function store(array $data): TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/leave-requests', $data);
    }

    /**
     * Intestazioni vuote: `actingAs` sull'utente di default prima di ogni chiamata.
     *
     * @return array<string, string>
     */
    private function auth(): array
    {
        $this->actingAs($this->user);

        return [];
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
