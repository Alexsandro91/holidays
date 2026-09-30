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

class LoginCodeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $code,
        public readonly string $userAgent,
        public readonly CarbonInterface $requestedAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('login.mail.code.subject'));
    }

    public function content(): Content
    {
        // content() gira già nella lingua del destinatario (HasLocalePreference)
        return new Content(
            markdown: 'mail.auth.login-code',
            with: [
                'device' => UserAgentSummary::describe($this->userAgent),
                'date' => $this->requestedAt->copy()
                    ->setTimezone((string) config('app.display_timezone'))
                    ->locale(app()->getLocale())
                    ->isoFormat('LLL'),
            ],
        );
    }
}
