# Person 2 Entegrasyon Kontrati

Bu dosya Go backend ve Next.js/harita arayuzu icin AI pipeline ciktisini tarif eder.

## HTTP API (Birincil Entegrasyon Yontemi)

Sunucuyu baslat:

```powershell
cd ai-pipeline
python scripts\serve.py --port 8000
```

### Endpoint'ler

| Metod | URL | Aciklama |
|-------|-----|----------|
| GET | `/health` | Servis saglik kontrolu |
| GET | `/api/detections` | Temizlenmis tespit listesi (JSON) |
| GET | `/api/pipeline-report` | Pipeline ozet raporu (KVKK kaniti dahil) |
| GET | `/api/deletion-report` | Ham veri silme raporu |
| GET | `/api/scan/status` | Devam eden scan durumu |
| POST | `/api/scan` | Yeni scan tetikle (Go backend buraya yazar) |

---

### POST /api/scan — Go Backend Icin Scan Tetikleyici

Go backend bu endpoint'e istek atarak Street View taramasini baslatir.
Pipeline arka planda calisir, sonuc `GET /api/detections` ile alinir.

**Tek nokta taramasi:**

```go
body := `{"lat": 41.021, "lng": 28.874, "demo_fallback": false}`
resp, err := http.Post(
    "http://localhost:8000/api/scan",
    "application/json",
    strings.NewReader(body),
)
// 202 Accepted -> arka planda baslatildi
```

**Rota taramasi (birden fazla nokta):**

```go
body := `{
    "waypoints": [
        {"lat": 41.043, "lng": 29.005},
        {"lat": 41.044, "lng": 29.004},
        {"lat": 41.045, "lng": 29.003}
    ],
    "demo_fallback": false
}`
resp, err := http.Post("http://localhost:8000/api/scan", "application/json", strings.NewReader(body))
```

**Demo modu (API key veya YOLO olmadan):**

```go
body := `{"lat": 41.021, "lng": 28.874, "demo_fallback": true, "demo_no_api": true}`
```

**Scan durumu sorgulama:**

```go
resp, err := http.Get("http://localhost:8000/api/scan/status")
// {"running": true/false, "last_result": {...}}
```

**Scan bittikten sonra sonuclari al:**

```go
resp, err := http.Get("http://localhost:8000/api/detections")
```

**202 yanit ornegi:**

```json
{
  "status": "accepted",
  "message": "Scan arka planda baslatildi.",
  "poll": "/api/scan/status",
  "result": "/api/detections"
}
```

---

### GET /api/detections

Ornek yanit (rota taramasindan):

```json
[
  {"type": "traffic_sign",  "latitude": 41.043, "longitude": 29.005, "confidence": 0.91, "timestamp": "00:00:03"},
  {"type": "traffic_light", "latitude": 41.044, "longitude": 29.004, "confidence": 0.87, "timestamp": "00:00:18"},
  {"type": "pothole",       "latitude": 41.045, "longitude": 29.003, "confidence": 0.73, "timestamp": "00:00:11"}
]
```

### GET /health

```json
{"status": "ok", "service": "ai-privacy-pipeline", "scan_running": false}
```

---

## Final Detection JSON (Dosya Tabanlı Yedek)

Sunucu kullanilmiyorsa dosyayi dogrudan oku:

```text
ai-pipeline/output/detections.json
```

Semasi:

```json
[
  {
    "type": "traffic_sign",
    "latitude": 41.021,
    "longitude": 28.874,
    "confidence": 0.91,
    "timestamp": "00:00:03"
  }
]
```

Alanlar:

- `type`: Kentsel obje tipi. Gecerli degerler: `traffic_sign`, `traffic_light`, `pothole`, `damaged_sign`.
- `latitude`: Detection konumu icin enlem.
- `longitude`: Detection konumu icin boylam.
- `confidence`: Model guven skoru. `0.0` ile `1.0` arasinda sayi.
- `timestamp`: Video icindeki zaman. Format: `HH:MM:SS`.

---

## Pipeline Report

```text
ai-pipeline/reports/pipeline_report.json
```

Onemli alanlar:

- `anonymized_video`: Anonimlestirilmis demo videosu.
- `raw_detection_count`: Dedupe oncesi tespit sayisi.
- `deduped_detection_count`: Final JSON kayit sayisi.
- `demo_fallback_used`: Gercek model yerine demo fallback calisip calismadigi.
- `privacy_guardrails`: Detection'in anonimlestirme sonrasinda calistigini ve JSON'da kimlik verisi olmadigini gosterir.

---

## Backend Icin Minimum Akis

1. `GET /api/detections` veya `output/detections.json` dosyasini oku.
2. Her kaydi harita marker'ina cevir.
3. `type`, `confidence` ve `timestamp` bilgisini marker detayinda goster.
4. Ham video veya frame kabul etme; backend sadece anonimlestirilmis ciktilar ve JSON ile calissin.

---

## Validasyon

AI tarafindan uretilen JSON'u backend'e vermeden once:

```powershell
python scripts\validate_outputs.py --detections output\detections.json --pipeline-report reports\pipeline_report.json
```

Bu komut yalnizca izinli detection alanlarini kabul eder. Kimlik tespiti, plaka OCR, yuz tanima, takip ID'si veya ham medya yolu final detection JSON'unda yer alamaz.
