import {
	type Canvas,
	type CanvasRenderingContext2D,
	createCanvas,
	Image,
} from "@gfx/canvas";
import type { GameRow, StatsRow } from "../db.ts";
import { LANGUAGE_KEY_ROWS } from "../engine/language.ts";
import {
	type KeyStatus,
	keyboardStatus,
	scoreGuess,
	type TileStatus,
} from "../engine/score.ts";
import { maxGuessesForGame } from "../game/service.ts";

// Classic Wordle palette
const COLORS = {
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

const TILE = 62;
const TILE_GAP = 6;
const PAD = 24;

const KEY_W = 42;
const KEY_H = 54;
const KEY_GAP = 6;
const KEY_ROW_GAP = 8;

const FONT = "sans-serif";
const STICKER_WIDTH = 512;
const STICKER_HEIGHT = 512;
const STICKER_PAD_Y = 18;
const WEBP_QUALITY = 100;

export type CompareStickerPlayer = {
	name: string;
	stats: StatsRow;
	avatar?: Uint8Array;
};

type VisibleKeyStatus = Exclude<KeyStatus, "absent">;
type VisibleKey = {
	letter: string;
	status: VisibleKeyStatus;
};

function renderBoardCanvas(
	game: GameRow,
	opts: { background?: boolean; pad?: number; rows?: number } = {},
): Canvas {
	const pad = opts.pad ?? PAD;
	const rows = opts.rows ?? maxGuessesForGame(game);
	const boardCols = game.answer.length;
	const boardW = boardCols * TILE + (boardCols - 1) * TILE_GAP;
	const boardH = rows * TILE + Math.max(0, rows - 1) * TILE_GAP;
	const width = boardW + pad * 2;
	const height = boardH + pad * 2;

	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");
	if (opts.background ?? true) {
		ctx.fillStyle = COLORS.bg;
		ctx.fillRect(0, 0, width, height);
	}
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// board
	const boardX = (width - boardW) / 2;
	const scores: TileStatus[][] = game.guesses.map((g) =>
		scoreGuess(game.answer, g.word),
	);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < boardCols; col++) {
			const x = boardX + col * (TILE + TILE_GAP);
			const y = pad + row * (TILE + TILE_GAP);
			if (row < game.guesses.length) {
				ctx.fillStyle = COLORS[scores[row][col]];
				roundRect(ctx, x, y, TILE, TILE, 6);
				ctx.fill();
				ctx.fillStyle = COLORS.text;
				ctx.font = `bold 34px ${FONT}`;
				ctx.fillText(
					game.guesses[row].word[col].toUpperCase(),
					x + TILE / 2,
					y + TILE / 2 + 2,
				);
			} else {
				ctx.strokeStyle = COLORS.emptyBorder;
				ctx.lineWidth = 2;
				roundRect(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 6);
				ctx.stroke();
			}
		}
	}

	return canvas;
}

export function renderBoardImage(game: GameRow): Uint8Array {
	return renderBoardCanvas(game).encode("png");
}

export function renderBoardSticker(
	game: GameRow,
	opts: { rows?: number } = {},
): Uint8Array {
	const source = renderBoardCanvas(game, {
		background: false,
		pad: 0,
		rows: opts.rows,
	});
	const scale = Math.min(
		STICKER_WIDTH / source.width,
		(STICKER_HEIGHT - 1) / source.height,
	);
	const width = Math.round(source.width * scale);
	const height = Math.round(source.height * scale);
	const sticker = createCanvas(STICKER_WIDTH, STICKER_HEIGHT);
	const ctx = sticker.getContext("2d");

	anchorStickerWidth(ctx);

	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(
		source,
		Math.round((STICKER_WIDTH - width) / 2),
		STICKER_HEIGHT - height,
		width,
		height,
	);

	return encodeSticker(sticker);
}

export function renderKeyboardSticker(game: GameRow): Uint8Array {
	const rows = visibleKeyboardRows(game);
	const keyW = keyboardKeyWidth(rows);

	const totalH =
		rows.length * KEY_H + Math.max(0, rows.length - 1) * KEY_ROW_GAP;
	const sticker = createCanvas(STICKER_WIDTH, totalH + STICKER_PAD_Y * 2);
	const ctx = sticker.getContext("2d");
	let y = STICKER_PAD_Y;

	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = `bold ${keyW < KEY_W ? 24 : 26}px ${FONT}`;

	for (const row of rows) {
		const rowW = keyboardRowWidth(row.length, keyW);
		let x = Math.round((STICKER_WIDTH - rowW) / 2);

		for (const key of row) {
			ctx.fillStyle = keyboardFill(key.status);
			roundRect(ctx, x, y, keyW, KEY_H, 6);
			ctx.fill();
			ctx.fillStyle = COLORS.text;
			ctx.fillText(key.letter, x + keyW / 2, y + KEY_H / 2 + 1);
			x += keyW + KEY_GAP;
		}

		y += KEY_H + KEY_ROW_GAP;
	}

	return encodeSticker(sticker);
}

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

function visibleKeyboardRows(game: GameRow): VisibleKey[][] {
	const status = keyboardStatus(
		game.answer,
		game.guesses.map((g) => g.word),
	);

	return LANGUAGE_KEY_ROWS[game.language]
		.map((row) =>
			row.split("").flatMap((letter): VisibleKey[] => {
				const keyStatus = status.get(letter.toLowerCase()) ?? "unused";
				if (keyStatus === "absent") return [];
				return [{ letter, status: keyStatus }];
			}),
		)
		.filter((row) => row.length > 0);
}

function keyboardKeyWidth(rows: VisibleKey[][]): number {
	const maxKeys = Math.max(1, ...rows.map((row) => row.length));
	return Math.min(
		KEY_W,
		Math.floor((STICKER_WIDTH - (maxKeys - 1) * KEY_GAP) / maxKeys),
	);
}

function keyboardRowWidth(keyCount: number, keyW: number): number {
	return keyCount * keyW + Math.max(0, keyCount - 1) * KEY_GAP;
}

function encodeSticker(canvas: Canvas): Uint8Array {
	return canvas.encode("webp", WEBP_QUALITY);
}

function anchorStickerWidth(
	ctx: CanvasRenderingContext2D,
	height = STICKER_WIDTH,
): void {
	const y = Math.min(height - 1, Math.floor(height / 2));
	ctx.fillStyle = COLORS.bg;
	ctx.fillRect(0, y, 1, 1);
	ctx.fillRect(STICKER_WIDTH - 1, y, 1, 1);
}

function keyboardFill(status: VisibleKeyStatus): string {
	if (status === "correct") return COLORS.correct;
	if (status === "present") return COLORS.present;
	return COLORS.unused;
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

function fitFont(
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

function roundRect(
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
