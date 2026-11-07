import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getSettings, login, register } from "../../https/index"
import { enqueueSnackbar } from "notistack";
import { useDispatch } from "react-redux";
import { setUser } from "../../redux/slices/userSlice";
import { useNavigate } from "react-router-dom";
import { apiError, setCurrencySymbol } from "../../utils";

// Signs in, or on a brand-new install (isSetup) creates the first admin account
const Login = ({ isSetup }) => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const queryClient = useQueryClient();
    const[formData, setFormData] = useState({
      name: "",
      phone: "",
      email: "",
      password: "",
    });

    const handleChange = (e) => {
      setFormData({...formData, [e.target.name]: e.target.value});
    }

    const handleSubmit = (e) => {
      e.preventDefault();
      loginMutation.mutate(formData);
    }

    const loginMutation = useMutation({
      mutationFn: (reqData) => isSetup ? register(reqData) : login({ email: reqData.email, password: reqData.password }),
      onSuccess: async (res) => {
          const settings = await queryClient.fetchQuery({ queryKey: ["settings"], queryFn: getSettings });
          setCurrencySymbol(settings.data.currencySymbol);
          dispatch(setUser(res.data));
          navigate(isSetup ? "/settings" : "/");
      },
      onError: (error) => {
        enqueueSnackbar(apiError(error, "Couldn't reach the server."), { variant: "error" });
      }
    })

  return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {isSetup && (
          <>
            <div>
              <label className="label">Your name</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} className="input" required autoFocus />
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="07X XXX XXXX" className="input" required />
            </div>
          </>
        )}
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@restaurant.lk"
            className="input"
            autoComplete="username"
            required
            autoFocus={!isSetup}
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder={isSetup ? "At least 8 characters" : "Enter password"}
            minLength={isSetup ? 8 : undefined}
            className="input"
            autoComplete={isSetup ? "new-password" : "current-password"}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="btn-primary w-full !py-3 !mt-6"
        >
          {isSetup ? "Create admin account" : "Sign in"}
        </button>
      </form>
  );
};

export default Login;
