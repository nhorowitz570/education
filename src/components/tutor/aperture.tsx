// The tutor's mark: a camera aperture in the warm safelight, the one colour
// the app spends freely. Open when idle; it turns slowly while thinking.
export function Aperture({ size = 24, busy = false, label }: { size?: number; busy?: boolean; label?: string }) {
  return (
    <svg
      className={'aperture' + (busy ? ' is-busy' : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="11.5" fill="var(--accent)" />
      <g className="aperture-blades">
        <path d="M12 6.8 16.5 9.4v5.2L12 17.2l-4.5-2.6V9.4Z" fill="var(--on-accent)" />
        <path
          d="M12 6.8 15.9 1.3M16.5 9.4l6.1-1.2M16.5 14.6l4.1 4.8M12 17.2l-3.9 5.5M7.5 14.6l-6.1 1.2M7.5 9.4 3.4 4.6"
          stroke="var(--on-accent)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
