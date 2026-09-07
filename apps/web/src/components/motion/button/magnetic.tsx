"use client";

import { forwardRef } from "react";

import { Magnetic } from "../magnetic";
import {
  Button,
  ButtonLink,
  type ButtonLinkProps,
  type ButtonProps,
} from "./base";

export interface MagneticButtonProps extends ButtonProps {
  /** Magnetic pull strength. Default 0.25. */
  strength?: number;
  /** Class applied to the magnetic wrapper. */
  magneticClassName?: string;
}

export const MagneticButton = forwardRef<
  HTMLButtonElement,
  MagneticButtonProps
>(function MagneticButton(
  { strength = 0.25, magneticClassName, children, ...rest },
  ref
) {
  return (
    <Magnetic strength={strength} className={magneticClassName}>
      <Button ref={ref} {...rest}>
        {children}
      </Button>
    </Magnetic>
  );
});

export interface MagneticButtonLinkProps extends ButtonLinkProps {
  /** Magnetic pull strength. Default 0.25. */
  strength?: number;
  /** Class applied to the magnetic wrapper. */
  magneticClassName?: string;
}

export const MagneticButtonLink = forwardRef<
  HTMLAnchorElement,
  MagneticButtonLinkProps
>(function MagneticButtonLink(
  { strength = 0.25, magneticClassName, children, ...rest },
  ref
) {
  return (
    <Magnetic strength={strength} className={magneticClassName}>
      <ButtonLink ref={ref} {...rest}>
        {children}
      </ButtonLink>
    </Magnetic>
  );
});
