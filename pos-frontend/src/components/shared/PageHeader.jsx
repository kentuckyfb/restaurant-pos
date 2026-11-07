import React from "react";

const PageHeader = ({ title, children }) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 min-h-10">
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
};

export default PageHeader;
