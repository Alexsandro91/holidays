<?php

use App\Http\Controllers\Admin\AdministratorController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\UserInvitationController;
use App\Http\Controllers\Admin\UserRoleController;
use App\Http\Controllers\Admin\UserStatusController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/user', CurrentUserController::class)->name('auth.user');

    // Gestione utenti: responsabili e admin, mai sugli admin per il responsabile (UserPolicy)
    Route::get('/users', [UserController::class, 'index'])->can('viewAny', User::class)->name('users.index');
    Route::post('/users', [UserController::class, 'store'])->can('create', User::class)->name('users.store');
    Route::post('/users/{user}/invitation', [UserInvitationController::class, 'resend'])
        ->can('resendInvitation', 'user')->name('users.invitation.resend');
    Route::delete('/users/{user}/invitation', [UserInvitationController::class, 'cancel'])
        ->can('cancelInvitation', 'user')->name('users.invitation.cancel');
    Route::patch('/users/{user}/role', UserRoleController::class)->can('changeRole', 'user')->name('users.role');
    Route::post('/users/{user}/disable', [UserStatusController::class, 'disable'])->can('disable', 'user')->name('users.disable');
    Route::post('/users/{user}/enable', [UserStatusController::class, 'enable'])->can('enable', 'user')->name('users.enable');

    // Sezione Amministratori: solo admin
    Route::get('/administrators', [AdministratorController::class, 'index'])->can('manageAdministrators', User::class)->name('administrators.index');
    Route::post('/administrators', [AdministratorController::class, 'store'])->can('manageAdministrators', User::class)->name('administrators.store');
    Route::post('/administrators/invitations', [AdministratorController::class, 'invite'])->can('manageAdministrators', User::class)->name('administrators.invitations.store');
    Route::delete('/administrators/{user}', [AdministratorController::class, 'destroy'])->can('revokeAdmin', 'user')->name('administrators.destroy');
});
