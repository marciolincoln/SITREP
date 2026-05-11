import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GeneratorOutput } from '../lib/sistram';
import { WeatherData } from '../lib/weather';

// Fix for default Leaflet markers
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
}

export function RouteMap({ output, waypointWeather, analytics }: MapProps) {
  if (!output || output.waypoints.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-slate-900 border border-slate-800 rounded-lg">
        <span className="text-slate-500 font-mono text-xs">Awaiting Route Data...</span>
      </div>
    );
  }

  const positions: [number, number][] = output.waypoints.map(wp => [wp.latDecl, wp.lonDecl]);
  
  // Fit map to route bounds
  const bounds = L.latLngBounds(positions);

  return (
    <div className="w-full h-[500px] rounded-lg overflow-hidden border border-slate-800 relative z-0">
      <MapContainer 
        bounds={bounds} 
        scrollWheelZoom={false}
        className="w-full h-full bg-[#0a0e17]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        <Polyline 
           positions={positions} 
           pathOptions={{ color: '#06b6d4', weight: 3, dashArray: '5, 10' }} 
        />

        {output.waypoints.map((wp, idx) => {
          const w = waypointWeather[idx];
          const wpDetail = analytics?.wpDetails?.[idx];
          const isCritical = wpDetail?.critical?.flags?.length > 0;
          
          // Create a custom icon showing wind vector if we have weather
          let customIcon;
          if (w && w.windSpeed !== null && w.windDirection !== null) {
             const waveScale = Math.min((w.waveHeight ?? 0) * 8, 40); // cap size
             const windIconHtml = `
               <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; position: relative;">
                 ${w.waveHeight ? `<div style="position: absolute; width: ${waveScale}px; height: ${waveScale}px; border-radius: 50%; border: 1px dashed ${isCritical ? 'rgba(239, 68, 68, 0.6)' : 'rgba(56, 189, 248, 0.4)'}; background: ${isCritical ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.1)'};"></div>` : ''}
                 <div style="transform: rotate(${w.windDirection}deg); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; z-index: 10;">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${isCritical ? '#fca5a5' : '#22d3ee'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"></line>
                      <polyline points="5 12 12 5 19 12"></polyline>
                   </svg>
                 </div>
               </div>
             `;
             customIcon = L.divIcon({
               className: `border rounded-full flex items-center justify-center shadow-lg ${isCritical ? 'bg-red-900/80 border-red-500 shadow-red-500/50' : 'bg-slate-900 border-slate-700 shadow-cyan-500/20'}`,
               html: windIconHtml,
               iconSize: [40, 40],
               iconAnchor: [20, 20],
             });
          }

          return (
            <Marker 
              key={idx} 
              position={[wp.latDecl, wp.lonDecl]}
              {...(customIcon ? { icon: customIcon } : {})}
            >
              <Popup className="custom-popup">
                <div className="text-slate-900 flex flex-col gap-1 p-1">
                  <div className="font-bold text-xs uppercase flex items-center gap-1 border-b border-slate-200 pb-1">
                    {wp.type === 'G' ? 'DEP' : wp.type === 'I' ? 'ARR' : `WP ${idx + 1}`}
                  </div>
                  <div className="text-[10px] font-mono">
                    Lat: {wp.latDecl.toFixed(4)}°<br/>
                    Lon: {wp.lonDecl.toFixed(4)}°
                  </div>
                  {isCritical && (
                    <div className="mt-1 text-[10px] bg-red-100 text-red-800 font-bold p-1 rounded border border-red-300">
                      {wpDetail.critical.flags.map((f: string) => (
                         <div key={f} className="flex items-center gap-1">⚠ {f}</div>
                      ))}
                    </div>
                  )}
                  {w && (
                    <div className="mt-2 text-[10px] bg-slate-100 p-1 rounded">
                      <div className="font-bold mb-1">Weather Context</div>
                      <div>Wind: {(w.windSpeed ?? 0).toFixed(1)} kn @ {w.windDirection}°</div>
                      <div>Waves: {(w.waveHeight ?? 0).toFixed(1)}m @ {w.waveDirection}°</div>
                      <div>Currents: {(w.currentVelocity ?? 0).toFixed(1)} kn @ {w.currentDirection}°</div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
