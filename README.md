# mc-bot

A Minecraft companion bot I wrote for a friend's private server in 2025. Runs as a second account that follows you around, fights for you, eats automatically, and can mine blocks on command. Nothing fancy, just something useful to have on the server. Can also respond to natural language chat and carry out tasks via an AI API.

Built with [mineflayer](https://github.com/PrismarineJS/mineflayer).

---

## what it does

- follows the owner and looks at them when idle
- attacks mobs that hit you (or mobs you're attacking)
- equips the best sword/armor from its inventory before a fight, puts a totem in offhand if it has one
- eats food automatically when health or hunger gets low
- mines a block type continuously until you tell it to stop — uses a chunk cache so it can find blocks even in chunks that have unloaded, and explores automatically if none are nearby
- navigates long distances with segmented A* pathfinding (no event-loop freezes)
- places blocks under itself when pathfinding over gaps
- avoids lava and hazards during path planning (cost penalties) and escapes actively if it steps in fire or lava
- responds to natural language chat and executes actions via AI (optional)

---

## setup

node 18+ required.

```
npm install
```

configure via env vars (or edit the defaults in `src/index.js`):

| var | default | description |
|---|---|---|
| `MC_HOST` | `127.0.0.1` | server ip |
| `MC_PORT` | `25565` | server port |
| `MC_USERNAME` | `WolfBot` | bot's username |
| `MC_VERSION` | `1.20.1` | game version |
| `OWNER` | *(none)* | username that controls the bot; if not set, the first person to send a command becomes the owner |

if the server uses `/register` and `/login` (like most offline cracked servers do), the bot handles that automatically.

```
MC_HOST=your.server.ip MC_USERNAME=WolfBot OWNER=yourname npm start
```

---

## commands

all commands are sent in chat:

| command | what it does |
|---|---|
| `!follow` | follow the owner |
| `!stop` | stop everything and stand still |
| `!attack <name>` | attack a specific mob or player by name |
| `!mine <block>` | continuously mine that block type (also `!dig`) |
| `!goto <x> <y> <z>` | navigate to coordinates using long-range segmented pathfinding |
| `!status` | prints hp, food, state, and which processes are active |
| `!help` | lists commands |

only the owner can use commands. if `OWNER` isn't set, ownership goes to whoever sends the first command.

`!mine` aliases common names: `wood` → `oak_log`, `iron` → `iron_ore`, `diamond` → `diamond_ore`, etc. if the target isn't visible, the bot explores automatically until it finds some.

---

## tuning (optional)

all pathfinding tunables are in `src/nav/config.js` and can be overridden with `NAV_*` env vars without touching code:

| var | default | description |
|---|---|---|
| `NAV_ALLOW_BREAK` | `false` | let the planner mine through obstacles |
| `NAV_ALLOW_PARKOUR` | `false` | enable parkour movements (phase 4) |
| `NAV_ALLOW_SPRINT` | `true` | sprint during pathfinding |
| `NAV_STUCK_TIMEOUT_MS` | `1500` | ms without movement before replanning |
| `NAV_REPLAN_MAX_ATTEMPTS` | `5` | give up after this many consecutive stuck events |
| `NAV_WALK_ADJACENT_LAVA_PENALTY` | `30` | cost added when planning a path near lava |
| `NAV_PRIMARY_TIMEOUT_MS` | `500` | A* time budget per path segment |
| `NAV_CACHE_MAX_CHUNKS` | `1024` | how many chunks to keep in the in-memory block cache |

---

## ai chat (optional)

connect the bot to an AI so it responds to normal chat messages (anything not starting with `!`) and can carry out tasks you describe in plain English.

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

once running, type normally in chat (no `!` prefix) and the bot responds and acts. the AI has access to all the same actions as the `!` commands, plus it can look around, report nearby entities and notable blocks (including blocks found in the chunk cache, not just what's currently loaded).

available AI tools: `mine`, `goto`, `explore`, `cancel`, `follow_owner`, `attack_mob`, `get_status`, `look_around`, `send_chat`, `stop`.

---

## notes

- tested on 1.20.1 offline-mode servers
- uses offline auth (`auth: 'offline'`), so it won't work on online-mode (premium) servers without modification
- gear scoring is rough — material + enchantments with hardcoded weights, good enough for survival
- the chunk cache lives in memory only; it's rebuilt each session as chunks load
