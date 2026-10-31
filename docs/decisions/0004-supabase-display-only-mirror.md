# 0004: Supabase as a display-only mirror

**Status:** accepted, implemented (`apps/relay`, `supabase/migrations/`, the web's Supabase transport), 31 October 2026.
**Sources:** [SUPABASE-FLOW.md](../archive/hackathon-2026/plan/SUPABASE-FLOW.md) §2–§3 (Turkish), [SUPABASE-MVP.md](../archive/hackathon-2026/plan/phases/SUPABASE-MVP.md), [HANDOFF.md](../archive/hackathon-2026/plan/HANDOFF.md) §4.

## Context

In live mode every browser opened its own streams and polls to the overlay, coordinator, guard, agents and maker; a reload lost the event history, and a multiplayer Town needed shared presence. The team wanted a hosted real-time layer on a free plan. Firebase was considered first and dropped because it required a payment card.

## Decision

One relay process (`apps/relay`) subscribes to the services and writes a snapshot plus a change feed into Supabase Postgres. Browsers read it with the anon key over Realtime. Supabase carries no value and decides nothing:

1. No key, seed or wallet secret goes to Supabase; only the relay holds the secret key. Tables are select-only for browsers (RLS).
2. The chain and the overlay stay the source of truth. Every check before a signature is made without Supabase, and a payment flow re-reads its terms from the coordinator.
3. The protocol works without it: the web falls back to direct streams, and CLIs and agents never use it.
4. Security-critical state (guard caps and decision log, the provider's balances and replay stores) stays inside its own service.

## Alternatives considered

| | Relay mirror (chosen) | Services write to Supabase directly | Supabase as the protocol bus |
|---|---|---|---|
| Service code | unchanged | every service changes | coordinator and all clients rewritten |
| Secret key | relay only | every process | everywhere |
| Decentralisation | an optional view | Supabase becomes a dependency | Supabase becomes part of the protocol; "anyone can run a coordinator" weakens |
| Realtime quota | relay batches to ≤ 1 tick/s | each service publishes | signing rounds use the quota too |

BSV's MessageBox (BRC-33) was noted as a better fit for identity-addressed messages to offline recipients, but not for presence, multiplayer movement or queryable state.

## Consequences

- A tampered or stale mirror can mislead what a viewer sees, but cannot redirect a payment (T-22). A review found and fixed one place where it could (the pledge fee script was read from the store, `cffaaee`).
- The mirror can lag; the web shows when it falls back to direct streams.
