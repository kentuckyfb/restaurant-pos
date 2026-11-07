import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuMail, LuMessageSquare } from "react-icons/lu";
import { sendReceipt } from "../../https";
import { useSettings } from "../../hooks/useAppData";
import { useOnline } from "../../offline/hooks";
import { apiError } from "../../utils";

// Lets the cashier text or email the bill to the customer
const SendReceipt = ({ order }) => {
  const { data: settings } = useSettings();
  const online = useOnline();
  const [channel, setChannel] = useState(order.customer?.email && !order.customer?.phone ? "email" : "sms");
  const [to, setTo] = useState({ sms: order.customer?.phone || "", email: order.customer?.email || "" });

  const mutation = useMutation({
    mutationFn: sendReceipt,
    onSuccess: (res) => enqueueSnackbar(res.message, { variant: "success" }),
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const ready = settings?.messaging?.[channel];

  if (order.local || order.offlineEdit) {
    return <p className="text-xs text-zinc-600">You can text or email this bill once it has synced.</p>;
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ id: order._id, channel, to: to[channel] }); }} className="space-y-2">
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
        {[["sms", "SMS", LuMessageSquare], ["email", "Email", LuMail]].map(([value, label, Icon]) => (
          <button type="button" key={value} onClick={() => setChannel(value)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${channel === value ? "bg-white shadow-sm" : "text-zinc-600"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type={channel === "sms" ? "tel" : "email"}
          value={to[channel]}
          onChange={(e) => setTo({ ...to, [channel]: e.target.value })}
          placeholder={channel === "sms" ? "07X XXX XXXX" : "customer@email.com"}
          className="input"
          required
        />
        <button type="submit" disabled={!ready || !online || mutation.isPending} className="btn-secondary shrink-0">
          {mutation.isPending ? "Sending…" : "Send"}
        </button>
      </div>
      {!ready && (
        <p className="text-xs text-zinc-600">
          {channel === "sms" ? "SMS" : "Email"} isn't set up on the server yet. See Settings → Sending bills.
        </p>
      )}
      {ready && !online && <p className="text-xs text-zinc-600">Needs an internet connection.</p>}
    </form>
  );
};

export default SendReceipt;
