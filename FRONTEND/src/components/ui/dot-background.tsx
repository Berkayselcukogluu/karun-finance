import React from "react";

export function DotBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      <div className="relative z-20">{children}</div>
    </div>
  );
}
