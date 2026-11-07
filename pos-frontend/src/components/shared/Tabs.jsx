import React from "react";

// Segmented control used for filters, e.g. tabs={[{ value: "all", label: "All", count: 3 }]}
const Tabs = ({ tabs, value, onChange }) => {
  return (
    <div className="inline-flex flex-wrap p-1 bg-white rounded-xl border border-zinc-200 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className={`ml-1.5 tabular-nums ${active ? "text-zinc-400" : "text-zinc-500"}`}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
