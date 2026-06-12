import { type Canvas, createCanvas } from "@gfx/canvas";
import type { GameRow } from "../app/data.ts";
import {
	anchorStickerWidth,
	COLORS,
	encodeSticker,
	FONT,
	roundRect,
	STICKER_HEIGHT,
	STICKER_WIDTH,
} from "./canvas.ts";
import { maxGuessesForGame } from "./guess.ts";
import { LANGUAGE_KEY_ROWS } from "./language.ts";
import {
	type KeyStatus,
	keyboardStatus,
	scoreGuess,
	type TileStatus,
} from "./score.ts";

const TILE = 62;
const TILE_GAP = 6;
const PAD = 24;

const KEY_W = 42;
const KEY_H = 54;
const KEY_GAP = 6;
const KEY_ROW_GAP = 8;
const STICKER_PAD_Y = 18;

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

function keyboardFill(status: VisibleKeyStatus): string {
	if (status === "correct") return COLORS.correct;
	if (status === "present") return COLORS.present;
	return COLORS.unused;
}
