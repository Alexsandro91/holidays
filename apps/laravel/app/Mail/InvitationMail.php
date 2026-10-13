<?php

namespace App\Mail;

use App\Services\InvitationService;
use App\Support\Translate;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Cifrata in coda: il token dell'invito non resta in chiaro in jobs/failed_jobs
class InvitationMail extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        #[\SensitiveParameter] public readonly string $token,
        public readonly ?string $inviterName,
        public readonly CarbonInterface $expiresAt,
    ) {}

    public function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/invitation/'.rawurlencode($this->token);
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('invitations.mail.subject'));
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.auth.invitation',
            with: [
                'url' => $this->url(),
                'hours' => InvitationService::TTL_HOURS,
            ],
        );
    }
}
