# MindFlip
**A Visual Sequence Challenge by RajCode**

*Flip. Focus. Remember. Follow the sequence.*

## What is MindFlip?
MindFlip is a casual web-based brain-training game built with HTML5, CSS3, and vanilla JavaScript. It focuses on pattern recognition, visual memory, concentration, and attention.

The core idea is simple: *you don't just memorize the sequence — you remember where each card is hidden.*

## Project Structure
- `index.html` — page layout and game structure
- `style.css` — all visual styling, animations, card flip effects, and layout rules
- `script.js` — gameplay logic, state management, AI, confetti, storage, and UI updates

## Game Modes
1. **Solo**: Progress through levels and finish each sequence with as few mistakes as possible.
2. **Two Players**: Shared-device turn-based play. A mistake ends the turn and the board resets.
3. **Vs Computer**: Challenge a simulated opponent with adjustable memory difficulty.
4. **Daily Challenge**: A fresh one-off puzzle seeded for the current date.

## Technologies Used
- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- `localStorage` for saved progress and settings
- No frameworks, build tools, or backend required

## How to Run
1. Open the project folder.
2. Make sure `index.html`, `style.css`, and `script.js` are in the same directory.
3. Open `index.html` in any modern browser, or run a lightweight local server such as VS Code Live Server.
4. No installation steps are required.

## Local Storage
The game stores its progress in the browser using `localStorage`, including:
- highest level reached
- best score
- game stats
- settings and achievements

## Future Upgrade Possibilities
This version is structured for easy extension later, including:
- user accounts and cloud saves
- global leaderboards
- more game modes
- online multiplayer using WebSockets

---
*Developed by <a href="https://rajcode.netlify.app/" target="_blank" rel="noopener" class="text-brand-500 hover:text-brand-400 hover:underline font-bold transition">RajCode</a>.*