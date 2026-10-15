<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserHistoryResource;
use App\Models\User;
use App\Services\UserHistoryPresenter;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Storico di una persona per admin e responsabile (spec §8.3), con chi ha agito. Sede e admin: policy e `{user}`.
 */
final class UserHistoryController extends Controller
{
    public function __invoke(User $user, UserHistoryPresenter $history): AnonymousResourceCollection
    {
        return UserHistoryResource::collection($history->page($user, withActor: true));
    }
}
