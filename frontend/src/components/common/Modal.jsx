import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useIsDesktop } from '../../hooks/useMedia';

/**
 * variant:
 *  - "dialog": hộp thoại giữa màn hình (mọi kích thước)
 *  - "sheet":  mobile trượt từ dưới lên (kéo xuống để đóng); desktop thành dialog
 *  - "drawer": mobile như sheet; desktop là panel bên phải (bình luận, chọn ngôn ngữ)
 */
export default function Modal({ open, onClose, title, variant = 'sheet', width = 440, footer, children }) {
  const desktop = useIsDesktop();
  const kind = variant === 'dialog' || (desktop && variant === 'sheet') ? 'dialog' : desktop ? 'drawer' : 'sheet';

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const panel = {
    dialog: { cls: 'm-auto max-h-[86dvh] rounded-xl', style: { width: `min(${width}px, calc(100vw - 32px))` },
      motion: { initial: { opacity: 0, scale: 0.97, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98 } } },
    drawer: { cls: 'ml-auto h-full w-[420px] border-l', style: {},
      motion: { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } } },
    sheet: { cls: 'mt-auto max-h-[82dvh] w-full rounded-t-xl pb-[env(safe-area-inset-bottom)]', style: {},
      motion: { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } } },
  }[kind];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={`relative flex flex-col border-line bg-surface text-fg shadow-pop ${panel.cls}`}
            style={panel.style}
            {...panel.motion}
            transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            drag={kind === 'sheet' ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 600) && onClose()}
          >
            {kind === 'sheet' && <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-surface-3" />}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-5 pr-3">
              <h2 className="text-md font-bold">{title}</h2>
              <button onClick={onClose} className="icon-btn" aria-label="Đóng"><X size={20} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto" onPointerDownCapture={(e) => kind === 'sheet' && e.stopPropagation()}>{children}</div>
            {footer && <footer className="shrink-0 border-t border-line px-5 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
