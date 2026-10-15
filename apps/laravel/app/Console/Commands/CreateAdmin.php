<?php

namespace App\Console\Commands;

use App\Enums\AuthEventType;
use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\Location;
use App\Models\User;
use App\Services\AuthEventLogger;
use App\Services\InvitationService;
use App\Services\UserHistoryRecorder;
use App\Support\PersonRules;
use App\Support\Translate;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Primo amministratore (spec §6.1): un invito come gli altri, nessuna password passa dal terminale.
 * Con un admin attivo già presente si rifiuta (si usa la sezione Amministratori) salvo --force.
 */
class CreateAdmin extends Command
{
    protected $signature = 'app:create-admin
        {first_name : Nome}
        {last_name : Cognome}
        {email : Email aziendale}
        {--force : Invita anche se esiste già un amministratore attivo}';

    protected $description = 'Invita un amministratore (serve per il primo admin dell’installazione)';

    public function handle(InvitationService $invitations, AuthEventLogger $events, UserHistoryRecorder $history, Request $request): int
    {
        $firstName = trim((string) $this->argument('first_name'));
        $lastName = trim((string) $this->argument('last_name'));
        $email = PersonRules::normalizeEmail((string) $this->argument('email'));

        if (! $this->option('force') && $this->activeAdminExists()) {
            $this->error(Translate::text('invitations.command.admin_exists'));

            return self::FAILURE;
        }

        // Invito del primo admin non andato a buon fine o scaduto: nuovo link, il precedente smette di valere
        $pending = User::query()
            ->where('email', $email)
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Invited)
            ->first();

        if ($pending !== null) {
            DB::transaction(function () use ($pending, $invitations, $events, $request): void {
                $invitations->send($pending, null);
                $events->log(AuthEventType::InvitationSent, $request, $pending);
            });
            $this->info(Translate::text('invitations.command.resent', ['email' => $email, 'hours' => InvitationService::TTL_HOURS]));

            return self::SUCCESS;
        }

        // Stesse regole dell'invito dalla sezione Amministratori
        $validator = Validator::make(
            ['first_name' => $firstName, 'last_name' => $lastName, 'email' => $email],
            ['first_name' => PersonRules::name(), 'last_name' => PersonRules::name(), 'email' => PersonRules::email()],
            PersonRules::messages(),
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        DB::transaction(function () use ($firstName, $lastName, $email, $invitations, $events, $history, $request): void {
            $admin = new User;
            $admin->forceFill([
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $email,
                'password' => null,
                'role' => Role::Admin,
                'employment_type' => EmploymentType::Employee,
                'location_id' => Location::primary()->id,
                'status' => UserStatus::Invited,
                'locale' => 'it',
            ])->save();

            $invitations->send($admin, null);
            $history->invited($admin, null);
            // Nessun autore: l'invito parte dal terminale
            $events->log(AuthEventType::InvitationSent, $request, $admin);
        });

        $this->info(Translate::text('invitations.command.sent', ['email' => $email, 'hours' => InvitationService::TTL_HOURS]));

        return self::SUCCESS;
    }

    private function activeAdminExists(): bool
    {
        return User::query()->where('role', Role::Admin)->where('status', UserStatus::Active)->exists();
    }
}
