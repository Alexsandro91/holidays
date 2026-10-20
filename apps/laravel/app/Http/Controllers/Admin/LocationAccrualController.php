<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Balances\UpdateAccrualOverrideRequest;
use App\Http\Resources\AccrualResource;
use App\Models\Location;
use App\Services\AccrualSettingsService;

/**
 * Valori annui di una sede (spec §6.2): solo admin, lo garantisce la rotta con LocationPolicy.
 */
final class LocationAccrualController extends Controller
{
    public function __construct(private readonly AccrualSettingsService $accruals) {}

    public function show(Location $location): AccrualResource
    {
        return AccrualResource::of($this->accruals->locationSetting($location), $this->accruals->forLocation($location));
    }

    public function update(UpdateAccrualOverrideRequest $request, Location $location): AccrualResource
    {
        $setting = $this->accruals->updateLocation($location, $request->values(), $this->actor($request));

        return AccrualResource::of($setting, $this->accruals->forLocation($location));
    }
}
