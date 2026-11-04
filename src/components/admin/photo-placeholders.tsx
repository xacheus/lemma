import { ImagePlus } from 'lucide-react';

/** Empty gallery slots are guidance only; they are never saved as apartment photos. */
export function PhotoPlaceholders({ message }: { message: string }) {
  return (
    <div>
      <p className="mb-2 text-[0.78rem] text-navy-500">{message}</p>
      <div className="grid grid-cols-3 gap-2" aria-label="Empty photograph slots">
        {['Cover photo', 'Interior', 'More photos'].map((label) => (
          <div key={label} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-sand-300 bg-sand-50 text-navy-400">
            <ImagePlus size={20} aria-hidden="true" />
            <span className="text-center text-[0.7rem] font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
