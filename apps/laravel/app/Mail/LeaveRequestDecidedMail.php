<?php

namespace App\Mail;

use App\Models\LeaveRequest;
use App\Support\LeaveMailText;
use App\Support\Translate;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Esito per chi ha chiesto: con chi ha deciso e, per un rifiuto, il motivo.
 */
class LeaveRequestDecidedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /**
     * @param  string  $event  `approved`, `rejected`, `cancellation_approved`, `cancellation_rejected` o `cancelled`
     * @param  string  $actorName  chi ha deciso
     */
    public function __construct(
        public readonly LeaveRequest $leaveRequest,
        public readonly string $event,
        public readonly string $actorName,
    ) {}

    /**
     * Ferie e permessi nel frontend, dove chi ha chiesto ritrova la richiesta.
     */
    public function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/leave';
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('leave.mail.decided.subject.'.$this->event));
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.leave.decided',
            with: [
                'body' => Translate::text('leave.mail.decided.body.'.$this->event, [
                    'actor' => $this->actorName,
                    'details' => LeaveMailText::describe($this->leaveRequest),
                ]),
                'reason' => $this->event === 'rejected' && filled($this->leaveRequest->decision_note)
                    ? Translate::text('leave.mail.reason', ['reason' => (string) $this->leaveRequest->decision_note])
                    : null,
                'url' => $this->url(),
            ],
        );
    }
}
