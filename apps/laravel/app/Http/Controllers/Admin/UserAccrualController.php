<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Balances\UpdateAccrualOverrideRequest;
use App\Http\Resources\AccrualResource;
use App\Models\User;
use App\Services\AccrualSettingsService;

/**
 * Valori annui di una persona (spec §6.2): solo admin, lo garantisce la rotta con UserPolicy::manageAccrual.
 */
final class UserAccrualController extends Controller
{
    public function __construct(private readonly AccrualSettingsService $accruals) {}

    public function show(User $user): AccrualResource
    {
        return AccrualResource::of($user->accrualSetting, $this->accruals->forUser($user));
    }

    public function update(UpdateAccrualOverrideRequest $request, User $user): AccrualResource
    {
        $setting = $this->accruals->updateUser($user, $request->values(), $this->actor($request));

        return AccrualResource::of($setting, $this->accruals->forUser($user));
    }
}
