import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { errMsg } from '../../api/axiosClient';
import { viDate } from '../../components/analytics/Charts';

export const RANGES = [[7, '7 ngày'], [28, '28 ngày'], [60, '60 ngày'], [365, '365 ngày']];
export const SOURCE_LABEL = { for_you: 'Dành cho bạn', following: 'Đang theo dõi', profile: 'Trang cá nhân', search: 'Tìm kiếm', direct: 'Link trực tiếp', other: 'Khác' };

export const periodText = (p) => (p ? `${viDate(p.from)} – ${viDate(p.to)}` : ' ');

/** Tải dữ liệu theo deps, huỷ kết quả cũ khi deps đổi */
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null });
    loader()
      .then((data) => alive && setState({ data, error: null }))
      .catch((error) => {
        if (!alive) return;
        setState({ data: null, error });
        toast.error(errMsg(error));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Hàng nút chọn khoảng thời gian (cuộn ngang trên điện thoại) */
export function RangePills({ value, onChange, options = RANGES }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Khoảng thời gian">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`shrink-0 rounded-full px-5 py-2 text-sm font-bold transition ${value === v ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted hover:text-fg'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
