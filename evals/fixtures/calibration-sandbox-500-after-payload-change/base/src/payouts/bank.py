"""Thin client for the bank's payouts API (v2)."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from decimal import Decimal

import requests


@dataclass(frozen=True)
class Payout:
    id: str
    status: str
    amount: Decimal
    currency: str


class BankClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None, timeout: float = 15.0):
        self.base_url = (base_url or os.environ["BANK_API_URL"]).rstrip("/")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {api_key or os.environ['BANK_API_KEY']}"
        self.timeout = timeout

    def create_payout(self, account_id: str, amount: Decimal, currency: str) -> Payout:
        body = {
            "destination_account": account_id,
            "amount": str(amount),
            "currency": currency,
        }
        headers = {"Idempotency-Key": str(uuid.uuid4())}
        res = self.session.post(f"{self.base_url}/v2/payouts", json=body, headers=headers, timeout=self.timeout)
        res.raise_for_status()
        data = res.json()
        return Payout(data["id"], data["status"], Decimal(data["amount"]), data["currency"])

    def get_payout(self, payout_id: str) -> Payout:
        res = self.session.get(f"{self.base_url}/v2/payouts/{payout_id}", timeout=self.timeout)
        res.raise_for_status()
        data = res.json()
        return Payout(data["id"], data["status"], Decimal(data["amount"]), data["currency"])

    def balance(self, currency: str) -> Decimal:
        res = self.session.get(f"{self.base_url}/v2/balance", params={"currency": currency}, timeout=self.timeout)
        res.raise_for_status()
        return Decimal(res.json()["available"])
