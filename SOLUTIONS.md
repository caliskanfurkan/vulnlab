# Pusula Store — Çözüm Dokümanı (Eğitmen)

Bu doküman her senaryonun nerede olduğunu, nasıl doğrulanacağını, kök nedenini ve düzeltmesini
anlatır. Öğrencilere dağıtmayın. Docker imajına kopyalanmaz (`.dockerignore`).

## Flag listesi

| # | Senaryo | Flag |
|---|---------|------|
| 1 | Eski API sürümü | `FLAG{v1_api_never_sunset_7f3a}` |
| 2 | OTP kaba kuvvet + hız sınırı atlatma | `FLAG{otp_rate_limit_xff_bypass_4d19}` |
| 3 | IDOR (sipariş) | `FLAG{order_idor_teslimat_kodu_9c2e}` |
| 4 | Mass assignment (rol) | `FLAG{mass_assignment_role_vendor_b81f}` |
| 5 | Race condition (hediye çeki) | `FLAG{race_condition_gold_tier_e6a4}` |
| 6 | İstemci fiyatına güven | `FLAG{client_side_price_trust_2c7d}` |
| 7 | SQL injection | `FLAG{sqli_union_api_credentials_5e90}` |
| 8 | Path traversal | `FLAG{path_traversal_dotenv_c4e8}` |
| 9 | JWT decode ≠ verify | `FLAG{jwt_decode_is_not_verify_d7a1}` |
| 10 | BFLA (kuponlar) | `FLAG{bfla_admin_coupons_3e6f}` |
| 11 | GraphQL introspection | `FLAG{graphql_introspection_staff_9a4b}` |
| 12 | Prototype pollution | `FLAG{prototype_pollution_debug_8b3c}` |
| 13 | SSRF | `FLAG{ssrf_loopback_internal_61bd}` |
| 14 | İmzasız sıfırlama token'ı | `FLAG{unsigned_reset_token_72ce}` |
| 15 | Fazla veri sızdırma | `FLAG{excessive_data_exposure_moderation_note_1a6d}` |

## Hesaplar

| E-posta | Şifre | Rol | Not |
|---------|-------|-----|-----|
| admin@pusula.local | `Adm1n-Pusula-2026!` | admin | 14. senaryoda şifresi değiştirilir |
| muhasebe@pusula.local | `qwerty123` | staff | OTP açık; MD5 özeti v1 API'de görünür |
| ayse.yilmaz@example.com | `Ayse.2024!` | customer | Örnek müşteri |
| mehmet.ozturk@example.com | `mehmet1985` | customer | Örnek müşteri |
| satis@teknosat.example | (rastgele) | vendor | Satıcı örneği |

Oturum: `session` çerezi (HttpOnly) içinde HS256 JWT. API ayrıca `Authorization: Bearer` kabul eder.

---

## 1. Eski API sürümü

**Nerede:** `GET /api/v1/users` (kimlik doğrulaması yok). `robots.txt` içinde `/api/v1/` satırı ipucudur.

**Doğrulama:** `/api/v1/` adresi "deprecated" bir indeks döndürür; `Deprecation` ve `Sunset`
yanıt başlıkları vardır. `/api/v1/users` tüm kullanıcıları `password_md5` ve `api_token`
alanlarıyla listeler. `svc-backup` servis hesabının `api_token` değeri flag'dir.

**Kök neden:** Eski mobil istemci için bırakılan v1 API hiç kapatılmadı; v2'deki yetki kontrolleri
v1'e uygulanmadı. Hassas alanlar (özetler, servis token'ları) seri hale getirmede filtrelenmiyor.

**Düzeltme:** Eski sürümü tamamen kaldırın veya aynı kimlik doğrulama katmanının arkasına alın.
API yanıt modellerini açıkça tanımlayın (allow-list), veritabanı satırını doğrudan döndürmeyin.
API envanterini (sürümler, uç noktalar) belgeleyin ve düzenli tarayın.

## 2. OTP kaba kuvvet ve hız sınırı atlatma

**Nerede:** `POST /api/v2/auth/login` → `POST /api/v2/auth/otp`.

**Doğrulama:**
1. Senaryo 1'deki `muhasebe@pusula.local` için `password_md5` değerini çevrimdışı kırın
   (`qwerty123`, yaygın sözlüklerde vardır).
2. Giriş yapın; yanıt `otp_required: true` ve bir `challenge_id` içerir. Kod 4 hanelidir, 30 dakika geçerlidir.
3. `/api/v2/auth/otp` uç noktasına 5 hatalı denemeden sonra `429` döner. Sınırlayıcı istemciyi
   `X-Forwarded-For` başlığına göre tanır; her istekte farklı bir değer verirseniz sınır sıfırlanır.
4. Intruder'da iki payload konumu kullanın (kod: 0000–9999, başlık: değişen IP) veya `ffuf`/kısa bir
   betikle 10.000 denemeyi tarayın. Doğru kodda `200` ve `Set-Cookie` gelir.
5. Bu oturumla `GET /api/v2/me/notifications` çağrısı flag'i içeren bildirimi döndürür.

**Kök neden:** Hız sınırı yalnızca istemci IP'sine bağlı ve IP, istemcinin kontrol ettiği bir
başlıktan okunuyor. OTP denemesi `challenge_id` başına sınırlanmıyor. Eski MD5 özetleri hâlâ saklanıyor.

**Düzeltme:** `X-Forwarded-For` değerini yalnızca güvenilen ters proxy'den kabul edin
(`app.set('trust proxy', ...)`). Deneme sayısını challenge ve hesap başına sınırlayın; 3–5 hatada
challenge'ı geçersiz kılın. Kodları en az 6 haneli yapın. Eski özet sütununu silin.

## 3. IDOR (sipariş detayı)

**Nerede:** `GET /api/v2/orders/:id` (sayfa: `/orders/:id`).

**Doğrulama:** Kendi siparişinizin ID'sini (1006 ve sonrası) 1001–1005 ile değiştirin. 1002 numaralı
sipariş yöneticiye aittir; `delivery_note` alanında teslimat teyit kodu olarak flag vardır. Fatura
indirme (`/download?f=invoices/INV-1002.pdf`) için de aynı durum geçerlidir.

**Kök neden:** Sorgu yalnızca `id` ile yapılıyor; `user_id = oturumdaki kullanıcı` koşulu yok.

**Düzeltme:** Her nesne erişiminde sahiplik kontrolü (`WHERE id = ? AND user_id = ?`). Tahmin
edilemeyen kimlikler (UUID) tek başına çözüm değildir, yalnızca ek önlemdir.

## 4. Mass assignment (rol)

**Nerede:** `PATCH /api/v2/me`.

**Doğrulama:** Profil formu `name`, `phone`, `address` gönderir. İsteğe `"role": "vendor"` ekleyin;
yanıt rolün değiştiğini gösterir. `"role": "admin"` reddedilir (şema yalnızca `customer|vendor`
kabul eder). Ardından `/vendor` sayfası ve `GET /api/v2/vendor/dashboard` açılır; pazaryeri API
anahtarı flag'dir.

**Kök neden:** Satıcı onboarding akışı için paylaşılan güncelleme şemasına `role` eklenmiş ve bu
şema kullanıcının kendi profilini güncellediği uç noktada da kullanılıyor.

**Düzeltme:** Uç nokta başına ayrı giriş şeması; rol gibi yetki belirleyen alanları yalnızca
yetkili iş akışlarından (onay süreci) değiştirin.

## 5. Race condition (hediye çeki)

**Nerede:** `POST /api/v2/gift-cards/redeem`.

**Doğrulama:** Kayıt olunca bildirimlerde `WELCOME-XXXXXX` kodu (₺250) gelir. Normal kullanımda
ikinci deneme `409` döner. Aynı isteği Repeater'da bir sekme grubuna 5–10 kopya olarak koyup
"Send group in parallel (single-packet attack)" ile gönderin. Hepsi `200` döner ve bakiye
₺250 × N olur. Bakiye ₺1.000'i geçince `GET /api/v2/me` yanıtında `tier: "gold"` ve
`gold_benefits.priority_support_code` (flag) görünür; Hesabım > Bakiye sekmesinde de yazar.

**Kök neden:** "Kullanılmış mı?" kontrolü ile "kullanıldı olarak işaretle" güncellemesi arasında
cüzdan servisine giden `await` var (TOCTOU). Kontrol ve güncelleme atomik değil.

**Düzeltme:** Tek atomik güncelleme: `UPDATE gift_cards SET redeemed_by=? WHERE code=? AND
redeemed_at IS NULL` ve etkilenen satır sayısını kontrol edin; veya satır kilidi / işlem (transaction).
Dış servis çağrısını kaydı işaretledikten sonra yapın, başarısızsa geri alın.

## 6. İstemci fiyatına güven

**Nerede:** `POST /api/v2/checkout`.

**Doğrulama:** Sepet, her kalemi `{product_id, qty, price}` olarak gönderir. 10 numaralı ürünün
(Kurumsal yedekleme, ₺249.000) `price` değerini `1` yapın. Sipariş oluşur, bakiyeden ₺1 düşer.
`GET /api/v2/orders/:id` yanıtında kalemin `license_key` alanı flag'dir; sipariş sayfasında da
"Lisans anahtarı" olarak görünür.

**Kök neden:** Sunucu toplamı istemciden gelen fiyatla hesaplıyor; yalnızca pozitif sayı kontrolü var.

**Düzeltme:** Fiyatı her zaman veritabanından okuyun; istemciden yalnızca `product_id` ve `qty`
alın. Toplamı sunucuda hesaplayıp sipariş kaydında saklayın.

## 7. SQL injection (ürün arama)

**Nerede:** `GET /api/v2/products?q=` (arama kutusu).

**Doğrulama:** `q` parametresi `LIKE '%...%'` içine doğrudan ekleniyor. Tek tırnak eklenince `500`
döner (hata detayı yalnızca 12. senaryodaki debug modunda görünür). Sorgu `AND ( ... )` içinde
olduğundan önce parantezi kapatmak gerekir. Sekiz sütunlu bir `UNION SELECT` ile başka tablolar
okunabilir; örneğin `api_credentials` tablosunun `secret` sütunu, iyzico canlı ortam anahtarı
olarak flag'i içerir. Tablo adları `sqlite_master` üzerinden listelenebilir. `category` ve `sort`
parametreleri güvenlidir (parametre / allow-list), yalnızca `q` zafiyetlidir.

**Kök neden:** Dizgi birleştirme ile sorgu oluşturma.

**Düzeltme:** Parametreli sorgu (`LIKE ?` ve `%${q}%` değerini parametre olarak verin). Veritabanı
kullanıcısına en az yetki; uygulama sırlarını veritabanında düz metin tutmayın.

## 8. Path traversal (fatura indirme)

**Nerede:** `GET /download?f=invoices/INV-1001.pdf`.

**Doğrulama:** `f` parametresi `storage/` dizinine ekleniyor. `../` dizisi tek geçişte siliniyor;
`....//` yazıldığında silme sonrası geriye `../` kalır. `f=....//.env` ile uygulamanın `.env` dosyası
iner; `BACKUP_ACCESS_TOKEN` satırı flag'dir. Aynı yöntemle `/etc/passwd` veya kaynak kod da
okunabilir (bkz. "Kısayollar").

**Kök neden:** Kara liste tabanlı, tek geçişli temizleme; çözümlenmiş yolun kök dizin içinde
kaldığı doğrulanmıyor.

**Düzeltme:** `path.resolve` ile tam yolu çözüp `startsWith(STORAGE_DIR + sep)` kontrolü yapın;
daha iyisi dosya adını veritabanındaki fatura kaydından türetin, kullanıcıdan yol almayın.

## 9. JWT decode ≠ verify (raporlar)

**Nerede:** `GET /api/v2/reports/summary`. Uç nokta `/static/js/dashboard.js` içinde görülür.

**Doğrulama:** Kendi JWT'nizi (çerez veya Bearer) alın, payload'daki `role` değerini `admin`
yapın (imzayı değiştirmeden ya da rastgele bir imzayla). Diğer uç noktalar (`/api/v2/admin/*`)
`401` döner; raporlama uç noktası ise raporu ve `audit_reference` alanında flag'i döndürür.

**Kök neden:** Raporlama rotası "doğrulama gateway'de yapılıyor" varsayımıyla `jwt.decode()`
kullanıyor; `decode` imzayı kontrol etmez.

**Düzeltme:** Her yerde `jwt.verify()` ve tek bir ortak kimlik doğrulama middleware'i. Rolü token
yerine veritabanından okuyun.

## 10. BFLA (kupon listesi)

**Nerede:** `GET /api/v2/admin/coupons`.

**Doğrulama:** Sıradan bir müşteri oturumuyla çağırın. Diğer `/api/v2/admin/*` uç noktaları `403`
döndürürken bu uç nokta tüm kuponları `internal_note` ile listeler; `PERSONEL50` kuponunun notu flag'dir.

**Kök neden:** Rol kontrolü rota rota elle ekleniyor; bu rotada `requireRole('admin')` yerine
`requireAuth` kullanılmış.

**Düzeltme:** Yetki kontrolünü router seviyesinde (`/admin` prefix'i için) zorunlu kılın; "varsayılan
olarak reddet" yaklaşımı. Otomatik testlerle her yönetici uç noktasının müşteri oturumunda `403`
döndürdüğünü doğrulayın.

## 11. GraphQL introspection

**Nerede:** `POST /graphql` (ana sayfa duyuruları ve öne çıkan ürünler bu uç noktadan gelir).

**Doğrulama:** Introspection sorgusu (`{ __schema { queryType { fields { name } } } }`) açıktır.
Arayüzün hiç kullanmadığı `staffAnnouncements` alanı görünür; sorgulandığında yetki kontrolü
olmadan personel duyurularını döndürür. VPN geçiş duyurusunda flag vardır.

**Kök neden:** Üretimde introspection açık; alan düzeyinde yetkilendirme yok.

**Düzeltme:** Üretimde introspection'ı kapatın (gizlilik değil, saldırı yüzeyini küçültme).
Resolver'larda `context.user` üzerinden yetki kontrolü yapın. Yetki gerektiren alanları ayrı şemaya taşıyın.

## 12. Prototype pollution → debug modu

**Nerede:** `PUT /api/v2/me/preferences` (Hesabım > Tercihler).

**Doğrulama:**
1. Tercih nesnesi sunucuda özel bir `deepMerge` ile mevcut tercihlerle birleştiriliyor ve
   `__proto__` anahtarı için koruma yok.
2. Gövdeye `"__proto__": {"debug": true}` ekleyin.
3. `GET /api/v2/health` artık `debug: true` döndürür (tespit için Express'in bilinen
   `json spaces` gadget'ı da kullanılabilir).
4. Herhangi bir sunucu hatası tetikleyin (örneğin arama kutusuna tek tırnak içeren `x'`).
   Hata yanıtı artık `message`, `stack` ve `settings` içerir; `settings.payment_webhook_secret` flag'dir.

Bu kirlilik süreç geneline etki eder; sunucu yeniden başlatılana kadar herkes için debug modu açık kalır.

**Kök neden:** Kullanıcı girdisiyle özyinelemeli birleştirme yapılırken `__proto__`,
`constructor`, `prototype` anahtarları filtrelenmiyor. Hata işleyici, ayar nesnesinde
tanımlı olmayan `debug` anahtarını okuyor (prototip zincirine düşüyor).

**Düzeltme:** Birleştirmede tehlikeli anahtarları atlayın veya `Object.create(null)` /
`Map` kullanın; girdiyi şema ile doğrulayın (yalnızca bilinen anahtarlar). Node'u
`--disable-proto=delete` ile çalıştırmayı değerlendirin. Hata yanıtlarında asla yapılandırma dökmeyin.

## 13. SSRF (profil fotoğrafı)

**Nerede:** `POST /api/v2/me/avatar` (`{"url": "..."}`).

**Doğrulama:** Sunucu verilen adresi indirip içerik türüne bakıyor; görsel değilse hata yanıtında
ilk 800 karakteri `preview` alanında geri veriyor. `localhost` ve `127.0.0.1` dizgileri engelleniyor,
ancak loopback'in diğer yazımları (örneğin `http://0.0.0.0:3000/...`) engellenmiyor. İç uç nokta
`GET /internal/health` dışarıdan `403` döner; SSRF ile çağrıldığında `config.internal_api_key`
alanında flag görünür. Yönlendirme takip edildiği için kendi sunucunuzdan 302 ile de ulaşılabilir.

**Kök neden:** Dizgi tabanlı kara liste; iç uç nokta yalnızca kaynak IP'ye güveniyor; hata
yanıtı indirilen içeriği geri yansıtıyor.

**Düzeltme:** URL'yi çözümleyip IP'yi DNS sonrası kontrol edin (özel/loopback/link-local aralıklarını
reddedin), yönlendirmeleri elle ve her adımda kontrol ederek takip edin, mümkünse çıkış trafiğini
ayrı bir servis/proxy üzerinden geçirin. Hata yanıtında indirilen içeriği göstermeyin. İç uç noktaları
ayrı ağ/port ve kimlik doğrulama ile koruyun.

## 14. İmzasız şifre sıfırlama token'ı

**Nerede:** `POST /api/v2/auth/forgot` → `POST /api/v2/auth/reset`.

**Doğrulama:** Kendi hesabınız için sıfırlama isteyin; e-posta kopyası Hesabım > Bildirimler'de
görünür. Bağlantıdaki `token` base64url'dir; çözüldüğünde `eposta:bitiş_zamanı(ms)` çıkar. İmza veya
rastgelelik yoktur. `admin@pusula.local:<gelecek bir zaman damgası>` değerini base64url kodlayıp
`/api/v2/auth/reset` uç noktasına yeni şifreyle gönderin. Yönetici olarak giriş yapın; yönetici
bildirimlerinde (`/admin` sayfası veya `/api/v2/me/notifications`) flag vardır.

**Kök neden:** Token, içeriği istemci tarafından üretilebilecek bir kodlamadan ibaret; sunucu
tarafında saklanmıyor ve imzalanmıyor. Kodlama şifreleme değildir.

**Düzeltme:** Kriptografik olarak rastgele token üretin (`crypto.randomBytes(32)`), özetini
veritabanında kullanıcı ve bitiş zamanıyla saklayın, tek kullanımlık yapın. Alternatif olarak
HMAC ile imzalanmış, kısa ömürlü token kullanın.

## 15. Fazla veri sızdırma (yorumlar)

**Nerede:** `GET /api/v2/products/:id/reviews` (ürün sayfası yorumları buradan yükler).

**Doğrulama:** Arayüz yalnızca ad, puan ve yorum gösterir; API yanıtı ise her yorumda
`user.email`, `user.phone` ve `moderation_note` alanlarını da döndürür. 2 numaralı üründeki bir
yorumun moderasyon notu flag'i içerir.

**Kök neden:** Veritabanı satırının tamamına yakını seri hale getiriliyor; arayüzün göstermemesi
güvenlik sayılmış.

**Düzeltme:** Yanıt DTO'larını açıkça tanımlayın; iç alanları (moderasyon notu) ve kişisel verileri
(e-posta, telefon) yalnızca yetkili rollere döndürün.

---

## Flag'siz ek bulgular

- **Kullanıcı adı sızdırma:** `/api/v2/auth/login` "hesap bulunamadı" ve "şifre hatalı" için farklı mesaj döndürür.
- **Açık yönlendirme:** `/login?next=` değeri doğrulanmadan `location.href` olarak kullanılır.
- **Depolanmış XSS:** Yorum gövdesi ürün sayfasında `innerHTML` ile kaçışsız basılır. Oturum çerezi
  HttpOnly'dir, ancak sayfa içeriği ve API çağrıları XSS ile hâlâ erişilebilirdir; CSP yoktur.
- **Eksik güvenlik başlıkları:** CSP, `X-Frame-Options`, `Strict-Transport-Security` yok.
- **Sipariş faturalarında IDOR:** `/download?f=invoices/INV-<id>.pdf` sahiplik kontrolü yapmaz.

## Kısayollar ve dikkat edilecekler

- **Path traversal ile kaynak kod:** `f=....//src/flags.js` tüm flag'leri verir. Gerçekçi bir zincirdir;
  öğrencilere kaynak okumaktan çok her zafiyeti ayrı ayrı bulmalarının beklendiğini söyleyin.
- **Prototype pollution geneldir:** Bir öğrenci debug modunu açınca herkes görür. Ortak ortamda
  bu senaryoyu en sona bırakın veya kişi başı ayrı konteyner kullanın.
- **Hesap durumu:** Veritabanı bellek içidir; yeniden başlatma her şeyi sıfırlar. Yönetici şifresi
  14. senaryodan sonra değişmiş olur.
- **Docker dışı çalıştırma:** `/internal/*` kontrolü istemci IP'sine baktığı için yerelde
  (konteynersız) doğrudan erişilebilir olur; 13. senaryo anlamını yitirir.
