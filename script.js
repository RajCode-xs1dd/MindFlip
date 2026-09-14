tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Inter', 'sans-serif'] },
                    colors: {
                        brand: { 500: '#6366f1', 600: '#4f46e5' },
                        accent: { 500: '#14b8a6', 600: '#0d9488' }
                    }
                }
            }
        };

const DEFAULT_DATA = {
            records: { highestLevel: 0, bestScore: 0, gamesPlayed: 0, levelsCompleted: 0 },
            settings: { sound: true, animations: true, computerDifficulty: 'medium' },
            achievements: { firstWin: false, level5: false, level10: false, flawless: false, beatComputer: false, veteran: false },
            activeGames: { solo: null, twoPlayer: null, computer: null },
            hasSeenTutorial: false,
            dailySeed: ''
        };

        let userData = { ...DEFAULT_DATA };
        let currentMode = 'home';
        let currentLevel = 1;
        let score = 0;

        let boardCards = [];
        let targetSequence = [];
        let currentSequenceIndex = 0;
        let isProcessing = false;
        let gameActive = false;
        
        let currentPlayer = 1;
        let p1Mistakes = 0;
        let p2Mistakes = 0;
        let computerMemory = [];

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const actx = new AudioContext();

        function loadData() {
            try {
                const stored = localStorage.getItem('mindflipData');
                if (stored) {
                    userData = { ...DEFAULT_DATA, ...JSON.parse(stored) };
                    userData.records = { ...DEFAULT_DATA.records, ...userData.records };
                    userData.settings = { ...DEFAULT_DATA.settings, ...userData.settings };
                    userData.achievements = { ...DEFAULT_DATA.achievements, ...userData.achievements };
                    userData.activeGames = { ...DEFAULT_DATA.activeGames, ...userData.activeGames };
                }
            } catch (e) {
                console.error("Storage load failed", e);
            }
            updateHomeStats();
        }

        function saveData() {
            try {
                localStorage.setItem('mindflipData', JSON.stringify(userData));
            } catch (e) {
                console.error("Storage save failed", e);
            }
        }

        function playSound(type) {
            if (!userData.settings.sound || actx.state === 'suspended') return;
            const osc = actx.createOscillator();
            const gain = actx.createGain();
            osc.connect(gain);
            gain.connect(actx.destination);
            const now = actx.currentTime;
            
            if (type === 'flip') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'correct') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.setValueAtTime(600, now + 0.1);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'wrong') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'win') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.setValueAtTime(500, now + 0.1);
                osc.frequency.setValueAtTime(600, now + 0.2);
                osc.frequency.setValueAtTime(800, now + 0.3);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
            }
        }

        function showView(viewId) {
            const views = ['view-home', 'view-game', 'view-records', 'view-settings', 'view-about', 'view-achievements'];
            views.forEach(v => document.getElementById(v).classList.add('hidden'));
            document.getElementById(`view-${viewId}`).classList.remove('hidden');

            if (viewId === 'home') updateHomeStats();
            if (viewId === 'records') populateRecords();
            if (viewId === 'settings') populateSettings();
            if (viewId === 'achievements') populateAchievements();
            window.scrollTo(0, 0);
        }

        function updateHomeStats() {
            if (userData.records.gamesPlayed > 0) {
                document.getElementById('home-stats').classList.remove('hidden');
                document.getElementById('home-stat-level').innerText = userData.records.highestLevel || 1;
                document.getElementById('home-stat-score').innerText = userData.records.bestScore || 0;
            }
        }

        Math.seedrandom = function(seed) {
            let h = 0xdeadbeef;
            for(let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
            let a = h ^ h >>> 16;
            return function() {
                a |= 0; a = a + 0x6D2B79F5 | 0;
                let t = Math.imul(a ^ a >>> 15, 1 | a);
                t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            }
        }
        
        function getDailySeedInfo() {
            const baseDate = new Date("2026-09-14T00:00:00").getTime();
            const today = new Date();
            const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            let daysPassed = Math.floor((todayMidnight - baseDate) / (1000 * 60 * 60 * 24));
            if (daysPassed < 0) daysPassed = 0;
            
            const seedStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
            return { daysPassed: daysPassed + 1, seedStr };
        }

        const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        const NUMBERS = "123456789".split("");

        function generateLevelConfig(level, isDaily = false) {
            let numCards, sequenceLen, chars;
            let dailyInfo = getDailySeedInfo();
            let rng = isDaily ? new Math.seedrandom(dailyInfo.seedStr) : Math.random;

            if (isDaily) {
                // Hold difficulty steady for 3 consecutive days, then increase card count and sequence length together
                let difficultyTier = Math.floor((dailyInfo.daysPassed - 1) / 3);
                sequenceLen = Math.min(6 + difficultyTier, 14);
                numCards = sequenceLen; // Same number of cards as the character count
                chars = [...ALPHABET, ...NUMBERS];
            } else {
                if (level >= 1 && level <= 5) {
                    numCards = 4; sequenceLen = 4;
                    if (level === 1) chars = ['A','B','C','D'];
                    else if (level === 2) chars = ['W','X','Y','Z'];
                    else if (level === 3) chars = ['A','F','K','P'];
                    else if (level === 4) chars = ['M','N','W','V'];
                    else if (level === 5) chars = ['O','Q','C','G'];
                } else if (level >= 6 && level <= 15) {
                    numCards = 6; sequenceLen = 5; chars = ALPHABET;
                } else if (level >= 16 && level <= 25) {
                    numCards = 7; sequenceLen = 6; chars = [...ALPHABET, ...NUMBERS];
                } else if (level >= 26 && level <= 35) {
                    numCards = 8; sequenceLen = 7; chars = [...ALPHABET, ...NUMBERS];
                } else {
                    numCards = Math.min(10 + Math.floor((level - 36) / 2), 16);
                    sequenceLen = Math.min(8 + Math.floor((level - 36) / 3), 12);
                    chars = [...ALPHABET, ...NUMBERS];
                }
            }

            let seq = [];
            let availableChars = [...chars];
            for (let i = 0; i < sequenceLen; i++) {
                let index = Math.floor(rng() * availableChars.length);
                seq.push(availableChars[index]);
                availableChars.splice(index, 1);
            }

            let dists = [];
            let distChars = [...ALPHABET, ...NUMBERS].filter(c => !seq.includes(c));
            for (let i = 0; i < (numCards - sequenceLen); i++) {
                let index = Math.floor(rng() * distChars.length);
                dists.push(distChars[index]);
                distChars.splice(index, 1);
            }

            let allVals = [...seq, ...dists];
            for (let i = allVals.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [allVals[i], allVals[j]] = [allVals[j], allVals[i]];
            }

            return { sequence: seq, gridValues: allVals };
        }

        function promptStartGame(mode) {
            if (mode === 'daily') {
                startGame(mode, false);
                return;
            }
            
            if (!userData.activeGames) userData.activeGames = { solo: null, twoPlayer: null, computer: null };
            const savedState = userData.activeGames[mode];
            
            if (savedState && savedState.level > 1) {
                const modeNames = {solo: 'Solo', twoPlayer: 'Two Players', computer: 'Vs Computer'};
                const content = `
                    <p class="text-slate-300 mb-5">You left off at <strong class="text-white text-lg">Level ${savedState.level}</strong> in ${modeNames[mode]} mode.</p>
                    <button onclick="closeMessage(); startGame('${mode}', false);" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 font-bold py-3 px-4 rounded-xl transition mb-2 focus:outline-none">
                        <i class="fas fa-redo mr-2"></i> Start Fresh (Level 1)
                    </button>
                `;
                showMessage("Resume Game?", content, () => {
                    startGame(mode, true);
                });
                const btn = document.getElementById('msg-btn');
                btn.innerHTML = `<i class="fas fa-play mr-2"></i> Resume Level ${savedState.level}`;
                btn.className = "w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 px-4 rounded-xl transition focus:outline-none";
            } else {
                startGame(mode, false);
            }
        }

        function startGame(mode, resume = false) {
            if (actx.state === 'suspended') actx.resume();
            currentMode = mode;
            
            if (resume && userData.activeGames && userData.activeGames[mode]) {
                const state = userData.activeGames[mode];
                currentLevel = state.level;
                score = state.score;
                p1Mistakes = state.p1Mistakes;
                p2Mistakes = state.p2Mistakes;
            } else {
                currentLevel = 1;
                score = 0;
                p1Mistakes = 0;
                p2Mistakes = 0;
            }

            currentPlayer = 1;
            computerMemory = [];
            userData.records.gamesPlayed++;
            saveData();

            let dailyInfo = getDailySeedInfo();
            if (mode === 'daily') {
                if (userData.dailySeed === dailyInfo.seedStr) {
                    const msgContent = `
                        <p class="text-slate-300 mb-5">You've already completed today's challenge. Playing again is for practice!</p>
                    `;
                    showMessage("Daily Completed", msgContent, () => initLevel());
                    return;
                }
            }

            if (!userData.hasSeenTutorial) {
                showTutorial();
            } else {
                initLevel();
            }
        }

        function showTutorial() {
            const html = `
                <ul class="list-disc pl-5 space-y-2">
                    <li>All cards are hidden.</li>
                    <li>Flip a card to discover it.</li>
                    <li>Find the sequence:</li>
                    <li>A → B → C → D</li>
                    <li>Remember where you found each card.</li>
                    <li>Choose incorrectly? Your turn resets.</li>
                </ul>
            `;
            showMessage("How to Play", html, () => {
                userData.hasSeenTutorial = true;
                saveData();
                initLevel();
            });
        }

        function initLevel() {
            gameActive = true;
            showView('game');
            isProcessing = false;
            currentSequenceIndex = 0;

            if (currentMode !== 'daily') {
                if (!userData.activeGames) userData.activeGames = { solo: null, twoPlayer: null, computer: null };
                userData.activeGames[currentMode] = {
                    level: currentLevel,
                    score: score,
                    p1Mistakes: p1Mistakes,
                    p2Mistakes: p2Mistakes
                };
                saveData();
            }
            
            const isMulti = currentMode === 'twoPlayer' || currentMode === 'computer';
            const isDaily = currentMode === 'daily';
            
            document.getElementById('hud-solo').classList.toggle('hidden', currentMode !== 'solo');
            document.getElementById('hud-multi').classList.toggle('hidden', !isMulti);
            document.getElementById('hud-daily').classList.toggle('hidden', !isDaily);

            let modeDisplay = "";
            if (currentMode === 'solo') modeDisplay = "Solo";
            if (currentMode === 'twoPlayer') modeDisplay = "2 Player";
            if (currentMode === 'computer') modeDisplay = "Vs Comp";
            if (currentMode === 'daily') modeDisplay = "Daily";
            
            let dailyInfo = getDailySeedInfo();
            const bodyLevelText = document.getElementById('body-level-text');
            if (bodyLevelText) {
                if (currentMode === 'daily') {
                    bodyLevelText.innerText = `DAILY • Daily Challenge ${dailyInfo.daysPassed}`;
                } else {
                    bodyLevelText.innerText = `${modeDisplay} - Lvl ${currentLevel}`;
                }
            }

            if (currentMode === 'solo') {
                document.getElementById('hud-level').innerText = currentLevel;
                document.getElementById('hud-mistakes').innerText = p1Mistakes;
            } else if (currentMode === 'daily') {
                document.getElementById('daily-hud-title').innerText = `${dailyInfo.daysPassed}`;
                document.getElementById('daily-hud-mistakes').innerText = p1Mistakes;
            } else {
                document.getElementById('hud-p2-name').innerHTML = currentMode === 'computer' ? '<i class="fas fa-robot"></i> Computer' : '<i class="fas fa-user-friends"></i> Player 2';
                updateMultiplayerHUD();
            }

            const config = generateLevelConfig(currentLevel, currentMode === 'daily');
            targetSequence = config.sequence;
            
            renderSequenceHUD(isDaily ? 'daily-target-sequence' : (isMulti ? 'multi-target-sequence' : 'target-sequence'));
            
            const board = document.getElementById('game-board');
            board.innerHTML = '';
            boardCards = [];

            config.gridValues.forEach((val, i) => {
                const isTarget = targetSequence.includes(val);
                const cardContainer = document.createElement('div');
                cardContainer.className = 'card-container';
                cardContainer.id = `card-${i}`;
                
                cardContainer.innerHTML = `
                    <div class="card-inner">
                        <div class="card-front"><i class="fas fa-brain text-slate-500"></i></div>
                        <div class="card-back">${val}</div>
                    </div>
                `;

                cardContainer.onclick = () => handleCardClick(i);
                board.appendChild(cardContainer);
                
                boardCards.push({
                    id: i,
                    value: val,
                    isTarget: isTarget,
                    isRevealed: false,
                    isMatched: false,
                    el: cardContainer
                });
            });

            if (currentMode === 'computer' && currentPlayer === 2) {
                setTimeout(playComputerTurn, 1000);
            }
        }

        function renderSequenceHUD(elementId) {
            const container = document.getElementById(elementId);
            container.innerHTML = '';
            targetSequence.forEach((val, i) => {
                const span = document.createElement('span');
                span.className = 'sequence-item';
                span.id = `seq-${i}`;
                span.innerText = val;
                
                if (i < targetSequence.length - 1) {
                    const arrow = document.createElement('span');
                    arrow.className = 'text-slate-600 text-xs self-center';
                    arrow.innerText = '➜';
                    container.appendChild(span);
                    container.appendChild(arrow);
                } else {
                    container.appendChild(span);
                }
            });
        }

        function handleCardClick(index) {
            if (isProcessing) return;
            if (currentMode === 'computer' && currentPlayer === 2) return;

            const card = boardCards[index];
            if (card.isRevealed || card.isMatched) return;

            revealCard(card);
            checkMatch(card);
        }

        function revealCard(card) {
            playSound('flip');
            card.isRevealed = true;
            card.el.classList.add('flipped');
            
            if (currentMode === 'computer') {
                if (!computerMemory.some(m => m.id === card.id)) {
                    computerMemory.push({ value: card.value, id: card.id });
                }
            }
        }

        function checkMatch(card) {
            isProcessing = true;
            const expectedValue = targetSequence[currentSequenceIndex];

            if (card.value === expectedValue) {
                playSound('correct');
                card.isMatched = true;
                card.el.classList.add('card-matched');
                
                document.getElementById(`seq-${currentSequenceIndex}`).classList.add('found');
                currentSequenceIndex++;
                
                if (currentSequenceIndex === targetSequence.length) {
                    handleWin();
                } else {
                    isProcessing = false;
                    if (currentMode === 'computer' && currentPlayer === 2) {
                        setTimeout(playComputerTurn, 600);
                    }
                }
            } else {
                handleMistake(card);
            }
        }

        function handleMistake(card) {
            playSound('wrong');
            card.el.classList.add('card-wrong');
            
            if (currentPlayer === 1) {
                p1Mistakes++;
                if (currentMode === 'daily') {
                    document.getElementById('daily-hud-mistakes').innerText = p1Mistakes;
                } else if (currentMode === 'solo') {
                    document.getElementById('hud-mistakes').innerText = p1Mistakes;
                }
            } else {
                p2Mistakes++;
            }
            updateMultiplayerHUD();

            setTimeout(() => {
                card.el.classList.remove('card-wrong');
                currentSequenceIndex = 0;
                document.querySelectorAll('.sequence-item.found').forEach(el => el.classList.remove('found'));

                boardCards.forEach(c => {
                    if (c.isRevealed) {
                        c.isRevealed = false;
                        c.isMatched = false;
                        c.el.classList.remove('flipped', 'card-matched');
                    }
                });

                if (currentMode === 'solo' || currentMode === 'daily') {
                    isProcessing = false;
                } else {
                    switchTurn();
                }
            }, 1000);
        }

        function switchTurn() {
            currentPlayer = currentPlayer === 1 ? 2 : 1;
            
            const alertBox = document.getElementById('turn-alert-box');
            const overlay = document.getElementById('overlay-turn');
            
            alertBox.innerText = currentMode === 'computer' 
                ? (currentPlayer === 1 ? 'YOUR TURN' : 'AI TURN')
                : `PLAYER ${currentPlayer}'S TURN`;
            
            alertBox.className = `px-8 py-4 rounded-full text-2xl font-bold tracking-wider shadow-2xl transform scale-0 transition-transform duration-300 ${currentPlayer === 1 ? 'bg-brand-500 text-white' : 'bg-accent-500 text-white'}`;
            
            overlay.classList.remove('hidden');
            setTimeout(() => alertBox.classList.remove('scale-0'), 50);

            setTimeout(() => {
                alertBox.classList.add('scale-0');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    updateMultiplayerHUD();
                    isProcessing = false;
                    
                    if (currentMode === 'computer' && currentPlayer === 2) {
                        setTimeout(playComputerTurn, 800);
                    }
                }, 300);
            }, 1500);
        }

        function updateMultiplayerHUD() {
            if (currentMode === 'solo' || currentMode === 'daily') return;
            
            document.getElementById('multi-p1-mistakes').innerText = p1Mistakes;
            document.getElementById('multi-p2-mistakes').innerText = p2Mistakes;
            
            const p1Box = document.getElementById('hud-p1-box');
            const p2Box = document.getElementById('hud-p2-box');
            const turnInd = document.getElementById('turn-indicator');
            
            if (currentPlayer === 1) {
                p1Box.classList.add('border-brand-500', 'bg-brand-900/30');
                p1Box.classList.remove('border-transparent');
                p2Box.classList.remove('border-accent-500', 'bg-accent-900/30');
                p2Box.classList.add('border-transparent');
                turnInd.innerText = "P1 TURN";
                turnInd.className = "bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse mb-1";
            } else {
                p2Box.classList.add('border-accent-500', 'bg-accent-900/30');
                p2Box.classList.remove('border-transparent');
                p1Box.classList.remove('border-brand-500', 'bg-brand-900/30');
                p1Box.classList.add('border-transparent');
                turnInd.innerText = currentMode === 'computer' ? "AI TURN" : "P2 TURN";
                turnInd.className = "bg-accent-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse mb-1";
            }
        }

        function playComputerTurn() {
            if (currentPlayer !== 2 || currentMode !== 'computer' || isProcessing || !gameActive) return;

            const expectedValue = targetSequence[currentSequenceIndex];
            const difficulty = userData.settings.computerDifficulty;
            
            let memoryFailChance = 0;
            let confusionChance = 0;
            switch(difficulty) {
                case 'easy': memoryFailChance = 0.4; confusionChance = 0.25; break; 
                case 'medium': memoryFailChance = 0.2; confusionChance = 0.10; break;
                case 'hard': memoryFailChance = 0.05; confusionChance = 0.02; break;
                case 'expert': memoryFailChance = 0.0; confusionChance = 0.0; break;
            }

            let knownItem = computerMemory.find(m => m.value === expectedValue);
            let cardToClick = null;

            if (knownItem && Math.random() > memoryFailChance) {
                const boardCard = boardCards.find(c => c.id === knownItem.id);
                if (!boardCard.isRevealed) cardToClick = boardCard;
            }

            if (!cardToClick) {
                let unrevealed = boardCards.filter(c => !c.isRevealed);
                let unknownUnrevealed = unrevealed.filter(c => !computerMemory.some(m => m.id === c.id));
                let knownWrongUnrevealed = unrevealed.filter(c => computerMemory.some(m => m.id === c.id));
                
                if (knownWrongUnrevealed.length > 0 && Math.random() < confusionChance) {
                    cardToClick = knownWrongUnrevealed[Math.floor(Math.random() * knownWrongUnrevealed.length)];
                } else {
                    let guessPool = unknownUnrevealed.length > 0 ? unknownUnrevealed : unrevealed;
                    if (guessPool.length > 0) cardToClick = guessPool[Math.floor(Math.random() * guessPool.length)];
                }
            }

            if (cardToClick) {
                let baseDelay = difficulty === 'expert' ? 400 : (difficulty === 'easy' ? 1200 : 800);
                setTimeout(() => {
                    revealCard(cardToClick);
                    checkMatch(cardToClick);
                }, baseDelay + (Math.random() * 300));
            }
        }

        function handleWin() {
            playSound('win');
            fireConfetti();
            
            let points = (currentLevel * 100) - ((currentPlayer === 1 ? p1Mistakes : p2Mistakes) * 10);
            if (points < 10) points = 10;

            if (currentLevel > userData.records.highestLevel) userData.records.highestLevel = currentLevel;
            score += points;
            if (score > userData.records.bestScore) userData.records.bestScore = score;
            userData.records.levelsCompleted++;
            
            if (!userData.achievements.firstWin) userData.achievements.firstWin = true;
            if (currentLevel >= 5 && !userData.achievements.level5) userData.achievements.level5 = true;
            if (currentLevel >= 15 && !userData.achievements.level10) userData.achievements.level10 = true;
            if (currentLevel >= 5 && (currentPlayer === 1 ? p1Mistakes : p2Mistakes) === 0 && !userData.achievements.flawless) userData.achievements.flawless = true;
            if (currentMode === 'computer' && currentPlayer === 1 && !userData.achievements.beatComputer) userData.achievements.beatComputer = true;
            let dailyInfo = getDailySeedInfo();
            if (currentMode === 'daily') userData.dailySeed = dailyInfo.seedStr;
            if (userData.records.gamesPlayed >= 25 && !userData.achievements.veteran) userData.achievements.veteran = true;

            saveData();

            setTimeout(() => {
                let title = "";
                let content = "";
                let btnText = "Next Level";
                let action = () => {
                    if (currentLevel === 5 || currentLevel === 15) {
                        p1Mistakes = 0;
                        p2Mistakes = 0;
                    }
                    currentLevel++;
                    currentPlayer = 1;
                    computerMemory = [];
                    initLevel(); 
                };

                if (currentMode === 'daily') {
                    title = "Daily Completed!";
                    content = `<p class="text-xl">Mistakes: ${p1Mistakes}</p><p class="text-sm text-slate-400 mt-2">Come back tomorrow for a new puzzle!</p>`;
                    btnText = "Home";
                    action = () => showView('home');
                } else {
                    if (currentMode === 'solo') {
                        title = "Level Complete!";
                        content = `<p class="text-xl text-brand-400 font-bold mb-1">Score: ${score}</p>
                                   <p class="text-sm text-slate-300">Level Points: +${points}</p>
                                   <p class="text-slate-400">Total Mistakes: ${p1Mistakes}</p>`;
                    } else if (currentMode === 'computer') {
                        title = currentPlayer === 1 ? "🏆 YOU WIN!" : "🤖 COMPUTER WINS!";
                        content = `<p class="text-xl text-brand-400 font-bold mb-1">Total Score: ${score}</p>
                                   <div class="flex justify-between text-sm mt-4 bg-slate-900/50 p-3 rounded-lg">
                                       <div>You Mistakes:<br><span class="text-lg font-bold">${p1Mistakes}</span></div>
                                       <div>AI Mistakes:<br><span class="text-lg font-bold">${p2Mistakes}</span></div>
                                   </div>`;
                    } else {
                        title = `🏆 PLAYER ${currentPlayer} WINS!`;
                        content = `
                                   <div class="flex justify-between text-sm mt-4 bg-slate-900/50 p-3 rounded-lg">
                                       <div>P1 Mistakes:<br><span class="text-lg font-bold">${p1Mistakes}</span></div>
                                       <div>P2 Mistakes:<br><span class="text-lg font-bold">${p2Mistakes}</span></div>
                                   </div>`;
                    }

                    if (currentMode !== 'solo' && currentMode !== 'daily') {
                        userData.activeGames[currentMode] = null;
                        saveData();
                    }
                }

                showMessage(title, content, action);
                document.getElementById('msg-btn').innerText = btnText;
                
                if (currentMode !== 'daily') {
                    const msgDiv = document.getElementById('msg-content');
                    const homeBtn = document.createElement('button');
                    homeBtn.className = "mt-3 w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm transition focus:outline-none";
                    homeBtn.innerText = "Save & Quit to Home";
                    homeBtn.onclick = () => { closeMessage(); showView('home'); };
                    msgDiv.appendChild(homeBtn);
                }
            }, 1000);
        }

        function quitGame() {
            gameActive = false;
            showView('home');
        }

        function showMessage(title, htmlContent, onContinue) {
            document.getElementById('msg-title').innerText = title;
            document.getElementById('msg-content').innerHTML = htmlContent;
            
            const btn = document.getElementById('msg-btn');
            btn.innerText = "Continue";
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.onclick = () => {
                closeMessage();
                if (onContinue) onContinue();
            };
            
            document.getElementById('overlay-message').classList.remove('hidden');
        }

        function closeMessage() {
            document.getElementById('overlay-message').classList.add('hidden');
            stopConfetti();
        }

        function populateRecords() {
            document.getElementById('rec-level').innerText = userData.records.highestLevel;
            document.getElementById('rec-score').innerText = userData.records.bestScore;
            document.getElementById('rec-completed').innerText = userData.records.levelsCompleted;
            document.getElementById('rec-played').innerText = userData.records.gamesPlayed;
        }

        function populateSettings() {
            document.getElementById('set-sound').checked = userData.settings.sound;
            document.getElementById('set-anim').checked = userData.settings.animations;
            document.getElementById('set-diff').value = userData.settings.computerDifficulty;
        }

        function toggleSetting(key) {
            if(key === 'sound') userData.settings.sound = document.getElementById('set-sound').checked;
            if(key === 'animations') userData.settings.animations = document.getElementById('set-anim').checked;
            saveData();
        }

        function changeDifficulty(val) {
            userData.settings.computerDifficulty = val;
            saveData();
        }

        function resetData() {
            if (confirm("Are you sure? This will permanently remove your local MindFlip records.")) {
                localStorage.removeItem('mindflipData');
                userData = { ...DEFAULT_DATA };
                saveData();
                showView('home');
            }
        }

        function populateAchievements() {
            const list = document.getElementById('achievements-list');
            list.innerHTML = '';
            
            const achs = [
                { id: 'firstWin', icon: 'fa-star', title: 'First Victory', desc: 'Complete Level 1', color: 'text-yellow-400' },
                { id: 'level5', icon: 'fa-brain', title: 'Mind Apprentice', desc: 'Complete Level 5', color: 'text-green-400' },
                { id: 'level10', icon: 'fa-crown', title: 'Mind Master', desc: 'Complete Level 15', color: 'text-purple-400' },
                { id: 'flawless', icon: 'fa-gem', title: 'Flawless', desc: 'Complete Level 5+ with 0 mistakes', color: 'text-cyan-400' },
                { id: 'beatComputer', icon: 'fa-robot', title: 'Machine Breaker', desc: 'Beat the Computer', color: 'text-red-400' },
                { id: 'veteran', icon: 'fa-shield-alt', title: 'Veteran', desc: 'Play 25 Games', color: 'text-orange-400' }
            ];

            achs.forEach(a => {
                const unlocked = userData.achievements[a.id];
                list.innerHTML += `
                    <div class="flex items-center gap-4 p-3 rounded-lg border ${unlocked ? 'border-brand-500 bg-brand-900/20' : 'border-slate-700 bg-slate-800/50 opacity-50'}">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800">
                            <i class="fas ${a.icon} ${unlocked ? a.color : 'text-slate-500'} text-xl"></i>
                        </div>
                        <div>
                            <p class="font-bold text-white">${a.title}</p>
                            <p class="text-xs text-slate-400">${a.desc}</p>
                        </div>
                        ${unlocked ? '<i class="fas fa-check-circle text-brand-500 ml-auto"></i>' : '<i class="fas fa-lock text-slate-600 ml-auto"></i>'}
                    </div>
                `;
            });
        }

        let confettiParticles = [];
        let confettiAnimationId;

        function fireConfetti() {
            if (!userData.settings.animations) return;
            const canvas = document.getElementById('confetti-canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            confettiParticles = [];
            const colors = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#ec4899'];
            
            for (let i = 0; i < 100; i++) {
                confettiParticles.push({
                    x: canvas.width / 2,
                    y: canvas.height / 2 + 100,
                    r: Math.random() * 6 + 2,
                    dx: Math.random() * 10 - 5,
                    dy: Math.random() * -10 - 5,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    tilt: Math.floor(Math.random() * 10) - 10,
                    tiltAngleInc: (Math.random() * 0.07) + 0.05,
                    tiltAngle: 0
                });
            }
            renderConfetti();
        }

        function renderConfetti() {
            const canvas = document.getElementById('confetti-canvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            let remaining = false;
            confettiParticles.forEach((p) => {
                p.tiltAngle += p.tiltAngleInc;
                p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2;
                p.x += Math.sin(p.tiltAngle) * 2;
                p.dy += 0.1;
                p.y += p.dy;
                p.x += p.dx;

                if (p.y <= canvas.height) remaining = true;

                ctx.beginPath();
                ctx.lineWidth = p.r;
                ctx.strokeStyle = p.color;
                ctx.moveTo(p.x + p.tilt + p.r, p.y);
                ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r);
                ctx.stroke();
            });

            if (remaining) {
                confettiAnimationId = requestAnimationFrame(renderConfetti);
            }
        }

        function stopConfetti() {
            cancelAnimationFrame(confettiAnimationId);
            const canvas = document.getElementById('confetti-canvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        window.addEventListener('resize', () => {
            const canvas = document.getElementById('confetti-canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        window.onload = () => {
            loadData();
            showView('home');
        };
