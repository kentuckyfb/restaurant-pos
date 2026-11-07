import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import PageHeader from "../components/shared/PageHeader";
import { useSettings } from "../hooks/useAppData";
import { updateSettings } from "../https";
import { apiError, computeBill, formatMoney, setCurrencySymbol } from "../utils";

const Section = ({ title, description, children }) => (
  <div className="card p-6 grid md:grid-cols-[14rem_1fr] gap-6">
    <div>
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="text-sm text-zinc-600 mt-1">{description}</p>}
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

const Toggle = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 mt-0.5 accent-brand-600" />
    <span>
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-zinc-600">{hint}</span>}
    </span>
  </label>
);

const Settings = () => {
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const [form, setForm] = useState(null);

  useEffect(() => {
    document.title = "Settings · Restro";
  }, []);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (res) => {
      queryClient.setQueryData(["settings"], res);
      setCurrencySymbol(res.data.currencySymbol);
      enqueueSnackbar("Settings saved", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  if (!form) return null;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setNumber = (key) => (e) => setForm({ ...form, [key]: e.target.value === "" ? "" : Number(e.target.value) });
  const example = computeBill({ items: [{ price: 1000, quantity: 1 }], type: "dine-in" }, { ...form, serviceChargeRate: Number(form.serviceChargeRate) || 0, vatRate: Number(form.vatRate) || 0 });
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <section className="page">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
        <PageHeader title="Settings">
          <button type="submit" disabled={!dirty || mutation.isPending} className="btn-primary">Save changes</button>
        </PageHeader>

        <Section title="Business" description="Printed at the top of every receipt.">
          <div><label className="label">Business name</label><input className="input" value={form.businessName} onChange={set("businessName")} required /></div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={set("address")} placeholder="No. 12, Galle Road, Colombo 03" /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set("phone")} placeholder="011 234 5678" /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={set("email")} /></div>
          </div>
        </Section>

        <Section title="Taxes & charges" description="Applied to every bill. Changes only affect new bills.">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Service charge (%)</label>
              <input type="number" min="0" max="100" step="any" className="input" value={form.serviceChargeRate} onChange={setNumber("serviceChargeRate")} />
              <p className="hint">Usually 10% in Sri Lanka. Set 0 to turn off.</p>
            </div>
            <div>
              <label className="label">VAT (%)</label>
              <input type="number" min="0" max="100" step="any" className="input" value={form.vatRate} onChange={setNumber("vatRate")} />
              <p className="hint">Only if you're VAT registered (18% at the time of writing; check the current IRD rate). Charged on food plus service charge.</p>
            </div>
            <div><label className="label">VAT registration no.</label><input className="input" value={form.vatNumber} onChange={set("vatNumber")} placeholder="Shown on receipts if set" /></div>
            <div><label className="label">Currency symbol</label><input className="input" value={form.currencySymbol} onChange={set("currencySymbol")} /></div>
          </div>
          <Toggle
            checked={form.serviceChargeOnTakeaway}
            onChange={(v) => setForm({ ...form, serviceChargeOnTakeaway: v })}
            label="Charge service charge on takeaway and delivery"
            hint="Off by default: service charge normally applies to dine-in only."
          />
          <p className="text-sm rounded-xl bg-zinc-50 p-3 text-zinc-600">
            Example: a {formatMoney(1000)} dine-in bill comes to <span className="font-semibold text-zinc-900">{formatMoney(example.total)}</span>
            {" "}({formatMoney(example.serviceCharge)} service charge{example.vat ? `, ${formatMoney(example.vat)} VAT` : ""}).
          </p>
        </Section>

        <Section title="Receipts">
          <div>
            <label className="label">Footer message</label>
            <textarea rows={2} className="input" value={form.receiptFooter} onChange={set("receiptFooter")} />
          </div>
        </Section>

        <Section title="Sending bills" description="Text or email the bill to customers after payment. Set up on the server for security.">
          <ul className="space-y-3 text-sm">
            {[
              ["Email", form.messaging?.email, "Add SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM to the server's .env. With Gmail: smtp.gmail.com, port 465 and an App Password."],
              ["SMS", form.messaging?.sms, "Open an account at notify.lk (paid per SMS), get an approved sender ID, then add NOTIFY_USER_ID, NOTIFY_API_KEY and NOTIFY_SENDER_ID to the server's .env."],
              ["Online receipt links", form.messaging?.receiptLinks, "Set PUBLIC_APP_URL to your POS web address so texts and emails include a link to view the bill."],
            ].map(([label, ready, help]) => (
              <li key={label} className="flex gap-3">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ready ? "bg-emerald-500" : "bg-zinc-300"}`} />
                <div>
                  <p className="font-medium">{label}: {ready ? "ready" : "not set up"}</p>
                  {!ready && <p className="text-xs text-zinc-600 mt-0.5">{help}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-600">After changing the .env file, restart the server.</p>
        </Section>

        <Section title="Daily routine & permissions">
          <Toggle
            checked={form.requireShift}
            onChange={(v) => setForm({ ...form, requireShift: v })}
            label="Require the day to be started before taking orders"
            hint="Recommended. Every bill then belongs to a day, so end-of-day cash counts add up."
          />
          <Toggle
            checked={form.cashierRefunds}
            onChange={(v) => setForm({ ...form, cashierRefunds: v })}
            label="Let cashiers give refunds"
            hint="Off by default: only admins can refund a paid bill. Every refund records who gave it and why."
          />
        </Section>
      </form>
    </section>
  );
};

export default Settings;
