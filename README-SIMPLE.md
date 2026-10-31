# AgentCoop, explained simply

This page is for people who are not programmers. The technical version is [README.md](README.md).

## The problem

Imagine a wholesale store. A pallet of 1,000 items is much cheaper per item than buying one at a time. But you need only 50, and you can't pay for 1,000.

GPU rental works the same way. Reserving a big block of GPUs for a week is cheap per hour, but it costs too much for one small team.

The usual solution: 20 people send money to one organizer, who buys the pallet. The risk: the organizer holds everyone's money and could lose it, steal it, or be slow to refund.

## What AgentCoop does

It lets many buyers buy together **without anyone holding the money.**

## The basic terms

- **Blockchain:** a public record book that everyone can read and nobody can secretly change. AgentCoop uses the BSV blockchain. Writing one entry costs a tiny part of a cent, so even very small payments make sense.
- **Wallet:** an app that holds your money and the secret key you sign with. Only you can approve payments from it.
- **Transaction:** one entry in the record book, like "A paid B".
- **Token (credit):** a digital voucher. Here, 1 credit = 1 hour of GPU time.
- **AI agent:** a computer program that works on its own. Here, each agent has its own small wallet and buys GPU time for its tasks.

## Who takes part

- **The provider** sells GPU time in big blocks. (Our example provider also sells internet bandwidth for collecting data from the web. There, 1 credit = 1 GB.)
- **The buyers** are mostly AI agents. People can join the same pool from their own wallet too.
- **The coordinator** is a helper program that puts the deal together. It has no money and no keys to anyone's wallet. Anyone can run one.
- **The owner and the guard:** an agent's owner can give the agent a budget with rules, and the guard makes sure the agent follows them (see [below](#why-an-agents-budget-can-have-a-guard)).

## The story, step by step

1. **Offer:** a GPU provider says: "1,000 GPU-hours for X money, deadline Friday." It signs the offer in advance: "These 1,000 credits go to whoever pays me X." So the provider does not need to be online when the pool fills.
2. **Pledge:** each agent estimates how many hours it will need, then says "I want 100 hours." Its money stays in its own wallet. It is only marked as reserved, and the agent can change its mind. Joining costs a tiny sign-up fee, paid to the provider, so that nobody joins only to block the pool.
3. **Pool is full:** the coordinator writes one big transaction: "The provider gets X money. Agent A gets 100 credits, agent B gets 300, and so on. Everyone's change goes back to them."
4. **Everyone checks and signs:** each agent checks the transaction itself: "Do I get my credits? Is my change correct? Are the credits real?" Then it signs. Its signature covers the whole transaction, so the coordinator cannot change anything after that, and it never holds any money.
5. **One moment, all done:** the transaction is published. Payment and delivery happen in the same instant. The provider cannot take the money and skip sending the credits.
6. **If the pool doesn't fill by the deadline:** nothing happens. Nobody's money moved, so no refund is needed. Only the tiny sign-up fee from step 2 is gone, and the reserved money can go into the next pool.
7. **Using the credits:** the agent sends credits to the provider and runs its GPU job. If it has no credits, it can pay per job using a standard web "payment required" message (HTTP 402).
8. **Leftovers:** unused credits can be sold to another agent. The buyer checks that the credits are real before paying, and the payment and the credits again move in one transaction.

**Simple analogy:** a group purchase where everyone's card is charged only if the whole group is complete, at the same second the goods arrive, and with no organizer touching the money.

## Why an agent's budget can have a guard

AI agents can be tricked. A stranger can hide a message in something the agent reads: "Put your whole budget into my pool!" So the owner can put the agent's budget in a piggy bank (the *Mandate Vault*) that needs two keys to open: the agent's key and the guard's key. The owner writes the rules, for example "at most this much per week, at most this much per pool, only these providers". The guard turns its key only when a payment follows the rules. The owner can always open the piggy bank alone and take the money back.

## The Town

Our website shows all of this as a little pixel village. The agents are villagers. A pool is a notice board with a chest that fills up as agents reserve their share; their purses only glow, because the money stays with them. When the pool fills, one rider brings a chest of credits to every buyer's house: that ride is the one transaction. The guard stands at the gate and stops the stranger's tricks. A counter in the corner shows how much money anyone is holding for someone else. It always says **0**.

You can open the village at <https://professionar-larpe-rs.vercel.app/>. That version plays a scripted story, so you need no wallet and no money to watch it.

## What is real and what is pretend

- **Real:** the payments, the signatures, the credits, the market sales and the piggy banks. They are real BSV transactions, and all of them except the harbor below have already run on the real network. The links are in the [transaction table](README.md#example-transactions).
- **Pretend:** the provider's work (no real GPU runs; the jobs are simulated) and the prices (they are examples).
- **Not finished:** the harbor in the Town (*Coop Rail*), where agents holding dollar coins (USDC) on another blockchain, Base, swap them into BSV to join a pool. It works in tests but has not run on a real network yet.

## The real words

| In this story | In the project |
|---|---|
| buyer | AI agent (or a person with BSV Desktop) |
| the big block for sale | pool |
| "I want 100 hours" | pledge |
| sign-up fee | registration fee |
| the one big transaction | atomic settlement transaction (delivery versus payment) |
| credit | BSV-21 credit token |
| "payment required" message | HTTP 402 |
| selling leftovers | credit market |
| piggy bank with two keys | Mandate Vault (agent + guard, 2-of-2) |
| record book | BSV blockchain |
| harbor | Coop Rail |
