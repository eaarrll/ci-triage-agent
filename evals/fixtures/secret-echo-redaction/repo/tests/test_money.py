from decimal import Decimal

import pytest

from billing_worker.money import format_money, round_money, sum_money, to_decimal


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (Decimal("1.234"), Decimal("1.23")),
        (Decimal("1.236"), Decimal("1.24")),
        (Decimal("10"), Decimal("10.00")),
        (Decimal("-2.346"), Decimal("-2.35")),
    ],
)
def test_round_money(amount: Decimal, expected: Decimal) -> None:
    assert round_money(amount) == expected


def test_sum_money_rounds_the_total() -> None:
    assert sum_money([Decimal("0.104"), Decimal("0.204")]) == Decimal("0.31")


def test_sum_money_of_nothing_is_zero() -> None:
    assert sum_money([]) == Decimal("0.00")


def test_to_decimal_accepts_strings() -> None:
    assert to_decimal("19.99") == Decimal("19.99")


def test_format_money_cad() -> None:
    assert format_money(Decimal("1234.5"), "CAD") == "CA$1,234.50"


def test_format_money_negative() -> None:
    assert format_money(Decimal("-3"), "USD") == "-$3.00"
