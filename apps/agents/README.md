# agents

Each agent has its own job (fine-tuning, evaluation, inference), and buying GPU capacity is how it pays for that job. Profiles live in `agents/*.json`. Each profile has a workload (jobs per day, minutes per job, active weekdays), 14 days of usage history, the owner's budget, and the env variable that holds the agent's wallet key.

```bash
npm run agent -- eval --jobs 3        # WALLET_AGENT_2_KEY, PROVIDER_API_URL, OVERLAY_URL
```

| Profile | Wallet key | Workload |
|---|---|---|
| `finetune` | `WALLET_AGENT_1_KEY` | 240–480 min jobs, ~every 2–3 days |
| `eval` | `WALLET_AGENT_2_KEY` | 4 × 15–45 min jobs on weekdays |
| `inference` | `WALLET_AGENT_3_KEY` | 24 × 2–6 min jobs a day (usually retail) |

**Faz 1 behaviour (no decision brain yet):** before each job, if the agent holds credit tokens and its prepaid balance does not cover the job, it redeems the whole credits still missing, provided the provider's cap allows it. One credit is one GPU-hour, used by the minute: a 45-minute eval redeems 1 credit and leaves 15 minutes for the next job, and an 8-hour fine-tune redeems 8. It checks the cap before sending, because tokens the provider refuses would stay at the provider's address. Then it submits the job, which is either free from prepaid credits or paid at retail through 402 (`AuthFetch`). Activity goes to the console and to `DATA_DIR/agents/<name>/activity.log`.

Faz 2 adds the 7-day forecast, the procurement router (credits → market → pool → retail), the LLM or rules brain and `decisions.log`.
