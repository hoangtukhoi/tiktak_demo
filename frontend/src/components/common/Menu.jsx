import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** Menu thả xuống nhỏ. items: [{ label, icon: Icon, onClick, danger }] */
export default function Menu({ trigger, items, align = 'right', up = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', h);
    addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', h); removeEventListener('keydown', k); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, y: up ? 4 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className={`absolute z-40 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-pop ${align === 'right' ? 'right-0' : 'left-0'} ${up ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          >
            {items.filter(Boolean).map(({ label, icon: Icon, onClick, danger }) => (
              <li key={label}>
                <button
                  role="menuitem"
                  onClick={() => { setOpen(false); onClick(); }}
                  className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-2 ${danger ? 'text-danger' : 'text-fg'}`}
                >
                  {Icon && <Icon size={17} strokeWidth={1.75} />} {label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
