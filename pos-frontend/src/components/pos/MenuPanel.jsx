import React, { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { formatMoney } from "../../utils";
import EmptyState from "../shared/EmptyState";

const MenuPanel = ({ menu, quantities, onAdd }) => {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menu.items.filter((item) =>
      term ? item.name.toLowerCase().includes(term) : category === "all" || item.category === category
    );
  }, [menu.items, category, search]);

  const categoryName = Object.fromEntries(menu.categories.map((c) => [c._id, c.name]));
  const pills = [{ _id: "all", name: "All" }, ...menu.categories];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 lg:px-8 pt-6 space-y-4">
        <div className="relative">
          <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes"
            className="input !pl-10"
          />
        </div>
        {!search && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {pills.map((pill) => (
              <button
                key={pill._id}
                onClick={() => setCategory(pill._id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  category === pill._id ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300"
                }`}
              >
                {pill.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-4">
        {items.length === 0 ? (
          <EmptyState title="No dishes found">
            {menu.items.length === 0 ? "An admin can add dishes under Menu." : "Try a different search."}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {items.map((item) => {
              const quantity = quantities[item._id] || 0;
              const soldOut = !item.available;
              return (
                <button
                  key={item._id}
                  onClick={() => onAdd(item)}
                  disabled={soldOut}
                  className={`card relative p-3.5 h-[5.75rem] flex flex-col justify-between text-left transition select-none ${
                    soldOut
                      ? "opacity-50 cursor-not-allowed"
                      : quantity > 0
                        ? "border-brand-400 ring-1 ring-brand-400 active:scale-[0.98]"
                        : "hover:border-zinc-300 hover:shadow-sm active:scale-[0.98]"
                  }`}
                >
                  <div className="pr-8">
                    <p className="text-[14px] font-medium leading-snug line-clamp-2">{item.name}</p>
                    {search && <p className="text-xs text-zinc-500 mt-0.5">{categoryName[item.category]}</p>}
                  </div>
                  <p className="text-[13px] font-semibold text-zinc-600 tabular-nums">{soldOut ? <span className="text-red-600">Sold out</span> : formatMoney(item.price)}</p>
                  {quantity > 0 && (
                    <span className="absolute top-2.5 right-2.5 min-w-[1.375rem] h-[1.375rem] px-1.5 flex items-center justify-center rounded-full bg-brand-600 text-white text-[11px] font-semibold">
                      {quantity}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuPanel;
