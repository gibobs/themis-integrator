import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/util/cn';

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:opacity-90',
				secondary: 'bg-muted text-foreground hover:bg-accent',
				outline: 'border border-input bg-card hover:bg-accent hover:text-accent-foreground',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				danger: 'bg-danger text-danger-foreground hover:opacity-90',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				sm: 'h-8 px-3 text-xs',
				md: 'h-9 px-4',
				lg: 'h-11 px-6 text-base',
				icon: 'h-9 w-9',
			},
		},
		defaultVariants: { variant: 'default', size: 'md' },
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, ...props }, ref) => (
		<button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
	),
);
Button.displayName = 'Button';

export { buttonVariants };
