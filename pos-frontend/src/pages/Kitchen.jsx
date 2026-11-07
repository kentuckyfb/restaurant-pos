import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuChefHat, LuCheck, LuTimer, LuStickyNote, LuCookingPot, LuBellRing } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import { getOrders, updateKitchenStatus } from "../https";
import { readCache, writeCache } from "../offline/cache";
import { isNetworkError } from "../offline/network";
import { applyLocalEdits, getLocalOrder, saveLocalOrder, saveOrderEdit } from "../offline/localOrders";
import { useLocalOrders } from "../offline/hooks";
import { fallbackInterval, isLive, useLive } from "../offline/realtime";
import { apiError, minutesSince, orderLabel, orderNumber } from "../utils";

// "#261025-003" as a small date and a big count, so the count reads from across the kitchen
const TicketNumber = ({ order }) => {
  const [date, count] = orderNumber(order).split("-");
  if (!count || order.local) return <span className="text-2xl font-bold">{orderNumber(order)}</span>;
  return (
    <>
      <span className="text-sm font-semibold text-zinc-500">{date}-</span>
      <span className="text-2xl font-bold">{count}</span>
    </>
  );
};

// Tickets older than this many minutes are flagged as late
const LATE_AFTER = 20;

const Kitchen = () => {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);

  useEffect(() => {
    document.title = "Kitchen · Restro";
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const localOrders = useLocalOrders();
  const live = useLive();
  const { data: serverTickets = [], isLoading } = useQuery({
    queryKey: ["orders", "kitchen"],
    queryFn: async () => {
      try {
        const result = await getOrders({ kitchen: 1, limit: 100 });
        writeCache("orders-kitchen", result);
        return result;
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        // Offline: use the saved kitchen list plus the saved open orders (kept fresh on every device)
        const merged = new Map();
        [readCache("orders-kitchen"), readCache("orders-open")].forEach((saved) => saved?.data?.forEach((o) => merged.set(o._id, o)));
        return { data: [...merged.values()] };
      }
    },
    select: (r) => r.data,
    refetchInterval: fallbackInterval(live, 15000),
  });

  // Server tickets with offline changes laid over them, plus orders taken offline on this till
  const orders = [...applyLocalEdits(serverTickets), ...localOrders.filter((o) => o.kind === "new")]
    .filter((o) => !["Cancelled", "Merged"].includes(o.status) && ["Preparing", "Ready"].includes(o.kitchenStatus))
    // Oldest first: that's the next one to cook or serve
    .sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt));

  // Works offline too: the change is saved on this device and synced later
  const mutation = useMutation({
    mutationFn: async ({ order, kitchenStatus }) => {
      if (order.local) return saveLocalOrder({ ...getLocalOrder(order._id), kitchenStatus });
      if (order.offlineEdit) return saveOrderEdit(order, { kitchenStatus });
      try {
        return await updateKitchenStatus({ id: order._id, kitchenStatus });
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        return saveOrderEdit(order, { kitchenStatus });
      }
    },
    // The live notice refreshes this ticket; reload ourselves only if not connected
    onSuccess: () => !isLive() && queryClient.invalidateQueries({ queryKey: ["orders"] }),
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const lanes = [
    { status: "Preparing", title: "Preparing", icon: LuCookingPot, action: "Mark ready", next: "Ready", dot: "bg-amber-500", stripe: "bg-amber-400" },
    { status: "Ready", title: "Ready to serve", icon: LuBellRing, action: "Served", next: "Served", dot: "bg-emerald-500", stripe: "bg-emerald-500" },
  ];
  const lateCount = orders.filter((o) => o.kitchenStatus === "Preparing" && minutesSince(o.updatedAt) >= LATE_AFTER).length;

  return (
    <section className="page">
      <PageHeader title="Kitchen">
        {lateCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 text-sm font-medium">
            <LuTimer size={15} /> {lateCount} waiting over {LATE_AFTER} min
          </span>
        )}
      </PageHeader>

      {!isLoading && orders.length === 0 ? (
        <div className="card">
          <EmptyState icon={<LuChefHat />} title="Nothing to cook">Orders appear here as soon as they&apos;re sent to the kitchen.</EmptyState>
        </div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-5 items-start">
          {lanes.map((lane) => {
            const tickets = orders.filter((o) => o.kitchenStatus === lane.status);
            const LaneIcon = lane.icon;
            return (
              <div key={lane.status} className="rounded-2xl bg-zinc-200/50 p-3">
                <div className="flex items-center justify-between px-2 pt-1 pb-3">
                  <h2 className="flex items-center gap-2 font-semibold text-zinc-900">
                    <span className={`h-2.5 w-2.5 rounded-full ${lane.dot}`} />
                    {lane.title}
                  </h2>
                  <span className="min-w-7 h-7 px-2 inline-flex items-center justify-center rounded-full bg-white text-sm font-semibold tabular-nums text-zinc-800 shadow-sm">{tickets.length}</span>
                </div>

                {tickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-14 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500">
                    <LaneIcon size={22} />
                    <p className="text-sm">{lane.status === "Preparing" ? "Nothing cooking" : "Nothing waiting"}</p>
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
                    {tickets.map((order) => {
                      const age = minutesSince(order.updatedAt);
                      const late = lane.status === "Preparing" && age >= LATE_AFTER;
                      const lines = order.items.filter((item) => item.sent);
                      return (
                        <article key={order._id} className={`relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 flex flex-col ${late ? "ring-red-300" : "ring-zinc-200"}`}>
                          <div className={`h-1.5 ${late ? "bg-red-500" : lane.stripe}`} />
                          <div className="p-4 flex flex-col flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="whitespace-nowrap tracking-tight tabular-nums text-zinc-900 leading-none"><TicketNumber order={order} /></p>
                                <p className="mt-1.5 text-sm font-medium text-zinc-700 truncate">
                                  {orderLabel(order)}{order.customer?.name && <span className="font-normal text-zinc-500"> · {order.customer.name}</span>}
                                </p>
                              </div>
                              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-semibold tabular-nums ${late ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700"}`}>
                                <LuTimer size={14} /> {age}m
                              </span>
                            </div>

                            <ul className="mt-4 space-y-2 flex-1">
                              {lines.map((item) => (
                                <li key={item._id}>
                                  <div className="flex items-start gap-2.5">
                                    <span className="shrink-0 min-w-7 h-7 px-1.5 inline-flex items-center justify-center rounded-md bg-zinc-900 text-white text-sm font-bold tabular-nums">{item.quantity}</span>
                                    <span className="pt-0.5 text-[15px] font-medium text-zinc-900 leading-snug">{item.name}</span>
                                  </div>
                                  {item.note && (
                                    <p className="mt-1 ml-[38px] inline-flex items-start gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-800 text-[13px] font-medium">
                                      <LuStickyNote size={13} className="mt-0.5 shrink-0" /> {item.note}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>

                            <button
                              onClick={() => mutation.mutate({ order, kitchenStatus: lane.next })}
                              disabled={mutation.isPending}
                              className={`mt-4 w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition disabled:opacity-60 ${
                                lane.next === "Ready" ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-emerald-600 text-white hover:bg-emerald-700"
                              }`}
                            >
                              <LuCheck size={17} /> {lane.action}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default Kitchen;
