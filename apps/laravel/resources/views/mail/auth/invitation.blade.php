<x-mail::message>
# {{ __('invitations.mail.heading', ['name' => $name]) }}

{{ $inviterName ? __('invitations.mail.intro_by', ['inviter' => $inviterName]) : __('invitations.mail.intro') }}

<x-mail::button :url="$url">
{{ __('invitations.mail.action') }}
</x-mail::button>

{{ __('invitations.mail.expiry', ['hours' => $hours]) }}

<x-mail::subcopy>
{{ __('invitations.mail.fallback', ['url' => $url]) }}
</x-mail::subcopy>
</x-mail::message>
