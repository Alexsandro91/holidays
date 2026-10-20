<?php

use App\Models\Location;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Pulizie giornaliere (spec §7.3): challenge di login morte, inviti mai accettati scaduti da oltre 30 giorni,
// eventi di sicurezza oltre il periodo di conservazione, link di recupero scaduti, job falliti da oltre 30 giorni
Schedule::command('model:prune')->daily()->withoutOverlapping()->onOneServer();
Schedule::command('auth:clear-resets')->daily()->withoutOverlapping()->onOneServer();
Schedule::command('queue:prune-failed --hours=720')->daily()->withoutOverlapping()->onOneServer();

// Maturazione dei saldi (spec §4.3): ogni giorno, il primo giro utile del mese recupera dallo storico
Schedule::command('balances:accrue')->dailyAt('00:30')->timezone(Location::DEFAULT_TIMEZONE)->withoutOverlapping()->onOneServer();
