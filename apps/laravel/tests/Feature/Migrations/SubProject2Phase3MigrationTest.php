<?php

namespace Tests\Feature\Migrations;

use App\Models\AbsenceType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Dati di partenza della fase 3 (spec §3.4): le migration girano davvero.
 */
class SubProject2Phase3MigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_sickness_and_injury_are_archived(): void
    {
        $this->assertNotNull(AbsenceType::query()->where('code', 'sickness')->sole()->archived_at);
        $this->assertNotNull(AbsenceType::query()->where('code', 'injury')->sole()->archived_at);
        $this->assertSame(14, AbsenceType::query()->whereNull('archived_at')->count());
    }
}
