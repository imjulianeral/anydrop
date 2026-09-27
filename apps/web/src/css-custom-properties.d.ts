import "react";

declare module "react" {
  interface CSSProperties {
    /** CSS custom properties, read by classes such as `w-(--panel-width)`. */
    // oxlint-disable-next-line typescript/consistent-indexed-object-style -- Augmenting React's interface needs an index signature.
    [property: `--${string}`]: string | number | undefined;
  }
}
