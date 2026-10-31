# Hibrit demo: mock akış, gerçek ödeme

31.10 kararı (kullanıcı). Pitch için herkese açık demo **yalnızca Vercel + Supabase** üzerinde, ücretsiz çalışır. Backend (coordinator, overlay, guard, provider-api, agents, maker, relay) yayınlanmaz. Business tarafındaki arkadaş başka bir Claude oturumundan senaryolar, demo sahneleri ve akışlar getirecek. Bunlardan biri uygulanırken aşağıdaki kurallar geçerli.

## Kurallar

1. **Akış mock, para gerçek.** Senaryonun gidişatı (havuz dolması, servis teslimi, kasaba animasyonu, ajan konuşmaları) web'in mock modunda ilerler. Ama senaryodaki her ödeme gerçek bir mainnet işlemidir: ziyaretçi butonla kendi BSV Desktop'una bağlanır (`new WalletClient('auto')`, `apps/web/src/wallet/client.ts`), bakiyesinden para gerçekten düşer, karşı taraf parayı gerçekten alır.
2. **İki taraf da gerçek.** Örnek senaryo: 5 kullanıcı ortak bir servis alır, her biri provider'a payını öder. Ödeyenin bakiyesi düşer, provider'ın cüzdanı ödemeyi `internalizeAction` ile alır ve bakiyesi artar. Her ödemenin WhatsOnChain linki ekranda görünür.
3. **Lobi yok.** Eşleştirme, oda ve davet gibi yapılar kurulmaz. Taraflar arasındaki iletişim (kim ödedi, sayaç 2/5, provider aldı) Supabase Realtime üzerinden ekranda gösterilir; bu yeterli.
4. **Backend yok.** Hiçbir senaryo coordinator, overlay veya sunucu cüzdanı gerektirmemeli. Gerekiyorsa önce kullanıcıya sor: bu, ücretsiz ve sunucusuz deploy kararını bozar.
5. **Ödeme biçimi** (`AGENTS.md`): BRC-29. Ödeyen `createAction` ile provider'ın identity key'ine göre türetilmiş P2PKH çıktısı oluşturur (`counterparty` = provider, `forSelf: false`), `randomizeOutputs: false`, çıktı indeksi locking script ile bulunur. Provider SPV ile doğrular (`Transaction.fromAtomicBEEF(beef).verify(chainTracker)`, Arcade chaintracks), sonra `internalizeAction` (`protocol: 'wallet payment'`, `paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey }`). Token veya NFT yok, `default` basket'e token konmaz.
6. **El değiştirme Supabase'te.** Ödeyenin tarayıcısı `demo_payments` satırını ekler (txid, senaryo, oturum, iki identity key, vout, satoshi, derivation prefix/suffix, AtomicBEEF hex). Provider'ın tarayıcısı okur, doğrular, cüzdana alır ve `demo_receipts` satırı ekler. Tablolar: `supabase/migrations/20261031140000_demo_payments.sql`. Herkes okuyup ekleyebilir; güncelleme ve silme yok. Satırlar para taşıyamaz: sahte bir satır provider'ın tarayıcısında SPV'den veya `internalizeAction`'dan geçemez. Makbuz yalnızca ekran için bir ipucu, kanıt değil; kanıt cüzdan bakiyesi ve zincir.
7. **Ayarlanabilir.** Fiyat (varsayılan kişi başı 1000 sat), kişi sayısı (varsayılan 5) ve provider'ın identity key'i senaryo ayarı olur, koda gömülmez. Provider'ın identity key'i build env'inden gelir (öneri: `VITE_DEMO_PROVIDER_KEY`).
8. **Kimler oynar.** Ziyaretçide BSV Desktop ve biraz mainnet sats'ı olmalı. Jüride büyük ihtimalle yok; sahnede ödeyenleri ekip oynar. Cüzdanı olmayan ziyaretçi mock akışı izler, gerçek ödeme adımı ona "BSV Desktop gerekli" der.
9. **Yedek.** Cüzdan veya ağ demo anında çalışmazsa aynı link `?mode=mock` ile tamamen sahte akışa döner. Önceki gerçek mainnet işlemlerinin kanıtı `README.md` tx tablosunda.

## Deploy

- **Vercel**: `apps/web/vercel.json`. Vercel'de projeyi `web` (Vite) satırından **Import single project** ile alın, Root Directory `apps/web`, Node 22.x. Install (`cd ../.. && npm ci`), build (`npm run build:demo`) ve output (`dist`) dosyadan gelir. SPA yönlendirmesi ve güvenlik header'ları da dosyada (Cloudflare'in `public/_redirects` ve `public/_headers` dosyalarının Vercel karşılığı). CSP, BSV Desktop'un yerel portlarına (`http://localhost:3301`, `http://localhost:3321`, `https://localhost:2121`) izin verir.
- **Env (Vercel → Settings → Environment Variables)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (yalnızca anon/publishable key; secret key asla), `VITE_NETWORK=main`. `VITE_*` değerleri build'e gömülür ve tarayıcıda görünür. Değişince redeploy gerekir.
- **Supabase**: `supabase db push` uzak projeye `supabase/migrations/` altındaki eksik migration'ları uygular (proje `supabase link` ile bağlı). Lokal deneme: `supabase migration up --local`.
- `build:demo` bugün `vite build --mode mock`. Hibrit adım eklenince bu script hibrit modu açacak şekilde değişir; Vercel ayarına dokunmak gerekmez.

## Durum

- ✅ 31.10: Supabase tabloları (`demo_payments`, `demo_receipts`, RLS, Realtime), `apps/web/vercel.json`, `build:demo`.
- ⏳ Web'deki gerçek ödeme adımı ve provider'ın "gelen ödemeleri al" butonu: business senaryoları gelince, bu kurallarla.
