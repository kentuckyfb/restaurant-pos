import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { LuX } from 'react-icons/lu';

const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" };

const Modal = ({ isOpen = true, onClose, title, subtitle, size = "md", footer, children }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div onMouseDown={onClose} className="fixed inset-0 !m-0 bg-zinc-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <motion.div
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        className={`bg-white text-zinc-900 text-left rounded-2xl shadow-xl w-full ${sizes[size]} max-h-[92vh] flex flex-col`}>
        <div className="flex justify-between items-start gap-4 px-6 pt-5 pb-1">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-zinc-600 mt-0.5">{subtitle}</p>}
          </div>
          <button aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700" onClick={onClose}>
            <LuX size={20} />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto">
          {children}
        </div>
        {footer && <div className="px-6 pb-5 pt-2 flex justify-end gap-2">{footer}</div>}
      </motion.div>
    </div>
  );
};

export default Modal;
