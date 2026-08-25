import { useId } from 'react';

export function OrbMark({ className = 'h-10 w-10' }: { className?: string }) {
  const rawId = useId().replace(/:/g, '');
  const fillId = `orb-fill-${rawId}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#818cf8" strokeWidth="1.5" opacity="0.8" />
      <defs>
        <radialGradient id={fillId} cx="35%" cy="30%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="50%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#0f766e" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="11" fill={`url(#${fillId})`} />
    </svg>
  );
}
