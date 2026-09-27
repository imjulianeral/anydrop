"use client";

import type { Ref } from "react";

import { Magnetic } from "../magnetic";
import { Button, ButtonLink } from "./base";
import type { ButtonLinkProps, ButtonProps } from "./base";

export interface MagneticButtonProps extends ButtonProps {
  /** Magnetic pull strength. Default 0.25. */
  strength?: number;
  /** Class applied to the magnetic wrapper. */
  magneticClassName?: string;
}

export function MagneticButton({
  strength = 0.25,
  magneticClassName,
  children,
  ref,
  ...rest
}: MagneticButtonProps & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <Magnetic strength={strength} className={magneticClassName}>
      <Button ref={ref} {...rest}>
        {children}
      </Button>
    </Magnetic>
  );
}

export interface MagneticButtonLinkProps extends ButtonLinkProps {
  /** Magnetic pull strength. Default 0.25. */
  strength?: number;
  /** Class applied to the magnetic wrapper. */
  magneticClassName?: string;
}

export function MagneticButtonLink({
  strength = 0.25,
  magneticClassName,
  children,
  ref,
  ...rest
}: MagneticButtonLinkProps & { ref?: Ref<HTMLAnchorElement> }) {
  return (
    <Magnetic strength={strength} className={magneticClassName}>
      <ButtonLink ref={ref} {...rest}>
        {children}
      </ButtonLink>
    </Magnetic>
  );
}
