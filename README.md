# mc-bot

A minecraft companion bot I wrote for a friend's private server in 2025. Runs as a second account that follows you around, fights for you, eats automatically, and can mine blocks on command. Nothing fancy, just something useful to have on the server. Can also respond to natural language chat and carry out tasks via an AI API.

Built with [mineflayer](https://github.com/PrismarineJS/mineflayer).

---

## what it does

- follows the owner and looks at them when idle
- attacks mobs that hit you (or mobs you're attacking)
- equips the best sword/armor from its inventory before a fight, puts a totem in offhand if it has one
- eats food automatically when health or hunger gets low
- digs a block type continuously until you tell it to stop (`!dig oak_log`, then `!stop`)
- places blocks under itself when pathfinding over gaps (so it doesn't get stuck)
- escapes from lava/fire automatically
- responds to natural language chat and executes actions via AI (optional)

---

## setup

node 18+ required.

```
npm install
```

configure via env vars (or just edit the defaults in `src/index.js`):

| var | default | description |
|---|---|---|
| `MC_HOST` | `127.0.0.1` | server ip |
| `MC_PORT` | `25565` | server port |
| `MC_USERNAME` | `WolfBot` | bot's username |
| `MC_VERSION` | `1.20.1` | game version |
| `OWNER` | *(none)* | username that controls the bot. if not set, the first person to send a command becomes the owner |

if the server uses `/register` and `/login` (like most offline cracked servers do), the bot handles that automatically. first launch it registers, after that it logs in. the flag is stored in `.registered` next to the package.json.

```
MC_HOST=your.server.ip MC_USERNAME=WolfBot OWNER=yourname npm start
```

---

## commands

all commands are sent in chat:

| command | what it does |
|---|---|
| `!follow` | follow the owner |
| `!stop` | stop whatever it's doing and stand still |
| `!attack <name>` | attack a specific mob or player by name |
| `!dig <block>` | continuously mine that block type until `!stop` |
| `!status` | prints hp, food, and current state |
| `!help` | lists commands |

only the owner can use commands. if `OWNER` isn't set, ownership goes to whoever sends the first command.

---

## ai chat (optional)

you can connect the bot to an AI so it responds to normal chat messages (anything not starting with `!`) and can carry out tasks you describe in plain english.

set these extra env vars to enable it:

| var | description |
|---|---|
| `AI_PROVIDER` | `anthropic` or `openai` (also used for google ai studio) |
| `AI_API_KEY` | your api key |
| `AI_MODEL` | model name (e.g. `claude-sonnet-4-6`, `gpt-4o-mini`, `gemini-2.0-flash`) |
| `AI_BASE_URL` | *(optional)* custom base url — needed for google ai studio |

**anthropic:**
```
AI_PROVIDER=anthropic AI_API_KEY=sk-ant-... AI_MODEL=claude-sonnet-4-6 \
MC_PORT=25565 MC_USERNAME=WolfBot OWNER=yourname npm start
```

**openai:**
```
AI_PROVIDER=openai AI_API_KEY=sk-... AI_MODEL=gpt-4o-mini \
MC_PORT=25565 MC_USERNAME=WolfBot OWNER=yourname npm start
```

**google ai studio:**
```
AI_PROVIDER=openai AI_API_KEY=AIza... AI_MODEL=gemini-2.0-flash \
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/ \
MC_PORT=25565 MC_USERNAME=WolfBot OWNER=yourname npm start
```

once running, just type normally in chat (no `!` prefix) and the bot will respond and act. the ai has access to all the same actions as the `!` commands, plus it can look around and report nearby entities.

---

## notes

- tested on 1.20.1 offline-mode servers
- the bot uses offline auth (`auth: 'offline'`), so it won't work on online-mode (premium) servers without modification
- gear scoring is rough — it looks at material + enchantments with some hardcoded weights, good enough for survival
