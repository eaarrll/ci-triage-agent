"""Micro-benchmark for the money helpers: python benchmarks/bench_money.py"""

from decimal import Decimal
from timeit import timeit

from billing_worker.money import round_money

AMOUNTS = [Decimal(f"{i}.{i % 1000:03d}") for i in range(10_000)]

if __name__ == "__main__":
    seconds = timeit(lambda: [round_money(a) for a in AMOUNTS], number=50)
    print(f"round_money: {seconds / 50 * 1000:.2f} ms per 10k amounts")
