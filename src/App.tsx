import { useState, useMemo, ChangeEvent, useEffect } from 'react';
import { Anchor, Navigation, Send, Hash, FileSymlink, Settings, MapPin, Calculator, Copy, Check, Wind, Waves, Compass, Activity, Zap, BookOpen, Save, Trash, Plus } from 'lucide-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { generateSistramPlan, ShipData, GeneratorOutput, PT_MONTHS, calculateMaxSOG, haversine } from './lib/sistram';
import { getWaypointWeather, WeatherData } from './lib/weather';
import { RouteMap } from './components/MapComponent';
import { EccodaxLogo } from './components/EccodaxLogo';
import { ManualModal } from './components/ManualModal';

export default function App() {
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [shipData, setShipData] = useState<ShipData>({
    name: 'MERCOSUL ITAJAI',
    callsign: 'PPKQ',
    flag: 'BR',
    type: 'TMC',
    dep_port: 'SANTOS',
    arr_port: 'ROSARIO',
    medical: 'NURSE-ENFERMEIRO',
    mmsi: '710000200',
    disp: 50000,
    draft: 8.1,
    windArea: 1000,
    rpm: 92,
  });

  const [savedProfiles, setSavedProfiles] = useState<Record<string, ShipData>>({});
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    const loaded = localStorage.getItem('sistram_profiles');
    if (loaded) {
      try {
        setSavedProfiles(JSON.parse(loaded));
      } catch (e) {
        console.error('Failed to load profiles');
      }
    }
  }, []);

  const saveProfile = () => {
    if (!profileName.trim()) return alert('Insira um nome para a viagem/perfil');
    const newProfiles = { ...savedProfiles, [profileName.trim()]: shipData };
    setSavedProfiles(newProfiles);
    localStorage.setItem('sistram_profiles', JSON.stringify(newProfiles));
  };
  
  const loadProfile = (name: string) => {
    if (name && savedProfiles[name]) {
      setShipData(savedProfiles[name]);
      setProfileName(name);
    } else {
       setProfileName('');
    }
  };

  const deleteProfile = (name: string) => {
    if (!name) return;
    const newProfiles = { ...savedProfiles };
    delete newProfiles[name];
    setSavedProfiles(newProfiles);
    localStorage.setItem('sistram_profiles', JSON.stringify(newProfiles));
    if (profileName === name) setProfileName('');
  };

  const initialEtd = new Date();
  const initialEta = new Date(initialEtd.getTime() + 24 * 60 * 60 * 1000);
  const initialSend = new Date(initialEtd.getTime() + 20 * 60 * 1000);

  const formatLocal = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [times, setTimes] = useState({
    etd: formatLocal(initialEtd),
    etdZone: -3,
    eta: formatLocal(initialEta),
    etaZone: -3,
    sendTime: formatLocal(initialSend),
    sendZone: -3,
  });

  const [waypointsStr, setWaypointsStr] = useState([
    '0310S 05959W',
    '0309S 05827W',
    '0237S 05645W',
    '0454S 03510W'
  ].join('\n'));

  const [output, setOutput] = useState<GeneratorOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [waypointWeather, setWaypointWeather] = useState<Record<number, WeatherData | null>>({});
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);

  const zones = Array.from({ length: 27 }, (_, i) => i - 12);

  const handleGenerate = () => {
    setErrorMsg('');
    const lines = waypointsStr.trim().split('\n');
    const waypointsRaw = lines.map(line => {
      let parts = line.split('\t');
      if (parts.length >= 2) {
         return { lat: parts[0].trim(), lon: parts[1].trim() };
      }
      
      parts = line.trim().split(/\s+/);
      if (parts.length === 4) {
          return { lat: parts[0] + parts[1], lon: parts[2] + parts[3] };
      }
      return { lat: parts[0] || '', lon: parts[1] || '' };
    }).filter(wp => wp.lat && wp.lon);

    if (waypointsRaw.length < 2) {
      setErrorMsg('Please provide at least a departure and arrival waypoint.');
      return;
    }

    const res = generateSistramPlan(shipData, waypointsRaw, times);
    if (!res) {
      setErrorMsg('Error generating plan. Please check your inputs and coordinate formats (e.g. 0310S 05959W).');
    } else {
      setOutput(res);
      setWaypointWeather({});
      setIsFetchingWeather(true);
      
      Promise.all(res.waypoints.map((wp, idx) => 
        getWaypointWeather(wp.latDecl, wp.lonDecl, wp.timeUtc).then(data => {
            setWaypointWeather(prev => ({ ...prev, [idx]: data }));
        })
      )).finally(() => {
        setIsFetchingWeather(false);
      });
    }
  };

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShipChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.type === 'number' ? Number(e.target.value) : e.target.value.toUpperCase();
    setShipData({ ...shipData, [e.target.name]: val });
  };
  
  const handleTimeChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === 'number' || e.target.name.includes('Zone') 
      ? Number(e.target.value) 
      : e.target.value;
    setTimes({ ...times, [e.target.name]: val });
  };

  const analytics = useMemo(() => {
    if (!output || !waypointWeather) return null;
    if (Object.keys(waypointWeather).length !== output.waypoints.length) return null;
    if (output.waypoints.length < 2) return null;

    let sum_d_n_over_sog = 0;
    let totalDist = 0;
    let ok = true;
    
    for (let i = 1; i < output.waypoints.length; i++) {
        const prev = output.waypoints[i-1];
        const curr = output.waypoints[i];
        const w = waypointWeather[i];
        if (!w || curr.bearingFromPrev === undefined || w.windSpeed === null) {
            ok = false;
            break;
        }
        
        const d_n = haversine(prev.latDecl, prev.lonDecl, curr.latDecl, curr.lonDecl);
        const maxSog = calculateMaxSOG(
            shipData,
            w.windSpeed,
            w.windDirection,
            w.waveHeight,
            w.waveDirection,
            w.wavePeriod,
            w.currentVelocity,
            w.currentDirection,
            curr.bearingFromPrev
        );
        
        if (maxSog <= 0) {
           ok = false; break;
        }
        
        totalDist += d_n;
        sum_d_n_over_sog += (d_n / maxSog);
    }
    
    if (!ok || sum_d_n_over_sog === 0) return null;
    
    const sogAvgMax = totalDist / sum_d_n_over_sog;
    const weightedTotalEnrouteTime = sum_d_n_over_sog;
    
    const etdDate = new Date(times.etd);
    const etdUtc = new Date(etdDate.getTime() + times.etdZone * 3600 * 1000);
    const etaUtcEnv = new Date(etdUtc.getTime() + weightedTotalEnrouteTime * 3600 * 1000);
    
    const lastWp = output.waypoints[output.waypoints.length - 1];
    const envEtaZone = Math.round(lastWp.lonDecl / 15);
    const etaLocalEnv = new Date(etaUtcEnv.getTime() + envEtaZone * 3600 * 1000);
    
    return {
       sogAvgMax,
       weightedTotalEnrouteTime,
       etaUtcEnv,
       etaLocalEnv,
       totalDist
    };

  }, [output, waypointWeather, shipData, times.etd, times.etdZone]);

  return (
    <div className="min-h-screen bg-[#05070a] text-slate-300 font-sans p-4 lg:p-6 flex flex-col gap-4 overflow-auto" style={{ backgroundImage: 'radial-gradient(circle at 50% -20%, #1e293b 0%, #05070a 60%)' }}>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-cyan-900/50 pb-4 shrink-0">
        <div className="flex items-center gap-4">
          <EccodaxLogo className="w-12 h-12" />
          <div className="flex flex-col">
            <h1 className="text-xs font-mono tracking-widest text-cyan-500 uppercase flex items-center gap-2">
              Navigational Engineering Specialist
            </h1>
            <h2 className="text-2xl font-light text-white tracking-tight mt-1 flex items-center gap-3">
              SISTRAM <span className="text-cyan-500 font-bold italic">Type 1</span>
              <button onClick={() => setIsManualOpen(true)} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-300 transition-colors flex items-center gap-1 font-bold tracking-wider ml-2">
                 <BookOpen className="w-3 h-3 text-cyan-400" /> MANUAL
              </button>
            </h2>
          </div>
        </div>
        <div className="text-right mt-2 sm:mt-0 flex flex-col items-end">
          <div className="text-[10px] font-mono text-slate-500 uppercase">System Status</div>
          <div className="text-emerald-500 flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
            GEODESIC ENGINE ACTIVE
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
          
          {/* Left Column: Form Inputs */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
            
            {/* Section 1: Ship Data */}
            <section className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 border-b border-slate-800 pb-2 gap-2">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-cyan-500" />
                  <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ship Static & Variable Data</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                   <select 
                     value={savedProfiles[profileName] ? profileName : ""} 
                     onChange={(e) => loadProfile(e.target.value)}
                     className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-cyan-600 transition-colors w-32"
                   >
                     <option value="">-- Saved Profiles --</option>
                     {Object.keys(savedProfiles).map(p => <option key={p} value={p}>{p}</option>)}
                   </select>
                   <input
                     type="text"
                     placeholder="Profile Name"
                     value={profileName}
                     onChange={(e) => setProfileName(e.target.value)}
                     className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-cyan-600 transition-colors w-24"
                   />
                   <button onClick={saveProfile} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1.5 rounded text-cyan-400 transition-colors flex items-center gap-1 font-bold" title="Save profile">
                     <Save className="w-3 h-3" /> Save
                   </button>
                   {savedProfiles[profileName] && (
                     <button onClick={() => deleteProfile(profileName)} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1.5 rounded text-red-400 transition-colors flex items-center gap-1 font-bold" title="Delete profile">
                       <Trash className="w-3 h-3" /> Delete
                     </button>
                   )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-1">
                {[
                  { id: 'name', label: 'Ship Name', type: 'text' },
                  { id: 'callsign', label: 'Call Sign', type: 'text' },
                  { id: 'flag', label: 'Flag', type: 'text' },
                  { id: 'type', label: 'Type', type: 'text' },
                  { id: 'mmsi', label: 'MMSI', type: 'text' },
                  { id: 'medical', label: 'Medical Resources', type: 'text' },
                  { id: 'dep_port', label: 'Departure Port (G)', type: 'text' },
                  { id: 'arr_port', label: 'Arrival Port (I)', type: 'text' },
                  { id: 'disp', label: 'Disp', type: 'number' },
                  { id: 'draft', label: 'Draft', type: 'number' },
                  { id: 'windArea', label: 'WindArea', type: 'number' },
                  { id: 'rpm', label: 'RPM', type: 'number' },
                ].map(field => (
                  <div key={field.id} className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block tracking-widest">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      name={field.id}
                      value={shipData[field.id as keyof ShipData]}
                      onChange={handleShipChange}
                      className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white font-mono outline-none focus:border-cyan-600 transition-colors uppercase placeholder:opacity-30"
                      placeholder={`Enter ${field.label}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Temporal Details */}
            <section className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-2 border-b border-slate-800 pb-2">
                <Settings className="w-4 h-4 text-cyan-500" />
                <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Routing Logistics</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* ETD */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest border-b border-slate-800 pb-1">B - Departure (ETD)</h3>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">DEP_LT</label>
                        <DatePicker
                           selected={new Date(times.etd)}
                           onChange={(date: Date | null) => date && setTimes({...times, etd: formatLocal(date)})}
                           showTimeSelect
                           timeFormat="HH:mm"
                           timeIntervals={15}
                           dateFormat="yyyy-MM-dd HH:mm"
                           className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Departure_UTC_Offset</label>
                        <select name="etdZone" value={times.etdZone} onChange={handleTimeChange} className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors">
                            {zones.map(z => <option key={z} value={z}>{z >= 0 ? `+${z}` : z}</option>)}
                        </select>
                    </div>
                </div>

                {/* ETA */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest border-b border-slate-800 pb-1">I - Arrival (ETA)</h3>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">ETA_LT</label>
                        <DatePicker
                           selected={new Date(times.eta)}
                           onChange={(date: Date | null) => date && setTimes({...times, eta: formatLocal(date)})}
                           showTimeSelect
                           timeFormat="HH:mm"
                           timeIntervals={15}
                           dateFormat="yyyy-MM-dd HH:mm"
                           className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Arrival_UTC_Offset</label>
                        <select name="etaZone" value={times.etaZone} onChange={handleTimeChange} className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors">
                            {zones.map(z => <option key={z} value={z}>{z >= 0 ? `+${z}` : z}</option>)}
                        </select>
                    </div>
                </div>

                {/* Send Time */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest border-b border-slate-800 pb-1">Transmission Time</h3>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">TT_LT</label>
                        <DatePicker
                           selected={new Date(times.sendTime)}
                           onChange={(date: Date | null) => date && setTimes({...times, sendTime: formatLocal(date)})}
                           showTimeSelect
                           timeFormat="HH:mm"
                           timeIntervals={15}
                           dateFormat="yyyy-MM-dd HH:mm"
                           className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Transmission_UTC_Offset</label>
                        <select name="sendZone" value={times.sendZone} onChange={handleTimeChange} className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors">
                            {zones.map(z => <option key={z} value={z}>{z >= 0 ? `+${z}` : z}</option>)}
                        </select>
                    </div>
                </div>
              </div>
            </section>

            {/* Section 3: Waypoints */}
            <section className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-2 border-b border-slate-800 pb-2 justify-between">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-cyan-500" />
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Waypoint Sequence Paste</h2>
                </div>
                <div className="text-[10px] font-mono uppercase opacity-50 flex items-center gap-1 text-slate-400">
                    <FileSymlink className="w-3 h-3" />
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <textarea
                  rows={4}
                  value={waypointsStr}
                  onChange={(e) => setWaypointsStr(e.target.value.toUpperCase())}
                  className="w-full min-h-[150px] bg-black/40 border border-slate-700 rounded p-3 text-xs font-mono text-cyan-100 focus:border-cyan-600 outline-none resize-y placeholder:opacity-50"
                  placeholder="Paste coordinates here.&#10;&#10;Supported formats:&#10;23°55.61' S    046°19.12' W&#10;0310S           05959W"
                />
              </div>

               <div className="mt-2 flex items-center justify-between">
                 {errorMsg ? (
                    <div className="flex-1 text-red-500 font-mono text-xs pr-4">{errorMsg}</div>
                 ) : (
                    <div className="flex-1 text-slate-500 font-mono text-[10px]">FORMAT: Accepts degrees/minutes or raw SISTRAM. First is (G), last is (I).</div>
                 )}
                 <button
                    onClick={handleGenerate}
                    className="w-full md:w-auto py-3 px-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors uppercase tracking-widest text-xs shadow-[0_4px_20px_rgba(8,145,178,0.3)] flex items-center justify-center gap-2 ml-auto"
                  >
                    <Calculator className="w-4 h-4" />
                    Generate Type 1
                  </button>
               </div>
            </section>

            {/* Map Component */}
            {output && output.waypoints.length > 0 && (
              <section className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-2 border-b border-slate-800 pb-2">
                  <Compass className="w-4 h-4 text-cyan-500" />
                  <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Geospatial Overview</h2>
                </div>
                <RouteMap output={output} waypointWeather={waypointWeather} />
              </section>
            )}

          </div>

          {/* Right Column: Output / Specs */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
             
            <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-4">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Hash className="w-4 h-4 text-cyan-500" />
                    Voyage Analytics
                </h3>

                <div className="space-y-4">
                    <div className="flex justify-between items-end border-b border-slate-800 pb-2">
                        <span className="text-xs text-slate-400">Total Distance</span>
                        <span className="text-lg font-mono text-white font-bold">
                            {output?.totalDist ? output.totalDist : '--'} <span className="text-[10px] text-slate-500">NM</span>
                        </span>
                    </div>
                     <div className="flex justify-between items-end border-b border-slate-800 pb-2">
                        <span className="text-xs text-slate-400">Req. Total Enroute Time</span>
                        <span className="text-lg font-mono text-white font-bold">
                            {output?.totalHours ? output.totalHours : '--'} <span className="text-[10px] text-slate-500">HRS</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-end border-b border-slate-800 pb-2">
                        <span className="text-xs text-slate-400">Req. Avg Speed</span>
                        <span className="text-lg font-mono text-white font-bold">
                            {output?.avgSpeed ? output.avgSpeed : '--'} <span className="text-[10px] text-slate-500">KTS</span>
                        </span>
                    </div>
                    {analytics && (
                      <>
                        <div className="flex justify-between items-end border-b border-purple-900/50 pb-2 bg-purple-900/10 px-2 rounded-t">
                            <span className="text-xs text-purple-400 flex items-center gap-1 font-bold"><Zap className="w-3 h-3"/> Env Avg Max SOG</span>
                            <span className="text-lg font-mono text-purple-300 font-bold">
                                {analytics.sogAvgMax.toFixed(2)} <span className="text-[10px] text-purple-500">KTS</span>
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-b border-purple-900/50 pb-2 bg-purple-900/10 px-2">
                            <span className="text-xs text-purple-400">Weighted Enroute Time</span>
                            <span className="text-lg font-mono text-purple-300 font-bold">
                                {analytics.weightedTotalEnrouteTime.toFixed(1)} <span className="text-[10px] text-purple-500">HRS</span>
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-b border-purple-900/50 pb-2 bg-purple-900/10 px-2 rounded-b">
                            <span className="text-xs text-purple-400">Proposed ETA (EnviroETA)</span>
                            <div className="text-right flex flex-col">
                                <span className="text-lg font-mono text-purple-300 font-bold">
                                    {analytics.etaUtcEnv.getUTCHours().toString().padStart(2, '0')}:{analytics.etaUtcEnv.getUTCMinutes().toString().padStart(2, '0')} Z
                                    <span className="text-[10px] text-purple-500 ml-1">
                                        {PT_MONTHS[analytics.etaUtcEnv.getUTCMonth()]} {analytics.etaUtcEnv.getUTCDate()}
                                    </span>
                                </span>
                                <span className="text-[10px] font-mono text-purple-400/70">
                                    {analytics.etaLocalEnv.getUTCHours().toString().padStart(2, '0')}:{analytics.etaLocalEnv.getUTCMinutes().toString().padStart(2, '0')} LT
                                </span>
                            </div>
                        </div>
                      </>
                    )}
                </div>
            </div>

            <div className="flex flex-col bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden min-h-[300px]">
               <div className="bg-slate-800/50 p-2 border-b border-slate-700 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase ml-2 flex items-center gap-2">
                     <Send className="w-3 h-3 text-cyan-500" />
                     SISTRAM Message Output
                  </span>
                  {output && (
                    <button onClick={handleCopy} className="text-[10px] bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-white transition-colors flex items-center gap-1 font-bold tracking-wider">
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'COPIED' : 'COPY'}
                    </button>
                  )}
               </div>
               <div className="flex-1 p-4 sm:p-6 font-mono text-sm leading-relaxed text-cyan-50 overflow-auto">
                 {output ? (
                    <div>
                        <div className="text-cyan-600 opacity-50 mb-4">// START OF MESSAGE //</div>
                        <pre className="whitespace-pre-wrap break-all text-cyan-50 font-mono">
                            {output.message}
                        </pre>
                        <div className="text-cyan-600 opacity-50 mt-4">// END OF MESSAGE //</div>
                    </div>
                 ) : (
                    <div className="h-full flex items-center justify-center text-xs font-mono uppercase tracking-widest text-cyan-900/50 text-center p-8">
                       Awaiting Calculation...
                    </div>
                 )}
               </div>
            </div>

            {output && (
              <div className="flex flex-col bg-slate-900/40 rounded-lg border border-emerald-900/50 overflow-hidden shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                 <div className="bg-emerald-900/20 p-3 border-b border-emerald-900/30 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase ml-1 flex items-center gap-2">
                       <Activity className="w-3 h-3" />
                       Route Environment Intelligence
                    </span>
                    {isFetchingWeather ? (
                      <span className="text-[10px] font-mono text-emerald-500 animate-pulse uppercase">Fetching Metocean Data...</span>
                    ) : (
                      <span className="text-[10px] font-mono text-emerald-500 uppercase">Live Weather Sync</span>
                    )}
                 </div>
                 <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-emerald-900/50 scrollbar-track-transparent">
                    {output.waypoints.map((wp, idx) => {
                      const weather = waypointWeather[idx];
                      
                      let warningColor = 'text-slate-400';
                      let suggestion = '';
                      if (weather && typeof weather.waveHeight === 'number') {
                        if (weather.waveHeight > 3) {
                          warningColor = 'text-red-400';
                          suggestion = 'Heavy seas. Consider speed reduction or routing adjustment to minimize slamming.';
                        } else if (weather.waveHeight > 2 || (weather.windSpeed && weather.windSpeed > 25)) {
                          warningColor = 'text-amber-400';
                          suggestion = 'Moderate conditions. Keep watch on parameter drift.';
                        } else {
                          warningColor = 'text-emerald-400';
                          suggestion = 'Favorable weather window.';
                        }
                      }

                      return (
                        <div key={idx} className="flex flex-col gap-2 p-3 bg-black/20 rounded border border-slate-800/50 hover:border-emerald-900/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-cyan-400 font-mono">
                              {wp.type === 'G' ? 'Waypoint 1 (Dep)' : wp.type === 'I' ? `Waypoint ${idx + 1} (Arr)` : `Waypoint ${idx + 1}`}
                            </span>
                            <div className="flex gap-3 items-center">
                              {wp.bearingFromPrev !== undefined && (
                                <span className="text-[10px] text-emerald-400 font-mono font-bold" title="Rumo em relação ao Norte Verdadeiro (RV)">
                                  RV: {Math.round(wp.bearingFromPrev).toString().padStart(3, '0')}°
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500 font-mono">ETA: {wp.timeLocal.getUTCHours().toString().padStart(2, '0')}:{wp.timeLocal.getUTCMinutes().toString().padStart(2, '0')} / {PT_MONTHS[wp.timeLocal.getUTCMonth()]} {wp.timeLocal.getUTCDate()}</span>
                            </div>
                          </div>
                          
                          {weather ? (
                            <div className="grid grid-cols-4 gap-2 mt-2">
                              <div className="flex flex-col gap-1 border-l-2 border-amber-500/50 pl-2">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">Wind</span>
                                <span className="text-xs font-mono text-slate-300">
                                  {weather.windSpeed !== null ? `${Math.round(weather.windSpeed)} kt` : '--'}
                                  {weather.windDirection !== null ? ` ${weather.windDirection}°` : ''}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 border-l-2 border-cyan-500/50 pl-2">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">Waves</span>
                                <span className="text-xs font-mono text-slate-300">
                                  {weather.waveHeight !== null ? `${weather.waveHeight}m` : '--'}
                                  {weather.waveDirection !== null ? ` ${weather.waveDirection}°` : ''}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 border-l-2 border-emerald-500/50 pl-2">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">Curr</span>
                                <span className="text-xs font-mono text-slate-300">
                                  {weather.currentVelocity !== null ? `${Math.round(weather.currentVelocity * 10) / 10} kt` : '--'}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 border-l-2 border-purple-500/50 pl-2 bg-purple-900/10">
                                <span className="text-[9px] text-purple-400 uppercase flex items-center gap-1 font-bold"><Zap className="w-3 h-3"/> Max SOG</span>
                                <span className="text-xs font-mono font-bold text-purple-300">
                                  {idx > 0 && wp.bearingFromPrev !== undefined ? (() => {
                                      const maxSog = calculateMaxSOG(
                                        shipData,
                                        weather.windSpeed,
                                        weather.windDirection,
                                        weather.waveHeight,
                                        weather.waveDirection,
                                        weather.wavePeriod,
                                        weather.currentVelocity,
                                        weather.currentDirection,
                                        wp.bearingFromPrev
                                      );
                                      return `${maxSog} kt`;
                                  })() : '--'}
                                </span>
                              </div>
                            </div>
                          ) : isFetchingWeather ? (
                            <div className="h-10 flex items-center justify-center opacity-50">
                              <span className="text-[10px] font-mono text-emerald-500 animate-pulse">Syncing...</span>
                            </div>
                          ) : (
                            <div className="h-10 flex items-center justify-center opacity-50">
                              <span className="text-[10px] font-mono text-slate-500">Data unavailable</span>
                            </div>
                          )}

                          {suggestion && (
                            <div className={`mt-2 text-[10px] bg-black/40 p-2 rounded border border-slate-800 ${warningColor}`}>
                              {suggestion}
                            </div>
                          )}
                        </div>
                      )
                    })}
                 </div>
              </div>
            )}


          </div>

        </div>
      </main>

      <footer className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-[10px] font-mono text-slate-600 border-t border-slate-900 pt-3 mt-2 shrink-0 gap-2">
        <div className="flex flex-col gap-1">
           <div>MMSI: {shipData.mmsi || '------'} | CALLSIGN: {shipData.callsign || '----'} | FLAG: {shipData.flag || '--'}</div>
           <div className="opacity-60 italic text-[9px]">
             Geospatial metocean data provided by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline">Open-Meteo API</a>.
           </div>
        </div>
        <div className="flex gap-4">
          <span>SISTRAM v1.0.0</span>
          <span className="text-slate-700">LAT/LON PARSER: <span className="text-emerald-700">OK</span></span>
          <span className="text-slate-700">TIME ENGINE: <span className="text-emerald-700">SYNC</span></span>
        </div>
      </footer>
      
      {isManualOpen && <ManualModal onClose={() => setIsManualOpen(false)} />}
    </div>
  );
}
