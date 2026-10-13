<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Requests\Users\StoreUserRequest;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\Translate;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Primo amministratore (spec §6.1): un invito come gli altri, nessuna password passa dal terminale.
 */
class CreateAdmin extends Command
{
    protected $signature = 'app:create-admin {name : Nome e cognome} {email : Email aziendale}';

    protected $description = 'Invita un amministratore (serve per il primo admin dell’installazione)';

    public function handle(InvitationService $invitations): int
    {
        $name = trim((string) $this->argument('name'));
        $email = Str::lower(trim((string) $this->argument('email')));

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

        DB::transaction(function () use ($name, $email, $invitations): void {
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
        });

        $this->info(Translate::text('invitations.command.sent', ['email' => $email, 'hours' => InvitationService::TTL_HOURS]));

        return self::SUCCESS;
    }
}
