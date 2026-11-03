'use client';

import { Panel } from '@/components/ui';
import { PageHeader } from '@/components/admin/shell';
import { CalendarBoard } from '@/components/admin/calendar';

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Booking calendar"
        description="The same availability the booking form is checked against, drawn on a grid. Click a stay to open it, click a free cell to sell it."
      />
      <Panel bodyClass="p-3.5 sm:p-4">
        <CalendarBoard />
      </Panel>
    </div>
  );
}
