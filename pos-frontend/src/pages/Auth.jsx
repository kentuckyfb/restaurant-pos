import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Logo from "../components/shared/Logo";
import Login from "../components/auth/Login";
import { getSetupStatus } from "../https";

// Sign-in (or first-time setup), in the same dark-and-white style as the app's sidebar
const Auth = () => {

  useEffect(() => {
    document.title = "Sign in · Restro"
  }, [])

  const { data: setup } = useQuery({ queryKey: ["setup"], queryFn: getSetupStatus, select: (r) => r.data });
  const isSetup = Boolean(setup?.needsSetup);

  return (
    <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center text-white mb-8">
          <Logo />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 p-7">
          <h1 className="text-xl font-semibold tracking-tight">
            {isSetup ? "Set up your POS" : "Sign in"}
          </h1>
          <p className="text-sm text-zinc-600 mt-1 mb-6">
            {isSetup ? "Create the owner's admin account." : "Welcome back."}
          </p>

          <Login isSetup={isSetup} key={isSetup ? "setup" : "login"} />
        </div>

        {!isSetup && (
          <p className="text-xs text-zinc-500 text-center mt-6">New staff? Ask a manager to add you.</p>
        )}
      </div>
    </div>
  );
};

export default Auth;
