# Local-dev only shim — see forwarder.py for why this exists.
FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir google-cloud-pubsub httpx

COPY forwarder.py .

CMD ["python", "forwarder.py"]
