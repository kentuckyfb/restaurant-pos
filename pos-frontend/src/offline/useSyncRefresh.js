import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeOnline } from "./network";
import { subscribeSynced, syncLocalOrders } from "./localOrders";

// Keeps screens current around offline periods: when the connection returns, push offline work
// first, then reload data; and whenever offline work reaches the server, reload too.
const useSyncRefresh = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries();
    const offSynced = subscribeSynced(refresh);
    const offOnline = subscribeOnline((online) => {
      if (online) syncLocalOrders().finally(refresh);
    });
    return () => {
      offSynced();
      offOnline();
    };
  }, [queryClient]);
};

export default useSyncRefresh;
