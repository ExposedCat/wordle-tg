import type Database from 'better-sqlite3';
import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import { BOT_TOKEN } from '../config.js';
import { GameRow, TournamentRow } from '../db.js';
import type { GuessQuality } from '../engine/guess-quality.js';
import { isGuessText, LANGUAGE_LABELS, type WordLanguage } from '../engine/language.js';
import { GameService, MAX_GUESSES, roundOrder, type TournamentRejectStatus, type UserRef } from '../game/service.js';
import { describeWordMeaning, roastBadGuess } from '../llm.js';
import { emojiPackFromStickers, escapeHtml, packNameCandidates } from '../render/emoji-pack.js';
import { renderBoardSticker, renderCompareSticker, renderKeyboardSticker } from '../render/image.js';
import {
  HELP_TEXT,
  alreadyGuessedText,
  answerMeaningSentence,
  creativityHelpText,
  giveUpText,
  hardModeViolationText,
  humanDuration,
  humanMs,
  modeHelpText,
  parseCreativityValue,
  rankLabelHtml,
  settingsText,
	statsText,
  wordMeaningSuffix,
} from './format.js';

const PEOPLE_EMOJI = '<tg-emoji emoji-id="5942877472163892475">👥</tg-emoji>';
const JOIN_EMOJI_ID = '5920090136627908485';
const QUIT_EMOJI_ID = '5922712343011135025';
const START_EMOJI_ID = '5994378304751145264';
const NOT_SO_FAST = '<tg-emoji emoji-id="5776213190387961618">⏳</tg-emoji>';
const OUT_OF_GUESSES = '<tg-emoji emoji-id="5897962422169243693">💀</tg-emoji>';
const CROWN = '<tg-emoji emoji-id="5807868868886009920">👑</tg-emoji>';
const TOURNAMENT_FINISHED = '<tg-emoji emoji-id="5942913498349571809">🏆</tg-emoji>';
const NOT_ALLOWED = '<tg-emoji emoji-id="5924719252379537729">🤔</tg-emoji>';
const TOURNAMENT_CANCELLED = '<tg-emoji emoji-id="5870734657384877785">🏳️</tg-emoji>';
const NO_ACTIVE = '<tg-emoji emoji-id="5927052244254986343">❕</tg-emoji>';
const FORBIDDEN = '<tg-emoji emoji-id="5872829476143894491">🚫</tg-emoji>';

type StyledInlineButton = {
	text: string;
	callback_data: string;
	style: 'success' | 'primary' | 'danger';
	icon_custom_emoji_id: string;
};

type StyledInlineKeyboard = {
	inline_keyboard: StyledInlineButton[][];
};

function userRef(ctx: Context): UserRef {
  const u = ctx.from!;
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Player';
  return { id: u.id, name, username: u.username, firstName: u.first_name || u.username || 'Player' };
}

function telegramUserDisplayName(user: { first_name: string; last_name?: string; username?: string }): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Player';
}

function chatDisplayName(ctx: Context): string {
  const chat = ctx.chat;
  if (!chat) return 'Chat';
  if ('title' in chat && chat.title) return chat.title;
  if ('username' in chat && chat.username) return `@${chat.username}`;
  if ('first_name' in chat) return [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'Private chat';
  return 'Chat';
}

function playerMentionHtml(player: { userId: number; userName: string; username?: string; firstName?: string }): string {
  if (player.username) return `@${player.username}`;
  const label = escapeHtml(player.firstName || player.userName);
  return `<a href="tg://user?id=${player.userId}">${label}</a>`;
}

function playerNameLinkHtml(player: { userId: number; userName: string; firstName?: string }): string {
  const label = escapeHtml(player.firstName || player.userName);
  return `<a href="tg://user?id=${player.userId}">${label}</a>`;
}

function tournamentStandingsHtml(t: TournamentRow): string {
  return [...t.players]
    .map((p) => ({ p, pts: t.scores[String(p.userId)] ?? 0 }))
    .sort((a, b) => b.pts - a.pts)
    .map((r, i) => `${rankLabelHtml(i + 1)} ${playerNameLinkHtml(r.p)} · ${r.pts}`)
    .join('\n');
}

function roundLabelHtml(t: TournamentRow): string {
  return `🏆 Round ${t.current_round}/${t.rounds}\n\n${tournamentStandingsHtml(t)}`;
}

function currentTournamentPlayer(t: TournamentRow) {
  const order = roundOrder(t.players, t.current_round);
  return order[t.turn_idx % order.length];
}

function tournamentStatusHtml(t: TournamentRow): string {
  return `${roundLabelHtml(t)}\n\nNext up ${playerMentionHtml(currentTournamentPlayer(t))}`;
}

function tournamentRejectStatusHtml(status?: TournamentRejectStatus): string {
  if (!status) return '';
  const remaining = ` ${status.remaining}/${status.limit} guesses left`;
  if (!status.forfeit) return remaining;
  return `${remaining}\n\n${NOT_SO_FAST} ${playerNameLinkHtml(status.forfeitedPlayer)} hit ${status.limit} rejected guesses and forfeits the turn.\nNext up ${playerMentionHtml(status.forfeit.nextPlayer)}`;
}

function messageThreadId(ctx: Context): number | undefined {
  const message = ctx.message ?? ctx.callbackQuery?.message;
  const threadId = (message as { message_thread_id?: unknown } | undefined)?.message_thread_id;
  return typeof threadId === 'number' ? threadId : undefined;
}

function threadOptions(ctx: Context): { message_thread_id?: number } {
  const threadId = messageThreadId(ctx);
  return threadId === undefined ? {} : { message_thread_id: threadId };
}

async function userAvatar(ctx: Context, userId: number): Promise<Buffer | undefined> {
  try {
    const photos = await ctx.api.getUserProfilePhotos(userId, { limit: 1 });
    const photo = photos.photos[0]?.at(-1);
    if (!photo) return undefined;

    const file = await ctx.api.getFile(photo.file_id);
    if (!file.file_path) return undefined;

    const path = file.file_path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`);
    if (!response.ok) return undefined;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

function storedThreadOptions(threadId: number | null): { message_thread_id?: number } {
  return threadId === null ? {} : { message_thread_id: threadId };
}

async function wordMeaning(word: string): Promise<string | undefined> {
  try {
    return await describeWordMeaning(word);
  } catch (error) {
    console.error('Failed to generate word meaning', error);
    return undefined;
  }
}

function isBelowAverageQuality(quality?: GuessQuality): quality is GuessQuality {
  return quality !== undefined && quality.possibleCount > 0 && quality.actualRemaining > quality.averageRemaining;
}

function lobbyText(t: TournamentRow): string {
  const names = t.players.length > 0 ? t.players.map(playerNameLinkHtml).join(', ') : 'No players';
  const rounds = t.rounds > 0 ? ` · ${t.rounds}` : '';
  return `${PEOPLE_EMOJI} ${names}${rounds}

Players guess in order, ${MAX_GUESSES} max guesses, faster solution gives more points!`;
}

function lobbyKeyboard(t: TournamentRow): StyledInlineKeyboard {
  return {
    inline_keyboard: [
      [
        {
          text: 'Join',
          callback_data: `t:join:${t.id}`,
          style: 'success',
          icon_custom_emoji_id: JOIN_EMOJI_ID,
        },
        {
          text: 'Start',
          callback_data: `t:start:${t.id}`,
          style: 'primary',
          icon_custom_emoji_id: START_EMOJI_ID,
        },
      ],
      [
        {
          text: 'Quit',
          callback_data: `t:quit:${t.id}`,
          style: 'danger',
          icon_custom_emoji_id: QUIT_EMOJI_ID,
        },
      ],
    ],
  };
}

export function registerHandlers(bot: Bot, db: Database.Database): void {
  const svc = new GameService(db);

  type StateMessageOptions = {
    footer?: string;
    footerHtml?: string;
    captionHtml?: boolean;
    hideKeyboard?: boolean;
  };

  async function sendStateMessage(
    ctx: Context,
    chatId: number,
    caption: string,
    boardText?: string,
    opts: StateMessageOptions = {}
  ): Promise<number | null> {
    const textParts = [caption, boardText].filter((part): part is string => Boolean(part));
    const footerParts = [opts.footer].filter((part): part is string => Boolean(part));
    const messageParts = [...textParts, ...footerParts, opts.footerHtml].filter(Boolean);

    if (messageParts.length === 0) return null;

    if (opts.footerHtml || opts.captionHtml) {
      const escaped = textParts.map((part, index) => (index === 0 && opts.captionHtml ? part : escapeHtml(part)));
      const escapedFooter = footerParts.map(escapeHtml);
      const message = await ctx.api.sendMessage(chatId, [...escaped, ...escapedFooter, opts.footerHtml].filter(Boolean).join('\n\n'), {
        ...threadOptions(ctx),
        parse_mode: 'HTML',
      });
      return message.message_id;
    }

    const message = await ctx.api.sendMessage(chatId, [...textParts, ...footerParts].join('\n\n'), threadOptions(ctx));
    return message.message_id;
  }

  async function deleteMessages(ctx: Context, chatId: number, messageIds: number[]): Promise<void> {
    for (const messageId of messageIds) {
      await ctx.api.deleteMessage(chatId, messageId).catch(() => {});
    }
  }

  async function sendBoard(
    ctx: Context,
    chatId: number,
    game: GameRow,
    caption: string,
    opts: StateMessageOptions = {}
  ): Promise<void> {
    const threadId = messageThreadId(ctx) ?? null;
    const settings = svc.settings(chatId);
    const previousMessageIds = settings.cleanup ? svc.boardMessageIds(chatId, threadId) : [];
    const sentMessageIds: number[] = [];

    await deleteMessages(ctx, chatId, previousMessageIds);

    const boardMessage = await ctx.api.sendSticker(
      chatId,
      new InputFile(renderBoardSticker(game), 'board.webp'),
      threadOptions(ctx)
    );
    sentMessageIds.push(boardMessage.message_id);
    const hideKeyboard = opts.hideKeyboard || game.status !== 'active';
    if (!hideKeyboard) {
      const keyboardMessage = await ctx.api.sendSticker(chatId, new InputFile(renderKeyboardSticker(game), 'keyboard.webp'), threadOptions(ctx));
      sentMessageIds.push(keyboardMessage.message_id);
    }
    const stateMessageId = await sendStateMessage(ctx, chatId, caption, undefined, opts);
    if (stateMessageId !== null) sentMessageIds.push(stateMessageId);

    svc.saveBoardMessageIds(chatId, threadId, sentMessageIds);
  }

  async function handleGuess(ctx: Context, word: string, opts: { silentNoGame?: boolean } = {}): Promise<void> {
    const chatId = ctx.chat!.id;
    const user = userRef(ctx);
    const out = svc.submitGuess(chatId, user, word);

    switch (out.type) {
      case 'no_game':
        if (!opts.silentNoGame) await ctx.reply(`${NO_ACTIVE} No game running here. Send /play to start one!`, { parse_mode: 'HTML' });
        return;
      case 'not_a_word':
        await ctx.reply(`${NOT_ALLOWED} "${escapeHtml(out.word.toUpperCase())}" is not allowed.${tournamentRejectStatusHtml(out.rejectStatus)}`, {
          parse_mode: 'HTML',
        });
        return;
      case 'already_guessed':
        {
          const game = svc.activeGame(chatId)!;
          const settings = svc.settings(chatId);
          await ctx.reply(alreadyGuessedText(out.word, game.answer, settings.emojiPack), { parse_mode: 'HTML' });
        }
        return;
      case 'creativity_blocked':
        await ctx.reply(
          `${FORBIDDEN} Creativity mode: ${escapeHtml(out.word.toUpperCase())} was used recently here. Try something fresh!${tournamentRejectStatusHtml(out.rejectStatus)}`,
          { parse_mode: 'HTML' }
        );
        return;
      case 'hard_mode_violation':
        await ctx.reply(
          `${hardModeViolationText(out.violation, out.superHard, svc.settings(chatId).emojiPack)}${tournamentRejectStatusHtml(out.rejectStatus)}`,
          {
            parse_mode: 'HTML',
          }
        );
        return;
      case 'ignored':
        return;
      case 'not_your_turn':
        await ctx.reply(`${NOT_SO_FAST} Not so fast — it's ${playerNameLinkHtml(out.currentPlayer)}'s turn.`, {
          parse_mode: 'HTML',
        });
        return;
    }

    const { game, guessNumber, solved, lost, tournament, duel, quality } = out;
    const lines: string[] = [];

    async function maybeRoastGuess(): Promise<void> {
      if (!svc.settings(chatId).roast || !isBelowAverageQuality(quality)) return;
      try {
        const roast = await roastBadGuess({
          playerName: user.name,
          word,
          possibleCount: quality.possibleCount,
          actualRemaining: quality.actualRemaining,
          averageRemaining: quality.averageRemaining,
        });
        if (!roast) return;
        const messageId = ctx.message?.message_id;
        await ctx.reply(roast, messageId ? { reply_parameters: { message_id: messageId } } : undefined);
      } catch (error) {
        console.error('Failed to generate guess roast', {
          error,
          chatId,
          userId: user.id,
          word: word.toUpperCase(),
          quality,
        });
      }
    }

    const finishedMeaning = solved || lost ? await wordMeaning(game.answer) : undefined;
    const finishedMeaningHtml = finishedMeaning ? escapeHtml(finishedMeaning) : undefined;

    if (lost) {
      if (duel) lines.push(`${OUT_OF_GUESSES} Out of guesses! The word stays secret until your opponent finishes.`);
      else lines.push(`${OUT_OF_GUESSES} Out of guesses! The word was ${answerMeaningSentence(game.answer, finishedMeaningHtml)}`);
    }

    if (tournament) {
      const { t, pointsAwarded, roundEnded, tournamentEnded, nextGame, nextPlayer, winners } = tournament;
      if (solved) lines.push(`🎉 ${user.name} got it in ${guessNumber}/${MAX_GUESSES} +${pointsAwarded}${wordMeaningSuffix(finishedMeaning)}`);
      const nextUpFooter = !roundEnded && nextPlayer ? `Next up ${playerMentionHtml(nextPlayer)}` : undefined;
      await sendBoard(ctx, chatId, game, lines.join('\n'), { footerHtml: nextUpFooter, captionHtml: lost, hideKeyboard: solved });
      await maybeRoastGuess();

      if (tournamentEnded) {
        const winnerNames = winners.map(playerNameLinkHtml).join(' & ');
        await ctx.reply(
          `${TOURNAMENT_FINISHED} Tournament finished!\n\n${tournamentStandingsHtml(t)}\n\n${CROWN} Winner${winners.length > 1 ? 's' : ''}: ${winnerNames}`,
          { parse_mode: 'HTML' }
        );
      } else if (roundEnded && nextGame && nextPlayer) {
        await sendBoard(ctx, chatId, nextGame, '', { footerHtml: tournamentStatusHtml(t), hideKeyboard: true });
      }
      return;
    }

    if (solved) {
      lines.push(`🎉 ${user.name} got it in ${guessNumber}/${MAX_GUESSES}${wordMeaningSuffix(finishedMeaning)}`);
    }

    if (duel) {
      await sendBoard(ctx, chatId, game, lines.join('\n'), { captionHtml: lost, hideKeyboard: solved });
      const { d, finished, bothDone } = duel;
      if (finished && !bothDone) {
        await ctx.reply('⚔️ Your board is done! I will announce the result once your opponent finishes.');
      }
      if (bothDone) {
        const winner = svc.duelWinner(d);
        const describe = (p: typeof d.challenger) =>
          p.solved ? `${p.userName}: solved in ${p.guesses}/${MAX_GUESSES} (${humanMs(p.ms!)})` : `${p.userName}: failed`;
        const verdict =
          winner === 'draw' ? "🤝 It's a draw!" : `👑 ${(winner as { userName: string }).userName} wins the duel!`;
        const summary = `⚔️ Duel finished! The word was ${answerMeaningSentence(d.answer, finishedMeaning)}\n\n${describe(d.challenger)}\n${describe(d.opponent!)}\n\n${verdict}`;
        await ctx.reply(summary);
        await ctx.api.sendMessage(d.chat_id, summary, storedThreadOptions(d.message_thread_id)).catch(() => {});
      }
      return;
    }

    await sendBoard(ctx, chatId, game, lines.join('\n'), { captionHtml: lost, hideKeyboard: solved });
    await maybeRoastGuess();
  }

  async function setDifficulty(ctx: Context, difficulty: 'normal' | 'hard' | 'superhard'): Promise<void> {
    const chatId = ctx.chat!.id;
    const s = svc.settings(chatId);
    s.difficulty = difficulty;
    svc.saveSettings(chatId, s);
    const labels = {
      normal: 'Normal',
      hard: '<tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> Hard',
      superhard: '<tg-emoji emoji-id="5282737683053980256">🔠</tg-emoji> Super-hard',
    };
    await ctx.reply(`Difficulty set to ${labels[difficulty]}`, { parse_mode: 'HTML' });
  }

  function creativityEnabledText(s: { creativity: { mode: 'time' | 'count'; seconds: number; count: number } }): string {
    const frame =
      s.creativity.mode === 'time' ? `last <b>${humanDuration(s.creativity.seconds)}</b>` : `last <b>${s.creativity.count} words</b>`;
    return `<tg-emoji emoji-id="5825794181183836432">✅</tg-emoji> Creativity mode enabled\nFrame: ${frame}`;
  }

  function tickText(text: string): string {
    return `<tg-emoji emoji-id="5825794181183836432">✅</tg-emoji> ${text}`;
  }

  function forbiddenText(text: string): string {
    return `${FORBIDDEN} ${text}`;
  }

  function playGuessInstruction(bareWord: boolean): string {
    return bareWord ? 'Send a word to guess' : 'Guess with /w [WORD]';
  }

  function autoGuessInstruction(bareWord: boolean): string {
    return bareWord ? 'Send a word to guess' : 'Use /w [WORD] to guess';
  }

  async function setLanguage(ctx: Context, language: WordLanguage): Promise<void> {
    const chatId = ctx.chat!.id;
    svc.setLanguage(chatId, language);
    const active = svc.activeGame(chatId);
    const suffix = active && active.language !== language ? `\nCurrent game stays ${LANGUAGE_LABELS[active.language]}.` : '';
    await ctx.reply(tickText(`${LANGUAGE_LABELS[language]} selected${suffix}`), { parse_mode: 'HTML' });
  }

  // ---------- commands ----------

  async function replyHelp(ctx: Context): Promise<void> {
    await ctx.reply(HELP_TEXT, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  }

  bot.command('start', async (ctx) => {
    const payload = (ctx.match ?? '').trim();
    if (payload.startsWith('duel_')) {
      const duelId = parseInt(payload.slice(5), 10);
      if (ctx.chat.type !== 'private' || !Number.isFinite(duelId)) return;
      const res = svc.acceptDuel(duelId, ctx.chat.id, userRef(ctx));
      if (res === 'not_found') return void (await ctx.reply('This duel no longer exists or is already finished.'));
      if (res === 'full') return void (await ctx.reply('This duel already has two players.'));
      if (res === 'already_playing') return void (await ctx.reply('You already played your board for this duel.'));
      if (res === 'own_game_running') return void (await ctx.reply('Finish your current game here first (/giveup to abandon it).'));
      await ctx.reply('⚔️ Duel on! Same word as your opponent, 6 tries. Just type your 5-letter guesses.');
      await sendBoard(ctx, ctx.chat.id, res.game, 'Your duel board:');
      return;
    }
    await replyHelp(ctx);
  });

  bot.command('help', (ctx) => replyHelp(ctx));

  bot.command('en', (ctx) => setLanguage(ctx, 'en'));
  bot.command('ru', (ctx) => setLanguage(ctx, 'ru'));

  bot.command('auto', async (ctx) => {
    const s = svc.settings(ctx.chat.id);
    s.bareWord = !s.bareWord;
    svc.saveSettings(ctx.chat.id, s);
    const text = `Guess without /w ${s.bareWord ? 'enabled' : 'disabled'}\n${autoGuessInstruction(s.bareWord)}`;
    await ctx.reply(s.bareWord ? tickText(text) : forbiddenText(text), { parse_mode: 'HTML' });
  });

  bot.command('cleanup', async (ctx) => {
    const s = svc.settings(ctx.chat.id);
    s.cleanup = !s.cleanup;
    svc.saveSettings(ctx.chat.id, s);
    const text = `Cleanup ${s.cleanup ? 'enabled' : 'disabled'}\nPrevious boards will ${s.cleanup ? '' : 'not '}be removed when a new board is posted`;
    await ctx.reply(s.cleanup ? tickText(text) : forbiddenText(text), { parse_mode: 'HTML' });
  });

  bot.command('roast', async (ctx) => {
    const s = svc.settings(ctx.chat.id);
    s.roast = !s.roast;
    svc.saveSettings(ctx.chat.id, s);
    const text = `Roasts ${s.roast ? 'enabled' : 'disabled'}\nBelow-average guesses will ${s.roast ? '' : 'not '}get one LLM roast`;
    await ctx.reply(s.roast ? tickText(text) : forbiddenText(text), { parse_mode: 'HTML' });
  });

  bot.command('usepack', async (ctx) => {
    const requestedName = (ctx.match ?? '').trim();
    if (!requestedName) {
      return void (await ctx.reply('Usage: /usepack name'));
    }

    let lastError: unknown = null;
    for (const packName of packNameCandidates(requestedName, ctx.me.username)) {
      try {
        const stickerSet = await ctx.api.getStickerSet(packName);
        if (stickerSet.sticker_type !== 'custom_emoji') {
          return void (await ctx.reply(`${packName} is not a custom emoji pack.`));
        }

        const s = svc.settings(ctx.chat.id);
        s.emojiPack = emojiPackFromStickers(packName, stickerSet.stickers);
        svc.saveSettings(ctx.chat.id, s);
        await ctx.reply(`${tickText('Custom emoji pack enabled')}\nPack: https://t.me/addemoji/${packName}`, {
          parse_mode: 'HTML',
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    await ctx.reply(`Could not use emoji pack: ${message}`);
  });

  bot.command('play', async (ctx) => {
    const chatId = ctx.chat.id;
    const t = svc.openTournament(chatId);
    if (t) return void (await ctx.reply('A tournament is open in this chat — finish it with /giveup first.'));
    const game = svc.startGame(chatId);
    if (!game) return void (await ctx.reply('A game is already running! Check /board or /giveup to abandon it.'));
    const s = svc.settings(chatId);
    await sendBoard(ctx, chatId, game, `${playGuessInstruction(s.bareWord)}`);
  });

  bot.command('w', async (ctx) => {
    const word = (ctx.match ?? '').trim();
    if (!isGuessText(word)) {
      return void (await ctx.reply('Usage: /w WORD (a 5-letter word)'));
    }
    await handleGuess(ctx, word);
  });

  bot.command('board', async (ctx) => {
    const chatId = ctx.chat.id;
    const game = svc.activeGame(chatId);
    const t = svc.openTournament(chatId);
    if (!game) {
      if (t && t.status === 'joining') return void (await ctx.reply(lobbyText(t), { parse_mode: 'HTML', reply_markup: lobbyKeyboard(t) }));
      return void (await ctx.reply(`${NO_ACTIVE} No active game. Send /play to start one!`, { parse_mode: 'HTML' }));
    }
    if (t && t.status === 'active') {
      await sendBoard(ctx, chatId, game, '', { footerHtml: tournamentStatusHtml(t), hideKeyboard: true });
      return;
    }
    await sendBoard(ctx, chatId, game, '');
  });

  bot.command('giveup', async (ctx) => {
    const res = svc.giveUp(ctx.chat.id);
    if (!res) return void (await ctx.reply(`${NO_ACTIVE} No active game or tournament to give up.`, { parse_mode: 'HTML' }));
    const meaning = res.answer ? await wordMeaning(res.answer) : undefined;
    const msg = res.answer
      ? `${giveUpText(res.answer, meaning ? escapeHtml(meaning) : undefined)}${res.tournamentCancelled ? `\n\n${TOURNAMENT_CANCELLED} Tournament cancelled.` : ''}`
      : `${TOURNAMENT_CANCELLED} Tournament cancelled.`;
    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.command('stats', async (ctx) => {
    const user = userRef(ctx);
    const row = svc.statsFor(ctx.chat.id, user.id);
    await ctx.reply(statsText(row, user.name, chatDisplayName(ctx)), { parse_mode: 'HTML' });
  });

  bot.command('compare', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = userRef(ctx);
    const arg = (ctx.match ?? '').trim();
    const repliedUser = ctx.message?.reply_to_message?.from;

    let target:
      | {
          userId: number;
          name: string;
          stats: ReturnType<GameService['statsFor']>;
        }
      | null = null;

    if (!arg && repliedUser) {
      target = {
        userId: repliedUser.id,
        name: telegramUserDisplayName(repliedUser),
        stats: svc.statsFor(chatId, repliedUser.id),
      };
    } else if (arg) {
      const row = svc.findStatsByName(chatId, arg);
      if (!row) {
        return void (await ctx.reply('I do not know that player yet. Reply to one of their messages, or use the name they played under.'));
      }
      target = { userId: row.user_id, name: row.name || `User ${row.user_id}`, stats: row };
    }

    if (!target) {
      return void (await ctx.reply('Usage: reply with /compare, or use /compare NAME'));
    }
    if (target.userId === user.id) {
      return void (await ctx.reply('Pick someone else to compare with.'));
    }

    const [userPhoto, targetPhoto] = await Promise.all([userAvatar(ctx, user.id), userAvatar(ctx, target.userId)]);
    await ctx.api.sendSticker(
      chatId,
      new InputFile(
        await renderCompareSticker(
          { name: user.name, stats: svc.statsFor(chatId, user.id), avatar: userPhoto },
          { name: target.name, stats: target.stats, avatar: targetPhoto }
        ),
        'compare.webp'
      ),
      threadOptions(ctx)
    );
  });

  bot.command('global', async (ctx) => {
    const user = userRef(ctx);
    const row = svc.globalStatsFor(user.id);
    await ctx.reply(statsText(row, user.name, 'All chats'), { parse_mode: 'HTML' });
  });

  bot.command('creativity', async (ctx) => {
    const chatId = ctx.chat.id;
    const arg = (ctx.match ?? '').trim();
    const s = svc.settings(chatId);

    if (!arg) {
      if (s.creativity.enabled) {
        s.creativity.enabled = false;
        svc.saveSettings(chatId, s);
        return void (
          await ctx.reply(forbiddenText('Creativity mode disabled'), {
            parse_mode: 'HTML',
          })
        );
      }

      if (!s.creativity.configured) {
        return void (await ctx.reply('Set a frame first: /creativity 30m or /creativity 15w'));
      }

      s.creativity.enabled = true;
      svc.saveSettings(chatId, s);
      return void (await ctx.reply(creativityEnabledText(s), { parse_mode: 'HTML' }));
    }

    const parsed = parseCreativityValue(arg);
    if (!parsed) {
      return void (await ctx.reply('Usage: /creativity 30m  |  /creativity 15w'));
    }

    s.creativity.enabled = true;
    s.creativity.configured = true;
    if ('seconds' in parsed) {
      s.creativity.mode = 'time';
      s.creativity.seconds = parsed.seconds;
    } else {
      s.creativity.mode = 'count';
      s.creativity.count = parsed.count;
    }
    svc.saveSettings(chatId, s);

    await ctx.reply(creativityEnabledText(s), { parse_mode: 'HTML' });
  });

  bot.command('normal', async (ctx) => setDifficulty(ctx, 'normal'));
  bot.command('hard', async (ctx) => setDifficulty(ctx, 'hard'));
  bot.command('superhard', async (ctx) => setDifficulty(ctx, 'superhard'));
  bot.command('mode_help', async (ctx) => ctx.reply(modeHelpText(svc.settings(ctx.chat.id)), { parse_mode: 'HTML' }));
  bot.command('creativity_help', async (ctx) =>
    ctx.reply(creativityHelpText(svc.settings(ctx.chat.id)), { parse_mode: 'HTML' })
  );

  bot.command('settings', async (ctx) => {
    const chatId = ctx.chat.id;
    const args = (ctx.match ?? '').trim().toLowerCase();
    if (args) {
      return void (await ctx.reply('Usage: /settings'));
    }
    await ctx.reply(settingsText(svc.settings(chatId)), { parse_mode: 'HTML' });
  });

  bot.command('fails', async (ctx) => {
    const chatId = ctx.chat.id;
    const value = (ctx.match ?? '').trim().toLowerCase();
    if (!value) {
      return void (await ctx.reply('Usage: /fails N  |  /fails off'));
    }

    const s = svc.settings(chatId);
    if (value === 'off' || value === 'unlimited') {
      s.tournamentMaxFails = null;
    } else {
      const n = parseInt(value, 10);
      if (!/^\d+$/.test(value) || n <= 0) {
        return void (await ctx.reply('Usage: /fails N, where N is a positive number, or /fails off'));
      }
      s.tournamentMaxFails = n;
    }
    svc.saveSettings(chatId, s);
    const label = s.tournamentMaxFails === null ? 'off (unlimited)' : `${s.tournamentMaxFails}`;
    await ctx.reply(tickText(`Tournament max-fails set to ${label}`), { parse_mode: 'HTML' });
  });

  bot.command('tournament', async (ctx) => {
    const chatId = ctx.chat.id;
    const arg = (ctx.match ?? '').trim().toLowerCase();
    if (arg && !/^\d+$/.test(arg)) return void (await ctx.reply('Usage: /tournament [N]. Use /giveup to end an open tournament.'));
    const existing = svc.openTournament(chatId);
    if (existing) {
      if (existing.status === 'joining')
        return void (await ctx.reply(lobbyText(existing), { parse_mode: 'HTML', reply_markup: lobbyKeyboard(existing) }));
      return void (await ctx.reply(tournamentStandingsHtml(existing), { parse_mode: 'HTML' }));
    }
    const parsedRounds = parseInt(arg, 10);
    const rounds = Number.isFinite(parsedRounds) && parsedRounds >= 1 && parsedRounds <= 25 ? parsedRounds : 0;
    if (svc.activeGame(chatId)) return void (await ctx.reply('Finish the current game first (/giveup to abandon it).'));
    const t = svc.createTournament(chatId, rounds, userRef(ctx));
    if (!t) return void (await ctx.reply('Could not create a tournament right now.'));
    await ctx.reply(lobbyText(t), { parse_mode: 'HTML', reply_markup: lobbyKeyboard(t) });
  });

  bot.command('challenge', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return void (await ctx.reply('Use /challenge in a group — that is where I announce the winner!'));
    }
    const user = userRef(ctx);
    const d = svc.createDuel(ctx.chat.id, user, messageThreadId(ctx) ?? null);
    const link = `https://t.me/${ctx.me.username}?start=duel_${d.id}`;
    await ctx.reply(
      `⚔️ ${user.name} challenges the chat to a duel!\n\nSame secret word for both players, ${MAX_GUESSES} tries each in a private chat with me. Fewest guesses wins; speed breaks ties.\n\nFirst person to tap becomes the opponent. ${user.name}, tap too to play your board!`,
      { reply_markup: new InlineKeyboard().url('⚔️ Play the duel', link) }
    );
  });

  // ---------- callbacks ----------

  bot.callbackQuery(/^t:join:(\d+)$/, async (ctx) => {
    const res = svc.joinTournament(parseInt(ctx.match[1], 10), userRef(ctx));
    if (!res || res === 'closed') return void (await ctx.answerCallbackQuery('This tournament is not open for joining.'));
    if (res === 'already_in') return void (await ctx.answerCallbackQuery('You are already in!'));
    await ctx.editMessageText(lobbyText(res), { parse_mode: 'HTML', reply_markup: lobbyKeyboard(res) });
    await ctx.answerCallbackQuery('Joined! 🏆');
  });

  bot.callbackQuery(/^t:quit:(\d+)$/, async (ctx) => {
    const res = svc.quitTournament(parseInt(ctx.match[1], 10), ctx.from.id);
    if (!res || res === 'closed') return void (await ctx.answerCallbackQuery('This tournament is not open for joining.'));
    if (res === 'not_in') return void (await ctx.answerCallbackQuery('You are not in this tournament.'));
    if (res.status === 'cancelled') {
      await ctx.editMessageText(`${TOURNAMENT_CANCELLED} Tournament cancelled.`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
      });
      return void (await ctx.answerCallbackQuery('Quit. Tournament cancelled.'));
    }
    await ctx.editMessageText(lobbyText(res), { parse_mode: 'HTML', reply_markup: lobbyKeyboard(res) });
    await ctx.answerCallbackQuery('Quit.');
  });

  bot.callbackQuery(/^t:start:(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    const t = svc.openTournament(ctx.chat!.id);
    if (!t || t.id !== id) return void (await ctx.answerCallbackQuery('This tournament is no longer open.'));
    if (t.created_by !== ctx.from.id) return void (await ctx.answerCallbackQuery('Only the creator can start it.'));
    const res = svc.startTournament(id);
    if (res === 'too_few') return void (await ctx.answerCallbackQuery('Need at least 2 players!'));
    if (!res) return void (await ctx.answerCallbackQuery('Could not start the tournament.'));
    await ctx.answerCallbackQuery('Game on!');
    await ctx.editMessageText(lobbyText(res.t), { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
    await sendBoard(ctx, ctx.chat!.id, res.game, '', { footerHtml: tournamentStatusHtml(res.t), hideKeyboard: true });
  });

  // ---------- bare-word guessing ----------

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    if (!isGuessText(text)) return;
    if (!svc.settings(ctx.chat.id).bareWord) return;
    await handleGuess(ctx, text, { silentNoGame: true });
  });
}
