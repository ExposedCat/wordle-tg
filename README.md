# telewordle

A Wordle bot for Telegram groups. Random 3-10 letter word, 6 tries, the whole chat plays together — with sticker or text boards, tournaments, duels, hard/super-hard difficulty, LLM roasts for bad guesses, and a "creativity mode" that bans recently used words.

When `OPENAI_API_KEY` is configured, finished games append a concise LLM-generated meaning after the revealed or completed word. If `/roast` is enabled, below-average guesses get a one-sentence LLM roast in reply.

## Quick start

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy the token.
2. ```sh
   cp .env.example .env   # paste your BOT_TOKEN
   npm install
   npm start
   ```
3. Add the bot to a group and send `/wordle`.

> **Bare-word guessing in groups** (typing `crane` instead of `/w crane`) requires the bot to see normal messages: either disable privacy mode in @BotFather (`/setprivacy` → Disable) **before** adding the bot to the group, or make the bot a group admin.

## Commands

| Command | What it does |
|---|---|
| `/wordle` | Start a new game (random word, 6 tries, shared board) |
| `/w WORD` | Submit a guess |
| `/length N` | Select word length for new games (3-10, default 5) |
| `/auto` | Toggle bare-word guessing in this chat |
| `/cleanup` | Toggle removal of the previous board, keyboard, and status message |
| `/roast` | Toggle LLM roasts for below-average guesses |
| `/board` | Show the current board (and tournament standings) |
| `/stop` | Abandon the game and reveal the word, or cancel an open tournament |
| `/profile` | Your stats in this chat |
| `/global` | Your stats across all chats |
| `/round [N]` | Start a turn-based tournament |
| `/duel` | Duel: same word for two players, fewest guesses wins |
| `/usepack NAME` | Use an existing custom emoji pack for this chat |
| `/creativity` | Toggle recent-word bans, or configure them with a frame |
| `/normal` | Set normal mode |
| `/hard` | Set hard mode |
| `/superhard` | Set super hard mode |
| `/mode_help` | Show mode details |
| `/creativity_help` | Show creativity details |
| `/settings` | Per-chat settings (see below) |
| `/fails N` | Set tournament rejected-guess limit per turn (`off` = unlimited) |
| `/timer 90s` | Set tournament max time per turn (`/timer` with no args disables it) |
| `/help` | How to play |

## Settings (`/settings`, per chat)

- **Word length** (default **5**) — set with `/length N`, where `N` is 3-10. Active games keep the length they started with; new games use the selected length.
- **Bare-word guessing** (default **off**) — toggle with `/auto`. When on, any message that matches the current game or selected word length counts as a guess. Unknown words get a "not in my dictionary" notice.
- **Cleanup** (default **off**) — toggle with `/cleanup`. When on, each newly posted board removes the previous board sticker, keyboard sticker, and status message in the same chat/topic.
- **Roasts** (default **off**) — toggle with `/roast`. When on and `OPENAI_API_KEY` is configured, guesses that leave more words than the current average get a one-sentence roast in reply.
- **Board** — classic Wordle board as a WebP sticker, followed by a centered WebP keyboard sticker with absent letters hidden. Result/status text is sent afterward only when needed:
  ```
  T R A C E
  🟨🟨🟨⬛🟨

  🟩GL  🟨N  ◻️QWRYIO…
  ```
- **Emoji pack** — `/usepack NAME` selects an existing custom emoji pack for this chat. `NAME` can be the base name, full pack name, or `https://t.me/addemoji/...` link.
- **Tournament max-fails** (default **5**) — rejected attempts by the current tournament player (unknown word, hard-mode violation, or creativity violation) count toward the per-turn limit. Hitting it forfeits the turn to the next player. Configure with `/fails N`, or `/fails off` for unlimited.
- **Tournament turn timer** (default **off**) — active tournament turns can be limited with `/timer 90s` or `/timer 2m`. The bot reminds the player halfway through timers longer than a minute, again when 90% elapsed, and forfeits the turn when time runs out. Send `/timer` with no args to disable it.
- **Difficulty** (default **normal**) — set with `/normal`, `/hard`, or `/superhard`.
  - **hard** — every revealed green/yellow hint must be used in all later guesses.
  - **super hard** — hard, plus gray letters can't be played again and known letter counts are enforced. You must use *all* information you have.
- **Creativity mode** (default **off, not configured**) — words used recently in this chat (guesses *and* answers) are banned from being guessed and from being picked as the answer. Configure it with a time window or word count; `/creativity` toggles the saved frame:
  ```
  /creativity 30m        # s / m / h / d
  /creativity 15w        # last 15 words
  ```

## Tournaments

`/round 3` opens a lobby (join via button, creator presses Start). Use `/stop` to cancel an open or active tournament. Players guess strictly in turn order, and the order rotates every round so nobody is always first. Too many rejected attempts on a turn forfeits that turn, based on `/fails`. Solving the word scores points by how early it fell: guess #1 = 6 pts … guess #6 = 1 pt. After the last round the bot posts the scoreboard and the winner.

## Duels

`/duel` in a group posts a button with a deep link. The challenger and the first taker each play the **same secret word** privately with the bot; fewest guesses wins, speed breaks ties. The result (and the word) is announced back in the group.

## Stats

Per user, per chat: games played/won, win rate, winning guesses, current/best streak, fastest solve, total guesses, average words left after a guess, guess quality points, green/yellow letter accuracy, winning-guess distribution, tournament games/wins/points, duel record.

## Word lists

Word lists live in `data/{en,ru}-{3..10}.json`. Each file contains `valid` accepted guesses and frequency-ordered `possible` answer words for that language and length.

```sh
python -m pip install wordfreq
python scripts/generate-wordfreq-json.py
```

The generator refreshes those JSON files from wordfreq's `large` list, with up to the top 15k `possible` answer words per language and length.

## Development

```sh
npm test                 # engine + game-logic test suite (vitest)
npm run dev              # run with auto-reload
npm run build            # type-check and compile to dist/
npm run render:sample    # render sample board + keyboard images to /tmp
```

Stack: TypeScript, [grammY](https://grammy.dev) (long polling — no public URL needed), better-sqlite3, @napi-rs/canvas.

## Docker

```sh
docker build -f Containerfile -t telewordle .
docker run -d --name telewordle -e BOT_TOKEN=123:abc -v telewordle-data:/data telewordle
```

Or with Compose:

```sh
docker compose up -d --build
```
