import { z } from 'zod';

// The only visual vocabulary the tutor can use. Specs are plain data rendered
// by native components with the app's own tokens; no generated code runs.
// Optional fields are nullable (not omitted) so the same schema works as a
// strict structured-output format.
export const tone = z.enum(['default', 'accent', 'positive', 'negative', 'muted']);
export type Tone = z.infer<typeof tone>;
const takeaway = z
  .string()
  .describe('One sentence: what the learner should notice.');

const bar = z.object({
  type: z.literal('bar'),
  title: z.string(),
  unit: z.string().describe('"$", "%", "hrs" or "" — prefix $ or suffix others.'),
  bars: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      tone,
      pending: z
        .number()
        .nullable()
        .describe('Part of value not yet realised (drawn hatched), else null.'),
      note: z.string().nullable(),
    }),
  ),
  takeaway,
});

const line = z.object({
  type: z.literal('line'),
  title: z.string(),
  unit: z.string(),
  x_label: z.string().nullable(),
  series: z.array(
    z.object({
      name: z.string(),
      tone,
      dashed: z.boolean().describe('Dashed for forecasts, baselines or comparisons.'),
      points: z.array(z.object({ x: z.string(), y: z.number() })),
    }),
  ),
  annotations: z.array(z.object({ x: z.string(), label: z.string() })),
  takeaway,
});

const waterfall = z.object({
  type: z.literal('waterfall'),
  title: z.string(),
  unit: z.string(),
  start: z.object({ label: z.string(), value: z.number() }),
  steps: z.array(z.object({ label: z.string(), delta: z.number() })),
  end_label: z.string(),
  takeaway,
});

const flow = z.object({
  type: z.literal('flow'),
  title: z.string(),
  steps: z.array(
    z.object({ label: z.string(), detail: z.string().nullable(), tone }),
  ),
  loops: z.boolean().describe('True when the last step feeds back to the first.'),
  takeaway,
});

const timeline = z.object({
  type: z.literal('timeline'),
  title: z.string(),
  events: z.array(
    z.object({
      when: z.string(),
      label: z.string(),
      detail: z.string().nullable(),
      tone,
    }),
  ),
  takeaway,
});

const compare = z.object({
  type: z.literal('compare'),
  title: z.string(),
  columns: z.array(z.object({ heading: z.string(), tone })),
  rows: z.array(z.object({ label: z.string(), cells: z.array(z.string()) })),
  takeaway,
});

const matrix = z.object({
  type: z.literal('matrix'),
  title: z.string(),
  x_axis: z.object({ label: z.string(), low: z.string(), high: z.string() }),
  y_axis: z.object({ label: z.string(), low: z.string(), high: z.string() }),
  items: z.array(
    z.object({
      label: z.string(),
      x: z.number().describe('0 to 1'),
      y: z.number().describe('0 to 1'),
      tone,
    }),
  ),
  takeaway,
});

const concepts = z.object({
  type: z.literal('concepts'),
  title: z.string(),
  nodes: z.array(
    z.object({ id: z.string(), label: z.string(), tone, emphasis: z.boolean() }),
  ),
  edges: z.array(
    z.object({ from: z.string(), to: z.string(), label: z.string().nullable() }),
  ),
  takeaway,
});

const stat = z.object({
  type: z.literal('stat'),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      delta: z.string().nullable(),
      tone,
    }),
  ),
  takeaway,
});

const statement = z.object({
  type: z.literal('statement'),
  title: z.string(),
  unit: z.string(),
  sections: z.array(
    z.object({
      heading: z.string().nullable(),
      rows: z.array(
        z.object({
          label: z.string(),
          value: z.number(),
          emphasis: z.enum(['normal', 'subtotal', 'total']),
        }),
      ),
    }),
  ),
  takeaway,
});

const sim = z.object({
  type: z.literal('sim'),
  title: z.string(),
  inputs: z.array(
    z.object({
      id: z.string().describe('lowercase identifier used in formulas'),
      label: z.string(),
      min: z.number(),
      max: z.number(),
      step: z.number(),
      value: z.number(),
      unit: z.string(),
    }),
  ),
  outputs: z.array(
    z.object({
      label: z.string(),
      formula: z
        .string()
        .describe('Arithmetic over input ids: + - * / ^ ( ) min() max() round() abs().'),
      format: z.enum(['currency', 'number', 'percent']),
      tone,
    }),
  ),
  takeaway,
});

const spectrum = z.object({
  type: z.literal('spectrum'),
  title: z.string(),
  left: z.string(),
  right: z.string(),
  markers: z.array(
    z.object({
      label: z.string(),
      position: z.number().describe('0 (left) to 1 (right)'),
      tone,
    }),
  ),
  takeaway,
});

const cycle = z.object({
  type: z.literal('cycle'),
  title: z.string(),
  steps: z.array(z.object({ label: z.string(), detail: z.string().nullable(), tone })).describe('3–6 stages that repeat.'),
  centre: z.string().nullable().describe('What the loop is, shown in the middle (≤ 18 characters).'),
  takeaway,
});

const tree = z.object({
  type: z.literal('tree'),
  title: z.string(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        parent: z.string().nullable().describe('id of the parent; null only for the single root.'),
        label: z.string(),
        detail: z.string().nullable(),
        tone,
      }),
    )
    .describe('A hierarchy at most three levels deep, ≤ 12 nodes.'),
  takeaway,
});

const parts = z.object({
  type: z.literal('parts'),
  title: z.string(),
  unit: z.string(),
  parts: z.array(z.object({ label: z.string(), value: z.number(), tone })).describe('2–6 parts of one whole.'),
  total_label: z.string().nullable(),
  takeaway,
});

const balance = z.object({
  type: z.literal('balance'),
  title: z.string(),
  left: z.object({ label: z.string(), items: z.array(z.object({ label: z.string(), weight: z.number().describe('1 (minor) to 3 (major)') })) }),
  right: z.object({ label: z.string(), items: z.array(z.object({ label: z.string(), weight: z.number().describe('1 (minor) to 3 (major)') })) }),
  takeaway,
});

const venn = z.object({
  type: z.literal('venn'),
  title: z.string(),
  sets: z.array(z.object({ label: z.string(), tone })).describe('Exactly 2 or 3 sets.'),
  regions: z
    .array(
      z.object({
        sets: z.array(z.number().int()).describe('Indexes of the sets this region belongs to, e.g. [0] or [0,1].'),
        items: z.array(z.string()),
      }),
    )
    .describe('What sits in each region; ≤ 3 short items per region.'),
  takeaway,
});

export const vizSchema = z.discriminatedUnion('type', [
  bar,
  line,
  waterfall,
  flow,
  timeline,
  compare,
  matrix,
  concepts,
  stat,
  statement,
  sim,
  spectrum,
  cycle,
  tree,
  parts,
  balance,
  venn,
]);
export type Viz = z.infer<typeof vizSchema>;
export type VizType = Viz['type'];
export const VIZ_LABELS: Record<VizType, string> = {
  bar: 'bar chart',
  line: 'line chart',
  waterfall: 'bridge',
  flow: 'process',
  timeline: 'timeline',
  compare: 'comparison',
  matrix: 'matrix',
  concepts: 'concept map',
  stat: 'figures',
  statement: 'statement',
  sim: 'model',
  spectrum: 'spectrum',
  cycle: 'cycle',
  tree: 'hierarchy',
  parts: 'breakdown',
  balance: 'balance',
  venn: 'overlap',
};

// Read by the tutor: when each primitive is the right picture.
export const VIZ_GUIDE = `Visual primitives (use at most one per turn, only when a picture beats a sentence):
- bar: compare a few quantities. Use pending for amounts earned but not received (e.g. invoiced, unpaid).
- line: change over time or a relationship; dashed series for forecasts/baselines; ≤4 series, ≤24 points.
- waterfall: how a starting number becomes an ending number (profit → cash, budget → actual).
- flow: a process or causal chain, 3–6 steps.
- timeline: dated events or sequence, ≤8 events.
- compare: options side by side, 2–3 columns, ≤6 rows, short cells.
- matrix: a 2×2 trade-off; place items with x/y in 0–1.
- concepts: how ideas relate; ≤8 nodes, labelled edges; emphasis marks the focus idea.
- stat: 1–4 headline figures with an optional delta.
- statement: a small financial statement with subtotal/total rows.
- sim: an interactive model the learner can move (break-even, pricing, dilution). Formulas use only input ids, numbers, + - * / ^ ( ), min, max, round, abs. Keep ranges realistic.
- spectrum: positions between two poles (strength of evidence, political positions); positions 0–1.
- cycle: a loop that feeds itself (business cycle, feedback loops, the legislative calendar); 3–6 stages.
- tree: a hierarchy or breakdown (branches of government, a taxonomy, a decision's sub-questions); one root, ≤ 3 levels.
- parts: shares of one whole (a budget, seats in a parliament, where time goes); values in the same unit.
- balance: arguments or forces weighed against each other; weights 1–3; the heavier side tips.
- venn: what two or three things share and where they differ (e.g. federalism vs devolution).
Match the picture to the subject: timelines, trees, cycles, spectra and venns suit history, politics and ideas; bars, lines and statements suit quantities.
Labels ≤ 24 characters. Numbers must be internally consistent. Tones: accent = the focus, positive/negative = good/bad direction, muted = context.`;
