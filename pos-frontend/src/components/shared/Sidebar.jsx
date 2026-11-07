import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LuHouse, LuReceipt, LuArmchair, LuChefHat, LuHistory, LuClock, LuChartColumn, LuContact,
  LuBookOpen, LuPackage, LuUsers, LuSettings, LuDatabase, LuPlus, LuLogOut,
} from "react-icons/lu";
import { getUserData, logout } from "../../https";
import { removeUser, setUser } from "../../redux/slices/userSlice";
import { getAvatarName } from "../../utils";
import { useCurrentShift, useMenu, useOpenOrders, useTables } from "../../hooks/useAppData";
import Logo from "./Logo";
import NewOrderModal from "./NewOrderModal";
import SyncStatus, { SyncButton } from "./SyncStatus";
import { cached, forgetUser } from "../../offline/cache";

const groups = [
  {
    label: "Service",
    roles: ["Admin", "Cashier", "Waiter"],
    items: [
      { to: "/", label: "Home", icon: LuHouse },
      { to: "/tables", label: "Tables", icon: LuArmchair },
      { to: "/orders", label: "Open orders", icon: LuReceipt },
      { to: "/kitchen", label: "Kitchen", icon: LuChefHat },
    ],
  },
  {
    label: "Till",
    roles: ["Admin", "Cashier"],
    items: [
      { to: "/history", label: "Bills", icon: LuHistory },
      { to: "/customers", label: "Customers", icon: LuContact },
      { to: "/shifts", label: "Day & shifts", icon: LuClock },
    ],
  },
  {
    label: "Manage",
    roles: ["Admin"],
    items: [
      { to: "/reports", label: "Reports", icon: LuChartColumn },
      { to: "/menu", label: "Menu", icon: LuBookOpen },
      { to: "/inventory", label: "Inventory", icon: LuPackage },
      { to: "/staff", label: "Staff", icon: LuUsers },
      { to: "/data", label: "Data & backup", icon: LuDatabase },
      { to: "/settings", label: "Settings", icon: LuSettings },
    ],
  },
];

const Sidebar = () => {
  const userData = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: shift } = useCurrentShift();
  // Load the menu, tables and open orders as soon as someone logs in, so a copy is saved for offline use
  useMenu();
  useTables();
  useOpenOrders();
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);

  // Keep the signed-in person's name and role current (e.g. after it's edited under Staff)
  const { data: me, error: meError } = useQuery({
    queryKey: ["me"],
    queryFn: cached("user", getUserData),
    select: (r) => r.data,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (me && (me.name !== userData.name || me.role !== userData.role)) dispatch(setUser(me));
  }, [me, userData.name, userData.role, dispatch]);

  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      forgetUser();
      dispatch(removeUser());
      queryClient.clear();
      navigate("/auth");
    },
  });

  // Account deactivated or session expired: sign out
  useEffect(() => {
    if (meError?.response?.status === 401) logoutMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meError]);

  return (
    <aside className="w-[72px] lg:w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-zinc-950 text-zinc-300 px-3 py-4">
      <div className="px-1 mb-4 flex items-center justify-center lg:justify-between">
        <span className="lg:hidden"><Logo showName={false} /></span>
        <span className="hidden lg:block text-white"><Logo /></span>
        <span className="hidden lg:block -mr-1"><SyncButton /></span>
      </div>

      <button onClick={() => setIsNewOrderOpen(true)} className="btn-primary w-full !py-2.5 !shadow-none" title="New order">
        <LuPlus size={18} />
        <span className="hidden lg:inline">New order</span>
      </button>

      <nav className="flex-1 overflow-y-auto -mx-1 px-1 mt-5 space-y-4">
        {groups
          .filter((group) => group.roles.includes(userData.role))
          .map((group, index) => (
            <div key={group.label} className={index ? "pt-4 border-t border-white/[0.06]" : ""}>
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    title={label}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-[7px] rounded-lg text-[13.5px] font-medium transition-colors justify-center lg:justify-start ${
                        isActive ? "bg-white/[0.1] text-white" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={18} className={`shrink-0 ${isActive ? "text-brand-400" : ""}`} />
                        <span className="hidden lg:inline">{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
      </nav>

      <div className="mt-3">
        <SyncStatus />
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5 px-1 justify-center lg:justify-start">
          <div className="hidden lg:flex relative h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200">
            {getAvatarName(userData.name)}
            <span
              title={shift ? "Day is open" : "Day not started"}
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-zinc-950 ${shift ? "bg-emerald-400" : "bg-zinc-500"}`}
            />
          </div>
          <div className="hidden lg:block min-w-0 flex-1">
            <p className="text-[13px] font-medium text-zinc-100 truncate">{userData.name}</p>
            <p className="text-[11px] text-zinc-500 truncate">{userData.role} · {shift ? "Day open" : "Day closed"}</p>
          </div>
          <button onClick={() => logoutMutation.mutate()} title="Log out" aria-label="Log out" className="p-2 rounded-lg text-zinc-500 hover:bg-white/10 hover:text-white">
            <LuLogOut size={16} />
          </button>
        </div>
      </div>

      <NewOrderModal isOpen={isNewOrderOpen} onClose={() => setIsNewOrderOpen(false)} />
    </aside>
  );
};

export default Sidebar;
