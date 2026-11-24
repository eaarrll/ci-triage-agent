"""Runs against the bank's public sandbox (BANK_API_URL); skipped without credentials."""

import os
from decimal import Decimal

import pytest

from payouts.bank import BankClient

pytestmark = pytest.mark.skipif("BANK_API_KEY" not in os.environ, reason="no sandbox credentials")

SANDBOX_ACCOUNT = "acct_sandbox_ok_0001"


@pytest.fixture
def client():
    return BankClient()


def test_sandbox_balance(client):
    assert client.balance("EUR") >= 0


def test_create_payout_sandbox(client):
    payout = client.create_payout(SANDBOX_ACCOUNT, Decimal("12.50"), "EUR", reference="ACME ORDER 100231")
    assert payout.status in {"pending", "in_transit"}


def test_get_payout_sandbox(client):
    # A payout the sandbox keeps permanently in "paid" state.
    assert client.get_payout("po_sandbox_paid_0001").status == "paid"
