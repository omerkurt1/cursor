FROM python:3.12-slim

WORKDIR /app

# Sistem bagimliliklari (opencv-headless icin)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/ scripts/
COPY examples/ examples/

# Output ve reports dizinleri (pipeline ciktilari buraya yazilir)
RUN mkdir -p output reports data/input data/routes

# KVKK: Ham veri ve model agirliklari image'a dahil edilmez.
# Pipeline'i tetiklemek icin POST /api/scan kullanin.
# Detections onceden uretilmisse output/ klasorune kopyalayin.

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/scripts
# PORT, Render.com tarafindan otomatik set edilir; varsayilan 8000
ENV PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')"

# Gunicorn production WSGI sunucusu kullanilir.
# $PORT Render.com tarafindan inject edilir.
CMD gunicorn --bind "0.0.0.0:${PORT}" --workers 2 --timeout 120 "scripts.serve:app"
