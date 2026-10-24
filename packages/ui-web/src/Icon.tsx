import React from 'react';
import { iconPaths, resolveIconName, splitIconText } from '@daynori/design-tokens';

export interface IconProps {
  name: string;
  size?: number | string;
  color?: string;
  label?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = '1em', color = 'currentColor', label, style }: IconProps) {
  const resolved = resolveIconName(name);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-icon={resolved}
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: '-0.125em', ...style }}
    >
      {iconPaths[resolved].map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}

/** Rendering adapter for application-authored labels; never apply to user content. */
export function IconText({ text }: { text: string }) {
  return (
    <>
      {splitIconText(text).map((part, index) =>
        part.kind === 'text' ? (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        ) : (
          <Icon key={index} name={part.name} />
        )
      )}
    </>
  );
}
