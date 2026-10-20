<?php

namespace Tests\Feature\Balances;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Enums\UserHistoryEvent;
use App\Enums\UserStatus;
use App\Models\AccrualSetting;
use App\Models\BalanceAlignment;
use App\Models\BalanceMovement;
use App\Models\User;
use App\Models\UserHistory;
use App\Models\WorkSchedule;
use App\Services\BalanceAccrualService;
use App\Services\BalanceCorrectionService;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\PendingCommand;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Maturazione mensile (spec §4.2, §4.3): chi matura, quanto, quando, e senza doppioni.
 * Il tempo si fissa prima di creare utenti e storico: la maturazione legge `created_at`.
 */
class BalanceAccrualTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Azienda: ferie 160 h, ROL 72 h, ex festività 32 h; la sede principale lavora lun-ven 8 ore
        AccrualSetting::company()->forceFill(['vacation_minutes' => 9600, 'rol_minutes' => 4320, 'ex_holidays_minutes' => 1920])->save();
    }

    public function test_full_time_employee_accrues_one_twelfth(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');
        Log::spy();

        $this->runAt('2026-10-01 00:30')
            ->expectsOutputToContain(Translate::text('balances.command.accrued', ['count' => 3, 'period' => '2026-10']))
            ->assertSuccessful();

        $this->assertSame(['ex_holidays' => 160, 'rol' => 360, 'vacation' => 800], $this->accruedMinutes($user, '2026-10'));

        $movement = $this->accrual($user, BalanceType::Vacation, '2026-10');
        $this->assertNotNull($movement);
        $this->assertSame(BalanceMovementKind::Accrual, $movement->kind);
        $this->assertSame('2026-10-01', $movement->effective_on->toDateString());
        $this->assertNull($movement->actor_id);
        $this->assertNull($movement->note);
        $this->assertNull($movement->target_minutes);

        Log::shouldHaveReceived('info')->with('Balances accrued', Mockery::on(
            fn (array $context): bool => $context['period'] === '2026-10' && $context['count'] === 3,
        ))->once();
    }

    public function test_horizontal_part_time_accrues_half(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');
        WorkSchedule::factory()->forUser($user)->validFrom('2026-09-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        $this->assertSame(['ex_holidays' => 80, 'rol' => 180, 'vacation' => 400], $this->accruedMinutes($user, '2026-10'));
    }

    public function test_vertical_part_time(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');
        WorkSchedule::factory()->forUser($user)->validFrom('2026-09-01')->minutes([480, 480, 480, 0, 0, 0, 0])->create();

        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        // round(9600 × 1440 / 2400 / 12)
        $this->assertSame(480, $this->accruedMinutes($user, '2026-10')['vacation']);
    }

    public function test_follows_location_accrues_full(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');
        WorkSchedule::factory()->forUser($user)->validFrom('2026-09-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-09-15')->followsLocation()->create();

        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        $this->assertSame(800, $this->accruedMinutes($user, '2026-10')['vacation']);
    }

    public function test_zero_annual_value_writes_nothing(): void
    {
        AccrualSetting::company()->forceFill(['ex_holidays_minutes' => 0])->save();
        $user = $this->employeeCreatedAt('2026-09-01 10:00');

        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        $this->assertSame(['rol' => 360, 'vacation' => 800], $this->accruedMinutes($user, '2026-10'));
    }

    public function test_rounding_half_up(): void
    {
        $this->assertSame(83, BalanceAccrualService::monthlyQuota(1000, 2400, 2400));
        $this->assertSame(84, BalanceAccrualService::monthlyQuota(1002, 2400, 2400));
        $this->assertSame(0, BalanceAccrualService::monthlyQuota(1000, 2400, 0));

        $down = $this->employeeCreatedAt('2026-09-01 10:00');
        $up = $this->employeeCreatedAt('2026-09-01 10:00');
        AccrualSetting::query()->newModelInstance()->forceFill(['user_id' => $down->id, 'vacation_minutes' => 1000])->save();
        AccrualSetting::query()->newModelInstance()->forceFill(['user_id' => $up->id, 'vacation_minutes' => 1002])->save();

        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        $this->assertSame(83, $this->accruedMinutes($down, '2026-10')['vacation']);
        $this->assertSame(84, $this->accruedMinutes($up, '2026-10')['vacation']);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function excludedPeople(): array
    {
        return [
            'collaboratore' => ['contractor'],
            'stagista' => ['intern'],
            'invitato' => ['invited'],
            'disattivato da prima del mese' => ['disabled'],
        ];
    }

    #[DataProvider('excludedPeople')]
    public function test_excluded_people(string $kind): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-09-01 10:00', 'Europe/Rome'));
        $factory = User::factory();
        $user = match ($kind) {
            'contractor' => $factory->contractor()->create(),
            'intern' => $factory->intern()->create(),
            'invited' => $factory->invited()->create(),
            default => $factory->create(),
        };

        if ($kind === 'disabled') {
            $user->forceFill(['status' => UserStatus::Disabled])->save();
            $this->history($user, UserHistoryEvent::Disabled, '2026-09-20 10:00');
        }

        $this->runAt('2026-10-01 00:30')->assertSuccessful();
        $this->runAt('2026-10-20 00:30')->assertSuccessful();

        $this->assertSame(0, BalanceMovement::query()->count());
    }

    public function test_joiner_by_the_16th_accrues(): void
    {
        $user = $this->joiner('2026-10-08 10:00', '2026-10-12 10:00');
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-12')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $this->runAt('2026-10-13 00:30')->assertSuccessful();

        $this->assertSame(['ex_holidays' => 80, 'rol' => 180, 'vacation' => 400], $this->accruedMinutes($user, '2026-10'));
        $this->assertSame('2026-10-01', $this->accrual($user, BalanceType::Vacation, '2026-10')?->effective_on->toDateString());
    }

    public function test_reference_day_before_the_16th_is_today(): void
    {
        $user = $this->joiner('2026-10-08 10:00', '2026-10-12 10:00');
        // Part-time dall'ingresso, tempo pieno già programmato dal 15: il giro del 13 usa l'orario in vigore il 13
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-12')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-15')->followsLocation()->create();

        $this->runAt('2026-10-13 00:30')->assertSuccessful();

        $this->assertSame(400, $this->accruedMinutes($user, '2026-10')['vacation']);
    }

    public function test_joiner_after_the_16th_waits(): void
    {
        $user = $this->joiner('2026-10-15 10:00', '2026-10-18 10:00');

        foreach (['2026-10-18 00:30', '2026-10-20 00:30', '2026-10-31 00:30'] as $time) {
            $this->runAt($time)->assertSuccessful();
        }

        $this->assertSame(0, BalanceMovement::query()->count());

        $this->runAt('2026-11-01 00:30')->assertSuccessful();

        $this->assertSame([], $this->accruedMinutes($user, '2026-10'));
        $this->assertSame(['ex_holidays' => 160, 'rol' => 360, 'vacation' => 800], $this->accruedMinutes($user, '2026-11'));
        $this->assertSame('2026-11-01', $this->accrual($user, BalanceType::Vacation, '2026-11')?->effective_on->toDateString());
    }

    public function test_leaver_keeps_the_month(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');
        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        $this->travelTo(CarbonImmutable::parse('2026-10-05 10:00', 'Europe/Rome'));
        $user->forceFill(['status' => UserStatus::Disabled])->save();
        $this->history($user, UserHistoryEvent::Disabled, '2026-10-05 10:00');

        $this->runAt('2026-10-06 00:30')->assertSuccessful();

        $this->assertSame(['ex_holidays' => 160, 'rol' => 360, 'vacation' => 800], $this->accruedMinutes($user, '2026-10'));
        $this->assertSame(3, BalanceMovement::query()->count());
    }

    public function test_late_first_run_recovers_from_history(): void
    {
        $sinceSeptember = $this->employeeCreatedAt('2026-09-01 10:00');
        $byThe16th = $this->joiner('2026-10-05 10:00', '2026-10-12 10:00');
        $after16th = $this->joiner('2026-10-15 10:00', '2026-10-18 10:00');
        // Orario personale dal giorno d'ingresso: il giorno di riferimento è il 16 e lo comprende
        WorkSchedule::factory()->forUser($byThe16th)->validFrom('2026-10-12')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $this->runAt('2026-10-20 00:30')->assertSuccessful();

        $this->assertSame(800, $this->accruedMinutes($sinceSeptember, '2026-10')['vacation']);
        $this->assertSame(400, $this->accruedMinutes($byThe16th, '2026-10')['vacation']);
        $this->assertSame([], $this->accruedMinutes($after16th, '2026-10'));
        $this->assertSame(6, BalanceMovement::query()->count());

        $this->runAt('2026-10-21 00:30')->assertSuccessful();

        $this->assertSame(6, BalanceMovement::query()->count());
    }

    public function test_idempotent_runs(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');

        $this->runAt('2026-10-01 00:30')->assertSuccessful();
        $this->runAt('2026-10-01 00:31')
            ->expectsOutputToContain(Translate::text('balances.command.accrued', ['count' => 0, 'period' => '2026-10']))
            ->assertSuccessful();
        $this->runAt('2026-10-02 00:30')->assertSuccessful();

        $this->assertSame(3, BalanceMovement::query()->count());
        $this->assertSame(3, BalanceMovement::query()->where('user_id', $user->id)->where('period', '2026-10')->distinct()->count('balance'));
    }

    public function test_concurrent_insert_is_skipped_and_logged(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');
        // Un'altra scrittura della stessa maturazione arriva appena prima dell'insert: l'indice unico lo ferma e il giro
        // salta la persona (nel test la riga concorrente sta nella stessa transazione e sparisce con il rollback)
        $raced = false;
        DB::connection()->beforeExecuting(function (string $query) use ($user, &$raced): void {
            if ($raced || ! str_starts_with($query, 'insert into `balance_movements`')) {
                return;
            }

            $raced = true;
            BalanceMovement::factory()->for($user)->accrual('2026-10', 800)->create(['balance' => BalanceType::Vacation]);
        });
        Log::spy();

        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        Log::shouldHaveReceived('info')->with('Balance accrual skipped', Mockery::on(
            fn (array $context): bool => $context['user_id'] === $user->id && $context['period'] === '2026-10',
        ))->once();
        Log::shouldHaveReceived('info')->with('Balances accrued', Mockery::on(fn (array $context): bool => $context['count'] === 0))->once();
        $this->assertSame(0, BalanceMovement::query()->where('user_id', $user->id)->count());

        $this->runAt('2026-10-02 00:30')->assertSuccessful();

        $this->assertSame(['ex_holidays' => 160, 'rol' => 360, 'vacation' => 800], $this->accruedMinutes($user, '2026-10'));
    }

    public function test_no_accrual_before_an_alignment(): void
    {
        $aligned = $this->employeeCreatedAt('2026-09-01 10:00');
        $alignedBefore = $this->employeeCreatedAt('2026-09-01 10:00');
        $this->alignVacation($aligned, '2026-10-01');
        $this->alignVacation($alignedBefore, '2026-09-30');

        $this->runAt('2026-10-03 00:30')->assertSuccessful();

        $this->assertSame(['ex_holidays' => 160, 'rol' => 360], $this->accruedMinutes($aligned, '2026-10'));
        $this->assertSame(['ex_holidays' => 160, 'rol' => 360, 'vacation' => 800], $this->accruedMinutes($alignedBefore, '2026-10'));
    }

    public function test_zero_delta_alignment_blocks_accrual(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');
        $admin = User::factory()->admin()->create();

        // Busta paga del 1° ottobre già in pari (delta 0): nessun movimento, ma il saldo è allineato a quella data
        $this->travelTo(CarbonImmutable::parse('2026-10-01 00:10', 'Europe/Rome'));
        $deltas = app(BalanceCorrectionService::class)->align($user, CarbonImmutable::parse('2026-10-01'), ['vacation' => 0], null, $admin);
        $this->assertSame(['vacation' => 0], $deltas);
        $this->assertSame(0, BalanceMovement::query()->where('user_id', $user->id)->count());

        $this->runAt('2026-10-01 00:30')->assertSuccessful();

        $this->assertSame(['ex_holidays' => 160, 'rol' => 360], $this->accruedMinutes($user, '2026-10'));
    }

    public function test_month_option_recovers_a_past_month(): void
    {
        $user = $this->employeeCreatedAt('2026-08-15 10:00');
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00', 'Europe/Rome'));

        $this->artisan('balances:accrue', ['--month' => '2026-11'])->assertFailed();
        $this->artisan('balances:accrue', ['--month' => '2026-9'])->assertFailed();
        $this->assertSame(0, BalanceMovement::query()->count());

        $this->artisan('balances:accrue', ['--month' => '2026-09'])->assertSuccessful();

        $this->assertSame(['ex_holidays' => 160, 'rol' => 360, 'vacation' => 800], $this->accruedMinutes($user, '2026-09'));
        $this->assertSame('2026-09-01', $this->accrual($user, BalanceType::Vacation, '2026-09')?->effective_on->toDateString());
        $this->assertSame([], $this->accruedMinutes($user, '2026-10'));
    }

    public function test_month_option_uses_the_16th_and_skips_people_who_joined_later(): void
    {
        $byThe16th = $this->joiner('2026-09-05 10:00', '2026-09-14 10:00');
        $after16th = $this->joiner('2026-09-10 10:00', '2026-09-17 10:00');
        $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00', 'Europe/Rome'));

        $this->artisan('balances:accrue', ['--month' => '2026-09'])->assertSuccessful();

        $this->assertSame(800, $this->accruedMinutes($byThe16th, '2026-09')['vacation']);
        $this->assertSame([], $this->accruedMinutes($after16th, '2026-09'));
    }

    public function test_location_timezone_defines_the_month(): void
    {
        $user = $this->employeeCreatedAt('2026-09-01 10:00');

        $this->travelTo(CarbonImmutable::parse('2026-09-30 22:30', 'UTC'));
        $this->artisan('balances:accrue')->assertSuccessful();

        $this->assertSame(800, $this->accruedMinutes($user, '2026-10')['vacation']);
        $this->assertSame([], $this->accruedMinutes($user, '2026-09'));
    }

    private function employeeCreatedAt(string $romeTime): User
    {
        $this->travelTo(CarbonImmutable::parse($romeTime, 'Europe/Rome'));

        return User::factory()->create();
    }

    /**
     * Invitata a `$invitedAt`, attiva da `$activatedAt` (stato attuale: attiva).
     */
    private function joiner(string $invitedAt, string $activatedAt): User
    {
        $this->travelTo(CarbonImmutable::parse($invitedAt, 'Europe/Rome'));
        $user = User::factory()->invited()->create();
        $this->history($user, UserHistoryEvent::Invited, $invitedAt);

        $this->travelTo(CarbonImmutable::parse($activatedAt, 'Europe/Rome'));
        $user->forceFill(['status' => UserStatus::Active])->save();
        $this->history($user, UserHistoryEvent::Activated, $activatedAt);

        return $user;
    }

    private function history(User $user, UserHistoryEvent $event, string $romeTime): void
    {
        (new UserHistory)->forceFill([
            'user_id' => $user->id,
            'event' => $event,
            'created_at' => CarbonImmutable::parse($romeTime, 'Europe/Rome')->utc(),
        ])->save();
    }

    private function alignVacation(User $user, string $date): void
    {
        BalanceMovement::factory()->for($user)->alignment($date, -120, 4000)->create();
        (new BalanceAlignment)->forceFill(['user_id' => $user->id, 'balance' => BalanceType::Vacation, 'aligned_on' => $date])->save();
    }

    /**
     * Giro del job a quell'ora di Roma.
     */
    private function runAt(string $romeTime): PendingCommand
    {
        $this->travelTo(CarbonImmutable::parse($romeTime, 'Europe/Rome'));

        $command = $this->artisan('balances:accrue');
        $this->assertInstanceOf(PendingCommand::class, $command);

        return $command;
    }

    private function accrual(User $user, BalanceType $balance, string $period): ?BalanceMovement
    {
        return BalanceMovement::query()->where('user_id', $user->id)->where('balance', $balance)->where('period', $period)->first();
    }

    /**
     * @return array<string, int> minuti maturati per saldo, in ordine alfabetico
     */
    private function accruedMinutes(User $user, string $period): array
    {
        return BalanceMovement::query()
            ->where('user_id', $user->id)
            ->where('kind', BalanceMovementKind::Accrual)
            ->where('period', $period)
            ->orderBy('balance')
            ->get()
            ->mapWithKeys(fn (BalanceMovement $movement): array => [$movement->balance->value => $movement->minutes])
            ->all();
    }
}
