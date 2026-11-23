import os

import pytest


@pytest.fixture(autouse=True)
def _isolated_aws(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep tests off real AWS even when CI exports credentials."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    monkeypatch.setenv("S3_EXPORT_BUCKET", "billing-exports-test")
