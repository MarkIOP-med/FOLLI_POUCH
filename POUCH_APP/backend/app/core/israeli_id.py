"""Israeli teudat zehut check-digit validation.

Mirrors frontend/src/domain/israeliId.ts.

Random 9-digit strings fail this ~90% of the time, which is why the national ID is an
optional, validated field and never the primary key -- the internal MRN is.
"""

from __future__ import annotations

import re

#: Common separators people type into an ID field. Anything else -- letters in
#: particular -- makes the input invalid rather than being silently stripped:
#: "abcdefghij0" must not reduce to "0" and then validate as 000000000.
_SEPARATORS = re.compile(r"[\s\-.]")
_DIGITS_ONLY = re.compile(r"^\d{1,9}$")
_EIGHT_DIGITS = re.compile(r"^\d{8}$")


def normalise(value: str | None) -> str | None:
    """Strip separators and left-pad to 9 digits, or None if not a plausible ID."""
    if not value:
        return None
    candidate = _SEPARATORS.sub("", value)
    if not _DIGITS_ONLY.match(candidate):
        return None
    return candidate.zfill(9)


def is_valid_israeli_id(value: str | None) -> bool:
    digits = normalise(value)
    if digits is None:
        return False

    total = 0
    for index, char in enumerate(digits):
        doubled = int(char) * (1 if index % 2 == 0 else 2)
        total += doubled if doubled < 10 else doubled - 9
    return total % 10 == 0


def check_digit(first_eight: str) -> int:
    """Compute the 9th digit for an 8-digit stem -- useful for generating test IDs."""
    stem = _SEPARATORS.sub("", first_eight).zfill(8)
    if not _EIGHT_DIGITS.match(stem):
        raise ValueError(f"expected 8 digits, got {first_eight!r}")

    total = 0
    for index, char in enumerate(stem):
        doubled = int(char) * (1 if index % 2 == 0 else 2)
        total += doubled if doubled < 10 else doubled - 9
    return (10 - total % 10) % 10
