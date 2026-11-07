import React, { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import Tabs from "../components/shared/Tabs";
import StatCard, { StatStrip } from "../components/shared/StatCard";
import { AreaChart, BarList, ChartCard, ColumnChart } from "../components/reports/Charts";
import { getSalesReport } from "../https";
import { ORDER_TYPES, endOfDay, formatCompact, formatMoney, formatNumber, formatOrderNo, startOfDay, toInputDate } from "../utils";

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const presets = {
  today: () => [new Date(), new Date()],
  yesterday: () => [addDays(new Date(), -1), addDays(new Date(), -1)],
  week: () => [addDays(new Date(), -6), new Date()],
  month: () => [new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date()],
  "30d": () => [addDays(new Date(), -29), new Date()],
};

const Reports = () => {
  const [preset, setPreset] = useState("week");
  const [range, setRange] = useState(() => presets.week().map(toInputDate));

  useEffect(() => {
    document.title = "Reports · Restro";
  }, []);

  const choosePreset = (value) => {
    setPreset(value);
    if (presets[value]) setRange(presets[value]().map(toInputDate));
  };

  const from = startOfDay(new Date(`${range[0]}T00:00`));
  const to = endOfDay(new Date(`${range[1]}T00:00`));

  const { data: report } = useQuery({
    queryKey: ["report", range],
    queryFn: () => getSalesReport({ from: from.toISOString(), to: to.toISOString() }),
    select: (r) => r.data,
    placeholderData: keepPreviousData,
  });

  // Fill in days with no sales so the chart shows gaps honestly
  const days = useMemo(() => {
    if (!report) return [];
    const byDate = Object.fromEntries(report.byDay.map((d) => [d.date, d]));
    const out = [];
    for (let d = new Date(from); d <= to && out.length < 93; d = addDays(d, 1)) {
      const key = toInputDate(d);
      out.push({
        label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
        short: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        value: byDate[key]?.total || 0,
        detail: `${byDate[key]?.orders || 0} bills`,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, range]);

  const hours = useMemo(() => {
    if (!report) return [];
    const byHour = Object.fromEntries(report.byHour.map((h) => [h.hour, h]));
    const used = report.byHour.map((h) => h.hour);
    const start = Math.min(8, ...used);
    const end = Math.max(22, ...used);
    return Array.from({ length: end - start + 1 }, (_, i) => {
      const hour = start + i;
      const label = `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;
      return { label, value: byHour[hour]?.total || 0, detail: `${byHour[hour]?.orders || 0} bills` };
    });
  }, [report]);

  const t = report?.totals;
  const peak = hours.reduce((best, h) => (h.value > (best?.value || 0) ? h : best), null);

  return (
    <section className="page">
      <PageHeader title="Reports">
        <Tabs
          tabs={[
            { value: "today", label: "Today" },
            { value: "yesterday", label: "Yesterday" },
            { value: "week", label: "7 days" },
            { value: "30d", label: "30 days" },
            { value: "month", label: "This month" },
          ]}
          value={preset}
          onChange={choosePreset}
        />
        <div className="flex items-center gap-1.5">
          <input type="date" value={range[0]} max={range[1]} onChange={(e) => { setPreset("custom"); setRange([e.target.value, range[1]]); }} className="input !py-2 !w-auto" aria-label="From" />
          <span className="text-zinc-500">–</span>
          <input type="date" value={range[1]} min={range[0]} onChange={(e) => { setPreset("custom"); setRange([range[0], e.target.value]); }} className="input !py-2 !w-auto" aria-label="To" />
        </div>
      </PageHeader>

      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Net sales" value={formatMoney(t.net)} hint={t.refunds ? `after ${formatMoney(t.refunds)} refunds` : "incl. service charge & VAT"} />
            <StatCard label="Bills" value={formatNumber(t.orders)} hint={`${formatNumber(report.cancelled)} cancelled`} />
            <StatCard label="Average bill" value={formatMoney(t.orders ? t.total / t.orders : 0)} />
            <StatCard label="Guests" value={formatNumber(t.guests)} hint={t.orders ? `${(t.guests / t.orders).toFixed(1)} per bill` : undefined} />
          </div>

          <StatStrip
            items={[
              ["Discounts", formatMoney(t.discount)],
              ["Service charge", formatMoney(t.serviceCharge)],
              ["VAT", formatMoney(t.vat)],
              ["Refunds", formatMoney(t.refunds)],
            ]}
          />

          <div className="grid lg:grid-cols-3 gap-4">
            <ChartCard title="Sales" aside={formatMoney(t.total)} className="lg:col-span-2">
              {days.length > 10 ? (
                <AreaChart data={days} formatValue={formatMoney} formatAxis={formatCompact} labelEvery={Math.ceil(days.length / 8)} />
              ) : (
                <ColumnChart data={days} formatValue={formatMoney} formatAxis={formatCompact} />
              )}
            </ChartCard>
            <ChartCard title="Payment methods">
              <BarList rows={report.byMethod.map((m) => ({ label: m.method, value: m.total, detail: `${m.orders} bills` }))} formatValue={formatMoney} />
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <ChartCard title="Busy hours" aside={peak ? `Peak ${peak.label}` : undefined} className="lg:col-span-2">
              <ColumnChart data={hours} formatValue={formatMoney} formatAxis={formatCompact} labelEvery={2} height={180} />
            </ChartCard>
            <ChartCard title="Order types">
              <BarList rows={report.byType.map((m) => ({ label: ORDER_TYPES[m.type], value: m.total, detail: `${m.orders} bills` }))} formatValue={formatMoney} />
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 items-start">
            <ChartCard title="Categories">
              <BarList rows={report.byCategory.map((c) => ({ label: c.category || "Uncategorised", value: c.revenue }))} formatValue={formatMoney} />
            </ChartCard>

            <div className="card overflow-hidden lg:col-span-2">
              <h2 className="card-title px-5 pt-5 pb-3">Best sellers</h2>
              <table className="data-table">
                <thead><tr><th className="w-10">#</th><th>Dish</th><th className="text-right">Sold</th><th className="text-right">Revenue</th></tr></thead>
                <tbody>
                  {report.topItems.slice(0, 10).map((item, i) => (
                    <tr key={item.name}>
                      <td className="text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="font-medium text-zinc-900">{item.name}</td>
                      <td className="text-right">{formatNumber(item.quantity)}</td>
                      <td className="text-right">{formatMoney(item.revenue)}</td>
                    </tr>
                  ))}
                  {report.topItems.length === 0 && <tr><td colSpan={4} className="text-center text-zinc-500 py-10">No sales in this period</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {report.discounts.length > 0 && (
            <div className="card overflow-hidden">
              <h2 className="card-title px-5 pt-5 pb-3">Discounts</h2>
              <table className="data-table">
                <thead><tr><th>Bill</th><th>Reason</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {report.discounts.map((d) => (
                    <tr key={d._id}>
                      <td className="font-medium tabular-nums">#{formatOrderNo(d.orderNo)}</td>
                      <td>{d.discount?.reason}</td>
                      <td className="text-right">{formatMoney(d.bills.discount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default Reports;
