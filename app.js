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
  if (!unlockBtn || !pongCard || !canvas || !ctx) return;

  const timerEl = document.getElementById("pongTimer");
  const scoreEl = document.getElementById("pongScore");
  const shotEl = document.getElementById("pongShot");
  const powerEl = document.getElementById("pongPower");
  const readyEl = document.getElementById("pongReady");
  const ballsEl = document.getElementById("pongBalls");
  const msgEl = document.getElementById("pongMsg");
  const leftBtn = document.getElementById("pongLeft");
  const rightBtn = document.getElementById("pongRight");
  const startBtn = document.getElementById("pongStart");

  const GAME_SECONDS = 30;
  const FIELD = { w: 960, h: 540 };
  const BUMPER_RADIUS = 30;
  const DRAIN_Y = FIELD.h + 40;
  const GRAVITY = 980;

  const input = {
    left: false,
    right: false
  };

  const state = {
    running: false,
    remain: GAME_SECONDS,
    score: 0,
    combo: 1,
    balls: 3,
    lastTs: 0,
    timerId: null,
    ballInPlay: false
  };

  const ball = {
    x: 860,
    y: 430,
    vx: 0,
    vy: 0,
    r: 11,
    trail: []
  };

  const flippers = {
    left: {
      pivotX: 360,
      pivotY: 488,
      length: 140,
      thick: 13,
      restAngle: -0.28,
      activeAngle: -0.95,
      angle: -0.28
    },
    right: {
      pivotX: 600,
      pivotY: 488,
      length: 140,
      thick: 13,
      restAngle: Math.PI - 0.28,
      activeAngle: Math.PI - 0.95,
      angle: Math.PI - 0.28
    }
  };

  const bumpers = [
    { x: 290, y: 150, r: BUMPER_RADIUS, score: 120 },
    { x: 480, y: 120, r: BUMPER_RADIUS, score: 140 },
    { x: 670, y: 160, r: BUMPER_RADIUS, score: 120 },
    { x: 390, y: 260, r: BUMPER_RADIUS, score: 100 },
    { x: 570, y: 250, r: BUMPER_RADIUS, score: 100 }
  ];

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width > 40 ? rect.width : Math.min(window.innerWidth * 0.96, 520);
    const cssH = cssW * 0.56;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr * (cssW / FIELD.w), 0, 0, dpr * (cssH / FIELD.h), 0, 0);
  }

  function resetBall(waitMode) {
    ball.x = 860;
    ball.y = 430;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
    state.ballInPlay = !waitMode;
    readyEl.textContent = waitMode ? "Ball: WAIT" : "Ball: PLAY";
    readyEl.classList.toggle("on", !waitMode);
  }

  function launchBall() {
    if (state.ballInPlay || !state.running || state.balls <= 0) return;
    ball.vx = -130;
    ball.vy = -560;
    state.ballInPlay = true;
    readyEl.textContent = "Ball: PLAY";
    readyEl.classList.add("on");
    msgEl.textContent = "Launch!";
  }

  function drawTable() {
    ctx.fillStyle = "#0f5a3b";
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);

    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.h);
    grad.addColorStop(0, "rgba(255,255,255,0.09)");
    grad.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);

    ctx.strokeStyle = "#d7e8d6";
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, FIELD.w - 36, FIELD.h - 36);

    ctx.fillStyle = "#2a2f38";
    ctx.fillRect(820, 40, 120, 460);
    ctx.strokeStyle = "#a5adb9";
    ctx.lineWidth = 2;
    ctx.strokeRect(820, 40, 120, 460);

    ctx.strokeStyle = "#d5e7d2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(740, 370);
    ctx.lineTo(620, 500);
    ctx.moveTo(220, 500);
    ctx.lineTo(100, 370);
    ctx.stroke();

    for (const bumper of bumpers) {
      const g = ctx.createRadialGradient(bumper.x - 8, bumper.y - 10, 4, bumper.x, bumper.y, bumper.r + 8);
      g.addColorStop(0, "#fff8a6");
      g.addColorStop(0.4, "#f2db2a");
      g.addColorStop(1, "#8b6f00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffe96a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, bumper.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawFlipper(flipper) {
    const tipX = flipper.pivotX + Math.cos(flipper.angle) * flipper.length;
    const tipY = flipper.pivotY + Math.sin(flipper.angle) * flipper.length;

    ctx.strokeStyle = "#152031";
    ctx.lineWidth = flipper.thick * 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(flipper.pivotX, flipper.pivotY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = "#95bdff";
    ctx.lineWidth = flipper.thick * 1.2;
    ctx.beginPath();
    ctx.moveTo(flipper.pivotX, flipper.pivotY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = "#0f1621";
    ctx.beginPath();
    ctx.arc(flipper.pivotX, flipper.pivotY, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTrail() {
    for (let i = ball.trail.length - 1; i >= 0; i -= 1) {
      const p = ball.trail[i];
      const t = 1 - i / ball.trail.length;
      ctx.fillStyle = `rgba(246, 255, 132, ${0.06 + t * 0.24})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ball.r * (0.25 + t * 0.65), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBall() {
    ctx.fillStyle = "#d8f941";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f8fff0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x - 2, ball.y, ball.r * 0.75, -1.1, 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ball.x + 2, ball.y, ball.r * 0.75, 2.0, 4.2);
    ctx.stroke();
  }

  function updateHud() {
    timerEl.textContent = `Time: ${Math.max(0, state.remain)}`;
    scoreEl.textContent = `Score: ${state.score}`;
    shotEl.textContent = `Combo: x${state.combo}`;
    if (ballsEl) ballsEl.textContent = `Balls: ${state.balls}`;
    const speed = Math.round(Math.hypot(ball.vx, ball.vy));
    powerEl.textContent = `Speed: ${speed}`;
  }

  function normalize(vx, vy) {
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  function reflect(vx, vy, nx, ny, bounciness) {
    const dot = vx * nx + vy * ny;
    return {
      vx: (vx - 2 * dot * nx) * bounciness,
      vy: (vy - 2 * dot * ny) * bounciness
    };
  }

  function collideBumpers() {
    for (const bumper of bumpers) {
      const dx = ball.x - bumper.x;
      const dy = ball.y - bumper.y;
      const dist = Math.hypot(dx, dy);
      const minDist = ball.r + bumper.r;
      if (dist < minDist) {
        const n = normalize(dx, dy);
        ball.x = bumper.x + n.x * (minDist + 0.5);
        ball.y = bumper.y + n.y * (minDist + 0.5);
        const bounced = reflect(ball.vx, ball.vy, n.x, n.y, 1.02);
        ball.vx = bounced.vx + n.x * 70;
        ball.vy = bounced.vy + n.y * 70;
        state.score += bumper.score * state.combo;
        state.combo = clamp(state.combo + 1, 1, 8);
        msgEl.textContent = "Bumper Hit!";
      }
    }
  }

  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const ab2 = abx * abx + aby * aby;
    const apx = px - ax;
    const apy = py - ay;
    const t = clamp((apx * abx + apy * aby) / (ab2 || 1), 0, 1);
    return { x: ax + abx * t, y: ay + aby * t, t };
  }

  function collideFlipper(flipper, pressed) {
    const tipX = flipper.pivotX + Math.cos(flipper.angle) * flipper.length;
    const tipY = flipper.pivotY + Math.sin(flipper.angle) * flipper.length;
    const cp = closestPointOnSegment(ball.x, ball.y, flipper.pivotX, flipper.pivotY, tipX, tipY);
    const dx = ball.x - cp.x;
    const dy = ball.y - cp.y;
    const dist = Math.hypot(dx, dy);
    const hitDist = ball.r + flipper.thick;
    if (dist <= hitDist) {
      const n = normalize(dx, dy);
      ball.x = cp.x + n.x * (hitDist + 0.5);
      ball.y = cp.y + n.y * (hitDist + 0.5);
      const baseBounce = reflect(ball.vx, ball.vy, n.x, n.y, 1.0);
      const impulse = pressed ? 220 : 110;
      ball.vx = clamp(baseBounce.vx + n.x * impulse, -760, 760);
      ball.vy = clamp(baseBounce.vy - Math.abs(n.y) * impulse - 40, -860, 860);
      state.score += pressed ? 45 : 20;
      msgEl.textContent = pressed ? "Great Flip!" : "Flip";
    }
  }

  function updateFlippers(dt) {
    const leftTarget = input.left ? flippers.left.activeAngle : flippers.left.restAngle;
    const rightTarget = input.right ? flippers.right.activeAngle : flippers.right.restAngle;
    const speed = 12;

    flippers.left.angle += (leftTarget - flippers.left.angle) * clamp(dt * speed, 0, 1);
    flippers.right.angle += (rightTarget - flippers.right.angle) * clamp(dt * speed, 0, 1);
  }

  function updatePhysics(dt) {
    if (!state.ballInPlay) return;

    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.r < 22) {
      ball.x = 22 + ball.r;
      ball.vx = Math.abs(ball.vx) * 0.96;
    }
    if (ball.x + ball.r > 938) {
      ball.x = 938 - ball.r;
      ball.vx = -Math.abs(ball.vx) * 0.96;
    }
    if (ball.y - ball.r < 22) {
      ball.y = 22 + ball.r;
      ball.vy = Math.abs(ball.vy) * 0.96;
    }

    collideBumpers();
    collideFlipper(flippers.left, input.left);
    collideFlipper(flippers.right, input.right);

    ball.vx *= 0.999;
    ball.vy *= 0.999;

    ball.trail.unshift({ x: ball.x, y: ball.y });
    const speed = Math.hypot(ball.vx, ball.vy);
    const maxTrail = clamp(Math.round(speed / 26), 8, 28);
    if (ball.trail.length > maxTrail) ball.trail.length = maxTrail;

    if (ball.y - ball.r > DRAIN_Y) {
      state.combo = 1;
      state.ballInPlay = false;
      state.balls -= 1;
      readyEl.textContent = "Ball: WAIT";
      readyEl.classList.remove("on");
      msgEl.textContent = state.balls > 0 ? "Ball Lost - Tap LAUNCH" : "Game Over";
      resetBall(true);
      if (state.balls <= 0) {
        stopGame(false);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, FIELD.w, FIELD.h);
    drawTable();
    drawFlipper(flippers.left);
    drawFlipper(flippers.right);
    drawTrail();
    drawBall();
  }

  function step(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    updateFlippers(dt);
    updatePhysics(dt);
    updateHud();
    render();

    requestAnimationFrame(step);
  }

  function stopGame(showMsg) {
    state.running = false;
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    startBtn.disabled = false;
    startBtn.textContent = "START";
    if (showMsg) msgEl.textContent = "休憩終了!";
  }

  function startGame() {
    state.running = true;
    state.lastTs = 0;
    state.remain = GAME_SECONDS;
    state.score = 0;
    state.combo = 1;
    state.balls = 3;
    msgEl.textContent = "Pinball Start";
    startBtn.disabled = false;
    startBtn.textContent = "LAUNCH";
    resetBall(true);
    updateHud();

    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      if (!state.running) return;
      state.remain -= 1;
      updateHud();
      if (state.remain <= 0) {
        stopGame(true);
      }
    }, 1000);

    requestAnimationFrame(step);
  }

  function unlockSecretGame() {
    const wasHidden = pongCard.classList.contains("is-hidden");
    pongCard.classList.remove("is-hidden");
    requestAnimationFrame(() => {
      resizeCanvas();
      requestAnimationFrame(() => {
        resizeCanvas();
        render();
      });
    });
    if (wasHidden) {
      msgEl.textContent = "シークレットゲーム起動";
      startGame();
      pongCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function bindHold(btn, key) {
    const down = (e) => {
      e.preventDefault();
      input[key] = true;
    };
    const up = (e) => {
      e.preventDefault();
      input[key] = false;
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!state.running) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * FIELD.w;
    if (x < FIELD.w / 2) {
      input.left = true;
      setTimeout(() => {
        input.left = false;
      }, 120);
    } else {
      input.right = true;
      setTimeout(() => {
        input.right = false;
      }, 120);
    }
  });

  bindHold(leftBtn, "left");
  bindHold(rightBtn, "right");

  startBtn.addEventListener("click", () => {
    if (!state.running) {
      startGame();
    } else {
      launchBall();
    }
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
  resetBall(true);
  updateHud();
  render();
})();
