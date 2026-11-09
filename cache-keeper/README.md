# cache-keeper

Keeps your Claude Code session's prompt cache warm while you are away, and shows it as a tiny kitchen above the prompt: a chef keeps the soup simmering, one guest arrives for every hour, each warm-up feeds one, and a guest leaves hungry for every hour with none. It also warns once before a message into a large session whose cache has gone cold.

```
/plugin install cache-keeper --marketplace oleksiydemidenko/claude-code-mods
```

## Commands

| Command | What it does |
| --- | --- |
| `/cache-warm on [hours]` | Keep the cache warm (8 hours by default, 24 at most) |
| `/cache-warm off` | Stop |
| `/cache-warm` | Status: time left, last warm-up, guests fed |
| `/cache-warm show band\|status\|both` | Kitchen above the prompt, a plain status line under it, or both |
| `/cache-warm demo [guests]` | A one-minute pretend shift; sends nothing to the model |

## How it works, and what it uses

**It sends requests to the model on its own, and they count toward your usage.** Only while you have switched it on with `/cache-warm on`, and only in that session:

- Whenever the session has been quiet for 50 minutes, the mod asks the model one short side question over the session's own history (a fork): *"A service check that only keeps this session's prompt cache warm. Do nothing and answer with one word: ok."* The question and its answer never appear in the chat and are not added to the conversation.
- That is at most one request per idle hour. It reads your cached context, which costs about a tenth of normal input. On a Claude plan it counts toward your plan's usage limits; with an API key it is billed like any other request.
- It stops by itself when the hours you asked for run out, and at once with `/cache-warm off`. Nothing is sent while you are working in the session, or after it stops.

**The guard** sends nothing. In every session, the first message into a large session (over 30,000 tokens of context) whose cache has gone cold is held back once with a warning and put back in the input box; press Enter again to send it.

## Privacy

- No servers of its own, no analytics, no network requests: the warm-up goes through Claude Code itself, to the same model your session uses.
- It keeps three small things in Claude Code's local plugin storage on your computer: when each recent session (up to 100) last talked to the model, which display you chose, and, with the `language` option on `auto`, the language code it detected. To detect the language it reads your messages in memory; it stores no text from your conversations.
- It reads your locale settings (`LANG`, `LC_ALL` and similar) to pick its language, and the session's context size for the guard.

## Settings

`language` in `/config`: English by default; one of 13 languages, or `auto` to follow the language you write in.

## Support

Questions and bug reports: [GitHub issues](https://github.com/oleksiydemidenko/claude-code-mods/issues). Pictures of the kitchen: the [repository README](https://github.com/oleksiydemidenko/claude-code-mods#readme).

MIT license. A personal project, not affiliated with or endorsed by Anthropic.
