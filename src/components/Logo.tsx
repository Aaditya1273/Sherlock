/**
 * Sherlock mark: the supplied artwork in public/logo.png, rendered at a
 * square size. Solid black on white, so it is used on light grounds only.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="Sherlock"
      width={size}
      height={size}
      style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
    />
  );
}
