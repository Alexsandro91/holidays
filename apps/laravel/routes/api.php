<?php

use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/user', CurrentUserController::class)->name('auth.user');

    // Gestione utenti e amministratori: solo admin (UserPolicy)
    Route::get('/users', [UserController::class, 'index'])->can('viewAny', User::class)->name('users.index');
});
