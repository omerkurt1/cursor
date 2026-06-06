---
marp: true
title: Akıllı Şehir — AI & Mahremiyet Platformu
author: Hackathon Takımı
theme: default
paginate: true
backgroundColor: #0d1117
color: #e6edf3
style: |
  section {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 28px;
  }
  h1 { color: #58a6ff; }
  h2 { color: #79c0ff; }
  strong { color: #ffa657; }
  code { background: #161b22; color: #7ee787; }
  a { color: #58a6ff; }
  table { font-size: 22px; }
  section.lead h1 { font-size: 52px; }
  section.lead { text-align: center; }
---

<!-- _class: lead -->

# Şehri Anla, Yaşamı İyileştir

## Mahremiyeti Koruyan Akıllı Şehir Veri Platformu

Kamera görüntülerini → güvenli, kullanışlı şehir verisine dönüştürüyoruz

**AI Pipeline · Go Backend · Next.js Harita**

---

## Problem

Şehirler her gün milyonlarca görüntü üretiyor — ama bu veriyi kullanmak iki büyük engelle karşı karşıya:

- **Mahremiyet riski** — görüntülerde yüzler, plakalar, kişisel veriler var (KVKK)
- **Ham veri kullanışsız** — bir video, "şu noktada hasarlı tabela var" demez

> **Soru:** Vatandaşın mahremiyetini ihlal etmeden, şehri veriyle nasıl anlarız?

---

## Çözümümüz

Üç katmanlı, uçtan uca **mahremiyet-öncelikli** bir veri platformu:

```
Görüntü  →  Anonimleştir  →  Tespit Et  →  Sun  →  Haritada Göster
            (yüz/plaka)      (tabela)      (API)
```

1. **AI Pipeline** — görüntüyü anonimleştirir, kentsel objeleri tespit eder
2. **Go Backend** — veriyi filtreler, zenginleştirir, gerçek zamanlı sunar
3. **Next.js Frontend** — interaktif haritada gösterir

---

## Genel Mimari

```
┌─────────────┐   REST + WebSocket   ┌──────────────┐
│  Next.js    │ ───────────────────► │  Go Backend  │
│  (Vercel)   │ ◄─── canlı olaylar ──│  (Render)    │
└─────────────┘                      └──────┬───────┘
                                            │ HTTP proxy
                                            ▼
                                     ┌──────────────┐
                                     │ Python AI    │
                                     │ Pipeline     │
                                     │ (Render)     │
                                     └──────┬───────┘
                                            │
                                  Google Street View API
```

---

## 1. AI & Mahremiyet Pipeline

**Fail-closed** tasarım — anonimleştirme başarısız olursa pipeline durur, asla ham veri sızdırmaz.

```
Street View görüntüsü
  → yüz + plaka bulanıklaştırma   (geri döndürülemez)
  → SADECE anonim kareler üzerinde tespit
  → yinelenen tespitleri temizle
  → JSON çıktı + ham veri silme kanıtı
```

- **OpenCV** ile anonimleştirme · **YOLOv8** ile tespit
- Model **hiçbir zaman** orijinal görüntüyü görmez

---

## KVKK & Mahremiyet (Kritik)

> "Model ham görüntü üzerinde değil, **önce anonimleştirilmiş** video üzerinde çalışır."

| İlke | Uygulama |
|---|---|
| **Amaç sınırlaması** | Sadece kentsel obje tespiti — kimlik tespiti YOK |
| **Zorunlu anonimleştirme** | Yüz + plaka, eğitimden önce geri döndürülemez şekilde bulanık |
| **Veri minimizasyonu** | JSON sadece: tip, koordinat, güven, zaman |
| **Silme kanıtı** | Ham veri otomatik silinir, raporlanır |

---

## JSON Çıktısı — Tek Ürettiğimiz Veri

```json
{
  "type": "damaged_sign",
  "latitude": 41.021,
  "longitude": 28.874,
  "confidence": 0.91,
  "timestamp": "00:01:24"
}
```

**Kimlik içermez. Görüntü içermez. Sadece şehir verisi.**

---

## 2. Go Backend — Production Seviyesi

AI pipeline ile harita arasındaki **akıllı köprü**:

- **Filtrelenebilir API** — tip, güven skoru, coğrafi sınır kutusu (bbox)
- **İstatistik endpoint'i** — tip dağılımı, ortalama güven
- **WebSocket** — canlı tarama takibi (başladı → çalışıyor → tamamlandı)
- **Dayanıklılık** — rate limiting, panic recovery, graceful shutdown
- **30 sn cache** — pipeline kısa süre düşse bile veri sunar

Sadece **3 harici paket** — gerisi Go standart kütüphanesi.

---

## API Endpoint'leri

| Metod | Yol | Açıklama |
|---|---|---|
| `GET` | `/health` | Servis + pipeline durumu |
| `GET` | `/api/v1/detections` | Filtreli tespit listesi |
| `GET` | `/api/v1/detections/stats` | İstatistikler |
| `POST` | `/api/v1/scan` | Yeni tarama başlat |
| `GET` | `/api/v1/scan/status` | Tarama durumu |
| `GET` | `/ws` | WebSocket — canlı olaylar |

---

## Gerçek Zamanlı Deneyim

Kullanıcı bir koordinat seçer → tarama başlar → **canlı izler**:

```json
{ "event": "scan_started",   "payload": {...} }
{ "event": "scan_progress",  "payload": {"status": "running"} }
{ "event": "scan_completed", "payload": {"detection_count": 5} }
```

WebSocket sayesinde "yükleniyor..." beklemesi yok — **anlık geri bildirim**.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| **Frontend** | Next.js · Vercel |
| **Backend** | Go (chi, gorilla/websocket) · Render |
| **AI Pipeline** | Python · OpenCV · YOLOv8 · Flask · Render |
| **Harici API** | Google Street View API |
| **Deployment** | Docker (multi-stage, ~7 MB imaj) |
| **Geliştirme** | Cursor IDE · agentic ruleset · Git feature branch |

---

## Deployment — Canlı

İki servis de **Render.com**'da Docker ile canlı:

- **Go Backend** → `cursor-j7jx.onrender.com`
  - `scratch` imaj · ~7 MB · sıfıra yakın saldırı yüzeyi
- **Python Pipeline** → `ai-privacy-pipeline.onrender.com`
  - Gunicorn · health check · otomatik sample fallback

Health endpoint'i her iki servisin durumunu canlı raporluyor.

---

## Canlı Demo

```bash
# 1. Servis ayakta mı?
curl .../health
→ { "status": "ok", "pipeline_status": "ok" }

# 2. Hasarlı tabelaları, yüksek güvenle filtrele
curl ".../api/v1/detections?type=damaged_sign&min_confidence=0.8"

# 3. Dashboard istatistikleri
curl .../api/v1/detections/stats
→ { "total": 5, "by_type": {...}, "avg_confidence": 0.8 }
```

Sonra: WebSocket ile canlı tarama → haritada pinlerin belirmesi.

---

## Neden Bu Proje Önemli?

- **Toplumsal fayda** — hasarlı tabela, çukur tespiti ile daha güvenli şehir
- **Mahremiyet öncelikli** — KVKK uyumu mimariye gömülü, sonradan eklenmedi
- **Veri tabanlı karar** — tahmin değil, gerçek koordinatlı veri
- **Ölçeklenebilir** — gerçek bir akıllı şehir servisine büyüyebilir

> Kod ekrandan çıkıp insanın hayatına dokunduğunda gerçek değer başlar.

---

<!-- _class: lead -->

# Teşekkürler

## Sorularınızı bekliyoruz

**Şehri Anla · Yaşamı İyileştir · Mahremiyeti Koru**
