'use client';

import React from 'react';
import type { NoriCompanionState } from '@daynori/contracts';
import { colors } from '@daynori/design-tokens';

export interface NoriAvatarProps {
  state?: NoriCompanionState;
  size?: number;
  themeMode?: 'light' | 'dark';
  reducedMotion?: boolean;
  className?: string;
}

/**
 * NoriAvatar: Original Daynori folded-paper origami companion vector renderer.
 *
 * Implements 8 truthful states with zero AI or third-party dependencies:
 * - idle, greeting, listening, thinking, success, error, offline, sleeping.
 * Strictly respects reducedMotion, eliminating all animation when true.
 */
export function NoriAvatar({
  state = 'idle',
  size = 40,
  themeMode = 'light',
  reducedMotion = false,
  className,
}: NoriAvatarProps) {
  const isDark = themeMode === 'dark';

  // Daynori brand palette
  const frontFill = state === 'offline'
    ? (isDark ? '#526363' : '#758680')
    : (isDark ? '#2FA89A' : colors.light.action.primary); // #146B63
  const leftWingFill = state === 'offline'
    ? (isDark ? '#3D4D4D' : '#526363')
    : (isDark ? '#146B63' : '#0E524C');
  const rightWingFill = state === 'offline'
    ? (isDark ? '#4A5C5C' : '#617272')
    : (isDark ? '#38BDB0' : '#1D7F76');

  // Crest / Fold
  let crestFill = isDark ? '#E5B55A' : '#D9A441';
  if (state === 'error') {
    crestFill = isDark ? colors.dark.status.danger : colors.light.status.danger;
  } else if (state === 'offline') {
    crestFill = isDark ? '#6B7C7C' : '#8A9B9B';
  }

  const inkColor = isDark ? '#FFFFFF' : '#172C2C';
  const paperColor = isDark ? '#172C2C' : '#F7F5EF';
  const alertColor = isDark ? colors.dark.status.danger : colors.light.status.danger;
  const warmAccent = isDark ? '#E5B55A' : '#D9A441';

  // Geometry
  const bodyLeftWing = 'M16 24 L32 56 L10 38 Z';
  const bodyRightWing = 'M48 24 L32 56 L54 38 Z';
  const bodyFront = 'M32 8 L48 24 L32 56 L16 24 Z';
  const bodyCrest = state === 'listening' ? 'M32 4 L48 4 L32 20 Z' : 'M32 8 L44 8 L32 20 Z';
  const bodyShadow = 'M24 38 L32 56 L40 38 Z';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        transition: reducedMotion ? 'none' : 'transform 180ms cubic-bezier(0, 0, 0.2, 1)',
        transform: state === 'greeting' && !reducedMotion ? 'scale(1.05) rotate(-2deg)' : 'none',
      }}
    >
      {/* 1. Left Wing Facet */}
      <path d={bodyLeftWing} fill={leftWingFill} />

      {/* 2. Right Wing Facet */}
      <path d={bodyRightWing} fill={rightWingFill} />

      {/* 3. Front Torso Plane */}
      <path d={bodyFront} fill={frontFill} />

      {/* 4. Folded Crest / Ear Accent */}
      <path d={bodyCrest} fill={crestFill} />

      {/* 5. Shadow Crease */}
      <path d={bodyShadow} fill={inkColor} fillOpacity={0.12} />

      {/* 6. State Features */}
      {state === 'idle' && (
        <>
          <circle cx="26" cy="26" r="2.4" fill={inkColor} />
          <circle cx="38" cy="26" r="2.4" fill={inkColor} />
          {!reducedMotion && (
            <>
              <circle cx="25.2" cy="25.2" r="0.8" fill="#FFFFFF" />
              <circle cx="37.2" cy="25.2" r="0.8" fill="#FFFFFF" />
            </>
          )}
        </>
      )}

      {state === 'greeting' && (
        <>
          <path d="M23 27 Q26 23.5 29 27" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M35 27 Q38 23.5 41 27" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M29 33 Q32 36 35 33" stroke={inkColor} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}

      {state === 'listening' && (
        <>
          <circle cx="26" cy="25" r="2.4" fill={inkColor} />
          <circle cx="38" cy="25" r="2.4" fill={inkColor} />
          <path
            d="M24 44 Q32 48 40 44"
            stroke={warmAccent}
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}

      {state === 'thinking' && (
        <>
          <circle cx="26" cy="24" r="2.4" fill={inkColor} />
          <circle cx="38" cy="24" r="2.4" fill={inkColor} />
          <path
            d="M46 10 L48 6 L50 10 L54 12 L50 14 L48 18 L46 14 L42 12 Z"
            fill={warmAccent}
          />
        </>
      )}

      {state === 'success' && (
        <>
          <path d="M23 26 Q26 22.5 29 26" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M35 26 Q38 22.5 41 26" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path
            d="M27 34 L30 37 L37 30"
            stroke={paperColor}
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {state === 'error' && (
        <>
          <circle cx="26" cy="26" r="2.4" fill={inkColor} />
          <circle cx="38" cy="26" r="2.4" fill={inkColor} />
          <path d="M32 34 L35 40 H29 Z" fill={alertColor} />
        </>
      )}

      {state === 'offline' && (
        <>
          <path d="M23 26 H29" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M35 26 H41" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      )}

      {state === 'sleeping' && (
        <>
          <path d="M23 28 Q26 30 29 28" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M35 28 Q38 30 41 28" stroke={inkColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

