import React, { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, RefreshCw } from "lucide-react";
import { VoyageSampleRecord } from "../lib/voyageSql";

interface BathymetryDepthChartProps {
  samples: VoyageSampleRecord[];
  currentDraughtM: number;
  isSampling: boolean;
  onPushSample: () => void;
}

interface BathymetryChartPoint {
  id: string;
  timeLabel: string;
  fullUtc: string;
  triggerType: string;
  waterZone: string;
  waterwayName: string;
  lat: number;
  lon: number;
  bathymetryDepthM: number | null;
  draughtM: number;
  ukcM: number | null;
  tideHeightM: number | null;
  riverHeightM: number | null;
  seaLevelM: number | null;
  effectiveDepthM: number | null;
}

function CustomBathymetryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: BathymetryChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  const ukcStatus =
    pt.ukcM === null
      ? { label: "OFFSHORE", cls: "text-slate-400" }
      : pt.ukcM < 1.2
        ? { label: "CRITICAL UKC", cls: "text-red-400" }
        : pt.ukcM < 2.5
          ? { label: "LOW UKC", cls: "text-amber-300" }
          : { label: "NOMINAL UKC", cls: "text-emerald-400" };

  return (
    <div className="bg-slate-950/95 border border-slate-700 rounded p-3 text-xs font-mono tabular-nums text-slate-200 shadow-xl max-w-[280px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5 mb-2">
        <span className="font-semibold text-white">{pt.fullUtc}</span>
        <span className="text-cyan-400">{pt.waterZone}</span>
      </div>

      <div className="text-[11px] text-slate-400 truncate mb-2" title={pt.waterwayName}>
        {pt.waterwayName}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-slate-400">Chart Depth:</span>
        <span className="text-right font-semibold text-cyan-300">
          {pt.bathymetryDepthM !== null ? `${pt.bathymetryDepthM.toFixed(2)} m` : "Deep Water"}
        </span>

        <span className="text-slate-400">Vessel Draught:</span>
        <span className="text-right font-semibold text-amber-300">
          {pt.draughtM.toFixed(2)} m
        </span>

        <span className="text-slate-400">Under-Keel Clr:</span>
        <span className={`text-right font-semibold ${ukcStatus.cls}`}>
          {pt.ukcM !== null ? `${pt.ukcM.toFixed(2)} m` : "--"}
        </span>

        {pt.effectiveDepthM !== null && (
          <>
            <span className="text-slate-400">Water Column:</span>
            <span className="text-right text-emerald-300">
              {pt.effectiveDepthM.toFixed(2)} m
            </span>
          </>
        )}

        {pt.riverHeightM !== null && (
          <>
            <span className="text-slate-400">River Gauge:</span>
            <span className="text-right text-sky-300">{pt.riverHeightM.toFixed(2)} m</span>
          </>
        )}

        {pt.tideHeightM !== null && (
          <>
            <span className="text-slate-400">Estuary Tide:</span>
            <span className="text-right text-sky-300">{pt.tideHeightM.toFixed(2)} m</span>
          </>
        )}

        {pt.seaLevelM !== null && (
          <>
            <span className="text-slate-400">Sea Level MSL:</span>
            <span className="text-right text-slate-300">{pt.seaLevelM.toFixed(2)} m</span>
          </>
        )}
      </div>

      <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">
          {pt.lat.toFixed(3)}, {pt.lon.toFixed(3)}
        </span>
        <span className={ukcStatus.cls}>{ukcStatus.label}</span>
      </div>
    </div>
  );
}

export const BathymetryDepthChart: React.FC<BathymetryDepthChartProps> = ({
  samples,
  currentDraughtM,
  isSampling,
  onPushSample,
}) => {
  const { points, depthSamplesCount, stats, yAxisMax } = useMemo(() => {
    const ordered = [...samples].sort(
      (a, b) => new Date(a.sampledAtUtc).getTime() - new Date(b.sampledAtUtc).getTime()
    );

    const mapped: BathymetryChartPoint[] = ordered.map((s) => {
      const d = new Date(s.sampledAtUtc);
      const timeLabel = `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}Z`;
      const fullUtc = `${d.toISOString().slice(0, 16).replace("T", " ")}Z`;

      const waterOffset =
        s.riverHeightM ?? s.tideHeightM ?? s.seaLevelM ?? 0;
      const effectiveDepthM =
        s.bathymetryDepthM !== null
          ? Math.round((s.bathymetryDepthM + waterOffset) * 100) / 100
          : null;

      return {
        id: s.id,
        timeLabel,
        fullUtc,
        triggerType: s.triggerType,
        waterZone: s.waterZone,
        waterwayName: s.waterwayName,
        lat: s.lat,
        lon: s.lon,
        bathymetryDepthM: s.bathymetryDepthM,
        draughtM: s.draughtM,
        ukcM: s.ukcM,
        tideHeightM: s.tideHeightM,
        riverHeightM: s.riverHeightM,
        seaLevelM: s.seaLevelM,
        effectiveDepthM,
      };
    });

    const depthPts = mapped.filter(
      (p): p is BathymetryChartPoint & { bathymetryDepthM: number } =>
        p.bathymetryDepthM !== null
    );
    const ukcVals = depthPts
      .map((p) => p.ukcM)
      .filter((v): v is number => v !== null);

    const minDepth =
      depthPts.length > 0
        ? Math.min(...depthPts.map((p) => p.bathymetryDepthM))
        : null;
    const maxDepth =
      depthPts.length > 0
        ? Math.max(...depthPts.map((p) => p.bathymetryDepthM))
        : null;
    const minUkc = ukcVals.length > 0 ? Math.min(...ukcVals) : null;
    const maxDraught =
      mapped.length > 0
        ? Math.max(...mapped.map((p) => p.draughtM), currentDraughtM)
        : currentDraughtM;

    const computedMax = Math.max(
      18,
      Math.ceil((maxDepth ?? maxDraught) + 4)
    );

    return {
      points: mapped,
      depthSamplesCount: depthPts.length,
      stats: { minDepth, maxDepth, minUkc },
      yAxisMax: computedMax,
    };
  }, [samples, currentDraughtM]);

  return (
    <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Bathymetry Depth Profile & Under-Keel Clearance
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>{depthSamplesCount} depth readings</span>
            <span aria-hidden="true">·</span>
            <span>Draught {currentDraughtM.toFixed(1)} m</span>
            {stats.minDepth !== null && stats.maxDepth !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-cyan-300">
                  Depth {stats.minDepth.toFixed(1)}–{stats.maxDepth.toFixed(1)} m
                </span>
              </>
            )}
            {stats.minUkc !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    stats.minUkc < 1.2
                      ? "text-red-400 font-semibold"
                      : stats.minUkc < 2.5
                        ? "text-amber-300 font-semibold"
                        : "text-emerald-400 font-semibold"
                  }
                >
                  Min UKC {stats.minUkc.toFixed(2)} m
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
            Chart Depth (m)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
            Water Column (Tide/River)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-amber-400 inline-block" />
            Vessel Draught
          </span>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="bg-slate-950/50 border border-slate-800 rounded p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <span>
            No hydrographic samples recorded in this voyage yet. Capture a sample to plot the seabed bathymetry depth profile against vessel draught.
          </span>
          <button
            type="button"
            onClick={onPushSample}
            disabled={isSampling}
            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSampling ? "animate-spin" : ""}`} />
            {isSampling ? "Sampling..." : "Push First Sample"}
          </button>
        </div>
      ) : depthSamplesCount === 0 ? (
        <div className="bg-slate-950/50 border border-slate-800 rounded p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <span>
            {points.length} open-sea sample{points.length === 1 ? "" : "s"} logged (offshore deep water). Bathymetry depth readings are recorded whenever the vessel enters an estuary or river channel.
          </span>
          <button
            type="button"
            onClick={onPushSample}
            disabled={isSampling}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-cyan-700/60 text-cyan-300 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSampling ? "animate-spin" : ""}`} />
            Push Sample
          </button>
        </div>
      ) : (
        <div className="w-full h-[270px] min-w-0 bg-slate-950/60 border border-slate-800 rounded p-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
            >
              <defs>
                <linearGradient id="bathymetryWaterGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0891b2" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.48} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="timeLabel"
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}
                tickMargin={8}
                minTickGap={24}
              />

              <YAxis
                reversed
                domain={[0, yAxisMax]}
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}
                tickFormatter={(val: number) => `${val}m`}
                width={44}
              />

              <Tooltip content={<CustomBathymetryTooltip />} />

              <ReferenceLine
                y={0}
                stroke="#38bdf8"
                strokeOpacity={0.45}
                strokeDasharray="2 2"
                label={{
                  value: "Surface (0m)",
                  position: "insideTopLeft",
                  fill: "#7dd3fc",
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />

              <ReferenceLine
                y={currentDraughtM}
                stroke="#fbbf24"
                strokeOpacity={0.55}
                strokeDasharray="4 4"
                label={{
                  value: `Keel ${currentDraughtM.toFixed(1)}m`,
                  position: "insideTopRight",
                  fill: "#fcd34d",
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />

              <Area
                type="monotone"
                dataKey="bathymetryDepthM"
                name="Chart Depth (m)"
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#bathymetryWaterGradient)"
                connectNulls={false}
                dot={{ r: 4, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 1.5 }}
                activeDot={{ r: 6, fill: "#67e8f9", stroke: "#0f172a", strokeWidth: 2 }}
              />

              <Line
                type="monotone"
                dataKey="effectiveDepthM"
                name="Water Column (with Tide/River)"
                stroke="#34d399"
                strokeWidth={1.75}
                connectNulls={false}
                dot={{ r: 3, fill: "#34d399" }}
              />

              <Line
                type="stepAfter"
                dataKey="draughtM"
                name="Vessel Draught (m)"
                stroke="#fbbf24"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={points.length <= 2 ? { r: 3, fill: "#fbbf24" } : false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
