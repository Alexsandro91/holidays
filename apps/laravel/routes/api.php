<?php

use App\Http\Controllers\Admin\AdministratorController;
use App\Http\Controllers\Admin\ClosureController;
use App\Http\Controllers\Admin\LocationCalendarController;
use App\Http\Controllers\Admin\LocationController;
use App\Http\Controllers\Admin\LocationScheduleController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\UserHistoryController;
use App\Http\Controllers\Admin\UserInvitationController;
use App\Http\Controllers\Admin\UserPasswordResetController;
use App\Http\Controllers\Admin\UserRoleController;
use App\Http\Controllers\Admin\UserScheduleController;
use App\Http\Controllers\Admin\UserStatusController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Http\Controllers\Auth\ProfileController;
use App\Http\Controllers\Auth\ProfileHistoryController;
use App\Models\Location;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/user', CurrentUserController::class)->name('auth.user');

    // Profilo: ognuno agisce solo su sé stesso, qualunque sia il ruolo (nessuna policy)
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::put('/profile/password', [ProfileController::class, 'password'])->name('profile.password');
    Route::get('/profile/history', ProfileHistoryController::class)->name('profile.history');

    // Gestione utenti: responsabili e admin, mai sugli admin per il responsabile (UserPolicy)
    Route::get('/users', [UserController::class, 'index'])->can('viewAny', User::class)->name('users.index');
    Route::post('/users', [UserController::class, 'store'])->can('create', User::class)->name('users.store');
    Route::post('/users/{user}/invitation', [UserInvitationController::class, 'resend'])
        ->can('resendInvitation', 'user')->name('users.invitation.resend');
    Route::delete('/users/{user}/invitation', [UserInvitationController::class, 'cancel'])
        ->can('cancelInvitation', 'user')->name('users.invitation.cancel');
    Route::patch('/users/{user}', [UserController::class, 'update'])->can('update', 'user')->name('users.update');
    Route::patch('/users/{user}/role', UserRoleController::class)->can('changeRole', 'user')->name('users.role');
    Route::post('/users/{user}/disable', [UserStatusController::class, 'disable'])->can('disable', 'user')->name('users.disable');
    Route::post('/users/{user}/password-reset', UserPasswordResetController::class)->can('sendPasswordReset', 'user')->name('users.password-reset');
    Route::get('/users/{user}/history', UserHistoryController::class)->can('viewHistory', 'user')->name('users.history');
    Route::post('/users/{user}/enable', [UserStatusController::class, 'enable'])->can('enable', 'user')->name('users.enable');

    // Sezione Amministratori: solo admin
    Route::get('/administrators', [AdministratorController::class, 'index'])->can('manageAdministrators', User::class)->name('administrators.index');
    Route::post('/administrators', [AdministratorController::class, 'store'])->can('manageAdministrators', User::class)->name('administrators.store');
    Route::post('/administrators/invitations', [AdministratorController::class, 'invite'])->can('manageAdministrators', User::class)->name('administrators.invitations.store');
    Route::delete('/administrators/{user}', [AdministratorController::class, 'destroy'])->can('revokeAdmin', 'user')->name('administrators.destroy');

    // Sezione Sedi: solo admin (LocationPolicy). `options` prima di `{location}`
    Route::get('/locations', [LocationController::class, 'index'])->can('viewAny', Location::class)->name('locations.index');
    Route::get('/locations/options', [LocationController::class, 'options'])->can('viewAny', Location::class)->name('locations.options');
    Route::post('/locations', [LocationController::class, 'store'])->can('create', Location::class)->name('locations.store');
    Route::get('/locations/{location}', [LocationController::class, 'show'])->can('view', 'location')->name('locations.show');
    Route::patch('/locations/{location}', [LocationController::class, 'update'])->can('update', 'location')->name('locations.update');
    Route::post('/locations/{location}/primary', [LocationController::class, 'primary'])->can('update', 'location')->name('locations.primary');
    Route::post('/locations/{location}/archive', [LocationController::class, 'archive'])->can('update', 'location')->name('locations.archive');
    Route::post('/locations/{location}/restore', [LocationController::class, 'restore'])->can('update', 'location')->name('locations.restore');
    Route::get('/locations/{location}/schedules', [LocationScheduleController::class, 'index'])->can('view', 'location')->name('locations.schedules.index');
    Route::post('/locations/{location}/schedules', [LocationScheduleController::class, 'store'])->can('update', 'location')->name('locations.schedules.store');
    Route::delete('/locations/{location}/schedules/{schedule}', [LocationScheduleController::class, 'destroy'])
        ->can('update', 'location')->scopeBindings()->name('locations.schedules.destroy');
    Route::get('/locations/{location}/calendar', LocationCalendarController::class)->can('view', 'location')->name('locations.calendar');

    // Orario personale: solo admin (UserPolicy::manageSchedule)
    Route::get('/users/{user}/schedules', [UserScheduleController::class, 'index'])->can('manageSchedule', 'user')->name('users.schedules.index');
    Route::post('/users/{user}/schedules', [UserScheduleController::class, 'store'])->can('manageSchedule', 'user')->name('users.schedules.store');
    Route::delete('/users/{user}/schedules/{schedule}', [UserScheduleController::class, 'destroy'])
        ->can('manageSchedule', 'user')->scopeBindings()->name('users.schedules.destroy');

    // Chiusure aziendali: solo admin (LocationPolicy::manageClosures)
    Route::get('/closures', [ClosureController::class, 'index'])->can('manageClosures', Location::class)->name('closures.index');
    Route::post('/closures', [ClosureController::class, 'store'])->can('manageClosures', Location::class)->name('closures.store');
    Route::patch('/closures/{closure}', [ClosureController::class, 'update'])->can('manageClosures', Location::class)->name('closures.update');
    Route::delete('/closures/{closure}', [ClosureController::class, 'destroy'])->can('manageClosures', Location::class)->name('closures.destroy');
});
