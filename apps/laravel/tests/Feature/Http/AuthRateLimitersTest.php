<?php

namespace Tests\Feature\Http;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Tetti dei limiter pubblici. L'ufficio esce da un solo IP pubblico: i tetti per IP sono larghi,
 * quelli per email + IP restano stretti. Verificati sulla definizione perché arrivare a 100 richieste
 * passando dal Timebox del login renderebbe il test lentissimo.
 */
class AuthRateLimitersTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: list<array{0: string, 1: int, 2: int}>}>
     */
    public static function limiters(): array
    {
        return [
            'login' => ['login', [
                ['login:giulia@example.test|203.0.113.9', 5, 60],
                ['login-ip:203.0.113.9', 100, 60],
            ]],
            'two-factor' => ['two-factor', [
                ['two-factor:203.0.113.9', 60, 60],
            ]],
            'forgot-password' => ['forgot-password', [
                ['forgot-password:giulia@example.test|203.0.113.9', 3, 900],
                ['forgot-password-ip:203.0.113.9', 100, 900],
            ]],
            'reset-password' => ['reset-password', [
                ['reset-password:203.0.113.9', 30, 60],
            ]],
            'invitations' => ['invitations', [
                ['invitations:203.0.113.9', 30, 60],
            ]],
        ];
    }

    /**
     * @param  list<array{0: string, 1: int, 2: int}>  $expected  chiave, tentativi, durata in secondi
     */
    #[DataProvider('limiters')]
    public function test_public_limiters_have_the_agreed_ceilings(string $name, array $expected): void
    {
        $limiter = RateLimiter::limiter($name);
        $this->assertNotNull($limiter);

        $request = Request::create('/', 'POST', ['email' => ' Giulia@Example.test '], server: ['REMOTE_ADDR' => '203.0.113.9']);
        $result = $limiter($request);
        $limits = array_map(
            fn (Limit $limit): array => [$limit->key, $limit->maxAttempts, $limit->decaySeconds],
            $result instanceof Limit ? [$result] : array_values($result),
        );

        $this->assertSame($expected, $limits);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function throttledRoutes(): array
    {
        return [
            'login' => ['login.store', 'throttle:login'],
            'codice' => ['auth.two-factor', 'throttle:two-factor'],
            'nuovo codice' => ['auth.two-factor.resend', 'throttle:two-factor'],
            'link di recupero' => ['password.email', 'throttle:forgot-password'],
            'nuova password' => ['password.update', 'throttle:reset-password'],
            'pagina invito' => ['invitations.show', 'throttle:invitations'],
            'attivazione invito' => ['invitations.accept', 'throttle:invitations'],
        ];
    }

    #[DataProvider('throttledRoutes')]
    public function test_each_public_route_uses_its_limiter(string $routeName, string $middleware): void
    {
        $route = Route::getRoutes()->getByName($routeName);

        $this->assertNotNull($route);
        $this->assertContains($middleware, $route->gatherMiddleware());
    }
}
