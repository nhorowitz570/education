// Names for the people in lessons and practice. The learner wants familiar,
// everyday names for their own setting rather than whatever a model reaches
// for, so each run is handed a few from a pool to use, skipping recent ones.

export const NAMES = {
  american: {
    woman: ['Emily', 'Megan', 'Lauren', 'Katie', 'Jessica', 'Ashley', 'Rachel', 'Hannah', 'Amanda', 'Brooke', 'Kelly', 'Allison', 'Molly', 'Jenna', 'Taylor', 'Nicole', 'Claire', 'Abby'],
    man: ['Jake', 'Ryan', 'Tyler', 'Chris', 'Matt', 'Kevin', 'Brian', 'Kyle', 'Josh', 'Nick', 'Mike', 'Dan', 'Steve', 'Tom', 'Greg', 'Luke', 'Ben', 'Andrew'],
    surname: ['Miller', 'Johnson', 'Carter', 'Walsh', 'Parker', 'Bennett', 'Hayes', 'Collins', 'Murphy', 'Reed', 'Brooks', 'Sullivan', 'Harris', 'Cooper', 'Mitchell', 'Turner', 'Ward', 'Foster'],
  },
  irish: {
    woman: ['Aoife', 'Ciara', 'Niamh', 'Sinéad', 'Orla', 'Siobhán', 'Róisín', 'Clodagh', 'Aisling', 'Grainne'],
    man: ['Conor', 'Cian', 'Darragh', 'Eoin', 'Liam', 'Seán', 'Colm', 'Declan', 'Fergal', 'Ronan'],
    surname: ['Murphy', 'Kelly', 'O’Brien', 'Byrne', 'Ryan', 'Walsh', 'O’Sullivan', 'Doyle', 'McCarthy', 'Kennedy'],
  },
  british: {
    woman: ['Charlotte', 'Sophie', 'Emma', 'Lucy', 'Hannah', 'Harriet', 'Katie', 'Georgia', 'Beth', 'Amy'],
    man: ['James', 'Oliver', 'Harry', 'Tom', 'Jack', 'George', 'Will', 'Ollie', 'Rob', 'Ed'],
    surname: ['Smith', 'Taylor', 'Wright', 'Hughes', 'Clarke', 'Hall', 'Wood', 'Turner', 'Baker', 'Hill'],
  },
} as const;
export type NameSet = keyof typeof NAMES;

const pick = <T>(list: readonly T[], n: number, avoid: Set<string>, rand = Math.random) => {
  const fresh = list.filter((x) => !avoid.has(String(x)));
  const pool = [...(fresh.length >= n ? fresh : list)];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};

// A few first names (mixed) for a lesson's invented people.
export function lessonCast(avoid: string[] = [], rand = Math.random) {
  const skip = new Set(avoid);
  const set = NAMES.american;
  const women = pick(set.woman, 2, skip, rand),
    men = pick(set.man, 2, skip, rand);
  return [women[0], men[0], women[1], men[1]].filter(Boolean);
}

// One full name for a practice partner of a given gender and accent.
export function partnerName(accent: string, gender: 'man' | 'woman', avoid: string[] = [], rand = Math.random) {
  const set: NameSet = /irish/i.test(accent) ? 'irish' : /british|english/i.test(accent) ? 'british' : 'american';
  const skip = new Set(avoid);
  const first = pick(NAMES[set][gender], 1, skip, rand)[0];
  const last = pick(NAMES[set].surname, 1, new Set(), rand)[0];
  return `${first} ${last}`;
}
