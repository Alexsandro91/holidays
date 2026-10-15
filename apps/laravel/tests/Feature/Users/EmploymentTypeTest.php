<?php

namespace Tests\Feature\Users;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmploymentTypeTest extends TestCase
{
    use RefreshDatabase;

    public function test_people_are_employees_unless_told_otherwise(): void
    {
        $this->assertSame(EmploymentType::Employee, User::factory()->create()->employment_type);
        $this->assertSame(EmploymentType::Contractor, User::factory()->contractor()->create()->employment_type);

        $intern = User::factory()->intern()->create();
        $this->assertSame(EmploymentType::Intern, $intern->employment_type);
        $this->assertTrue($intern->isIntern());
        $this->assertFalse(User::factory()->create()->isIntern());
    }

    public function test_employment_types_have_translated_labels(): void
    {
        app()->setLocale('it');
        $this->assertSame(['Dipendente', 'Collaboratore esterno', 'Stagista'], array_map(fn (EmploymentType $type): string => $type->label(), EmploymentType::cases()));

        app()->setLocale('en');
        $this->assertSame(['Employee', 'External contractor', 'Intern'], array_map(fn (EmploymentType $type): string => $type->label(), EmploymentType::cases()));
    }

    public function test_the_base_role_is_called_user_to_avoid_clashing_with_the_employment_type(): void
    {
        app()->setLocale('it');
        $this->assertSame('Utente', Role::Employee->label());

        app()->setLocale('en');
        $this->assertSame('User', Role::Employee->label());
    }
}
