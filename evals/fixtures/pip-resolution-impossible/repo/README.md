# ml-features

Batch jobs that compute customer, merchant and device features for the scoring models and
write them to the feature store.

## Development

```bash
python -m venv .venv && source .venv/bin/activate
export PIP_EXTRA_INDEX_URL=...   # internal index, see the platform wiki
pip install -r requirements.txt -r requirements-dev.txt
pip install --no-deps -e .
pytest
```

Configuration is read from `ML_FEATURES_*` environment variables (see `src/ml_features/settings.py`).

## Layout

- `src/ml_features/schemas.py` – record and request schemas
- `src/ml_features/pipeline.py` – feature computation
- `src/ml_features/store.py` – writer for the internal feature store client
