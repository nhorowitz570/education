import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { createHash } from 'node:crypto';
import { HttpError } from '@/lib/server/http';
import { parsePartialJson } from '@/lib/partial-json';
import { aiEnv, aiReady, type Tier } from './env';
import { route, type RouteSignals, type TaskId } from './tasks';
import { CORE, OPERATOR_CORE, TUTOR_TASKS, renderLayers, taskLayer, type Layer } from './prompts';
import { costOf, guard, logCall } from './usage';

let clients: Partial<Record<'openai' | 'openrouter', OpenAI>> = {};
function client() {
  const env = aiEnv();
  if (!aiReady())
    throw new HttpError('The tutor is waiting for an API key in the server configuration.', 503);
  const which = env.AI_PROVIDER;
  return (clients[which] ??=
    which === 'openai'
      ? new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: env.AI_TIMEOUT_MS })
      : new OpenAI({
          apiKey: env.OPENROUTER_API_KEY,
          baseURL: 'https://openrouter.ai/api/v1',
          maxRetries: 0,
          timeout: env.AI_TIMEOUT_MS,
        }));
}
export function modelFor(tier: Tier) {
  const env = aiEnv(),
    id =
      tier === 'fast'
        ? env.AI_MODEL_FAST
        : tier === 'primary'
          ? env.AI_MODEL_PRIMARY
          : env.AI_MODEL_REASONING;
  return env.AI_PROVIDER === 'openrouter' && !id.includes('/') ? `openai/${id}` : id;
}

type InputContent =
  | string
  | { type: 'input_text'; text: string }[]
  | ({ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' | 'high' | 'auto' })[];

export type GenerateOptions<T> = {
  task: TaskId;
  userId: string | null;
  schema: z.ZodType<T>;
  // Context layers: learner, memories, curriculum, lesson state. Ordered from
  // most stable to most volatile.
  context?: Layer[];
  input: InputContent;
  beat?: string;
  signals?: RouteSignals;
  onPartial?: (partial: unknown) => void;
  signal?: AbortSignal;
  webSearch?: boolean;
};
export type Generated<T> = {
  data: T;
  tier: Tier;
  model: string;
  escalated: boolean;
  cost: number;
  sources: { url: string; title?: string }[];
};

const retriable = (e: unknown) =>
  e instanceof OpenAI.APIConnectionError ||
  e instanceof OpenAI.APIConnectionTimeoutError ||
  (e instanceof OpenAI.APIError && (e.status === 429 || (e.status ?? 0) >= 500));

// The single entry point for text intelligence. Streaming is always used so
// the first token arrives as early as possible; callers that want progressive
// rendering pass onPartial and receive the parsed-so-far object.
export async function generate<T>(o: GenerateOptions<T>): Promise<Generated<T>> {
  await guard(o.userId).catch((e) => {
    throw new HttpError(e.message, 429);
  });
  let plan = route(o.task, o.signals);
  const tutor = TUTOR_TASKS.includes(o.task);
  const instructions = [tutor ? CORE : OPERATOR_CORE, taskLayer(o.task, o.beat)]
    .filter(Boolean)
    .join('\n\n');
  const contextText = renderLayers(o.context || []);
  const userContent =
    typeof o.input === 'string' ? [{ type: 'input_text' as const, text: o.input }] : o.input;
  const input = [
    ...(contextText
      ? [{ role: 'developer' as const, content: [{ type: 'input_text' as const, text: contextText }] }]
      : []),
    { role: 'user' as const, content: userContent },
  ];
  const safety = o.userId
    ? createHash('sha256').update('fieldwork:' + o.userId).digest('hex').slice(0, 40)
    : undefined;

  const openrouter = aiEnv().AI_PROVIDER === 'openrouter';
  for (let attempt = 0; ; attempt++) {
    const model = modelFor(plan.tier),
      started = performance.now();
    let text = '',
      emitted = false;
    try {
      const stream = client().responses.stream(
        {
          model,
          instructions,
          input: input as OpenAI.Responses.ResponseInput,
          store: false,
          max_output_tokens: plan.maxOutput,
          reasoning: { effort: plan.effort },
          text: {
            format: zodTextFormat(o.schema as z.ZodType<T>, o.task.replace(/\W/g, '_')),
            verbosity: plan.verbosity,
          },
          prompt_cache_key: `fw:${o.task}:${o.beat || ''}`,
          // OpenRouter rejects the cache TTL option; its OpenAI route still
          // caches by key. Routing is limited to providers that don't retain
          // prompts. (require_parameters would exclude every endpoint here.)
          ...(openrouter
            ? { provider: { data_collection: 'deny' } }
            : { prompt_cache_options: { ttl: '30m' } }),
          ...(safety ? { safety_identifier: safety } : {}),
          ...(o.webSearch ? { tools: [{ type: 'web_search' as const }] } : {}),
        } as unknown as Parameters<OpenAI['responses']['stream']>[0],
        { signal: o.signal },
      );
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          text += event.delta;
          if (o.onPartial) {
            const partial = parsePartialJson(text);
            if (partial !== undefined) {
              emitted = true;
              o.onPartial(partial);
            }
          }
        }
      }
      const response = await stream.finalResponse();
      // OpenRouter reports the billed cost; otherwise estimate from prices.
      const reported = Number((response.usage as { cost?: unknown } | undefined)?.cost);
      const cost = Number.isFinite(reported) && reported >= 0 ? reported : costOf(plan.tier, response.usage);
      const finish = (ok: boolean, error?: string) =>
        logCall({
          userId: o.userId,
          task: o.task,
          tier: plan.tier,
          model,
          usage: response.usage,
          cost,
          latency: performance.now() - started,
          ok,
          error,
        });
      if (response.status === 'incomplete') {
        await finish(false, 'incomplete:' + response.incomplete_details?.reason);
        throw new HttpError('The response was cut short. Try again.', 502);
      }
      const refusal = response.output
        .flatMap((item) => (item.type === 'message' ? item.content : []))
        .find((c) => c.type === 'refusal');
      if (refusal) {
        await finish(false, 'refusal');
        throw new HttpError('The tutor couldn’t help with that request.', 422);
      }
      const raw = response.output_text || text;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        await finish(false, 'invalid-json');
        throw new HttpError('The tutor’s response was malformed. Try again.', 502);
      }
      const parsed = o.schema.safeParse(value);
      if (!parsed.success) {
        await finish(false, 'schema');
        throw new HttpError('The tutor’s response was malformed. Try again.', 502);
      }
      await finish(true);
      const sources = response.output.flatMap((item) =>
        item.type === 'message'
          ? item.content.flatMap((c) =>
              c.type === 'output_text'
                ? (c.annotations || []).flatMap((a) =>
                    a.type === 'url_citation' ? [{ url: a.url, title: a.title }] : [],
                  )
                : [],
            )
          : [],
      );
      return {
        data: parsed.data,
        tier: plan.tier,
        model,
        escalated: plan.escalated,
        cost,
        sources,
      };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (o.signal?.aborted) throw new HttpError('Stopped.', 499);
      await logCall({
        userId: o.userId,
        task: o.task,
        tier: plan.tier,
        model,
        latency: performance.now() - started,
        ok: false,
        error: e instanceof Error ? e.name + ': ' + e.message : 'unknown',
      });
      // A reasoning-tier outage should not block learning: fall back to Sol.
      if (plan.tier === 'reasoning' && !emitted && attempt === 0) {
        plan = { ...plan, tier: 'primary', effort: 'medium', escalated: false };
        continue;
      }
      if (retriable(e) && !emitted && attempt === 0) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      throw providerError(e);
    }
  }
}

function providerError(e: unknown) {
  if (e instanceof OpenAI.APIError) {
    if (e.status === 401) return new HttpError('The AI provider rejected the server’s API key.', 502);
    if (e.status === 429) return new HttpError('The AI provider is busy. Try again in a moment.', 503);
    if (e.status === 402) return new HttpError('The AI provider account needs credit.', 502);
    return new HttpError('The AI provider couldn’t complete this request. Try again.', 502);
  }
  if (e instanceof OpenAI.APIConnectionTimeoutError)
    return new HttpError('The tutor took too long to respond. Try again.', 504);
  return new HttpError('The tutor couldn’t be reached. Check your connection and try again.', 502);
}

export async function embed(userId: string | null, texts: string[]) {
  const env = aiEnv(),
    started = performance.now();
  if (!env.OPENAI_API_KEY) return null;
  const openai = (clients.openai ??= new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: 1,
    timeout: 20000,
  }));
  try {
    const res = await openai.embeddings.create({
      model: env.AI_MODEL_EMBEDDING,
      input: texts.map((t) => t.slice(0, 4000)),
    });
    await logCall({
      userId,
      task: 'embed',
      tier: 'embedding',
      model: env.AI_MODEL_EMBEDDING,
      usage: { input_tokens: res.usage.prompt_tokens },
      cost: (res.usage.prompt_tokens * 0.02) / 1e6,
      latency: performance.now() - started,
      ok: true,
    });
    return res.data.map((d) => d.embedding);
  } catch (e) {
    await logCall({
      userId,
      task: 'embed',
      tier: 'embedding',
      model: env.AI_MODEL_EMBEDDING,
      latency: performance.now() - started,
      ok: false,
      error: e instanceof Error ? e.message : 'unknown',
    });
    return null;
  }
}
