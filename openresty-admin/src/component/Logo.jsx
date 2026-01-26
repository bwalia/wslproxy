import React from 'react';

/**
 * WSL Proxy Logo Component
 * Professional SVG logo matching the landing page design
 */
const Logo = ({ width = 180, height = 40, variant = 'full', theme = 'dark' }) => {
  const primaryColor = theme === 'dark' ? '#ffffff' : '#0f172a';
  const accentColor = '#6366f1'; // Indigo-500
  const gradientId = `logoGradient-${Math.random().toString(36).substr(2, 9)}`;

  if (variant === 'icon') {
    // Icon-only variant for collapsed sidebar
    return (
      <svg
        width={height}
        height={height}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        {/* Shield background */}
        <path
          d="M24 4L6 12v12c0 11 8 21 18 24 10-3 18-13 18-24V12L24 4z"
          fill={`url(#${gradientId})`}
        />
        {/* Network nodes */}
        <circle cx="24" cy="18" r="3" fill="white" />
        <circle cx="16" cy="28" r="2.5" fill="white" opacity="0.9" />
        <circle cx="32" cy="28" r="2.5" fill="white" opacity="0.9" />
        <circle cx="24" cy="36" r="2" fill="white" opacity="0.8" />
        {/* Connection lines */}
        <path
          d="M24 21v5M18 27l4-4M30 27l-4-4M24 33v-3"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    );
  }

  // Full logo with text
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      
      {/* Shield Icon */}
      <g transform="translate(2, 2)">
        <path
          d="M20 2L4 8v10c0 9 6.5 17 16 20 9.5-3 16-11 16-20V8L20 2z"
          fill={`url(#${gradientId})`}
        />
        {/* Network nodes */}
        <circle cx="20" cy="14" r="2.5" fill="white" />
        <circle cx="13" cy="22" r="2" fill="white" opacity="0.9" />
        <circle cx="27" cy="22" r="2" fill="white" opacity="0.9" />
        <circle cx="20" cy="29" r="1.5" fill="white" opacity="0.8" />
        {/* Connection lines */}
        <path
          d="M20 16.5v3M15 21l3-3M25 21l-3-3M20 27v-2"
          stroke="white"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        />
      </g>

      {/* WSL Text */}
      <text
        x="48"
        y="28"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="20"
        fontWeight="700"
        fill={primaryColor}
        letterSpacing="-0.5"
      >
        WSL
      </text>
      
      {/* Proxy Text */}
      <text
        x="92"
        y="28"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="20"
        fontWeight="400"
        fill={accentColor}
        letterSpacing="-0.5"
      >
        Proxy
      </text>

      {/* Admin Badge */}
      <rect
        x="148"
        y="12"
        width="48"
        height="20"
        rx="4"
        fill={`url(#${gradientId})`}
        opacity="0.15"
      />
      <text
        x="172"
        y="26"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="10"
        fontWeight="600"
        fill={accentColor}
        textAnchor="middle"
        letterSpacing="0.5"
      >
        ADMIN
      </text>
    </svg>
  );
};

export default Logo;
