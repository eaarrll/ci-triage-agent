from decimal import Decimal

import pytest

from tax_engine import fx


def test_eur_is_identity():
    assert fx.to_eur(Decimal("12.34"), "EUR") == Decimal("12.34")


def test_round_trip_stays_within_a_cent():
    eur = Decimal("250.00")
    assert abs(fx.to_eur(fx.from_eur(eur, "USD"), "USD") - eur) <= Decimal("0.01")


def test_unknown_currency():
    with pytest.raises(fx.UnknownCurrencyError):
        fx.rate("XXX")


def test_load_reference_replaces_table():
    fx.load_reference({"GBP": "0.8500"})
    assert fx.rate("GBP") == Decimal("0.8500")
    with pytest.raises(fx.UnknownCurrencyError):
        fx.rate("USD")


@pytest.mark.parametrize("currency", ["USD", "GBP", "CHF"])
def test_reference_has_major_currencies(currency):
    assert fx.rate(currency) > 0
