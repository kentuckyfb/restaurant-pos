import React, { useState } from "react";
import Modal from "./Modal";

// Asks for a reason before a destructive action (cancel order, etc.)
const ReasonDialog = ({ title, message, confirmLabel = "Confirm", suggestions = [], onConfirm, onClose, isPending }) => {
  const [reason, setReason] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (reason.trim()) onConfirm(reason.trim());
  };

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {message && <p className="text-sm text-zinc-600">{message}</p>}
        <div>
          <label className="label">Reason</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus required />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {suggestions.map((s) => (
                <button type="button" key={s} onClick={() => setReason(s)} className="px-2.5 py-1 rounded-lg bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" disabled={!reason.trim() || isPending} className="btn-danger">{confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
};

export default ReasonDialog;
