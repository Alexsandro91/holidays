<x-mail::message>
{{ $body }}

@if ($reason)
{{ $reason }}
@endif
</x-mail::message>
