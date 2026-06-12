import type { TournamentRow } from "../app/data.ts";
import { humanTurnTime } from "../bot/format.ts";
import { text as defaultText } from "../bot/i18n.ts";
import { rankLabelHtml } from "../bot/rank.ts";
import { escapeHtml } from "../game/emoji-pack.ts";
import { MAX_GUESSES } from "../game/guess.ts";
import type { TournamentRejectStatus } from "../game/service.ts";
import { roundOrder } from "./rules.ts";

type StyledInlineButton = {
	text: string;
	callback_data: string;
	style: "success" | "primary" | "danger";
	icon_custom_emoji_id: string;
};

export type StyledInlineKeyboard = {
	inline_keyboard: StyledInlineButton[][];
};

export function playerMentionHtml(player: {
	userId: number;
	userName: string;
	username?: string;
	firstName?: string;
}): string {
	if (player.username) return `@${player.username}`;
	const label = escapeHtml(player.firstName || player.userName);
	return `<a href="tg://user?id=${player.userId}">${label}</a>`;
}

export function playerNameLinkHtml(player: {
	userId: number;
	userName: string;
	firstName?: string;
}): string {
	const label = escapeHtml(player.firstName || player.userName);
	return `<a href="tg://user?id=${player.userId}">${label}</a>`;
}

export function tournamentStandingsHtml(tournament: TournamentRow): string {
	return [...tournament.players]
		.map((player) => ({
			player,
			points: tournament.scores[String(player.userId)] ?? 0,
		}))
		.sort((left, right) => right.points - left.points)
		.map(
			(standing, index) =>
				`${rankLabelHtml(index + 1)} ${playerNameLinkHtml(standing.player)} · ${standing.points}`,
		)
		.join("\n");
}

function roundLabelHtml(tournament: TournamentRow): string {
	return defaultText("tournament.roundStatus", {
		round: tournament.current_round,
		rounds: tournament.rounds,
		standings: tournamentStandingsHtml(tournament),
	});
}

export function currentTournamentPlayer(tournament: TournamentRow) {
	const turnOrder = roundOrder(tournament.players, tournament.current_round);
	return turnOrder[tournament.turn_idx % turnOrder.length];
}

export function tournamentStatusHtml(tournament: TournamentRow): string {
	return defaultText("tournament.status", {
		roundLabel: roundLabelHtml(tournament),
		player: playerMentionHtml(currentTournamentPlayer(tournament)),
	});
}

export function tournamentRejectStatusHtml(
	status?: TournamentRejectStatus,
): string {
	if (!status) return "";
	const remaining = defaultText("tournament.rejectRemaining", {
		remaining: status.remaining,
		limit: status.limit,
	});
	if (!status.forfeit) return remaining;
	return defaultText("tournament.rejectForfeit", {
		remaining,
		player: playerNameLinkHtml(status.forfeitedPlayer),
		limit: status.limit,
		nextPlayer: playerMentionHtml(status.forfeit.nextPlayer),
	});
}

export function tournamentTimerReminderHtml(
	player: TournamentRow["players"][number],
	secondsLeft: number,
): string {
	return defaultText("tournament.timerReminder", {
		player: playerNameLinkHtml(player),
		time: humanTurnTime(secondsLeft),
	});
}

export function tournamentTimerExpiredHtml(
	expiredPlayer: TournamentRow["players"][number],
	nextPlayer: TournamentRow["players"][number],
): string {
	return defaultText("tournament.timerExpired", {
		player: playerNameLinkHtml(expiredPlayer),
		nextPlayer: playerMentionHtml(nextPlayer),
	});
}

export function lobbyText(tournament: TournamentRow): string {
	const names =
		tournament.players.length > 0
			? tournament.players.map(playerNameLinkHtml).join(", ")
			: defaultText("partial.noPlayers");
	const rounds = tournament.rounds > 0 ? ` · ${tournament.rounds}` : "";
	return defaultText("tournament.lobby", {
		players: names,
		rounds,
		maxGuesses: MAX_GUESSES,
	});
}

export function lobbyKeyboard(tournament: TournamentRow): StyledInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: defaultText("tournament.buttonJoin"),
					callback_data: `t:join:${tournament.id}`,
					style: "success",
					icon_custom_emoji_id: "5920090136627908485",
				},
				{
					text: defaultText("tournament.buttonStart"),
					callback_data: `t:start:${tournament.id}`,
					style: "primary",
					icon_custom_emoji_id: "5994378304751145264",
				},
			],
			[
				{
					text: defaultText("tournament.buttonQuit"),
					callback_data: `t:quit:${tournament.id}`,
					style: "danger",
					icon_custom_emoji_id: "5922712343011135025",
				},
			],
		],
	};
}
