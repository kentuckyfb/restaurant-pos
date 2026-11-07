import React from "react";

const tones = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

const toneFor = {
  Open: "blue",
  Paid: "green",
  Cancelled: "red",
  Merged: "gray",
  Refunded: "amber",
  Offline: "amber",
  New: "gray",
  Preparing: "amber",
  Ready: "green",
  Served: "gray",
  Available: "green",
  Booked: "brand",
  Low: "red",
  OK: "green",
  open: "green",
  closed: "gray",
  Active: "green",
  Inactive: "gray",
  "Sold out": "red",
};

const StatusBadge = ({ status, label, tone }) => {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset whitespace-nowrap ${tones[tone || toneFor[status] || "gray"]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label || status}
    </span>
  );
};

export default StatusBadge;
