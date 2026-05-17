import React, { useEffect, useRef, useState, useMemo } from 'react';

interface PolarSimulatorProps {
  userHeading: number;
  userSpeed: number;
  trueCourse: number;
  gm: number;
  rollingPeriod: number;
  lpp: number;
  waveDir: number;
  wavePeriod: number;
  waveHeight: number;
  forceSafe?: boolean;
}

export function PolarSimulator({
  userHeading,
  userSpeed,
  trueCourse,
  gm,
  rollingPeriod,
  lpp,
  waveDir,
  wavePeriod,
  waveHeight,
  forceSafe,
}: PolarSimulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<{ text: string; color: string }>({ text: 'STATUS: SAFE', color: 'text-emerald-400' });
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);

  const { finalGrid, conditionGrid } = useMemo(() => {
    const grid: number[][] = [];
    const cGrid: string[][] = [];
    for (let s = 0; s <= 25; s++) {
      grid[s] = [];
      cGrid[s] = [];
      for (let a = 0; a < 360; a++) {
        let mu = (a - waveDir + 360) % 360;
        const Lw = (9.81 * Math.pow(wavePeriod, 2)) / (2 * Math.PI);
        const denom = 3 * wavePeriod + s * Math.cos(mu * (Math.PI / 180));
        let Te = 999;
        if (Math.abs(denom) > 0.001) {
          Te = (3 * Math.pow(wavePeriod, 2)) / denom;
          if (Te < 0) Te = 999;
        }

        const ratio = rollingPeriod / Te;
        const SROLL = ratio > 0.7 && ratio < 1.2;
        const PROLL = ratio > 1.7 && ratio < 2.2;
        const HWATACK = mu > 130 && mu < 230 && Lw > 0.8 * lpp && waveHeight > 0.04 * lpp && (s / wavePeriod > 1.2) && (s / wavePeriod <= 2.8);
        const SRIDING = mu > 130 && mu < 230 && (s / Math.sqrt(lpp)) >= 1.8 && waveHeight >= 7.0;

        let isRed = SROLL || PROLL || HWATACK || SRIDING;
        grid[s][a] = isRed ? 1 : 0;

        if (SROLL) cGrid[s][a] = "SYNCHRONOUS ROLL";
        else if (PROLL) cGrid[s][a] = "PARAMETRIC ROLL";
        else if (HWATACK) cGrid[s][a] = "HIGH WAVES ATTACK";
        else if (SRIDING) cGrid[s][a] = "SURF RIDING";
        else cGrid[s][a] = "SAFE";
      }
    }

    const fGrid: number[][] = [];
    for (let s = 0; s <= 25; s++) {
      fGrid[s] = [];
      for (let a = 0; a < 360; a++) {
        if (forceSafe) {
          fGrid[s][a] = 0;
          cGrid[s][a] = "SAFE";
        } else if (grid[s][a] === 1) {
          fGrid[s][a] = 1;
        } else {
          let adjRed = false;
          for (let ds = -2; ds <= 2; ds++) {
            for (let da = -2; da <= 2; da++) {
              let ns = s + ds;
              let na = (a + da + 360) % 360;
              if (ns >= 0 && ns <= 25 && grid[ns][na] === 1) {
                adjRed = true;
                break;
              }
            }
            if (adjRed) break;
          }

          let DeltaCourse = Math.max(1.0, Math.abs(trueCourse - a));
          const gmSafe = Math.max(0.01, gm);
          const ShipRoll_Max = 0.466 * (1.25 - (0.60 / Math.sqrt(gmSafe)));
          const Tradeoff_Allowed = ShipRoll_Max < (5.0 / DeltaCourse);

          if (adjRed || (Tradeoff_Allowed && adjRed)) {
            fGrid[s][a] = 2; 
          } else {
            fGrid[s][a] = 0; 
          }
        }
      }
    }
    return { finalGrid: fGrid, conditionGrid: cGrid };
  }, [trueCourse, gm, rollingPeriod, lpp, waveDir, wavePeriod, waveHeight, forceSafe]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const maxRadius = Math.min(cx, cy) - 30;

    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.beginPath();
    ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
    ctx.fillStyle = hoveredZone === 0 ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.15)';
    ctx.fill();
    if (hoveredZone === 0) {
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (let s = 1; s <= 25; s++) {
      let rInner = ((s - 1) / 25) * maxRadius;
      let rOuter = (s / 25) * maxRadius;
      
      let startA = 0;
      let currentColor = finalGrid[s][0];

      for (let a = 1; a <= 360; a++) {
        let col = a < 360 ? finalGrid[s][a] : -1;
        if (col !== currentColor) {
          if (currentColor === 1 || currentColor === 2) {
            ctx.beginPath();
            let startRad = (startA - 90) * Math.PI / 180;
            let endRad = (a - 90) * Math.PI / 180;
            ctx.arc(cx, cy, rOuter, startRad, endRad);
            ctx.arc(cx, cy, rInner, endRad, startRad, true);
            ctx.closePath();
            
            if (currentColor === 1) {
              ctx.fillStyle = hoveredZone === 1 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.6)';
              ctx.fill();
              if (hoveredZone === 1) {
                ctx.strokeStyle = 'rgba(248, 113, 113, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
              }
            } else if (currentColor === 2) {
              ctx.fillStyle = hoveredZone === 2 ? 'rgba(234, 179, 8, 0.6)' : 'rgba(234, 179, 8, 0.4)';
              ctx.fill();
              if (hoveredZone === 2) {
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
              }
            }
          }
          currentColor = col;
          startA = a;
        }
      }
    }

    for (let rs = 5; rs <= 25; rs += 5) {
      ctx.beginPath();
      ctx.arc(cx, cy, (rs / 25) * maxRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(rs + 'kts', cx, cy - ((rs / 25) * maxRadius) + 12);
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let tAngle = (trueCourse - 90) * Math.PI / 180;
    ctx.lineTo(cx + Math.cos(tAngle) * maxRadius, cy + Math.sin(tAngle) * maxRadius);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let uAngle = (userHeading - 90) * Math.PI / 180;
    let uRadius = (Math.min(userSpeed, 25) / 25) * maxRadius;
    ctx.lineTo(cx + Math.cos(uAngle) * uRadius, cy + Math.sin(uAngle) * uRadius);
    ctx.strokeStyle = '#22d3ee'; 
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(cx + Math.cos(uAngle) * uRadius, cy + Math.sin(uAngle) * uRadius, 5, 0, Math.PI*2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - maxRadius - 12);
    ctx.fillText('S', cx, cy + maxRadius + 12);
    ctx.fillText('E', cx + maxRadius + 12, cy);
    ctx.fillText('W', cx - maxRadius - 12, cy);

    let us = Math.min(Math.round(userSpeed), 25);
    let uh = Math.round(userHeading) % 360;
    if (uh < 0) uh += 360;
    let val = finalGrid[us] ? finalGrid[us][uh] : 0;
    
    if (val === 1) {
      setStatus({ text: `STATUS: CRITICAL - ${conditionGrid[us][uh]}`, color: 'text-red-400' });
    } else if (val === 2) {
      setStatus({ text: 'STATUS: WARNING - ROLL TRADEOFF', color: 'text-amber-400' });
    } else {
      setStatus({ text: 'STATUS: SAFE', color: 'text-emerald-400' });
    }

  }, [userHeading, userSpeed, trueCourse, finalGrid, conditionGrid, hoveredZone]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const maxRadius = Math.min(cx, cy) - 30;

    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > maxRadius) {
      setHoveredZone(null);
      return;
    }
    
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    angle = (angle + 90 + 360) % 360; 
    
    const speed = Math.ceil((dist / maxRadius) * 25);
    const a = Math.floor(angle);
    const s = Math.min(speed, 25);
    
    if (finalGrid[s] && finalGrid[s][a] !== undefined) {
      setHoveredZone(finalGrid[s][a]);
    } else {
      setHoveredZone(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="relative w-full max-w-[600px] aspect-square min-h-[300px]">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full cursor-crosshair transition-opacity" 
          style={{ touchAction: 'none' }} 
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredZone(null)}
        />
      </div>
      <div className={`mt-4 font-mono font-bold text-sm tracking-wider ${status.color} bg-black/40 px-4 py-2 rounded border border-current opacity-90 transition-colors`}>
        {status.text}
      </div>
    </div>
  );
}
