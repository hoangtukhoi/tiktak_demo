import { Check, X } from 'lucide-react';
import Spinner from '../common/Spinner';
import { DUB_STEPS } from '../../utils/constants';

/** status: AudioTrack.status (pending|transcribing|translating|synthesizing|done|failed) */
export default function DubbingStatusBadge({ status, withBar = false }) {
  const step = DUB_STEPS[status] || DUB_STEPS.pending;
  const tone =
    status === 'done' ? 'bg-lime text-ink' : status === 'failed' ? 'bg-coral/15 text-coral' : 'bg-ink-600 text-paper';
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${tone}`}>
        {status === 'done' ? <Check size={12} strokeWidth={3} /> : status === 'failed' ? <X size={12} strokeWidth={3} /> : <Spinner size={11} />}
        {step.label}
      </span>
      {withBar && status !== 'done' && status !== 'failed' && (
        <span className="h-1 w-28 overflow-hidden rounded-full bg-ink-600">
          <span className="block h-full rounded-full bg-lime transition-[width] duration-700 ease-out" style={{ width: `${step.pct}%` }} />
        </span>
      )}
    </span>
  );
}
