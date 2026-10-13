<?php

use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\TwoFactorChallengeController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Http\Controllers\AuthenticatedSessionController;

Route::get('/', function () {
    return view('welcome');
});

// Rotte di accesso (Fortify::ignoreRoutes): gruppo `web` per sessione e CSRF della SPA sulla stessa origine
Route::prefix('api/auth')->group(function (): void {
    Route::middleware('guest:web')->group(function (): void {
        // Il login passa dalla pipeline di Fortify (FortifyServiceProvider::authenticateThrough)
        Route::post('/login', [AuthenticatedSessionController::class, 'store'])
            ->middleware('throttle:login')
            ->name('login.store');

        Route::post('/forgot-password', ForgotPasswordController::class)
            ->middleware('throttle:forgot-password')
            ->name('password.email');

        Route::middleware('throttle:two-factor')->group(function (): void {
            Route::post('/two-factor', [TwoFactorChallengeController::class, 'store'])->name('auth.two-factor');
            Route::post('/two-factor/resend', [TwoFactorChallengeController::class, 'resend'])->name('auth.two-factor.resend');
        });
    });

    Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])
        ->middleware('auth:web')
        ->name('logout');
});
