# notify-api

Signup, email and SMS notifications for Acme.

Integration tests in `test/integration/` call the SMS provider's public sandbox and need
`SMS_SANDBOX_URL` and `SMS_SANDBOX_TOKEN`; they are skipped locally without them.
