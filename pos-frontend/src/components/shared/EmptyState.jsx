import React from "react";

const EmptyState = ({ icon, title, children }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 text-2xl mb-4">{icon}</div>}
      <p className="font-medium text-zinc-800">{title}</p>
      {children && <div className="text-sm text-zinc-600 mt-1 max-w-sm">{children}</div>}
    </div>
  );
};

export default EmptyState;
