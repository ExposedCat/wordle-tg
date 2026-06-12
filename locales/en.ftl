command =
    .wordle = Start a new game
    .personal = Start your own game in this chat
    .daily = Start today's daily word
    .w = Guess the current word
    .explain = Explain a replied word
    .length = Set word length
    .auto = Toggle bare-word guessing
    .cleanup = Toggle old board cleanup
    .roast = Roast a word or toggle bad-guess roasts
    .board = Show the current board
    .stop = End the game or open tournament
    .profile = Your stats in this chat
    .compare = Compare stats with another player
    .global = Your stats across all chats
    .round = Start a turn-based tournament
    .fails = Set tournament rejected-guess limit
    .timer = Set tournament turn timer
    .usepack = Use an existing custom emoji pack
    .creativity = Toggle or configure recent-word bans
    .normal = Set normal mode
    .hard = Set hard mode
    .superhard = Set super hard mode
    .mode_help = Mode details
    .creativity_help = Creativity details
    .settings = Chat settings
    .help = How to play

partial =
    .player = Player
    .chat = Chat
    .privateChat = Private chat
    .on = on
    .off = off
    .not = not
    .enabled = enabled
    .disabled = disabled
    .na = n/a
    .noPlayers = No players
    .words = words
    .wordFrame = word frame
    .timeFrame = time frame
    .normal = Normal
    .hard = Hard
    .superhard = Super-hard
    .difficultyNormal = 😎 normal
    .difficultyHard = 😤 hard
    .difficultySuperhard = 🔥 super hard
    .difficultyHardLabel = <tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> Hard
    .difficultySuperhardLabel = <tg-emoji emoji-id="5282737683053980256">🔠</tg-emoji> Super-hard
    .oneshotEasy = easy
    .oneshotNormal = normal
    .oneshotHard = hard
    .oneshotExpert = expert

game =
    .tournamentOpen = A tournament is open in this chat — finish it with /stop first.
    .gameAlreadyRunning = A game is already running! Check /board or /stop to abandon it.
    .personalAlreadyRunning = You already have a personal game running! Check /board or /stop to abandon it.
    .personalLetters = { $length } letters
    .dailyFetchFailed = Could not fetch today's Wordle. Try again in a bit.
    .dailyAlreadyDone = Daily word <tg-emoji emoji-id="5843799474362652262">▶️</tg-emoji> { $word } was already guessed!
    .oneshotUsage = Usage: /oneshot [easy|normal|hard|expert]
    .oneshotDifficultySet = One-shot difficulty set to { $difficulty }
    .oneshotNoPuzzle = Could not find a one-shot puzzle for the current settings. Try another length or mode.
    .oneshotCaption = <tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> One-shot { $mode } · { $length } letters
    .guessUsage = Usage: /w WORD (a { $length }-letter word)
    .noActiveBoard = No active game. Send /wordle to start one!
    .noActiveStop = No active game or tournament to give up.
    .dailyStopped = <tg-emoji emoji-id="5870734657384877785">🏳️</tg-emoji> Daily game stopped. The word stays hidden.
    .tournamentCancelled = <tg-emoji emoji-id="5870734657384877785">🏳️</tg-emoji> Tournament cancelled.
    .explainUsage = Reply to a single word with /explain.
    .explainUnavailable = Could not explain { $word } right now.
    .roastUsage = Reply to a single word with /roast, or send /roast WORD.
    .roastUnavailable = Could not roast { $word } right now.
    .noGameGuess = <tg-emoji emoji-id="5927052244254986343">❕</tg-emoji> No game running here. Send /wordle to start one!
    .notAllowed = <tg-emoji emoji-id="5924719252379537729">🤔</tg-emoji> "{ $word }" is not allowed.{ $rejectStatus }
    .creativityBlocked = <tg-emoji emoji-id="5872829476143894491">🚫</tg-emoji> Creativity mode: { $word } was used recently here. Try something fresh!{ $rejectStatus }
    .notYourTurn = <tg-emoji emoji-id="5776213190387961618">⏳</tg-emoji> Not so fast — it's { $player }'s turn.
    .outOfGuessesAnswer = <tg-emoji emoji-id="5897962422169243693">💀</tg-emoji> Out of guesses! The word was { $answer }
    .tournamentSolved = 🎉 { $player } got it in { $guessNumber }/{ $maxGuesses } +{ $points }. { $answer }
    .solved = 🎉 { $player } got it in { $guessNumber }/{ $maxGuesses }. { $answer }
    .nextUp = Next up { $player }
    .tournamentFinished = <tg-emoji emoji-id="5942913498349571809">🏆</tg-emoji> Tournament finished!
        
        { $standings }
        
        <tg-emoji emoji-id="5807868868886009920">👑</tg-emoji> Winner{ $plural }: { $winners }
preferences =
    .auto = Guess without /w { $state }
        { $instruction }
    .cleanup = Cleanup { $state }
        Previous unsolved boards will { $not }be removed when a new board is posted
    .roast = Roasts { $state }
        Below-average guesses will { $not }get one LLM roast
    .usepackUsage = Usage: /usepack name
    .packNotCustomEmoji = { $packName } is not a custom emoji pack.
    .packEnabled = Custom emoji pack enabled
        Pack: https://t.me/addemoji/{ $packName }
    .packFailed = Could not use emoji pack: { $message }
    .creativityDisabled = Creativity mode disabled
    .creativityNeedsFrame = Set a frame first: /creativity 30m or /creativity 15w
    .creativityEnabled = Creativity mode enabled
        Frame: { $frame }
    .creativityUsage = Usage: /creativity 30m  |  /creativity 15w
    .difficultySet = Difficulty set to { $label }
    .languageSelected = { $language } selected{ $suffix }
    .currentGameLanguage = 
        Current game stays { $language }.
    .lengthUsage = Usage: /length N, where N is { $min }-{ $max }
    .lengthSet = Word length set to { $length }{ $suffix }
    .currentGameLength = 
        Current game stays { $length } letters.
    .playInstructionBare = Send a { $length }-letter word to guess
    .playInstructionCommand = Guess with /w [{ $length }-letter word]
    .autoInstructionCommand = Use /w [{ $length }-letter word] to guess

tournament =
    .lobby = <tg-emoji emoji-id="5942877472163892475">👥</tg-emoji> { $players }{ $rounds }
        
        Players guess in order, { $maxGuesses } max guesses, faster solution gives more points!
    .buttonJoin = Join
    .buttonStart = Start
    .buttonQuit = Quit
    .roundStatus = 🏆 Round { $round }/{ $rounds }
        
        { $standings }
    .status = { $roundLabel }
        
        Next up { $player }
    .rejectRemaining =  { $remaining }/{ $limit } guesses left
    .rejectForfeit = { $remaining }
        
        <tg-emoji emoji-id="5776213190387961618">⏳</tg-emoji> { $player } hit { $limit } rejected guesses and forfeits the turn.
        Next up { $nextPlayer }
    .timerReminder = <tg-emoji emoji-id="5778550614669660455">⏰</tg-emoji> { $player }, { $time } left on your turn!
    .timerExpired = <tg-emoji emoji-id="5778550614669660455">⏰</tg-emoji> { $player } ran out of time.
        Next up { $nextPlayer }
    .failsUsage = Usage: /fails N  |  /fails off
    .failsValueUsage = Usage: /fails N, where N is a positive number, or /fails off
    .failsSet = Tournament max-fails set to { $value }
    .unlimitedOff = off (unlimited)
    .timerDisabled = Tournament turn timer disabled
    .timerUsage = Usage: /timer 90s  |  /timer 2m
        Send /timer with no value to disable it.
    .timerSet = Tournament turn timer set to { $time }
    .roundUsage = Usage: /round [N]. Use /stop to end an open tournament.
    .finishGameFirst = Finish the current game first (/stop to abandon it).
    .createFailed = Could not create a tournament right now.
    .joinClosed = This tournament is not open for joining.
    .alreadyIn = You are already in!
    .joined = Joined! 🏆
    .notIn = You are not in this tournament.
    .quitCancelled = Quit. Tournament cancelled.
    .quit = Quit.
    .startClosed = This tournament is no longer open.
    .onlyCreator = Only the creator can start it.
    .tooFew = Need at least 2 players!
    .startFailed = Could not start the tournament.
    .gameOn = Game on!

stats =
    .compareUnknown = I do not know that player yet. Reply to one of their messages, or use the name they played under.
    .compareUsage = Usage: reply with /compare, or use /compare NAME
    .compareSelf = Pick someone else to compare with.
    .allChats = All chats

help =
    .main = <tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> Wordle /wordle_help
        <tg-emoji emoji-id="5936130851635990622">🎯</tg-emoji> One-shot /oneshot_help
        <tg-emoji emoji-id="6005695599410679642">🔠</tg-emoji> Guess Mode /mode_help
        <tg-emoji emoji-id="5877410604225924969">✨</tg-emoji> Creativity /creativity_help
        <tg-emoji emoji-id="5942877472163892475">👥</tg-emoji> Multiplayer /multiplayer_help
        <tg-emoji emoji-id="5778575233422200567">👤</tg-emoji> Stats /stats_help
        <tg-emoji emoji-id="5877260593903177342">⚙️</tg-emoji> Preferences /preferences_help
        
        { $sourceCode }
    .wordle = <tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> Wordle
        
        /wordle
        Starts a shared chat game.
        
        /daily
        Starts today's shared daily word.
        
        /personal
        Starts your own game inside the chat.
        
        /w WORD
        Submits a guess.
        
        Reply to a word with /explain to get a meaning.
        Reply with /roast, or send /roast WORD, to roast a word.
        
        /board
        Reposts the current board.
        
        /stop
        Ends the current game.
        
        A chat can have one shared active game at a time. Personal games run separately for each player.
    .oneshot = <tg-emoji emoji-id="5936130851635990622">🎯</tg-emoji> One-shot
        
        /oneshot easy|normal|hard|expert · { $difficulty }
        Sets the chat's one-shot difficulty.
        
        /oneshot
        First row is a random clue word. You get one guess for row two.
        
        { $easyTick }easy · { $easyPattern }
        { $normalTick }normal · { $normalPattern }
        { $hardTick }hard · { $hardPattern }
        { $expertTick }expert · { $expertPattern }
        
        One-shot games do not affect stats.
    .mode = <tg-emoji emoji-id="6005695599410679642">🔠</tg-emoji> Guess Mode
        
        Normal /normal{ $normalTick }
        Classic Wordle experience.
        
        Hard /hard{ $hardTick }
        Each guess must use <tg-emoji emoji-id="5280718893806034581">🔠</tg-emoji> yellow and <tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> green hints from previous guesses.
        
        Super-hard /superhard{ $superhardTick }
        Hard, but <tg-emoji emoji-id="5282737683053980256">🔠</tg-emoji> dark hints cannot be used.
    .creativity = <tg-emoji emoji-id="5877410604225924969">✨</tg-emoji> Creativity
        
        /creativity · { $value } { $toggleIcon }
        Turns creativity on or off using the saved frame.
        
        /creativity 30m · { $timeValue }{ $timeTick }
        Bans words used within a time window. Supports s, m, h, d.
        
        /creativity 15w · { $wordValue }{ $wordTick }
        Bans the last N used words.
    .multiplayer = <tg-emoji emoji-id="5942877472163892475">👥</tg-emoji> Multiplayer
        
        <tg-emoji emoji-id="5942877472163892475">👥</tg-emoji> Tournaments
        /round [N]
        Players join with the button, then the creator starts it.
        Players guess in turn order. Solving earlier gives more points.
        
        /fails N|off · { $rejectedGuesses }
        Sets rejected guesses allowed per turn.
        
        /timer 90s · { $timer }
        Sets a max time per turn. Send /timer with no value to disable it.
    .stats = <tg-emoji emoji-id="5778575233422200567">👤</tg-emoji> Stats
        
        /profile
        Shows your stats in this chat.
        
        /global
        Shows your stats across all chats.
        
        /compare
        Compares you with another player.
        
        Use /compare by replying to a player, or /compare NAME.
        One-shot games do not affect stats.
    .preferences = <tg-emoji emoji-id="5877260593903177342">⚙️</tg-emoji> Chat Preferences
        
        <tg-emoji emoji-id="5778184941154078090">🌐</tg-emoji> /en /ru · { $language }
        Changes language for new games.
        
        <tg-emoji emoji-id="6008135256798927387">🏆</tg-emoji> /length N · { $length } letters
        Changes word length for new games.
        
        <tg-emoji emoji-id="5881986900469748194">🤖</tg-emoji> /auto · { $auto }
        Toggles guessing without /w.
        
        <tg-emoji emoji-id="5879937509579820068">🧹</tg-emoji> /cleanup · { $cleanup }
        Removes previous unsolved board messages when a new board is posted.
        
        <tg-emoji emoji-id="5924666978332578279">🔥</tg-emoji> /roast · { $roast }
        Toggles one LLM roast for below-average guesses.
        
        <tg-emoji emoji-id="5784982040432611567">😀</tg-emoji> /usepack NAME · { $emojiPack }
        Uses a custom emoji pack for tile letters.
        
        Active games keep the language and length they started with.

format =
    .sourceCode = <tg-emoji emoji-id="5884343982816759327">💻</tg-emoji> <a href="https://github.com/ExposedCat/wordle-tg">Source Code</a> (forked <a href="https://github.com/Argotoss/telewordle">telewordle</a>)
    .creativityUnset = off — set with /creativity 30m or /creativity 15w
    .creativityOff = off
    .creativityTime = on — words from the last { $duration } are banned
    .creativityCount = on — the last { $count } words are banned
    .creativityValueTime = on, { $duration }
    .creativityValueCount = on, { $count } words
    .hardModeBoth = { $mode }: you must use { $required }.
        You cannot use { $forbidden }
    .hardModeRequired = { $mode }: you must use { $required }
    .hardModeForbidden = { $mode }: you cannot use { $forbidden }
    .alreadyGuessed = { $tiles } was already guessed
    .gameOver = <tg-emoji emoji-id="5927054181285237634">🏳️</tg-emoji> Game Over! The word was { $answer }
    .answerMeaning = { $answer }{ $meaning }
    .wordMeaningSuffix =  · { $meaning }
    .stats = <tg-emoji emoji-id="5778575233422200567">👤</tg-emoji> { $displayName } · { $chatName }
        
        <tg-emoji emoji-id="6008090211181923982">🎮</tg-emoji> Games
        { $gamesPlayed } total · { $gamesWon } won ({ $gamesWonPercent }%) · { $solves } finished ({ $solvesPlayedPercent }% / { $solvesWonPercent }%)
        { $currentStreak } in a row · max { $bestStreak }
        
        <tg-emoji emoji-id="6005695599410679642">🔠</tg-emoji> Guesses
        { $guessesTotal } guesses · <tg-emoji emoji-id="5280718893806034581">🔠</tg-emoji> { $yellows } ({ $yellowsGuessPercent }% / { $yellowsLetterPercent }%) · <tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> { $greens } ({ $greensGuessPercent }% / { $greensLetterPercent }%)
        { $qualityScore }/100 quality score · { $avgLeft } words left on average
        
        <tg-emoji emoji-id="6008135256798927387">🏆</tg-emoji> Winning
        { $dist1 }
        { $dist2 }
        { $dist3 }
        { $dist4 }
        { $dist5 }
        { $dist6 }
        
        <tg-emoji emoji-id="5942877472163892475">👥</tg-emoji> Tournaments
        { $tournamentsPlayed } total · { $tournamentsWon } won ({ $tournamentsWonPercent }%) · { $tournamentPoints } points
    .standingsPoints = { $rank } { $player } — { $points } pts
