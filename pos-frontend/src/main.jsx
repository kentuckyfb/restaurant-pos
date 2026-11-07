import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { Provider } from "react-redux";
import store from "./redux/store.js";
import { SnackbarProvider } from "notistack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Offline support: connection tracking and background sync of orders taken offline
import "./offline/network";
import "./offline/localOrders";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime : 30000,
      // Retry a server hiccup once. A refusal (not signed in, not allowed, not found) won't change on
      // retry, and a server that's down isn't hammered: offline copies cover the gap.
      retry: (count, error) => count < 1 && error?.response?.status >= 500,
      networkMode: "always",
      // Live updates keep data fresh, so don't refetch every time the window gets focus
      refetchOnWindowFocus: false,
    },
    mutations: {
      networkMode: "always",
    },
  }
})

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <SnackbarProvider autoHideDuration={3000}>
        <QueryClientProvider client={queryClient} >
          <App />
        </QueryClientProvider>
      </SnackbarProvider>
    </Provider>
  </StrictMode>
);

// Caches the app itself so it opens even with no connection (production builds only)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
