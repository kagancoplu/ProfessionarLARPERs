/**
 * OpenAI purchasing brain (AGENT_BRAIN=openai): GPT answers the same four
 * purchasing questions (brainPrompt.ts) over the same facts, in one
 * structured-output call bound to DECISION_SCHEMA. Credentials come from the
 * environment (OPENAI_API_KEY); the model is OPENAI_MODEL (default gpt-4o).
 *
 * Same guard rails as the Claude brain (llmBrain.ts): provider text is data,
 * not instructions; the answer must match the schema; enforcePolicy (brain.ts)
 * still clamps it to the owner's caps. On a refusal, an API error or an
 * unusable answer the agent falls back to the deterministic rules brain.
 */
import OpenAI from 'openai'
import { rulesBrain, type Brain, type Decision, type DecisionContext } from './brain'
import { DECISION_SCHEMA, SYSTEM, readAnswer, userContent } from './brainPrompt'

export const OPENAI_DEFAULT_MODEL = 'gpt-4o'
export const openaiModel = (env: NodeJS.ProcessEnv = process.env): string => env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL

export function openaiBrain (client = new OpenAI()): Brain {
  return {
    name: 'openai',
    async decide (ctx: DecisionContext): Promise<Decision> {
      const fallback = async (why: string): Promise<Decision> => {
        const d = await rulesBrain.decide(ctx)
        return { ...d, brain: `rules (openai unavailable: ${why})` }
      }
      let completion: OpenAI.Chat.Completions.ChatCompletion
      try {
        completion = await client.chat.completions.create({
          model: openaiModel(),
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: userContent(ctx) }
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'decision', strict: true, schema: DECISION_SCHEMA } }
        })
      } catch (e) {
        if (e instanceof OpenAI.AuthenticationError) return await fallback('no valid API credentials')
        if (e instanceof OpenAI.RateLimitError) return await fallback('rate limited')
        if (e instanceof OpenAI.APIError) return await fallback(`API error ${String(e.status)}`)
        return await fallback((e as Error).message)
      }
      const message = completion.choices[0]?.message
      if (message?.refusal != null && message.refusal !== '') return await fallback('the model declined')
      let parsed: { action?: unknown, credits?: unknown, reason?: unknown }
      try {
        parsed = JSON.parse(message?.content ?? '')
      } catch {
        return await fallback('unparseable answer')
      }
      const answer = readAnswer(parsed)
      if (answer === null) return await fallback('answer off schema')
      return { ...answer, brain: `openai (${completion.model})` }
    }
  }
}
