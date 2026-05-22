# mc-bot

A minecraft companion bot I wrote for a friend's private server in 2025. Runs as a second account that follows you around, fights for you, eats automatically, and can mine blocks on command. Nothing fancy, just something useful to have on the server.

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

## notes

- tested on 1.20.1 offline-mode servers
- the bot uses offline auth (`auth: 'offline'`), so it won't work on online-mode (premium) servers without modification
- gear scoring is rough — it looks at material + enchantments with some hardcoded weights, good enough for survival
