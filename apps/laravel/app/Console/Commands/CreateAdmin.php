<?php

namespace App\Console\Commands;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Requests\Users\StoreUserRequest;
use App\Models\User;
use App\Services\AuthEventLogger;
use App\Services\InvitationService;
use App\Support\Translate;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Primo amministratore (spec §6.1): un invito come gli altri, nessuna password passa dal terminale.
 * Con un admin attivo già presente si rifiuta (si usa la sezione Amministratori) salvo --force.
 */
class CreateAdmin extends Command
{
    protected $signature = 'app:create-admin
        {name : Nome e cognome}
        {email : Email aziendale}
        {--force : Invita anche se esiste già un amministratore attivo}';

    protected $description = 'Invita un amministratore (serve per il primo admin dell’installazione)';

    public function handle(InvitationService $invitations, AuthEventLogger $events, Request $request): int
    {
        $name = trim((string) $this->argument('name'));
        $email = Str::lower(trim((string) $this->argument('email')));

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

        $validator = Validator::make(['name' => $name, 'email' => $email], [
            'name' => ['required', 'string', 'max:255', 'not_regex:'.StoreUserRequest::NAME_FORBIDDEN_CHARACTERS],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
        ], ['name.not_regex' => Translate::text('users.name_characters')]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        DB::transaction(function () use ($name, $email, $invitations, $events, $request): void {
            $admin = new User;
            $admin->forceFill([
                'name' => $name,
                'email' => $email,
                'password' => null,
                'role' => Role::Admin,
                'status' => UserStatus::Invited,
                'locale' => 'it',
            ])->save();

            $invitations->send($admin, null);
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
