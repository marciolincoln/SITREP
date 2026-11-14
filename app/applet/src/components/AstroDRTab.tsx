import React, { useState } from "react";
import { Compass, Calculator, Target } from "lucide-react";

export function AstroDRTab() {
  return (
    <div className="flex flex-col gap-4 h-full">
      <section className="bg-slate-900/40 p-6 rounded-lg border border-slate-800 flex flex-col gap-6">
        <div className="flex items-center gap-2 mb-2 border-b border-slate-800 pb-2">
          <Target className="w-5 h-5 text-cyan-500" />
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
            AstroDR - Celestial Navigation
          </h2>
        </div>
        <p className="text-slate-400 text-sm">
          AstroDR solver not implemented yet.
        </p>
      </section>
    </div>
  );
}
