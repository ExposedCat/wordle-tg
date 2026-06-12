import type { Canvas, CanvasRenderingContext2D } from "@gfx/canvas";

export const COLORS = {
	bg: "#121213",
	correct: "#538d4e",
	present: "#b59f3b",
	absent: "#3a3a3c",
	unused: "#818384",
	emptyBorder: "#3a3a3c",
	text: "#ffffff",
	subtext: "#c9c9c9",
	winner: "#538d4e",
	panel: "#1f1f22",
	panel2: "#2f3033",
};

export const FONT = '"DejaVu Sans", sans-serif';
export const STICKER_WIDTH = 512;
export const STICKER_HEIGHT = 512;
export const WEBP_QUALITY = 100;

export function encodeSticker(canvas: Canvas): Uint8Array {
	return canvas.encode("webp", WEBP_QUALITY);
}

export function anchorStickerWidth(
	ctx: CanvasRenderingContext2D,
	height = STICKER_WIDTH,
): void {
	const y = Math.min(height - 1, Math.floor(height / 2));
	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, y, 1, 1);
	ctx.fillRect(STICKER_WIDTH - 1, y, 1, 1);
}

export function fitFont(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	maxSize: number,
	minSize: number,
): number {
	for (let size = maxSize; size > minSize; size--) {
		ctx.font = `bold ${size}px ${FONT}`;
		if (ctx.measureText(text).width <= maxWidth) return size;
	}
	return minSize;
}

export function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
