<x-mail::message>
# {{ __('login.mail.code.heading') }}

{{ __('login.mail.code.intro') }}

<x-mail::panel>
<p style="margin: 0; font-size: 32px; font-weight: 600; letter-spacing: 8px; text-align: center;">{{ $code }}</p>
</x-mail::panel>

{{ __('login.mail.code.device', ['device' => $device, 'date' => $date]) }}

{{ __('login.mail.code.not_you') }}
</x-mail::message>
