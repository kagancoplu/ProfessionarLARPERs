# D-P4 — Teslim: README, threat model, value note, tx linkleri

> Track D. `plan/track-D-vault-ops-rail.md` Faz 4. Yürütme sırası 0→1→2→3→5→6→7→**4**; Faz 4 her zaman son faz. Bu dosya iki parçalı:
> - **D-P4a (şimdi, 30.10 ~21:10):** S3 beklenirken başka track'e ve mainnet'e bağlı olmayan kısımlar: README iskeleti, threat model, value note, tx tablosu iskeleti, diğer track'lerden README bölümü istekleri, video envanteri iskeleti. Kullanıcı kararı (görev metni b).
> - **D-P4b (teslime 4 saat kala ya da 5/6/7 bitince):** mainnet txid'leri, `npm run demo` temiz makine denemesi, link kontrolü, Axel'in cevapları, S4 Checkpoint.
>
> Önce: `git pull` + main birleştirildi (`0771075`; A P3, C P3 kısmi, E P2). Kök `npm test` 55 dosya / 267 test yeşil, typecheck temiz. Bağlı bilgisayar yok (`list_computer_folders` boş) → mainnet adımları (görev a) yapılamıyor.

## 1. Teslim şartları (TBC26 PDF §3) → nerede karşılanıyor

| Şart | Nerede | D-P4a sonunda |
|---|---|---|
| Açık kaynak repo + ne yaptığını ve nasıl çalıştırıldığını anlatan README | kök `README.md` | iskelet + çalışan mockchain komutları |
| Canlı demo ya da 2–3 dk video (uçtan uca, ajan ödemesi dahil) | FINAL-IDEA §11 senaryosu; video malzeme envanteri (§6 aşağıda) | envanter iskeleti |
| BSV'de örnek işlem linkleri (WhatsOnChain) | README "Example transactions" (T1–T11) ← STATUS "Mainnet işlemleri" | tablo iskeleti, txid'ler boş ("pending mainnet run") |
| Kullanım ve değer notu | README "Usage & value note" ← FINAL-IDEA §14 | metin |
| (İnşa şartları) SDK + Wallet Toolbox, BSV Desktop, gerçek işlem, non-custodial, ödeme yapan ajan | README "How it meets the track requirements" tablosu | tablo; "gerçek işlem" satırı mainnet'e kadar ☐ |

## 2. README iskeleti (kök `README.md`, İngilizce)

Bölümler (sıra jüri ağırlıklarına göre: benimsenme %35 önce):
1. Başlık + tek cümle pitch (FINAL-IDEA §0 EN)
2. **What it does** (3 paragraf) + mimari şema (metin/mermaid; aktörler FINAL-IDEA §6, bileşenler §3.1)
3. **Usage & value note** (FINAL-IDEA §14; "demo pricing" dürüstlüğü)
4. **How it meets the track requirements** (PDF §3 → bileşen → kanıt dosyası)
5. **Quick start (mock chain, no wallet, no sats)**: `npm install` (`npx npm@11 install`), `npm test`, `npm run demo:k1`, `npm run demo:failed-pool`, `npm run demo-injection -w @agentcoop/scripts`, `npm run infra`, `npm run web:mock`. Her biri bu ortamda koşturulup çıktısı doğrulanır.
6. **Mainnet run** (adımlar listesi: `.env`, keygen, BSV Desktop, fon, `npm run infra`, provider-cli, agents); ilk denemeler ≤ 1.000 sat
7. **Example transactions** (T1–T11 + T11b; durum sütunu)
8. **Non-custodial design & threat model** (FINAL-IDEA §8 özeti, "Açık" satırları saklanmadan; ayrıntı `docs/THREAT-MODEL.md`)
9. **What is real vs simulated**
10. **Components** (track başına bir paragraf + kendi README'sine link; metinler A/B/C/E'den istenir, gelene kadar mevcut app README'lerine link ve D'nin kısa özeti)
11. **Known limitations** (STATUS Blokajlar'dan: mainnet yok, S3 açık, Rail canlı değil, vault'a kilitli krediler A.P5)
12. Lisans (MIT; repoda `LICENSE` yoksa SETUP-ACCOUNTS #5 → insan), BSVA logosu: kullanılmıyor (kılavuz izni netleşene kadar yalnızca metin)

## 3. `docs/THREAT-MODEL.md`

FINAL-IDEA §8'in her satırı için: tehdit → önlem → **nerede zorlanıyor** (dosya) → **nerede test ediliyor** (test dosyası + test adı, `grep` ile doğrulanmış; tahmin yok) → durum (`Closed` / `Detectable` / `Open, bounded` / `Open`) + mainnet doğrulaması (☐). Ek tablo: guard kontrolleri G1–G13, P1–P6, S1–S7, H1–H3, R (rail) → §8 satırı → test. Guard README'deki "What each check closes" tablosu buraya taşınmaz, birleştirilir (guard README bu dosyaya link verir).

Faz 6 yapılmadığı için "nerede test ediliyor" sütunu mevcut testlerden; `test/attacks/*` (Faz 6.2) gelince her satır bir saldırı testine bağlanır.

## 4. Tx linkleri tablosu

README'de T1–T11b satırları: işlem, kim imzalar, WhatsOnChain'de ne görünür (FINAL-IDEA §7), txid (STATUS "Mainnet işlemleri"nden), mockchain kanıtı (hangi test bu işlemi kuruyor). txid sütunu boş kalır ve "pending mainnet run" yazar; D-P4b'de doldurulur.

## 5. Diğer track'lerden istenen (STATUS "Arayüz değişiklikleri"ne D → A/B/C/E satırı)

Her track'ten README için: (1) 5–8 satırlık bileşen paragrafı (İngilizce), (2) kendi Quick start komutu, (3) "real vs simulated" maddesi, (4) mainnet'te kurduğu T tiplerinin txid'leri (STATUS "Mainnet işlemleri"ne). Gelene kadar README mevcut app README'lerine link verir.

## 6. Video malzeme envanteri (iskelet)

FINAL-IDEA §11'in her sahnesi için: ne gösterilecek, kaynak (komut / sayfa / log), mockchain'de hazır mı, mainnet gerekli mi. Bu dosyada tutulur (§9).

## 7. Dosyalar

```
README.md                    (yeni içerik; şu an tek satır)
docs/THREAT-MODEL.md         (yeni)
apps/guard/README.md         (§8 tablosu yerine THREAT-MODEL'e link; G/P/S/H tablosu kalır)
plan/phases/D-P4.md          (bu dosya; §9 envanter, §10 Checkpoint)
plan/STATUS.md               (yalnız Track D bölümü ve D satırları)
```

## 8. Kabul (D-P4a)

README'deki her mockchain komutu bu ortamda koşturuldu ve sonucu yazıldı; THREAT-MODEL'deki her test adı repoda var (`grep`); kök `npm test` + typecheck temiz; diğer track'lere istek satırı STATUS'ta; S4 ve Faz 4 Checkpoint D-P4b'ye kalır.

## 9. Video malzeme envanteri (FINAL-IDEA §11; iskelet, D-P4a)

| Sahne | Ne gösterilecek | Kaynak | Mockchain'de hazır | Mainnet gerekli |
|---|---|---|---|---|
| 0:00–0:20 Problem | taahhüt gerektiren paketler, emanetli grup alımı | slayt/anlatım | — | hayır |
| 0:20–0:45 Havuz + vault | sağlayıcı BSV Desktop'tan havuz açıyor (onay pencereleri); sahip vault'u fonlayıp politika yazıyor | `npm run provider-cli -- open-pool`, `npm run owner -w @agentcoop/owner-cli -- create-vault/policy/fund`; web sağlayıcı/sahip konsolu | web mock turu (E P2) | **evet** (Desktop pencereleri) |
| 0:45–1:30 Ajanlar pledge veriyor; Rail; injection reddi | karar logları, ilerleme çubuğu, Base'den gelen ajan, guard DENY | `npm run demo:k1`, `npm run demo-injection -w @agentcoop/scripts`, `test/e2e.rail.mockchain.test.ts`, web Kasaba | evet (Rail yalnız offline) | evet (gerçek txid'ler) |
| 1:30–1:55 Lock-in ve tek settlement | imza turu logları (koordinatör JSON satırları), WhatsOnChain'de T5 | `npm run infra` logları, `GET /pools/:id/audit` | evet | **evet** (WhatsOnChain) |
| 1:55–2:25 Kredi harcama, 402, market | redeem + iş, liste + sweep | `npm run demo:k1` (iş), `test/e2e.market.mockchain.test.ts` | evet | evet |
| 2:25–2:45 Dolmayan havuz, sahip çekimi | bakiyeler değişmiyor; `owner withdraw` | `npm run demo:failed-pool`, owner-cli `withdraw` | evet | evet (Desktop) |
| 2:45–3:00 Rakamlar | katılımcı, işlem sayısı, ücret, emanette 0 sat | `GET /metrics`, B'nin ölçek tablosu (`apps/coordinator/README.md`) | evet (mockchain rakamları) | mainnet rakamları tercih |

## 10. Checkpoint (D-P4a, 30.10 ~21:30)

1. **Plan hâlâ iyi mi?** Evet. Faz 4 iki parçaya bölündü (D-P4a şimdi, D-P4b teslime 4 saat kala ya da 5/6/7 bitince); yürütme sırası kuralı değişmedi, Faz 4 yine son faz. STATUS "Plan değişiklikleri"ne yazıldı.
2. **Bu kısım bitti:** kök `README.md` (iskelet + değer notu + gereksinim tablosu + doğrulanmış Quick start + T1–T11b tablosu + real vs simulated + bileşenler + bilinen sınırlar), `docs/THREAT-MODEL.md` (17 + 2 tehdit, her biri enforcement dosyası + birebir test adı; ad ve yollar betikle doğrulandı), guard README → THREAT-MODEL linki, video envanteri (§9). Quick start komutları bu konteynerde koşturuldu: `npm test` 55/267 yeşil, `demo:k1`, `demo:failed-pool`, `demo-injection` (2 DENY + 1 ALLOW), `infra` (`/healthz` ok), `web:mock` (sayfa geldi).
3. **Diğer track'ler:** A P3 ✓ (`buildPledge('vault')` D'nin `pledgeFromVault`'una devrediyor), C P3 kısmi, E P2; B Faz 5/6 mockchain. README bileşen paragrafları STATUS'ta istendi (D → A/B/C/E).
4. **Sonraki fazın bağımlılıkları:** D-P4b: mainnet txid'leri (sats), `LICENSE` (insan, SETUP-ACCOUNTS #5), Axel'in cevapları, track paragrafları. Faz 5/6/7: S3 (A.P3 ✓; C.P3'ün vault'lu ajanı ve S3 senkronu bekleniyor).
5. **Arayüz değişikliği:** yok.
