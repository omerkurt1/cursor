# AI ve Mahremiyet Pipeline

Bu klasor, belediye hizmet araclarinin kamera goruntusunu once anonimlestiren,
sonra yalnizca anonimlestirilmis video uzerinden kentsel obje tespiti yapan
guvenli veri hattidir. Google Street View ve sentetik video yalnizca gelistirme
ve demo yedegidir; projenin uretim veri kaynagi degildir.

## Pipeline

```text
municipal vehicle camera / local demo video
  -> local raw video     [data/input/ — gitignore ile korunur]
  -> face + license plate blur  (anonymize_video.py — fail-closed)
  -> anonymized video    [output/anonymized_demo.mp4]
  -> urban object detection  (detect_objects.py — YOLOv8 veya demo)
  -> duplicate cleanup   (dedupe_json.py)
  -> JSON export         [output/detections.json]
  -> HTTP API            (serve.py — Go backend'e sunar)
  -> raw-data deletion   (delete_raw_data.py — KVKK kaniti)
```

## Kurulum

```powershell
cd ai-pipeline
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Gercek YOLO tespiti icin ek paket:

```powershell
pip install -r requirements-yolo.txt
```

Mahremiyet kapisi testleri:

```powershell
python -m unittest discover -s tests -v
```

Pipeline, yuz veya plaka anonimlestiricisi yuklenemezse tespit adimina
gecmeden hata vererek durur.

`ultralytics` ilk calismada model agirligi indirmeye calisabilir. Internet yoksa `models/` klasorune daha once indirilmis bir `.pt` dosyasi koyup `--model` ile verin.

Bu ortamda `python` komutunda `pip` yoksa, kullandiginiz Python executable yolunu acikca vererek calistirin:

```powershell
& '<python.exe yolu>' scripts\run_pipeline.py --input data\input\demo.mp4 --lat 41.021 --lng 28.874 --demo-fallback
```

## Google Street View Gelistirme Yedegi

Bu akis yalnizca hizmet araci videosu mevcut degilken entegrasyonu gelistirmek
ve gostermek icindir. Sunumda kaynak acikca `Street View fallback` olarak
belirtilmelidir.

API anahtarini ayarla:

```powershell
copy .env.example .env
# .env dosyasini ac ve STREET_VIEW_API_KEY degerini gir
```

Tek komutla calistir (Street View -> anonymize -> detect -> JSON):

```powershell
python scripts\streetview_pipeline.py --lat 41.021 --lng 28.874
```

YOLO yoksa demo modunda:

```powershell
python scripts\streetview_pipeline.py --lat 41.021 --lng 28.874 --demo-fallback
```

Ham veriyi pipeline sonunda silerek:

```powershell
python scripts\streetview_pipeline.py --lat 41.021 --lng 28.874 --delete-raw-data
```

Sonuclari HTTP API uzerinden sun (Go backend icin):

```powershell
python scripts\serve.py --port 8000
# GET http://localhost:8000/api/detections
```

---

## Hizli Demo (API Anahtari Olmadan)

Ham videoyu repoya koymayin. Yerel olarak su klasore ekleyin:

```text
ai-pipeline/data/input/demo.mp4
```

Ardindan:

```powershell
python scripts\run_pipeline.py --input data\input\demo.mp4 --lat 41.021 --lng 28.874
```

YOLO kurulumu hackathon aninda zaman alirsa, sadece entegrasyon ve JSON formati gostermek icin:

```powershell
python scripts\run_pipeline.py --input data\input\demo.mp4 --lat 41.021 --lng 28.874 --demo-fallback
```

Elinizde video yoksa once PII icermeyen sentetik demo videosu uretin:

```powershell
python scripts\create_demo_video.py --output data\input\demo_synthetic.mp4
python scripts\run_pipeline.py --input data\input\demo_synthetic.mp4 --lat 41.021 --lng 28.874 --demo-fallback
```

Uretilecek dosyalar:

```text
output/anonymized_demo.mp4
output/detections_raw.json
output/detections.json
reports/pipeline_report.json
reports/deletion_report.json
```

## Sunumda Soylenecek Kritik Cumle

Model ham goruntu uzerinde degil, once anonimlestirilmis frame/video uzerinde calisir. JSON ciktisi sadece kentsel obje tipi, koordinat, guven skoru ve zaman bilgisini icerir.

`--demo-fallback` gercek model ciktisi degildir; sadece backend ve harita entegrasyonunu model kurulmadan gostermek icindir.

## Beklenen JSON

```json
[
  {
    "type": "traffic_sign",
    "latitude": 41.021,
    "longitude": 28.874,
    "confidence": 0.91,
    "timestamp": "00:01:24"
  }
]
```

## Person 2 Entegrasyonu

Pipeline ciktilarini HTTP API uzerinden sunmak icin:

```powershell
python scripts\serve.py --port 8000
```

Sunucu varsayilan olarak yalnizca `127.0.0.1` uzerinde dinler ve sadece yerel
dashboard originlerine CORS izni verir. Ham veya ozet veriyi ag uzerinden
paylasmak icin `--host 0.0.0.0` kullanmayin.

Endpointler:

```text
GET /health
GET /api/detections        <- Go backend bu adresten okur
GET /api/pipeline-report
GET /api/deletion-report
```

Tam sozlesme ve ornek Go kodu icin:

```text
docs/INTEGRATION_TR.md
```

Ornek veri:

```text
examples/detections.sample.json
```

## Ham Veri Silme Kaniti

Pipeline sonunda ham veri silme raporu uretmek icin:

```powershell
python scripts\run_pipeline.py --input data\input\demo.mp4 --lat 41.021 --lng 28.874 --demo-fallback --delete-raw-data --raw-dir data\input
```

Silme scripti yalnizca `ai-pipeline/data` altindaki klasorleri silebilir.

## Smoke Test

Tum demo hattini, JSON validasyonunu ve silme guvenlik sinirini test etmek icin:

```powershell
python scripts\smoke_test.py
```

Basarili cikti:

```text
Smoke test basarili.
```
