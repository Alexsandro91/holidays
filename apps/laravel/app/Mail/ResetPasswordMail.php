<?php

namespace App\Mail;

use App\Support\Translate;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Cifrata in coda: il token del link non resta in chiaro in jobs/failed_jobs
class ResetPasswordMail extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $email,
        #[\SensitiveParameter] public readonly string $token,
        public readonly bool $requestedByStaff = false,
    ) {}

    /**
     * Link alla pagina della SPA. Email codificata RFC 3986: un "+" resta "+" (non diventa uno spazio).
     */
    public function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/')
            .'/reset-password/'.rawurlencode($this->token)
            .'?'.http_build_query(['email' => $this->email], '', '&', PHP_QUERY_RFC3986);
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('password_reset.mail.link.subject'));
    }

    public function content(): Content
    {
        // content() gira già nella lingua del destinatario (HasLocalePreference)
        return new Content(
            markdown: 'mail.auth.reset-password',
            with: [
                'url' => $this->url(),
                'minutes' => (int) config('auth.passwords.users.expire'),
                // Mai il nome di chi ha chiesto il link: la riga dice solo che l'ha chiesto qualcun altro
                'requestedByStaff' => $this->requestedByStaff,
            ],
        );
    }
}
