<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\AbsenceTypeOptionResource;
use App\Models\AbsenceType;
use App\Services\AbsenceTypeEnablementService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Tipi che chi è collegato può usare: senza abilitazione richiesta, oppure abilitati (spec §3.4).
 */
final class ProfileAbsenceTypeController extends Controller
{
    public function __invoke(Request $request, AbsenceTypeEnablementService $enablements): AnonymousResourceCollection
    {
        $usable = $enablements->forUser($this->actor($request))
            ->filter(fn (AbsenceType $type): bool => ! $type->requires_enablement || $type->getAttribute('enabled'))
            ->values();

        return AbsenceTypeOptionResource::collection($usable);
    }
}
