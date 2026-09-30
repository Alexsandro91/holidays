<?php

namespace Tests\Feature\Support;

use App\Support\UserAgentSummary;
use Tests\TestCase;

class UserAgentSummaryTest extends TestCase
{
    public function test_describes_common_browsers_in_italian(): void
    {
        app()->setLocale('it');

        $this->assertSame('Chrome su macOS', UserAgentSummary::describe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'));
        $this->assertSame('Safari su iOS', UserAgentSummary::describe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'));
        $this->assertSame('Edge su Windows', UserAgentSummary::describe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0'));
        $this->assertSame('Firefox su Android', UserAgentSummary::describe('Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0'));
    }

    public function test_falls_back_for_unknown_agents(): void
    {
        app()->setLocale('en');

        $this->assertSame('unknown browser on unknown system', UserAgentSummary::describe(''));
    }
}
