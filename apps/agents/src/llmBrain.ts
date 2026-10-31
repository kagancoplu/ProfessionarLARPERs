/**
 * LLM purchasing brain (AGENT_BRAIN=llm): Claude answers the four purchasing
 * questions (brainPrompt.ts) over the same facts in one structured-output call.
 * Credentials come from the environment (ANTHROPIC_API_KEY or an
 * `ant auth login` profile).
 *
 * Guard rails: provider text is data, not instructions; the answer must match
 * DECISION_SCHEMA; and enforcePolicy (brain.ts) still clamps it to the owner's
 * caps. On a refusal, an API error or an unusable answer the agent falls back
 * to the rules brain. AGENT_BRAIN=openai uses OpenAI instead (openaiBrain.ts).
 */
import Anthropic from '@anthropic-ai/sdk'
import { rulesBrain, type Brain, type Decision, type DecisionContext } from './brain'
import { DECISION_SCHEMA, SYSTEM, readAnswer, userContent } from './brainPrompt'
import { openaiBrain } from './openaiBrain'

export const LLM_MODEL = 'claude-opus-5-5'

export function llmBrain (client = new Anthropic()): Brain {
  return {
    name: 'llm',
    async decide (ctx: DecisionContext): Promise<Decision> {
      const fallback = async (why: string): Promise<Decision> => {
        const d = await rulesBrain.decide(ctx)
        return { ...d, brain: `rules (llm unavailable: ${why})` }
      }
      let response: Anthropic.Beta.BetaMessage
      try {
        response = await client.beta.messages.create({
          model: LLM_MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: DECISION_SCHEMA } },
          system: SYSTEM,
          messages: [{ role: 'user', content: userContent(ctx) }]
        })
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) return await fallback('no valid API credentials')
        if (e instanceof Anthropic.RateLimitError) return await fallback('rate limited')
        if (e instanceof Anthropic.APIError) return await fallback(`API error ${String(e.status)}`)
        return await fallback((e as Error).message)
      }
      if (response.stop_reason === 'refusal') return await fallback('the model declined')
      const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text
      let parsed: { action?: unknown, credits?: unknown, reason?: unknown }
      try {
        parsed = JSON.parse(text ?? '')
      } catch {
        return await fallback('unparseable answer')
      }
      const answer = readAnswer(parsed)
      if (answer === null) return await fallback('answer off schema')
      return { ...answer, brain: `llm (${response.model})` }
    }
  }
}

/** AGENT_BRAIN=openai → OpenAI; =llm → Claude; anything else → the deterministic rules brain. */
export function brainFromEnv (env: NodeJS.ProcessEnv = process.env): Brain {
  if (env.AGENT_BRAIN === 'openai') return openaiBrain()
  if (env.AGENT_BRAIN === 'llm') return llmBrain()
  return rulesBrain
}
