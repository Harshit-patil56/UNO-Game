import React from 'react';
import { cn } from '../../lib/utils';

export interface LiquidGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glowIntensity?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  shadowIntensity?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  borderRadius?: string;
  blurIntensity?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  draggable?: boolean;
}

export const LiquidGlassCard: React.FC<LiquidGlassCardProps> = ({
  children,
  className,
  glowIntensity = 'sm',
  shadowIntensity = 'sm',
  borderRadius = '12px',
  blurIntensity = 'sm',
  draggable = false,
  style,
  ...props
}) => {
  // Map intensities to Tailwind backdrop blur values
  const blurClasses = {
    none: 'backdrop-blur-none',
    xs: 'backdrop-blur-[2px]',
    sm: 'backdrop-blur-[6px]',
    md: 'backdrop-blur-[12px]',
    lg: 'backdrop-blur-[20px]',
  };

  // Map intensities to shadows
  const shadowClasses = {
    none: 'shadow-none',
    xs: 'shadow-[0_2px_8px_-1px_rgba(0,0,0,0.08)]',
    sm: 'shadow-[0_8px_32px_0_rgba(0,0,0,0.12)]',
    md: 'shadow-[0_12px_40px_-4px_rgba(0,0,0,0.18)]',
    lg: 'shadow-[0_20px_50px_-8px_rgba(0,0,0,0.25)]',
  };

  // Map glow highlights (borders and inner shines)
  const glowStyles = {
    none: 'border border-transparent bg-white/5',
    xs: 'border border-white/5 bg-white/[0.03]',
    sm: 'border border-white/10 bg-white/[0.06]',
    md: 'border border-white/15 bg-white/[0.09]',
    lg: 'border border-white/20 bg-white/[0.12]',
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        blurClasses[blurIntensity],
        shadowClasses[shadowIntensity],
        glowStyles[glowIntensity],
        className
      )}
      style={{
        borderRadius,
        ...style,
      }}
      draggable={draggable}
      {...props}
    >
      {/* Light reflect overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10 pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};
