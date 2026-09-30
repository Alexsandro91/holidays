<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Simula una richiesta della SPA: Sanctum avvia la sessione anche sulle rotte API.
     */
    protected function fromFrontend(): static
    {
        return $this->withHeaders([
            'Origin' => 'http://localhost:5174',
            'Referer' => 'http://localhost:5174/',
        ]);
    }
}
