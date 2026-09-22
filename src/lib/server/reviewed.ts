import 'server-only';
import type { LessonKey, Feedback } from '@/lib/types';
export const CASH_KEY: LessonKey = {
  correct_choice: 0,
  concepts: ['cash', 'bank', 'balance', 'date', 'timing', 'payment', 'when'],
  transfer_concepts: ['cost', 'expense', 'deliver', 'profit', 'owe'],
  rubric:
    'Identify opening cash and receipt/payment timing. Explain that deposits are not automatically earned profit; remaining obligations and costs matter.',
  feedback: {
    strength: 'You separated the sale from the payment.',
    gap: 'The gap in this month’s cash movements is not the whole story. Check the opening bank balance and when money moves.',
    next: 'Ask when the outstanding $6,000 will arrive, then compare it with the bills’ due dates.',
  },
};
export function guidedFeedback(
  choice: number,
  reasoning: string,
  transfer: string,
  assisted: boolean,
  key = CASH_KEY,
): Feedback {
  const count = (s: string, terms: string[]) =>
    terms.filter((t) => s.toLowerCase().includes(t)).length;
  const correct =
    choice === key.correct_choice &&
    count(reasoning, key.concepts) >= 2 &&
    reasoning.trim().split(/\s+/).length >= 7 &&
    (transfer.length === 0 || count(transfer, key.transfer_concepts) >= 2);
  return {
    strength: correct
      ? key.feedback.strength
      : 'You made a decision and explained your thinking.',
    gap: correct ? 'You identified the missing information.' : key.feedback.gap,
    next: key.feedback.next,
    independent: false,
    correct,
    rubric: {
      issue: correct ? 'independent' : 'needs help',
      evidence: correct ? 'independent' : 'needs help',
      reasoning: correct ? 'independent' : 'needs help',
      uncertainty: correct ? 'independent' : 'needs help',
    },
  };
}
