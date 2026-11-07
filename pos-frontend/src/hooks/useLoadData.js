import { useDispatch } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { getSettings, getUserData } from "../https";
import { useEffect, useState } from "react";
import { removeUser, setUser } from "../redux/slices/userSlice";
import { setCurrencySymbol } from "../utils";
import { cached } from "../offline/cache";

// Restores the session (if any) and loads business settings before the app renders.
// Both load at the same time; offline, the copies saved on this device are used.
const useLoadData = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [user, settings] = await Promise.allSettled([
        cached("user", getUserData)(),
        queryClient.fetchQuery({ queryKey: ["settings"], queryFn: cached("settings", getSettings) }),
      ]);
      if (user.status === "fulfilled") {
        dispatch(setUser(user.value.data));
        if (settings.status === "fulfilled") setCurrencySymbol(settings.value.data.currencySymbol);
      } else {
        dispatch(removeUser());
      }
      setIsLoading(false);
    };

    load();
  }, [dispatch, queryClient]);

  return isLoading;
};

export default useLoadData;
