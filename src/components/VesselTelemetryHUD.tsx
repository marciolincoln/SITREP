import React, { useState } from 'react';
import { 
  Navigation, 
  Compass, 
  Activity, 
  Radio, 
  Settings, 
  Crosshair, 
  ChevronUp, 
  ChevronDown, 
  AlertTriangle, 
  Clock, 
  Anchor, 
  ExternalLink,
  ShieldCheck,
  Gauge,
  Key,
  RefreshCw,
  Sliders,
  Check
} from 'lucide-react';
import { 
  VesselPosition, 
  VesselNavMetrics, 
  MarineTrafficConfig, 
  formatNauticalCoord,
  MARINETRAFFIC_URL,
  MARINETRAFFIC_MAP_URL,
  MARINETRAFFIC_SHIP_ID,
  MARINETRAFFIC_IMO,
  PPKQ_PRESETS,
  parseMarineTrafficCoordinates,
  getEffectiveVesselSog,
  DEFAULT_PPKQ_LIVE_POSITION
} from '../lib/ais';

interface VesselTelemetryHUDProps {
  vessel: VesselPosition;
  metrics: VesselNavMetrics;
  config: MarineTrafficConfig;
  onUpdateConfig: (config: MarineTrafficConfig) => void;
  onCenterOnVessel: () => void;
  onManualOverride?: (pos: Partial<VesselPosition>) => void;
  onRefreshNow: () => void;
  isRefreshing?: boolean;
  countdownSec?: number;
}

export function VesselTelemetryHUD({
  vessel,
  metrics,
  config,
  onUpdateConfig,
  onCenterOnVessel,
  onManualOverride,
  onRefreshNow,
  isRefreshing = false,
  countdownSec = 60,
}: VesselTelemetryHUDProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'sync' | 'presets' | 'api'>('sync');
  const [pasteInput, setPasteInput] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [tempApiKey, setTempApiKey] = useState(config.apiKey);
  const [tempInterval, setTempInterval] = useState(config.refreshIntervalSec);
  const [tempMultiplier, setTempMultiplier] = useState(config.simulationSpeedMultiplier);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState(vessel.navStatus);
  const [editPort, setEditPort] = useState(vessel.currentPort || 'BRSSZ (Santos)');
  const [editDest, setEditDest] = useState(vessel.destination || 'BRNVT');
  const [editLat, setEditLat] = useState(String(vessel.lat));
  const [editLon, setEditLon] = useState(String(vessel.lon));
  const [editSog, setEditSog] = useState(String(getEffectiveVesselSog(vessel)));
  const [editCog, setEditCog] = useState(String(vessel.cog));
  const [editHeading, setEditHeading] = useState(String(vessel.heading));
  const [editDraught, setEditDraught] = useState(String(vessel.draught));

  React.useEffect(() => {
    setEditStatus(vessel.navStatus);
    setEditPort(vessel.currentPort || 'BRSSZ (Santos)');
    setEditDest(vessel.destination || 'BRNVT');
    setEditLat(String(vessel.lat));
    setEditLon(String(vessel.lon));
    setEditSog(String(getEffectiveVesselSog(vessel)));
    setEditCog(String(vessel.cog));
    setEditHeading(String(vessel.heading));
    setEditDraught(String(vessel.draught));
  }, [vessel]);

  const coords = formatNauticalCoord(vessel.lat, vessel.lon);
  const effectiveSog = getEffectiveVesselSog(vessel);
  const isMoored = vessel.navStatus.toLowerCase().includes('moored');
  const isAnchored = vessel.navStatus.toLowerCase().includes('anchor');
  const isStationary = isMoored || isAnchored || effectiveSog === 0;

  const triggerSyncFlash = (msg: string) => {
    setSyncNotice(msg);
    setTimeout(() => setSyncNotice(null), 3000);
  };

  const handleSetVesselStatus = (newStatus: 'Moored' | 'At anchor' | 'Under way using engine') => {
    if (!onManualOverride) return;
    if (newStatus === 'Moored') {
      onManualOverride({
        lat: -23.9450,
        lon: -46.3150,
        cog: 124,
        heading: 137,
        draught: 9.8,
        navStatus: 'Moored at BRSSZ',
        currentPort: 'BRSSZ (Santos)',
        destination: 'BRNVT',
        sog: 0.0,
      });
      triggerSyncFlash('Updated: Moored at BRSSZ → BRNVT (0.0 kn)');
    } else if (newStatus === 'At anchor') {
      onManualOverride({
        lat: -24.0850,
        lon: -46.2800,
        navStatus: 'At anchor',
        currentPort: 'BRSSZ Anchorage',
        destination: 'BRNVT',
        sog: 0.0,
      });
      triggerSyncFlash('Updated: At Anchor BRSSZ (0.0 kn)');
    } else {
      onManualOverride({
        ...DEFAULT_PPKQ_LIVE_POSITION,
      });
      onRefreshNow();
      triggerSyncFlash('Synced: Live AIS Transponder Fix');
    }
  };

  const handleApplyDirectEdit = () => {
    if (!onManualOverride) return;
    const latNum = parseFloat(editLat);
    const lonNum = parseFloat(editLon);
    const sogNum = parseFloat(editSog);
    const cogNum = parseFloat(editCog);
    const hdgNum = parseFloat(editHeading);
    const drgNum = parseFloat(editDraught);

    onManualOverride({
      navStatus: editStatus.trim() || 'Moored at BRSSZ',
      currentPort: editPort.trim() || 'BRSSZ (Santos)',
      destination: editDest.trim() || 'BRNVT',
      lat: !isNaN(latNum) ? latNum : vessel.lat,
      lon: !isNaN(lonNum) ? lonNum : vessel.lon,
      sog: !isNaN(sogNum) ? sogNum : 0.0,
      cog: !isNaN(cogNum) ? cogNum : vessel.cog,
      heading: !isNaN(hdgNum) ? hdgNum : vessel.heading,
      draught: !isNaN(drgNum) ? drgNum : vessel.draught,
    });
    triggerSyncFlash(`AIS Updated: ${editStatus} → ${editDest}`);
    setPasteFeedback({
      type: 'success',
      message: `Telemetria AIS atualizada: ${editStatus} (${editPort} → ${editDest})`,
    });
    setTimeout(() => {
      setPasteFeedback(null);
      setShowSettingsModal(false);
    }, 1200);
  };

  const handleApplyPaste = () => {
    setPasteFeedback(null);
    if (!pasteInput.trim()) {
      setPasteFeedback({ type: 'error', message: 'Cole as coordenadas ou texto do MarineTraffic antes de aplicar.' });
      return;
    }

    const parsed = parseMarineTrafficCoordinates(pasteInput);
    if (!parsed) {
      setPasteFeedback({
        type: 'error',
        message: 'Não foi possível identificar dados AIS válidos. Use texto do MarineTraffic ou coordenadas (-23.945, -46.315).'
      });
      return;
    }

    if (onManualOverride) {
      const mergedLat = parsed.lat ?? vessel.lat;
      const mergedLon = parsed.lon ?? vessel.lon;
      onManualOverride({
        ...parsed,
        lat: mergedLat,
        lon: mergedLon,
      });
      const coordStr = formatNauticalCoord(mergedLat, mergedLon).combined;
      const statusStr = parsed.navStatus ? ` · ${parsed.navStatus}` : '';
      const destStr = parsed.destination ? ` → ${parsed.destination}` : '';
      triggerSyncFlash(`AIS Synced: ${parsed.navStatus || vessel.navStatus}`);
      setPasteFeedback({
        type: 'success',
        message: `AIS sincronizado: ${coordStr}${statusStr}${destStr}`
      });
      setTimeout(() => {
        setPasteFeedback(null);
        setShowSettingsModal(false);
      }, 1500);
    }
  };

  const handleApplyPreset = (preset: typeof PPKQ_PRESETS[0]) => {
    if (onManualOverride) {
      onManualOverride({
        lat: preset.lat,
        lon: preset.lon,
        sog: preset.sog,
        cog: preset.cog,
        heading: preset.heading,
        navStatus: preset.navStatus,
        currentPort: preset.currentPort,
        destination: preset.destination,
        draught: preset.draught,
      });
      setShowSettingsModal(false);
    }
  };

  const handleSaveSettings = () => {
    onUpdateConfig({
      ...config,
      apiKey: tempApiKey.trim(),
      refreshIntervalSec: tempInterval,
      simulationSpeedMultiplier: tempMultiplier,
    });
    setShowSettingsModal(false);
  };

  const copyCoordinates = () => {
    navigator.clipboard.writeText(`${vessel.lat.toFixed(5)}, ${vessel.lon.toFixed(5)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  return (
    <>
      <div className="absolute top-3 left-3 z-[1000] max-w-sm w-full transition-all duration-200">
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg shadow-2xl shadow-black/80 overflow-hidden text-slate-100">
          
          {/* Header Bar */}
          <div className="bg-slate-800/90 px-3.5 py-2.5 border-b border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Radio className={`w-4 h-4 ${isRefreshing ? 'text-cyan-400 animate-spin' : isMoored ? 'text-sky-400' : 'text-emerald-400'}`} />
                <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${isMoored ? 'bg-sky-400' : 'bg-emerald-400 animate-ping'}`} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs tracking-wider text-white">MERCOSUL ITAJAI</span>
                  <span className="bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold">
                    {vessel.callsign}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                  <span>MMSI: {vessel.mmsi}</span>
                  <span>·</span>
                  <span>IMO: {MARINETRAFFIC_IMO}</span>
                  <span>·</span>
                  <span className="text-emerald-400">{vessel.source}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <a
                href={MARINETRAFFIC_MAP_URL}
                target="_blank"
                rel="noreferrer"
                title={`Open MarineTraffic Live Map (shipid:${MARINETRAFFIC_SHIP_ID}/zoom:10)`}
                className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-700/60 rounded transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => {
                  onRefreshNow();
                  triggerSyncFlash(`AIS Fix Synced • ${new Date().toLocaleTimeString()}`);
                }}
                disabled={isRefreshing}
                title="Refresh AIS Position Now"
                className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-700/60 rounded transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              <button
                type="button"
                onClick={onCenterOnVessel}
                title="Center Map on Vessel PPKQ"
                className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-700/60 rounded transition-colors"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                title="MarineTraffic Live Sync & Settings"
                className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-700/60 rounded transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded transition-colors"
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Collapsed view summary */}
          {isCollapsed ? (
            <div className="px-3 py-2 flex items-center justify-between text-xs font-mono bg-slate-900/60">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                  isMoored
                    ? 'bg-sky-950/90 text-sky-300 border-sky-500/60'
                    : isAnchored
                    ? 'bg-amber-950/90 text-amber-300 border-amber-500/60'
                    : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                }`}>
                  {vessel.navStatus}
                </span>
                <span>SOG: <strong className="text-cyan-400">{effectiveSog.toFixed(1)} kn</strong></span>
                <span>HDG: <strong className="text-cyan-400">{vessel.heading.toFixed(0)}°T</strong></span>
              </div>
            </div>
          ) : (
            /* Full Telemetry Body */
            <div className="p-3.5 space-y-3">
              
              {/* Primary Current Vessel Status Banner */}
              <div className={`rounded p-2.5 border flex flex-col gap-2 ${
                isMoored
                  ? 'bg-sky-950/50 border-sky-500/60'
                  : isAnchored
                  ? 'bg-amber-950/50 border-amber-500/60'
                  : 'bg-emerald-950/50 border-emerald-500/60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {isStationary ? (
                      <Anchor className="w-4 h-4 text-sky-400 shrink-0" />
                    ) : (
                      <Navigation className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                        Current Vessel Status
                      </span>
                      <span className="text-xs font-bold font-mono uppercase tracking-wide text-white">
                        {vessel.navStatus}
                      </span>
                      <span className="text-[10px] font-mono text-sky-300">
                        Port: <strong>{vessel.currentPort || 'BRSSZ (Santos)'}</strong> → Dest: <strong className="text-cyan-300">{vessel.destination}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                      isMoored
                        ? 'bg-sky-900/70 text-sky-200 border-sky-400/50'
                        : isAnchored
                        ? 'bg-amber-900/70 text-amber-200 border-amber-400/50'
                        : 'bg-emerald-900/70 text-emerald-200 border-emerald-400/50'
                    }`}>
                      {isStationary ? 'SOG 0.0 KN (STATIONARY)' : `SOG ${effectiveSog.toFixed(1)} KN`}
                    </span>
                  </div>
                </div>

                {/* Quick Status Switcher */}
                {onManualOverride && (
                  <div className="flex items-center gap-1 pt-1 border-t border-slate-800/80 text-[9.5px] font-mono">
                    <span className="text-slate-400 mr-1">Mode:</span>
                    <button
                      type="button"
                      onClick={() => handleSetVesselStatus('Moored')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        isMoored
                          ? 'bg-sky-600 text-white font-bold shadow-sm'
                          : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-700'
                      }`}
                    >
                      Moored BRSSZ (0 kn)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetVesselStatus('At anchor')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        isAnchored
                          ? 'bg-amber-600 text-white font-bold shadow-sm'
                          : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-700'
                      }`}
                    >
                      Anchored
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetVesselStatus('Under way using engine')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        !isMoored && !isAnchored
                          ? 'bg-emerald-600 text-white font-bold shadow-sm'
                          : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-700'
                      }`}
                    >
                      Live MT Fix
                    </button>
                  </div>
                )}
              </div>

              {/* Primary Gauge Readouts: SOG, COG, Heading */}
              <div className="grid grid-cols-3 gap-2">
                
                {/* SOG Gauge */}
                <div className="bg-slate-950/70 border border-slate-800 rounded p-2 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">SOG</span>
                  <div className="flex items-baseline gap-0.5">
                    <span className={`text-xl font-bold font-mono tracking-tight ${isStationary ? 'text-sky-400' : 'text-cyan-400'}`}>
                      {effectiveSog.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">kn</span>
                  </div>
                  {isStationary ? (
                    <span className="text-[9px] text-sky-400 font-mono font-semibold mt-1 uppercase">
                      {isMoored ? 'Moored (0 kn)' : 'Stationary'}
                    </span>
                  ) : (
                    <div className="w-full bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
                      <div 
                        className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (effectiveSog / 24) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* COG Gauge */}
                <div className="bg-slate-950/70 border border-slate-800 rounded p-2 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">COG</span>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xl font-bold font-mono text-cyan-400 tracking-tight">
                      {vessel.cog.toFixed(0).padStart(3, '0')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">°T</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono mt-1">Ground Track</span>
                </div>

                {/* Heading & Mini Compass Rose */}
                <div className="bg-slate-950/70 border border-slate-800 rounded p-2 flex flex-col items-center justify-center text-center relative overflow-hidden">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">HEADING</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div 
                      className="w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center transition-transform duration-300"
                      style={{ transform: `rotate(${vessel.heading}deg)` }}
                    >
                      <Navigation className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                    </div>
                    <span className="text-base font-bold font-mono text-white tracking-tight">
                      {vessel.heading.toFixed(0).padStart(3, '0')}°
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">Gyro / True</span>
                </div>
              </div>

              {/* Coordinates Block */}
              <div 
                onClick={copyCoordinates}
                title="Click to copy coordinates"
                className="bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between cursor-pointer transition-colors group"
              >
                <div className="flex flex-col font-mono text-xs">
                  <div className="text-slate-200 font-semibold">{coords.latStr}</div>
                  <div className="text-slate-300">{coords.lonStr}</div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-cyan-300 font-mono">
                  {copiedCoords ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[9px]">WGS84</span>
                    </>
                  )}
                </div>
              </div>

              {/* Waypoint Target & Next Leg Info */}
              {metrics.nextWaypointName && metrics.distToNextWaypoint !== null && (
                <div className="bg-slate-950/70 border border-slate-800 rounded p-2 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Target Leg:</span>
                    <span className="text-cyan-400 font-semibold">{metrics.nextWaypointName}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Range & Azimuth:</span>
                    <span className="text-white">
                      <strong>{metrics.distToNextWaypoint.toFixed(1)} NM</strong> @ {metrics.bearingToNextWaypoint}°T
                    </span>
                  </div>
                </div>
              )}

              {/* Status details bar */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                <div className="flex items-center gap-1.5">
                  <span>Status:</span>
                  <span className={`px-1.5 py-0.2 rounded font-semibold text-[9px] ${
                    isMoored 
                      ? 'bg-blue-950 text-blue-300 border border-blue-500/50' 
                      : isAnchored
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                  }`}>
                    {vessel.navStatus}
                  </span>
                </div>
                <div>
                  Draught: <span className="text-slate-200 font-semibold">{vessel.draught.toFixed(1)} m</span>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <span>Port: <strong className="text-sky-300">{vessel.currentPort || 'BRSSZ'}</strong> → Dest: <strong className="text-cyan-300">{vessel.destination}</strong></span>
                  {vessel.eta && <span className="text-slate-400">ETA: <strong className="text-slate-200">{vessel.eta}</strong></span>}
                </div>
                {/* Continuous Sync (60s) Toggle Bar */}
                <div className="col-span-2 flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1.5 mt-0.5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-200 flex items-center gap-1.5">
                      <span>Continuous Sync</span>
                      {config.continuousSync && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-mono">
                          {countdownSec}s
                        </span>
                      )}
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {config.continuousSync
                        ? 'Auto-refreshing MarineTraffic every 60s'
                        : 'Manual trigger only'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(config.continuousSync)}
                    aria-label="Continuous Sync"
                    onClick={() => {
                      const nextContinuous = !config.continuousSync;
                      onUpdateConfig({
                        ...config,
                        continuousSync: nextContinuous,
                        refreshIntervalSec: 60,
                      });
                      if (nextContinuous) {
                        onRefreshNow();
                        triggerSyncFlash('Continuous Sync ON (60s interval)');
                      } else {
                        triggerSyncFlash('Continuous Sync OFF (Manual)');
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.continuousSync ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        config.continuousSync ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="col-span-2 flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${config.continuousSync ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`} />
                    {syncNotice ? (
                      <span className="text-emerald-400 font-bold">{syncNotice}</span>
                    ) : (
                      <span>
                        {config.continuousSync
                          ? `Continuous Sync (60s • next in ${countdownSec}s)`
                          : 'AIS Source: Terrestrial (Manual Sync)'}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onRefreshNow();
                      triggerSyncFlash(`AIS Fix Synced • ${new Date().toLocaleTimeString()}`);
                    }}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>Fix: {new Date(vessel.timestamp).toLocaleTimeString()}</span>
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* MarineTraffic Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-lg w-full p-5 shadow-2xl text-slate-100 font-sans space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="font-bold text-base text-white">MarineTraffic AIS Connection</h3>
                  <div className="text-[10px] text-slate-400 font-mono">
                    PPKQ · IMO {MARINETRAFFIC_IMO} · Ship ID {MARINETRAFFIC_SHIP_ID}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Vessel Metadata Banner */}
            <div className="bg-slate-950/80 border border-slate-800 rounded p-3 text-slate-300">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Monitored Vessel Profile</span>
                </div>
                <a
                  href={MARINETRAFFIC_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px] font-mono underline"
                >
                  Open MarineTraffic Live <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                <div>Vessel: <strong className="text-white block">MERCOSUL ITAJAI</strong></div>
                <div>Call Sign: <strong className="text-cyan-400 block">PPKQ</strong></div>
                <div>MMSI: <strong className="text-white block">710027240</strong></div>
                <div>IMO: <strong className="text-white block">9697002</strong></div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 gap-1">
              <button
                type="button"
                onClick={() => setSettingsTab('sync')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                  settingsTab === 'sync'
                    ? 'border-cyan-400 text-cyan-300 bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Sync MarineTraffic Data
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('presets')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                  settingsTab === 'presets'
                    ? 'border-cyan-400 text-cyan-300 bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Operational Presets
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('api')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                  settingsTab === 'api'
                    ? 'border-cyan-400 text-cyan-300 bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                API & Polling Engine
              </button>
            </div>

            {/* Tab 1: Sync Real MarineTraffic Data */}
            {settingsTab === 'sync' && (
              <div className="space-y-3 text-xs max-h-[380px] overflow-y-auto pr-1">
                {/* Direct Quick Editor for Current Status & Port */}
                <div className="bg-slate-950/90 border border-slate-800 rounded p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider font-mono">
                      Direct AIS Telemetry Override
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditStatus('Moored at BRSSZ');
                        setEditPort('BRSSZ (Santos)');
                        setEditDest('BRNVT');
                        setEditLat('-23.9450');
                        setEditLon('-46.3150');
                        setEditSog('0.0');
                        setEditCog('124');
                        setEditHeading('137');
                        setEditDraught('9.8');
                      }}
                      className="text-[10px] text-sky-400 hover:text-sky-300 font-mono underline"
                    >
                      Reset to BRSSZ → BRNVT Baseline
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Navigational Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditStatus(val);
                          if (val.toLowerCase().includes('moored') || val.toLowerCase().includes('anchor')) {
                            setEditSog('0.0');
                          } else if (parseFloat(editSog) === 0) {
                            setEditSog('14.2');
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      >
                        <option value="Moored at BRSSZ">Moored at BRSSZ</option>
                        <option value="Moored at BRNVT">Moored at BRNVT</option>
                        <option value="At anchor">At anchor</option>
                        <option value="Under way using engine">Under way using engine</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Current Port</label>
                      <input
                        type="text"
                        value={editPort}
                        onChange={(e) => setEditPort(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Destination</label>
                      <input
                        type="text"
                        value={editDest}
                        onChange={(e) => setEditDest(e.target.value.toUpperCase())}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Latitude (Dec)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editLat}
                        onChange={(e) => setEditLat(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Longitude (Dec)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editLon}
                        onChange={(e) => setEditLon(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Speed SOG (kn)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editSog}
                        onChange={(e) => setEditSog(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Course COG (°)</label>
                      <input
                        type="number"
                        value={editCog}
                        onChange={(e) => setEditCog(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Heading HDG (°)</label>
                      <input
                        type="number"
                        value={editHeading}
                        onChange={(e) => setEditHeading(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-slate-400 mb-0.5">Draught (m)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editDraught}
                        onChange={(e) => setEditDraught(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleApplyDirectEdit}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs shadow transition-colors flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Atualizar Telemetria Direta
                    </button>
                  </div>
                </div>

                {/* Paste from MarineTraffic */}
                <div className="pt-1 border-t border-slate-800">
                  <p className="text-slate-300 text-xs leading-relaxed mb-2">
                    Ou cole o texto copiado diretamente do MarineTraffic (
                    <a
                      href={MARINETRAFFIC_MAP_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline"
                    >
                      shipid:{MARINETRAFFIC_SHIP_ID}/zoom:10
                    </a>
                    ):
                  </p>
                  <textarea
                    rows={3}
                    value={pasteInput}
                    onChange={(e) => setPasteInput(e.target.value)}
                    placeholder="Cole aqui coordenadas ou texto copiado da ficha do navio no MarineTraffic..."
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-white font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {pasteFeedback && (
                  <div
                    className={`p-2 rounded text-xs font-mono border ${
                      pasteFeedback.type === 'success'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : 'bg-red-950/80 border-red-500 text-red-300'
                    }`}
                  >
                    {pasteFeedback.message}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPasteInput(`Navigational status: Moored at BRSSZ
Current Port: BRSSZ (Santos, BRAZIL)
Position received: Live
Vessel's local time: 2026-10-31 07:10 (UTC-3)
Latitude/Longitude: -23.9450, -46.3150 (BRSSZ Berth)
Speed: 0 kn
Course: 124 °
True heading: 137 °
Rate of turn: 0 °/min
Draught: 9.8 m
Reported destination: BRNVT
Matched destination: Navegantes, BRAZIL
Reported ETA: 2026-10-31 22:00 (UTC-3)
AIS vessel type: Cargo - Hazard A (Major)
AIS source: Terrestrial`);
                    }}
                    className="text-[11px] text-slate-400 hover:text-cyan-300 font-mono underline text-left"
                  >
                    Inserir texto MarineTraffic (Moored at BRSSZ → Dest: BRNVT)
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyPaste}
                    className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded text-xs shadow-md transition-colors flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aplicar Texto Colado
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Operational Route Presets */}
            {settingsTab === 'presets' && (
              <div className="space-y-2.5 text-xs max-h-[300px] overflow-y-auto pr-1">
                <p className="text-slate-400 text-[11px]">
                  Selecione um ponto da rota de cabotagem do MERCOSUL ITAJAI para posicionar o navio instantaneamente:
                </p>
                <div className="space-y-2">
                  {PPKQ_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-slate-950/80 border border-slate-800 hover:border-cyan-500/60 rounded p-2.5 transition-all flex items-center justify-between group"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                            {preset.name}
                          </span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                            {preset.navStatus}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {preset.description}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-3">
                          <span>Coord: {preset.lat.toFixed(2)}°, {preset.lon.toFixed(2)}°</span>
                          <span>SOG: {preset.sog.toFixed(1)} kn</span>
                          <span>COG: {preset.cog}°T</span>
                          <span>Dest: {preset.destination}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white rounded text-[11px] font-mono transition-colors shrink-0 ml-2"
                      >
                        Posicionar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: API & Polling Engine */}
            {settingsTab === 'api' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                    <span>MarineTraffic API Key (PS05)</span>
                    <a 
                      href="https://www.marinetraffic.com/en/services/api" 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline flex items-center gap-1 text-[10px]"
                    >
                      Get API Key <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      placeholder="Enter MarineTraffic PS05 API Key"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                    <Key className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-1">
                    Sem chave de API paga, o sistema usa as coordenadas reais sincronizadas e simulação dead-reckoning de alta precisão ao longo da rota.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Update Interval
                    </label>
                    <select
                      value={tempInterval}
                      onChange={(e) => setTempInterval(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value={10}>10 Seconds (High)</option>
                      <option value={15}>15 Seconds (Standard)</option>
                      <option value={30}>30 Seconds</option>
                      <option value={60}>60 Seconds</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Dead-Reckoning Multiplier
                    </label>
                    <select
                      value={tempMultiplier}
                      onChange={(e) => setTempMultiplier(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value={1}>1x (Tempo Real)</option>
                      <option value={2}>2x</option>
                      <option value={5}>5x (Demonstração)</option>
                      <option value={10}>10x (Avanço Rápido)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <a
                href={MARINETRAFFIC_URL}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px] font-mono"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                marinetraffic.com/.../shipid:{MARINETRAFFIC_SHIP_ID}
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded shadow-md transition-colors"
                >
                  Salvar Configuração
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
