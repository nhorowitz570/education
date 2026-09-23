import 'server-only';
import type { Tier } from './env';

type Effort = 'none' | 'low' | 'medium' | 'high';
export type TaskSpec = {
  tier: Tier;
  effort: Effort;
  verbosity: 'low' | 'medium' | 'high';
  maxOutput: number;
  // When routing signals say the moment is genuinely hard, this tier is used.
  escalate?: Tier;
};

// Every model call in the app is one of these tasks. Routing, reasoning depth,
// output budget and escalation live here, not at call sites.
export const TASKS = {
  // Luna: fast, cheap, high-volume.
  'grade.quick': { tier: 'fast', effort: 'low', verbosity: 'low', maxOutput: 1200, escalate: 'primary' },
  'memory.extract': { tier: 'fast', effort: 'low', verbosity: 'low', maxOutput: 1500 },
  'run.summary': { tier: 'fast', effort: 'none', verbosity: 'low', maxOutput: 700 },
  'today.hook': { tier: 'fast', effort: 'none', verbosity: 'low', maxOutput: 200 },
  'insights.ask': { tier: 'fast', effort: 'low', verbosity: 'low', maxOutput: 900 },
  'food.estimate': { tier: 'fast', effort: 'low', verbosity: 'low', maxOutput: 600 },
  'visual.repair': { tier: 'fast', effort: 'low', verbosity: 'low', maxOutput: 1500 },
  'plan.chapters': { tier: 'fast', effort: 'low', verbosity: 'low', maxOutput: 2500 },
  'venture.month': { tier: 'fast', effort: 'low', verbosity: 'low', maxOutput: 2600 },
  // Sol: the tutor and most learner-facing intelligence.
  'tutor.beat': { tier: 'primary', effort: 'low', verbosity: 'low', maxOutput: 2500, escalate: 'reasoning' },
  'tutor.question': { tier: 'primary', effort: 'low', verbosity: 'low', maxOutput: 1800 },
  'tutor.reply': { tier: 'primary', effort: 'low', verbosity: 'low', maxOutput: 2200, escalate: 'reasoning' },
  'grade.deep': { tier: 'primary', effort: 'medium', verbosity: 'low', maxOutput: 1800, escalate: 'reasoning' },
  'practice.partner': { tier: 'primary', effort: 'none', verbosity: 'low', maxOutput: 700 },
  'practice.brief': { tier: 'primary', effort: 'low', verbosity: 'low', maxOutput: 1800 },
  'practice.feedback': { tier: 'primary', effort: 'medium', verbosity: 'low', maxOutput: 2200, escalate: 'reasoning' },
  'sources.find': { tier: 'primary', effort: 'low', verbosity: 'low', maxOutput: 1500 },
  'import.markdown': { tier: 'primary', effort: 'low', verbosity: 'low', maxOutput: 32000 },
  // Astra: rare, genuinely hard reasoning.
  'curriculum.map': { tier: 'reasoning', effort: 'medium', verbosity: 'low', maxOutput: 24000 },
  'learner.diagnose': { tier: 'reasoning', effort: 'medium', verbosity: 'low', maxOutput: 1800 },
  // Once a week per learner: worth Astra's full attention.
  'insights.weekly': { tier: 'reasoning', effort: 'high', verbosity: 'medium', maxOutput: 12000 },
} as const satisfies Record<string, TaskSpec>;
export type TaskId = keyof typeof TASKS;

export type RouteSignals = {
  // Repeated failure on the same idea, an explicit "go deeper", a capstone or
  // milestone evaluation, or an unusually hard free-form question.
  hard?: boolean;
  stakes?: 'normal' | 'high';
};

export function route(task: TaskId, signals: RouteSignals = {}) {
  const spec: TaskSpec = TASKS[task];
  const escalate = !!spec.escalate && (signals.hard || signals.stakes === 'high');
  const tier = escalate ? spec.escalate! : spec.tier;
  // Astra does not accept effort "none"; escalation also buys more thought.
  const effort: Effort =
    tier === 'reasoning'
      ? spec.effort === 'none' || spec.effort === 'low'
        ? 'medium'
        : spec.effort
      : escalate && spec.effort === 'low'
        ? 'medium'
        : spec.effort;
  return { ...spec, tier, effort, escalated: escalate };
}
