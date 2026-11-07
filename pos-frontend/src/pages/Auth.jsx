import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Logo from "../components/shared/Logo";
import Login from "../components/auth/Login";
import { getSetupStatus } from "../https";

// Sign-in (or first-time setup), in the same dark-and-white style as the app's sidebar
const Auth = () => {
  const [forceSetup, setForceSetup] = useState(false);

  useEffect(() => {
    document.title = "Sign in · Restro";
  }, []);

  const { data: setup, isError, error } = useQuery({
    queryKey: ["setup"],
    queryFn: getSetupStatus,
    select: (r) => r.data,
    retry: 1,
  });

  const isSetup = Boolean(setup?.needsSetup || forceSetup);

  return (
    <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center text-white mb-8">
          <Logo />
        </div>

        {isError && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs text-center">
            ⚠️ Backend database is currently unreachable. Make sure MongoDB Atlas Network Access has whitelisted your IP (0.0.0.0/0).
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 p-7">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {isSetup ? "Set up your POS" : "Sign in"}
            </h1>
            <button
              type="button"
              onClick={() => setForceSetup(!isSetup)}
              className="text-xs text-zinc-500 hover:text-zinc-900 underline underline-offset-4"
            >
              {isSetup ? "Switch to Sign in" : "Create first Admin"}
            </button>
          </div>

          <p className="text-sm text-zinc-600 mb-6">
            {isSetup ? "Create the owner's master admin account." : "Enter your staff email and password."}
          </p>

          <Login isSetup={isSetup} key={isSetup ? "setup" : "login"} />
        </div>

        {!isSetup && (
          <p className="text-xs text-zinc-500 text-center mt-6">
            New staff? Ask a manager to add you from the Staff page.
          </p>
        )}
      </div>
    </div>
  );
};

export default Auth;
