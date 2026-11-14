import { useState, useMemo, ChangeEvent, useEffect, useRef } from "react";
import {
  Anchor,
  Navigation,
  Send,
  Hash,
  FileSymlink,
  Settings,
  MapPin,
  Calculator,
  Copy,
  Check,
  Wind,
  Waves,
  Compass,
  Activity,
  Zap,
  BookOpen,
  Save,
  Trash,
  Plus,
  AlertTriangle,
  Upload,
  Download,
  Radio,
  Database,
} from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  generateSistramPlan,
  ShipData,
  GeneratorOutput,
  PT_MONTHS,
  calculateMaxSOG,
  haversine,
  evaluateCriticalSituations,
} from "./lib/sistram";
import { downloadGPXFile } from "./lib/gpx";
import { getWaypointWeather, WeatherData } from "./lib/weather";
import { RouteMap } from "./components/MapComponent";
import { EccodaxLogo } from "./components/EccodaxLogo";
import { PolarSimulator } from "./components/PolarSimulator";
import { ManualModal } from "./components/ManualModal";
import { VoyageSummarySqlPanel } from "./components/VoyageSummarySqlPanel";
import {
  WaterZone,
  HydrographicReport,
  classifyWaterZone,
  fetchPortAuthorityHydrography,
  getSamplingIntervalMs,
} from "./lib/hydrography";
import {
  VoyageSummaryRecord,
  SampleTriggerType,
  isVesselMooredStatus,
  loadSavedVoyages,
  saveVoyages,
  buildVoyageWaypoints,
  computeRouteLegs,
  buildSampleRecord,
  generateVoyageSummarySql,
  downloadVoyageSummarySql,
} from "./lib/voyageSql";
import {
  VesselPosition,
  VesselNavMetrics,
  MarineTrafficConfig,
  loadMarineTrafficConfig,
  saveMarineTrafficConfig,
  loadAisHistory,
  saveAisHistory,
  loadSavedVesselPosition,
  saveSavedVesselPosition,
  fetchVesselPosition,
  evaluateVesselRouteMetrics,
  DEFAULT_PPKQ_LIVE_POSITION,
  normalizeVesselByStatus,
  getEffectiveVesselSog,
  formatNauticalCoord,
  resetSavedVesselPosition,
} from "./lib/ais";

export default function App() {
  const [activeTab, setActiveTab] = useState<"planner" | "simulator" | "voyage_sql">(
    "planner",
  );
  const [simInputs, setSimInputs] = useState({
    speed: 0,
    heading: 137,
    trueCourse: 124,
    gm: 1.5,
    waveDirection: 45,
    wavePeriod: 8,
    waveHeight: 3,
  });
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [shipData, setShipData] = useState<ShipData>({
    name: "MERCOSUL ITAJAI",
    callsign: "PPKQ",
    flag: "BR",
    type: "TMC",
    dep_port: "BRSSZ",
    arr_port: "BRNVT",
    medical: "NURSE-ENFERMEIRO",
    mmsi: "710027240",
    disp: 50000,
    draft: 9.8,
    windArea: 1000,
    rpm: 92,
    rollingPeriod: 15,
    lpp: 200,
  });

  interface ProfileData {
    shipData: ShipData;
    times: typeof times;
    waypointsStr: string;
    simInputs: typeof simInputs;
  }

  const [savedProfiles, setSavedProfiles] = useState<
    Record<string, ProfileData | ShipData>
  >({});
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    const loaded = localStorage.getItem("sistram_profiles");
    if (loaded) {
      try {
        setSavedProfiles(JSON.parse(loaded));
      } catch (e) {
        console.error("Failed to load profiles");
      }
    }
  }, []);

  const saveProfile = () => {
    if (!profileName.trim())
      return alert("Insira um nome para a viagem/perfil");
    const newProfiles = {
      ...savedProfiles,
      [profileName.trim()]: { shipData, times, waypointsStr, simInputs },
    };
    setSavedProfiles(newProfiles);
    localStorage.setItem("sistram_profiles", JSON.stringify(newProfiles));
  };

  const loadProfile = (name: string) => {
    if (name && savedProfiles[name]) {
      const profile = savedProfiles[name];
      // Backward compatibility check
      if ("name" in profile) {
        setShipData(profile as ShipData);
      } else {
        const p = profile as ProfileData;
        setShipData(p.shipData);
        if (p.times) setTimes(p.times);
        if (p.waypointsStr) setWaypointsStr(p.waypointsStr);
        if (p.simInputs) setSimInputs(p.simInputs);
      }
      setProfileName(name);
    } else {
      setProfileName("");
    }
  };

  const deleteProfile = (name: string) => {
    if (!name) return;
    const newProfiles = { ...savedProfiles };
    delete newProfiles[name];
    setSavedProfiles(newProfiles);
    localStorage.setItem("sistram_profiles", JSON.stringify(newProfiles));
    if (profileName === name) setProfileName("");
  };

  const initialEtd = new Date();
  const initialEta = new Date(initialEtd.getTime() + 24 * 60 * 60 * 1000);
  const initialSend = new Date(initialEtd.getTime() + 20 * 60 * 1000);

  const formatLocal = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
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

  const [waypointsStr, setWaypointsStr] = useState(
    [
      "2357S 04619W",
      "2654S 04839W",
      "3300S 05146W",
      "3508S 05515W",
      "3444S 05742W",
    ].join("\n"),
  );

  const [output, setOutput] = useState<GeneratorOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [gpxSuccessMsg, setGpxSuccessMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [waypointWeather, setWaypointWeather] = useState<
    Record<number, WeatherData | null>
  >({});
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);

  // MarineTraffic AIS Tracking State for Vessel PPKQ
  const [mtConfig, setMtConfig] = useState<MarineTrafficConfig>(() =>
    loadMarineTrafficConfig(),
  );
  const [vessel, setVessel] = useState<VesselPosition>(
    () => loadSavedVesselPosition() ?? DEFAULT_PPKQ_LIVE_POSITION,
  );
  const vesselRef = useRef<VesselPosition>(vessel);
  useEffect(() => {
    vesselRef.current = vessel;
  }, [vessel]);

  const [vesselHistory, setVesselHistory] = useState<
    Array<{ lat: number; lon: number; timestamp: string; sog: number }>
  >(() => loadAisHistory());
  const [isRefreshingAis, setIsRefreshingAis] = useState(false);
  const [aisSyncMessage, setAisSyncMessage] = useState<string | null>(null);
  const [aisCountdownSec, setAisCountdownSec] = useState<number>(60);

  // Voyage Summary SQL & Adaptive 4h/1h Sampling State
  const [zoneOverride, setZoneOverride] = useState<WaterZone | "AUTO">("AUTO");
  const zoneInfo = useMemo(
    () => classifyWaterZone(vessel.lat, vessel.lon, zoneOverride),
    [vessel.lat, vessel.lon, zoneOverride],
  );
  const [voyages, setVoyages] = useState<VoyageSummaryRecord[]>(() => {
    const existing = loadSavedVoyages();
    if (existing.length > 0) return existing;
    const initVessel = loadSavedVesselPosition() ?? DEFAULT_PPKQ_LIVE_POSITION;
    const mooredNow = isVesselMooredStatus(initVessel.navStatus);
    return [
      {
        id: `voy_${Date.now()}`,
        vesselName: initVessel.name,
        callsign: initVessel.callsign,
        mmsi: initVessel.mmsi,
        imo: "9697002",
        depPort: initVessel.currentPort || "BRNVT",
        arrPort: initVessel.destination || "ARROS",
        startedAtUtc: new Date().toISOString(),
        endedAtUtc: null,
        status: mooredNow ? "MOORED_STANDBY" : "IN_PROGRESS",
        waypoints: [],
        legs: [],
        samples: [],
        hydrographicRefs: [],
      },
    ];
  });
  const [activeVoyageId, setActiveVoyageId] = useState<string>(() => {
    const existing = loadSavedVoyages();
    return existing[0]?.id || "";
  });
  const [selectedVoyageId, setSelectedVoyageId] = useState<string>(() => {
    const existing = loadSavedVoyages();
    return existing[0]?.id || "";
  });
  const activeVoyage = useMemo(() => {
    return voyages.find((v) => v.id === activeVoyageId) || voyages[0];
  }, [voyages, activeVoyageId]);

  const [latestHydrography, setLatestHydrography] = useState<HydrographicReport | null>(null);
  const [isSampling, setIsSampling] = useState(false);
  const [isFetchingHydrography, setIsFetchingHydrography] = useState(false);
  const [hydrographyError, setHydrographyError] = useState<string | null>(null);
  const [nextSampleCountdownSec, setNextSampleCountdownSec] = useState<number>(
    () => getSamplingIntervalMs(classifyWaterZone(vessel.lat, vessel.lon).zone) / 1000,
  );
  const prevMooredRef = useRef<boolean>(isVesselMooredStatus(vessel.navStatus));
  const lastHydroFetchKeyRef = useRef<string>("");

  const zones = Array.from({ length: 27 }, (_, i) => i - 12);

  const handleImportRT3 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let newWaypointsStr = "";

        const formatCoord = (val: number, isLat: boolean) => {
          const dir = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
          const absVal = Math.abs(val);
          const deg = Math.floor(absVal);
          const min = ((absVal - deg) * 60).toFixed(2);
          const padDeg = deg.toString().padStart(isLat ? 2 : 3, "0");
          const padMin = min.padStart(5, "0"); // 00.00
          return `${padDeg}°${padMin}' ${dir}`;
        };

        // Attempt 1: Regex Parsing for XML-like tags (robust against malformed XML and case variations)
        const tagRegex = /<(?:waypoint|position)[^>]*>/gi;
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
          const tag = match[0];
          const latMatch = /\b(?:lat|Lat|LAT)=["']?([^"'\s>]+)["']?/.exec(tag);
          const lonMatch = /\b(?:lon|Lon|LON)=["']?([^"'\s>]+)["']?/.exec(tag);

          if (latMatch && lonMatch) {
            const latNum = parseFloat(latMatch[1].replace(",", "."));
            const lonNum = parseFloat(lonMatch[1].replace(",", "."));
            if (!isNaN(latNum) && !isNaN(lonNum)) {
              const latDeg = latNum / 60.0;
              const lonDeg = lonNum / 60.0;
              newWaypointsStr += `${formatCoord(latDeg, true)}\t${formatCoord(lonDeg, false)}\n`;
            }
          }
        }

        // Attempt 2: Plain Text RT3 Parsing
        if (!newWaypointsStr) {
          const lines = text.split(/\r?\n/);

          let waypointsStarted = false;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.toUpperCase() === "WAYPOINTS") {
              waypointsStarted = true;
              continue;
            }

            // Extract tokens to find consecutive decimals
            const tokens = line.split(/[\s\t]+/);
            const numbers = [];
            for (const t of tokens) {
              const n = parseFloat(t.replace(",", "."));
              if (!isNaN(n)) numbers.push({ val: n, str: t });
            }

            if (numbers.length >= 2) {
              for (let j = 0; j < numbers.length - 1; j++) {
                const latRt3 = numbers[j].val;
                const lonRt3 = numbers[j + 1].val;

                // Allow values up to 90 degrees * 60 and 180 degrees * 60
                if (Math.abs(latRt3) <= 5400 && Math.abs(lonRt3) <= 10800) {
                  const token1 = numbers[j].str;
                  const token2 = numbers[j + 1].str;

                  // RT3 coordinates typically have decimals.
                  if (
                    (token1.includes(".") || token1.includes(",")) &&
                    (token2.includes(".") || token2.includes(","))
                  ) {
                    const latDeg = latRt3 / 60.0;
                    const lonDeg = lonRt3 / 60.0;
                    newWaypointsStr += `${formatCoord(latDeg, true)}\t${formatCoord(lonDeg, false)}\n`;
                    break;
                  }
                }
              }
            }
          }
        }

        if (newWaypointsStr) {
          setWaypointsStr((prev) =>
            prev.trim()
              ? prev.trim() + "\n" + newWaypointsStr.trim()
              : newWaypointsStr.trim(),
          );
        } else {
          alert("Nenhum waypoint válido encontrado no arquivo RT3.");
        }
      } catch (err) {
        console.error("Error reading RT3 file:", err);
        alert("Erro ao ler o arquivo RT3. Verifique o formato.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExportGPX = () => {
    setErrorMsg("");
    const result = downloadGPXFile(waypointsStr, shipData, output, times);
    if (!result.success) {
      setErrorMsg(result.error || "Erro ao exportar arquivo GPX. Verifique a lista de waypoints.");
    } else {
      setGpxSuccessMsg(`Exportado ${result.count} waypoints para arquivo .gpx com sucesso!`);
      setTimeout(() => setGpxSuccessMsg(""), 4000);
    }
  };

  const handleGenerate = () => {
    setErrorMsg("");
    const lines = waypointsStr.trim().split("\n");
    const waypointsRaw = lines
      .map((line) => {
        let parts = line.split("\t");
        if (parts.length >= 2) {
          return { lat: parts[0].trim(), lon: parts[1].trim() };
        }

        parts = line.trim().split(/\s+/);
        if (parts.length === 4) {
          return { lat: parts[0] + parts[1], lon: parts[2] + parts[3] };
        }
        return { lat: parts[0] || "", lon: parts[1] || "" };
      })
      .filter((wp) => wp.lat && wp.lon);

    if (waypointsRaw.length < 2) {
      setErrorMsg("Please provide at least a departure and arrival waypoint.");
      return;
    }

    const res = generateSistramPlan(shipData, waypointsRaw, times);
    if (!res) {
      setErrorMsg(
        "Error generating plan. Please check your inputs and coordinate formats (e.g. 0310S 05959W).",
      );
    } else {
      setOutput(res);
      setWaypointWeather({});
      setIsFetchingWeather(true);

      Promise.all(
        res.waypoints.map((wp, idx) =>
          getWaypointWeather(wp.latDecl, wp.lonDecl, wp.timeUtc).then(
            (data) => {
              setWaypointWeather((prev) => ({ ...prev, [idx]: data }));
            },
          ),
        ),
      ).finally(() => {
        setIsFetchingWeather(false);
      });
    }
  };

  // Auto-generate voyage on mount to initialize chart and waypoints immediately
  useEffect(() => {
    handleGenerate();
  }, []);

  // Initial AIS telemetry sync on mount
  useEffect(() => {
    let isMounted = true;
    const initPosition = async () => {
      setIsRefreshingAis(true);
      try {
        const waypoints = output?.waypoints || [];
        const latestState = vesselRef.current ?? loadSavedVesselPosition() ?? DEFAULT_PPKQ_LIVE_POSITION;
        const newPos = await fetchVesselPosition(mtConfig, latestState, waypoints, true);
        if (isMounted) {
          vesselRef.current = newPos;
          setVessel(newPos);
          saveSavedVesselPosition(newPos);
          const syncedTrack = loadAisHistory();
          if (syncedTrack.length > 0) {
            setVesselHistory(syncedTrack);
          }
        }
      } catch (e) {
        console.error("Failed initial AIS vessel fetch:", e);
      } finally {
        if (isMounted) setIsRefreshingAis(false);
      }
    };
    initPosition();
    return () => {
      isMounted = false;
    };
  }, []);

  // Continuous Sync mode: automatically refreshes AIS data from MarineTraffic every 60 seconds when enabled
  useEffect(() => {
    if (!mtConfig.continuousSync) {
      setAisCountdownSec(60);
      return;
    }

    let isMounted = true;
    setAisCountdownSec(60);

    const performAutoSync = async () => {
      setIsRefreshingAis(true);
      try {
        const waypoints = output?.waypoints || [];
        const latestState = vesselRef.current ?? loadSavedVesselPosition() ?? DEFAULT_PPKQ_LIVE_POSITION;
        const newPos = await fetchVesselPosition(mtConfig, latestState, waypoints, true);
        if (isMounted) {
          vesselRef.current = newPos;
          setVessel(newPos);
          saveSavedVesselPosition(newPos);
          const syncedTrack = loadAisHistory();
          if (syncedTrack.length > 1) {
            setVesselHistory(syncedTrack);
          } else {
            setVesselHistory((prev) => {
              const updated = [
                ...prev,
                {
                  lat: newPos.lat,
                  lon: newPos.lon,
                  timestamp: newPos.timestamp,
                  sog: newPos.sog,
                },
              ];
              saveAisHistory(updated);
              return updated;
            });
          }
          setAisSyncMessage(`Auto-Synced (60s) • ${new Date(newPos.timestamp).toLocaleTimeString()}`);
          setTimeout(() => {
            if (isMounted) setAisSyncMessage(null);
          }, 3000);
        }
      } catch (e) {
        console.error("Failed to auto-sync AIS vessel position:", e);
      } finally {
        if (isMounted) setIsRefreshingAis(false);
      }
    };

    const tickTimer = setInterval(() => {
      setAisCountdownSec((prev) => {
        if (prev <= 1) {
          performAutoSync();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(tickTimer);
    };
  }, [
    mtConfig.continuousSync,
    mtConfig.simulationSpeedMultiplier,
    mtConfig.apiKey,
    output?.waypoints,
  ]);

  const handleUpdateMtConfig = (newCfg: MarineTrafficConfig) => {
    setMtConfig(newCfg);
    saveMarineTrafficConfig(newCfg);
  };

  const handleToggleContinuousSync = () => {
    const nextContinuous = !mtConfig.continuousSync;
    const nextCfg: MarineTrafficConfig = {
      ...mtConfig,
      continuousSync: nextContinuous,
      refreshIntervalSec: 60,
    };
    setMtConfig(nextCfg);
    saveMarineTrafficConfig(nextCfg);
    if (nextContinuous) {
      setAisCountdownSec(60);
      handleRefreshAis();
    } else {
      setAisSyncMessage("Continuous Sync OFF (Manual Trigger)");
      setTimeout(() => setAisSyncMessage(null), 3000);
    }
  };

  const handleRefreshAis = async () => {
    setIsRefreshingAis(true);
    if (mtConfig.continuousSync) {
      setAisCountdownSec(60);
    }
    try {
      const waypoints = output?.waypoints || [];
      const latestState = vesselRef.current ?? loadSavedVesselPosition() ?? DEFAULT_PPKQ_LIVE_POSITION;
      const newPos = await fetchVesselPosition(mtConfig, latestState, waypoints, true);
      vesselRef.current = newPos;
      setVessel(newPos);
      saveSavedVesselPosition(newPos);
      const syncedTrack = loadAisHistory();
      if (syncedTrack.length > 1) {
        setVesselHistory(syncedTrack);
      } else {
        setVesselHistory((prev) => {
          const updated = [
            ...prev,
            {
              lat: newPos.lat,
              lon: newPos.lon,
              timestamp: newPos.timestamp,
              sog: newPos.sog,
            },
          ];
          saveAisHistory(updated);
          return updated;
        });
      }
      setAisSyncMessage(`Synced • ${new Date(newPos.timestamp).toLocaleTimeString()}`);
      setTimeout(() => setAisSyncMessage(null), 3000);
    } finally {
      setTimeout(() => setIsRefreshingAis(false), 250);
    }
  };

  const handleResetToBaselineAis = () => {
    handleRefreshAis();
  };

  const handleManualOverrideVessel = (overrides: Partial<VesselPosition>) => {
    const base: VesselPosition = vesselRef.current ?? vessel ?? DEFAULT_PPKQ_LIVE_POSITION;
    const updated: VesselPosition = normalizeVesselByStatus({
      ...base,
      ...overrides,
      timestamp: new Date().toISOString(),
    });
    vesselRef.current = updated;
    setVessel(updated);
    saveSavedVesselPosition(updated);
    setVesselHistory((prev) => {
      const nextHist = [
        ...prev,
        {
          lat: updated.lat,
          lon: updated.lon,
          timestamp: updated.timestamp,
          sog: updated.sog,
        },
      ];
      saveAisHistory(nextHist);
      return nextHist;
    });
    setAisSyncMessage(`Updated • ${new Date(updated.timestamp).toLocaleTimeString()}`);
    setTimeout(() => setAisSyncMessage(null), 3000);
  };

  const vesselMetrics: VesselNavMetrics = useMemo(() => {
    if (!vessel) {
      return {
        nearestLegIndex: 0,
        distToNextWaypoint: null,
        bearingToNextWaypoint: null,
        nextWaypointName: null,
        alongTrackProgressNm: 0,
      };
    }
    const waypoints = output?.waypoints || [];
    return evaluateVesselRouteMetrics(vessel, waypoints);
  }, [vessel, output?.waypoints]);

  // Keep active voyage waypoints & calculated leg SOGs synchronized with SISTRAM route and weather
  useEffect(() => {
    if (!activeVoyage) return;
    const waypoints = buildVoyageWaypoints(output);
    const updatedLegs = computeRouteLegs(
      output,
      shipData,
      waypointWeather,
      activeVoyage.samples,
    );
    setVoyages((prev) => {
      const next = prev.map((v) =>
        v.id === activeVoyage.id
          ? {
              ...v,
              vesselName: shipData.name || v.vesselName,
              callsign: shipData.callsign || v.callsign,
              mmsi: shipData.mmsi || v.mmsi,
              depPort: shipData.dep_port || v.depPort,
              arrPort: shipData.arr_port || v.arrPort,
              waypoints,
              legs: updatedLegs,
            }
          : v,
      );
      saveVoyages(next);
      return next;
    });
  }, [
    output,
    shipData,
    waypointWeather,
    activeVoyage?.id,
  ]);

  const handleRefreshHydrography = async (forceRefresh = true): Promise<HydrographicReport | null> => {
    const currVessel = vesselRef.current || vessel;
    const currZone = classifyWaterZone(currVessel.lat, currVessel.lon, zoneOverride);
    setIsFetchingHydrography(true);
    setHydrographyError(null);

    try {
      const result = await fetchPortAuthorityHydrography({
        lat: currVessel.lat,
        lon: currVessel.lon,
        waterZone: currZone.zone,
        waterwayName: currZone.waterwayName,
        portCode: currVessel.currentPort || shipData.dep_port,
        destination: currVessel.destination || shipData.arr_port,
        vesselDraught: currVessel.draught || shipData.draft,
        forceRefresh,
      });

      if (result.ok && result.hydrography) {
        setLatestHydrography(result.hydrography);
        if (result.aiWarning) {
          setHydrographyError(result.aiWarning);
        }
        setVoyages((prev) => {
          const next = prev.map((v) =>
            v.id === activeVoyage.id
              ? {
                  ...v,
                  hydrographicRefs: [result.hydrography!, ...v.hydrographicRefs.filter((r) => r.id !== result.hydrography!.id)].slice(0, 30),
                }
              : v,
          );
          saveVoyages(next);
          return next;
        });
        return result.hydrography;
      } else {
        setHydrographyError(result.error || "Unable to fetch port authority hydrography.");
        return null;
      }
    } catch (err: any) {
      setHydrographyError(err?.message || "Hydrography service error.");
      return null;
    } finally {
      setIsFetchingHydrography(false);
    }
  };

  const captureVoyageSample = async (
    triggerType: SampleTriggerType,
    overrideVoyageId?: string,
  ) => {
    const currVessel = vesselRef.current || vessel;
    const currZone = classifyWaterZone(currVessel.lat, currVessel.lon, zoneOverride);
    setIsSampling(true);

    try {
      const [liveWeather, hydroReport] = await Promise.all([
        getWaypointWeather(currVessel.lat, currVessel.lon, new Date()).catch(() => null),
        currZone.zone === "RIVER" || currZone.zone === "ESTUARY"
          ? (async () => {
              const tenMinMs = 10 * 60 * 1000;
              if (
                latestHydrography &&
                latestHydrography.waterZone === currZone.zone &&
                triggerType !== "USER_PUSH" &&
                Date.now() - new Date(latestHydrography.retrievedAtUtc).getTime() < tenMinMs
              ) {
                return latestHydrography;
              }
              return handleRefreshHydrography(triggerType === "USER_PUSH");
            })()
          : Promise.resolve(latestHydrography),
      ]);

      const targetId = overrideVoyageId || activeVoyage.id;
      const waypoints = buildVoyageWaypoints(output);

      setVoyages((prev) => {
        const next = prev.map((v) => {
          if (v.id !== targetId) return v;
          const legs = computeRouteLegs(output, shipData, waypointWeather, v.samples);
          const newSample = buildSampleRecord({
            voyageId: v.id,
            vessel: currVessel,
            triggerType,
            zoneOverride,
            waypoints,
            legs,
            weather: liveWeather,
            hydrography: hydroReport,
          });
          const updatedSamples = [newSample, ...v.samples];
          const updatedLegs = computeRouteLegs(output, shipData, waypointWeather, updatedSamples);
          const updatedRefs =
            hydroReport && !v.hydrographicRefs.some((r) => r.id === hydroReport.id)
              ? [hydroReport, ...v.hydrographicRefs].slice(0, 30)
              : v.hydrographicRefs;

          return {
            ...v,
            waypoints,
            legs: updatedLegs,
            samples: updatedSamples,
            hydrographicRefs: updatedRefs,
          };
        });
        saveVoyages(next);
        return next;
      });

      setNextSampleCountdownSec(getSamplingIntervalMs(currZone.zone) / 1000);
      setAisSyncMessage(`Sample Saved (${triggerType}) • ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setAisSyncMessage(null), 3500);
    } finally {
      setIsSampling(false);
    }
  };

  // Moored-to-Moored Lifecycle Watcher driven directly by AIS HUD navStatus
  useEffect(() => {
    const isNowMoored = isVesselMooredStatus(vessel.navStatus);
    const wasMoored = prevMooredRef.current;

    if (wasMoored && !isNowMoored) {
      // Vessel unmoored -> start a fresh Moored-to-Moored voyage and capture departure sample
      const newVoyageId = `voy_${Date.now()}`;
      const waypoints = buildVoyageWaypoints(output);
      const legs = computeRouteLegs(output, shipData, waypointWeather, []);
      const newVoyage: VoyageSummaryRecord = {
        id: newVoyageId,
        vesselName: vessel.name,
        callsign: vessel.callsign,
        mmsi: vessel.mmsi,
        imo: "9697002",
        depPort: vessel.currentPort || shipData.dep_port,
        arrPort: vessel.destination || shipData.arr_port,
        startedAtUtc: new Date().toISOString(),
        endedAtUtc: null,
        status: "IN_PROGRESS",
        waypoints,
        legs,
        samples: [],
        hydrographicRefs: [],
      };
      setVoyages((prev) => {
        const next = [newVoyage, ...prev].slice(0, 10);
        saveVoyages(next);
        return next;
      });
      setActiveVoyageId(newVoyageId);
      setSelectedVoyageId(newVoyageId);
      captureVoyageSample("MOORED_DEP", newVoyageId);
    } else if (!wasMoored && isNowMoored && activeVoyage.status === "IN_PROGRESS") {
      // Vessel arrived & moored -> record arrival moored sample and close voyage
      captureVoyageSample("MOORED_ARR", activeVoyage.id).then(() => {
        setVoyages((prev) => {
          const next = prev.map((v) =>
            v.id === activeVoyage.id
              ? {
                  ...v,
                  endedAtUtc: new Date().toISOString(),
                  status: "COMPLETED" as const,
                }
              : v,
          );
          saveVoyages(next);
          return next;
        });
      });
    }

    prevMooredRef.current = isNowMoored;
  }, [vessel.navStatus]);

  // Reset countdown cadence when maritime zone switches between Sea (4h) and Estuary/River (1h)
  useEffect(() => {
    const targetSec = getSamplingIntervalMs(zoneInfo.zone) / 1000;
    setNextSampleCountdownSec((prev) => Math.min(prev, targetSec));

    if (zoneInfo.zone === "RIVER" || zoneInfo.zone === "ESTUARY") {
      const zoneKey = `${zoneInfo.zone}_${zoneInfo.waterwayName}`;
      if (lastHydroFetchKeyRef.current !== zoneKey) {
        lastHydroFetchKeyRef.current = zoneKey;
        handleRefreshHydrography(false);
      }
    }
  }, [zoneInfo.zone, zoneInfo.waterwayName]);

  // Adaptive Sampling Timer: 4h at sea (underway or anchored), 1h in river or estuary
  useEffect(() => {
    const timer = setInterval(() => {
      setNextSampleCountdownSec((prev) => {
        if (prev <= 1) {
          const currZone = classifyWaterZone(
            vesselRef.current.lat,
            vesselRef.current.lon,
            zoneOverride,
          );
          const trigger: SampleTriggerType =
            currZone.zone === "RIVER"
              ? "AUTO_1H_RIVER"
              : currZone.zone === "ESTUARY"
                ? "AUTO_1H_ESTUARY"
                : "AUTO_4H_SEA";
          captureVoyageSample(trigger);
          return getSamplingIntervalMs(currZone.zone) / 1000;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [zoneOverride, activeVoyage?.id]);

  const handleStartNewVoyage = () => {
    const currVessel = vesselRef.current || vessel;
    const mooredNow = isVesselMooredStatus(currVessel.navStatus);
    const newId = `voy_${Date.now()}`;
    const waypoints = buildVoyageWaypoints(output);
    const legs = computeRouteLegs(output, shipData, waypointWeather, []);
    const fresh: VoyageSummaryRecord = {
      id: newId,
      vesselName: currVessel.name,
      callsign: currVessel.callsign,
      mmsi: currVessel.mmsi,
      imo: "9697002",
      depPort: currVessel.currentPort || shipData.dep_port,
      arrPort: currVessel.destination || shipData.arr_port,
      startedAtUtc: new Date().toISOString(),
      endedAtUtc: null,
      status: mooredNow ? "MOORED_STANDBY" : "IN_PROGRESS",
      waypoints,
      legs,
      samples: [],
      hydrographicRefs: latestHydrography ? [latestHydrography] : [],
    };
    setVoyages((prev) => {
      const next = [fresh, ...prev].slice(0, 10);
      saveVoyages(next);
      return next;
    });
    setActiveVoyageId(newId);
    setSelectedVoyageId(newId);
  };

  const handleDeleteVoyageSample = (voyageId: string, sampleId: string) => {
    setVoyages((prev) => {
      const next = prev.map((v) => {
        if (v.id !== voyageId) return v;
        const filtered = v.samples.filter((s) => s.id !== sampleId);
        return {
          ...v,
          samples: filtered,
          legs: computeRouteLegs(output, shipData, waypointWeather, filtered),
        };
      });
      saveVoyages(next);
      return next;
    });
  };

  const handleQuickDownloadSql = () => {
    const target = voyages.find((v) => v.id === selectedVoyageId) || activeVoyage;
    if (!target) return;
    const sqlText = generateVoyageSummarySql(target);
    const filename = downloadVoyageSummarySql(sqlText, target.callsign, target.id);
    setAisSyncMessage(`Exported ${filename}`);
    setTimeout(() => setAisSyncMessage(null), 3500);
  };

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShipChange = (e: ChangeEvent<HTMLInputElement>) => {
    const fieldName = e.target.name;
    const val =
      e.target.type === "number"
        ? Number(e.target.value)
        : e.target.value.toUpperCase();
    setShipData({ ...shipData, [fieldName]: val });

    // Keep live AIS vessel metadata synchronized when user edits Ship Static & Variable Data
    if (fieldName === "arr_port" && typeof val === "string" && val.trim()) {
      handleManualOverrideVessel({ destination: val.trim() });
    } else if (fieldName === "dep_port" && typeof val === "string" && val.trim()) {
      const isMooredNow = (vesselRef.current?.navStatus || "").toLowerCase().includes("moored");
      handleManualOverrideVessel({
        currentPort: val.trim(),
        ...(isMooredNow ? { navStatus: `Moored at ${val.trim()}` } : {}),
      });
    } else if (fieldName === "draft" && typeof val === "number" && val > 0) {
      handleManualOverrideVessel({ draught: val });
    } else if (fieldName === "callsign" && typeof val === "string" && val.trim()) {
      handleManualOverrideVessel({ callsign: val.trim() });
    } else if (fieldName === "mmsi" && typeof val === "string" && val.trim()) {
      handleManualOverrideVessel({ mmsi: val.trim() });
    } else if (fieldName === "name" && typeof val === "string" && val.trim()) {
      handleManualOverrideVessel({ name: val.trim() });
    }
  };

  const handleTimeChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const val =
      e.target.type === "number" || e.target.name.includes("Zone")
        ? Number(e.target.value)
        : e.target.value;
    setTimes({ ...times, [e.target.name]: val });
  };

  const handleSimChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSimInputs({ ...simInputs, [e.target.name]: Number(e.target.value) });
  };

  const simResult = useMemo(() => {
    return evaluateCriticalSituations(
      shipData,
      simInputs.speed,
      simInputs.heading,
      simInputs.waveDirection,
      simInputs.wavePeriod,
      simInputs.waveHeight,
    );
  }, [shipData, simInputs]);

  const analytics = useMemo(() => {
    if (!output || !waypointWeather) return null;
    if (Object.keys(waypointWeather).length !== output.waypoints.length)
      return null;
    if (output.waypoints.length < 2) return null;

    let sum_d_n_over_sog = 0;
    let totalDist = 0;
    let ok = true;

    // We add evaluateCriticalSituations
    const wpDetails: any[] = [{ maxSog: null, critical: null }];

    for (let i = 1; i < output.waypoints.length; i++) {
      const prev = output.waypoints[i - 1];
      const curr = output.waypoints[i];
      const w = waypointWeather[i];
      if (!w || curr.bearingFromPrev === undefined || w.windSpeed === null) {
        ok = false;
        break;
      }

      const d_n = haversine(
        prev.latDecl,
        prev.lonDecl,
        curr.latDecl,
        curr.lonDecl,
      );
      const maxSog = calculateMaxSOG(
        shipData,
        w.windSpeed,
        w.windDirection,
        w.waveHeight,
        w.waveDirection,
        w.wavePeriod,
        w.currentVelocity,
        w.currentDirection,
        curr.bearingFromPrev,
      );

      if (maxSog <= 0) {
        ok = false;
        break;
      }

      // Evaluate critical conditions
      const critical =
        w.waveDirection !== null
          ? evaluateCriticalSituations(
              shipData,
              maxSog,
              curr.bearingFromPrev,
              w.waveDirection || 0,
              w.wavePeriod || 8.1,
              w.waveHeight || 0,
            )
          : null;
      wpDetails.push({ maxSog, critical });

      totalDist += d_n;
      sum_d_n_over_sog += d_n / maxSog;
    }

    if (!ok || sum_d_n_over_sog === 0) return null;

    const sogAvgMax = totalDist / sum_d_n_over_sog;
    const weightedTotalEnrouteTime = sum_d_n_over_sog;

    const etdDate = new Date(times.etd);
    const etdUtc = new Date(etdDate.getTime() + times.etdZone * 3600 * 1000);
    const etaUtcEnv = new Date(
      etdUtc.getTime() + weightedTotalEnrouteTime * 3600 * 1000,
    );

    const lastWp = output.waypoints[output.waypoints.length - 1];
    const envEtaZone = Math.round(lastWp.lonDecl / 15);
    const etaLocalEnv = new Date(
      etaUtcEnv.getTime() + envEtaZone * 3600 * 1000,
    );

    return {
      sogAvgMax,
      weightedTotalEnrouteTime,
      etaUtcEnv,
      etaLocalEnv,
      totalDist,
      wpDetails,
    };
  }, [output, waypointWeather, shipData, times.etd, times.etdZone]);

  return (
    <div
      className="min-h-screen bg-[#05070a] text-slate-300 font-sans p-4 lg:p-6 flex flex-col gap-4 overflow-auto"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% -20%, #1e293b 0%, #05070a 60%)",
      }}
    >
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-cyan-900/50 pb-4 shrink-0">
        <div className="flex items-center gap-4">
          <EccodaxLogo className="w-12 h-12" />
          <div className="flex flex-col">
            <h1 className="text-xs font-mono tracking-widest text-cyan-500 uppercase flex items-center gap-2">
              Coordinates Crossover for Messaging and Deployments
            </h1>
            <h2 className="text-2xl font-light text-white tracking-tight mt-1 flex items-center gap-3">
              SISTRAM{" "}
              <span className="text-cyan-500 font-bold italic">Type 1</span>
              <button
                onClick={() => setIsManualOpen(true)}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-300 transition-colors flex items-center gap-1 font-bold tracking-wider ml-2"
              >
                <BookOpen className="w-3 h-3 text-cyan-400" /> MANUAL
              </button>
            </h2>
          </div>
        </div>
        <div className="text-right mt-2 sm:mt-0 flex flex-col items-end">
          <div className="text-[10px] font-mono text-slate-500 uppercase">
            System Status
          </div>
          <div className="text-emerald-500 flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
            GEODESIC ENGINE ACTIVE
          </div>
          {vessel && (
            <div className="flex items-center gap-2 mt-1 font-mono text-[11px] bg-slate-900/90 px-2.5 py-1 rounded border border-cyan-800/60 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span className="text-slate-300">PPKQ:</span>
              <span className="bg-sky-950 text-sky-300 border border-sky-500/50 px-1.5 py-0.2 rounded text-[10px] font-bold uppercase">
                {vessel.navStatus}
              </span>
              <span className="text-slate-400 text-[10px]">→ <strong className="text-cyan-300">{vessel.destination}</strong></span>
              <span className="text-slate-500">·</span>
              <span className="text-cyan-400 font-bold">{getEffectiveVesselSog(vessel).toFixed(1)} kn</span>
              <span className="text-slate-500">·</span>
              <span className="text-white">{vessel.heading.toFixed(0)}°T</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex border-b border-slate-800 mb-4 gap-6">
        <button
          onClick={() => setActiveTab("planner")}
          className={`pb-2 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === "planner" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-slate-500 hover:text-slate-300"}`}
        >
          Voyage Planner
        </button>
        <button
          onClick={() => setActiveTab("simulator")}
          className={`pb-2 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === "simulator" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-slate-500 hover:text-slate-300"}`}
        >
          Motion Simulator
        </button>
        <button
          onClick={() => setActiveTab("voyage_sql")}
          className={`pb-2 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 ${activeTab === "voyage_sql" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-slate-500 hover:text-slate-300"}`}
        >
          <Database className="w-3.5 h-3.5" />
          Voyage SQL ({activeVoyage?.samples.length ?? 0})
        </button>
      </div>

      <main className="max-w-[1440px] mx-auto w-full flex-1">
        {activeTab === "planner" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
            {/* Left Column: Form Inputs */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
              {/* Section 1: Ship Data */}
              <section className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 border-b border-slate-800 pb-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-cyan-500" />
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Ship Static & Variable Data
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={savedProfiles[profileName] ? profileName : ""}
                      onChange={(e) => loadProfile(e.target.value)}
                      className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-cyan-600 transition-colors w-32"
                    >
                      <option value="">-- Saved Profiles --</option>
                      {Object.keys(savedProfiles).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Profile Name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-cyan-600 transition-colors w-24"
                    />
                    <button
                      onClick={saveProfile}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1.5 rounded text-cyan-400 transition-colors flex items-center gap-1 font-bold"
                      title="Save profile"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                    {savedProfiles[profileName] && (
                      <button
                        onClick={() => deleteProfile(profileName)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1.5 rounded text-red-400 transition-colors flex items-center gap-1 font-bold"
                        title="Delete profile"
                      >
                        <Trash className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-1">
                  {[
                    { id: "name", label: "Ship Name", type: "text" },
                    { id: "callsign", label: "Call Sign", type: "text" },
                    { id: "flag", label: "Flag", type: "text" },
                    { id: "type", label: "Type", type: "text" },
                    { id: "mmsi", label: "MMSI", type: "text" },
                    { id: "medical", label: "Medical Resources", type: "text" },
                    {
                      id: "dep_port",
                      label: "Departure Port (G)",
                      type: "text",
                    },
                    { id: "arr_port", label: "Arrival Port (I)", type: "text" },
                    { id: "disp", label: "Disp (t)", type: "number" },
                    { id: "draft", label: "Draft (m)", type: "number" },
                    { id: "windArea", label: "WindArea (m²)", type: "number" },
                    { id: "rpm", label: "RPM", type: "number" },
                    {
                      id: "rollingPeriod",
                      label: "RollingPeriod (Tr) (s)",
                      type: "number",
                    },
                    { id: "lpp", label: "LPP (m)", type: "number" },
                  ].map((field) => (
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
                  <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Routing Logistics
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* ETD */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest border-b border-slate-800 pb-1">
                      B - Departure (ETD)
                    </h3>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        DEP_LT
                      </label>
                      <DatePicker
                        selected={new Date(times.etd)}
                        onChange={(date: Date | null) =>
                          date && setTimes({ ...times, etd: formatLocal(date) })
                        }
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        dateFormat="yyyy-MM-dd HH:mm"
                        className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Departure_UTC_Offset
                      </label>
                      <select
                        name="etdZone"
                        value={times.etdZone}
                        onChange={handleTimeChange}
                        className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                      >
                        {zones.map((z) => (
                          <option key={z} value={z}>
                            {z >= 0 ? `+${z}` : z}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ETA */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest border-b border-slate-800 pb-1">
                      I - Arrival (ETA)
                    </h3>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        ETA_LT
                      </label>
                      <DatePicker
                        selected={new Date(times.eta)}
                        onChange={(date: Date | null) =>
                          date && setTimes({ ...times, eta: formatLocal(date) })
                        }
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        dateFormat="yyyy-MM-dd HH:mm"
                        className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Arrival_UTC_Offset
                      </label>
                      <select
                        name="etaZone"
                        value={times.etaZone}
                        onChange={handleTimeChange}
                        className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                      >
                        {zones.map((z) => (
                          <option key={z} value={z}>
                            {z >= 0 ? `+${z}` : z}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Send Time */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest border-b border-slate-800 pb-1">
                      Transmission Time
                    </h3>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        TT_LT
                      </label>
                      <DatePicker
                        selected={new Date(times.sendTime)}
                        onChange={(date: Date | null) =>
                          date &&
                          setTimes({ ...times, sendTime: formatLocal(date) })
                        }
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        dateFormat="yyyy-MM-dd HH:mm"
                        className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Transmission_UTC_Offset
                      </label>
                      <select
                        name="sendZone"
                        value={times.sendZone}
                        onChange={handleTimeChange}
                        className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                      >
                        {zones.map((z) => (
                          <option key={z} value={z}>
                            {z >= 0 ? `+${z}` : z}
                          </option>
                        ))}
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
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Waypoint Sequence Paste
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      className="text-[10px] font-mono uppercase opacity-70 hover:opacity-100 cursor-pointer flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-cyan-400 transition-colors"
                      title="Import from RT3 file"
                    >
                      <Upload className="w-3 h-3" />
                      Import RT3
                      <input
                        type="file"
                        accept=".rt3"
                        onChange={handleImportRT3}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={handleExportGPX}
                      className="text-[10px] font-mono uppercase opacity-70 hover:opacity-100 cursor-pointer flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-emerald-400 transition-colors"
                      title="Export waypoints as .gpx file (WGS84)"
                    >
                      <Download className="w-3 h-3" />
                      Export GPX
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <textarea
                    rows={4}
                    value={waypointsStr}
                    onChange={(e) =>
                      setWaypointsStr(e.target.value.toUpperCase())
                    }
                    className="w-full min-h-[150px] bg-black/40 border border-slate-700 rounded p-3 text-xs font-mono text-cyan-100 focus:border-cyan-600 outline-none resize-y placeholder:opacity-50"
                    placeholder="Paste coordinates here.&#10;&#10;Supported formats:&#10;23°55.61' S    046°19.12' W&#10;0310S           05959W"
                  />
                </div>

                <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {errorMsg ? (
                    <div className="flex-1 text-red-500 font-mono text-xs">
                      {errorMsg}
                    </div>
                  ) : gpxSuccessMsg ? (
                    <div className="flex-1 text-emerald-400 font-mono text-xs flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {gpxSuccessMsg}
                    </div>
                  ) : (
                    <div className="flex-1 text-slate-500 font-mono text-[10px]">
                      FORMAT: Accepts degrees/minutes or raw SISTRAM. First is
                      (G), last is (I).
                    </div>
                  )}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={handleExportGPX}
                      className="py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-slate-200 hover:text-white font-bold rounded transition-colors uppercase tracking-wider text-xs flex items-center justify-center gap-2"
                      title="Exportar waypoints no formato GPX (WGS84)"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      Export .GPX
                    </button>
                    <button
                      onClick={handleGenerate}
                      className="py-3 px-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors uppercase tracking-widest text-xs shadow-[0_4px_20px_rgba(8,145,178,0.3)] flex items-center justify-center gap-2"
                    >
                      <Calculator className="w-4 h-4" />
                      Generate Type 1
                    </button>
                  </div>
                </div>
              </section>

              {/* Map Component */}
              {((output && output.waypoints.length > 0) || vessel) && (
                <section className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-cyan-500" />
                      <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        OpenSeaMap Geospatial Navigation Chart &amp; AIS Monitor
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {vessel && (
                        <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50 flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5 text-sky-400 animate-pulse" />
                          AIS: {vessel.callsign} • {vessel.navStatus.toUpperCase()} ({getEffectiveVesselSog(vessel).toFixed(1)}kn)
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-emerald-400/80 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                        Open Data (WGS84)
                      </span>
                    </div>
                  </div>
                  <RouteMap
                    output={output}
                    waypointWeather={waypointWeather}
                    analytics={analytics}
                    vessel={vessel || undefined}
                    vesselMetrics={vesselMetrics}
                    vesselHistory={vesselHistory}
                    mtConfig={mtConfig}
                    onUpdateMtConfig={handleUpdateMtConfig}
                    onRefreshAis={handleRefreshAis}
                    isRefreshingAis={isRefreshingAis}
                    aisCountdownSec={aisCountdownSec}
                    onManualOverrideVessel={handleManualOverrideVessel}
                  />
                </section>
              )}
            </div>

            {/* Right Column: Output / Specs */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
              
              {/* Vessel PPKQ AIS Real-Time Telemetry Card */}
              {vessel && (
                <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3 shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                      <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                      AIS Monitoring • {vessel.callsign}
                    </h3>
                    <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      MMSI {vessel.mmsi}
                    </span>
                  </div>

                  {/* Continuous Sync (60s Auto-Refresh) Toggle Switch Bar */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-md px-3 py-2 flex items-center justify-between gap-2 font-mono">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">
                          Continuous Sync
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                            mtConfig.continuousSync
                              ? "bg-cyan-950 text-cyan-300 border-cyan-500/50"
                              : "bg-slate-900 text-slate-400 border-slate-700"
                          }`}
                        >
                          {mtConfig.continuousSync
                            ? `ON • ${aisCountdownSec}s`
                            : "OFF • MANUAL"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {mtConfig.continuousSync
                          ? "Auto-refreshing AIS data from MarineTraffic every 60s"
                          : "Manual trigger mode — toggle to auto-refresh every 60s"}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(mtConfig.continuousSync)}
                      aria-label="Toggle Continuous Sync (60s MarineTraffic Auto-Refresh)"
                      onClick={handleToggleContinuousSync}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        mtConfig.continuousSync ? "bg-cyan-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          mtConfig.continuousSync
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Prominent Current Vessel Status Banner */}
                  <div className={`p-2.5 rounded border flex flex-col gap-2 font-mono ${
                    vessel.navStatus.toLowerCase().includes("moored")
                      ? "bg-sky-950/60 border-sky-500/70 text-sky-200"
                      : vessel.navStatus.toLowerCase().includes("anchor")
                      ? "bg-amber-950/60 border-amber-500/70 text-amber-200"
                      : "bg-emerald-950/60 border-emerald-500/70 text-emerald-200"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400">
                          Current Vessel Status
                        </span>
                        <span className="text-sm font-bold uppercase text-white">
                          {vessel.navStatus}
                        </span>
                        <span className="text-[10px] text-sky-300">
                          Port: <strong>{vessel.currentPort || "BRSSZ (Santos)"}</strong>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-300 block">Dest: <strong className="text-cyan-300">{vessel.destination}</strong></span>
                        <span className="text-[10px] font-bold text-sky-300">
                          SOG: {getEffectiveVesselSog(vessel).toFixed(1)} kn
                        </span>
                        <span className="text-[9.5px] text-slate-400 block">
                          {formatNauticalCoord(vessel.lat, vessel.lon).combined}
                        </span>
                      </div>
                    </div>

                    {/* Quick AIS Mode Switcher */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800/80 text-[9.5px]">
                      <span className="text-slate-400">AIS Mode:</span>
                      <button
                        type="button"
                        onClick={handleRefreshAis}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          Math.abs(vessel.lat - -34.73778) < 1.5
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-slate-900 text-slate-400 hover:text-white border border-slate-700"
                        }`}
                      >
                        Live MT Fix (ARROS)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleManualOverrideVessel({
                            lat: -23.945,
                            lon: -46.315,
                            navStatus: "Moored at BRSSZ",
                            currentPort: "BRSSZ (Santos)",
                            destination: "BRNVT",
                            sog: 0.0,
                            cog: 124,
                            heading: 137,
                            draught: 9.8,
                          })
                        }
                        className={`px-2 py-0.5 rounded transition-colors ${
                          vessel.navStatus.toLowerCase().includes("moored")
                            ? "bg-sky-600 text-white font-bold"
                            : "bg-slate-900 text-slate-400 hover:text-white border border-slate-700"
                        }`}
                      >
                        Moored BRSSZ (0 kn)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleManualOverrideVessel({
                            lat: -24.085,
                            lon: -46.28,
                            navStatus: "At anchor",
                            currentPort: "BRSSZ Anchorage",
                            destination: "BRNVT",
                            sog: 0.0,
                          })
                        }
                        className={`px-2 py-0.5 rounded transition-colors ${
                          vessel.navStatus.toLowerCase().includes("anchor")
                            ? "bg-amber-600 text-white font-bold"
                            : "bg-slate-900 text-slate-400 hover:text-white border border-slate-700"
                        }`}
                      >
                        Anchored
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-slate-950/60 border border-slate-800/80 p-2 rounded flex flex-col">
                      <span className="text-[10px] text-slate-400">SPEED (SOG)</span>
                      <span className="text-base font-bold text-cyan-400">
                        {getEffectiveVesselSog(vessel).toFixed(1)} <span className="text-[10px] text-slate-400">kn</span>
                        {vessel.navStatus.toLowerCase().includes("moored") && (
                          <span className="ml-1.5 text-[9px] text-sky-400 font-normal uppercase">(Moored)</span>
                        )}
                      </span>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800/80 p-2 rounded flex flex-col">
                      <span className="text-[10px] text-slate-400">COURSE (COG)</span>
                      <span className="text-base font-bold text-white">{vessel.cog.toFixed(0)}°T</span>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800/80 p-2 rounded flex flex-col">
                      <span className="text-[10px] text-slate-400">HEADING (HDG)</span>
                      <span className="text-base font-bold text-white">{vessel.heading.toFixed(0)}°T</span>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800/80 p-2 rounded flex flex-col">
                      <span className="text-[10px] text-slate-400">DRAUGHT</span>
                      <span className="text-base font-bold text-slate-300">{vessel.draught.toFixed(1)} <span className="text-[10px] text-slate-400">m</span></span>
                    </div>
                  </div>

                  {/* Target Waypoint Info */}
                  {vesselMetrics.nextWaypointName && (
                    <div className="p-2.5 rounded border bg-slate-950/60 border-slate-800/80 text-xs font-mono">
                      <div className="text-[10px] flex justify-between text-slate-200">
                        <span>Target: <strong>{vesselMetrics.nextWaypointName}</strong></span>
                        <span>{vesselMetrics.distToNextWaypoint} NM @ {vesselMetrics.bearingToNextWaypoint}°T</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-between items-center text-[10px] font-mono text-slate-400 pt-1 gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {aisSyncMessage ? (
                        <span className="text-emerald-400 font-bold">{aisSyncMessage}</span>
                      ) : (
                        <span>Fix: {new Date(vessel.timestamp).toLocaleTimeString()} ({zoneInfo.zone} · {zoneInfo.samplingIntervalHours}h)</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => captureVoyageSample("USER_PUSH")}
                        disabled={isSampling}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold underline disabled:opacity-50"
                        title="Push immediate Voyage Summary SQL sample"
                      >
                        {isSampling ? "Sampling..." : "Push Sample"}
                      </button>
                      <button
                        type="button"
                        onClick={handleQuickDownloadSql}
                        className="text-sky-400 hover:text-sky-300 font-semibold underline"
                        title="Download PostgreSQL / ANSI .sql Voyage Summary"
                      >
                        Export .SQL
                      </button>
                      <button
                        onClick={handleRefreshAis}
                        disabled={isRefreshingAis}
                        className="text-cyan-400 hover:text-cyan-300 font-semibold underline"
                      >
                        {isRefreshingAis ? "Syncing..." : "Sync Position"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-4">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Hash className="w-4 h-4 text-cyan-500" />
                  Voyage Analytics
                </h3>

                <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-slate-800 pb-2">
                    <span className="text-xs text-slate-400">
                      Total Distance
                    </span>
                    <span className="text-lg font-mono text-white font-bold">
                      {output?.totalDist ? output.totalDist : "--"}{" "}
                      <span className="text-[10px] text-slate-500">NM</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-end border-b border-slate-800 pb-2">
                    <span className="text-xs text-slate-400">
                      Req. Total Enroute Time
                    </span>
                    <span className="text-lg font-mono text-white font-bold">
                      {output?.totalHours ? output.totalHours : "--"}{" "}
                      <span className="text-[10px] text-slate-500">HRS</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-end border-b border-slate-800 pb-2">
                    <span className="text-xs text-slate-400">
                      Req. Avg Speed
                    </span>
                    <span className="text-lg font-mono text-white font-bold">
                      {output?.avgSpeed ? output.avgSpeed : "--"}{" "}
                      <span className="text-[10px] text-slate-500">KTS</span>
                    </span>
                  </div>
                  {analytics && (
                    <>
                      <div className="flex justify-between items-end border-b border-purple-900/50 pb-2 bg-purple-900/10 px-2 rounded-t">
                        <span className="text-xs text-purple-400 flex items-center gap-1 font-bold">
                          <Zap className="w-3 h-3" /> Env Avg Max SOG
                        </span>
                        <span className="text-lg font-mono text-purple-300 font-bold">
                          {analytics.sogAvgMax.toFixed(2)}{" "}
                          <span className="text-[10px] text-purple-500">
                            KTS
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-end border-b border-purple-900/50 pb-2 bg-purple-900/10 px-2">
                        <span className="text-xs text-purple-400">
                          Weighted Enroute Time
                        </span>
                        <span className="text-lg font-mono text-purple-300 font-bold">
                          {analytics.weightedTotalEnrouteTime.toFixed(1)}{" "}
                          <span className="text-[10px] text-purple-500">
                            HRS
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-end border-b border-purple-900/50 pb-2 bg-purple-900/10 px-2 rounded-b">
                        <span className="text-xs text-purple-400">
                          Proposed ETA (EnviroETA)
                        </span>
                        <div className="text-right flex flex-col">
                          <span className="text-lg font-mono text-purple-300 font-bold">
                            {analytics.etaUtcEnv
                              .getUTCHours()
                              .toString()
                              .padStart(2, "0")}
                            :
                            {analytics.etaUtcEnv
                              .getUTCMinutes()
                              .toString()
                              .padStart(2, "0")}{" "}
                            Z
                            <span className="text-[10px] text-purple-500 ml-1">
                              {PT_MONTHS[analytics.etaUtcEnv.getUTCMonth()]}{" "}
                              {analytics.etaUtcEnv.getUTCDate()}
                            </span>
                          </span>
                          <span className="text-[10px] font-mono text-purple-400/70">
                            {analytics.etaLocalEnv
                              .getUTCHours()
                              .toString()
                              .padStart(2, "0")}
                            :
                            {analytics.etaLocalEnv
                              .getUTCMinutes()
                              .toString()
                              .padStart(2, "0")}{" "}
                            LT
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
                    <button
                      onClick={handleCopy}
                      className="text-[10px] bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-white transition-colors flex items-center gap-1 font-bold tracking-wider"
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copied ? "COPIED" : "COPY"}
                    </button>
                  )}
                </div>
                <div className="flex-1 p-4 sm:p-6 font-mono text-sm leading-relaxed text-cyan-50 overflow-auto">
                  {output ? (
                    <div>
                      <div className="text-cyan-600 opacity-50 mb-4">
                        // START OF MESSAGE //
                      </div>
                      <pre className="whitespace-pre-wrap break-all text-cyan-50 font-mono">
                        {output.message}
                      </pre>
                      <div className="text-cyan-600 opacity-50 mt-4">
                        // END OF MESSAGE //
                      </div>
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
                      <span className="text-[10px] font-mono text-emerald-500 animate-pulse uppercase">
                        Fetching Metocean Data...
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-emerald-500 uppercase">
                        Live Weather Sync
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-emerald-900/50 scrollbar-track-transparent">
                    {output.waypoints.map((wp, idx) => {
                      const weather = waypointWeather[idx];
                      const wpDetail = analytics?.wpDetails?.[idx];
                      const isCritical = wpDetail?.critical?.flags?.length > 0;

                      let warningColor = "text-slate-400";
                      let suggestion = "";
                      if (isCritical) {
                        warningColor = "text-red-400";
                        suggestion =
                          "CRITICAL CONDITION MET. Immediate review of heading and speed profiles required.";
                      } else if (
                        weather &&
                        typeof weather.waveHeight === "number"
                      ) {
                        if (weather.waveHeight > 3) {
                          warningColor = "text-red-400";
                          suggestion =
                            "Heavy seas. Consider speed reduction or routing adjustment to minimize slamming.";
                        } else if (
                          weather.waveHeight > 2 ||
                          (weather.windSpeed && weather.windSpeed > 25)
                        ) {
                          warningColor = "text-amber-400";
                          suggestion =
                            "Moderate conditions. Keep watch on parameter drift.";
                        } else {
                          warningColor = "text-emerald-400";
                          suggestion = "Favorable weather window.";
                        }
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex flex-col gap-2 p-3 bg-black/20 rounded border ${isCritical ? "border-red-900/50 hover:border-red-500/50" : "border-slate-800/50 hover:border-emerald-900/50"} transition-colors`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-bold ${isCritical ? "text-red-400" : "text-cyan-400"} font-mono`}
                            >
                              {wp.type === "G"
                                ? "Waypoint 1 (Dep)"
                                : wp.type === "I"
                                  ? `Waypoint ${idx + 1} (Arr)`
                                  : `Waypoint ${idx + 1}`}
                            </span>
                            <div className="flex flex-wrap gap-2 md:gap-3 items-center">
                              {isCritical &&
                                wpDetail.critical.flags.map((f: string) => (
                                  <span
                                    key={f}
                                    className="text-[10px] bg-red-900/60 text-red-200 font-bold px-2 py-0.5 rounded border border-red-700/50 truncate"
                                  >
                                    {f}
                                  </span>
                                ))}
                              {wp.bearingFromPrev !== undefined && (
                                <span
                                  className="text-[10px] text-emerald-400 font-mono font-bold"
                                  title="Rumo em relação ao Norte Verdadeiro (RV)"
                                >
                                  RV:{" "}
                                  {Math.round(wp.bearingFromPrev)
                                    .toString()
                                    .padStart(3, "0")}
                                  °
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500 font-mono">
                                ETA:{" "}
                                {wp.timeLocal
                                  .getUTCHours()
                                  .toString()
                                  .padStart(2, "0")}
                                :
                                {wp.timeLocal
                                  .getUTCMinutes()
                                  .toString()
                                  .padStart(2, "0")}{" "}
                                / {PT_MONTHS[wp.timeLocal.getUTCMonth()]}{" "}
                                {wp.timeLocal.getUTCDate()}
                              </span>
                            </div>
                          </div>

                          {weather ? (
                            <div className="grid grid-cols-4 gap-2 mt-2">
                              <div className="flex flex-col gap-1 border-l-2 border-amber-500/50 pl-2">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                                  Wind
                                </span>
                                <span className="text-xs font-mono text-slate-300">
                                  {weather.windSpeed !== null
                                    ? `${Math.round(weather.windSpeed)} kt`
                                    : "--"}
                                  {weather.windDirection !== null
                                    ? ` ${weather.windDirection}°`
                                    : ""}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 border-l-2 border-cyan-500/50 pl-2">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                                  Waves
                                </span>
                                <span className="text-xs font-mono text-slate-300">
                                  {weather.waveHeight !== null
                                    ? `${weather.waveHeight}m`
                                    : "--"}
                                  {weather.waveDirection !== null
                                    ? ` ${weather.waveDirection}°`
                                    : ""}
                                  {weather.wavePeriod !== null
                                    ? ` ${weather.wavePeriod}s`
                                    : ""}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 border-l-2 border-emerald-500/50 pl-2">
                                <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                                  Curr
                                </span>
                                <span className="text-xs font-mono text-slate-300">
                                  {weather.currentVelocity !== null
                                    ? `${Math.round(weather.currentVelocity * 10) / 10} kt`
                                    : "--"}
                                  {weather.currentDirection !== null
                                    ? ` ${weather.currentDirection}°`
                                    : ""}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 border-l-2 border-purple-500/50 pl-2 bg-purple-900/10">
                                <span className="text-[9px] text-purple-400 uppercase flex items-center gap-1 font-bold">
                                  <Zap className="w-3 h-3" /> Max SOG
                                </span>
                                <span className="text-xs font-mono font-bold text-purple-300">
                                  {idx > 0 && wp.bearingFromPrev !== undefined
                                    ? (() => {
                                        const maxSog = calculateMaxSOG(
                                          shipData,
                                          weather.windSpeed,
                                          weather.windDirection,
                                          weather.waveHeight,
                                          weather.waveDirection,
                                          weather.wavePeriod,
                                          weather.currentVelocity,
                                          weather.currentDirection,
                                          wp.bearingFromPrev,
                                        );
                                        return `${maxSog} kt`;
                                      })()
                                    : "--"}
                                </span>
                              </div>
                            </div>
                          ) : isFetchingWeather ? (
                            <div className="h-10 flex items-center justify-center opacity-50">
                              <span className="text-[10px] font-mono text-emerald-500 animate-pulse">
                                Syncing...
                              </span>
                            </div>
                          ) : (
                            <div className="h-10 flex items-center justify-center opacity-50">
                              <span className="text-[10px] font-mono text-slate-500">
                                Data unavailable
                              </span>
                            </div>
                          )}

                          {suggestion && (
                            <div
                              className={`mt-2 text-[10px] bg-black/40 p-2 rounded border border-slate-800 ${warningColor}`}
                            >
                              {suggestion}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "simulator" && (
          <div className="flex flex-col gap-4 h-full">
            <section className="bg-slate-900/40 p-6 rounded-lg border border-slate-800 flex flex-col gap-6">
              <div className="flex items-center gap-2 mb-2 border-b border-slate-800 pb-2">
                <Activity className="w-5 h-5 text-cyan-500" />
                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
                  Motion Simulator Parameters
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    True Course
                  </label>
                  <input
                    type="number"
                    step="1"
                    name="trueCourse"
                    value={simInputs.trueCourse}
                    onChange={handleSimChange}
                    className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Speed (kts)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="speed"
                    value={simInputs.speed}
                    onChange={handleSimChange}
                    className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Heading (deg)
                  </label>
                  <input
                    type="number"
                    step="1"
                    name="heading"
                    value={simInputs.heading}
                    onChange={handleSimChange}
                    className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    GM (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="gm"
                    value={simInputs.gm}
                    onChange={handleSimChange}
                    className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Wave Dir (deg)
                  </label>
                  <input
                    type="number"
                    step="1"
                    name="waveDirection"
                    value={simInputs.waveDirection}
                    onChange={handleSimChange}
                    className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Wave Period (s)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="wavePeriod"
                    value={simInputs.wavePeriod}
                    onChange={handleSimChange}
                    className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Wave Height (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="waveHeight"
                    value={simInputs.waveHeight}
                    onChange={handleSimChange}
                    className="w-full bg-black/40 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-600 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
                      Critical Situations Evaluated
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div
                      className={`p-4 rounded-lg border ${simResult.SROLL ? "bg-red-900/30 border-red-800 text-red-200" : "bg-emerald-900/10 border-emerald-800/50 text-emerald-500"}`}
                    >
                      <div className="font-bold text-sm uppercase mb-1">
                        Synchronous Roll
                      </div>
                      <div className="text-xs opacity-80">
                        {simResult.SROLL ? "CRITICAL DETECTED" : "SAFE"}
                      </div>
                    </div>
                    <div
                      className={`p-4 rounded-lg border ${simResult.PROLL ? "bg-red-900/30 border-red-800 text-red-200" : "bg-emerald-900/10 border-emerald-800/50 text-emerald-500"}`}
                    >
                      <div className="font-bold text-sm uppercase mb-1">
                        Parametric Roll
                      </div>
                      <div className="text-xs opacity-80">
                        {simResult.PROLL ? "CRITICAL DETECTED" : "SAFE"}
                      </div>
                    </div>
                    <div
                      className={`p-4 rounded-lg border ${simResult.HWATACK ? "bg-red-900/30 border-red-800 text-red-200" : "bg-emerald-900/10 border-emerald-800/50 text-emerald-500"}`}
                    >
                      <div className="font-bold text-sm uppercase mb-1">
                        High Waves Attack
                      </div>
                      <div className="text-xs opacity-80">
                        {simResult.HWATACK ? "CRITICAL DETECTED" : "SAFE"}
                      </div>
                    </div>
                    <div
                      className={`p-4 rounded-lg border ${simResult.SRIDING ? "bg-red-900/30 border-red-800 text-red-200" : "bg-emerald-900/10 border-emerald-800/50 text-emerald-500"}`}
                    >
                      <div className="font-bold text-sm uppercase mb-1">
                        Surf Riding
                      </div>
                      <div className="text-xs opacity-80">
                        {simResult.SRIDING ? "CRITICAL DETECTED" : "SAFE"}
                      </div>
                    </div>
                  </div>

                  {simResult.flags.length > 0 && (
                    <div className="mt-4 p-4 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm flex flex-col gap-2">
                      <span className="font-bold">
                        WARNING: Critical situations triggered at these
                        parameters:
                      </span>
                      <ul className="list-disc pl-5">
                        {simResult.flags.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center justify-center p-4 bg-black/40 rounded-lg border border-slate-800 relative">
                    <div className="absolute top-4 left-4 right-4 flex justify-between z-10 text-[10px] font-mono">
                      <div className="bg-slate-900/80 px-2 py-1 rounded border border-slate-700 text-slate-300">
                        θmax:{" "}
                        {(
                          0.466 *
                          (1.25 - 0.6 / Math.sqrt(Math.max(0.01, simInputs.gm)))
                        ).toFixed(3)}{" "}
                        rad (
                        {(
                          (0.466 *
                            (1.25 -
                              0.6 / Math.sqrt(Math.max(0.01, simInputs.gm))) *
                            180) /
                          Math.PI
                        ).toFixed(1)}
                        °)
                      </div>
                    </div>
                    <PolarSimulator
                      userHeading={simInputs.heading}
                      userSpeed={simInputs.speed}
                      trueCourse={simInputs.trueCourse}
                      gm={simInputs.gm}
                      rollingPeriod={shipData.rollingPeriod || 15}
                      lpp={shipData.lpp || 200}
                      waveDir={simInputs.waveDirection}
                      wavePeriod={simInputs.wavePeriod}
                      waveHeight={simInputs.waveHeight}
                      forceSafe={
                        !simResult.SROLL &&
                        !simResult.PROLL &&
                        !simResult.HWATACK &&
                        !simResult.SRIDING
                      }
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "voyage_sql" && activeVoyage && (
          <VoyageSummarySqlPanel
            vessel={vessel}
            zoneInfo={zoneInfo}
            zoneOverride={zoneOverride}
            onChangeZoneOverride={setZoneOverride}
            voyages={voyages}
            activeVoyage={activeVoyage}
            selectedVoyageId={selectedVoyageId || activeVoyage.id}
            onSelectVoyage={setSelectedVoyageId}
            latestHydrography={latestHydrography}
            isSampling={isSampling}
            isFetchingHydrography={isFetchingHydrography}
            hydrographyError={hydrographyError}
            nextSampleCountdownSec={nextSampleCountdownSec}
            onPushSample={() => captureVoyageSample("USER_PUSH")}
            onRefreshHydrography={() => handleRefreshHydrography(true)}
            onDeleteSample={handleDeleteVoyageSample}
            onStartNewVoyage={handleStartNewVoyage}
          />
        )}
      </main>

      <footer className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-[10px] font-mono text-slate-600 border-t border-slate-900 pt-3 mt-2 shrink-0 gap-2">
        <div className="flex flex-col gap-1">
          <div>
            MMSI: {shipData.mmsi || "------"} | CALLSIGN:{" "}
            {shipData.callsign || "----"} | FLAG: {shipData.flag || "--"}
          </div>
          <div className="opacity-60 italic text-[9px]">
            Geospatial metocean data provided by{" "}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-500 hover:underline"
            >
              Open-Meteo API
            </a>
            .
          </div>
        </div>
        <div className="flex gap-4">
          <span>SISTRAM v1.0.0</span>
          <span className="text-slate-700">
            LAT/LON PARSER: <span className="text-emerald-700">OK</span>
          </span>
          <span className="text-slate-700">
            TIME ENGINE: <span className="text-emerald-700">SYNC</span>
          </span>
        </div>
      </footer>

      {isManualOpen && <ManualModal onClose={() => setIsManualOpen(false)} />}
    </div>
  );
}
