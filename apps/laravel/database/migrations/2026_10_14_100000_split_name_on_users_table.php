<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `users.name` diventa `first_name` e `last_name` (spec del 14/10, §7.1). I nomi esistenti si dividono al primo
 * spazio: la prima parola è il nome, il resto il cognome (vuoto se c'è una sola parola). Il down() li riunisce.
 */
return new class extends Migration
{
    private const CHUNK_SIZE = 500;

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('first_name')->default('')->after('id');
            $table->string('last_name')->default('')->after('first_name');
        });

        $this->rewriteInChunks(['name'], fn (object $row): array => array_combine(
            ['first_name', 'last_name'],
            $this->splitName((string) $row->name),
        ));

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('name');
            // Il valore vuoto serviva solo a riempire le righe esistenti: i nuovi utenti hanno sempre nome e cognome
            $table->string('first_name')->change();
            $table->string('last_name')->change();
            // Ordinamento predefinito della lista utenti
            $table->index(['last_name', 'first_name']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('name')->default('')->after('id');
        });

        $this->rewriteInChunks(['first_name', 'last_name'], fn (object $row): array => [
            'name' => trim($row->first_name.' '.$row->last_name),
        ]);

        Schema::table('users', function (Blueprint $table): void {
            $table->string('name')->change();
            $table->dropIndex(['last_name', 'first_name']);
            $table->dropColumn(['first_name', 'last_name']);
        });
    }

    /**
     * Divide al primo spazio, dopo aver tolto gli spazi ai lati.
     *
     * @return array{string, string}
     */
    public function splitName(string $name): array
    {
        $parts = explode(' ', trim($name), 2);

        return [$parts[0], trim($parts[1] ?? '')];
    }

    /**
     * Riscrive le colonne a blocchi: una UPDATE con CASE per blocco, valori sempre in binding.
     *
     * @param  list<string>  $sourceColumns
     * @param  Closure(object): array<string, string>  $map
     */
    private function rewriteInChunks(array $sourceColumns, Closure $map): void
    {
        DB::table('users')->select(['id', ...$sourceColumns])->orderBy('id')->chunkById(self::CHUNK_SIZE, function ($rows) use ($map): void {
            $values = [];

            foreach ($rows as $row) {
                $values[$row->id] = $map($row);
            }

            $ids = array_keys($values);
            $assignments = [];
            $bindings = [];

            foreach (array_keys(reset($values)) as $column) {
                $assignments[] = $column.' = CASE id '.implode(' ', array_fill(0, count($ids), 'WHEN ? THEN ?')).' END';

                foreach ($values as $id => $columns) {
                    array_push($bindings, $id, $columns[$column]);
                }
            }

            $placeholders = implode(', ', array_fill(0, count($ids), '?'));
            DB::update('UPDATE users SET '.implode(', ', $assignments)." WHERE id IN ({$placeholders})", [...$bindings, ...$ids]);
        });
    }
};
