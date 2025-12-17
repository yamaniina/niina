const STATUS = {
  IDLE: "idle",
  WAITING: "waiting",
  PLAYING: "playing",
};

const elements = {
  practiceMode: document.getElementById("practiceMode"),
  skipJoka: document.getElementById("skipJoka"),
  shuffleToggle: document.getElementById("shuffleToggle"),
  nextButton: document.getElementById("nextButton"),
  status: document.getElementById("status"),
  poemDisplay: document.getElementById("poemDisplay"),
  poemKami: document.getElementById("poemKami"),
  poemShimo: document.getElementById("poemShimo"),
  poemKimariji: document.getElementById("poemKimariji"),
  queueInfo: document.getElementById("queueInfo"),
};

let poems = [];
let allPoems = [];
let jokaPoem = null;
let queue = [];
let queueIndex = 0;
let timers = [];
let status = STATUS.IDLE;
let hasPlayedJoka = false;
const WAIT_DURATION = 2000;
const PLAY_DURATION = 4000;

function loadSettings() {
  const practiceMode = localStorage.getItem("practiceMode") || "all";
  const skipJoka = localStorage.getItem("skipJoka") === "true";
  const shuffleEnabled = localStorage.getItem("shuffleEnabled") === "true";

  elements.practiceMode.value = practiceMode;
  elements.skipJoka.checked = skipJoka;
  elements.shuffleToggle.checked = shuffleEnabled;
}

function saveSetting(key, value) {
  localStorage.setItem(key, value);
}

function updateStatus(text) {
  elements.status.textContent = text;
}

function updateDisplay(poem) {
  if (!poem) {
    elements.poemDisplay.querySelector(".poem-id").textContent = "--";
    elements.poemKami.textContent = "上の句";
    elements.poemShimo.textContent = "下の句";
    elements.poemKimariji.textContent = "決まり字: --";
    return;
  }
  elements.poemDisplay.querySelector(".poem-id").textContent = `${poem.id} ${poem.title || ""}`.trim();
  elements.poemKami.textContent = poem.kami || poem.text || "";
  elements.poemShimo.textContent = poem.shimo || "";
  elements.poemKimariji.textContent = poem.kimariji
    ? `決まり字: ${poem.kimariji} (${poem.kimariji_len}字)`
    : "決まり字: --";
}

function updateQueueInfo() {
  elements.queueInfo.textContent = queue.length
    ? `${queueIndex + 1}/${queue.length} （現在のモード: ${elements.practiceMode.value}）`
    : "なし";
}

function cancelAllTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  status = STATUS.IDLE;
}

function scheduleTimeout(callback, duration) {
  const timer = setTimeout(callback, duration);
  timers.push(timer);
  return timer;
}

function fisherYatesShuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildQueue() {
  const mode = elements.practiceMode.value;
  let filtered = [...allPoems];
  if (mode !== "all") {
    const len = Number(mode);
    filtered = filtered.filter((p) => Number(p.kimariji_len) === len);
  }
  if (elements.shuffleToggle.checked) {
    filtered = fisherYatesShuffle(filtered);
  }
  queue = filtered;
  queueIndex = 0;
  hasPlayedJoka = false;
  cancelAllTimers();
  if (!queue.length) {
    updateStatus("このモードの歌がありません");
    updateDisplay(null);
  } else {
    updateStatus("モード切替完了");
    updateDisplay(null);
  }
  updateQueueInfo();
}

function finishPlayback(afterFinish) {
  status = STATUS.IDLE;
  if (afterFinish) afterFinish();
}

function startPlayback(poem, onFinish) {
  status = STATUS.PLAYING;
  updateDisplay(poem);
  updateStatus(`再生中: ${poem.id}`);
  scheduleTimeout(() => finishPlayback(onFinish), PLAY_DURATION);
}

function waitThenPlay(poem, onFinish) {
  status = STATUS.WAITING;
  updateStatus("次の歌まで2秒待機中…");
  scheduleTimeout(() => startPlayback(poem, onFinish), WAIT_DURATION);
}

function playJokaThenFirst() {
  if (!jokaPoem) {
    hasPlayedJoka = true;
    playNextFromQueue();
    return;
  }
  waitThenPlay(jokaPoem, () => {
    hasPlayedJoka = true;
    if (!queue.length) {
      updateStatus("このモードの歌がありません");
      updateDisplay(null);
      return;
    }
    scheduleTimeout(() => playNextFromQueue(), WAIT_DURATION);
  });
}

function playNextFromQueue() {
  cancelAllTimers();
  if (!queue.length) {
    updateStatus("このモードの歌がありません");
    updateDisplay(null);
    return;
  }
  if (queueIndex >= queue.length) {
    updateStatus("キューを再構築してくださいまたは練習を終了します");
    return;
  }
  const poem = queue[queueIndex];
  waitThenPlay(poem, () => {
    queueIndex += 1;
    updateQueueInfo();
  });
  updateQueueInfo();
}

function handleNextClick() {
  cancelAllTimers();
  if (!hasPlayedJoka && !elements.skipJoka.checked) {
    playJokaThenFirst();
    return;
  }
  if (!queue.length) {
    updateStatus("このモードの歌がありません");
    updateDisplay(null);
    return;
  }
  playNextFromQueue();
}

async function loadPoems() {
  try {
    const response = await fetch("poems.json");
    const data = await response.json();
    poems = data;
    allPoems = poems.filter((p) => p.type === "poem");
    jokaPoem = poems.find((p) => p.type === "joka") || null;
    buildQueue();
    updateStatus("準備完了。モードを選んで「次へ」を押してください。");
  } catch (error) {
    updateStatus("poems.json の読み込みに失敗しました");
    console.error(error);
  }
}

function attachEventListeners() {
  elements.practiceMode.addEventListener("change", () => {
    saveSetting("practiceMode", elements.practiceMode.value);
    buildQueue();
  });
  elements.skipJoka.addEventListener("change", () => {
    saveSetting("skipJoka", elements.skipJoka.checked);
  });
  elements.shuffleToggle.addEventListener("change", () => {
    saveSetting("shuffleEnabled", elements.shuffleToggle.checked);
    buildQueue();
  });
  elements.nextButton.addEventListener("click", handleNextClick);
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  attachEventListeners();
  loadPoems();
  updateQueueInfo();
});
