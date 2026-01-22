const $ = (sel) => document.querySelector(sel);

const startBtn = $("#startBtn");
const resetBtn = $("#resetBtn");

const levelText = $("#levelText");
const cupsText = $("#cupsText");
const stateText = $("#stateText");
const messageEl = $("#message");
const tableEl = $("#table");

const modal = $("#valentineModal");
const yesBtn = $("#yesBtn");
const noBtn = $("#noBtn");
const valentineResult = $("#valentineResult");

// Level rules:
// Level 1: 2 cups, slow shuffle
// Level 2: 3 cups, fast shuffle + ALWAYS shows Valentine popup after guess
let level = 1;
let cupCount = 2;

let ballIndex = 0;
let lastBallIndex = -1;

let isShuffling = false;
let canPick = false;
let hasPicked = false;

let cups = [];     // visual slot -> cup element
let shadows = [];  // visual slot -> shadow element
let positions = [];
let order = [];

// Progression helpers
let lastPickWasCorrect = null;

// Runaway NO button
let noDodges = 0;

function setMsg(html, tone = "muted") {
    messageEl.className = `message ${tone}`;
    messageEl.innerHTML = html;
}
function setState(text) { stateText.textContent = text; }
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// Better randomness + avoid repeated ball position
function randInt(maxExclusive) {
    if (window.crypto && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
}

// Responsive slot spacing so cups stay on screen
function computePositions(count) {
    const wrap = document.querySelector(".table-wrap");
    const w = wrap ? wrap.clientWidth : window.innerWidth;

    // Cap spread so cups don't go off-screen
    // 120 is approx cup width on mobile; keeps some margin.
    const maxSpread = Math.min(220, Math.floor((w - 120) / 2));
    const spread = Math.max(110, maxSpread);

    if (count === 2) return [-spread, spread];
    return [-spread, 0, spread];
}

function applyLevel(lvl) {
    level = lvl;
    cupCount = (level === 1) ? 2 : 3;

    levelText.textContent = String(level);
    cupsText.textContent = String(cupCount);

    buildTable();
    setIdleLevitate(true);

    setState("Ready");
    setMsg(
        `Press <b>Play</b>. Level ${level}: ${cupCount} cup(s) • ${level === 1 ? "slow shuffle" : "fast shuffle"}`,
        "muted"
    );
}

function buildTable() {
    tableEl.innerHTML = "";
    cups = [];
    shadows = [];

    positions = computePositions(cupCount);
    order = Array.from({ length: cupCount }, (_, i) => i);

    // random ball location (avoid repeats)
    ballIndex = randInt(cupCount);
    if (cupCount > 1 && ballIndex === lastBallIndex) {
        ballIndex = (ballIndex + 1 + randInt(cupCount - 1)) % cupCount;
    }
    lastBallIndex = ballIndex;

    // Ball element
    const ball = document.createElement("div");
    ball.className = "ball";
    ball.style.setProperty("--bx", `0px`);
    ball.style.setProperty("--by", `-180px`);
    tableEl.appendChild(ball);

    // Cups + shadows
    for (let slot = 0; slot < cupCount; slot++) {
        const cup = document.createElement("div");
        cup.className = "cup levitate";
        cup.style.setProperty("--x", `${positions[slot]}px`);
        cup.style.setProperty("--y", `-44px`); // levitation height
        cup.style.setProperty("--dur", `0ms`);

        cup.innerHTML = `
      <div class="cup-shell">
        <div class="cup-rim"></div>
        <div class="cup-mouth"></div>
        <div class="cup-highlight"></div>
        <div class="cup-base"></div>
      </div>
    `;

        // ✅ IMPORTANT: pass the element, not a stale index (fixes middle cup bug)
        cup.addEventListener("click", () => onCupClick(cup));
        tableEl.appendChild(cup);
        cups.push(cup);

        const shadow = document.createElement("div");
        shadow.className = "cup-shadow";
        shadow.style.setProperty("--x", `${positions[slot]}px`);
        shadow.style.setProperty("--dur", `0ms`);
        tableEl.appendChild(shadow);
        shadows.push(shadow);
    }

    // ball hidden until we place it
    updateBallPosition(false, -180, false);
}

function setCupDur(ms) {
    cups.forEach(c => c.style.setProperty("--dur", `${ms}ms`));
    shadows.forEach(s => s.style.setProperty("--dur", `${ms}ms`));
}

function setIdleLevitate(on) {
    cups.forEach(c => {
        c.classList.toggle("levitate", on);
        c.classList.toggle("landed", !on);
        c.classList.remove("lift");
    });
}

function disableCups(disabled) {
    cups.forEach(c => c.classList.toggle("disabled", disabled));
}

function updateBallPosition(show, yPx = -180, dropStyle = false) {
    const ball = tableEl.querySelector(".ball");
    const slotIndex = order.findIndex(logical => logical === ballIndex);
    const x = positions[slotIndex];

    ball.style.setProperty("--bx", `${x}px`);
    ball.style.setProperty("--by", `${yPx}px`);
    ball.classList.toggle("show", !!show);
    ball.classList.toggle("drop", !!dropStyle);
}

function swapSlots(i, j) {
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;

    const tmpCup = cups[i]; cups[i] = cups[j]; cups[j] = tmpCup;
    const tmpShadow = shadows[i]; shadows[i] = shadows[j]; shadows[j] = tmpShadow;

    cups[i].style.setProperty("--x", `${positions[i]}px`);
    cups[j].style.setProperty("--x", `${positions[j]}px`);

    shadows[i].style.setProperty("--x", `${positions[i]}px`);
    shadows[j].style.setProperty("--x", `${positions[j]}px`);
}

async function landCups() {
    setIdleLevitate(false);
    setCupDur(level === 2 ? 160 : 260);

    cups.forEach(c => c.style.setProperty("--y", `0px`));
    await sleep(level === 2 ? 190 : 300);
}

/**
 * Ball placement:
 * - TELEPORT to correct X (no horizontal slide)
 * - DROP vertically (visible)
 * - STAY visible longer
 * - HIDE before cup comes down (prevents seeing through / predictability)
 */
async function placeBallIntoCup() {
    const ball = tableEl.querySelector(".ball");
    const slotIndex = order.findIndex(logical => logical === ballIndex);
    const chosenCup = cups[slotIndex];

    // Lift cup so ball is clearly visible
    setCupDur(level === 2 ? 150 : 220);
    chosenCup.style.setProperty("--y", `-70px`);
    await sleep(level === 2 ? 180 : 260);

    // Teleport ball above correct cup
    ball.classList.add("teleport");
    updateBallPosition(true, -210, false);
    void ball.offsetHeight;
    ball.classList.remove("teleport");

    // Drop vertically only
    updateBallPosition(true, -42, true);

    // Show longer
    await sleep(level === 2 ? 650 : 950);

    // Hide ball BEFORE cup covers
    updateBallPosition(false, -42, false);

    // Cup comes down
    chosenCup.style.setProperty("--y", `0px`);
    await sleep(level === 2 ? 220 : 320);
}

async function play() {
    if (isShuffling) return;
    if (!modal.classList.contains("hidden")) return;

    hasPicked = false;
    canPick = false;
    disableCups(true);

    startBtn.textContent = "Playing…";

    setState("Starting");
    setMsg(`Cups landing… ball being placed…`, "muted");

    await landCups();
    await placeBallIntoCup();

    setState("Shuffling");
    setMsg(`Shuffling… don’t blink`, "muted");

    const moves = (level === 1) ? 4 : 10;
    const dur = (level === 1) ? 520 : 180;
    const pause = (level === 1) ? 220 : 70;

    setCupDur(dur);
    isShuffling = true;

    for (let m = 0; m < moves; m++) {
        let a = randInt(cupCount);
        let b = randInt(cupCount);
        while (b === a) b = randInt(cupCount);

        swapSlots(a, b);
        await sleep(dur + pause);
    }

    isShuffling = false;
    canPick = true;
    setState("Pick a cup");
    disableCups(false);

    startBtn.textContent = "Play";
    setMsg(`Your turn: click a cup to guess where the ball is.`, "muted");
}

async function onCupClick(clickedCup) {
    if (!canPick || isShuffling || hasPicked) return;

    hasPicked = true;
    canPick = false;
    disableCups(true);

    // ✅ Determine current visual slot index at click time
    const visualSlotIndex = cups.indexOf(clickedCup);
    if (visualSlotIndex === -1) return;

    const pickedLogical = order[visualSlotIndex];
    const correct = pickedLogical === ballIndex;

    lastPickWasCorrect = correct;

    // Lift clicked cup
    clickedCup.classList.add("lift");

    // Reveal true ball location WITHOUT sliding
    const trueSlotIndex = order.findIndex(logical => logical === ballIndex);
    const x = positions[trueSlotIndex];
    const ball = tableEl.querySelector(".ball");

    ball.classList.add("teleport");
    ball.style.setProperty("--bx", `${x}px`);
    ball.style.setProperty("--by", `-6px`);
    void ball.offsetHeight;
    ball.classList.remove("teleport");

    ball.classList.add("show");
    ball.classList.remove("drop");

    if (correct) {
        setMsg(`<b style="color: var(--good)">Correct!</b> You found it`, "message");
        setState("Correct");
    } else {
        setMsg(`<b style="color: var(--bad)">Wrong!</b> Try again`, "message");
        setState("Wrong");
    }

    // Level 2 ALWAYS shows Valentine popup
    if (level === 2) {
        await sleep(450);
        showValentineModal();
        return;
    }

    // Level 1 progression
    await sleep(650);
    if (correct) {
        applyLevel(2);
        setMsg(`Nice. Next stage unlocked. Press <b>Play</b>.`, "muted");
    } else {
        applyLevel(1);
        setMsg(`Try again. Press <b>Play</b> to retry Level 1.`, "muted");
    }
}

/* ===== Valentine modal ===== */
function showValentineModal() {
    noDodges = 0;

    valentineResult.textContent = "";
    valentineResult.className = "result muted";

    // Reset NO button positioning
    noBtn.style.position = "relative";
    noBtn.style.left = "0px";
    noBtn.style.top = "0px";

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
}

function hideValentineModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
}

/* ===== Buttons ===== */
startBtn.addEventListener("click", play);

resetBtn.addEventListener("click", () => {
    startBtn.textContent = "Play";
    // Reset ALWAYS returns to Level 1
    applyLevel(1);
});

/* ===== Modal buttons ===== */
yesBtn.addEventListener("click", async () => {
    valentineResult.textContent = "YAYYYYY!!!";
    valentineResult.className = "result";
    await sleep(850);
    hideValentineModal();

    // After Level 2: correct -> back to Level 1, wrong -> retry Level 2
    if (lastPickWasCorrect) {
        applyLevel(1);
        setMsg(`Stage cleared Press <b>Play</b> to restart from Level 1.`, "muted");
    } else {
        applyLevel(2);
        setMsg(`Try again Press <b>Play</b> to retry Level 2.`, "muted");
    }

    startBtn.textContent = "Play";
});

noBtn.addEventListener("click", () => {
    noDodges++;

    valentineResult.textContent =
        noDodges === 1 ? "Are you sure?" :
            noDodges === 2 ? "Really sure??" :
                "I think you can press the yes button!";

    const actions = noBtn.parentElement; // .card-actions
    const pad = 6;

    // Dodge inside actions area
    noBtn.style.position = "absolute";

    const aRect = actions.getBoundingClientRect();
    const bRect = noBtn.getBoundingClientRect();

    const maxX = Math.max(pad, aRect.width - bRect.width - pad);
    const maxY = Math.max(pad, aRect.height - bRect.height - pad);

    const x = pad + Math.random() * maxX;
    const y = pad + Math.random() * maxY;

    noBtn.style.left = `${x}px`;
    noBtn.style.top = `${y}px`;
});

// Clicking outside closes modal; keep progression consistent
modal.addEventListener("click", (e) => {
    if (!e.target.classList.contains("backdrop")) return;

    hideValentineModal();

    if (lastPickWasCorrect) {
        applyLevel(1);
        setMsg(`Stage cleared. Press <b>Play</b> to restart from Level 1.`, "muted");
    } else {
        applyLevel(2);
        setMsg(`Try again Press <b>Play</b> to retry Level 2.`, "muted");
    }

    startBtn.textContent = "Play";
});

// Keep cups on-screen if the device rotates / resizes
window.addEventListener("resize", () => {
    applyLevel(level);
});

/* ===== Boot ===== */
startBtn.textContent = "Play";
applyLevel(1);
