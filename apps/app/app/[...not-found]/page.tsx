"use client";

export default function NotFoundPage() {
	return (
		<div className="grow w-full">
			<div className="w-full h-full flex items-center justify-center">
				<div>
					<h1>Página não encontrada</h1>
					<p className="text-muted-foreground">
						A página que você está tentando acessar não existe.
					</p>
				</div>
			</div>
		</div>
	);
}
