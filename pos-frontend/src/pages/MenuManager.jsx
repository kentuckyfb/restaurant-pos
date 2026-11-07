import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuPlus, LuPencil, LuTrash2, LuX, LuBookOpen } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Modal from "../components/shared/Modal";
import EmptyState from "../components/shared/EmptyState";
import { useMenu } from "../hooks/useAppData";
import {
  createCategory, createMenuItem, deleteCategory, deleteMenuItem, getInventory, updateCategory, updateMenuItem,
} from "../https";
import { apiError, formatMoney } from "../utils";

const useMenuMutation = (mutationFn, onDone) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["menu"] });
      if (res?.message) enqueueSnackbar(res.message, { variant: "success" });
      onDone?.(res);
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });
};

const MenuManager = () => {
  const { data: menu } = useMenu();
  const [selected, setSelected] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => {
    document.title = "Menu · Restro";
  }, []);

  const categories = menu?.categories || [];
  const current = categories.find((c) => c._id === selected) || categories[0];
  const items = (menu?.items || []).filter((i) => i.category === current?._id);

  const toggle = useMenuMutation(updateMenuItem);
  const removeItem = useMenuMutation(deleteMenuItem);
  const removeCategory = useMenuMutation(deleteCategory, () => setSelected(null));

  return (
    <section className="page">
      <PageHeader title="Menu">
        <button onClick={() => setEditingCategory({})} className="btn-secondary"><LuPlus size={16} /> Category</button>
        <button onClick={() => setEditingItem({ category: current?._id })} disabled={!current} className="btn-primary"><LuPlus size={16} /> Dish</button>
      </PageHeader>

      {categories.length === 0 ? (
        <div className="card">
          <EmptyState icon={<LuBookOpen />} title="Your menu is empty">Add a category (e.g. Kottu, Beverages), then add dishes to it.</EmptyState>
        </div>
      ) : (
        <div className="grid md:grid-cols-[16rem_1fr] gap-4 items-start">
          <div className="card p-2">
            {categories.map((category) => {
              const count = menu.items.filter((i) => i.category === category._id).length;
              const active = category._id === current?._id;
              return (
                <div key={category._id} className={`group flex items-center rounded-xl ${active ? "bg-brand-50" : "hover:bg-zinc-50"}`}>
                  <button onClick={() => setSelected(category._id)} className={`flex-1 text-left px-3 py-2.5 text-sm font-medium ${active ? "text-brand-700" : "text-zinc-700"}`}>
                    {category.name} <span className="text-zinc-500 font-normal">{count}</span>
                  </button>
                  <button onClick={() => setEditingCategory(category)} className="btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Rename ${category.name}`}>
                    <LuPencil size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="font-semibold">{current?.name}</h2>
              {items.length === 0 && (
                <button onClick={() => removeCategory.mutate(current._id)} className="btn-ghost text-red-600 hover:bg-red-50 !py-1.5 text-xs"><LuTrash2 size={14} /> Delete category</button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-zinc-600 px-5 pb-10 pt-4">No dishes in this category yet.</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>Dish</th><th className="text-right">Price</th><th>Recipe</th><th>On sale</th><th /></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id} className={item.available ? "" : "bg-zinc-50/70"}>
                      <td className={`font-medium ${item.available ? "" : "text-zinc-500"}`}>{item.name}</td>
                      <td className="text-right tabular-nums">{formatMoney(item.price)}</td>
                      <td className="text-zinc-600 text-xs">{item.recipe.length ? `${item.recipe.length} ingredient${item.recipe.length > 1 ? "s" : ""}` : "—"}</td>
                      <td>
                        <button
                          role="switch"
                          aria-checked={item.available}
                          aria-label={`${item.name} on sale`}
                          onClick={() => toggle.mutate({ id: item._id, available: !item.available })}
                          className={`relative h-6 w-11 rounded-full transition-colors ${item.available ? "bg-emerald-500" : "bg-zinc-300"}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${item.available ? "left-[1.375rem]" : "left-0.5"}`} />
                        </button>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button onClick={() => setEditingItem(item)} className="btn-icon" aria-label={`Edit ${item.name}`}><LuPencil size={16} /></button>
                        <button onClick={() => window.confirm(`Delete ${item.name}? Past bills keep their copy.`) && removeItem.mutate(item._id)} className="btn-icon hover:!text-red-600" aria-label={`Delete ${item.name}`}>
                          <LuTrash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {editingCategory && <CategoryModal category={editingCategory} onClose={() => setEditingCategory(null)} onSaved={(res) => res.data && setSelected(res.data._id)} />}
      {editingItem && <ItemModal item={editingItem} categories={categories} onClose={() => setEditingItem(null)} />}
    </section>
  );
};

const CategoryModal = ({ category, onClose, onSaved }) => {
  const isNew = !category._id;
  const [name, setName] = useState(category.name || "");
  const [sortOrder, setSortOrder] = useState(category.sortOrder ?? 0);
  const mutation = useMenuMutation(isNew ? createCategory : updateCategory, (res) => { onSaved(res); onClose(); });

  return (
    <Modal title={isNew ? "Add category" : "Edit category"} onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ id: category._id, name, sortOrder }); }} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Position</label>
          <input type="number" className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          <p className="hint">Lower numbers show first on the POS.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
};

const ItemModal = ({ item, categories, onClose }) => {
  const isNew = !item._id;
  const [form, setForm] = useState({
    name: item.name || "",
    category: item.category || categories[0]?._id,
    price: item.price ?? "",
    available: item.available ?? true,
    recipe: item.recipe || [],
  });
  const { data: stock = [] } = useQuery({ queryKey: ["inventory"], queryFn: getInventory, select: (r) => r.data });
  const mutation = useMenuMutation(isNew ? createMenuItem : updateMenuItem, onClose);
  const stockById = Object.fromEntries(stock.map((s) => [s._id, s]));
  const unused = stock.filter((s) => !form.recipe.some((r) => r.ingredient === s._id));

  const setRecipe = (recipe) => setForm({ ...form, recipe });
  const cost = form.recipe.reduce((sum, r) => sum + (stockById[r.ingredient]?.costPerUnit || 0) * (Number(r.quantity) || 0), 0);

  return (
    <Modal title={isNew ? "Add dish" : `Edit ${item.name}`} onClose={onClose} size="lg">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ id: item._id, ...form }); }} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Price</label>
            <input type="number" min="0" step="any" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} className="h-4 w-4 accent-brand-600" />
          On sale (untick to mark sold out)
        </label>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="label">Recipe per portion <span className="text-zinc-500 font-normal">(optional)</span></label>
            {cost > 0 && <span className="text-xs text-zinc-600">Food cost {formatMoney(cost)}{Number(form.price) > 0 && ` · ${Math.round((cost / form.price) * 100)}% of price`}</span>}
          </div>
          <p className="hint !mt-0 mb-2">These stock items are deducted each time this dish is sold.</p>
          <div className="space-y-2">
            {form.recipe.map((row, index) => (
              <div key={row.ingredient} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{stockById[row.ingredient]?.name || "Unknown item"}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.quantity}
                  onChange={(e) => setRecipe(form.recipe.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)))}
                  className="input !py-1.5 w-28 tabular-nums"
                />
                <span className="w-10 text-sm text-zinc-600">{stockById[row.ingredient]?.unit}</span>
                <button type="button" onClick={() => setRecipe(form.recipe.filter((_, i) => i !== index))} className="btn-icon" aria-label="Remove ingredient"><LuX size={16} /></button>
              </div>
            ))}
            {unused.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && setRecipe([...form.recipe, { ingredient: e.target.value, quantity: 1 }])}
                className="input !py-2 text-zinc-600"
              >
                <option value="">+ Add ingredient…</option>
                {unused.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.unit})</option>)}
              </select>
            )}
            {stock.length === 0 && <p className="text-sm text-zinc-600">Add stock items under Inventory to build recipes.</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">{isNew ? "Add dish" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
};

export default MenuManager;
