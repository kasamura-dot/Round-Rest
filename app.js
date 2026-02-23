const GAME_FORMATS = [
  "FOUR_ONLY",
  "FIRST_TO_4",
  "FIRST_TO_6",
  "ONE_SET"
];

const AD_FORMATS = [
  "NO_AD",
  "ONE_AD",
  "DEUCE"
];

const RECOMMENDED_MINUTES = {
  FOUR_ONLY: { NO_AD: 20, ONE_AD: 23, DEUCE: 27 },
  FIRST_TO_4: { NO_AD: 23, ONE_AD: 27, DEUCE: 32 },
  FIRST_TO_6: { NO_AD: 35, ONE_AD: 40, DEUCE: 50 },
  ONE_SET: { NO_AD: 50, ONE_AD: 55, DEUCE: 65 }
};

const state = {
  players: ["P1", "P2", "P3", "P4", "P5"],
  seed: Date.now()
};

const courtsInput = document.getElementById("courts");
const matchFormatSelect = document.getElementById("matchFormat");
const totalMinutesInput = document.getElementById("totalMinutes");
const gameFormatSelect = document.getElementById("gameFormat");
const adFormatSelect = document.getElementById("adFormat");
const roundMinutesInput = document.getElementById("roundMinutes");
const newPlayerInput = document.getElementById("newPlayer");
const addPlayerButton = document.getElementById("addPlayer");
const generateButton = document.getElementById("generate");
const regenerateButton = document.getElementById("regenerate");
const playersList = document.getElementById("playersList");
const playerCount = document.getElementById("playerCount");
const errorBox = document.getElementById("error");
const roundsContainer = document.getElementById("rounds");
const summaryBox = document.getElementById("summary");
const prevRoundButton = document.getElementById("prevRound");
const nextRoundButton = document.getElementById("nextRound");
const currentRoundLabel = document.getElementById("currentRoundLabel");

let lastResult = null;
let currentRoundIndex = 0;

function fillOptions(select, values) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function updateRecommendedMinutes() {
  const game = gameFormatSelect.value;
  const ad = adFormatSelect.value;
  roundMinutesInput.value = RECOMMENDED_MINUTES[game][ad];
}

function renderPlayers() {
  playersList.innerHTML = "";
  state.players.forEach((name) => {
    const row = document.createElement("div");
    row.className = "player-item";
    const label = document.createElement("span");
    label.textContent = name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removePlayer(name));
    row.append(label, remove);
    playersList.appendChild(row);
  });
  playerCount.textContent = String(state.players.length);
  newPlayerInput.placeholder = `P${state.players.length + 1}`;
}

function showError(message) {
  if (!message) {
    errorBox.hidden = true;
    errorBox.textContent = "";
    return;
  }
  errorBox.hidden = false;
  errorBox.textContent = message;
}

function addPlayer() {
  let name = newPlayerInput.value.trim();
  if (!name) {
    let next = state.players.length + 1;
    while (state.players.includes(`P${next}`)) {
      next += 1;
    }
    name = `P${next}`;
  }
  if (state.players.includes(name)) {
    showError("Player name must be unique.");
    return;
  }
  if (state.players.length >= 16) {
    showError("Players cannot exceed 16.");
    return;
  }
  state.players.push(name);
  newPlayerInput.value = "";
  showError("");
  renderPlayers();
}

function removePlayer(name) {
  if (state.players.length <= 4) {
    showError("Players must be at least 4.");
    return;
  }
  state.players = state.players.filter((p) => p !== name);
  showError("");
  renderPlayers();
}

function shuffle(array, rng) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pickByLeastPlayed(candidates, count, stats, rng, roundIndex) {
  if (count === 0) return [];
  const buckets = new Map();
  candidates.forEach((player) => {
    const played = stats[player].played;
    if (!buckets.has(played)) buckets.set(played, []);
    buckets.get(played).push(player);
  });
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const selected = [];
  for (const key of sortedKeys) {
    if (selected.length === count) break;
    const bucket = buckets.get(key).slice();
    // Prefer players who rested recently to play now, so rests stay spaced out.
    bucket.sort((a, b) => {
      const aLast = stats[a].lastRestRound;
      const bLast = stats[b].lastRestRound;
      const aGap = aLast === null ? Number.POSITIVE_INFINITY : roundIndex - aLast;
      const bGap = bLast === null ? Number.POSITIVE_INFINITY : roundIndex - bLast;
      if (aGap === bGap) return 0;
      return aGap - bGap;
    });
    const withTieShuffle = [];
    let idx = 0;
    while (idx < bucket.length) {
      const start = idx;
      const base = bucket[idx];
      const baseLast = stats[base].lastRestRound;
      const baseGap = baseLast === null ? Number.POSITIVE_INFINITY : roundIndex - baseLast;
      idx += 1;
      while (idx < bucket.length) {
        const cur = bucket[idx];
        const curLast = stats[cur].lastRestRound;
        const curGap = curLast === null ? Number.POSITIVE_INFINITY : roundIndex - curLast;
        if (curGap !== baseGap) break;
        idx += 1;
      }
      const slice = bucket.slice(start, idx);
      withTieShuffle.push(...shuffle(slice, rng));
    }
    const bucketShuffled = withTieShuffle;
    const remaining = count - selected.length;
    selected.push(...bucketShuffled.slice(0, remaining));
  }
  return selected;
}

function generateSchedule(players, courts, rounds, seed, matchFormat) {
  const slots = courts * (matchFormat === "singles" ? 2 : 4);
  if (players.length < 4 || players.length > 16) {
    throw new Error("Players must be between 4 and 16.");
  }
  if (courts < 1 || courts > 4) {
    throw new Error("Courts must be between 1 and 4.");
  }
  if (rounds < 1) {
    throw new Error("Rounds must be at least 1.");
  }
  if (slots > players.length) {
    throw new Error("Need at least " + slots + " players.");
  }
  const unique = new Set(players);
  if (unique.size !== players.length) {
    throw new Error("Player names must be unique.");
  }

  const rng = seededRandom(seed);
  const stats = {};
  players.forEach((p) => {
    stats[p] = {
      played: 0,
      rest: 0,
      consecutiveRest: 0,
      maxConsecutiveRest: 0,
      lastRestRound: null
    };
  });

  let previousRest = [];
  let totalExceptions = 0;
  const roundsResult = [];

  for (let i = 0; i < rounds; i += 1) {
    const mustPlay = previousRest;
    let selected;
    if (mustPlay.length >= slots) {
      selected = pickByLeastPlayed(mustPlay, slots, stats, rng, i);
    } else {
      const chosen = mustPlay.slice();
      const remaining = players.filter((p) => !chosen.includes(p));
      const need = slots - chosen.length;
      chosen.push(...pickByLeastPlayed(remaining, need, stats, rng, i));
      selected = chosen;
    }

    const shuffled = shuffle(selected, rng);
    const courtsList = [];
    if (matchFormat === "singles") {
      for (let c = 0; c < courts; c += 1) {
        const group = shuffled.slice(c * 2, c * 2 + 2);
        courtsList.push({
          courtNumber: c + 1,
          teamA: [group[0]],
          teamB: [group[1]]
        });
      }
    } else {
      for (let c = 0; c < courts; c += 1) {
        const group = shuffled.slice(c * 4, c * 4 + 4);
        courtsList.push({
          courtNumber: c + 1,
          teamA: [group[0], group[1]],
          teamB: [group[2], group[3]]
        });
      }
    }

    const selectedSet = new Set(selected);
    const rests = players.filter((p) => !selectedSet.has(p));
    const exceptions = Math.max(0, mustPlay.length - slots);
    totalExceptions += exceptions;

    players.forEach((player) => {
      const s = stats[player];
      if (selectedSet.has(player)) {
        s.played += 1;
        s.consecutiveRest = 0;
      } else {
        s.rest += 1;
        s.consecutiveRest += 1;
        s.lastRestRound = i;
        if (s.consecutiveRest > s.maxConsecutiveRest) {
          s.maxConsecutiveRest = s.consecutiveRest;
        }
      }
    });

    roundsResult.push({
      roundNumber: i + 1,
      totalRounds: rounds,
      courts: courtsList,
      rests,
      consecutiveRestExceptions: exceptions
    });

    previousRest = rests;
  }

  const playedCounts = Object.values(stats).map((s) => s.played);
  const maxPlayedMinusMinPlayed = Math.max(...playedCounts) - Math.min(...playedCounts);

  return {
    rounds: roundsResult,
    maxPlayedMinusMinPlayed,
    totalConsecutiveRestExceptions: totalExceptions,
    seed
  };
}

function renderResults(result) {
  roundsContainer.innerHTML = "";
  lastResult = result;
  currentRoundIndex = 0;
  summaryBox.textContent =
    "🎲 " +
    result.seed +
    "  ⚖️ " +
    result.maxPlayedMinusMinPlayed +
    "  ⏸️ " +
    result.totalConsecutiveRestExceptions;

  result.rounds.forEach((round) => {
    const card = document.createElement("div");
    card.className = "round-card";

    const title = document.createElement("h3");
    title.textContent = "Round " + round.roundNumber + "/" + round.totalRounds;
    card.appendChild(title);

    round.courts.forEach((court) => {
      const line = document.createElement("div");
      line.className = "court-line";
      line.textContent =
        "Court " +
        court.courtNumber +
        ": " +
        court.teamA.join(", ") +
        " vs " +
        court.teamB.join(", ");
      card.appendChild(line);
    });

    if (round.rests.length > 0) {
      const rest = document.createElement("div");
      rest.className = "rest";
      rest.textContent = "Rest: " + round.rests.join(", ");
      card.appendChild(rest);
    }

    roundsContainer.appendChild(card);
  });
  updateRoundFocus();
}

function updateRoundFocus() {
  if (!lastResult) return;
  const total = lastResult.rounds.length;
  currentRoundIndex = Math.max(0, Math.min(currentRoundIndex, total - 1));
  currentRoundLabel.textContent = `${currentRoundIndex + 1} / ${total}`;
  prevRoundButton.disabled = currentRoundIndex === 0;
  nextRoundButton.disabled = currentRoundIndex === total - 1;

  const cards = roundsContainer.querySelectorAll(".round-card");
  cards.forEach((card, idx) => {
    card.classList.toggle("current", idx === currentRoundIndex);
    card.classList.toggle("next", idx === currentRoundIndex + 1);
  });
}

function generate() {
  try {
    const courts = Number.parseInt(courtsInput.value, 10);
    const totalMinutes = Number.parseInt(totalMinutesInput.value, 10);
    const roundMinutes = Number.parseInt(roundMinutesInput.value, 10);
    const matchFormat = matchFormatSelect.value;

    if (!Number.isInteger(courts) || courts < 1 || courts > 4) {
      throw new Error("Courts must be between 1 and 4.");
    }
    if (!Number.isInteger(totalMinutes) || totalMinutes <= 0) {
      throw new Error("Total minutes must be positive.");
    }
    if (!Number.isInteger(roundMinutes) || roundMinutes <= 0) {
      throw new Error("Round minutes must be positive.");
    }

    const rounds = Math.floor(totalMinutes / roundMinutes);
    if (rounds < 1) {
      throw new Error("rounds = floor(totalMinutes / roundMinutes) must be at least 1.");
    }

    const result = generateSchedule(state.players, courts, rounds, state.seed, matchFormat);
    renderResults(result);
    showError("");
  } catch (error) {
    showError(error.message || "Failed to generate schedule.");
  }
}

fillOptions(gameFormatSelect, GAME_FORMATS);
fillOptions(adFormatSelect, AD_FORMATS);
updateRecommendedMinutes();
roundMinutesInput.value = RECOMMENDED_MINUTES[gameFormatSelect.value][adFormatSelect.value];

renderPlayers();

addPlayerButton.addEventListener("click", addPlayer);
newPlayerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addPlayer();
  }
});

gameFormatSelect.addEventListener("change", updateRecommendedMinutes);
adFormatSelect.addEventListener("change", updateRecommendedMinutes);

generateButton.addEventListener("click", generate);
regenerateButton.addEventListener("click", () => {
  state.seed += 1;
  generate();
});

prevRoundButton.addEventListener("click", () => {
  currentRoundIndex -= 1;
  updateRoundFocus();
});

nextRoundButton.addEventListener("click", () => {
  currentRoundIndex += 1;
  updateRoundFocus();
});

(() => {
  const unlockBtn = document.getElementById("pongUnlock");
  const pongCard = document.getElementById("secretPong");
  const canvas = document.getElementById("pongCanvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  if (!canvas || !ctx || !unlockBtn || !pongCard) return;

  const timerEl = document.getElementById("pongTimer");
  const scoreEl = document.getElementById("pongScore");
  const shotEl = document.getElementById("pongShot");
  const powerEl = document.getElementById("pongPower");
  const readyEl = document.getElementById("pongReady");
  const msgEl = document.getElementById("pongMsg");
  const leftBtn = document.getElementById("pongLeft");
  const rightBtn = document.getElementById("pongRight");
  const startBtn = document.getElementById("pongStart");

  const READY_MS = 260;
  const GAME_SECONDS = 30;
  const SCORE_POINTS = [0, 15, 30, 40];
  const MISS_MSGS = ["アウト", "ネット", "振り遅れ"];
  const court = { w: 960, h: 540 };
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  const racket = {
    x: court.w / 2 - 70,
    y: court.h - 42,
    w: 140,
    h: 16,
    speed: 520
  };

  const ball = {
    x: court.w / 2,
    y: court.h * 0.33,
    r: 12,
    dx: 170,
    dy: 190,
    spin: 0,
    trail: []
  };

  const inputState = {
    holdLeft: false,
    holdRight: false,
    pointerActive: false
  };

  const game = {
    running: false,
    lastTs: 0,
    startTs: 0,
    remain: GAME_SECONDS,
    scoreStep: 0,
    gamesWon: 0,
    lastRacketMoveTs: performance.now(),
    hudShot: "-",
    hudPower: 0
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width > 40 ? rect.width : Math.min(window.innerWidth * 0.96, 520);
    const cssH = cssW * 0.56;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = cssW / court.w;
    const sy = cssH / court.h;
    ctx.setTransform(dpr * sx, 0, 0, dpr * sy, 0, 0);
  }

  function toCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x01 = clamp((clientX - rect.left) / rect.width, 0, 1);
    return x01 * court.w;
  }

  function resetBall(upward) {
    ball.x = court.w * (0.25 + Math.random() * 0.5);
    ball.y = court.h * 0.33;
    ball.dx = (Math.random() * 2 - 1) * 140;
    ball.dy = upward ? -220 : 220;
    ball.spin = 0;
    ball.trail = [];
  }

  function resetScore() {
    game.scoreStep = 0;
    game.gamesWon = 0;
  }

  function scoreText() {
    const pointText = game.scoreStep >= 4 ? "Game" : String(SCORE_POINTS[game.scoreStep]);
    return `${pointText}-${game.gamesWon}`;
  }

  function computeStancePower(nowTs) {
    const idleMs = Math.max(0, nowTs - game.lastRacketMoveTs);
    const ratio = clamp(idleMs / READY_MS, 0, 1);
    return {
      ready: idleMs >= READY_MS,
      ratio,
      idleMs
    };
  }

  function updateReadyUI(nowTs) {
    const stance = computeStancePower(nowTs);
    readyEl.textContent = `Ready: ${stance.ready ? "ON" : "OFF"}`;
    readyEl.classList.toggle("on", stance.ready);
    game.hudPower = Math.round(stance.ratio * 100);
    powerEl.textContent = `Power: ${game.hudPower}%`;
    return stance;
  }

  function setShot(name) {
    game.hudShot = name;
    shotEl.textContent = `Shot: ${name}`;
  }

  function onRacketHit(nowTs) {
    const center = racket.x + racket.w / 2;
    const offset = clamp((ball.x - center) / (racket.w / 2), -1, 1);
    const stance = computeStancePower(nowTs);
    const powerMul = 1 + stance.ratio * 0.35;
    const baseSpeed = Math.hypot(ball.dx, ball.dy) || 260;
    const nextSpeed = clamp(baseSpeed * powerMul, 220, 520);

    if (Math.abs(offset) < 0.22) {
      setShot("Flat Drive");
      ball.spin = 0;
      ball.dx += offset * 80;
    } else if (offset > 0.22) {
      setShot("Slice");
      ball.spin = 110 + offset * 80;
      ball.dx += 50 + offset * 60;
    } else {
      setShot("Hook");
      ball.spin = -110 + offset * 80;
      ball.dx += -50 + offset * 60;
    }

    const dirX = ball.dx === 0 ? 0 : ball.dx / Math.abs(ball.dx);
    ball.dx = clamp(ball.dx + dirX * 25, -350, 350);
    ball.dy = -Math.sqrt(Math.max(120 * 120, nextSpeed * nextSpeed - ball.dx * ball.dx));
    ball.dy = clamp(ball.dy, -500, -130);

    game.scoreStep += 1;
    if (game.scoreStep >= 4) {
      game.gamesWon += 1;
      game.scoreStep = 0;
      msgEl.textContent = stance.ready ? "READY SHOT! GAME!" : "GAME!";
    } else {
      msgEl.textContent = stance.ready ? "READY SHOT!" : "返球!";
    }
  }

  function applySpin(dt) {
    ball.dx += ball.spin * dt * 0.9;
    ball.spin *= Math.pow(0.08, dt);
  }

  function updateTrail() {
    ball.trail.unshift({ x: ball.x, y: ball.y });
    const speed = Math.hypot(ball.dx, ball.dy);
    const maxLen = clamp(Math.round(speed / 18), 8, 34);
    if (ball.trail.length > maxLen) {
      ball.trail.length = maxLen;
    }
  }

  function drawCourt() {
    ctx.fillStyle = "#3b8f59";
    ctx.fillRect(0, 0, court.w, court.h);

    ctx.strokeStyle = "#e8f2e5";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, court.w - 48, court.h - 48);
    ctx.beginPath();
    ctx.moveTo(court.w / 2, 24);
    ctx.lineTo(court.w / 2, court.h - 24);
    ctx.stroke();

    ctx.strokeStyle = "#dde8d9";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(24, court.h / 2);
    ctx.lineTo(court.w - 24, court.h / 2);
    ctx.stroke();
  }

  function drawRacket(nowTs) {
    const stance = computeStancePower(nowTs);
    ctx.fillStyle = "#1d2f4a";
    ctx.fillRect(racket.x, racket.y, racket.w, racket.h);

    const sweetW = 44;
    const sweetX = racket.x + racket.w / 2 - sweetW / 2;
    const sweetY = racket.y + 2;
    ctx.save();
    if (stance.ready) {
      ctx.shadowColor = "#9fd1ff";
      ctx.shadowBlur = 20;
    }
    ctx.fillStyle = stance.ready ? "#b9e1ff" : "#7ea4c8";
    ctx.fillRect(sweetX, sweetY, sweetW, racket.h - 4);
    ctx.restore();
  }

  function drawBallTrail() {
    for (let i = ball.trail.length - 1; i >= 0; i -= 1) {
      const p = ball.trail[i];
      const t = 1 - i / ball.trail.length;
      const r = ball.r * (0.2 + t * 0.6);
      ctx.fillStyle = `rgba(236, 255, 89, ${0.08 + t * 0.24})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTennisBall() {
    ctx.fillStyle = "#d8f941";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(ball.x - 4, ball.y - 4, ball.r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f7fff0";
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.arc(ball.x - 2, ball.y, ball.r * 0.78, -1.1, 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ball.x + 2, ball.y, ball.r * 0.78, 2.05, 4.25);
    ctx.stroke();
  }

  function handleMiss() {
    const miss = MISS_MSGS[Math.floor(Math.random() * MISS_MSGS.length)];
    msgEl.textContent = `${miss}!`;
    resetScore();
    resetBall(true);
    setShot("-");
    ball.trail = [];
  }

  function step(ts) {
    if (!game.running) return;
    if (!game.lastTs) game.lastTs = ts;
    const dt = Math.min(0.033, (ts - game.lastTs) / 1000);
    game.lastTs = ts;

    if (inputState.holdLeft) {
      racket.x -= racket.speed * dt;
      game.lastRacketMoveTs = ts;
    }
    if (inputState.holdRight) {
      racket.x += racket.speed * dt;
      game.lastRacketMoveTs = ts;
    }
    racket.x = clamp(racket.x, 24, court.w - 24 - racket.w);

    applySpin(dt);
    ball.x += ball.dx * dt;
    ball.y += ball.dy * dt;

    if (ball.x - ball.r < 24) {
      ball.x = 24 + ball.r;
      ball.dx = Math.abs(ball.dx) * 0.98;
      ball.spin *= 0.95;
    } else if (ball.x + ball.r > court.w - 24) {
      ball.x = court.w - 24 - ball.r;
      ball.dx = -Math.abs(ball.dx) * 0.98;
      ball.spin *= 0.95;
    }

    if (ball.y - ball.r < 24) {
      ball.y = 24 + ball.r;
      ball.dy = Math.abs(ball.dy);
    }

    if (
      ball.dy > 0 &&
      ball.y + ball.r >= racket.y &&
      ball.y - ball.r <= racket.y + racket.h &&
      ball.x >= racket.x &&
      ball.x <= racket.x + racket.w
    ) {
      ball.y = racket.y - ball.r - 1;
      onRacketHit(ts);
    }

    if (ball.y - ball.r > court.h + 6) {
      handleMiss();
    }

    updateTrail();
    updateReadyUI(ts);
    scoreEl.textContent = `Score: ${scoreText()}`;

    ctx.clearRect(0, 0, court.w, court.h);
    drawCourt();
    drawRacket(ts);
    drawBallTrail();
    drawTennisBall();

    requestAnimationFrame(step);
  }

  let timerId = null;
  function stopGame(withEndMsg) {
    game.running = false;
    if (timerId) clearInterval(timerId);
    timerId = null;
    startBtn.disabled = false;
    if (withEndMsg) {
      msgEl.textContent = "休憩終了!";
    }
  }

  function startGame() {
    game.running = true;
    game.lastTs = 0;
    game.startTs = performance.now();
    game.remain = GAME_SECONDS;
    resetScore();
    setShot("-");
    powerEl.textContent = "Power: 0%";
    scoreEl.textContent = "Score: 0-0";
    timerEl.textContent = `Time: ${GAME_SECONDS}`;
    msgEl.textContent = "プレイ中";
    ball.trail = [];
    resetBall(false);
    startBtn.disabled = true;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      if (!game.running) return;
      game.remain -= 1;
      timerEl.textContent = `Time: ${Math.max(0, game.remain)}`;
      if (game.remain <= 0) {
        stopGame(true);
      }
    }, 1000);
    requestAnimationFrame(step);
  }

  function unlockSecretGame() {
    const wasHidden = pongCard.classList.contains("is-hidden");
    pongCard.classList.remove("is-hidden");
    // Hidden->visible transition can report zero width on some mobile browsers.
    requestAnimationFrame(() => {
      resizeCanvas();
      requestAnimationFrame(resizeCanvas);
    });
    if (wasHidden) {
      msgEl.textContent = "シークレットゲーム起動";
      startGame();
      pongCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    inputState.pointerActive = true;
    canvas.setPointerCapture(e.pointerId);
    const nx = toCanvasX(e.clientX);
    racket.x = clamp(nx - racket.w / 2, 24, court.w - 24 - racket.w);
    game.lastRacketMoveTs = performance.now();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!inputState.pointerActive) return;
    const nx = toCanvasX(e.clientX);
    racket.x = clamp(nx - racket.w / 2, 24, court.w - 24 - racket.w);
    game.lastRacketMoveTs = performance.now();
  });
  const endPointer = () => {
    inputState.pointerActive = false;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", endPointer);

  function bindHold(btn, key) {
    const down = (e) => {
      e.preventDefault();
      inputState[key] = true;
      game.lastRacketMoveTs = performance.now();
    };
    const up = (e) => {
      e.preventDefault();
      inputState[key] = false;
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  }

  bindHold(leftBtn, "holdLeft");
  bindHold(rightBtn, "holdRight");
  startBtn.addEventListener("click", () => {
    if (!game.running) startGame();
  });

  unlockBtn.addEventListener("click", unlockSecretGame);
  unlockBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    unlockSecretGame();
  });
  unlockBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      unlockSecretGame();
    }
  });

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  updateReadyUI(performance.now());
  scoreEl.textContent = "Score: 0-0";
  timerEl.textContent = "Time: 30";
  setShot("-");
  drawCourt();
  drawRacket(performance.now());
  drawBallTrail();
  drawTennisBall();
})();
