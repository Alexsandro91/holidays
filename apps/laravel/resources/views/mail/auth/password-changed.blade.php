<x-mail::message>
# {{ __('password_reset.mail.changed.heading') }}

{{ __('password_reset.mail.changed.intro', ['device' => $device, 'date' => $date]) }}

{{ __('password_reset.mail.changed.not_you') }}
</x-mail::message>
