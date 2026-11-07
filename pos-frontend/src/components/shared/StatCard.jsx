import React from "react";

const chipTones = {
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  blue: "bg-sky-50 text-sky-600 ring-sky-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
};

// A headline number. `tone` colours the value for warnings (e.g. "red"); `iconTone` colours the icon chip.
const StatCard = ({ label, value, hint, icon, tone, iconTone = "brand" }) => (
  <div className="card p-5">
    <div className="flex items-center justify-between gap-3">
      <p className="eyebrow">{label}</p>
      {icon && (
        <span className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-xl ring-1 ring-inset ${chipTones[iconTone]}`}>
          {icon}
        </span>
      )}
    </div>
    <p className={`${icon ? "mt-2" : "mt-3"} text-[28px] leading-none font-semibold tracking-tight tabular-nums ${tone === "red" ? "text-red-600" : "text-zinc-900"}`}>{value}</p>
    {hint && <p className="mt-2.5 text-[13px] text-zinc-600 truncate">{hint}</p>}
  </div>
);

// A row of smaller figures under the headline numbers
export const StatStrip = ({ items }) => (
  <div className="card grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-zinc-200">
    {items.map(([label, value]) => (
      <div key={label} className="px-5 py-3.5">
        <p className="text-[13px] text-zinc-600">{label}</p>
        <p className="mt-0.5 font-semibold tabular-nums text-zinc-900">{value}</p>
      </div>
    ))}
  </div>
);

export default StatCard;
