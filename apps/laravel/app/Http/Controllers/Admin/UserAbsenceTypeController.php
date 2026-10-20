<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\AbsenceTypes\SyncEnablementsRequest;
use App\Http\Resources\AbsenceTypeOptionResource;
use App\Models\User;
use App\Services\AbsenceTypeEnablementService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Abilitazioni di una persona (spec §3.4): solo admin (UserPolicy::manageAbsenceTypes).
 */
final class UserAbsenceTypeController extends Controller
{
    public function __construct(private readonly AbsenceTypeEnablementService $enablements) {}

    public function index(User $user): AnonymousResourceCollection
    {
        return AbsenceTypeOptionResource::collection($this->enablements->forUser($user));
    }

    public function sync(SyncEnablementsRequest $request, User $user): Response
    {
        $this->enablements->sync($user, $request->typeIds(), $this->actor($request));

        return response()->noContent();
    }
}
