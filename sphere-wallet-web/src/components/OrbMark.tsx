import { useId } from 'react';

/** Sphere mark: planet + orbital ring, transparent canvas (no plate). */
export function OrbMark({ className = 'h-10 w-10' }: { className?: string }) {
  const rawId = useId().replace(/:/g, '');
  const planetId = `sphere-planet-${rawId}`;
  const ringId = `sphere-ring-${rawId}`;
  const frontClipId = `sphere-front-${rawId}`;
  const glowId = `sphere-glow-${rawId}`;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={planetId} cx="32%" cy="26%" r="72%">
          <stop offset="0%" stopColor="#7ee8e0" />
          <stop offset="32%" stopColor="#2dd4bf" />
          <stop offset="68%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#042f2e" />
        </radialGradient>
        <linearGradient id={ringId} x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="45%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#2dd4bf" stopOpacity="0" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.28" />
        </radialGradient>
        <clipPath id={frontClipId}>
          <rect x="0" y="32" width="64" height="32" />
        </clipPath>
      </defs>

      <circle cx="32" cy="32" r="22" fill={`url(#${glowId})`} />

      <g transform="rotate(-26 32 33)">
        <ellipse
          cx="32"
          cy="33"
          rx="26"
          ry="9"
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="1.7"
          opacity="0.55"
        />
      </g>

      <circle cx="32" cy="32" r="13.6" fill={`url(#${planetId})`} />
      <circle cx="26.5" cy="26" r="3.2" fill="#5eead4" opacity="0.28" />

      <g transform="rotate(-26 32 33)" clipPath={`url(#${frontClipId})`}>
        <ellipse
          cx="32"
          cy="33"
          rx="26"
          ry="9"
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="2.1"
        />
      </g>

      <path fill="#67e8f9" opacity="0.85" d="M10 16 l1.1 2.6 2.6 1.1-2.6 1.1L10 23.4 8.9 20.8 6.3 19.7l2.6-1.1z" />
      <path fill="#a5b4fc" opacity="0.7" d="M52 14 l0.8 1.8 1.8.8-1.8.8L52 19.2l-.8-1.8-1.8-.8 1.8-.8z" />
      <path fill="#5eead4" opacity="0.55" d="M50 48 l0.7 1.5 1.5.7-1.5.7L50 52.4l-.7-1.5-1.5-.7 1.5-.7z" />
    </svg>
  );
}
