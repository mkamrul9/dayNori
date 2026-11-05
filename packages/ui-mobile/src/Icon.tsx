import { Image, Text, type ImageStyle, type StyleProp, type TextStyle } from 'react-native';
import { resolveIconName, splitIconText } from '@daynori/design-tokens';
import { iconImages } from './iconImages.js';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  label?: string;
  style?: StyleProp<ImageStyle>;
}

export function Icon({ name, size = 20, color = '#172C2C', label, style }: IconProps) {
  return (
    <Image
      source={iconImages[resolveIconName(name)]}
      resizeMode="contain"
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole="image"
      importantForAccessibility={label ? 'yes' : 'no'}
      style={[{ width: size, height: size, tintColor: color }, style]}
    />
  );
}

/** Inline images preserve native text flow; screen readers use the surrounding label. */
export function IconText({
  text,
  color,
  size = 18,
  textStyle,
}: {
  text: string;
  color?: string;
  size?: number;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <>
      {splitIconText(text).map((part, index) =>
        part.kind === 'text' ? (
          <Text key={index} style={[{ color, fontSize: size }, textStyle]}>
            {part.text}
          </Text>
        ) : (
          <Icon key={index} name={part.name} color={color} size={size} />
        )
      )}
    </>
  );
}
