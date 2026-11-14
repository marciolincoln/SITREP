import React, { useMemo, useState } from "react";
import {
  Database,
  Download,
  RefreshCw,
  Copy,
  Check,
  Anchor,
  Waves,
  Navigation,
  ExternalLink,
  AlertTriangle,
  Trash,
  Plus,
  Clock,
  Sparkles,
  Info,
} from "lucide-react";
import { VesselPosition } from "../lib/ais";
import {
  HydrographicReport,
  WaterZone,
  ZoneClassification,
} from "../lib/hydrography";
import {
  VoyageSummaryRecord,
  downloadVoyageSummarySql,
  generateVoyageSummarySql,
} from "../lib/voyageSql";
import { BathymetryDepthChart } from "./BathymetryDepthChart";

interface VoyageSummarySqlPanelProps {
  vessel: VesselPosition;
  zoneInfo: ZoneClassification;
  zoneOverride: WaterZone | "AUTO";
  onChangeZoneOverride: (zone: WaterZone | "AUTO") => void;
  voyages: VoyageSummaryRecord[];
  activeVoyage: VoyageSummaryRecord;
  selectedVoyageId: string;
  onSelectVoyage: (id: string) => void;
  latestHydrography: HydrographicReport | null;
  isSampling: boolean;
  isFetchingHydrography: boolean;
  hydrographyError: string | null;
  nextSampleCountdownSec: number;
  onPushSample: () => void;
  onRefreshHydrography: () => void;
  onDeleteSample: (voyageId: string, sampleId: string) => void;
  onStartNewVoyage: () => void;
}

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
}

export const VoyageSummarySqlPanel: React.FC<VoyageSummarySqlPanelProps> = ({
  vessel,
  zoneInfo,
  zoneOverride,
  onChangeZoneOverride,
  voyages,
  activeVoyage,
  selectedVoyageId,
  onSelectVoyage,
  latestHydrography,
  isSampling,
  isFetchingHydrography,
  hydrographyError,
  nextSampleCountdownSec,
  onPushSample,
  onRefreshHydrography,
  onDeleteSample,
  onStartNewVoyage,
}) => {
  const [copiedSql, setCopiedSql] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  const displayedVoyage = useMemo(() => {
    return voyages.find((v) => v.id === selectedVoyageId) || activeVoyage;
  }, [voyages, selectedVoyageId, activeVoyage]);

  const sqlText = useMemo(() => {
    return generateVoyageSummarySql(displayedVoyage);
  }, [displayedVoyage]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleDownloadSql = () => {
    const filename = downloadVoyageSummarySql(
      sqlText,
      displayedVoyage.callsign,
      displayedVoyage.id
    );
    setDownloadedFile(filename);
    setTimeout(() => setDownloadedFile(null), 4000);
  };

  const totalDistNm = useMemo(
    () => displayedVoyage.legs.reduce((sum, l) => sum + l.distanceNm, 0),
    [displayedVoyage.legs]
  );

  const avgCalcSog = useMemo(() => {
    if (displayedVoyage.legs.length === 0) return null;
    const totalHrs = displayedVoyage.legs.reduce((sum, l) => sum + l.durationHours, 0);
    if (totalHrs > 0) return Math.round((totalDistNm / totalHrs) * 100) / 100;
    const sumSog = displayedVoyage.legs.reduce((sum, l) => sum + l.calculatedSogKn, 0);
    return Math.round((sumSog / displayedVoyage.legs.length) * 100) / 100;
  }, [displayedVoyage.legs, totalDistNm]);

  const isInlandOrEstuary = zoneInfo.zone === "RIVER" || zoneInfo.zone === "ESTUARY";

  return (
    <div className="flex flex-col gap-4">
      {/* Top Voyage Summary & Adaptive Sampling Toolbar */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-cyan-400 shrink-0" />
              <h2 className="text-base font-semibold text-white tracking-tight">
                Voyage Summary SQL Database
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
              <span>{displayedVoyage.vesselName} ({displayedVoyage.callsign})</span>
              <span aria-hidden="true">·</span>
              <span>{displayedVoyage.depPort} to {displayedVoyage.arrPort}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  displayedVoyage.status === "COMPLETED"
                    ? "text-emerald-400 font-semibold"
                    : displayedVoyage.status === "IN_PROGRESS"
                      ? "text-cyan-400 font-semibold"
                      : "text-sky-400 font-semibold"
                }
              >
                {displayedVoyage.status === "COMPLETED"
                  ? "Completed (Moored to Moored)"
                  : displayedVoyage.status === "IN_PROGRESS"
                    ? "Active Passage (Since Unmooring)"
                    : "Moored Standby"}
              </span>
              <span aria-hidden="true">·</span>
              <span>{displayedVoyage.samples.length} samples</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {voyages.length > 1 && (
              <select
                value={displayedVoyage.id}
                onChange={(e) => onSelectVoyage(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500"
                title="Select recorded voyage"
              >
                {voyages.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.depPort}→{v.arrPort} ({v.status}) · {v.samples.length} smp
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={onStartNewVoyage}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-medium text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Open a fresh moored-to-moored voyage log"
            >
              <Plus className="w-3.5 h-3.5 text-slate-300" />
              New Voyage
            </button>

            <button
              type="button"
              onClick={onPushSample}
              disabled={isSampling}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-cyan-700/60 rounded text-xs font-semibold text-cyan-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
              title="Capture immediate waypoint, metocean, and hydrography sample"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSampling ? "animate-spin" : ""}`} />
              {isSampling ? "Sampling..." : "Push Sample"}
            </button>

            <button
              type="button"
              onClick={handleDownloadSql}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download .SQL
            </button>
          </div>
        </div>

        {/* Status Feedback Banner on Download */}
        {downloadedFile && (
          <div className="bg-emerald-950/50 border border-emerald-700/60 text-emerald-300 px-3 py-2 rounded text-xs font-mono flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>PostgreSQL / ANSI SQL database exported as {downloadedFile}</span>
          </div>
        )}

        {/* Adaptive Cadence & Key Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono tabular-nums">
          <div className="bg-slate-950/70 border border-slate-800 rounded p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Waterway Zone & Cadence</span>
              <select
                value={zoneOverride}
                onChange={(e) => onChangeZoneOverride(e.target.value as WaterZone | "AUTO")}
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 outline-none"
                title="Override maritime zone classification"
              >
                <option value="AUTO">Auto ({zoneInfo.zone})</option>
                <option value="SEA">Sea (4h)</option>
                <option value="ESTUARY">Estuary (1h)</option>
                <option value="RIVER">River (1h)</option>
              </select>
            </div>
            <div className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
              <span>{zoneInfo.zone}</span>
              <span className="text-slate-500">·</span>
              <span className="text-cyan-400">Every {zoneInfo.samplingIntervalHours}h</span>
            </div>
            <span className="text-[11px] text-slate-400 truncate" title={zoneInfo.waterwayName}>
              {zoneInfo.waterwayName}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded p-3 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Next Auto-Sample
            </span>
            <div className="text-lg font-bold text-cyan-300">
              {formatCountdown(nextSampleCountdownSec)}
            </div>
            <span className="text-[11px] text-slate-400">
              AIS Status: {vessel.navStatus}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded p-3 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              Route Legs & Calc. SOG
            </span>
            <div className="text-lg font-bold text-white">
              {avgCalcSog !== null ? `${avgCalcSog.toFixed(2)} kn` : "--"}
            </div>
            <span className="text-[11px] text-slate-400">
              {displayedVoyage.legs.length} legs · {totalDistNm.toFixed(1)} NM total
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded p-3 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Anchor className="w-3.5 h-3.5 text-sky-400" />
              Moored-to-Moored Window
            </span>
            <div className="text-xs font-semibold text-slate-200 mt-0.5">
              Start: {new Date(displayedVoyage.startedAtUtc).toISOString().slice(0, 16).replace("T", " ")}Z
            </div>
            <span className="text-[11px] text-slate-400">
              End: {displayedVoyage.endedAtUtc ? `${new Date(displayedVoyage.endedAtUtc).toISOString().slice(0, 16).replace("T", " ")}Z` : "Open (In Transit)"}
            </span>
          </div>
        </div>
      </section>

      {/* AI-Grounded Port Authority Hydrography & Bathymetry Card */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Waves className="w-4 h-4 text-cyan-400" />
              Hydrography, River Heights, Tides & Bathymetry
            </h3>
            <p className="text-xs text-slate-400">
              {isInlandOrEstuary
                ? `Active ${zoneInfo.zone.toLowerCase()} sampling (1h): queries Port Authority bulletins via AI search grounding + Open-Meteo marine sea level.`
                : "At sea (4h sampling): bathymetry and river gauges activate automatically upon entering an estuary or river."}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshHydrography}
            disabled={isFetchingHydrography}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-medium text-cyan-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isFetchingHydrography ? "animate-pulse" : ""}`} />
            {isFetchingHydrography ? "Searching Authorities..." : "Query Port Authority (AI)"}
          </button>
        </div>

        {hydrographyError && (
          <div
            className={
              latestHydrography
                ? "bg-slate-950/70 border border-sky-800/60 text-slate-300 px-3 py-2.5 rounded text-xs font-mono flex items-start gap-2"
                : "bg-amber-950/40 border border-amber-700/60 text-amber-200 px-3 py-2.5 rounded text-xs font-mono flex items-start gap-2"
            }
          >
            {latestHydrography ? (
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <span>{hydrographyError}</span>
          </div>
        )}

        {isFetchingHydrography && !latestHydrography ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-16 bg-slate-950/80 border border-slate-800 rounded" />
            ))}
          </div>
        ) : latestHydrography ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 font-mono tabular-nums">
              <div className="bg-slate-950/70 border border-slate-800 rounded p-2.5 flex flex-col">
                <span className="text-[11px] text-slate-400">Authority & Station</span>
                <span className="text-xs font-semibold text-white mt-0.5 truncate" title={latestHydrography.authorityName}>
                  {latestHydrography.authorityName}
                </span>
                <span className="text-[11px] text-cyan-400 truncate" title={latestHydrography.stationName}>
                  {latestHydrography.stationName}
                </span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded p-2.5 flex flex-col">
                <span className="text-[11px] text-slate-400">River Height (Port Auth.)</span>
                <span className="text-base font-bold text-sky-300 mt-0.5">
                  {latestHydrography.riverHeightM !== null
                    ? `${latestHydrography.riverHeightM.toFixed(2)} m`
                    : "N/A"}
                </span>
                <span className="text-[11px] text-slate-400">
                  {latestHydrography.riverTrend ? `Trend: ${latestHydrography.riverTrend}` : latestHydrography.datum || "Datum"}
                </span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded p-2.5 flex flex-col">
                <span className="text-[11px] text-slate-400">Estuary Tide & Sea Level</span>
                <span className="text-base font-bold text-cyan-300 mt-0.5">
                  {latestHydrography.tideHeightM !== null
                    ? `${latestHydrography.tideHeightM.toFixed(2)} m`
                    : latestHydrography.seaLevelM !== null
                      ? `${latestHydrography.seaLevelM.toFixed(2)} m MSL`
                      : "N/A"}
                </span>
                <span className="text-[11px] text-slate-400">
                  {latestHydrography.tidePhase
                    ? `Phase: ${latestHydrography.tidePhase}`
                    : latestHydrography.seaLevelM !== null
                      ? `MSL: ${latestHydrography.seaLevelM.toFixed(2)} m`
                      : "Coastal Tide"}
                </span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded p-2.5 flex flex-col">
                <span className="text-[11px] text-slate-400">Bathymetry Depth</span>
                <span className="text-base font-bold text-emerald-300 mt-0.5">
                  {latestHydrography.bathymetryDepthM !== null
                    ? `${latestHydrography.bathymetryDepthM.toFixed(2)} m`
                    : zoneInfo.baselineChartDepthM !== null
                      ? `${zoneInfo.baselineChartDepthM.toFixed(1)} m (Chart)`
                      : "Offshore"}
                </span>
                <span className="text-[11px] text-slate-400">
                  Draught: {vessel.draught.toFixed(1)} m
                </span>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded p-2.5 flex flex-col">
                <span className="text-[11px] text-slate-400">Under-Keel Clearance</span>
                {(() => {
                  const depth = latestHydrography.bathymetryDepthM ?? zoneInfo.baselineChartDepthM;
                  const ukc = depth !== null ? depth - vessel.draught : null;
                  return (
                    <>
                      <span
                        className={`text-base font-bold mt-0.5 ${
                          ukc === null
                            ? "text-slate-400"
                            : ukc < 1.2
                              ? "text-red-400"
                              : ukc < 2.5
                                ? "text-amber-300"
                                : "text-emerald-400"
                        }`}
                      >
                        {ukc !== null ? `${ukc.toFixed(2)} m` : "Deep Water"}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Bulletin: {latestHydrography.bulletinTimestamp || "Current"}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            {latestHydrography.advisory && (
              <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded px-3 py-2 font-mono">
                {latestHydrography.advisory}
              </div>
            )}

            {latestHydrography.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                <span className="text-slate-500">Official Grounding References:</span>
                {latestHydrography.sources.slice(0, 5).map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 hover:underline inline-flex items-center gap-1"
                  >
                    <span className="max-w-[220px] truncate">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-950/50 border border-slate-800 rounded p-4 text-xs text-slate-400 font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              No port authority hydrography bulletin fetched for this position yet. Query now to retrieve live river heights, estuary tides, and bathymetry references.
            </span>
            <button
              type="button"
              onClick={onRefreshHydrography}
              className="text-cyan-400 hover:text-cyan-300 underline whitespace-nowrap self-start sm:self-auto"
            >
              Fetch Hydrography Bulletin
            </button>
          </div>
        )}
      </section>

      {/* Bathymetry Depth Profile Chart */}
      <BathymetryDepthChart
        samples={displayedVoyage.samples}
        currentDraughtM={vessel.draught}
        isSampling={isSampling}
        onPushSample={onPushSample}
      />

      {/* Route Legs Table (Calculated SOG for every leg) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-sm font-semibold text-white">
            Route Legs & Calculated SOG (Moored to Moored)
          </h3>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {displayedVoyage.legs.length} legs · {displayedVoyage.waypoints.length} waypoints
          </span>
        </div>

        {displayedVoyage.legs.length === 0 ? (
          <div className="p-4 text-xs font-mono text-slate-400 bg-slate-950/50 border border-slate-800 rounded">
            Generate a SISTRAM Type 1 route in the Voyage Planner tab to populate leg distances and calculated SOGs.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Leg</th>
                  <th className="py-2 px-3 font-medium">Coordinates (From → To)</th>
                  <th className="py-2 px-3 font-medium">Zone</th>
                  <th className="py-2 px-3 font-medium text-right">Dist (NM)</th>
                  <th className="py-2 px-3 font-medium text-right">Brg</th>
                  <th className="py-2 px-3 font-medium text-right text-cyan-300">Calc SOG</th>
                  <th className="py-2 px-3 font-medium text-right">Obs AIS SOG</th>
                  <th className="py-2 px-3 font-medium text-right">Dur (h)</th>
                  <th className="py-2 pl-3 font-medium text-right">Metocean</th>
                </tr>
              </thead>
              <tbody>
                {displayedVoyage.legs.map((leg) => (
                  <tr key={leg.legIndex} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2.5 pr-3 text-white font-semibold whitespace-nowrap">
                      {leg.fromLabel} → {leg.toLabel}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {leg.fromLat.toFixed(3)}, {leg.fromLon.toFixed(3)} → {leg.toLat.toFixed(3)}, {leg.toLon.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                      {leg.waterZone}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">{leg.distanceNm.toFixed(1)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{leg.trueBearingDeg.toFixed(0).padStart(3, "0")}°T</td>
                    <td className="py-2.5 px-3 text-right font-bold text-cyan-300">{leg.calculatedSogKn.toFixed(2)} kn</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {leg.observedAvgSogKn !== null ? `${leg.observedAvgSogKn.toFixed(1)} kn` : "--"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{leg.durationHours.toFixed(2)}</td>
                    <td className="py-2.5 pl-3 text-right text-slate-400 whitespace-nowrap">
                      {leg.windSpeedKn !== null ? `${leg.windSpeedKn}kn` : "--"} · {leg.waveHeightM !== null ? `${leg.waveHeightM}m` : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recorded Voyage Samples Table */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-sm font-semibold text-white">
            Recorded Sampling Log (4h Sea · 1h Estuary/River · User Push)
          </h3>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {displayedVoyage.samples.length} records
          </span>
        </div>

        {displayedVoyage.samples.length === 0 ? (
          <div className="bg-slate-950/50 border border-slate-800 rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-slate-400">
            <span>
              No timed snapshots logged yet. Samples are recorded automatically when unmooring, every {zoneInfo.samplingIntervalHours}h while {zoneInfo.zone === "SEA" ? "at sea" : `in ${zoneInfo.zone.toLowerCase()}`}, or immediately when pushed.
            </span>
            <button
              type="button"
              onClick={onPushSample}
              disabled={isSampling}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Log First Sample
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Timestamp (UTC)</th>
                  <th className="py-2 px-2 font-medium">Trigger</th>
                  <th className="py-2 px-2 font-medium">Status / Zone</th>
                  <th className="py-2 px-2 font-medium">Position</th>
                  <th className="py-2 px-2 font-medium text-right">AIS / Calc SOG</th>
                  <th className="py-2 px-2 font-medium text-right">Wind / Wave</th>
                  <th className="py-2 px-2 font-medium text-right">Tide / River</th>
                  <th className="py-2 px-2 font-medium text-right">Depth / UKC</th>
                  <th className="py-2 pl-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedVoyage.samples.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">
                      {new Date(s.sampledAtUtc).toISOString().slice(0, 19).replace("T", " ")}Z
                    </td>
                    <td className="py-2 px-2 text-cyan-300 whitespace-nowrap">{s.triggerType}</td>
                    <td className="py-2 px-2 text-slate-300 whitespace-nowrap">
                      {s.navStatus} · {s.waterZone}
                    </td>
                    <td className="py-2 px-2 text-slate-400 whitespace-nowrap">
                      {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
                    </td>
                    <td className="py-2 px-2 text-right text-white whitespace-nowrap">
                      {s.sogKn.toFixed(1)} / {s.calculatedLegSogKn !== null ? s.calculatedLegSogKn.toFixed(1) : "--"} kn
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300 whitespace-nowrap">
                      {s.windSpeedKn !== null ? `${s.windSpeedKn}kn` : "--"} · {s.waveHeightM !== null ? `${s.waveHeightM}m` : "--"}
                    </td>
                    <td className="py-2 px-2 text-right text-sky-300 whitespace-nowrap">
                      {s.waterZone === "RIVER"
                        ? s.riverHeightM !== null
                          ? `Riv ${s.riverHeightM.toFixed(2)}m`
                          : "Riv --"
                        : s.waterZone === "ESTUARY"
                          ? `${s.tideHeightM !== null ? `Tide ${s.tideHeightM.toFixed(2)}m` : "--"} ${s.seaLevelM !== null ? `MSL ${s.seaLevelM.toFixed(2)}m` : ""}`
                          : "--"}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-300 whitespace-nowrap">
                      {s.bathymetryDepthM !== null
                        ? `${s.bathymetryDepthM.toFixed(1)}m (${s.ukcM !== null ? `UKC ${s.ukcM.toFixed(1)}m` : "--"})`
                        : "Offshore"}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteSample(displayedVoyage.id, s.id)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                        title="Remove sample record"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Plain-Text PostgreSQL / ANSI SQL Output Preview */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Plain-Text PostgreSQL / ANSI SQL Output Preview</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{sqlText.split("\n").length} lines</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySql}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-medium text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSql ? "Copied SQL" : "Copy SQL"}
            </button>
            <button
              type="button"
              onClick={handleDownloadSql}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download .SQL
            </button>
          </div>
        </div>
        <pre className="p-4 text-[11px] leading-relaxed font-mono text-cyan-100/90 bg-slate-950/90 overflow-auto max-h-[380px]">
          {sqlText}
        </pre>
      </section>
    </div>
  );
};
