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

### GET /api/detections

Ornek istek (Go backend):

```go
resp, err := http.Get("http://localhost:8000/api/detections")
```

Ornek yanit:

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

### GET /health

```json
{"status": "ok", "service": "ai-privacy-pipeline"}
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
