# Billing rules

## Proration

Proration uses the exact time remaining in the period, not whole days. A customer who
moves from Team (30.00/month) to Business (60.00/month) at noon on day 13 of a 30-day
period has 17.5 days left:

| | Amount |
| --- | --- |
| Credit for unused Team time | 30.00 x 17.5 / 30 = 17.50 |
| Charge for Business time | 60.00 x 17.5 / 30 = 35.00 |
| Due now | 17.50 |

The invoice line shows the remaining time rounded down to whole days ("17 days
remaining") for readability only; it never feeds into the amount.
