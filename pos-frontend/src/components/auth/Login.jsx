import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, login, register } from "../../https/index";
import { enqueueSnackbar } from "notistack";
import { useDispatch } from "react-redux";
import { setUser } from "../../redux/slices/userSlice";
import { useNavigate } from "react-router-dom";
import { apiError, setCurrencySymbol } from "../../utils";
import { LuUser, LuPhone, LuMail, LuLock, LuArrowRight } from "react-icons/lu";

// Signs in, or on a brand-new install (isSetup) creates the first admin account
const Login = ({ isSetup }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    loginMutation.mutate(formData);
  };

  const loginMutation = useMutation({
    mutationFn: (reqData) =>
      isSetup ? register(reqData) : login({ email: reqData.email, password: reqData.password }),
    onSuccess: async (res) => {
      try {
        const settings = await queryClient.fetchQuery({ queryKey: ["settings"], queryFn: getSettings });
        if (settings?.data?.currencySymbol) setCurrencySymbol(settings.data.currencySymbol);
      } catch {}
      dispatch(setUser(res.data));
      navigate(isSetup ? "/settings" : "/");
    },
    onError: (error) => {
      enqueueSnackbar(apiError(error, "Couldn't reach the server. Make sure database is online."), {
        variant: "error",
      });
    },
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isSetup && (
        <>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
              Full name
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                <LuUser size={16} />
              </span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. John Doe"
                className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-zinc-200 bg-zinc-50/60 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all outline-none"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
              Phone number
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                <LuPhone size={16} />
              </span>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. +1 555-0199"
                className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-zinc-200 bg-zinc-50/60 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all outline-none"
                required
              />
            </div>
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
          Email address
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
            <LuMail size={16} />
          </span>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="admin@restaurant.com"
            className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-zinc-200 bg-zinc-50/60 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all outline-none"
            autoComplete="username"
            required
            autoFocus={!isSetup}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
          Password
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
            <LuLock size={16} />
          </span>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder={isSetup ? "At least 8 characters" : "Enter your password"}
            minLength={isSetup ? 8 : undefined}
            className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-zinc-200 bg-zinc-50/60 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all outline-none"
            autoComplete={isSetup ? "new-password" : "current-password"}
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loginMutation.isPending}
        className="w-full h-11 mt-6 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-medium text-sm shadow-md shadow-orange-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        <span>{loginMutation.isPending ? "Please wait..." : isSetup ? "Create admin account" : "Sign in"}</span>
        <LuArrowRight size={16} />
      </button>
    </form>
  );
};

export default Login;
