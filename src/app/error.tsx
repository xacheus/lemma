'use client';

import { SiteUnavailable } from '@/components/public/site-unavailable';

/** Last-resort fallback for failures not handled by a public page. */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SiteUnavailable onRetry={reset} />;
}
