<?php

namespace App\Models;

use App\Services\LoginChallengeService;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'code_hash', 'expires_at', 'attempts', 'resend_count', 'last_sent_at'])]
#[Hidden(['code_hash'])]
class LoginChallenge extends Model
{
    use MassPrunable;

    /**
     * Challenge morte: codice scaduto e login iniziato da oltre MAX_AGE_MINUTES, quindi nessun nuovo invio
     * può più rinnovarle (un codice scaduto da poco resta, il nuovo invio ne rinnova la scadenza).
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        return static::query()
            ->where('expires_at', '<', now())
            ->where('created_at', '<', now()->subMinutes(LoginChallengeService::MAX_AGE_MINUTES));
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'attempts' => 'integer',
            'resend_count' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
