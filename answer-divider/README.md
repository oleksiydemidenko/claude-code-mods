# answer-divider

Draws a thin line with the word "ANSWER" (in your language) above Claude's final answer of each turn, dims the interim text between tool calls, and shows how long the turn took under the answer. `/answer-line` switches between a wave and a row of triangles.

```
/plugin install answer-divider --marketplace oleksiydemidenko/claude-code-mods
```

## How it works, and what it uses

- It changes only how messages are drawn on your screen. The model, the conversation and the transcript file stay exactly as they were.
- It sends nothing anywhere: no requests to the model, no network requests, no analytics.
- To know which text is the final answer, it keeps the answers of the current session in memory. After a restart it reads them again from the session's own transcript.

## Privacy

It keeps in Claude Code's local plugin storage on your computer:

- the line style you chose;
- for each of the last 150 answers, how long the turn took, next to a short one-way fingerprint of the answer's end (16 hex characters), so the time can be shown under the right answer again. No text from your conversations is stored;
- with the `language` option on `auto`, the detected language code.

It reads your locale settings (`LANG`, `LC_ALL` and similar) to pick its language. Versions before 1.0.3 kept the start and end of recent answers in that storage; 1.0.3 deletes them the first time it starts.

## Settings

`language` in `/config`: English by default; one of 13 languages, or `auto` to follow the language Claude answers in.

## Support

Questions and bug reports: [GitHub issues](https://github.com/oleksiydemidenko/claude-code-mods/issues). A picture: the [repository README](https://github.com/oleksiydemidenko/claude-code-mods#readme).

MIT license. A personal project, not affiliated with or endorsed by Anthropic.
