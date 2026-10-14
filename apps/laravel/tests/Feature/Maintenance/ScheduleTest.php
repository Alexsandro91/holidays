<?php

namespace Tests\Feature\Maintenance;

use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

class ScheduleTest extends TestCase
{
    public function test_the_daily_cleanups_are_scheduled(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->mapWithKeys(fn (Event $event): array => [(string) preg_replace('/^.*artisan.? /', '', (string) $event->command) => $event]);

        foreach (['model:prune', 'auth:clear-resets', 'queue:prune-failed --hours=720'] as $command) {
            $this->assertTrue($events->has($command), "Comando non programmato: {$command}");
            $event = $events->get($command);
            $this->assertInstanceOf(Event::class, $event);
            $this->assertSame('0 0 * * *', $event->expression, "{$command} deve girare ogni giorno");
            $this->assertTrue($event->withoutOverlapping, "{$command} non deve sovrapporsi");
            $this->assertTrue($event->onOneServer, "{$command} deve girare su un solo server");
        }
    }
}
