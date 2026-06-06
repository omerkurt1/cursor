# KVKK ve Veri Guvenligi Kontrol Listesi

Sunumdan once bu listeyi tamamlayin.

- [x] Ham video GitHub'a eklenmedi. (`.gitignore` ile engellendi: `*.mp4`, `data/input/`)
- [x] Ham video acik bulut depolamaya yuklenmedi.
- [x] Detection islemi anonimlestirilmis video uzerinden calisti. (`run_pipeline.py`: once `anonymize_video`, sonra `detect_objects`)
- [x] Final JSON yalnizca `type`, `latitude`, `longitude`, `confidence`, `timestamp` alanlarini iceriyor. (`validate_outputs.py` ile dogrulandi)
- [x] Yuz tanima, kimlik tespiti, plaka OCR veya kisi/arac takibi yapilmadi. (Sadece Haar cascade blur; tespit degil)
- [x] `reports/pipeline_report.json` uretildi. (`run_pipeline.py --report-dir`)
- [ ] Demo bittikten sonra `--delete-raw-data` ile ham veri silme raporu uretildi.

---

## Demo Sonrasi Ham Veri Silme Komutu

```powershell
python scripts\run_pipeline.py `
  --input data\input\demo.mp4 `
  --lat 41.021 --lng 28.874 `
  --demo-fallback `
  --delete-raw-data `
  --raw-dir data\input
```

Bu komut `reports/deletion_report.json` uretir ve sildigi dosyalari belgeler.
Son maddeyi tamamladiktan sonra yukardaki `[ ]` isaretini `[x]` ile degistirin.
