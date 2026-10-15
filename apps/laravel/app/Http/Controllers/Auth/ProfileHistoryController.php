<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserHistoryResource;
use App\Services\UserHistoryPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Storico di chi è collegato, senza chi ha agito (spec §8.3).
 */
final class ProfileHistoryController extends Controller
{
    public function __invoke(Request $request, UserHistoryPresenter $history): AnonymousResourceCollection
    {
        return UserHistoryResource::collection($history->page($this->actor($request), withActor: false));
    }
}
