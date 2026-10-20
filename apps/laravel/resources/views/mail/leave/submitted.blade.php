<x-mail::message>
{{ $body }}

@if ($note)
{{ __('leave.mail.note', ['note' => $note]) }}
@endif

@if ($url)
<x-mail::button :url="$url">
{{ __('leave.mail.submitted.action') }}
</x-mail::button>
@endif
</x-mail::message>
