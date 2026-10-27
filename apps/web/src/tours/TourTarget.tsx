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

  useLayoutEffect(() => {
    if (!tour) return;
    const host = ref.current;
    const measure =
      (host?.firstElementChild as HTMLElement | null) ??
      host;
    tour.registerTarget(id, measure);
    return () => tour.registerTarget(id, null);
  }, [tour, id, children]);

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
