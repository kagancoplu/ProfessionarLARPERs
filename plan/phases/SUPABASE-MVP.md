# Supabase canlı katmanı (demo MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Birden fazla tarayıcı aynı canlı Kasaba'yı Supabase üzerinden görsün (açılışta dolu, sayfa yenilenince geçmiş duruyor) ve avatar modunda birbirini görsün; protokol ve servisler değişmesin.

**Architecture:** Yeni `apps/relay` süreci (VPS'te `infra/run.mjs` altında) overlay SSE, guard/agents/maker SSE, koordinatör WS (izleyici) ve REST snapshot'larını okur; Postgres'teki `live_*` tablolarına ve `coop_events`'e yazar, değişiklikleri saniyede en fazla bir `live_ticks` satırı olarak ekler. Web, `VITE_TRANSPORT=supabase` iken açılışta tabloları okur, `live_ticks` INSERT'lerini Postgres Changes ile dinler ve gelenleri bugünkü `derive.ts` + store setter'larıyla uygular; koordinatör WS ve cüzdanlı akışlar doğrudan kalır. Kasaba çok oyunculu modu herkese açık `town:main` kanalında Presence + Broadcast ile, konum değil hedef göndererek çalışır.

**Tech Stack:** Supabase (Postgres + RLS, Realtime Postgres Changes / Presence / Broadcast, Supabase CLI 2.122 yerel yığın), `@supabase/supabase-js` 2.118.0, Node ≥ 22 + tsx, `ws` 8.22.0, vitest 4, React/Zustand/Phaser (mevcut web).

**Spec:** `plan/SUPABASE-FLOW.md` (bu plan onun F1 + F2'sinin demo kesitidir; aşağıdaki "MVP kararları" rapordan sapmaları sayar).

## MVP kararları (rapordan sapmalar)

- Canlı akış Broadcast yerine **`live_ticks` tablosu + Postgres Changes**: istemciler RLS yüzünden yazamaz, yani sahte tick yayınlanamaz; kanal yetkilendirmesi kurmaya gerek kalmaz. Maliyet aynı (abone başına bir mesaj).
- **Kimlik doğrulama yok** (Edge Function, anonim oturum, `user_records`, `inbox`, imzalı kayıtlar sonraya). Web publishable key ile okur; Kasaba kanalı herkese açık ve kozmetik.
- **Koordinatör WS web'de doğrudan kalır** (imza turu ve `settled` → `afterSettlement` için). Relay koordinatör olaylarını yalnızca `coop_events`'e geçmiş için yazar, tick'e koymaz (çift olay olmasın).
- **Türetilmiş olaylar** (`pool_opened`, `pledge_added`…) her tarayıcıda `derive.ts` ile üretilir, tabloya yazılmaz. Geçmişte havuz durumu tablolardan, ajan/guard/koordinatör olayları `coop_events`'ten gelir.

## Global Constraints

- Node ≥ 22. Bağımlılıklar tam sürümle sabitlenir: `@supabase/supabase-js` `2.118.0`, `ws` `8.22.0`.
- `SUPABASE_SECRET_KEY` (secret / service_role) yalnızca kök `.env`'de ve relay sürecinde; asla commit edilmez, loglanmaz, `VITE_*`'ye konmaz. Tarayıcı yalnızca `VITE_SUPABASE_PUBLISHABLE_KEY` görür.
- Her tabloda RLS açık; tek politika `select` (`anon`, `authenticated`). Yazma yalnız secret key ile.
- Overlay, koordinatör, guard, provider-api, ajanlar, core **değişmez**. Mock ve replay modları **değişmez**.
- `VITE_SUPABASE_URL` veya `VITE_SUPABASE_PUBLISHABLE_KEY` boşsa ya da `?transport=direct` verilmişse web bugünkü gibi davranır (taşıma `direct`).
- Relay saniyede en fazla bir tick yazar; değişiklik yoksa yazmaz; 15 sn'de bir `heartbeat` tick'i yazar; 10 dk'dan eski tick'leri siler.
- Kasaba: en fazla `8` oyuncu, hareket mesajı en sık `1500` ms'de bir, `4` px altı hareket gönderilmez.
- Commit protokolü (`CLAUDE.md`): her commit'ten önce `git pull --rebase --autostash`; çakışmada dur ve kullanıcıya sor; gelen commit'ler dokunduğun dosyaları değiştirdiyse `npm test` + `npm run typecheck`; dosyaları adıyla ekle (`git add -A` yok); `.env`, `data/`, anahtar asla; sonra push, reddedilirse baştan.

## Review Focus

1. **Relay yeniden başlarsa** ilk tick tüm havuzları yeniden gönderir; tarayıcılar aynı veriyi aldığında hiçbir türetilmiş olay (Kasaba animasyonu) üretmemeli → Task 5 "an identical tick publishes nothing".
2. **Supabase'e ulaşılamıyorsa** (yanlış URL, duraklatılmış ücretsiz proje) web 5 sn içinde `direct` taşımaya düşmeli → Task 6 "a failing snapshot rejects ready" + boot fallback.
3. **Snapshot yüklenirken gelen tick** kaybolmamalı ve snapshot'ın üstüne yazılmamalı → Task 6 "buffers ticks until the snapshot is applied".
4. **Geçici Supabase yazma hatası** değişiklikleri kaybetmemeli; bir sonraki flush'ta yeniden denenmeli → Task 2 "a failed sink write keeps the changes for the next flush".
5. **Aynı kimlik iki sekmede** Kasaba'da iki ayrı oyuncu olmalı, birinin kapanması diğerini silmemeli → Task 7 presence anahtarı `${identity}:${tabId}`, "peersFromPresence keeps two tabs of one identity apart".

---

### Task 0: Web build'ini açan eksik dosya

`apps/web/src/consoles/explorer/MainnetProof.tsx:2` `../../data/mainnet`'i import ediyor; dosya repoda yok ve kök `.gitignore:16 data/` onu yutuyor. Demo için web açılmalı.

**Files:**
- Create: `apps/web/src/proof/mainnet.ts`
- Modify: `apps/web/src/consoles/explorer/MainnetProof.tsx:2`

**Interfaces:**
- Produces: `export const MAINNET_TXS: ReadonlyArray<{ kind: string, what: string, via: string, txid: string }>`

- [ ] **Step 1:** `git pull --rebase --autostash`; bir takım arkadaşı dosyayı başka bir yolla eklediyse bu task'ı atla.
- [ ] **Step 2:** `apps/web/src/proof/mainnet.ts`'i kök `README.md` "Example transactions" tablosundaki mainnet txid'lerinden doldur (`kind` = `T1`…`T11`, `via` = `'BSV Desktop'` veya `'server wallet'`, `what` = tablodaki "What you see on chain" kısaltması). Import yolunu `../../proof/mainnet` yap.
- [ ] **Step 3:** Doğrula: `npm -w apps/web run typecheck` temiz, `npm run web:build` başarılı.
- [ ] **Step 4:** Commit: `git add apps/web/src/proof/mainnet.ts apps/web/src/consoles/explorer/MainnetProof.tsx` → `fix(web): mainnet proof data out of the git-ignored data/ folder`.

---

### Task 1: Supabase iskeleti, şema ve RLS

**Files:**
- Create: `supabase/config.toml` (`supabase init` üretir; `supabase/.gitignore` dahil)
- Create: `supabase/migrations/20261031120000_live_mirror.sql`
- Create: `apps/relay/package.json` (`apps/agents/package.json` düzeninde, `"version": "0.1.0"`; ayrı tsconfig yok, kök `tsconfig.json` `apps/*/src` ve `apps/*/test`'i zaten kapsıyor)
- Test: `apps/relay/test/schema.local.test.ts`

**Interfaces:**
- Produces: tablolar `live_pools`, `live_pledges`, `live_listings`, `live_vaults`, `live_agents`, `live_health`, `coop_events`, `live_ticks`; paket `@agentcoop/relay` (`"type": "module"`, `dependencies`: `@supabase/supabase-js` `2.118.0`, `ws` `8.22.0`; `exports`: `"./contract": "./src/contract.ts"`; script `start`: `tsx src/server.ts`).

- [ ] **Step 1: Migration'ı yaz** (`supabase/migrations/20261031120000_live_mirror.sql`):

```sql
create table live_pools    (pool_id text primary key, status text not null, data jsonb not null, updated_at timestamptz not null default now());
create table live_pledges  (outpoint text primary key, pool_id text not null, data jsonb not null, updated_at timestamptz not null default now());
create index on live_pledges (pool_id);
create table live_listings (outpoint text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table live_vaults   (vault_id text primary key, data jsonb not null, credits jsonb, updated_at timestamptz not null default now());
create table live_agents   (identity text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table live_health   (service text primary key, ok boolean not null, detail text, updated_at timestamptz not null default now());
create table coop_events   (uid text primary key, id text not null, ts timestamptz not null, src text not null, type text not null,
                            pool_id text, txid text, agent text, envelope jsonb not null);
create index on coop_events (ts desc);
create table live_ticks    (id bigint generated always as identity primary key, ts timestamptz not null default now(), tick jsonb not null);

do $$ declare t text; begin
  foreach t in array array['live_pools','live_pledges','live_listings','live_vaults','live_agents','live_health','coop_events','live_ticks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

alter publication supabase_realtime add table live_ticks;
```

- [ ] **Step 2: Yerel yığını kaldır:** `supabase init` (yoksa), `supabase start`, `supabase db reset`. `supabase status -o env`'deki API URL, anon/publishable ve service_role/secret değerlerini `SUPABASE_LOCAL_URL`, `SUPABASE_LOCAL_ANON_KEY`, `SUPABASE_LOCAL_SECRET_KEY` olarak export et (yalnız terminalde; dosyaya yazma).
- [ ] **Step 3: Testi yaz** (`describe.skipIf(process.env.SUPABASE_LOCAL_URL === undefined)`; kök `npm test`'te Docker yoksa atlanır):

```ts
it('anon reads every live table', async () => {
  for (const t of ['live_pools','live_pledges','live_listings','live_vaults','live_agents','live_health','coop_events','live_ticks'])
    expect((await anon.from(t).select('*').limit(1)).error).toBeNull()
})
it('anon cannot write; the secret key can', async () => {
  expect((await anon.from('live_pools').insert({ pool_id: 'x_0', status: 'open', data: {} })).error).not.toBeNull()
  expect((await secret.from('live_pools').upsert({ pool_id: 'x_0', status: 'open', data: {} })).error).toBeNull()
  await secret.from('live_pools').delete().eq('pool_id', 'x_0')
})
```

- [ ] **Step 4:** Çalıştır: `SUPABASE_LOCAL_URL=… npx vitest run apps/relay/test/schema.local.test.ts` → PASS. Docker'sız `npx vitest run apps/relay/test/schema.local.test.ts` → skipped.
- [ ] **Step 5:** Kökte `npx npm@11 install` (yeni workspace + bağımlılık), `npm run typecheck` temiz.
- [ ] **Step 6:** Commit: `supabase/config.toml supabase/.gitignore supabase/migrations/20261031120000_live_mirror.sql apps/relay/package.json apps/relay/test/schema.local.test.ts package-lock.json` → `feat(relay): supabase schema for the live mirror, read-only RLS`.

---

### Task 2: Relay çekirdeği (Mirror: snapshot → satır + tick)

**Files:**
- Create: `apps/relay/src/contract.ts`, `apps/relay/src/sink.ts`, `apps/relay/src/mirror.ts`
- Test: `apps/relay/test/mirror.test.ts`

**Interfaces:**
- Produces (`contract.ts`, tarayıcı-güvenli, yalnız tip + sabit):
  - `type Json = Record<string, unknown>`
  - `interface CoopEnvelope { id: string, ts: string, src: string, type: string, data: unknown, txid?: string, poolId?: string, agent?: string }`
  - `interface VaultOutput { tokenId: string, amt: string, sym?: string, spent?: boolean }`
  - `interface HealthRow { service: string, ok: boolean, detail?: string }`
  - `interface LiveTick { v: 1, ts: string, heartbeat?: true, pools?: Json[], pledges?: Record<string, Json[]>, listings?: Json[], vaults?: Json[], vaultCredits?: Record<string, VaultOutput[]>, agents?: Json[], health?: HealthRow[], events?: CoopEnvelope[] }`
  - `const TABLES = { pools: 'live_pools', pledges: 'live_pledges', listings: 'live_listings', vaults: 'live_vaults', agents: 'live_agents', health: 'live_health', events: 'coop_events', ticks: 'live_ticks' } as const`
- Produces (`sink.ts`): `interface Sink { upsert (table: string, rows: Json[]): Promise<void>; deleteListingsExcept (outpoints: string[]): Promise<void>; insertEvents (events: CoopEnvelope[]): Promise<void>; publishTick (tick: LiveTick): Promise<void>; pruneTicks (olderThanMs: number): Promise<void> }`
- Produces (`mirror.ts`): `class Mirror` — `constructor (sink: Sink, now?: () => Date)`; `setPools (pools: Array<Json & { poolId: string, status: string, pledges?: Json[] }>): void`; `setListings (listings: Array<Json & { outpoint: string }>): void`; `setVaults (vaults: Array<Json & { vaultId: string, scriptHex: string }>): void`; `setVaultCredits (vaultId: string, outputs: VaultOutput[]): void`; `setAgents (agents: Array<Json & { identity: string }>): void`; `setHealth (row: HealthRow): void`; `pushEvent (e: CoopEnvelope, opts?: { live?: boolean }): void`; `flush (): Promise<LiveTick | undefined>`; `heartbeat (): Promise<void>`.

Davranış: her setter varlık başına `JSON.stringify` parmak izini son yazılanla karşılaştırır, yalnız değişenleri bekleyen kümeye alır. `flush` bekleyenleri satırlara çevirir (`live_pools { pool_id, status, data }` — `data` `pledges` alanı çıkarılmış havuz; `live_pledges { outpoint, pool_id, data }`; …), upsert eder, listeler değiştiyse `deleteListingsExcept`, olayları `insertEvents` (`uid = ${src}|${id}|${ts}`), sonra tek `publishTick`. Tick'te `pools` yalnız değişen havuzlar, `pledges` yalnız değişen havuzların tam pledge listesi, `listings` değiştiyse tam liste, `events` yalnız `live !== false` olanlar. Bir yazma atarsa bekleyen küme korunur, parmak izleri güncellenmez.

- [ ] **Step 1: Testleri yaz** (sahte `Sink` çağrıları kaydeder):

```ts
it('first setPools emits all pools and their pledges; an identical second snapshot emits nothing')
  // setPools([P('a_0','open',[pl('x_1')]), P('b_0','open',[])]); tick.pools.length === 2; tick.pledges['a_0'].length === 1
  // aynı girdiyle ikinci flush → undefined, sink.publishTick çağrı sayısı 1
it('a changed pool emits only that pool and its pledges')
  // b_0 pledgedCredits değişir → tick.pools.map(p => p.poolId) eql ['b_0']; tick.pledges anahtarları ['b_0']
it('listings: a missing listing is deleted from the table and the full list goes in the tick')
  // [L1,L2] sonra [L2] → deleteListingsExcept(['L2']); tick.listings.length === 1
it('events: live events go to the tick and the table; coordinator events only to the table')
  // pushEvent(g1); pushEvent(c1, { live: false }) → insertEvents iki olay; tick.events eql [g1]
it('flush with nothing changed publishes no tick; heartbeat publishes { heartbeat: true }')
it('a failed sink write keeps the changes for the next flush')
  // ilk upsert reject → flush rejects; ikinci flush aynı havuzu yeniden yazar ve tick'e koyar
```

- [ ] **Step 2:** `npx vitest run apps/relay/test/mirror.test.ts` → FAIL (`Mirror` yok).
- [ ] **Step 3:** `contract.ts`, `sink.ts`, `mirror.ts`'i yukarıdaki imzalarla yaz.
- [ ] **Step 4:** Aynı komut → PASS; `npm run typecheck` temiz.
- [ ] **Step 5:** Commit: `apps/relay/src/contract.ts apps/relay/src/sink.ts apps/relay/src/mirror.ts apps/relay/test/mirror.test.ts` → `feat(relay): mirror diffs service snapshots into rows and one tick`.

---

### Task 3: Relay kaynakları ve süreç

**Files:**
- Create: `apps/relay/src/config.ts`, `apps/relay/src/sse.ts`, `apps/relay/src/sources.ts`, `apps/relay/src/coordinator.ts`
- Test: `apps/relay/test/sse.test.ts`, `apps/relay/test/config.test.ts`

**Interfaces:**
- Consumes: `Mirror`, `HealthRow` (Task 2).
- Produces:
  - `interface RelayConfig { supabaseUrl: string, supabaseSecretKey: string, urls: { coop: string, overlay: string, guard: string, agents: string, maker: string, provider: string, arcade: string } }`; `loadConfig (env: NodeJS.ProcessEnv): RelayConfig` — `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` yoksa değişken adını söyleyen hata (değeri asla yazmaz); URL'ler `COOP_API_URL`, `OVERLAY_URL`, `GUARD_URL`, `AGENTS_URL`, `MAKER_URL`, `PROVIDER_API_URL`, `ARCADE_URL`, varsayılanlar `.env.example`'daki değerler.
  - `followSse (url: string, onEvent: (data: string, id: string) => void, opts?: { fetchImpl?: typeof fetch, minBackoffMs?: number, maxBackoffMs?: number }): { close (): void }` — `fetch` + `ReadableStream` ile `id:`/`data:` çerçevelerini parçalar arasında birleştirir, `:` ile başlayan satırları yok sayar, kopunca 1→30 sn backoff ile yeniden bağlanır ve son id'yi `Last-Event-ID` başlığıyla gönderir.
  - `sources.ts`: `poolsWithPledges (coop)` → `GET {coop}/pools?pledges=1`; `listings (coop)` → `GET {coop}/listings`; `vaults (overlay)` → `POST {overlay}/lookup { service: 'ls_agentcoop', query: { op: 'vaults' } }`; `vaultCredits (overlay, scriptHex)` → `{ op: 'vaultCredits', vaultHash: sha256hex(script) }` (`node:crypto`); `agents (agentsUrl)` → `GET /agents`; `probe (name, url): Promise<HealthRow>` → web'deki `events/health.ts` ile aynı uçlar (`/healthz`, overlay `/agentcoop/healthz`, arcade `/chaintracks/v2/height`), 4 sn zaman aşımı; `name` web'in `ServiceName` değerlerinden biri (`coop`, `overlay`, `provider`, `guard`, `agents`, `arcade`, `maker`), böylece web onları doğrudan `service_health`'e çevirir. Lookup cevabının `context` çözümü web'in `apps/web/src/api/overlay.ts`'iyle aynı.
  - `watchCoordinator (wsUrl: string, onMessage: (msg: Json) => void): { close (): void }` — `ws` ile bağlanır, `challenge` gelince `{ type: 'hello', poolIds: [] }` gönderir (imzasız: izleyici), kopunca 2→30 sn yeniden bağlanır.
- `server.ts` (Task 4'te yazılır, `createSupabaseSink`'e ihtiyacı var) bu parçaları şöyle bağlar: overlay SSE → 300 ms debounce → `poolsWithPledges` + `listings` + `vaults` (+ her vault için `vaultCredits`) → `Mirror` setter'ları; overlay ham olayı `pushEvent({ id: 'overlay:<type>:<txid>', src: 'overlay', type, data: { txid }, txid, ts })`; guard/agents/maker SSE → zarf olduğu gibi `pushEvent`; koordinatör mesajı → `pushEvent({ id: 'coordinator:<type>:<poolId>:<round|txid>', src: 'coordinator', … }, { live: false })`; zamanlayıcılar: uzlaştırma 30 sn (aynı yenileme), `agents` 30 sn, `probe` 15 sn, `flush` 1 sn, `heartbeat` 15 sn, `pruneTicks(600_000)` 60 sn; `SIGTERM`'de her şeyi kapatıp son bir `flush`.

- [ ] **Step 1: Testleri yaz:**

```ts
// sse.test.ts (sahte fetch, ReadableStream parçaları)
it('joins id/data frames split across chunks and ignores keepalive comments')
  // parçalar: 'id: g:1\nda', 'ta: {"a":1}\n\n: keepalive\n\n' → onEvent('{"a":1}', 'g:1') bir kez
it('reconnects after the stream ends and sends Last-Event-ID')
  // ikinci fetch çağrısının headers['Last-Event-ID'] === 'g:1'
// config.test.ts
it('requires SUPABASE_URL and SUPABASE_SECRET_KEY and names the missing one without printing values')
it('defaults the service URLs to the .env.example values')
  // urls.coop === 'http://localhost:8090', urls.overlay === 'http://localhost:8080'
```

- [ ] **Step 2:** `npx vitest run apps/relay/test/sse.test.ts apps/relay/test/config.test.ts` → FAIL.
- [ ] **Step 3:** Dosyaları yukarıdaki imzalarla yaz.
- [ ] **Step 4:** Aynı komut → PASS; `npm run typecheck` temiz.
- [ ] **Step 5:** Commit: `apps/relay/src/config.ts apps/relay/src/sse.ts apps/relay/src/sources.ts apps/relay/src/coordinator.ts apps/relay/test/sse.test.ts apps/relay/test/config.test.ts` → `feat(relay): service sources (SSE, REST, coordinator watcher) and config`.

---

### Task 4: Supabase sink, infra ve uçtan uca yerel test

**Files:**
- Create: `apps/relay/src/supabaseSink.ts`, `apps/relay/src/server.ts` (Task 3'teki bağlantı listesi), `apps/relay/README.md`
- Modify: `infra/run.mjs` (servis listesi), `.env.example`
- Test: `apps/relay/test/sink.local.test.ts`

**Interfaces:**
- Consumes: `Sink`, `LiveTick`, `TABLES`, `Mirror` (Task 2); `loadConfig`, `followSse`, `sources`, `watchCoordinator` (Task 3).
- Produces: `createSupabaseSink (url: string, secretKey: string): Sink` — `createClient(url, secretKey, { auth: { persistSession: false } })`; `upsert` → `from(table).upsert(rows)`; `deleteListingsExcept` → `delete().not('outpoint', 'in', …)` (boş listede tümünü sil); `insertEvents` → `upsert(…, { onConflict: 'uid', ignoreDuplicates: true })`; `publishTick` → `from('live_ticks').insert({ tick })`; `pruneTicks` → `delete().lt('ts', …)`. Her `error` fırlatılır (Mirror yeniden dener).

- [ ] **Step 1: Testi yaz** (`skipIf(SUPABASE_LOCAL_URL === undefined)`):

```ts
it('a tick published by the sink reaches an anon Postgres Changes subscriber', async () => {
  // anon client: channel('t').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_ticks' }, p => got.push(p.new.tick)).subscribe()
  // SUBSCRIBED bekle → sink.publishTick({ v: 1, ts, heartbeat: true }) → 5 sn içinde got[0].heartbeat === true
})
it('anon cannot insert a tick (RLS)')
it('deleteListingsExcept keeps only the given outpoints')
```

- [ ] **Step 2:** Yerel yığınla → FAIL (`createSupabaseSink` yok); yaz; → PASS.
- [ ] **Step 3:** `infra/run.mjs`: `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` doluysa `services`'e `{ name: 'relay', cwd: join(root, 'apps/relay'), env: { COOP_API_URL: http://localhost:${coopPort}, OVERLAY_URL: http://localhost:${overlayPort} } }` ekle (giriş `src/server.ts`, mevcut başlatma komutu aynen çalışır); başlangıç satırına `, relay` ekle; boşsa hiçbir şey değişmez.
- [ ] **Step 4:** `.env.example`'a yorumlarıyla ekle: `SUPABASE_URL=`, `SUPABASE_SECRET_KEY=` ("secret: only here and in the relay; never commit, never in VITE_*"), `VITE_SUPABASE_URL=`, `VITE_SUPABASE_PUBLISHABLE_KEY=` ("public; RLS protects the tables"), `VITE_TRANSPORT=` ("supabase | direct; empty = supabase when the two above are set").
- [ ] **Step 5:** Elle doğrula: yerel yığın + `npm run infra` (mock chain'de değil, gerçek servisler yerelde) → `[relay] started`; Supabase Studio'da (`http://localhost:54323`) `live_pools` doluyor, `live_ticks` her değişiklikte bir satır, sessizken 15 sn'de bir heartbeat.
- [ ] **Step 6:** `apps/relay/README.md`: ne yaptığı, env değişkenleri, yerel yığın komutları, gerçek projeye `supabase link --project-ref <ref>` + `supabase db push`, güvenlik notu (secret key).
- [ ] **Step 7:** Commit: `apps/relay/src/supabaseSink.ts apps/relay/src/server.ts apps/relay/test/sink.local.test.ts apps/relay/README.md infra/run.mjs .env.example` → `feat(relay): supabase sink and process, started by infra when SUPABASE_* is set`.

---

### Task 5: Web — taşıma seçimi ve tick uygulama

**Files:**
- Modify: `apps/web/src/env.ts` (`RawEnv`, `AppEnv`, `resolveEnv`), `apps/web/package.json` (`@supabase/supabase-js` `2.118.0`, `@agentcoop/relay` `0.1.0`)
- Create: `apps/web/src/events/adapters/supabaseApply.ts`
- Test: `apps/web/test/supabaseApply.test.ts`, `apps/web/test/env.test.ts` (ekleme)

**Interfaces:**
- Consumes: `LiveTick`, `CoopEnvelope`, `VaultOutput`, `HealthRow` (`@agentcoop/relay/contract`, yalnız `import type`); `derivePoolDiff`, `derivePledgeDiff`, `deriveListingDiff` (`events/derive.ts`); `summariseCredits` (`events/livePoll.ts`); store setter'ları.
- Produces:
  - `AppEnv` ekleri: `transport: 'supabase' | 'direct'`, `supabase?: { url: string, key: string }`. Kural: `?transport=direct` → direct; `VITE_TRANSPORT=direct` → direct; URL ve key doluysa → supabase; değilse direct.
  - `interface LiveSnapshot { pools: ApiPool[], pledges: Record<string, PledgeView[]>, listings: Listing[], vaults: VaultView[], vaultCredits: Record<string, VaultOutput[]>, agents: AgentInfo[], health: HealthRow[] }`
  - `applyTick (bus: EventBus, store: AppStoreApi, tick: LiveTick): void` — sırayla: `pools` → `derivePoolDiff` olaylarını yayınla + `hydratePools`; `pledges` → havuz başına `derivePledgeDiff` + `setPledges`; `listings` → `deriveListingDiff` + `hydrateListings`; `vaults` → `hydrateVaults`; `vaultCredits` → `summariseCredits`, store'dakinden farklıysa `makeEvent('overlay', 'vault_credits', { vaultId, credits })`; `agents` → `hydrateAgents`; `health` → değişen her servis için `service_health` (`relay` servis adı store'da yoksa yok sayılır); `events` → her biri `bus.publish`.
  - `applySnapshot (bus: EventBus, store: AppStoreApi, snap: LiveSnapshot): void` — `applyTick`'i `{ v: 1, ts: now, ...snap }` ile çağırır (boş store'da animasyonsuz açılış için Kasaba'nın bugünkü hydrate davranışı yeterli).
  - `hydrateHistory (store: AppStoreApi, events: CoopEvent[]): void` — eskiden yeniye `store.getState().applyEvent(e)`; bus dinleyicileri (Kasaba fx, ses) çalışmaz.

- [ ] **Step 1: Testleri yaz** (mevcut `livePoll.test.ts` kalıbında: `createAppStore('live', undefined, { ...DEFAULT_SETTINGS })`, `createBus`):

```ts
it('a tick with a new pool publishes pool_opened and pledge_added, then hydrates the store')
it('an identical tick publishes nothing')                       // Review Focus 1
it('listings in a tick replace the book and publish listing_added / listing_filled')
it('vaultCredits publish vault_credits only when the summary changed')
it('events in a tick go through the bus once (deduped by src|id)')
it('health rows become service_health events only on change')
it('hydrateHistory fills the feed without calling bus listeners')
// env.test.ts
it('picks supabase when VITE_SUPABASE_URL and the publishable key are set, direct otherwise or with ?transport=direct')
```

- [ ] **Step 2:** `npm -w apps/web test -- supabaseApply env` → FAIL.
- [ ] **Step 3:** Yaz. Kökte `npx npm@11 install`.
- [ ] **Step 4:** → PASS; `npm -w apps/web run typecheck` temiz.
- [ ] **Step 5:** Commit: `apps/web/src/env.ts apps/web/src/events/adapters/supabaseApply.ts apps/web/test/supabaseApply.test.ts apps/web/test/env.test.ts apps/web/package.json package-lock.json` → `feat(web): apply relay ticks with the existing derive and hydrate path`.

---

### Task 6: Web — Supabase canlı adaptörü ve boot

**Files:**
- Create: `apps/web/src/api/supabase.ts`, `apps/web/src/events/adapters/supabaseLive.ts`
- Modify: `apps/web/src/boot.ts:78-104` (canlı dal)
- Test: `apps/web/test/supabaseLive.test.ts`

**Interfaces:**
- Consumes: `applyTick`, `applySnapshot`, `hydrateHistory`, `LiveSnapshot` (Task 5); `env.supabase`, `env.transport`.
- Produces:
  - `interface LiveClient { snapshot (): Promise<LiveSnapshot>; history (limit: number): Promise<CoopEvent[]>; subscribeTicks (onTick: (t: LiveTick) => void, onStatus: (ok: boolean, detail?: string) => void): () => void }`
  - `getSupabase (): Promise<SupabaseClient | undefined>` (tek örnek; `env.transport !== 'supabase'` ise `undefined`; supabase-js dinamik `import()` ile tembel yüklenir, mock/replay paketine girmez); `createLiveClient (sb: SupabaseClient): LiveClient` — `snapshot` tabloları paralel okur (`live_pools.data`, `live_pledges` → `pool_id`'ye göre grupla, `live_listings.data`, `live_vaults.data` + `credits`, `live_agents.data`, `live_health`); `history` → `coop_events.envelope` `order('ts', desc).limit(limit)` ters çevrilmiş; `subscribeTicks` → `channel('live-ticks').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_ticks' }, p => onTick(p.new.tick))`.
  - `startSupabaseLive (opts: { client: LiveClient, bus: EventBus, store: AppStoreApi, onStatus?: (ok: boolean, detail?: string) => void, onStale: () => void, staleMs?: number, snapshotTimeoutMs?: number }): { close (): void, ready: Promise<void> }` — önce abone olur ve gelen tick'leri tamponlar; sonra `history(200)` → `hydrateHistory`, `snapshot()` → `applySnapshot`, sonra tamponu sırayla `applyTick`; `snapshot` `snapshotTimeoutMs` (varsayılan 5000) içinde bitmezse ya da atarsa `ready` reddedilir; `staleMs` (varsayılan 45000) boyunca hiç tick (heartbeat dahil) gelmezse `onStale()` bir kez.
- `boot.ts` canlı dalı: mevcut overlay SSE + `startEnvelopeSse` ×3 + `startLivePolling` + `startHealthPolling` bloğunu yerel `startDirect(): void`'e taşı. Koordinatör WS ve `createLiveFlows` her iki taşımada aynen. `env.transport === 'supabase'` ise `startSupabaseLive(...)`; `ready` reddedilirse veya `onStale` gelirse onu kapat, `startDirect()` çağır ve `service_health` ile `detail: 'supabase unavailable, direct'` yayınla. `direct`'te bugünkü davranış birebir.

- [ ] **Step 1: Testleri yaz** (sahte `LiveClient`, `vi.useFakeTimers()`):

```ts
it('buffers ticks until the snapshot is applied, then applies them in order')   // Review Focus 3
  // snapshot çözülmeden tick(pool b_0) gelir → snapshot(pool a_0) → store.pools.order eql ['a_0','b_0']
it('a failing snapshot rejects ready')                                           // Review Focus 2
it('a snapshot slower than snapshotTimeoutMs rejects ready')
it('calls onStale once after staleMs without ticks; a heartbeat resets the timer')
it('hydrates the last 200 events from history before the snapshot')
```

- [ ] **Step 2:** `npm -w apps/web test -- supabaseLive` → FAIL. Yaz. → PASS.
- [ ] **Step 3:** `npm -w apps/web test` (tümü) ve `npm -w apps/web run typecheck` yeşil; Playwright mock e2e değişmeden geçer: `npm -w apps/web run test:e2e`.
- [ ] **Step 4: Elle doğrula** (Task 4 yerel yığın + `npm run infra` + ajanlar/servisler): `VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… PORT=5178 npm run web` → Kasaba ilk karede havuzlarla dolu; Network'te `/api/overlay/agentcoop/events`, `/api/guard/events`, `/api/agents/events` isteği yok, `wss://…/realtime` var; ikinci tarayıcıda aynı pledge < 1 sn'de görünür; sayfa yenilenince akış (feed) dolu gelir; relay durdurulunca ≤ 45 sn'de rozet `direct`'e döner ve Kasaba güncellenmeye devam eder.
- [ ] **Step 5:** Commit: `apps/web/src/api/supabase.ts apps/web/src/events/adapters/supabaseLive.ts apps/web/src/boot.ts apps/web/test/supabaseLive.test.ts` → `feat(web): live mode over Supabase with a direct fallback`.

---

### Task 7: Kasaba çok oyunculu (P7, hedef tabanlı)

**Files:**
- Create: `apps/web/src/town/peers.ts` (saf mantık), `apps/web/src/town/multiplayer.ts` (kanal + Phaser bağlantısı)
- Modify: `apps/web/src/town/scenes/TownScene.ts` (`removeVillager`; `create()`'te `attachBridge`'in yanında `attachMultiplayer`)
- Test: `apps/web/test/peers.test.ts`

**Interfaces:**
- Consumes: `getSupabase` (Task 6); `TownScene.addVillager(identity, 'visitor', name)`, `Villager.walkTo(x, y)`, `TownScene.avatar?.villager`, `store.settings.avatar`, `store.me.identityKey`, `store.agents.byIdentity`.
- Produces:
  - `peers.ts`: `const TOWN_CHANNEL = 'town:main'`, `MAX_PLAYERS = 8`, `MOVE_EVERY_MS = 1500`, `MIN_MOVE_PX = 4`; `class MoveThrottle { next (now: number, pos: { x: number, y: number }, moving: boolean): { x: number, y: number, stop: boolean } | undefined }`; `interface PeerMeta { name: string, at?: [number, number] }`; `peersFromPresence (state: Record<string, PeerMeta[]>, selfKey: string): Array<{ key: string, name: string, at?: [number, number] }>` (kendini çıkarır, anahtar başına son meta, anahtara göre sıralı); `canJoin (peerCount: number): boolean` (`peerCount < MAX_PLAYERS`).
  - `TownScene.removeVillager (identity: string): void` — villager'ı yok eder, `villagers`'tan siler, ev sahipliği varsa boşaltır.
  - `attachMultiplayer (town: TownScene, store: AppStoreApi): () => void` — yalnız `settings.avatar` açıkken ve Supabase varken kanala katılır (ayar kapanınca ayrılır). Presence anahtarı `${me.identityKey ?? 'guest'}:${tabId}` (`tabId` = sessionStorage'da 8 hex). Ad: ajan listesindeki ad, yoksa `short(identity)`, misafirde `Visitor ${tabId.slice(0, 4)}`. Katılırken `peersFromPresence` sayısı `canJoin` değilse yalnız izler (track etmez, broadcast etmez, bir kez toast: "Town is full: watching"). Her `update` karesinde `MoveThrottle.next(now, avatar.villager, moving)` sonucu varsa `send({ type: 'broadcast', event: 'move', payload: { key, to: [x, y], stop } })`; `stop` olduğunda `track({ name, at })`. Gelen `move` → `town.addVillager('peer:' + key, 'visitor', name).walkTo(x, y)`; presence `sync` → eksikleri ekle (varsa `at`'e yerleştir), gidenleri `removeVillager('peer:' + key)`.

- [ ] **Step 1: Testleri yaz:**

```ts
it('emits at most once per 1500 ms while moving and once on stop')
  // t=0 (0,0)→ emit; t=500 (20,0) → undefined; t=1500 (40,0) → emit; t=1600 moving=false → { stop: true }; t=1700 → undefined
it('does not emit moves under 4 px')
it('peersFromPresence drops self and takes the latest meta per key')
it('peersFromPresence keeps two tabs of one identity apart')                     // Review Focus 5
  // anahtarlar '02ab:1111' ve '02ab:2222' → iki peer
it('canJoin refuses the ninth player')                                           // canJoin(8) === false, canJoin(7) === true
```

- [ ] **Step 2:** `npm -w apps/web test -- peers` → FAIL. `peers.ts`'i yaz → PASS.
- [ ] **Step 3:** `removeVillager`, `multiplayer.ts` ve `TownScene.create()` bağlantısını yaz (sahne kapanırken `attachMultiplayer`'ın döndürdüğü temizleyici `teardown`'da çağrılır).
- [ ] **Step 4:** `npm -w apps/web test`, `npm -w apps/web run typecheck`, `npm -w apps/web run test:e2e` (mock'ta Supabase yok → multiplayer devre dışı, `avatar.spec.ts` değişmeden geçer).
- [ ] **Step 5: Elle doğrula:** iki tarayıcı (biri gizli pencere) `?avatar=1` → her biri ötekini görür ve yürüyüşünü ≤ 2 sn gecikmeyle izler; bir sekme kapanınca villager ≤ 30 sn'de kaybolur; Supabase panelinde Realtime mesaj hızı iki oyuncuda saniyede < 5.
- [ ] **Step 6:** Commit: `apps/web/src/town/peers.ts apps/web/src/town/multiplayer.ts apps/web/src/town/scenes/TownScene.ts apps/web/test/peers.test.ts` → `feat(web): multiplayer town over Supabase presence, destinations not positions`.

---

### Task 8: Gerçek proje, demo provası, STATUS

**Files:**
- Modify: `plan/STATUS.md` (yalnız ilgili bölümler), `plan/SUPABASE-FLOW.md` (başa "MVP: plan/phases/SUPABASE-MVP.md" satırı), `apps/web/README.md` ("Live over Supabase" paragrafı), `apps/relay/README.md` (demo adımları)

- [ ] **Step 1: Gerçek proje (insan):** Supabase'de proje (Free, bölge Frankfurt) → `supabase link --project-ref <ref>` → `supabase db push`. Panelden URL, publishable key, secret key → kök `.env`'e `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (secret key hiçbir yere yapıştırılmaz: sohbet, log, ekran görüntüsü yok).
- [ ] **Step 2: Demo provası:** `npm run infra` (relay dahil), servisler ve ajanlar (`npm run agents` vb.), `npm run web` → iki makine/tarayıcı: (a) ajan pledge'i iki ekranda aynı anda, (b) sayfa yenile → Kasaba ve akış dolu, (c) `?avatar=1` iki oyuncu, (d) relay'i durdur → web `direct`'e düşer, protokol çalışmaya devam eder (non-custodial vurgu: Supabase yalnız görünüm katmanı).
- [ ] **Step 3: Tam doğrulama:** `npm test`, `npm run typecheck`, `npm run web:test`, `npm -w apps/web run typecheck`, `npm run web:build` yeşil. Kırmızı varsa çıktısıyla raporla, gizleme.
- [ ] **Step 4: STATUS:** "Arayüz değişiklikleri"ne bir satır (yeni opsiyonel `apps/relay`, `SUPABASE_*` / `VITE_SUPABASE_*` / `VITE_TRANSPORT`, web canlı modunda Supabase taşıması, diğer track'lerde değişiklik yok); "Plan değişiklikleri"ne P7'nin Supabase ile yapıldığı.
- [ ] **Step 5:** Commit + push (Global Constraints'teki protokol): `plan/STATUS.md plan/SUPABASE-FLOW.md plan/phases/SUPABASE-MVP.md apps/web/README.md apps/relay/README.md` → `docs: supabase live layer MVP, demo steps, STATUS`.

---

## Sonraya kalanlar (MVP dışı, rapor §12)

BSV kimliğiyle giriş (`bsv-auth` Edge Function, `app_metadata.identity_key`), imzalı `identities` / `services`, şifreli `user_records` (web + CLI), `inbox` + bildirimler, `rounds` tur ilerlemesi, `handoffs`, `provider_stats` ve diğer view'lar, pg_cron temizliği, niyet defteri. Türetilmiş olayların kalıcı olması için `derive.ts` + `CoopEvent` tiplerinin `packages/events`'e taşınması.
