import type { TournamentRow } from "../app/data.ts";
import { text as defaultText } from "../bot/i18n.ts";
import { rankLabelHtml } from "../bot/rank.ts";
import { roundOrder } from "./rules.ts";

export function standingsText(tournament: TournamentRow): string {
	const rows = [...tournament.players]
		.map((player) => ({
			player,
			points: tournament.scores[String(player.userId)] ?? 0,
		}))
		.sort((left, right) => right.points - left.points)
		.map((standing, index) =>
			defaultText("format.standingsPoints", {
				rank: rankLabelHtml(index + 1),
				player: standing.player.userName,
				points: standing.points,
			}),
		);
	return rows.join("\n");
}

export function turnOrderText(tournament: TournamentRow): string {
	return roundOrder(tournament.players, tournament.current_round)
		.map((player) => player.userName)
		.join(" → ");
}
