'use client';
import React from 'react';

interface LogoProps {
  width?: number;
  height?: number;
  variant?: 'full' | 'icon';
  theme?: string;
}

const Logo: React.FC<LogoProps> = ({ width = 180, height = 40, variant = 'full', theme = 'dark' }) => {
  const primaryColor = theme === 'dark' ? '#ffffff' : '#0f172a';
  const accentColor = '#6366f1';
  const gradientId = `logo-gradient-${Math.random().toString(36).substr(2, 9)}`;

  if (variant === 'icon') {
    return (
      <svg width={height} height={height} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor={accentColor} />
          </linearGradient>
        </defs>
        {/* Shield */}
        <path
          d="M20 2L4 10V20C4 30 20 38 20 38C20 38 36 30 36 20V10L20 2Z"
          fill={`url(#${gradientId})`}
          opacity="0.15"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
        />
        {/* Network nodes */}
        <circle cx="20" cy="14" r="2.5" fill={`url(#${gradientId})`} />
        <circle cx="12" cy="24" r="2" fill={`url(#${gradientId})`} />
        <circle cx="28" cy="24" r="2" fill={`url(#${gradientId})`} />
        <circle cx="20" cy="30" r="1.5" fill={`url(#${gradientId})`} />
        {/* Connection lines */}
        <line x1="20" y1="14" x2="12" y2="24" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
        <line x1="20" y1="14" x2="28" y2="24" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
        <line x1="12" y1="24" x2="20" y2="30" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
        <line x1="28" y1="24" x2="20" y2="30" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
        <line x1="12" y1="24" x2="28" y2="24" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.4" />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} viewBox="0 0 180 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor={accentColor} />
        </linearGradient>
      </defs>
      {/* Shield */}
      <path
        d="M20 2L4 10V20C4 30 20 38 20 38C20 38 36 30 36 20V10L20 2Z"
        fill={`url(#${gradientId})`}
        opacity="0.15"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.5"
      />
      {/* Network nodes */}
      <circle cx="20" cy="14" r="2.5" fill={`url(#${gradientId})`} />
      <circle cx="12" cy="24" r="2" fill={`url(#${gradientId})`} />
      <circle cx="28" cy="24" r="2" fill={`url(#${gradientId})`} />
      <circle cx="20" cy="30" r="1.5" fill={`url(#${gradientId})`} />
      {/* Connection lines */}
      <line x1="20" y1="14" x2="12" y2="24" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
      <line x1="20" y1="14" x2="28" y2="24" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
      <line x1="12" y1="24" x2="20" y2="30" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
      <line x1="28" y1="24" x2="20" y2="30" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.6" />
      <line x1="12" y1="24" x2="28" y2="24" stroke={`url(#${gradientId})`} strokeWidth="1" opacity="0.4" />
      {/* WSL text */}
      <text x="44" y="24" fontFamily="Inter, system-ui, sans-serif" fontSize="18" fontWeight="700" fill={primaryColor}>
        WSL
      </text>
      {/* Proxy text */}
      <text x="84" y="24" fontFamily="Inter, system-ui, sans-serif" fontSize="18" fontWeight="300" fill={primaryColor} opacity="0.8">
        Proxy
      </text>
      {/* ADMIN badge */}
      <rect x="132" y="12" rx="3" ry="3" width="40" height="16" fill={`url(#${gradientId})`} opacity="0.2" />
      <text x="152" y="24" fontFamily="Inter, system-ui, sans-serif" fontSize="8" fontWeight="700" fill={accentColor} textAnchor="middle">
        ADMIN
      </text>
    </svg>
  );
};

export default Logo;
