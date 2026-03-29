FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY renderer_service.py .

ENV OUTPUT_DIR=/tmp/ogkdiary_outputs
EXPOSE 8000

CMD ["uvicorn", "renderer_service:app", "--host", "0.0.0.0", "--port", "8000"]
