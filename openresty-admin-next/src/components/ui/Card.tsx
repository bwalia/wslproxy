"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}
export interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
);
CardRoot.displayName = "Card";

const Header = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
);
Header.displayName = "Card.Header";

const Body = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className, children, ...rest }, ref) => (
    <div ref={ref} className={cn("px-6 py-4", className)} {...rest}>
      {children}
    </div>
  )
);
Body.displayName = "Card.Body";

const Footer = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "px-6 py-4 border-t border-slate-200 dark:border-slate-800",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
);
Footer.displayName = "Card.Footer";

const Card = Object.assign(CardRoot, {
  Header,
  Body,
  Footer,
});

export default Card;
