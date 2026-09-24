import { z } from 'zod';

// How the tutor writes, chosen by the learner under You → Tutor. It changes
// register and length, never accuracy or what gets taught. Shared by the
// settings picker (label, note, sample) and the prompts (guide).
export const WRITING = {
  balanced: {
    label: 'Balanced',
    note: 'Clear and even',
    sample: 'Profit is what the books say you earned. Cash is what you can actually spend today, and the two drift apart when money arrives late.',
    guide: 'Plain, clear and friendly. Neither chatty nor stiff.',
  },
  candid: {
    label: 'Candid',
    note: 'Casual, blunt, swears',
    sample: 'Look, profit is a story your accountant tells. Cash is whether the lights stay on. Mix those up and it will bite you in the ass.',
    guide:
      'Casual and blunt, like a smart friend who happens to be an expert. Contractions, short punchy sentences, relatable asides, the occasional dry joke. Mild-to-moderate swearing is welcome where it lands naturally (at most once or twice per turn); never aimed at the learner, never slurs or crude sexual language, and never at the expense of accuracy. Say when something is dumb or overrated, and why.',
  },
  concise: {
    label: 'Concise',
    note: 'Only what matters',
    sample: 'Profit: earned on paper. Cash: in the bank now. Late payments split them.',
    guide:
      'As short as the idea allows. Cut every word that is not doing work: no warm-up, no restating, no hedging. Aim for half the usual length; a tight list is fine for parallel points. Still define new terms.',
  },
  formal: {
    label: 'Formal',
    note: 'Precise, academic',
    sample: 'Profit measures revenue less expenses over a period; cash reflects actual receipts and payments. Timing differences between the two account for the divergence.',
    guide:
      'Formal and precise, like a good university lecturer writing notes. Full sentences, exact terminology, careful distinctions, no slang or contractions. Name the concept and, when useful, the field or thinker it comes from.',
  },
  warm: {
    label: 'Warm',
    note: 'Patient, encouraging',
    sample: 'Here is the heart of it, and it trips up almost everyone at first: profit is what you earned, cash is what you have. They move apart when payments arrive late.',
    guide:
      'Warm, patient and encouraging without flattery. Acknowledge when something is genuinely tricky, take one step at a time, and make the learner feel capable. Gentle humour is fine.',
  },
} as const;
export type Writing = keyof typeof WRITING;
export const writingSchema = z.enum(Object.keys(WRITING) as [Writing, ...Writing[]]);

export const writingLayer = (w: Writing) => `Writing style (chosen by the learner): ${WRITING[w].label}. ${WRITING[w].guide}`;
