const CELL_SIZE = 37;
const LINE = "rgba(40, 40, 40, 0.5)";

/** Static grid behind the app, drawn by the browser with CSS gradients. */
export default function GridBackground() {
	return (
		<div
			aria-hidden
			className="bg-black"
			style={{
				position: "fixed",
				inset: 0,
				pointerEvents: "none",
				zIndex: 0,
				backgroundImage: `linear-gradient(to right, ${LINE} 1px, transparent 1px), linear-gradient(to bottom, ${LINE} 1px, transparent 1px)`,
				backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
			}}
		/>
	);
}
