import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Logo from "../components/shared/Logo";
import Login from "../components/auth/Login";
import { getSetupStatus } from "../https";

// Sign-in or first-time admin setup with clean, modern layout
const Auth = () => {
  const [forceSetup, setForceSetup] = useState(false);

  useEffect(() => {
    document.title = "Sign in · Restro";
  }, []);

  const { data: setup, isError } = useQuery({
    queryKey: ["setup"],
    queryFn: getSetupStatus,
    select: (r) => r.data,
    retry: 1,
  });

  const isSetup = Boolean(setup?.needsSetup || forceSetup);

  return (
    <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center px-4 py-12 select-none">
      <div className="w-full max-w-[420px]">
        {/* Brand Logo */}
        <div className="flex justify-center text-white mb-8">
          <Logo />
        </div>

        {/* Database Connection Notice if offline */}
        {isError && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed text-center">
            ⚠️ Backend cannot reach MongoDB Atlas. Please ensure <code className="bg-amber-500/20 px-1 py-0.5 rounded text-amber-200">0.0.0.0/0</code> is whitelisted in Atlas Network Access.
          </div>
        )}

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/60 p-7 sm:p-9 border border-zinc-100/10">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              {isSetup ? "Set up your POS" : "Sign in"}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isSetup ? "Create the owner's master admin account." : "Enter your credentials to access the POS till."}
            </p>
          </div>

          <Login isSetup={isSetup} key={isSetup ? "setup" : "login"} />

          {/* Clean Footer Switch inside card */}
          <div className="mt-6 pt-5 border-t border-zinc-100 flex items-center justify-center text-xs text-zinc-500">
            <span>{isSetup ? "Already configured?" : "First time setup?"}</span>
            <button
              type="button"
              onClick={() => setForceSetup(!isSetup)}
              className="ml-1.5 font-semibold text-orange-600 hover:text-orange-500 hover:underline transition-colors cursor-pointer"
            >
              {isSetup ? "Sign in instead" : "Create first Admin"}
            </button>
          </div>
        </div>

        {/* Subtle Bottom Note */}
        {!isSetup && (
          <p className="text-xs text-zinc-500 text-center mt-6">
            New staff member? Ask an admin to invite you from the Staff page.
          </p>
        )}
      </div>
    </div>
  );
};

export default Auth;
