<x-mail::message>
{{ $body }}

@if ($reason)
{{ $reason }}
@endif

<x-mail::button :url="$url">
{{ __('leave.mail.decided.action') }}
</x-mail::button>
</x-mail::message>
