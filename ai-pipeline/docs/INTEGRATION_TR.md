# Person 2 Entegrasyon Kontrati

Bu dosya Go backend ve Next.js/harita arayuzu icin AI pipeline ciktisini tarif eder.

## Final Detection JSON

Dosya:

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

- `type`: Kentsel obje tipi. Ilk hedef degerler: `traffic_sign`, `traffic_light`.
- `latitude`: Detection konumu icin enlem.
- `longitude`: Detection konumu icin boylam.
- `confidence`: Model guven skoru. `0.0` ile `1.0` arasinda sayi.
- `timestamp`: Video icindeki zaman. Format: `HH:MM:SS`.

## Pipeline Report

Dosya:

```text
ai-pipeline/reports/pipeline_report.json
```

Backend bu dosyayi zorunlu veri olarak almak zorunda degil. Sunum, debug ve KVKK kaniti icin kullanilir.

Onemli alanlar:

- `anonymized_video`: Anonimlestirilmis demo videosu.
- `raw_detection_count`: Dedupe oncesi tespit sayisi.
- `deduped_detection_count`: Final JSON kayit sayisi.
- `demo_fallback_used`: Gercek model yerine demo fallback calisip calismadigi.
- `privacy_guardrails`: Detection'in anonimlestirme sonrasinda calistigini ve JSON'da kimlik verisi olmadigini gosterir.

## Backend Icin Minimum Akis

1. `output/detections.json` dosyasini oku.
2. Her kaydi harita marker'ina cevir.
3. `type`, `confidence` ve `timestamp` bilgisini marker detayinda goster.
4. Ham video veya frame kabul etme; backend sadece anonimlestirilmis ciktilar ve JSON ile calissin.

