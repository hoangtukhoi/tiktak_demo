FROM python:3.11-slim

# ffmpeg cần cho pydub khi đọc/ghi mp3
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt .
# Cài torch bản CPU trước (nhẹ hơn ~2 GB so với bản CUDA mặc định trên Linux)
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts

ENV AI_MODEL_CACHE_DIR=/models
VOLUME ["/models"]
EXPOSE 8002

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
