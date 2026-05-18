import logoUrl from '../assets/logo.jpeg';
import { cn } from '../lib/cn';

export function Logo({
  size = 28,
  rounded = true,
  className,
  alt = 'ÖğretimSayfam',
}: {
  size?: number;
  rounded?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn(
        'shrink-0 object-cover',
        rounded ? 'rounded-lg' : 'rounded-full',
        className,
      )}
    />
  );
}
