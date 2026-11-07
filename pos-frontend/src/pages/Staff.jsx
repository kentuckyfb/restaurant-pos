import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuUserPlus, LuPencil } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Modal from "../components/shared/Modal";
import StatusBadge from "../components/shared/StatusBadge";
import { createStaff, getStaff, updateStaff } from "../https";
import { apiError, getAvatarName } from "../utils";

const ROLES = [
  { value: "Waiter", hint: "Takes orders, sends to kitchen, prints bills." },
  { value: "Cashier", hint: "Also takes payments, discounts, cancels orders and opens/closes the day." },
  { value: "Admin", hint: "Everything, including menu, stock, reports, staff and settings." },
];

const Staff = () => {
  const me = useSelector((state) => state.user);
  const [editing, setEditing] = useState(null);
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: getStaff, select: (r) => r.data });

  useEffect(() => {
    document.title = "Staff · Restro";
  }, []);

  return (
    <section className="page">
      <PageHeader title="Staff">
        <button onClick={() => setEditing({})} className="btn-primary"><LuUserPlus size={16} /> Add staff</button>
      </PageHeader>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {staff.map((user) => (
              <tr key={user._id} className={user.active ? "" : "text-zinc-500"}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">{getAvatarName(user.name)}</span>
                    <span className="font-medium">{user.name}{user._id === me._id && <span className="text-zinc-500 font-normal"> (you)</span>}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td className="tabular-nums">{user.phone}</td>
                <td>{user.role}</td>
                <td><StatusBadge status={user.active ? "Active" : "Inactive"} /></td>
                <td className="text-right"><button onClick={() => setEditing(user)} className="btn-icon" aria-label={`Edit ${user.name}`}><LuPencil size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <StaffModal user={editing} isSelf={editing._id === me._id} onClose={() => setEditing(null)} />}
    </section>
  );
};

const StaffModal = ({ user, isSelf, onClose }) => {
  const queryClient = useQueryClient();
  const isNew = !user._id;
  const [form, setForm] = useState({
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role || "Waiter",
    active: user.active ?? true,
    password: "",
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const mutation = useMutation({
    mutationFn: isNew ? createStaff : updateStaff,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      // Editing yourself updates the name shown in the sidebar straight away
      queryClient.invalidateQueries({ queryKey: ["me"] });
      enqueueSnackbar(res.message, { variant: "success" });
      onClose();
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const submit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (!isNew && !data.password) delete data.password;
    mutation.mutate({ id: user._id, ...data });
  };

  return (
    <Modal title={isNew ? "Add staff member" : `Edit ${user.name}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">Full name</label><input className="input" value={form.name} onChange={set("name")} required autoFocus /></div>
          <div><label className="label">Phone</label><input type="tel" className="input" value={form.phone} onChange={set("phone")} placeholder="07X XXX XXXX" required /></div>
          <div><label className="label">Email (used to log in)</label><input type="email" className="input" value={form.email} onChange={set("email")} required /></div>
          <div>
            <label className="label">{isNew ? "Password" : "New password"}</label>
            <input type="password" className="input" value={form.password} onChange={set("password")} minLength={8} required={isNew} placeholder={isNew ? "At least 8 characters" : "Leave blank to keep"} autoComplete="new-password" />
          </div>
        </div>
        <div>
          <label className="label">Role</label>
          <div className="grid sm:grid-cols-3 gap-2">
            {ROLES.map((role) => (
              <button
                type="button"
                key={role.value}
                onClick={() => !isSelf && setForm({ ...form, role: role.value })}
                disabled={isSelf && role.value !== form.role}
                className={`text-left p-3 rounded-xl border transition disabled:opacity-40 ${form.role === role.value ? "border-brand-500 bg-brand-50" : "border-zinc-200 hover:bg-zinc-50"}`}
              >
                <p className="text-sm font-medium">{role.value}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{role.hint}</p>
              </button>
            ))}
          </div>
        </div>
        {!isNew && !isSelf && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-brand-600" />
            Active (can log in)
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">{isNew ? "Add staff member" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
};

export default Staff;
