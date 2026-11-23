# Contributing

1. Fork the repository and create a branch from `main`.
2. `pip install -e ".[dev]"`, then make your change with tests.
3. Run `ruff check . && ruff format --check . && mypy src && pytest` locally.
4. Open a pull request against `example-org/sdk-python`. CI runs lint and the test matrix
   (Python 3.10 to 3.13); coverage from the 3.12 job is uploaded to the coverage service.

Maintainers review pull requests within a few working days.
