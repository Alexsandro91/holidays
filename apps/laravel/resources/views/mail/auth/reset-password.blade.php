<x-mail::message>
# {{ __('password_reset.mail.link.heading') }}

{{ __('password_reset.mail.link.intro') }}

<x-mail::button :url="$url">
{{ __('password_reset.mail.link.action') }}
</x-mail::button>

{{ __('password_reset.mail.link.expiry', ['minutes' => $minutes]) }}

{{ __('password_reset.mail.link.not_you') }}

@if ($requestedByStaff)
{{ __('password_reset.mail.link.requested_by_staff') }}
@endif

<x-mail::subcopy>
{{ __('password_reset.mail.link.fallback', ['url' => $url]) }}
</x-mail::subcopy>
</x-mail::message>
