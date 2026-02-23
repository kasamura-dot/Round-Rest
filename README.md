# Round & Rest

A lightweight web app to generate tennis round-robin style rotation tables (randomized matchups) for doubles and singles.

Live site:
- https://kasamura-dot.github.io/Round-Rest/

## Features
- Doubles and Singles support
- Round-by-round court assignments
- Rest management that avoids consecutive rests when possible
- Current/next round highlighting for on-court usability
- Seed-based regeneration for alternative schedules

## How To Use
1. Set the number of courts, total minutes, and formats.
2. Adjust round minutes (auto-recommended by format, editable).
3. Add players (4–16).
4. Click Generate to create the schedule.
5. Use ◀/▶ to mark the current round; the next round is highlighted.
6. Click Regenerate to produce a new schedule with the same settings.

## Notes
- Minimum players: 4
- Maximum players: 16
- Courts: 1–4
- Rounds = floor(totalMinutes / roundMinutes)

## Development
This is a static site. Open `index.html` directly or serve with any static web server.

## SEO
The site includes `robots.txt`, `sitemap.xml`, and basic Open Graph metadata.

## License
MIT
