const STATUS = {
  IDLE: "idle",
  WAITING: "waiting",
  PLAYING: "playing",
};

const elements = {
  practiceMode: document.getElementById("practiceMode"),
  skipJoka: document.getElementById("skipJoka"),
  shuffleToggle: document.getElementById("shuffleToggle"),
  audioMode: document.getElementById("audioMode"),
  reciteMode: document.getElementById("reciteMode"),
  reciteGapMs: document.getElementById("reciteGapMs"),
  reciteGapLabel: document.getElementById("reciteGapLabel"),
  ttsRate: document.getElementById("ttsRate"),
  ttsPitch: document.getElementById("ttsPitch"),
  ttsVoice: document.getElementById("ttsVoice"),
  resetButton: document.getElementById("resetButton"),
  poemSelect: document.getElementById("poemSelect"),
  nextButton: document.getElementById("nextButton"),
  gateLockButton: document.getElementById("gateLockButton"),
  gate: document.getElementById("gate"),
  gateForm: document.getElementById("gateForm"),
  gateInput: document.getElementById("gateInput"),
  gateError: document.getElementById("gateError"),
  appRoot: document.getElementById("appRoot"),
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
let audioElement = null;
let currentAudioCleanup = null;
let currentTtsCleanup = null;
let currentUtterance = null;
let voices = [];
let speechPrimed = false;
let ttsRunId = 0;
let mediaUnlocked = false;
let appInitialized = false;
const GATE_KEY = "gate_unlocked";
const PASSCODE = "にいやま";

function loadSettings() {
  const practiceMode = localStorage.getItem("practiceMode") || "all";
  const skipJoka = localStorage.getItem("skipJoka") === "true";
  const shuffleEnabled = localStorage.getItem("shuffleEnabled") === "true";
  const audioMode = localStorage.getItem("audioMode") || "audio";
  const reciteMode = localStorage.getItem("reciteMode") || "normal";
  const reciteGapMs = Number(localStorage.getItem("reciteGapMs")) || 1200;
  const ttsRate = Number(localStorage.getItem("ttsRate")) || 1;
  const ttsPitch = Number(localStorage.getItem("ttsPitch")) || 1;
  const ttsVoice = localStorage.getItem("ttsVoice") || "";
  const selectedPoemId = localStorage.getItem("selectedPoemId") || "";

  elements.practiceMode.value = practiceMode;
  elements.skipJoka.checked = skipJoka;
  elements.shuffleToggle.checked = shuffleEnabled;
  elements.audioMode.value = audioMode;
  elements.reciteMode.value = reciteMode;
  elements.reciteGapMs.value = reciteGapMs;
  elements.ttsRate.value = ttsRate;
  elements.ttsPitch.value = ttsPitch;
  elements.ttsVoice.setAttribute("data-saved", ttsVoice);
  elements.poemSelect.setAttribute("data-saved", selectedPoemId);
}

function saveSetting(key, value) {
  localStorage.setItem(key, value);
}

function updateStatus(text) {
  elements.status.textContent = text;
}

function updateReciteGapLabel() {
  elements.reciteGapLabel.textContent = `${elements.reciteGapMs.value}ms`;
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
  elements.poemKami.textContent = poem.kami_kana || poem.kami || poem.text || "";
  elements.poemShimo.textContent = poem.shimo_kana || poem.shimo || "";
  elements.poemKimariji.textContent = poem.kimariji
    ? `決まり字: ${poem.kimariji} (${poem.kimariji_len}字)`
    : "決まり字: --";
}

function updateQueueInfo() {
  elements.queueInfo.textContent = queue.length
    ? `${queueIndex + 1}/${queue.length} （現在のモード: ${elements.practiceMode.value}）`
    : "なし";
}

function showGate() {
  elements.gate?.classList.remove("hidden");
  elements.appRoot?.classList.add("hidden");
  if (elements.gateInput) {
    elements.gateInput.value = "";
    setTimeout(() => elements.gateInput.focus(), 0);
  }
}

function showApp() {
  elements.gate?.classList.add("hidden");
  elements.appRoot?.classList.remove("hidden");
}

function populatePoemSelect() {
  if (!elements.poemSelect) return;
  const saved = elements.poemSelect.getAttribute("data-saved") || "";
  elements.poemSelect.innerHTML = '<option value="">-- 選択 --</option>';
  allPoems.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.id} ${p.title || ""}`.trim();
    elements.poemSelect.appendChild(opt);
  });
  elements.poemSelect.value = saved;
}

function moveQueueToSelectedPoem(poemId) {
  if (!poemId) return;
  const idx = queue.findIndex((p) => p.id === poemId);
  if (idx === -1) return;
  queueIndex = idx;
  updateQueueInfo();
}

function unlockGate() {
  localStorage.setItem(GATE_KEY, "1");
  showApp();
  if (!appInitialized) {
    initApp();
  }
  if (elements.gateError) elements.gateError.textContent = "";
}

function lockGate() {
  localStorage.removeItem(GATE_KEY);
  mediaUnlocked = false;
  cancelAllTimers();
  updateStatus("ロックされました。合言葉を入力して再開してください。");
  showGate();
}

function cancelAllTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  cancelPlayback();
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
  const selected = elements.poemSelect?.value || "";
  if (selected) {
    moveQueueToSelectedPoem(selected);
  }
}

function finishPlayback(afterFinish) {
  status = STATUS.IDLE;
  if (afterFinish) afterFinish();
}

function playItem(poem) {
  const mode = elements.audioMode.value;
  if (mode === "tts") {
    return playViaTts(poem);
  }
  return playViaAudio(poem);
}

function startPlayback(poem, onFinish) {
  status = STATUS.PLAYING;
  updateDisplay(poem);
  updateStatus(`再生中: ${poem.id}`);
  playItem(poem)
    .catch(() => {})
    .finally(() => finishPlayback(onFinish));
}

function playWithOptionalWait(poem, onFinish, { skipWait = false } = {}) {
  const reciterMode = elements.reciteMode.value === "reciter";
  if (skipWait || reciterMode) {
    startPlayback(poem, onFinish);
    return;
  }
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
  playWithOptionalWait(jokaPoem, () => {
    hasPlayedJoka = true;
    if (!queue.length) {
      updateStatus("このモードの歌がありません");
      updateDisplay(null);
      return;
    }
    if (elements.reciteMode.value === "reciter") {
      playNextFromQueue();
    } else {
      scheduleTimeout(() => playNextFromQueue(), WAIT_DURATION);
    }
  });
}

function playFromQueueIndex(targetIndex, { skipWait = false } = {}) {
  cancelAllTimers();
  if (!queue.length) {
    updateStatus("このモードの歌がありません");
    updateDisplay(null);
    return;
  }
  if (targetIndex >= queue.length) {
    updateStatus("キューを再構築してくださいまたは練習を終了します");
    return;
  }
  queueIndex = targetIndex;
  const poem = queue[queueIndex];
  playWithOptionalWait(poem, () => {
    queueIndex = Math.min(queueIndex + 1, queue.length);
    updateQueueInfo();
  }, { skipWait });
  updateQueueInfo();
}

function playNextFromQueue() {
  playFromQueueIndex(queueIndex);
}

function handleNextClick() {
  ensureMediaUnlocked();
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

function playSelectedPoem(poemId) {
  if (!poemId) return;
  const idx = queue.findIndex((p) => p.id === poemId);
  if (idx === -1) {
    updateStatus("選択した歌は現在のキューにありません");
    return;
  }
  ensureMediaUnlocked();
  hasPlayedJoka = true;
  playFromQueueIndex(idx, { skipWait: true });
}

function resetSettings() {
  const keys = [
    "practiceMode",
    "skipJoka",
    "shuffleEnabled",
    "audioMode",
    "reciteMode",
    "reciteGapMs",
    "ttsRate",
    "ttsPitch",
    "ttsVoice",
    "selectedPoemId",
  ];
  keys.forEach((k) => localStorage.removeItem(k));
  cancelAllTimers();
  loadSettings();
  buildQueue();
  updateReciteGapLabel();
  updateDisplay(null);
  updateStatus("設定をリセットしました");
}

function cancelPlayback() {
  if (currentAudioCleanup) {
    currentAudioCleanup();
    currentAudioCleanup = null;
  }
  if (currentTtsCleanup) {
    currentTtsCleanup();
    currentTtsCleanup = null;
  }
}

function buildTtsText(poem) {
  if (poem.type === "joka") {
    return poem.text || "";
  }
  if (elements.reciteMode.value === "reciter") {
    return buildReciterPoemText(poem);
  }
  return buildNormalPoemText(poem);
}

function buildNormalPoemText(poem) {
  const kami = (poem.kami_kana || poem.kami || "").replace(/\s+/g, "、");
  const shimo = (poem.shimo_kana || poem.shimo || "").replace(/\s+/g, "、");
  return `${kami}……${shimo}`;
}

function buildReciterPoemText(poem) {
  const kami = `${(poem.kami_kana || poem.kami || "").replace(/\s+/g, "、")}。`;
  const shimo = `${(poem.shimo_kana || poem.shimo || "").replace(/\s+/g, "、")}。`;
  return `${kami}\n\n…………\n\n${shimo}`;
}

function buildReciterPoemSegments(poem) {
  const kami = `${(poem.kami_kana || poem.kami || "").replace(/\s+/g, "、")}。`;
  const shimo = `${(poem.shimo_kana || poem.shimo || "").replace(/\s+/g, "、")}。`;
  return { kamiText: kami, shimoText: shimo };
}

function playViaTts(poem) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      updateStatus("このブラウザは自動音声に対応していません");
      resolve();
      return;
    }

    cancelPlayback();
    const runId = ++ttsRunId;
    let finished = false;
    let gapTimer = null;

    const cleanup = () => {
      if (gapTimer) clearTimeout(gapTimer);
      speechSynthesis.cancel();
      currentUtterance = null;
      currentTtsCleanup = null;
    };

    const safeResolve = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const safeReject = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject();
    };

    const createUtterance = (text) => {
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance = utterance;
      utterance.rate = Number(elements.ttsRate.value) || 1;
      utterance.pitch = Number(elements.ttsPitch.value) || 1;
      const selectedVoiceUri = elements.ttsVoice.value;
      if (selectedVoiceUri) {
        const voice = voices.find((v) => v.voiceURI === selectedVoiceUri || v.name === selectedVoiceUri);
        if (voice) utterance.voice = voice;
      }
      return utterance;
    };

    const speakSegment = (text) =>
      new Promise((segmentResolve, segmentReject) => {
        const utterance = createUtterance(text);
        const clearHandlers = () => {
          utterance.onend = null;
          utterance.onerror = null;
        };
        utterance.onend = () => {
          if (runId !== ttsRunId) return;
          clearHandlers();
          segmentResolve();
        };
        utterance.onerror = () => {
          if (runId !== ttsRunId) return;
          clearHandlers();
          segmentReject();
        };
        speechSynthesis.speak(utterance);
      });

    const waitGap = (duration) =>
      new Promise((gapResolve) => {
        gapTimer = setTimeout(() => {
          if (runId !== ttsRunId) return;
          gapResolve();
        }, duration);
      });

    currentTtsCleanup = () => {
      if (runId === ttsRunId) {
        ttsRunId += 1;
      }
      safeResolve();
    };

    (async () => {
      try {
        if (poem.type === "poem" && elements.reciteMode.value === "reciter") {
          const { kamiText, shimoText } = buildReciterPoemSegments(poem);
          await speakSegment(kamiText);
          if (runId !== ttsRunId) return;
          await waitGap(Number(elements.reciteGapMs.value) || 1200);
          if (runId !== ttsRunId) return;
          await speakSegment(shimoText);
        } else {
          const text = buildTtsText(poem);
          await speakSegment(text);
        }
      } catch (err) {
        console.error(err);
        safeReject();
        return;
      }
      safeResolve();
    })();
  });
}

function ensureAudioElement() {
  if (!audioElement) {
    audioElement = new Audio();
  }
  return audioElement;
}

function normalizeSharePointAudioUrl(url) {
  if (!url) return url;
  const hasDownload = /[?&]download=1(?:&|$)/.test(url);
  if (/sharepoint\.com/.test(url) && !hasDownload) {
    return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
  }
  return url;
}

function playViaAudio(poem) {
  return new Promise((resolve) => {
    cancelPlayback();
    const audio = ensureAudioElement();
    let rawSrc = poem.audio_url || poem.audio || poem.audioUrl;
    if (!rawSrc && poem?.id) {
      rawSrc = `assets/audio/${poem.id}.m4a`;
    }
    const src = normalizeSharePointAudioUrl(rawSrc);
    if (!src) {
      updateStatus("音声ファイルがありません");
      resolve();
      return;
    }

    let finished = false;
    const safeResolve = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    const cleanup = () => {
      audio.pause();
      audio.currentTime = 0;
      audio.removeEventListener("ended", handleEnd);
      audio.removeEventListener("error", handleError);
      currentAudioCleanup = null;
    };
    const handleEnd = () => {
      cleanup();
      safeResolve();
    };
    const handleError = () => {
      updateStatus("音声再生に失敗しました。SharePointにサインインしているか確認してください。");
      cleanup();
      safeResolve();
    };

    currentAudioCleanup = cleanup;
    audio.addEventListener("ended", handleEnd, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.src = src;
    audio.play().catch(() => {
      updateStatus("音声の再生開始に失敗しました。SharePointにサインインしているか確認してください。");
      cleanup();
      safeResolve();
    });
  });
}

function populateVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = window.speechSynthesis.getVoices();
  elements.ttsVoice.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "(デフォルト)";
  elements.ttsVoice.appendChild(placeholder);
  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.ttsVoice.appendChild(option);
  });
  const saved = elements.ttsVoice.getAttribute("data-saved") || localStorage.getItem("ttsVoice") || "";
  elements.ttsVoice.value = saved;
}

function primeSpeechSynthesis() {
  if (!("speechSynthesis" in window) || speechPrimed) return;
  const utter = new SpeechSynthesisUtterance(" ");
  window.speechSynthesis.speak(utter);
  window.speechSynthesis.cancel();
  speechPrimed = true;
}

function primeAudioUnlock() {
  const audio = ensureAudioElement();
  audio.muted = true;
  audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
  audio.play().catch(() => {}).finally(() => {
    audio.pause();
    audio.muted = false;
  });
}

function ensureMediaUnlocked() {
  if (mediaUnlocked) return;
  primeAudioUnlock();
  primeSpeechSynthesis();
  mediaUnlocked = true;
}

async function loadPoems() {
  try {
    const response = await fetch("poems.json");
    const data = await response.json();
    poems = data;
    allPoems = poems.filter((p) => p.type === "poem");
    jokaPoem = poems.find((p) => p.type === "joka") || null;
    populatePoemSelect();
    buildQueue();
    updateStatus("準備完了。「歌を詠む」を押して練習を始めてください。通常モードは2秒待機後、読み手モードは即時再生します。");
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
  elements.audioMode.addEventListener("change", () => {
    saveSetting("audioMode", elements.audioMode.value);
  });
  elements.reciteMode.addEventListener("change", () => {
    saveSetting("reciteMode", elements.reciteMode.value);
  });
  elements.reciteGapMs.addEventListener("input", () => {
    saveSetting("reciteGapMs", elements.reciteGapMs.value);
    updateReciteGapLabel();
  });
  elements.ttsRate.addEventListener("input", () => {
    saveSetting("ttsRate", elements.ttsRate.value);
  });
  elements.ttsPitch.addEventListener("input", () => {
    saveSetting("ttsPitch", elements.ttsPitch.value);
  });
  elements.ttsVoice.addEventListener("change", () => {
    saveSetting("ttsVoice", elements.ttsVoice.value);
  });
  elements.poemSelect.addEventListener("change", () => {
    saveSetting("selectedPoemId", elements.poemSelect.value);
    if (elements.poemSelect.value) {
      playSelectedPoem(elements.poemSelect.value);
    }
  });
  elements.resetButton.addEventListener("click", resetSettings);
  elements.nextButton.addEventListener("click", handleNextClick);
}

function handleGateSubmit(event) {
  event.preventDefault();
  const value = (elements.gateInput?.value || "").trim();
  if (value === PASSCODE) {
    unlockGate();
  } else if (elements.gateError) {
    elements.gateError.textContent = "合言葉が違います";
  }
}

function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  loadSettings();
  updateReciteGapLabel();
  attachEventListeners();
  populateVoices();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
  loadPoems();
  updateQueueInfo();
}

function setupGate() {
  elements.gateForm?.addEventListener("submit", handleGateSubmit);
  elements.gateInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGateSubmit(e);
    }
  });
  elements.gateLockButton?.addEventListener("click", () => {
    lockGate();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupGate();
  if (localStorage.getItem(GATE_KEY) === "1") {
    showApp();
    initApp();
  } else {
    showGate();
  }
});
