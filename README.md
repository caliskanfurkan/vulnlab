# Pusula Store — Web Güvenliği Eğitim Laboratuvarı

Pusula Store, bilerek zafiyetli bırakılmış bir e-ticaret uygulamasıdır. Amaç, güncel web ve API
zafiyetlerini gerçekçi bir uygulama üzerinde, Burp Suite (veya benzeri bir proxy) ile araya girerek
keşfetmeyi öğretmektir. Uygulama dışarıdan bakıldığında sıradan bir mağazadır: ürünler, sepet,
sipariş, hesap sayfası, satıcı ve yönetici panelleri.

> **Uyarı:** Bu uygulamayı yalnızca kendi makinenizde veya izole bir eğitim ağında çalıştırın.
> İnternete açmayın. İçindeki zafiyetler gerçektir.

## Senaryo

Pusula Teknoloji A.Ş. yeni e-ticaret platformu için sizden bir sızma testi istiyor. Platformda 15
farklı bulgu var. Her bulgunun kanıtı `FLAG{...}` biçiminde bir değerdir: bir teslimat kodu, bir
API anahtarı, bir lisans anahtarı gibi uygulamanın doğal verileri arasına yerleştirilmiştir.
Flag'leri bulmak için uygulamayı normal bir müşteri gibi kullanın, her isteği proxy'de inceleyin
ve "burada ne ters gidebilir?" diye sorun.

## Kurulum

### Docker ile (önerilen)

```bash
docker compose up --build -d
```

Uygulama `http://localhost:3000` adresinde açılır. Durdurmak için `docker compose down`.

### Yerel Node.js ile

Node.js 22.13 veya üzeri gerekir (yerleşik `node:sqlite` modülü kullanılır).

```bash
npm install
npm start
```

> SSRF senaryosundaki iç ağ kontrolü, istemci adresine bakar. Uygulamayı Docker olmadan
> çalıştırırsanız bu kontrol anlamsızlaşır; o senaryo için Docker kullanın.

## Burp Suite ayarı

1. Burp'te Proxy > Proxy settings altında dinleyicinin `127.0.0.1:8080` olduğunu doğrulayın.
2. Tarayıcınızı (veya Burp'ün gömülü tarayıcısını) bu proxy'ye yönlendirin.
3. Target > Scope'a `http://localhost:3000` ekleyin ve HTTP history'de "show only in-scope items" seçin.
4. Kendinize bir hesap açın (`/register`). Eğitmen hesaplarını kullanmanız beklenmez.

## Çalışma yöntemi

- Uygulamanın yaptığı **her** isteği okuyun: REST API, GraphQL, statik JavaScript dosyaları.
- Yanıt başlıklarını ve `robots.txt` gibi standart dosyaları atlamayın.
- JSON gövdelerine fazladan alan eklemeyi, sayısal kimlikleri değiştirmeyi, aynı isteği
  farklı bir rol veya oturumla tekrarlamayı deneyin.
- Bazı senaryolar eşzamanlı istek gerektirir (Repeater'da sekme grubu + "Send group in parallel").
- Bazı senaryolar çok sayıda deneme gerektirir (Intruder veya `ffuf`).
- Takıldığınız yerde `SOLUTIONS.md` dosyasına bakabilirsiniz; bu dosya eğitmen içindir ve
  Docker imajına kopyalanmaz.

## Görevler

| # | Başlık | Kategori | Zorluk |
|---|--------|----------|--------|
| 1 | Unutulan API sürümü | API9 Improper Inventory Management / A02 Security Misconfiguration | Kolay |
| 2 | İki adımlı doğrulamayı aşmak | A07 Authentication Failures / API4 Unrestricted Resource Consumption | Orta |
| 3 | Başkasının siparişi | API1 BOLA / A01 Broken Access Control | Kolay |
| 4 | Fazladan bir alan | API3 Mass Assignment / A01 | Kolay |
| 5 | Aynı çeki iki kez kullanmak | A06 Insecure Design (Race Condition) / API6 | Orta |
| 6 | Fiyatı kim belirliyor? | A06 Insecure Design (İş mantığı) | Kolay |
| 7 | Arama kutusu | A05 Injection (SQL) | Orta |
| 8 | Fatura indir | A01 Path Traversal | Orta |
| 9 | Raporlara kim bakabilir? | A07 Authentication Failures (JWT) | Orta |
| 10 | Kupon listesi | API5 Broken Function Level Authorization | Kolay |
| 11 | Şema her şeyi anlatır | GraphQL Introspection / API3 Excessive Data Exposure | Kolay |
| 12 | Tercihlerinizi kaydedin | A05 Injection (Prototype Pollution) / A02 | Zor |
| 13 | Profil fotoğrafı | API7 SSRF / A10 Mishandling of Exceptional Conditions | Orta |
| 14 | Şifremi unuttum | A04 Cryptographic Failures (imzasız token) | Orta |
| 15 | Yorumlar | API3 Excessive Data Exposure | Kolay |

Flag'siz ek bulgular da vardır (kullanıcı adı sızdırma, açık yönlendirme, depolanmış XSS,
eksik güvenlik başlıkları). Raporunuza eklemeyi deneyin.

## Ortamı sıfırlama

Veritabanı bellek içindedir. `docker compose restart` (veya yerelde süreci yeniden başlatmak) tüm
veriyi başlangıç durumuna döndürür. Bazı senaryolar sunucunun genel durumunu etkiler; bir şeyler
tuhaf davranmaya başlarsa yeniden başlatın.

## Dizin yapısı

```
src/server.js        Uygulama girişi
src/routes/          REST API (v1, v2), GraphQL, sayfalar
src/views/           Nunjucks şablonları
src/public/          CSS, istemci JS, ürün görselleri
src/db.js            Şema ve örnek veri (bellek içi SQLite)
storage/             Üretilen faturalar ve yüklenen görseller
```
