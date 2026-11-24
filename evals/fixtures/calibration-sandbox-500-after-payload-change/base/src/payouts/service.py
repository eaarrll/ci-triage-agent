from decimal import Decimal

from .bank import BankClient, Payout


def pay_seller(client: BankClient, seller_account: str, amount: Decimal, currency: str = "EUR") -> Payout:
    if amount <= 0:
        raise ValueError("amount must be positive")
    return client.create_payout(seller_account, amount, currency)
