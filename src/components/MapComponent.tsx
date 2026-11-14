import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { 
  ExternalLink, 
  Layers, 
  Navigation, 
  Waves, 
  Wind, 
  Compass, 
  Info, 
  BarChart2, 
  X,
  Gauge,
  Radio,
  Crosshair,
  Anchor,
  ShieldCheck
} from 'lucide-react';
import { GeneratorOutput } from '../lib/sistram';
import { WeatherData } from '../lib/weather';
import { 
  VesselPosition, 
  VesselNavMetrics, 
  MarineTrafficConfig, 
  formatNauticalCoord,
  getEffectiveVesselSog
} from '../lib/ais';
import { VesselTelemetryHUD } from './VesselTelemetryHUD';

// Fix for default Leaflet markers in bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapProps {
  output: GeneratorOutput | null;
  waypointWeather: Record<number, WeatherData | null>;
  analytics?: any;
  vessel?: VesselPosition;
  vesselMetrics?: VesselNavMetrics;
  vesselHistory?: Array<{ lat: number; lon: number; timestamp: string; sog: number }>;
  mtConfig?: MarineTrafficConfig;
  onUpdateMtConfig?: (cfg: MarineTrafficConfig) => void;
  onRefreshAis?: () => void;
  isRefreshingAis?: boolean;
  aisCountdownSec?: number;
  onManualOverrideVessel?: (pos: Partial<VesselPosition>) => void;
}

export type BaseLayerType = 'dark' | 'standard' | 'ocean';
export type VectorOverlayMode = 'wind' | 'wave' | 'both' | 'none';

// Wind scale classification (Beaufort aligned)
export function getWindScale(knots: number | null) {
  if (knots === null || knots === undefined) {
    return {
      color: '#94a3b8',
      label: 'N/A',
      beaufort: '-',
      desc: 'No data',
      bgClass: 'bg-slate-800/80',
      borderClass: 'border-slate-700',
      textClass: 'text-slate-400',
    };
  }
  if (knots < 10) {
    return {
      color: '#10b981', // emerald-500
      label: '< 10 kn',
      beaufort: 'F0–3',
      desc: 'Calm / Light Breeze',
      bgClass: 'bg-emerald-950/80',
      borderClass: 'border-emerald-500',
      textClass: 'text-emerald-400',
    };
  }
  if (knots < 21) {
    return {
      color: '#eab308', // yellow-500
      label: '10–20 kn',
      beaufort: 'F4–5',
      desc: 'Moderate / Fresh Breeze',
      bgClass: 'bg-yellow-950/80',
      borderClass: 'border-yellow-500',
      textClass: 'text-yellow-400',
    };
  }
  if (knots < 34) {
    return {
      color: '#f97316', // orange-500
      label: '21–33 kn',
      beaufort: 'F6–7',
      desc: 'Strong Breeze / Near Gale',
      bgClass: 'bg-orange-950/80',
      borderClass: 'border-orange-500',
      textClass: 'text-orange-400',
    };
  }
  if (knots < 48) {
    return {
      color: '#ef4444', // red-500
      label: '34–47 kn',
      beaufort: 'F8–9',
      desc: 'Gale / Strong Gale',
      bgClass: 'bg-red-950/80',
      borderClass: 'border-red-500',
      textClass: 'text-red-400',
    };
  }
  return {
    color: '#d946ef', // fuchsia-500
    label: '≥ 48 kn',
    beaufort: 'F10–12',
    desc: 'Storm / Hurricane Force',
    bgClass: 'bg-fuchsia-950/80',
    borderClass: 'border-fuchsia-500',
    textClass: 'text-fuchsia-400',
  };
}

// Wave scale classification (Douglas Sea Scale aligned)
export function getWaveScale(meters: number | null) {
  if (meters === null || meters === undefined) {
    return {
      color: '#94a3b8',
      label: 'N/A',
      douglas: '-',
      desc: 'No data',
      bgClass: 'bg-slate-800/80',
      borderClass: 'border-slate-700',
      textClass: 'text-slate-400',
    };
  }
  if (meters < 1.25) {
    return {
      color: '#06b6d4', // cyan-500
      label: '< 1.25 m',
      douglas: 'D0–3',
      desc: 'Smooth / Slight Sea',
      bgClass: 'bg-cyan-950/80',
      borderClass: 'border-cyan-500',
      textClass: 'text-cyan-400',
    };
  }
  if (meters < 2.5) {
    return {
      color: '#eab308', // yellow-500
      label: '1.25–2.5 m',
      douglas: 'D4',
      desc: 'Moderate Sea',
      bgClass: 'bg-yellow-950/80',
      borderClass: 'border-yellow-500',
      textClass: 'text-yellow-400',
    };
  }
  if (meters < 4.0) {
    return {
      color: '#f97316', // orange-500
      label: '2.5–4.0 m',
      douglas: 'D5',
      desc: 'Rough Sea',
      bgClass: 'bg-orange-950/80',
      borderClass: 'border-orange-500',
      textClass: 'text-orange-400',
    };
  }
  if (meters < 6.0) {
    return {
      color: '#ef4444', // red-500
      label: '4.0–6.0 m',
      douglas: 'D6',
      desc: 'Very Rough Sea',
      bgClass: 'bg-red-950/80',
      borderClass: 'border-red-500',
      textClass: 'text-red-400',
    };
  }
  return {
    color: '#d946ef', // fuchsia-500
    label: '≥ 6.0 m',
    douglas: 'D7–9',
    desc: 'High / Phenomenal Sea',
    bgClass: 'bg-fuchsia-950/80',
    borderClass: 'border-fuchsia-500',
    textClass: 'text-fuchsia-400',
  };
}

// Convert degrees (0-360) to 16-point cardinal compass text
export function degToCardinal(deg: number | null): string {
  if (deg === null || deg === undefined) return '--';
  const val = Math.floor((deg / 22.5) + 0.5);
  const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return arr[val % 16];
}

function MapAutoBounds({ bounds, boundsKey }: { bounds: L.LatLngBounds; boundsKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, map]);
  return null;
}

function MapPanTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, Math.max(map.getZoom(), 10), { duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

export function RouteMap({
  output,
  waypointWeather,
  analytics,
  vessel,
  vesselMetrics,
  vesselHistory,
  mtConfig,
  onUpdateMtConfig,
  onRefreshAis,
  isRefreshingAis = false,
  aisCountdownSec,
  onManualOverrideVessel,
}: MapProps) {
  const [baseLayer, setBaseLayer] = useState<BaseLayerType>('dark');
  const [showSeamarks, setShowSeamarks] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'leaflet' | 'openseamap_portal'>('leaflet');
  const [vectorMode, setVectorMode] = useState<VectorOverlayMode>('both');
  const [showLegend, setShowLegend] = useState<boolean>(false);
  const [showValuesOnMap, setShowValuesOnMap] = useState<boolean>(true);
  const [showVessel, setShowVessel] = useState<boolean>(true);
  const [targetPan, setTargetPan] = useState<[number, number] | null>(null);

  const handleCenterOnVessel = () => {
    if (vessel) {
      setTargetPan([vessel.lat, vessel.lon]);
      // Reset target after transition so re-clicking works
      setTimeout(() => setTargetPan(null), 1500);
    }
  };

  const hasWaypoints = output && output.waypoints && output.waypoints.length > 0;

  if (!hasWaypoints && !vessel) {
    return (
      <div className="w-full h-[450px] flex flex-col items-center justify-center bg-slate-950/60 border border-slate-800 rounded-lg p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center text-cyan-400 mb-3">
          <Navigation className="w-6 h-6 animate-pulse" />
        </div>
        <span className="text-slate-400 font-mono text-sm font-semibold">OpenSeaMap Route Chart</span>
        <p className="text-slate-500 text-xs mt-1 max-w-sm">
          Awaiting calculation. Enter waypoints in Voyage Planner to plot the geodetic route, overlay OpenMeteo wind &amp; wave vectors, and monitor vessel PPKQ AIS.
        </p>
        <a 
          href="https://map.openseamap.org/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Explore map.openseamap.org
        </a>
      </div>
    );
  }

  const positions: [number, number][] = hasWaypoints 
    ? output!.waypoints.map(wp => [wp.latDecl, wp.lonDecl])
    : vessel ? [[vessel.lat, vessel.lon]] : [[-24.28, -46.22]];

  const bounds = L.latLngBounds(positions);
  if (vessel) {
    bounds.extend([vessel.lat, vessel.lon]);
  }
  const boundsKey = [
    ...positions.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`),
    vessel ? `${vessel.lat.toFixed(1)},${vessel.lon.toFixed(1)}` : '',
  ].join('|');

  const centerLat = bounds.isValid() ? bounds.getCenter().lat : positions[0][0];
  const centerLon = bounds.isValid() ? bounds.getCenter().lng : positions[0][1];
  
  // Calculate approximate zoom for external OpenSeaMap link
  const latDiff = Math.abs(bounds.getNorth() - bounds.getSouth());
  const lonDiff = Math.abs(bounds.getEast() - bounds.getWest());
  const maxDiff = Math.max(latDiff, lonDiff);
  const calculatedZoom = maxDiff > 30 ? 4 : maxDiff > 15 ? 5 : maxDiff > 7 ? 6 : maxDiff > 3 ? 7 : maxDiff > 1 ? 8 : 10;

  const openSeaMapWebUrl = `https://map.openseamap.org/?zoom=${calculatedZoom}&lat=${centerLat.toFixed(4)}&lon=${centerLon.toFixed(4)}&layers=BFTFFFTFFTF0TT`;

  const effectiveVesselSog = vessel ? getEffectiveVesselSog(vessel) : 0;

  // 6-Minute Velocity Predictor Vector calculation
  let velocityPredictorEnd: [number, number] | null = null;
  if (vessel && effectiveVesselSog > 0.5) {
    const cogRad = (vessel.cog * Math.PI) / 180;
    const advanceDistNm = effectiveVesselSog * 0.1; // 6 minutes advance (0.1 hour)
    const dLat = (advanceDistNm * Math.cos(cogRad)) / 60;
    const dLon = (advanceDistNm * Math.sin(cogRad)) / (60 * Math.cos((vessel.lat * Math.PI) / 180));
    velocityPredictorEnd = [vessel.lat + dLat, vessel.lon + dLon];
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-xs">
        {/* Left: View mode & Base map selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded bg-black/40 p-0.5 border border-slate-800">
            <button
              onClick={() => setViewMode('leaflet')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                viewMode === 'leaflet'
                  ? 'bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3 h-3" />
              Route Overlay
            </button>
            <button
              onClick={() => setViewMode('openseamap_portal')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                viewMode === 'openseamap_portal'
                  ? 'bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Waves className="w-3 h-3" />
              OpenSeaMap Portal
            </button>
          </div>

          {viewMode === 'leaflet' && (
            <>
              {/* Basemap selector */}
              <div className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded border border-slate-800">
                <Layers className="w-3 h-3 text-slate-400" />
                <select
                  value={baseLayer}
                  onChange={(e) => setBaseLayer(e.target.value as BaseLayerType)}
                  className="bg-transparent text-slate-300 text-[11px] outline-none cursor-pointer border-none pr-1"
                >
                  <option value="dark" className="bg-slate-900 text-slate-200">Dark Marine</option>
                  <option value="standard" className="bg-slate-900 text-slate-200">OSM Chart</option>
                  <option value="ocean" className="bg-slate-900 text-slate-200">Ocean Relief</option>
                </select>
              </div>

              {/* Seamarks Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer bg-black/30 px-2 py-1 rounded border border-slate-800 text-[11px] text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={showSeamarks}
                  onChange={(e) => setShowSeamarks(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                />
                <span className="text-cyan-400 font-semibold">Seamarks</span>
              </label>

              {/* Vessel PPKQ AIS Toggle Button */}
              {vessel && (
                <button
                  type="button"
                  onClick={() => setShowVessel(!showVessel)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1.5 border ${
                    showVessel
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/70 font-semibold shadow-sm'
                      : 'bg-black/30 text-slate-500 border-slate-800 hover:text-slate-300'
                  }`}
                  title="Toggle Vessel PPKQ AIS Position & Status HUD"
                >
                  <Radio className={`w-3.5 h-3.5 ${isRefreshingAis ? 'text-cyan-400 animate-spin' : showVessel ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span>PPKQ ({vessel.navStatus.toUpperCase()})</span>
                  <span className="text-[10px] text-cyan-400/90 font-bold">
                    {effectiveVesselSog.toFixed(1)}kn
                  </span>
                </button>
              )}

              {/* Vector Overlay Selector */}
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono px-1 flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-cyan-400" />
                  Vectors:
                </span>
                <button
                  type="button"
                  onClick={() => setVectorMode('wind')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                    vectorMode === 'wind' 
                      ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-600/60 font-bold shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Display color-coded Wind Speed vectors"
                >
                  <Wind className="w-2.5 h-2.5 text-emerald-400" />
                  Wind
                </button>
                <button
                  type="button"
                  onClick={() => setVectorMode('wave')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                    vectorMode === 'wave' 
                      ? 'bg-cyan-900/70 text-cyan-300 border border-cyan-600/60 font-bold shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Display color-coded Wave Height vectors"
                >
                  <Waves className="w-2.5 h-2.5 text-cyan-400" />
                  Waves
                </button>
                <button
                  type="button"
                  onClick={() => setVectorMode('both')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                    vectorMode === 'both' 
                      ? 'bg-slate-700 text-white border border-cyan-500/60 font-bold shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Display both Wind and Wave metocean vectors"
                >
                  Both
                </button>
                <button
                  type="button"
                  onClick={() => setVectorMode('none')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    vectorMode === 'none' 
                      ? 'bg-slate-800 text-slate-200 font-bold' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title="Turn off vector overlays"
                >
                  Off
                </button>
              </div>

              {/* Show Labels on Map */}
              {vectorMode !== 'none' && (
                <button
                  type="button"
                  onClick={() => setShowValuesOnMap(!showValuesOnMap)}
                  className={`px-2 py-1 rounded text-[10px] font-mono transition-colors border ${
                    showValuesOnMap
                      ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800/60'
                      : 'bg-black/30 text-slate-500 border-slate-800'
                  }`}
                  title="Toggle vector value badges on map"
                >
                  {showValuesOnMap ? 'Labels: ON' : 'Labels: OFF'}
                </button>
              )}

              {/* Legend Toggle Button */}
              {vectorMode !== 'none' && (
                <button
                  type="button"
                  onClick={() => setShowLegend(!showLegend)}
                  className={`px-2 py-1 rounded text-[10px] font-mono transition-colors flex items-center gap-1 border ${
                    showLegend
                      ? 'bg-amber-950/50 text-amber-300 border-amber-700/60'
                      : 'bg-black/30 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                  title="Toggle metocean color scale legend"
                >
                  <BarChart2 className="w-3 h-3 text-amber-400" />
                  Legend
                </button>
              )}
            </>
          )}
        </div>

        {/* Right: External Link */}
        <div className="flex items-center gap-2">
          <a
            href={openSeaMapWebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 rounded text-[11px] font-mono transition-colors"
            title="Open route position in https://map.openseamap.org"
          >
            <ExternalLink className="w-3 h-3" />
            <span>map.openseamap.org</span>
          </a>
        </div>
      </div>

      {/* Main Map Content */}
      <div className="w-full h-[580px] rounded-lg overflow-hidden border border-slate-800 relative z-0 bg-[#0a0e17]">
        
        {/* Floating Nautical Telemetry HUD for PPKQ */}
        {showVessel && vessel && vesselMetrics && mtConfig && onUpdateMtConfig && (
          <VesselTelemetryHUD
            vessel={vessel}
            metrics={vesselMetrics}
            config={mtConfig}
            onUpdateConfig={onUpdateMtConfig}
            onCenterOnVessel={handleCenterOnVessel}
            onManualOverride={onManualOverrideVessel}
            onRefreshNow={onRefreshAis || (() => {})}
            isRefreshing={isRefreshingAis}
            countdownSec={aisCountdownSec}
          />
        )}

        {viewMode === 'openseamap_portal' ? (
          <div className="w-full h-full relative">
            <iframe
              src={openSeaMapWebUrl}
              title="OpenSeaMap Live Marine Chart"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
            <div className="absolute bottom-2 left-2 bg-slate-900/90 backdrop-blur-sm border border-slate-700 text-[10px] text-slate-300 px-3 py-1.5 rounded font-mono z-10 flex items-center gap-2 shadow-lg">
              <Info className="w-3 h-3 text-cyan-400" />
              <span>Live OpenSeaMap Web Portal • Lat {centerLat.toFixed(2)}°, Lon {centerLon.toFixed(2)}°</span>
            </div>
          </div>
        ) : (
          <MapContainer 
            bounds={bounds} 
            scrollWheelZoom={true}
            className="w-full h-full bg-[#0a0e17]"
          >
            <MapAutoBounds bounds={bounds} boundsKey={boundsKey} />
            <MapPanTo target={targetPan} />

            {/* Base Layer Selection */}
            {baseLayer === 'dark' && (
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                maxZoom={19}
              />
            )}

            {baseLayer === 'standard' && (
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
            )}

            {baseLayer === 'ocean' && (
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
                maxZoom={13}
              />
            )}

            {/* OpenSeaMap Seamarks Layer Overlay */}
            {showSeamarks && (
              <TileLayer
                attribution='&copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors'
                url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
                maxZoom={18}
                opacity={0.9}
              />
            )}
            
            {/* Voyage Route Polyline */}
            {hasWaypoints && (
              <Polyline 
                positions={positions} 
                pathOptions={{ 
                  color: '#06b6d4', 
                  weight: 3.5, 
                  dashArray: '6, 8',
                  opacity: 0.9 
                }} 
              />
            )}

            {/* Vessel PPKQ Breadcrumb Trail */}
            {showVessel && vesselHistory && vesselHistory.length > 1 && (
              <Polyline
                positions={vesselHistory.map(h => [h.lat, h.lon])}
                pathOptions={{
                  color: '#0284c7',
                  weight: 2,
                  dashArray: '3, 6',
                  opacity: 0.7,
                }}
              />
            )}

            {/* Vessel 6-Minute Velocity Predictor Vector */}
            {showVessel && vessel && velocityPredictorEnd && (
              <Polyline
                positions={[
                  [vessel.lat, vessel.lon],
                  velocityPredictorEnd
                ]}
                pathOptions={{
                  color: '#38bdf8',
                  weight: 2.5,
                  opacity: 0.85,
                }}
              />
            )}

            {/* Vessel PPKQ Custom Marker with Orientation and Telemetry */}
            {showVessel && vessel && (
              <Marker
                position={[vessel.lat, vessel.lon]}
                zIndexOffset={1000}
                icon={L.divIcon({
                  className: 'vessel-ppkq-marker',
                  html: `
                    <div style="width: 70px; height: 70px; position: relative; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
                      
                      <!-- Ship Hull Silhouette Rotated to True Heading -->
                      <div style="position: absolute; transform: rotate(${vessel.heading}deg); transition: transform 0.4s ease; display: flex; align-items: center; justify-content: center;">
                        <svg width="48" height="48" viewBox="0 0 100 100" style="overflow: visible; filter: drop-shadow(0 0 8px rgba(2, 132, 199, 0.9));">
                          <!-- Wake turbulence circle -->
                          <circle cx="50" cy="88" r="8" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2, 2" opacity="0.6" />
                          <!-- Ship Container Hull -->
                          <polygon points="50,6 70,30 70,84 30,84 30,30" fill="#0369a1" stroke="#38bdf8" stroke-width="3.5" />
                          <!-- Bridge Island at Stern -->
                          <rect x="38" y="62" width="24" height="16" fill="#0b1329" stroke="#7dd3fc" stroke-width="2" rx="2" />
                          <!-- Container Deck Slots -->
                          <line x1="34" y1="34" x2="66" y2="34" stroke="#0284c7" stroke-width="2" />
                          <line x1="34" y1="46" x2="66" y2="46" stroke="#0284c7" stroke-width="2" />
                          <!-- Bow Flare Pointer -->
                          <polygon points="50,0 44,12 56,12" fill="#38bdf8" />
                        </svg>
                      </div>

                      <!-- Call Sign and Speed / Moored Tag -->
                      <div style="position: absolute; bottom: -6px; background: rgba(10, 15, 26, 0.95); border: 1.5px solid ${vessel.navStatus.toLowerCase().includes('moored') ? '#0ea5e9' : '#0284c7'}; border-radius: 4px; padding: 1.5px 5px; font-family: monospace; font-size: 8.5px; font-weight: bold; color: #38bdf8; white-space: nowrap; box-shadow: 0 3px 6px rgba(0,0,0,0.9); pointer-events: none; display: flex; align-items: center; gap: 3px;">
                        <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: ${vessel.navStatus.toLowerCase().includes('moored') ? '#38bdf8' : '#10b981'};"></span>
                        PPKQ ${vessel.navStatus.toLowerCase().includes('moored') ? 'MOORED BRSSZ (0.0kn)' : `${effectiveVesselSog.toFixed(1)}kn`}
                      </div>
                    </div>
                  `,
                  iconSize: [70, 70],
                  iconAnchor: [35, 35],
                })}
              >
                <Popup className="custom-popup" maxWidth={320}>
                  <div className="p-2.5 font-sans space-y-2 text-slate-800">
                    <div className="flex items-center justify-between border-b pb-1.5 border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <Radio className="w-4 h-4 text-cyan-600" />
                        <div>
                          <h4 className="font-bold text-xs text-slate-900 leading-tight">MERCOSUL ITAJAI</h4>
                          <span className="font-mono text-[10px] text-cyan-700 font-bold">Call Sign: {vessel.callsign}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                        vessel.navStatus.toLowerCase().includes('moored')
                          ? 'bg-blue-100 text-blue-900 border border-blue-300'
                          : 'bg-cyan-100 text-cyan-800'
                      }`}>
                        {vessel.navStatus.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono bg-slate-50 p-2 rounded border border-slate-100">
                      <div>SOG: <strong className="text-cyan-800 text-xs">{effectiveVesselSog.toFixed(1)} kn</strong></div>
                      <div>COG: <strong className="text-cyan-800 text-xs">{vessel.cog.toFixed(0)}°T</strong></div>
                      <div>Heading: <strong>{vessel.heading.toFixed(0)}°T</strong></div>
                      <div>Draught: <strong>{vessel.draught.toFixed(1)} m</strong></div>
                      <div className="col-span-2 pt-1 border-t border-slate-200 text-slate-600">
                        Port: <strong className="text-slate-900">{vessel.currentPort || 'BRSSZ (Santos)'}</strong> → Dest: <strong className="text-cyan-800">{vessel.destination}</strong>
                      </div>
                      {vessel.eta && (
                        <div className="col-span-2 text-slate-500">
                          ETA: <strong className="text-cyan-800">{vessel.eta}</strong>
                        </div>
                      )}
                      <div className="col-span-2 pt-0.5 text-slate-600">
                        Coord: <strong>{formatNauticalCoord(vessel.lat, vessel.lon).combined}</strong>
                      </div>
                    </div>

                    {vesselMetrics && vesselMetrics.nextWaypointName && (
                      <div className="text-[10px] font-mono p-1.5 rounded border bg-slate-50 text-slate-800 border-slate-200">
                        <div className="flex justify-between">
                          <span>To {vesselMetrics.nextWaypointName}:</span>
                          <strong>{vesselMetrics.distToNextWaypoint} NM @ {vesselMetrics.bearingToNextWaypoint}°T</strong>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[10px]">
                      <span className="text-slate-500 font-mono">Status: {vessel.navStatus}</span>
                      <a
                        href="https://www.marinetraffic.com/en/ais/home/shipid:3689465/zoom:10"
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-700 hover:text-cyan-900 font-semibold flex items-center gap-1 underline"
                      >
                        MarineTraffic Map <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Waypoint Markers with Color-Coded Vector Overlays */}
            {hasWaypoints && output!.waypoints.map((wp, idx) => {
              const w = waypointWeather[idx];
              const wpDetail = analytics?.wpDetails?.[idx];
              const isCritical = wpDetail?.critical?.flags?.length > 0;
              const isDep = wp.type === 'G';
              const isArr = wp.type === 'I';
              const wpLabel = isDep ? 'DEP' : isArr ? 'ARR' : `W${idx + 1}`;

              const windScale = getWindScale(w?.windSpeed ?? null);
              const waveScale = getWaveScale(w?.waveHeight ?? null);

              // Build Custom Metocean Icon HTML
              let iconHtml = '';
              let iconW = 50;
              let iconH = 50;

              if (vectorMode === 'none' || !w || (w.windSpeed === null && w.waveHeight === null)) {
                // Classic compact waypoint circle
                iconW = 32;
                iconH = 32;
                iconHtml = `
                  <div style="width: 28px; height: 28px; border-radius: 50%; background: ${isCritical ? '#7f1d1d' : isDep ? '#065f46' : isArr ? '#581c87' : '#0f172a'}; border: 2px solid ${isCritical ? '#ef4444' : isDep ? '#10b981' : isArr ? '#a855f7' : '#06b6d4'}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px; font-family: monospace; box-shadow: 0 0 10px rgba(0,0,0,0.7);">
                    ${wpLabel}
                  </div>
                `;
              } else {
                // Vector overlay active
                iconW = 80;
                iconH = 80;

                const windFlowDir = w.windDirection !== null ? (w.windDirection + 180) % 360 : null;
                const waveFlowDir = w.waveDirection !== null ? (w.waveDirection + 180) % 360 : null;

                const windSpeed = w.windSpeed ?? 0;
                const windArrowLen = Math.max(24, Math.min(48, 20 + windSpeed * 0.7));
                const waveHeight = w.waveHeight ?? 0;
                const waveArrowLen = Math.max(22, Math.min(46, 18 + waveHeight * 5));

                const showWind = (vectorMode === 'wind' || vectorMode === 'both') && w.windSpeed !== null && windFlowDir !== null;
                const showWave = (vectorMode === 'wave' || vectorMode === 'both') && w.waveHeight !== null && waveFlowDir !== null;

                iconHtml = `
                  <div style="width: 80px; height: 80px; position: relative; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
                    ${showWave ? `
                      <div style="position: absolute; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: rotate(${waveFlowDir}deg); pointer-events: none;">
                        <svg width="76" height="76" viewBox="0 0 100 100" style="overflow: visible;">
                          <line x1="50" y1="50" x2="50" y2="${50 - waveArrowLen}" stroke="${waveScale.color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="4, 3" opacity="0.95" />
                          <polyline points="43,${58 - waveArrowLen} 50,${50 - waveArrowLen} 57,${58 - waveArrowLen}" fill="none" stroke="${waveScale.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
                          <path d="M 44,${50 - waveArrowLen * 0.4} Q 47,${47 - waveArrowLen * 0.4} 50,${50 - waveArrowLen * 0.4} T 56,${50 - waveArrowLen * 0.4}" fill="none" stroke="${waveScale.color}" stroke-width="2" />
                        </svg>
                      </div>
                    ` : ''}

                    ${showWind ? `
                      <div style="position: absolute; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform: rotate(${windFlowDir}deg); pointer-events: none;">
                        <svg width="76" height="76" viewBox="0 0 100 100" style="overflow: visible;">
                          <line x1="50" y1="50" x2="50" y2="${50 - windArrowLen}" stroke="${windScale.color}" stroke-width="3.5" stroke-linecap="round" opacity="1" />
                          <polygon points="50,${44 - windArrowLen} 43,${55 - windArrowLen} 57,${55 - windArrowLen}" fill="${windScale.color}" />
                        </svg>
                      </div>
                    ` : ''}

                    <div style="z-index: 20; width: 26px; height: 26px; border-radius: 50%; background: ${isCritical ? '#7f1d1d' : isDep ? '#064e3b' : isArr ? '#4c1d95' : '#090d16'}; border: 2px solid ${isCritical ? '#ef4444' : isDep ? '#10b981' : isArr ? '#a855f7' : '#06b6d4'}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 9px; font-family: monospace; box-shadow: 0 0 8px rgba(0,0,0,0.9);">
                      ${wpLabel}
                    </div>

                    ${showValuesOnMap ? `
                      <div style="position: absolute; bottom: 2px; display: flex; flex-direction: column; align-items: center; gap: 1px; z-index: 25; pointer-events: none;">
                        ${showWind && (vectorMode === 'wind' || vectorMode === 'both') ? `
                          <div style="font-size: 8px; font-family: monospace; font-weight: bold; color: ${windScale.color}; background: rgba(10, 15, 26, 0.92); padding: 0.5px 3.5px; border-radius: 3px; border: 1px solid ${windScale.color}88; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.6);">
                            💨 ${windSpeed.toFixed(0)}kn
                          </div>
                        ` : ''}
                        ${showWave && (vectorMode === 'wave' || vectorMode === 'both') ? `
                          <div style="font-size: 8px; font-family: monospace; font-weight: bold; color: ${waveScale.color}; background: rgba(10, 15, 26, 0.92); padding: 0.5px 3.5px; border-radius: 3px; border: 1px solid ${waveScale.color}88; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.6);">
                            🌊 ${waveHeight.toFixed(1)}m
                          </div>
                        ` : ''}
                      </div>
                    ` : ''}
                  </div>
                `;
              }

              const customIcon = L.divIcon({
                className: 'custom-metocean-marker',
                html: iconHtml,
                iconSize: [iconW, iconH],
                iconAnchor: [iconW / 2, iconH / 2],
              });

              return (
                <Marker 
                  key={idx} 
                  position={[wp.latDecl, wp.lonDecl]}
                  icon={customIcon}
                >
                  <Popup className="custom-popup" maxWidth={360}>
                    <div className="p-3 font-sans space-y-2 text-slate-800">
                      <div className="flex items-center justify-between border-b pb-1.5 border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${isDep ? 'bg-emerald-500' : isArr ? 'bg-purple-500' : 'bg-cyan-500'}`} />
                          <h4 className="font-bold text-sm text-slate-900">{wpLabel} (Waypoint {idx + 1})</h4>
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {wp.type}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-100 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Coordinate:</span>
                          <span className="font-semibold">{wp.latS} {wp.lonS}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Decimals:</span>
                          <span className="text-slate-600">{wp.latDecl.toFixed(4)}°, {wp.lonDecl.toFixed(4)}°</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">ETA (UTC):</span>
                          <span className="font-semibold text-cyan-800">
                            {wp.timeUtc instanceof Date 
                              ? wp.timeUtc.toISOString().replace('T', ' ').substring(0, 16) 
                              : String(wp.timeUtc).replace('T', ' ').substring(0, 16)} Z
                          </span>
                        </div>
                        {wpDetail?.rhumbDist && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Leg Distance:</span>
                            <span>{wpDetail.rhumbDist.toFixed(1)} NM</span>
                          </div>
                        )}
                        {wpDetail?.course && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Planned Course:</span>
                            <span>{wpDetail.course.toFixed(0)}°</span>
                          </div>
                        )}
                      </div>

                      {/* Metocean Environmental Section */}
                      {w ? (
                        <div className="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                            <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Compass className="w-3 h-3" />
                              Metocean Vector Data
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">OpenMeteo Marine</span>
                          </div>

                          {/* Wind Info */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1 text-slate-300 font-semibold">
                                <Wind className="w-3 h-3 text-emerald-400" />
                                Wind Vector:
                              </span>
                              <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] border ${windScale.bgClass} ${windScale.borderClass} ${windScale.textClass}`}>
                                {windScale.beaufort} • {windScale.desc}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                              <div>Speed: <strong style={{ color: windScale.color }}>{(w.windSpeed ?? 0).toFixed(1)} kn</strong></div>
                              <div>Beaufort: <strong>{windScale.beaufort}</strong></div>
                              <div className="col-span-2 text-[9px] text-slate-400">
                                Blowing from: <strong>{w.windDirection}° ({degToCardinal(w.windDirection)})</strong> &rarr; blowing towards <strong className="text-slate-200">{((w.windDirection ?? 0) + 180) % 360}° ({degToCardinal(((w.windDirection ?? 0) + 180) % 360)})</strong>
                              </div>
                            </div>
                          </div>

                          {/* Wave Info */}
                          <div className="space-y-1 border-t border-slate-800 pt-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1 text-slate-300 font-semibold">
                                <Waves className="w-3 h-3 text-cyan-400" />
                                Wave / Swell Vector:
                              </span>
                              <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] border ${waveScale.bgClass} ${waveScale.borderClass} ${waveScale.textClass}`}>
                                {waveScale.douglas} • {waveScale.desc}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                              <div>Sig. Height (Hs): <strong style={{ color: waveScale.color }}>{(w.waveHeight ?? 0).toFixed(2)} m</strong> ({((w.waveHeight ?? 0) * 3.28084).toFixed(1)} ft)</div>
                              <div>Period (Tp): <strong>{(w.wavePeriod ?? 0).toFixed(1)} s</strong></div>
                              <div className="col-span-2 text-[9px] text-slate-400">
                                Coming from: <strong>{w.waveDirection}° ({degToCardinal(w.waveDirection)})</strong> &rarr; propagates to <strong className="text-slate-200">{((w.waveDirection ?? 0) + 180) % 360}° ({degToCardinal(((w.waveDirection ?? 0) + 180) % 360)})</strong>
                              </div>
                            </div>
                          </div>

                          {/* Ocean Currents (if present) */}
                          {w.currentVelocity !== null && (
                            <div className="text-[9px] font-mono text-slate-400 flex justify-between border-t border-slate-800 pt-1">
                              <span>Ocean Current:</span>
                              <span className="text-slate-200">
                                {(w.currentVelocity ?? 0).toFixed(1)} kn @ {w.currentDirection}° ({degToCardinal(w.currentDirection)})
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 italic p-1 bg-slate-50 rounded">
                          No meteorological data received for this waypoint coordinate.
                        </div>
                      )}

                      {/* Link to OpenSeaMap */}
                      <div className="pt-1 flex items-center justify-between border-t border-slate-200">
                        <span className="text-[9px] text-slate-500 font-mono">WGS84 Datum</span>
                        <a 
                          href={`https://map.openseamap.org/?zoom=11&lat=${wp.latDecl.toFixed(4)}&lon=${wp.lonDecl.toFixed(4)}&layers=BFTFFFTFFTF0TT`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] text-cyan-700 hover:text-cyan-900 font-semibold underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          View on OpenSeaMap
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}

        {/* Floating Metocean Legend Panel (Collapsible) */}
        {showLegend && viewMode === 'leaflet' && (
          <div className="absolute bottom-3 right-3 z-[1000] bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl p-3 max-w-[280px] w-full text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5 font-mono text-[11px]">
                <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                Metocean Vector Scales
              </span>
              <button 
                onClick={() => setShowLegend(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Wind Scale Legend */}
            {(vectorMode === 'wind' || vectorMode === 'both') && (
              <div className="mb-2.5">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-300 font-mono uppercase mb-1">
                  <Wind className="w-3 h-3 text-emerald-400" />
                  Wind Speed (Beaufort Scale)
                </div>
                <div className="flex flex-col gap-1 text-[9px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#10b981]" />
                      &lt; 10 kn (Calm/Light)
                    </span>
                    <span className="text-slate-400">F0–3</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#eab308]" />
                      10–20 kn (Moderate)
                    </span>
                    <span className="text-slate-400">F4–5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316]" />
                      21–33 kn (Fresh/Strong)
                    </span>
                    <span className="text-slate-400">F6–7</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" />
                      34–47 kn (Gale)
                    </span>
                    <span className="text-slate-400">F8–9</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#d946ef]" />
                      &ge; 48 kn (Storm/Hurricane)
                    </span>
                    <span className="text-slate-400">F10–12</span>
                  </div>
                </div>
              </div>
            )}

            {/* Wave Scale Legend */}
            {(vectorMode === 'wave' || vectorMode === 'both') && (
              <div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-300 font-mono uppercase mb-1">
                  <Waves className="w-3 h-3 text-cyan-400" />
                  Significant Wave Height Hs (Douglas)
                </div>
                <div className="flex flex-col gap-1 text-[9px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#06b6d4]" />
                      &lt; 1.25 m (Smooth/Slight)
                    </span>
                    <span className="text-slate-400">D0–3</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#eab308]" />
                      1.25–2.5 m (Moderate)
                    </span>
                    <span className="text-slate-400">D4</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316]" />
                      2.5–4.0 m (Rough)
                    </span>
                    <span className="text-slate-400">D5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" />
                      4.0–6.0 m (Very Rough)
                    </span>
                    <span className="text-slate-400">D6</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#d946ef]" />
                      &ge; 6.0 m (High/Phenomenal)
                    </span>
                    <span className="text-slate-400">D7+</span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-2.5 pt-1.5 border-t border-slate-800/80 text-[8.5px] text-slate-400 font-mono">
              Note: Vector arrows point in the downwind / wave propagation direction (flow vector). Arrow length scales with intensity.
            </div>
          </div>
        )}
      </div>

      {/* Footer information bar */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1 font-mono gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>OpenSeaMap Nautical Data + MarineTraffic AIS Monitor (Call Sign: PPKQ • WGS84)</span>
        </div>
        <div className="flex items-center gap-3">
          {vessel && (
            <span>PPKQ Status: <strong className="text-sky-400 uppercase">{vessel.navStatus}</strong> · SOG: <strong className="text-cyan-400">{effectiveVesselSog.toFixed(1)} kn</strong></span>
          )}
          <span>Active Vectors: <strong className="text-cyan-400 uppercase">{vectorMode}</strong></span>
          {hasWaypoints && <span>Waypoints: <strong className="text-cyan-400">{output!.waypoints.length}</strong></span>}
          {output && output.totalDist > 0 && <span>Dist: <strong className="text-cyan-400">{output.totalDist} NM</strong></span>}
        </div>
      </div>
    </div>
  );
}
