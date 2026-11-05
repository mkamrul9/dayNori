'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { useTourOptional } from './TourContext';

export interface TourTargetProps {
  id: string;
  children: React.ReactNode;
  /** When true, clicking reports activation evidence for the matching step. */
  reportActivate?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Registers a semantic tour target. Persists target IDs only — never CSS selectors.
 */
export function TourTarget({
  id,
  children,
  reportActivate = true,
  style,
  className,
}: TourTargetProps) {
  const tour = useTourOptional();
  const ref = useRef<HTMLSpanElement>(null);
  const registerTarget = tour?.registerTarget;

  useLayoutEffect(() => {
    if (!registerTarget) return;
    const host = ref.current;
    const measure = (host?.firstElementChild as HTMLElement | null) ?? host;
    registerTarget(id, measure);
    return () => registerTarget(id, null);
  }, [registerTarget, id]);

  const onClickCapture = () => {
    if (reportActivate && tour?.isPresenting) {
      void tour.reportTargetActivated(id);
    }
  };

  return (
    <span
      ref={ref}
      data-tour-target={id}
      className={className}
      style={{ display: 'contents', ...style }}
      onClickCapture={onClickCapture}
    >
      {children}
    </span>
  );
}
