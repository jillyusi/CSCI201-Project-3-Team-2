const scene = document.querySelector("#scene");
const ballEl = document.querySelector("#tt-ball");
const shadowEl = document.querySelector("#tt-shadow");
const leftPaddle = document.querySelector("#tt-left");
const rightPaddle = document.querySelector("#tt-right");
const netEl = document.querySelector(".tt-net");
const animationToggle = document.querySelector("#show-animation");
const phaseEl = document.querySelector("#phase");
const clockEl = document.querySelector("#clock");
const encourageEl = document.querySelector("#encourage");
const scheduleEl = document.querySelector("#schedule");
const errorEl = document.querySelector("#timer-error");
const setup = document.querySelector("#timer-setup");
const taskInput = document.querySelector("#focus-task");
const savedTask = document.querySelector("#saved-task");
const startBtn = document.querySelector("#start");
const pauseBtn = document.querySelector("#pause");
const endBtn = document.querySelector("#end");
const name = document.body.dataset.name || "";

let segments = [];
let index = 0;
let remaining = 25 * 60;
let endsAt = 0;
let running = false;
let timerId = null;
let lineTimer = null;
let lines = [];
let lineIndex = 0;

const rally = {
  t: 0,
  fromLeft: true,
  mode: "idle",
  speed: 0.62,
  frame: 0,
  last: 0
};
let animationOn = true;

function shotPoint(t, fromLeft) {
  const width = scene.clientWidth;
  const height = scene.clientHeight;
  const sceneRect = scene.getBoundingClientRect();
  const netRect = netEl.getBoundingClientRect();
  const leftX = 66;
  const rightX = width - 66;
  const hitY = height - 96;
  const tableY = height - 70;
  const netX = (netRect.left + netRect.right) / 2 - sceneRect.left;
  const netTop = netRect.top - sceneRect.top;
  const clearY = netTop - 40;
  const startX = fromLeft ? leftX : rightX;
  const endX = fromLeft ? rightX : leftX;
  const tNet = Math.min(0.46, Math.max(0.32, (netX - startX) / (endX - startX)));
  const bounceAt = Math.min(0.78, tNet + 0.22);
  const x = startX + (endX - startX) * t;
  let y;
  if (t < tNet) {
    const u = t / tNet;
    y = hitY + (clearY - hitY) * u - Math.sin(Math.PI * u) * 16;
  } else if (t < bounceAt) {
    const u = (t - tNet) / (bounceAt - tNet);
    y = clearY + (tableY - clearY) * u - Math.sin(Math.PI * u) * 8;
  } else {
    const u = (t - bounceAt) / (1 - bounceAt);
    y = tableY + (hitY - tableY) * u - Math.sin(Math.PI * u) * 22;
  }
  return { x: x, y: y, tableY: tableY, nearBounce: Math.abs(t - bounceAt) < 0.05 };
}

function drawRally() {
  const point = shotPoint(rally.t, rally.fromLeft);
  const squash = point.nearBounce ? 1.28 : 1;
  ballEl.style.transform = "translate(" + point.x + "px, " + point.y + "px) scale(" + (1 / squash) + ", " + squash + ")";
  const lift = Math.max(0, point.tableY - point.y);
  shadowEl.style.transform = "translate(" + point.x + "px, " + (point.tableY + 6) + "px) scale(" + (1.2 - Math.min(lift, 70) / 120) + ", 1)";
  shadowEl.style.opacity = String(Math.max(0.08, 0.32 - lift / 280));

  const swingLeft = (rally.fromLeft && rally.t < 0.16) || (!rally.fromLeft && rally.t > 0.84);
  const swingRight = (!rally.fromLeft && rally.t < 0.16) || (rally.fromLeft && rally.t > 0.84);
  leftPaddle.style.transform = "rotate(" + (swingLeft ? -28 : -12) + "deg)";
  rightPaddle.style.transform = "rotate(" + (swingRight ? 28 : 12) + "deg)";
}

function rallyFrame(now) {
  if (rally.mode !== "rally" && rally.mode !== "settling") return;
  if (!rally.last) rally.last = now;
  const dt = Math.min(0.04, (now - rally.last) / 1000);
  rally.last = now;
  let speed = rally.speed;
  if (rally.mode === "settling" && rally.t > 0.72) {
    speed *= Math.max(0.22, 1 - (rally.t - 0.72) / 0.28);
  }
  rally.t += dt * speed;
  if (rally.t >= 1) {
    rally.t = 1;
    if (rally.mode === "settling") {
      rally.mode = "done";
      drawRally();
      return;
    }
    rally.t = 0;
    rally.fromLeft = !rally.fromLeft;
  }
  drawRally();
  rally.frame = window.requestAnimationFrame(rallyFrame);
}

function startRally(speed) {
  rally.speed = speed;
  if (rally.mode === "done" || rally.mode === "idle") {
    rally.t = 0;
    rally.fromLeft = true;
  }
  rally.mode = "rally";
  if (!animationOn) return;
  rally.last = 0;
  window.cancelAnimationFrame(rally.frame);
  rally.frame = window.requestAnimationFrame(rallyFrame);
}

function settleRally() {
  if (!animationOn) {
    rally.mode = "done";
    return;
  }
  if (rally.mode === "idle") {
    rally.t = 0;
    rally.fromLeft = true;
  }
  rally.mode = "settling";
  rally.last = 0;
  window.cancelAnimationFrame(rally.frame);
  rally.frame = window.requestAnimationFrame(rallyFrame);
}

function setAnimation(on) {
  animationOn = on;
  localStorage.setItem("focus-animation", on ? "on" : "off");
  scene.classList.toggle("is-hidden", !on);
  animationToggle.checked = on;
  if (!on) {
    window.cancelAnimationFrame(rally.frame);
    return;
  }
  drawRally();
  if (rally.mode === "rally" || rally.mode === "settling") {
    rally.last = 0;
    rally.frame = window.requestAnimationFrame(rallyFrame);
  }
}

function readNumber(id) {
  return Number(document.querySelector(id).value);
}

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
}

function shorten(task) {
  const words = task.trim().split(/\s+/).slice(0, 7).join(" ");
  if (!words) return "this";
  return words.length > 52 ? words.slice(0, 52).trim() + "…" : words;
}

function fallbackLines(task) {
  const who = name || "You";
  const bit = shorten(task);
  return [
    who + ", one small piece of " + bit + " is enough.",
    "You do not have to feel ready to begin.",
    "Stay with " + bit + " until the bell.",
    "The hard part is the starting. You are in it.",
    "Leave the next step obvious before you stop.",
    who + ", this stretch is smaller than the whole task.",
    "If your mind wanders, come back to the next sentence.",
    "You can stop when this block ends. Not before, not after."
  ];
}

function buildSegments() {
  const mode = setup.querySelector("input[name=mode]:checked").value;
  if (mode === "interval") {
    const focus = readNumber("#focus-minutes");
    const rest = readNumber("#break-minutes");
    const rounds = readNumber("#rounds");
    const longEvery = readNumber("#long-every");
    const longRest = readNumber("#long-minutes");
    if (![focus, rest, rounds, longRest].every((n) => Number.isInteger(n) && n >= 1) || rounds > 12) {
      throw new Error("Use whole minutes, at least 1, and 12 focus rounds or fewer.");
    }
    if (!Number.isInteger(longEvery) || longEvery < 0) {
      throw new Error("Long break every needs a whole number. Use 0 to skip it.");
    }
    const next = [];
    for (let round = 1; round <= rounds; round += 1) {
      next.push({ type: "work", seconds: focus * 60 });
      const moreWork = round < rounds;
      if (!moreWork) break;
      const useLong = longEvery > 0 && round % longEvery === 0;
      next.push({ type: "break", seconds: (useLong ? longRest : rest) * 60 });
    }
    return next;
  }

  const total = readNumber("#total-work");
  if (!Number.isInteger(total) || total < 1 || total > 240) {
    throw new Error("Total work time needs to be a whole number of minutes.");
  }
  const breaks = [...document.querySelectorAll(".break-row")].map((row) => ({
    at: Number(row.querySelector(".break-at").value),
    length: Number(row.querySelector(".break-len").value)
  }));
  breaks.sort((a, b) => a.at - b.at);
  let cursor = 0;
  const next = [];
  breaks.forEach((item) => {
    if (!Number.isInteger(item.at) || !Number.isInteger(item.length) || item.at < 1 || item.length < 1) {
      throw new Error("Each break needs whole minutes of at least 1.");
    }
    if (item.at >= total) {
      throw new Error("Put each break before the work is over. " + item.at + " minutes is not inside " + total + ".");
    }
    if (item.at <= cursor) {
      throw new Error("Breaks need to land at different times, in order.");
    }
    next.push({ type: "work", seconds: (item.at - cursor) * 60 });
    next.push({ type: "break", seconds: item.length * 60 });
    cursor = item.at;
  });
  if (cursor < total) {
    next.push({ type: "work", seconds: (total - cursor) * 60 });
  }
  return next;
}

function describe(list) {
  return list
    .map((segment) => Math.round(segment.seconds / 60) + " min " + (segment.type === "work" ? "focus" : "break"))
    .join("  ·  ");
}

function refreshPreview() {
  try {
    const preview = buildSegments();
    showError("");
    scheduleEl.textContent = describe(preview);
    if (!running) {
      remaining = preview[0].seconds;
      clockEl.textContent = formatClock(remaining);
    }
  } catch (error) {
    scheduleEl.textContent = "";
    showError(error.message);
  }
}

function setFormDisabled(disabled) {
  setup.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function showLine(text) {
  encourageEl.classList.add("is-fading");
  window.setTimeout(() => {
    encourageEl.textContent = text;
    encourageEl.classList.remove("is-fading");
  }, 280);
}

function setPhase(type) {
  scene.classList.remove("is-idle", "is-working", "is-break", "is-done", "is-paused");
  scene.classList.add(type === "break" ? "is-break" : "is-working");
  startRally(type === "break" ? 0.38 : 0.7);
  phaseEl.textContent = type === "break" ? "Break" : "Focus";
  window.clearInterval(lineTimer);
  if (type === "break") {
    showLine("Rest. The next piece of this will still be here.");
    return;
  }
  showLine(lines[lineIndex % lines.length]);
  lineTimer = window.setInterval(() => {
    lineIndex += 1;
    showLine(lines[lineIndex % lines.length]);
  }, 12000);
}

function paint() {
  clockEl.textContent = formatClock(remaining);
}

function finish(message) {
  window.clearInterval(timerId);
  window.clearInterval(lineTimer);
  running = false;
  scene.classList.remove("is-idle", "is-working", "is-break", "is-paused");
  scene.classList.add("is-done");
  settleRally();
  phaseEl.textContent = "Done";
  clockEl.textContent = "00:00";
  showLine(message || (name ? "That's the session, " + name + ". You can stop." : "That's the session. You can stop."));
  startBtn.hidden = false;
  startBtn.textContent = "Start again";
  pauseBtn.hidden = true;
  endBtn.hidden = true;
  setFormDisabled(false);
}

function beginSegment() {
  remaining = segments[index].seconds;
  endsAt = Date.now() + remaining * 1000;
  setPhase(segments[index].type);
  paint();
}

function advance() {
  index += 1;
  if (index >= segments.length) {
    finish();
    return;
  }
  beginSegment();
}

function tick() {
  remaining = Math.ceil((endsAt - Date.now()) / 1000);
  if (remaining <= 0) {
    advance();
    return;
  }
  paint();
}

function loadLines(task) {
  lines = fallbackLines(task);
  lineIndex = 0;
  fetch("/api/encouragement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: task })
  })
    .then((response) => response.json())
    .then((data) => {
      if (!running || !data.lines || !data.lines.length) return;
      lines = data.lines;
      lineIndex = 0;
      if (segments[index] && segments[index].type === "work") {
        showLine(lines[0]);
      }
    })
    .catch(() => {});
}

function start() {
  let next;
  try {
    next = buildSegments();
  } catch (error) {
    showError(error.message);
    return;
  }
  if (!taskInput.value.trim()) {
    showError("Name the task first, even if the name is small.");
    return;
  }
  showError("");
  segments = next;
  index = 0;
  running = true;
  scheduleEl.textContent = describe(segments);
  setFormDisabled(true);
  startBtn.hidden = true;
  pauseBtn.hidden = false;
  pauseBtn.textContent = "Pause";
  endBtn.hidden = false;
  loadLines(taskInput.value.trim());
  beginSegment();
  window.clearInterval(timerId);
  timerId = window.setInterval(tick, 250);
}

function pause() {
  if (!running) {
    endsAt = Date.now() + remaining * 1000;
    running = true;
    scene.classList.remove("is-paused");
    startRally(segments[index].type === "break" ? 0.38 : 0.7);
    pauseBtn.textContent = "Pause";
    if (segments[index].type === "work") {
      lineTimer = window.setInterval(() => {
        lineIndex += 1;
        showLine(lines[lineIndex % lines.length]);
      }, 12000);
    }
    timerId = window.setInterval(tick, 250);
    return;
  }
  remaining = Math.max(1, Math.ceil((endsAt - Date.now()) / 1000));
  window.clearInterval(timerId);
  window.clearInterval(lineTimer);
  running = false;
  rally.mode = "paused";
  window.cancelAnimationFrame(rally.frame);
  scene.classList.add("is-paused");
  pauseBtn.textContent = "Resume";
}

function addBreakRow(at, length) {
  const row = document.createElement("div");
  row.className = "break-row";
  row.innerHTML =
    '<label>After <input class="form-control inline-num break-at" type="number" min="1" value="' + at + '"> min of work, rest <input class="form-control inline-num break-len" type="number" min="1" value="' + length + '"> min</label>' +
    '<button type="button" class="ghost-button remove-break">Remove</button>';
  document.querySelector("#break-rows").appendChild(row);
}

document.querySelector("#add-break").addEventListener("click", () => {
  if (document.querySelectorAll(".break-row").length >= 8) return;
  addBreakRow(25, 5);
  refreshPreview();
});

document.querySelector("#break-rows").addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-break")) return;
  event.target.closest(".break-row").remove();
  refreshPreview();
});

setup.addEventListener("input", refreshPreview);
setup.addEventListener("change", refreshPreview);
setup.addEventListener("submit", (event) => {
  event.preventDefault();
  start();
});

setup.querySelectorAll("input[name=mode]").forEach((input) => {
  input.addEventListener("change", () => {
    const custom = input.value === "custom" && input.checked;
    document.querySelector("#custom-fields").hidden = !custom;
    document.querySelector("#interval-fields").hidden = custom;
    refreshPreview();
  });
});

if (savedTask) {
  savedTask.addEventListener("change", () => {
    if (savedTask.value) taskInput.value = savedTask.value;
  });
}

startBtn.addEventListener("click", start);
pauseBtn.addEventListener("click", pause);
endBtn.addEventListener("click", () => {
  if (segments.length) finish();
});

addBreakRow(25, 5);
refreshPreview();

const remembered = localStorage.getItem("focus-animation");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
setAnimation(remembered === null ? !reduceMotion : remembered === "on");
animationToggle.addEventListener("change", () => setAnimation(animationToggle.checked));
