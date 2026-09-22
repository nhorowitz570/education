// Fieldwork's mark: a field of points with one lit — the next thing to learn.
export function Mark({ size = 28 }: { size?: number }) {
  const dots = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [c, r]));
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role="img"
      aria-label="Fieldwork"
    >
      <rect width="28" height="28" rx="8" fill="var(--mark-bg, #16171A)" />
      {dots.map(([c, r]) => (
        <circle
          key={`${c}${r}`}
          cx={8 + c * 6}
          cy={8 + r * 6}
          r={c === 2 && r === 0 ? 2.1 : 1.35}
          fill={c === 2 && r === 0 ? 'var(--mark-lit, #F2F1ED)' : 'rgba(242,241,237,.28)'}
        />
      ))}
    </svg>
  );
}
