import {
	type CanvasRenderingContext2D,
	createCanvas,
	Image,
} from "@gfx/canvas";
import type { StatsRow } from "../app/data.ts";
import {
	anchorStickerWidth,
	COLORS,
	encodeSticker,
	FONT,
	fitFont,
	roundRect,
	STICKER_WIDTH,
} from "../game/canvas.ts";

export type CompareStickerPlayer = {
	name: string;
	stats: StatsRow;
	avatar?: Uint8Array;
};

export async function renderCompareSticker(
	left: CompareStickerPlayer,
	right: CompareStickerPlayer,
): Promise<Uint8Array> {
	const sticker = createCanvas(STICKER_WIDTH, STICKER_WIDTH);
	const ctx = sticker.getContext("2d");

	anchorStickerWidth(ctx);
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	const metrics = compareMetrics(left.stats, right.stats);
	await drawCompareAvatar(ctx, left, 112, "left");
	await drawCompareAvatar(ctx, right, 400, "right");

	ctx.fillStyle = COLORS.text;
	ctx.font = `bold 27px ${FONT}`;
	ctx.fillText("VS", 256, 76);

	const rowX = 28;
	const rowH = 58;
	const gap = 10;
	let y = 160;
	for (const metric of metrics) {
		const leftWins =
			metric.leftScore !== null &&
			metric.rightScore !== null &&
			metric.leftScore > metric.rightScore;
		const rightWins =
			metric.leftScore !== null &&
			metric.rightScore !== null &&
			metric.rightScore > metric.leftScore;
		const tieWithValue =
			metric.leftScore !== null &&
			metric.rightScore !== null &&
			metric.leftScore === metric.rightScore &&
			metric.leftScore > 0;

		drawMetricCell(
			ctx,
			rowX,
			y,
			132,
			rowH,
			metric.left,
			leftWins || tieWithValue,
		);
		drawMetricCenter(ctx, rowX + 140, y, 176, rowH, metric.label);
		drawMetricCell(
			ctx,
			rowX + 324,
			y,
			132,
			rowH,
			metric.right,
			rightWins || tieWithValue,
		);
		y += rowH + gap;
	}

	return encodeSticker(sticker);
}

function compareMetrics(
	left: StatsRow,
	right: StatsRow,
): {
	label: string;
	left: string;
	right: string;
	leftScore: number | null;
	rightScore: number | null;
}[] {
	const leftQuality = qualityScore(left);
	const rightQuality = qualityScore(right);
	return [
		{
			label: "Won games",
			left: String(left.games_won),
			right: String(right.games_won),
			leftScore: left.games_won,
			rightScore: right.games_won,
		},
		{
			label: "Finished",
			left: String(left.solves),
			right: String(right.solves),
			leftScore: left.solves,
			rightScore: right.solves,
		},
		{
			label: "Tournaments",
			left: percentText(left.tournaments_won, left.tournaments_played),
			right: percentText(right.tournaments_won, right.tournaments_played),
			leftScore: percentScore(left.tournaments_won, left.tournaments_played),
			rightScore: percentScore(right.tournaments_won, right.tournaments_played),
		},
		{
			label: "Duels",
			left: percentText(left.duels_won, left.duels_played),
			right: percentText(right.duels_won, right.duels_played),
			leftScore: percentScore(left.duels_won, left.duels_played),
			rightScore: percentScore(right.duels_won, right.duels_played),
		},
		{
			label: "Quality",
			left: leftQuality === null ? "n/a" : String(leftQuality),
			right: rightQuality === null ? "n/a" : String(rightQuality),
			leftScore: leftQuality,
			rightScore: rightQuality,
		},
	];
}

function qualityScore(s: StatsRow): number | null {
	if (!s.guess_quality_count) return null;
	return Math.round(s.guess_quality_points_sum / s.guess_quality_count);
}

function percentText(part: number, total: number): string {
	return `${percentScore(part, total)}%`;
}

function percentScore(part: number, total: number): number {
	return total ? Math.round((part * 100) / total) : 0;
}

async function drawCompareAvatar(
	ctx: CanvasRenderingContext2D,
	player: CompareStickerPlayer,
	centerX: number,
	side: "left" | "right",
): Promise<void> {
	const accent = side === "left" ? COLORS.present : COLORS.correct;
	const radius = 47;
	const centerY = 82;

	ctx.save();
	ctx.beginPath();
	ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2, false);
	ctx.fillStyle = accent;
	ctx.fill();
	ctx.restore();

	if (player.avatar) {
		try {
			const image = await loadImageBytes(player.avatar);
			const size = Math.min(image.width, image.height);
			const sx = Math.round((image.width - size) / 2);
			const sy = Math.round((image.height - size) / 2);
			ctx.save();
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false);
			ctx.clip();
			ctx.drawImage(
				image,
				sx,
				sy,
				size,
				size,
				centerX - radius,
				centerY - radius,
				radius * 2,
				radius * 2,
			);
			ctx.restore();
			return;
		} catch {
			// Fall through to the initial badge when Telegram returns an unsupported image.
		}
	}

	ctx.beginPath();
	ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false);
	ctx.fillStyle = COLORS.panel2;
	ctx.fill();

	const initial = firstLetter(player.name);
	ctx.fillStyle = COLORS.text;
	ctx.font = `bold 44px ${FONT}`;
	ctx.fillText(initial, centerX, centerY + 3);
}

async function loadImageBytes(bytes: Uint8Array): Promise<Image> {
	const path = await Deno.makeTempFile({ prefix: "telewordle-avatar-" });
	try {
		await Deno.writeFile(path, bytes);
		return await Image.load(path);
	} finally {
		await Deno.remove(path).catch(() => {});
	}
}

function firstLetter(name: string): string {
	return [...name.trim()][0]?.toUpperCase() ?? "?";
}

function drawMetricCell(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	text: string,
	winner: boolean,
): void {
	ctx.fillStyle = winner ? COLORS.winner : COLORS.panel2;
	roundRect(ctx, x, y, w, h, 8);
	ctx.fill();
	ctx.fillStyle = COLORS.text;
	ctx.font = `bold ${fitFont(ctx, text, w - 18, 24, 13)}px ${FONT}`;
	ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

function drawMetricCenter(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	label: string,
): void {
	ctx.fillStyle = COLORS.panel;
	roundRect(ctx, x, y, w, h, 8);
	ctx.fill();
	ctx.fillStyle = COLORS.subtext;
	ctx.font = `bold ${fitFont(ctx, label, w - 16, 24, 13)}px ${FONT}`;
	ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}
