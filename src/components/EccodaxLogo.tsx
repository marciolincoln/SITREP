import React from 'react';

export function EccodaxLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="5" y="5" width="90" height="90" stroke="#0047fa" strokeWidth="2" fill="transparent" />
      <text x="12" y="25" fill="#0047fa" fontFamily="sans-serif" fontSize="16" fontWeight="bold">Eccodax</text>
      
      {/* Stylized Waves */}
      <path d="M 5 60 Q 15 50 25 55 T 45 45 T 70 50 T 95 40 L 95 95 L 5 95 Z" fill="#0047fa" fillOpacity="0.1" />
      <path d="M 5 65 Q 20 65 30 75 T 60 70 T 95 80" stroke="#0047fa" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 5 75 Q 25 70 40 80 T 75 75 T 95 85" stroke="#0047fa" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 25 55 Q 35 45 45 50 T 65 45 T 85 55" stroke="#0047fa" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="60" cy="40" rx="3" ry="1.5" stroke="#0047fa" strokeWidth="1.5" fill="none" transform="rotate(-15 60 40)" />
      <ellipse cx="80" cy="35" rx="2" ry="1" stroke="#0047fa" strokeWidth="1.5" fill="none" transform="rotate(-20 80 35)" />
    </svg>
  );
}
