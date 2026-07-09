import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary-700 text-white shadow-soft hover:-translate-y-0.5 hover:bg-primary-800 hover:shadow-elevated",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline: "border border-ink-200 bg-transparent text-ink-700 hover:bg-ink-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800",
        secondary: "bg-ink-50 text-ink-800 hover:bg-ink-100 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
        ghost: "hover:bg-ink-50 hover:text-ink-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white",
        link: "underline-offset-4 hover:underline text-primary-600 dark:text-sky-300",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };