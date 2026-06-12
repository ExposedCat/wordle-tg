import { type Canvas, type CanvasRenderingContext2D, Fonts } from "@gfx/canvas";

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

const FONT_FAMILY = "NYT-Franklin";
const FONT_ASSET_DIR = new URL("../../assets/fonts/", import.meta.url);
const FONT_ASSET_PATTERN = /^NYT[-_ ]?Franklin.*\.(otf|ttf|woff2?)$/i;

registerFont(FONT_FAMILY);

export const FONT = `"${FONT_FAMILY}", sans-serif`;
export const STICKER_WIDTH = 512;
export const STICKER_HEIGHT = 512;
export const WEBP_QUALITY = 100;

function registerFont(alias: string): void {
	try {
		for (const entry of Deno.readDirSync(FONT_ASSET_DIR)) {
			if (!entry.isFile || !FONT_ASSET_PATTERN.test(entry.name)) continue;
			Fonts.register(
				Deno.readFileSync(new URL(entry.name, FONT_ASSET_DIR)),
				alias,
			);
			return;
		}
	} catch {
		// Fall back to the system font collection when the bundled asset is absent.
	}
}

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
