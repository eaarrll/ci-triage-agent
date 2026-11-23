# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.txt requirements-cpu.txt /tmp/
RUN pip install -r /tmp/requirements-cpu.txt
COPY pyproject.toml /opt/app/
COPY src/ /opt/app/src/
RUN pip install --no-deps /opt/app

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /opt/app
COPY configs/ ./configs/
EXPOSE 8000
ENTRYPOINT ["vision-serve"]
CMD ["--config", "configs/serve.yaml", "--device", "cpu"]
