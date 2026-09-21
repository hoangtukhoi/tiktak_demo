import { DUBBING_STATUS_LABELS } from '../../utils/constants';

const STYLES = {
  pending: 'bg-white/10 text-gray-300',
  extracting: 'bg-blue-500/20 text-blue-300',
  transcribing: 'bg-blue-500/20 text-blue-300',
  translating: 'bg-indigo-500/20 text-indigo-300',
  synthesizing: 'bg-purple-500/20 text-purple-300',
  done: 'bg-green-500/20 text-green-300',
  failed: 'bg-red-500/20 text-red-300',
};

/** Hiển thị trạng thái pipeline lồng tiếng kèm phần trăm khi đang chạy. */
export default function DubbingStatusBadge({ status = 'pending', progress = 0, className = '' }) {
  const label = DUBBING_STATUS_LABELS[status] || status;
  const showProgress = !['done', 'failed', 'pending'].includes(status) && progress > 0;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs whitespace-nowrap ${STYLES[status] || STYLES.pending} ${className}`}
    >
      {label}
      {showProgress && <span className="opacity-80">{progress}%</span>}
    </span>
  );
}
