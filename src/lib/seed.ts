import type { Plan } from './plan';
import type { Lesson } from './types';
export const CASH_LESSON: Lesson = {
  id: 'reviewed-cash-v1',
  session_id: 'w01-monday',
  objective_id: 'profit-versus-cash',
  title: 'Profit versus cash',
  subject: 'Finance',
  duration: 20,
  scenario:
    'A small creative studio sold $8,000 of work this month. Only $2,000 has reached its bank account. It has $5,000 of costs due.',
  facts: [
    { label: 'Work sold this month', value: '$8,000' },
    { label: 'Cash received', value: '$2,000' },
    { label: 'Costs due this month', value: '$5,000' },
  ],
  explanation:
    'A sale and its payment can happen at different times. Profit describes revenue minus expenses for a period. Cash depends on the money you start with, the money you receive, and the payments you make.',
  question: 'What would you check first?',
  choices: [
    'Opening cash and payment dates',
    'How much more work it can sell',
    'Whether revenue grew last month',
  ],
  reasoning_prompt:
    'Before recommending a fix for the studio, choose what you need to know. Why that one?',
  transfer: {
    scenario:
      'A client pays a caterer a $4,000 deposit today for an event next month. Ingredients will cost $2,500.',
    question: 'Does cash in the bank mean it is all profit?',
  },
  sources: [
    {
      title: 'SEC · Financial statements guide',
      url: 'https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide',
      checked_at: '2026-09-21',
      supports: 'The distinction between profit and cash flows.',
    },
  ],
  uncertainty:
    'The studio and its numbers are fictional. Opening cash and the dates of receipts and payments determine whether it can pay its bills.',
  fictional: true,
  generated: false,
};
export const DEMO_PLAN: Plan = {
  schema_version: '1.0',
  plan_id: 'studio-preview',
  title: 'Education & growth · preview',
  start_date: '2026-09-28',
  end_date: '2027-06-05',
  profile: {
    name: 'Nathan',
    timezone: 'America/Los_Angeles',
    goals: ['Explain financial decisions', 'Communicate clearly'],
    preferences: {},
  },
  schedule: {
    weekdays: [0, 1, 2, 3],
    start_local: '10:00',
    end_local: '12:00',
    timezone: 'America/Los_Angeles',
    friday: 'open',
    travel_window: {
      start: '2026-12-21',
      end: '2027-01-03',
      dates_confirmed: false,
    },
  },
  sources: [
    {
      id: 'finance',
      title: CASH_LESSON.sources[0].title,
      url: CASH_LESSON.sources[0].url,
      use: 'Profit and cash.',
    },
  ],
  weeks: [
    {
      id: 'w01',
      start_date: '2026-09-28',
      mode: 'standard',
      topics: {
        monday: 'Profit versus cash',
        tuesday: 'Listen, pause, state the point',
        wednesday: 'Read an income statement',
        thursday: 'Claims versus evidence',
      },
      evidence: 'Explain why profit is not cash.',
    },
    {
      id: 'w02',
      start_date: '2026-10-05',
      mode: 'standard',
      topics: { monday: 'Assets, liabilities & equity' },
      evidence: 'Explain three statements.',
    },
  ],
  sessions: [
    'Profit versus cash',
    'Listen, pause, state the point',
    'Read an income statement',
    'Claims versus evidence',
  ].map((title, i) => ({
    id: ['w01-monday', 'w01-tuesday', 'w01-wednesday', 'w01-thursday'][i],
    date: '2026-09-' + (28 + i),
    start_local: '10:00',
    duration_minutes: 60,
    optional: false,
    subject: i === 1 ? 'communication' : i === 3 ? 'judgment' : 'finance',
    title,
    objective: title,
    evidence: 'Explain your reasoning.',
    source_ids: ['finance'],
    prerequisite_ids: [],
    generation_instructions: 'Use sourced examples.',
  })),
  growth: {
    gym: { days: [0, 2, 4], start_local: '17:00', status: 'proposed' },
    food: ['Protein at meals', 'Produce twice daily'],
  },
  adaptation: { review_day_offsets: [2, 7, 21], review_cap_minutes: 10 },
  milestones: [
    { date: '2026-12-17', title: 'Cash briefing & delegation' },
    { date: '2027-03-04', title: 'Defend a decision' },
    { date: '2027-06-05', title: 'Portfolio review' },
  ],
};
DEMO_PLAN.sessions[3].date = '2026-10-01';
export const EMPTY_TEMPLATE = {
  schema_version: '1.0',
  plan_id: 'my-education-plan',
  title: 'My education and growth',
  start_date: '2026-09-28',
  end_date: '2027-06-05',
  profile: {
    name: 'Your name',
    timezone: 'America/Los_Angeles',
    goals: ['Your first useful outcome'],
    preferences: {},
  },
  schedule: {
    weekdays: [0, 1, 2, 3],
    start_local: '10:00',
    end_local: '11:00',
    timezone: 'America/Los_Angeles',
  },
  sources: [],
  weeks: [
    {
      id: 'w01',
      start_date: '2026-09-28',
      mode: 'standard',
      topics: { monday: 'Your first topic' },
      evidence: 'A short explanation',
    },
  ],
  sessions: [
    {
      id: 'w01-first',
      date: '2026-09-28',
      start_local: '10:00',
      duration_minutes: 20,
      optional: false,
      subject: 'your subject',
      title: 'Your first topic',
      objective: 'One clear skill',
      evidence: 'Explain your reasoning',
      source_ids: [],
      prerequisite_ids: [],
      generation_instructions:
        'Find topic-specific primary sources before teaching.',
    },
  ],
  growth: {},
  adaptation: { recovery_minutes: 20, review_cap_minutes: 10 },
  milestones: [],
};
