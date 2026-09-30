<?php

namespace App\Actions\Fortify;

use App\Enums\AuthEventType;
use App\Mail\LoginCodeMail;
use App\Models\User;
use App\Services\AuthEventLogger;
use App\Services\LoginChallengeService;
use App\Support\AuthSession;
use App\Support\Translate;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Timebox;
use Illuminate\Validation\ValidationException;

/**
 * Passo della pipeline di login Fortify: verifica le credenziali senza aprire la sessione
 * e invia il codice di 6 cifre via email. La sessione vera parte solo col codice giusto.
 */
final class StartEmailLoginChallenge
{
    /** Durata minima della verifica: uguale per email esistenti e inesistenti. */
    private const MIN_DURATION_MICROSECONDS = 300_000;

    public function __construct(
        private readonly LoginChallengeService $challenges,
        private readonly AuthEventLogger $events,
    ) {}

    public function handle(Request $request, Closure $next): JsonResponse
    {
        $user = $this->authenticatableUser($request);

        [$challenge, $code] = $this->challenges->start($user);

        $request->session()->regenerate();
        $request->session()->put(AuthSession::CHALLENGE_ID, $challenge->id);

        Mail::to($user)->send(new LoginCodeMail($code, (string) $request->userAgent(), now()));

        return response()->json(['two_factor' => true]);
    }

    private function authenticatableUser(Request $request): User
    {
        // Input non stringa (es. email[]=…) trattato come vuoto: niente errori di conversione
        $rawEmail = $request->input('email');
        $rawPassword = $request->input('password');
        $email = is_string($rawEmail) ? Str::lower(trim($rawEmail)) : '';
        $password = is_string($rawPassword) ? $rawPassword : '';

        /** @var array{0: User|null, 1: bool} $result */
        $result = (new Timebox)->call(function () use ($email, $password): array {
            $user = User::query()->where('email', $email)->first();

            if ($user === null || $user->password === null) {
                // Verifica fittizia: stesso costo anche quando l'utente non esiste o non ha password
                Hash::check($password, self::dummyHash());

                return [$user, false];
            }

            return [$user, Hash::check($password, $user->password) && $user->isActive()];
        }, self::MIN_DURATION_MICROSECONDS);

        [$user, $valid] = $result;

        if (! $valid || $user === null) {
            $this->events->log(AuthEventType::LoginFailed, $request, $user);

            throw ValidationException::withMessages(['email' => [Translate::text('auth.failed')]]);
        }

        return $user;
    }

    private static function dummyHash(): string
    {
        static $hash = null;

        return $hash ??= Hash::make(Str::random(40));
    }
}
