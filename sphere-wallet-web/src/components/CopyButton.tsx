import { useState } from 'react';

export function CopyButton({
  text,
  label = 'Kopiuj',
  className = 'btn-secondary',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button type="button" className={className} onClick={onCopy}>
      {copied ? 'Skopiowano' : label}
    </button>
  );
}
