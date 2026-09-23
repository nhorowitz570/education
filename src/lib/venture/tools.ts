// Panels in Venture that open up as the learner studies the ideas behind
// them: learning something in a session gives you a new way to see your
// company.

export type Tool = { id: 'forecast' | 'margin' | 'breakeven' | 'receivables' | 'capacity'; label: string; detail: string; hint: string; match: RegExp };

export const TOOLS: Tool[] = [
  { id: 'margin', label: 'Unit margin', detail: 'What each sale earns after its variable cost.', hint: 'Study pricing or contribution margin', match: /margin|pric|contribution|unit econ/i },
  { id: 'forecast', label: 'Cash forecast', detail: 'Next month’s cash, before you commit.', hint: 'Study cash flow or forecasting', match: /cash|forecast|working capital|runway/i },
  { id: 'receivables', label: 'Who owes you', detail: 'Money earned but not yet collected, by month.', hint: 'Study how a sale becomes cash', match: /receiv|sale|payment|terms|statement|balance sheet|asset/i },
  { id: 'breakeven', label: 'Break-even', detail: 'How many sales cover your fixed costs.', hint: 'Study fixed and variable costs', match: /fixed|variable|break.?even|cost/i },
  { id: 'capacity', label: 'Capacity planner', detail: 'Demand against what your team can deliver.', hint: 'Study capacity, hiring or delegation', match: /capacity|bottleneck|hiring|delegat|operat/i },
];
