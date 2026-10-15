<?php

namespace App\Models;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\ResetPasswordMail;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Mail;

#[Fillable(['first_name', 'last_name', 'email', 'password', 'locale'])]
#[Hidden(['password'])]
class User extends Authenticatable implements HasLocalePreference
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'privacy_notice_acknowledged_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'employment_type' => EmploymentType::class,
            'location_id' => 'integer',
            'status' => UserStatus::class,
        ];
    }

    /**
     * Lingua usata da Laravel per email e notifiche indirizzate all'utente.
     */
    public function preferredLocale(): string
    {
        return $this->locale;
    }

    /**
     * Link di recupero con la nostra email (in coda, cifrata, nella lingua dell'utente) al posto della notifica di Laravel.
     *
     * @param  string  $token
     */
    public function sendPasswordResetNotification(#[\SensitiveParameter] $token): void
    {
        Mail::to($this)->send(new ResetPasswordMail($this->email, $token));
    }

    /**
     * Nome completo "Nome Cognome" per la visualizzazione e le email (spec del 14/10, §7.1).
     *
     * @return Attribute<string, never>
     */
    protected function name(): Attribute
    {
        return Attribute::get(fn (): string => trim($this->first_name.' '.$this->last_name));
    }

    public function isActive(): bool
    {
        return $this->status === UserStatus::Active;
    }

    public function isIntern(): bool
    {
        return $this->employment_type === EmploymentType::Intern;
    }

    public function isAdmin(): bool
    {
        return $this->role === Role::Admin;
    }

    /**
     * @return HasOne<Invitation, $this>
     */
    public function invitation(): HasOne
    {
        return $this->hasOne(Invitation::class);
    }

    /**
     * Sede della persona (spec §2.2): obbligatoria per ogni ruolo e stato.
     *
     * @return BelongsTo<Location, $this>
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /**
     * Versioni dell'orario personale (part-time e simili); senza, vale l'orario della sede.
     *
     * @return HasMany<WorkSchedule, $this>
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(WorkSchedule::class);
    }

    /**
     * Persone che chi agisce può vedere e gestire (spec §4.1): l'admin tutte, il responsabile quelle della sua sede,
     * il dipendente nessuna.
     *
     * @param  Builder<self>  $query
     */
    public function scopeVisibleTo(Builder $query, User $actor): void
    {
        if ($actor->isAdmin()) {
            return;
        }

        if ($actor->role === Role::Manager) {
            $query->where('location_id', $actor->location_id);

            return;
        }

        $query->whereRaw('1 = 0');
    }
}
