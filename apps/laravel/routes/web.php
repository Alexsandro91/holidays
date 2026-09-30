<?php

use App\Http\Controllers\Auth\TwoFactorChallengeController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Passo del codice: gruppo `web` (sessione e CSRF) come le rotte di login di Fortify
Route::prefix('api/auth')->middleware(['guest:web', 'throttle:two-factor'])->group(function (): void {
    Route::post('/two-factor', [TwoFactorChallengeController::class, 'store'])->name('auth.two-factor');
    Route::post('/two-factor/resend', [TwoFactorChallengeController::class, 'resend'])->name('auth.two-factor.resend');
});
