# BSV developer pack (third-party material)

These files were provided by the **BSV Association** to teams at the TUM Blockchain & AI Hackathon 2026. They are not AgentCoop documentation and were not written by the AgentCoop team. They are kept unchanged because AgentCoop was built from them and still relies on them as a reference.

| File | What it is |
|---|---|
| [START-HERE.md](START-HERE.md) | The pack's entry page: wallet setup, how hackathon teams got satoshis, links |
| [BSV_STACK_COMPLETE_GUIDE.md](BSV_STACK_COMPLETE_GUIDE.md) | A guide to the BSV TypeScript stack (`@bsv/sdk`, `@bsv/wallet-toolbox`, payments, HTTP 402, overlays, BSV-21, Arcade). AgentCoop's [AGENTS.md](../../../AGENTS.md) and code comments cite its sections ("guide §14") |
| [AGENTS.md](AGENTS.md) | The pack's rules for AI coding agents. AgentCoop's root [AGENTS.md](../../../AGENTS.md) keeps these rules, adapted to this repository's paths |
| `TBC26_BSV_Track_Requirements.pdf` | The hackathon track's requirements |
| `BSVA Logo Guidance/`, `BSVA Logo Guidance.zip` | BSV Association logos and their usage guidelines (`Logo_Guidelines_Jan2026.pdf`). The AgentCoop web app does not use them |

The pack's **starter kit** is at `docs/starter/bsv21-token-kit/`, not in this folder: AgentCoop's overlay and token rules were copied from it, and several tests (`test/skeleton.mockchain.test.ts`, `test/market.mockchain.test.ts`, `test/e2e.market.mockchain.test.ts`) import its overlay server. It has its own `package.json` and 38 tests; it is not an npm workspace of this repository.

**Licensing.** The pack's files, including the starter kit, carry no licence statement of their own; the repository's MIT licence covers the AgentCoop team's own work, not this material. In particular, the BSV Association logos are subject to the Association's brand guidelines. Check with the BSV Association before redistributing or reusing this material.

The pack's own instructions refer to its original layout (`AGENTS.md`, `BSV_STACK_COMPLETE_GUIDE.md` and `starter/` side by side) and to hackathon-only arrangements such as requesting satoshis from the organisers.
