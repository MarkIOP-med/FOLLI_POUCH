"""Teudat zehut check digit."""

import pytest

from app.core.israeli_id import check_digit, is_valid_israeli_id


def test_computed_check_digit_validates():
    stem = "12345678"
    assert is_valid_israeli_id(stem + str(check_digit(stem)))


def test_rejects_bad_check_digit():
    assert not is_valid_israeli_id("123456789")


def test_pads_short_input():
    """Leading zeros are significant and commonly dropped by data entry."""
    assert is_valid_israeli_id("0" * 9)


@pytest.mark.parametrize("value", ["1234567890", "0123456782 9"])
def test_rejects_overlong(value):
    assert not is_valid_israeli_id(value)


@pytest.mark.parametrize("value", ["abcdefghij0", "12345678a", "!!!", "12-34-x"])
def test_rejects_non_numeric(value):
    """Letters must invalidate, not be stripped away until something valid remains."""
    assert not is_valid_israeli_id(value)


@pytest.mark.parametrize("value", ["123-456-782", "123 456 782", "123.456.782"])
def test_tolerates_common_separators(value):
    assert is_valid_israeli_id(value)


@pytest.mark.parametrize("value", [None, ""])
def test_rejects_empty(value):
    assert not is_valid_israeli_id(value)


def test_most_random_digits_fail():
    """~90% failure is exactly why the national ID is never the primary key."""
    valid = sum(1 for n in range(100_000, 100_500) if is_valid_israeli_id(f"{n}0000"))
    assert valid < 100
