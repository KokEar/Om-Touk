# អុំទូក · Om Touk
A Three.js dragon-boat rhythm race for the Cambodian Royal Water Festival (ព្រះរាជពិធីបុណ្យអុំទូក).

## Run
No build step. Open `index.html` in a browser (or serve the folder: `python3 -m http.server`).
Add `?demo` to the URL to watch an autoplay race (`?demo&diff=hard` for hard).

## How to play
- Press your key when a drum note reaches the golden ring. Perfect/Good hits raise crew **Sync**, which sets boat speed. Misses and stray taps lower it.
- 10 hits in a row triggers **Naga Power**, a golden speed burst.
- 1 Player: `Space`, `A S D F`, `J K L`, or tap/click the screen. 2 Players: P1 `A S D F`, P2 `J K L ;`.
- `P`/`Esc` pause, `M` sound.
- **Online** (menu → Online · Room): one player taps *Create room* and shares the 5-letter code; the friend enters it and taps *Join*. The host picks the difficulty and starts the race (host = Red, guest = Blue). Peer-to-peer over WebRTC via PeerJS's free public signalling server; no backend of your own is needed. No pausing online; `Esc` leaves the race.

## Files
- `js/game.js` — all game code (scene, boats, rhythm engine, AI, audio, HUD)
- `css/style.css`, `index.html` — UI
- `lib/three.min.js` — Three.js r149
- `lib/peerjs.min.js` — PeerJS 1.5.4 (online rooms)
