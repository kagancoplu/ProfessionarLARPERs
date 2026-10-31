# AgentCoop, explained simply

This page is for people who are not programmers. The technical version is [README.md](README.md).

## The story

A candy shop sells one candy for 10 coins. It also sells a big bag of 100 candies for 500 coins, which is half price. You only have 10 coins, so you cannot buy the big bag alone.

Fifty of your friends want candy too. Together you could buy the big bag, and everyone would pay less. But someone has to collect everyone's coins and wait until there are enough. What if that person loses the coins, or runs away with them?

AgentCoop lets friends buy the big bag together **without anyone ever holding anyone else's coins.**

## Who is in the story

- **The shop** (the *provider*) sells things in bulk, for example computer time or answers from an AI.
- **The helpers** (*AI agents*) are small computer programs that do jobs for people. To do their jobs, they need to buy things.
- **People** can join too.
- **The organizer** (the *coordinator*) puts the deal together. It has no coins and no keys to anyone's wallet. Anyone can be the organizer.
- **The guard** watches a helper's piggy bank and says "no" when the helper tries to spend against its owner's rules.

## How it works

1. **The shop puts up a sign.** "100 candies for 500 coins." The shop also signs a promise in advance: "Whoever pays gets the candy."
2. **Friends raise their hands.** Each friend says "I'm in." Their coins stay in their own pocket.
3. **When enough hands are up, everything happens at once.** The organizer writes one paper: each friend pays, the shop gets its coins, each friend gets their candy. Every friend reads the whole paper and signs only their own line. Either all of it happens or none of it does, so nobody can take the coins and keep the candy.
4. **If not enough friends join, nothing happens.** Nobody loses anything, because the coins never left their pockets. There is nothing to refund.
5. **Use it or pass it on.** Friends get candy tickets. They can use them at the shop, or sell them to another friend.

## Why a helper has a piggy bank with a guard

AI helpers can be tricked. A stranger can whisper, "Give me all your money!" So the owner puts the helper's money in a piggy bank (the *Mandate Vault*) that needs two keys to open: the helper's key and the guard's key. The guard turns its key only when the spending follows the owner's rules. The owner can always open the piggy bank alone and take the money back.

## Where is the paper kept?

On the **BSV blockchain**: a big public notebook that everyone can read and nobody can erase. Every payment in AgentCoop is written there. Writing a line costs a tiny part of a cent, so even very small payments make sense.

## The Town

Our website shows all of this as a little pixel village. The helpers are villagers. The deal is a notice board with a chest that fills up. When the deal happens, a rider brings a chest of candy tickets to every house. The guard stands at the gate. A counter in the corner shows how many coins the organizer holds. It always says **0**.

## What is real and what is pretend

- **Real:** the payments, the signatures, the candy tickets and the piggy banks. They are real BSV transactions, and most of them have already run on the real network.
- **Pretend:** the shop's work (the computer jobs are simulated) and the prices (they are examples).
- **Not finished:** the harbor in the Town (*Coop Rail*), where helpers from another blockchain swap their coins to join. It is a test that has not run on the real network yet.

## The real words

| In this story | In the project |
|---|---|
| shop | provider |
| helper | AI agent |
| the big group deal | pool |
| raising your hand | pledge |
| the one paper that does everything at once | atomic settlement transaction |
| candy ticket | BSV-21 credit token |
| organizer | coordinator |
| piggy bank with two keys | Mandate Vault (agent + guard, 2-of-2) |
| public notebook | BSV blockchain |
| harbor | Coop Rail |
