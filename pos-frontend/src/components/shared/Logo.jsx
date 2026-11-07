import React from "react";
import { LuUtensils } from "react-icons/lu";

const Logo = ({ showName = true }) => {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-brand-600 text-white">
        <LuUtensils size={18} />
      </span>
      {showName && <span className="text-lg font-semibold tracking-tight">Restro</span>}
    </div>
  );
};

export default Logo;
