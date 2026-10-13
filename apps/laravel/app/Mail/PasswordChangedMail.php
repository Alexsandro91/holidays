<?php

namespace App\Mail;

use App\Support\Translate;
use App\Support\UserAgentSummary;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordChangedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $userAgent,
        public readonly CarbonInterface $changedAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('password_reset.mail.changed.subject'));
    }

    public function content(): Content
    {
        // content() gira già nella lingua del destinatario (HasLocalePreference)
        return new Content(
            markdown: 'mail.auth.password-changed',
            with: [
                'device' => UserAgentSummary::describe($this->userAgent),
                'date' => $this->changedAt->copy()
                    ->setTimezone((string) config('app.display_timezone'))
                    ->locale(app()->getLocale())
                    ->isoFormat('LLL'),
            ],
        );
    }
}
