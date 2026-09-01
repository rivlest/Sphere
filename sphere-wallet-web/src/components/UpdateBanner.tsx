import { useEffect, useState } from 'react';
import { getStatus } from '../lib/api';
import {
  fetchPublishedVersion,
  isOutdated,
  publicReleaseOutdated,
  sphereCoreLabel,
} from '../lib/version';

export function UpdateBanner() {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [status, published] = await Promise.all([getStatus(), fetchPublishedVersion()]);
        if (cancelled) return;
        const nodeVersion = status.version;
        if (!nodeVersion) {
          setNotice(
            'Węzeł outdated (brak numeru wersji). W folderze Sphere wpisz: git pull  i zrestartuj npm run start.',
          );
          return;
        }
        const latest = published ?? status.latestVersion ?? null;
        const rawSemver = /^\d+\.\d+\.\d+$/.test(nodeVersion.trim());
        const behind =
          status.outdated ||
          (latest && publicReleaseOutdated(nodeVersion, latest)) ||
          (latest && rawSemver && isOutdated(nodeVersion, latest));
        if (behind) {
          const from = sphereCoreLabel(nodeVersion);
          const to = latest ? sphereCoreLabel(latest) : null;
          setNotice(
            `Węzeł outdated (${from}${to && to !== from ? `, latest ${to}` : ''}). W folderze Sphere wpisz: git pull  i zrestartuj npm run start.`,
          );
        }
      } catch {
        // Node unreachable — dashboard/send already show their own errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!notice) return null;
  return (
    <div className="mb-5 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm leading-relaxed text-warn">
      {notice}
    </div>
  );
}
