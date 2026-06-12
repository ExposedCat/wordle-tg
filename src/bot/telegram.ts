import type { Context } from "../bot.ts";
import { BOT_TOKEN } from "../config.ts";
import type { UserRef } from "../game/service.ts";

export function userRef(context: Context): UserRef {
	const telegramUser = context.from!;
	const name =
		[telegramUser.first_name, telegramUser.last_name]
			.filter(Boolean)
			.join(" ") ||
		telegramUser.username ||
		context.t("partial.player");
	return {
		id: telegramUser.id,
		name,
		username: telegramUser.username,
		firstName: telegramUser.first_name || telegramUser.username || "Player",
	};
}

export function telegramUserDisplayName(user: {
	first_name: string;
	last_name?: string;
	username?: string;
}): string {
	return (
		[user.first_name, user.last_name].filter(Boolean).join(" ") ||
		user.username ||
		"Player"
	);
}

export function chatDisplayName(context: Context): string {
	const chat = context.chat;
	if (!chat) return context.t("partial.chat");
	if ("title" in chat && chat.title) return chat.title;
	if ("username" in chat && chat.username) return `@${chat.username}`;
	if ("first_name" in chat)
		return (
			[chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
			context.t("partial.privateChat")
		);
	return context.t("partial.chat");
}

export function messageThreadId(context: Context): number | undefined {
	const message = context.message ?? context.callbackQuery?.message;
	const threadId = (message as { message_thread_id?: unknown } | undefined)
		?.message_thread_id;
	return typeof threadId === "number" ? threadId : undefined;
}

export function threadOptions(context: Context): {
	message_thread_id?: number;
} {
	const threadId = messageThreadId(context);
	return threadId === undefined ? {} : { message_thread_id: threadId };
}

export function storedThreadOptions(threadId: number | null): {
	message_thread_id?: number;
} {
	return threadId === null ? {} : { message_thread_id: threadId };
}

export async function userAvatar(
	context: Context,
	userId: number,
): Promise<Uint8Array | undefined> {
	try {
		const photos = await context.api.getUserProfilePhotos(userId, { limit: 1 });
		const photo = photos.photos[0]?.at(-1);
		if (!photo) return undefined;

		const file = await context.api.getFile(photo.file_id);
		if (!file.file_path) return undefined;

		const path = file.file_path.split("/").map(encodeURIComponent).join("/");
		const response = await fetch(
			`https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`,
		);
		if (!response.ok) return undefined;
		return new Uint8Array(await response.arrayBuffer());
	} catch {
		return undefined;
	}
}
