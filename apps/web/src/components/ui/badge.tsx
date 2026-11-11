import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-none border border-transparent px-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				secondary:
					"bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				outline:
					"border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				muted: "bg-muted/60 border-border text-muted-foreground",
				success: "bg-(--greenish)/12 border-(--greenish)/25 text-(--greenish)",
				destructive:
					"bg-(--destructive)/12 border-(--destructive)/25 text-(--destructive)",
				warning:
					"bg-(--yellowish)/12 border-(--yellowish)/25 text-(--yellowish)",
				info: "bg-(--blueish)/12 border-(--blueish)/25 text-(--blueish)",
				queued:
					"bg-(--purpleish)/12 border-(--purpleish)/25 text-(--purpleish)",
			},
		},
		defaultVariants: {
			variant: "muted",
		},
	},
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function Badge({
	className,
	variant = "muted",
	asChild = false,
	...props
}: React.ComponentProps<"span"> & {
	/** `error` is kept as an alias of `destructive`. */
	variant?: BadgeVariant | "error" | null;
	asChild?: boolean;
}) {
	const Comp = asChild ? Slot.Root : "span";
	const v: BadgeVariant | null = variant === "error" ? "destructive" : variant;

	return (
		<Comp
			data-slot="badge"
			data-variant={v}
			className={cn(badgeVariants({ variant: v }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants, type BadgeVariant };
export default Badge;
