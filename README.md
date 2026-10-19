# claude-kurulum

Claude Code kurulumum: her projede çalışan bir mod (`genel`), birkaç eklenti ve ayar. Yeni bir bilgisayarda tek komutla geri gelir.

## Kurulum

```bash
git clone https://github.com/omeraydin00/claude-kurulum.git ~/Documents/GitHub/claude-kurulum
~/Documents/GitHub/claude-kurulum/kur.sh
```

Sonra yeni bir terminalde `claude` aç. Betik tekrar çalıştırılabilir: `~/.claude/settings.json`'ın yedeğini alır ve yalnız aşağıdaki ayarları ekler, diğerlerine dokunmaz. Gerekenler: Claude Code 2.1.287+, `python3`, `bun` ya da `node`.

Kendi özel modların ayrı bir repodaysa onu bu reponun yanına `claude-<ad>` adıyla klonla (`../claude-<ad>/mods/<mod>`); `kur.sh` onları da yükler.

## `genel` modu

Her git reposunda, her dilde çalışır; parçaların çoğu yalnız gerektiğinde ortaya çıkar. `/genel` parçaları listeler; `/genel kapat <parça>` ve `/genel ac <parça>` ile açılıp kapanır, seçim kalıcıdır.

| Parça | Ne yapar |
|---|---|
| Nerede kaldık | Projeyi açınca bu klasördeki son oturumun iki cümlelik özeti ve "devam et" düğmesi |
| Proof of Done | Kod değişen turun sonunda projenin testleri (npm/pnpm/yarn/bun, pytest, go, cargo) arka planda koşar; kırılırsa hata Claude'a geri gönderilir (en çok 2 kez). Test komutu yoksa hiçbir şey yapmaz |
| Otomatik format | Düzenlenen dosyaya projenin kendi formatlayıcısı (Prettier, Ruff/Black, gofmt, rustfmt). Yalnız düzenlemeden önce zaten formatlı olan ve yeni dosyalarda çalışır; formatsız eski dosyayı baştan biçimlendirip PR’a ilgisiz fark sokmaz. Ayarı yoksa dokunmaz |
| Hata hafızası | Komut hata verince aynı hatayı eski oturum kayıtlarında arar, o zamanki açıklamayı Claude'a iletir |
| Bildirimler | 1 dakikadan uzun iş bitince ve Claude izin/cevap beklerken macOS bildirimi. Telefona da: `/telefon` (ntfy; içerik gönderilmez, yalnız proje adı). Sesli: `/genel ac ses` |
| Port çakışması | "port kullanımda" hatasında portu tutan programı gösterir, kapatma düğmesi verir |
| `.env` denetimi | `.env.example`'da olup `.env`'de eksik değişkenleri söyler |
| CI izleyici | PR açınca ya da push edince testleri izler, bitince bildirir. main’e push testi kırılırsa prompt üstünde uyarır; [tamam] ile kapanır, yeni bir repo kırılınca tekrar çıkar |
| Bağlam koruma | Sıkıştırmada açık PR'lar, kararlar ve bekleyen sorular özete girer; sonra güncel git durumu verilir |
| Tur sonu kartı | Süre satırı yerine: `✓ 2 dk 14 sn · 3 dosya (+42 −10) · 2 komut` |
| Takip | `/takip`: "cihazda denenmedi" ve "deploy sonrası yapılacak" listesi; Claude da ekleyebilir |
| Branch temizliği | `/temizle`: PR'ı merge olmuş yerel (ve fork'taki) branch'leri onayla siler, SHA'ları saklar |
| Tek tıklık cevap | Claude fiziksel bir adım isteyince (kabloyu tak vb.) prompt üstünde Yaptım / Olmadı düğmeleri |
| Telefon/tablet köprüsü | `IP:port KOD 123456` yapıştırınca adb ile eşleştirip bağlar, Metro ve sunucu portlarını açar; `/tablet` |
| Ortam durumu | Açık geliştirme sunucuları ve telefondan erişilecek LAN adresi |

## Eklentiler

| Eklenti | Ne yapar |
|---|---|
| `claude-hud@claude-hud` | Prompt altında tek satır: model, bağlam çubuğu, branch; limite yaklaşınca kullanım. Görünüm: `/claude-hud:configure` |
| `code-review@claude-plugins-official` | PR'ı birkaç inceleyiciyle gözden geçirir |
| `cc-safety-net@cc-marketplace` | `rm -rf`, force push gibi geri alınamayan komutları ve gizli dosya okumayı durdurur. Kontrol: `npx -y cc-safety-net@latest doctor` |

Kurulumsuz: maliyet raporu için `npx ccusage@latest`.

## Ayarlar (`ayarlar/`)
- `settings-ekleri.json`: mod yolu (`CLAUDE_CODE_PLUGIN_DIRS`), Türkçe yükleniyor yazıları (`spinnerVerbs`), claude-hud durum satırı (komut kurulumda bilgisayara göre üretilir)
- `claude-hud-config.json`: tek satırlık sade görünüm

## Denenip çıkarılanlar
Ekranı dolduran ya da yerleşik özelliği tekrarlayanlar: tasarım turları (`/rewind` yapıyor), sade araç satırları (çalışan komutu gizliyordu), günlük özet bandı, bağlam göstergesi (claude-hud gösteriyor), security-guidance, claude-md-management, cache-tax ve vercel eklentileri.

## Geliştirme
```bash
claude plugin validate mods/genel
claude plugin test mods/genel
```
