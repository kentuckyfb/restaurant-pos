import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { LuPlay, LuArrowRight, LuBanknote, LuWallet, LuReceipt, LuChefHat } from "react-icons/lu";
import StatusBadge from "../components/shared/StatusBadge";
import StatCard from "../components/shared/StatCard";
import { BarList, ChartCard } from "../components/reports/Charts";
import { useCurrentShift, useOpenOrders } from "../hooks/useAppData";
import { getInventory, getStorage } from "../https";
import { applyLocalEdits } from "../offline/localOrders";
import { useLocalOrders } from "../offline/hooks";
import { canManageBills, formatMoney, formatNumber, formatTime, isAdmin, minutesSince, orderLabel, orderNumber } from "../utils";

const greetingFor = (hour) => (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");

const Banner = ({ tone, title, action }) => (
  <div className={`card px-5 py-4 flex flex-wrap items-center justify-between gap-3 ${tone === "red" ? "!border-red-200 !bg-red-50" : "!border-amber-200 !bg-amber-50"}`}>
    <p className="font-medium">{title}</p>
    {action}
  </div>
);

const Home = () => {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user);
  const [now, setNow] = useState(new Date());
  const { data: shift, isLoading: shiftLoading } = useCurrentShift();

  useEffect(() => {
    document.title = "Home · Restro";
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const localOrders = useLocalOrders();
  const { data: serverOpen = [] } = useOpenOrders();
  const openOrders = [...localOrders.filter((o) => o.kind === "new" && o.status === "Open"), ...applyLocalEdits(serverOpen, { openOnly: true })];

  const { data: lowStock = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: getInventory,
    select: (r) => r.data.filter((item) => item.quantity <= item.reorderLevel),
    enabled: isAdmin(user.role),
  });
  const { data: storage } = useQuery({
    queryKey: ["storage"],
    queryFn: getStorage,
    select: (r) => r.data,
    enabled: isAdmin(user.role),
    staleTime: 60 * 60 * 1000,
  });

  const summary = shift?.summary;
  const showMoney = canManageBills(user.role);
  const preparing = openOrders.filter((o) => o.kitchenStatus === "Preparing").length;
  const ready = openOrders.filter((o) => o.kitchenStatus === "Ready").length;
  const unpaid = openOrders.reduce((s, o) => s + o.bills.total, 0);

  return (
    <section className="page">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-600">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-[22px] font-semibold tracking-tight">{greetingFor(now.getHours())}, {user.name?.split(" ")[0]}</h1>
        </div>
        <p className="text-[22px] font-semibold tabular-nums text-zinc-800">{formatTime(now)}</p>
      </div>

      {!shiftLoading && !shift && (
        <Banner
          title="The day hasn't started yet"
          action={canManageBills(user.role)
            ? <Link to="/shifts" className="btn-primary !py-2"><LuPlay size={15} /> Start the day</Link>
            : <span className="text-sm text-zinc-600">Ask a cashier to start the day</span>}
        />
      )}
      {storage?.percent >= 80 && (
        <Banner tone="red" title={`Database is ${storage.percent}% full`} action={<Link to="/data?tab=archive" className="btn-primary !py-2">Archive old orders</Link>} />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {showMoney && <StatCard label="Sales today" icon={<LuBanknote size={18} />} iconTone="green" value={formatMoney(summary?.total)} hint={`${formatNumber(summary?.orders)} bills paid`} />}
        {showMoney && <StatCard label="Cash in drawer" icon={<LuWallet size={18} />} iconTone="blue" value={formatMoney(shift?.expectedCash)} hint={shift ? `${formatMoney(shift.openingCash)} float` : "Day not started"} />}
        <StatCard label="Open orders" icon={<LuReceipt size={18} />} value={openOrders.length} hint={`${formatMoney(unpaid)} unpaid`} />
        <StatCard label="In the kitchen" icon={<LuChefHat size={18} />} iconTone="amber" value={preparing} hint={ready ? `${ready} ready to serve` : "Nothing waiting to serve"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex justify-between items-center px-5 pt-5 pb-3">
            <h2 className="card-title">Open orders</h2>
            <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900">View all <LuArrowRight size={14} /></Link>
          </div>
          {openOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 border-t border-zinc-100">
              <span className="h-11 w-11 flex items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500"><LuReceipt size={20} /></span>
              <p className="text-sm font-medium text-zinc-700">No open orders</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Order</th><th>Where</th><th>Items</th><th>Time</th><th>Status</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {openOrders.slice(0, 10).map((order) => (
                  <tr key={order._id} onClick={() => navigate(`/pos/${order._id}`)} className="cursor-pointer">
                    <td className="font-semibold text-zinc-900 tabular-nums">{orderNumber(order)}</td>
                    <td>{orderLabel(order)}{order.customer?.name && <span className="text-zinc-500"> · {order.customer.name}</span>}</td>
                    <td className="tabular-nums">{order.items.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td className="text-zinc-600 tabular-nums">{minutesSince(order.createdAt)}m</td>
                    <td>
                      {order.local || order.offlineEdit
                        ? <StatusBadge status="Offline" label={order.local ? "Not synced" : "Changed offline"} tone="amber" />
                        : <StatusBadge status={order.kitchenStatus} label={order.kitchenStatus === "New" ? "Not sent" : order.kitchenStatus} />}
                    </td>
                    <td className="text-right font-medium text-zinc-900">{formatMoney(order.bills.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          {showMoney && shift && (
            <ChartCard title="Today's payments">
              <BarList rows={(summary?.byMethod || []).map((m) => ({ label: m.method, value: m.total, detail: `${m.count} bills` }))} formatValue={formatMoney} empty="No payments yet" />
            </ChartCard>
          )}
          {isAdmin(user.role) && (
            <div className="card overflow-hidden">
              <div className="flex justify-between items-center px-5 pt-5 pb-3">
                <h2 className="card-title">Low stock</h2>
                <Link to="/inventory" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900">Inventory <LuArrowRight size={14} /></Link>
              </div>
              {lowStock.length === 0 ? (
                <p className="text-sm text-zinc-500 px-5 pb-5">All stock above reorder levels</p>
              ) : (
                <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                  {lowStock.slice(0, 6).map((item) => (
                    <li key={item._id} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-zinc-700">{item.name}</span>
                      <span className="font-medium text-red-600 tabular-nums">{formatNumber(item.quantity, 2)} {item.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Home;
