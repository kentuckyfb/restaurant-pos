import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";
import {
  Home, Auth, Orders, Tables, OrderScreen, Kitchen, History, Shifts, Reports, Inventory, MenuManager, Staff, Settings, PublicReceipt, Archive, Customers,
} from "./pages";
import Sidebar from "./components/shared/Sidebar";
import { useSelector } from "react-redux";
import useLoadData from "./hooks/useLoadData";
import FullScreenLoader from "./components/shared/FullScreenLoader"
import useSyncRefresh from "./offline/useSyncRefresh";
import { useRealtime } from "./offline/realtime";

const ALL = ["Admin", "Cashier", "Waiter"];
const TILL = ["Admin", "Cashier"];
const ADMIN = ["Admin"];

const routes = [
  { path: "/", element: <Home />, roles: ALL },
  { path: "/tables", element: <Tables />, roles: ALL },
  { path: "/orders", element: <Orders />, roles: ALL },
  { path: "/pos/new", element: <OrderScreen />, roles: ALL },
  { path: "/pos/:id", element: <OrderScreen />, roles: ALL },
  { path: "/kitchen", element: <Kitchen />, roles: ALL },
  { path: "/history", element: <History />, roles: TILL },
  { path: "/shifts", element: <Shifts />, roles: TILL },
  { path: "/reports", element: <Reports />, roles: ADMIN },
  { path: "/menu", element: <MenuManager />, roles: ADMIN },
  { path: "/inventory", element: <Inventory />, roles: ADMIN },
  { path: "/staff", element: <Staff />, roles: ADMIN },
  { path: "/settings", element: <Settings />, roles: ADMIN },
  { path: "/data", element: <Archive />, roles: ADMIN },
  { path: "/backup", element: <Navigate to="/data?tab=backup" replace />, roles: ADMIN },
  { path: "/archive", element: <Navigate to="/data?tab=archive" replace />, roles: ADMIN },
  { path: "/customers", element: <Customers />, roles: TILL },
];

function Layout() {
  const isLoading = useLoadData();
  useSyncRefresh();
  const location = useLocation();
  const { isAuth } = useSelector(state => state.user);
  // Live updates while signed in (not on the public receipt page)
  useRealtime(!isLoading && isAuth && location.pathname !== "/auth" && !location.pathname.startsWith("/r/"));

  if(isLoading) return <FullScreenLoader />

  const showSidebar = isAuth && location.pathname !== "/auth" && !location.pathname.startsWith("/r/");

  return (
    <div className="flex min-h-screen">
      {showSidebar && <Sidebar />}
      <main className="flex-1 min-w-0">
      <Routes>
        {routes.map(({ path, element, roles }) => (
          <Route
            key={path}
            path={path}
            element={<ProtectedRoutes roles={roles}>{element}</ProtectedRoutes>}
          />
        ))}
        <Route path="/auth" element={isAuth ? <Navigate to="/" /> : <Auth />} />
        <Route path="/r/:token" element={<PublicReceipt />} />
        <Route path="*" element={<div className="p-8 text-zinc-600">Page not found</div>} />
      </Routes>
      </main>
    </div>
  );
}

function ProtectedRoutes({ roles, children }) {
  const { isAuth, role } = useSelector((state) => state.user);
  if (!isAuth) {
    return <Navigate to="/auth" />;
  }
  if (!roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <Router>
      <Layout />
    </Router>
  );
}

export default App;
