import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

const buttonVariants = cva(
	'ring-ring ring-offset-background inline-flex items-center justify-center rounded-lg text-sm font-medium ring-offset-2 outline-hidden transition-all focus-within:ring-2 focus-visible:ring-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground shadow-xs hover:bg-primary/80',
				destructive:
					'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/80',
				outline:
					'border-input bg-background hover:bg-accent hover:text-accent-foreground border shadow-xs',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				ghost: 'hover:bg-accent/10 hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-10 px-5 py-2',
				wide: 'px-24 py-5',
				sm: 'h-9 rounded-lg px-3.5',
				lg: 'h-11 rounded-lg px-8',
				pill: 'px-12 py-3 leading-3',
				icon: 'size-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

export type ButtonVariant = VariantProps<typeof buttonVariants>

const Button = ({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<'button'> &
	ButtonVariant & {
		asChild?: boolean
	}) => {
	const Comp = asChild ? Slot : 'button'
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

export { Button, buttonVariants }
