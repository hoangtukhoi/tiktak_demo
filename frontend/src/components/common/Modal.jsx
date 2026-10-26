import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * variant="sheet": trượt từ dưới lên, kéo xuống để đóng (mặc định, kiểu TikTok mobile)
 * variant="center": hộp thoại giữa màn hình
 */
export default function Modal({ open, onClose, title, variant = 'sheet', children, className = '' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const sheet = variant === 'sheet';
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className={`fixed inset-0 z-50 flex justify-center ${sheet ? 'items-end' : 'items-center'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={
              sheet
                ? `relative flex max-h-[78dvh] w-full max-w-[520px] flex-col rounded-t-[28px] border border-b-0 border-ink-600 bg-ink-800 pb-[env(safe-area-inset-bottom)] ${className}`
                : `relative flex max-h-[86dvh] w-[min(92vw,460px)] flex-col rounded-[28px] border border-ink-600 bg-ink-800 ${className}`
            }
            initial={sheet ? { y: '100%' } : { scale: 0.92, opacity: 0 }}
            animate={sheet ? { y: 0 } : { scale: 1, opacity: 1 }}
            exit={sheet ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag={sheet ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 120 || i.velocity.y > 600) && onClose()}
          >
            {sheet && <div className="mx-auto mt-3 h-1 w-10 shrink-0 cursor-grab rounded-full bg-ink-500" />}
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
              <h3 className="text-xl font-extrabold">{title}</h3>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink-600" aria-label="Đóng">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5" onPointerDownCapture={(e) => e.stopPropagation()}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
