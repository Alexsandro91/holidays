<x-mail::message>
{{ $body }}

@if ($note)
{{ __('leave.mail.note', ['note' => $note]) }}
@endif
</x-mail::message>
