import { Check, X } from 'lucide-react';
import Spinner from '../common/Spinner';
import { DUB_STEPS } from '../../utils/constants';

/** status: AudioTrack.status (pending|transcribing|translating|synthesizing|done|failed) */
export default function DubbingStatusBadge({ status, withBar = false }) {
  const step = DUB_STEPS[status] || DUB_STEPS.pending;
  const tone = status === 'done' ? 'text-success' : status === 'failed' ? 'text-danger' : 'text-fg-muted';
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
        {status === 'done' ? <Check size={13} strokeWidth={3} /> : status === 'failed' ? <X size={13} strokeWidth={3} /> : <Spinner size={11} />}
        {step.label}
      </span>
      {withBar && status !== 'done' && status !== 'failed' && (
        <span className="h-1 w-24 overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${step.pct}%` }} />
        </span>
      )}
    </span>
  );
}
