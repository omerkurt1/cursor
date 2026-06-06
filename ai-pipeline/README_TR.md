# AI ve Mahremiyet Pipeline

Bu klasor, hackathon icin kamera goruntusunu once anonimlestiren, sonra yalnizca anonimlestirilmis video uzerinden kentsel obje tespiti yapan guvenli veri hattidir.

## Pipeline

```text
raw video
  -> face + license plate blur
  -> anonymized video
  -> urban object detection
  -> duplicate cleanup
  -> JSON export
  -> raw-data deletion report
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

`ultralytics` ilk calismada model agirligi indirmeye calisabilir. Internet yoksa `models/` klasorune daha once indirilmis bir `.pt` dosyasi koyup `--model` ile verin.

Bu ortamda `python` komutunda `pip` yoksa, kullandiginiz Python executable yolunu acikca vererek calistirin:

```powershell
& '<python.exe yolu>' scripts\run_pipeline.py --input data\input\demo.mp4 --lat 41.021 --lng 28.874 --demo-fallback
```

## Hizli Demo

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

Uretilecek dosyalar:

```text
output/anonymized_demo.mp4
output/detections_raw.json
output/detections.json
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
