<?php

namespace App\Mail;

use App\Enums\AdminChange;
use App\Support\Translate;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Avviso a chi subisce la modifica e agli altri admin: un cambio non autorizzato viene notato subito.
 */
class AdminChangeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly AdminChange $change,
        public readonly string $actorName,
        public readonly string $targetName,
        public readonly CarbonInterface $occurredAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('users.mail.admin_change.subject.'.$this->change->value));
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.admin.change',
            with: [
                'body' => Translate::text('users.mail.admin_change.body.'.$this->change->value, [
                    'actor' => $this->actorName,
                    'target' => $this->targetName,
                    'date' => $this->occurredAt->copy()
                        ->setTimezone((string) config('app.display_timezone'))
                        ->locale(app()->getLocale())
                        ->isoFormat('LLL'),
                ]),
            ],
        );
    }
}
