// Whether to skip movement: the learner's choice under You → Reading wins,
// otherwise the system setting decides.
export function reducedMotion() {
  if (typeof document === 'undefined') return false;
  const chosen = document.documentElement.dataset.motion;
  if (chosen === 'reduce') return true;
  if (chosen === 'full') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
