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
    let mounted = true;

    const load = async () => {
      try {
        const [user, settings] = await Promise.allSettled([
          cached("user", getUserData)(),
          queryClient.fetchQuery({ queryKey: ["settings"], queryFn: cached("settings", getSettings) }),
        ]);

        if (user.status === "fulfilled" && user.value) {
          const userData = user.value?.data || user.value;
          if (userData && userData._id) {
            dispatch(setUser(userData));
          } else {
            dispatch(removeUser());
          }
        } else {
          dispatch(removeUser());
        }

        if (settings.status === "fulfilled" && settings.value) {
          const settingsData = settings.value?.data || settings.value;
          if (settingsData?.currencySymbol) {
            setCurrencySymbol(settingsData.currencySymbol);
          }
        }
      } catch (error) {
        console.error("Session restore error:", error);
        dispatch(removeUser());
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [dispatch, queryClient]);

  return isLoading;
};

export default useLoadData;
