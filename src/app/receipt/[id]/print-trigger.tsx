'use client';

import { Printer } from 'lucide-react';

/** Opens the browser print dialog — "Save as PDF" lives in the same dialog. */
export function PrintTrigger() {
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
      <Printer size={13} /> Print
    </button>
  );
}
