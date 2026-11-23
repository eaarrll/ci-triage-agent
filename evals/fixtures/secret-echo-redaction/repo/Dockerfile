FROM python:3.12-slim
WORKDIR /app
ARG GH_PACKAGES_TOKEN
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY billing_worker ./billing_worker
USER 10001
CMD ["python", "-m", "billing_worker.worker"]
