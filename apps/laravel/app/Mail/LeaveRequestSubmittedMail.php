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
 * Avviso agli approvatori: nuova richiesta in attesa, annullamento chiesto o assenza registrata senza approvazione.
 */
class LeaveRequestSubmittedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /**
     * @param  string  $event  `submitted`, `cancellation_requested` o `auto_approved`
     */
    public function __construct(
        public readonly LeaveRequest $leaveRequest,
        public readonly string $event,
    ) {}

    /**
     * Da approvare nel frontend, solo per gli eventi che attendono una decisione: un'assenza registrata senza
     * approvazione non è in coda.
     */
    public function url(): ?string
    {
        return $this->event === 'auto_approved'
            ? null
            : rtrim((string) config('app.frontend_url'), '/').'/leave?tab=approvals';
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: Translate::text('leave.mail.submitted.subject.'.$this->event));
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.leave.submitted',
            with: [
                'body' => Translate::text('leave.mail.submitted.body.'.$this->event, [
                    'person' => $this->leaveRequest->user->name,
                    'details' => LeaveMailText::describe($this->leaveRequest),
                ]),
                'note' => $this->event === 'submitted' ? $this->leaveRequest->note : null,
                'url' => $this->url(),
            ],
        );
    }
}
