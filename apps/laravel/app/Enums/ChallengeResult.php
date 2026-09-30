<?php

namespace App\Enums;

enum ChallengeResult
{
    case Valid;
    case Invalid;
    case Expired;
    case Locked;
}
