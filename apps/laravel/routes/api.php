<?php

use App\Http\Controllers\Admin\AbsenceTypeController;
use App\Http\Controllers\Admin\AccrualSettingController;
use App\Http\Controllers\Admin\AdministratorController;
use App\Http\Controllers\Admin\BalanceOverviewController;
use App\Http\Controllers\Admin\ClosureController;
use App\Http\Controllers\Admin\LocationAccrualController;
use App\Http\Controllers\Admin\LocationCalendarController;
use App\Http\Controllers\Admin\LocationController;
use App\Http\Controllers\Admin\LocationScheduleController;
use App\Http\Controllers\Admin\UserAbsenceTypeController;
use App\Http\Controllers\Admin\UserAccrualController;
use App\Http\Controllers\Admin\UserBalanceController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\UserHistoryController;
use App\Http\Controllers\Admin\UserInvitationController;
use App\Http\Controllers\Admin\UserPasswordResetController;
use App\Http\Controllers\Admin\UserRoleController;
use App\Http\Controllers\Admin\UserScheduleController;
use App\Http\Controllers\Admin\UserStatusController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Http\Controllers\Auth\ProfileAbsenceTypeController;
use App\Http\Controllers\Auth\ProfileBalanceController;
use App\Http\Controllers\Auth\ProfileController;
use App\Http\Controllers\Auth\ProfileHistoryController;
use App\Models\AbsenceType;
use App\Models\AccrualSetting;
use App\Models\Location;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/user', CurrentUserController::class)->name('auth.user');

    // Profilo: ognuno agisce solo su sé stesso, qualunque sia il ruolo (nessuna policy)
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::put('/profile/password', [ProfileController::class, 'password'])->name('profile.password');
    Route::get('/profile/history', ProfileHistoryController::class)->name('profile.history');
    Route::get('/profile/absence-types', ProfileAbsenceTypeController::class)->name('profile.absence-types');
    Route::get('/profile/balances', [ProfileBalanceController::class, 'summary'])->name('profile.balances');
    Route::get('/profile/balance-movements', [ProfileBalanceController::class, 'movements'])->name('profile.balance-movements');

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

    // Tipi di assenza: solo admin (AbsenceTypePolicy). `order` prima di `{absenceType}`
    Route::get('/absence-types', [AbsenceTypeController::class, 'index'])->can('viewAny', AbsenceType::class)->name('absence-types.index');
    Route::post('/absence-types', [AbsenceTypeController::class, 'store'])->can('create', AbsenceType::class)->name('absence-types.store');
    Route::put('/absence-types/order', [AbsenceTypeController::class, 'order'])->can('update', AbsenceType::class)->name('absence-types.order');
    Route::patch('/absence-types/{absenceType}', [AbsenceTypeController::class, 'update'])->can('update', 'absenceType')->name('absence-types.update');
    Route::post('/absence-types/{absenceType}/archive', [AbsenceTypeController::class, 'archive'])->can('update', 'absenceType')->name('absence-types.archive');
    Route::post('/absence-types/{absenceType}/restore', [AbsenceTypeController::class, 'restore'])->can('update', 'absenceType')->name('absence-types.restore');

    // Abilitazioni ai tipi di assenza: solo admin
    Route::get('/users/{user}/absence-types', [UserAbsenceTypeController::class, 'index'])->can('manageAbsenceTypes', 'user')->name('users.absence-types.index');
    Route::put('/users/{user}/absence-type-enablements', [UserAbsenceTypeController::class, 'sync'])->can('manageAbsenceTypes', 'user')->name('users.absence-types.sync');

    // Valori annui di maturazione: solo admin (azienda: AccrualSettingPolicy, sede: LocationPolicy, persona: UserPolicy)
    Route::get('/settings/accrual', [AccrualSettingController::class, 'show'])->can('manage', AccrualSetting::class)->name('settings.accrual.show');
    Route::patch('/settings/accrual', [AccrualSettingController::class, 'update'])->can('manage', AccrualSetting::class)->name('settings.accrual.update');
    Route::get('/locations/{location}/accrual', [LocationAccrualController::class, 'show'])->can('update', 'location')->name('locations.accrual.show');
    Route::put('/locations/{location}/accrual', [LocationAccrualController::class, 'update'])->can('update', 'location')->name('locations.accrual.update');
    Route::get('/users/{user}/accrual', [UserAccrualController::class, 'show'])->can('manageAccrual', 'user')->name('users.accrual.show');
    Route::put('/users/{user}/accrual', [UserAccrualController::class, 'update'])->can('manageAccrual', 'user')->name('users.accrual.update');

    // Saldi di una persona: li vede chi può agire su di lei, li corregge anche, ma mai i propri (UserPolicy)
    Route::get('/balances', BalanceOverviewController::class)->can('viewBalanceOverview', User::class)->name('balances.index');
    Route::get('/users/{user}/balances', [UserBalanceController::class, 'summary'])->can('viewBalances', 'user')->name('users.balances.show');
    Route::get('/users/{user}/balances/at', [UserBalanceController::class, 'at'])->can('viewBalances', 'user')->name('users.balances.at');
    Route::get('/users/{user}/balance-movements', [UserBalanceController::class, 'movements'])->can('viewBalances', 'user')->name('users.balance-movements.index');
    Route::post('/users/{user}/balance-adjustments', [UserBalanceController::class, 'adjust'])->can('adjustBalances', 'user')->name('users.balance-adjustments.store');
    Route::post('/users/{user}/balance-alignments', [UserBalanceController::class, 'align'])->can('adjustBalances', 'user')->name('users.balance-alignments.store');

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
