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
