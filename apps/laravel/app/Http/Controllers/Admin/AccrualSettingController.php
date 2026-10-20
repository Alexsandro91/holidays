<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Balances\UpdateCompanyAccrualRequest;
use App\Http\Resources\AccrualResource;
use App\Models\AccrualSetting;
use App\Services\AccrualSettingsService;

/**
 * Valori annui dell'azienda (spec §6.2): solo admin, lo garantiscono le rotte con AccrualSettingPolicy.
 */
final class AccrualSettingController extends Controller
{
    public function __construct(private readonly AccrualSettingsService $accruals) {}

    public function show(): AccrualResource
    {
        return AccrualResource::of(AccrualSetting::company(), $this->accruals->forCompany());
    }

    public function update(UpdateCompanyAccrualRequest $request): AccrualResource
    {
        $setting = $this->accruals->updateCompany($request->values(), $this->actor($request));

        return AccrualResource::of($setting, $this->accruals->forCompany());
    }
}
