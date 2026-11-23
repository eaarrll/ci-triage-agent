# syntax=docker/dockerfile:1.7
ARG CUDA_VERSION=12.6.3

FROM nvidia/cuda:${CUDA_VERSION}-cudnn-devel-ubuntu24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.12 python3.12-venv python3.12-dev build-essential git \
    && rm -rf /var/lib/apt/lists/*
RUN python3.12 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.txt requirements-gpu.txt /tmp/
RUN pip install --upgrade pip wheel \
 && pip install -r /tmp/requirements-gpu.txt
COPY pyproject.toml /opt/app/
COPY src/ /opt/app/src/
RUN pip install --no-deps /opt/app

FROM nvidia/cuda:${CUDA_VERSION}-cudnn-runtime-ubuntu24.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/opt/venv/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.12 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /opt/venv /opt/venv
WORKDIR /opt/app
COPY configs/ ./configs/
EXPOSE 8000
ENTRYPOINT ["vision-serve"]
CMD ["--config", "configs/serve.yaml"]
