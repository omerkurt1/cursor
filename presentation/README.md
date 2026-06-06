# Sunum Dosyaları

Marp formatında hazırlanmış hackathon sunumları.

| Dosya | Dil |
|---|---|
| `sunum_TR.md` | Türkçe |
| `presentation_EN.md` | İngilizce |

## Önizleme (En Kolay Yol)

1. VS Code / Cursor'da **Marp for VS Code** eklentisini kur
2. `.md` dosyasını aç → sağ üstteki önizleme ikonuna tıkla
3. Slaytları canlı gör

## PDF / PowerPoint'e Dönüştürme

`marp-cli` ile (Node.js gerekir):

```bash
# Tek seferlik, kurulum gerektirmez (npx)
npx @marp-team/marp-cli sunum_TR.md --pdf
npx @marp-team/marp-cli sunum_TR.md --pptx

npx @marp-team/marp-cli presentation_EN.md --pdf
npx @marp-team/marp-cli presentation_EN.md --pptx
```

Çıktı aynı klasörde `sunum_TR.pdf`, `sunum_TR.pptx` olarak oluşur.

## HTML Olarak Sunum

```bash
npx @marp-team/marp-cli sunum_TR.md --html
# Tarayıcıda açıp tam ekran (F) ile sun
```

## Notlar

- Tema koyu (GitHub dark) renklerde, projeksiyonda iyi görünür
- Her slayt `---` ile ayrılıyor
- Düzenlemek istersen sadece markdown metnini değiştir, format korunur
