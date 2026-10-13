<?php

namespace Tests\Fakes;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Testing\Fakes\MailFake;
use RuntimeException;

/**
 * Come Mail::fake(), ma la messa in coda di una classe di email fallisce: simula una coda non raggiungibile.
 */
final class FailingMailFake extends MailFake
{
    /**
     * @param  class-string<Mailable>  $failing
     */
    public function __construct(MailManager $manager, private readonly string $failing)
    {
        parent::__construct($manager);
    }

    /**
     * Sostituisce il mailer come Mail::fake(), anche se un fake è già attivo.
     *
     * @param  class-string<Mailable>  $failing
     */
    public static function install(string $failing): self
    {
        $root = Mail::getFacadeRoot();
        $fake = new self($root instanceof MailFake ? $root->manager : app(MailManager::class), $failing);
        Mail::swap($fake);

        return $fake;
    }

    public function queue($view, $queue = null)
    {
        if ($view instanceof $this->failing) {
            throw new RuntimeException('Queue unavailable');
        }

        return parent::queue($view, $queue);
    }
}
