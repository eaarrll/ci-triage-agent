from decimal import Decimal

from .bank import BankClient, Payout


def pay_seller(
    client: BankClient, seller_account: str, amount: Decimal, currency: str = "EUR", order_id: str | None = None
) -> Payout:
    if amount <= 0:
        raise ValueError("amount must be positive")
    reference = f"ACME ORDER {order_id}" if order_id else None
    return client.create_payout(seller_account, amount, currency, reference=reference)
