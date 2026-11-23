def apply_discount(price_cents: int, percent: int) -> int:
    """Return the discounted price in cents."""
    return price_cents * (100 - percent) // 100
