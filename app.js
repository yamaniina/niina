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
   ssoClientId: document.getElementById("ssoClientId"),
   ssoTenantId: document.getElementById("ssoTenantId"),
   ssoScope: document.getElementById("ssoScope"),
   ssoLogin: document.getElementById("ssoLogin"),
   ssoLogout: document.getElementById("ssoLogout"),
   ssoStatus: document.getElementById("ssoStatus"),
  nextButton: document.getElementById("nextButton"),
  startButton: document.getElementById("startButton"),
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
let audioObjectUrl = null;
let currentAudioCleanup = null;
let currentTtsCleanup = null;
let currentUtterance = null;
let voices = [];
let speechPrimed = false;
let ttsRunId = 0;
let msalClient = null;
let msalAccount = null;

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
  const ssoClientId = localStorage.getItem("ssoClientId") || "";
  const ssoTenantId = localStorage.getItem("ssoTenantId") || "";
  const ssoScope = localStorage.getItem("ssoScope") || "";
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
  elements.ssoClientId.value = ssoClientId;
  elements.ssoTenantId.value = ssoTenantId;
  elements.ssoScope.value = ssoScope;
  elements.poemSelect.setAttribute("data-saved", selectedPoemId);
}

function saveSetting(key, value) {
  localStorage.setItem(key, value);
}

function updateSsoStatus(text, accent = false) {
  if (elements.ssoStatus) {
    elements.ssoStatus.textContent = text;
    elements.ssoStatus.classList.toggle("active", accent);
  }
}

function buildMsalInstance() {
  const clientId = elements.ssoClientId.value.trim();
  const tenant = elements.ssoTenantId.value.trim() || "organizations";
  if (!clientId || !window.msal) return null;
  return new msal.PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
    cache: { cacheLocation: "localStorage" },
  });
}

function initMsalClient() {
  msalClient = buildMsalInstance();
  if (!msalClient) {
    updateSsoStatus("未設定");
    return;
  }
  const accounts = msalClient.getAllAccounts();
  if (accounts.length > 0) {
    msalAccount = accounts[0];
    msalClient.setActiveAccount(msalAccount);
    updateSsoStatus(`サインイン中: ${msalAccount.username}`, true);
  } else {
    msalAccount = null;
    updateSsoStatus("未サインイン");
  }
}

async function getAccessToken() {
  if (!msalClient) throw new Error("MSAL未初期化");
  const scope = elements.ssoScope.value.trim();
  const scopes = scope ? [scope] : ["User.Read"];
  const request = { scopes };
  if (msalAccount) {
    request.account = msalAccount;
  }
  try {
    const result = await msalClient.acquireTokenSilent(request);
    if (result) return result.accessToken;
  } catch (err) {
    // Fallback to popup
  }
  const result = await msalClient.acquireTokenPopup(request);
  if (result && result.account) {
    msalAccount = result.account;
    msalClient.setActiveAccount(msalAccount);
    updateSsoStatus(`サインイン中: ${msalAccount.username}`, true);
  }
  return result.accessToken;
}

async function handleSsoLogin() {
  initMsalClient();
  if (!msalClient) {
    updateSsoStatus("MSALが読み込まれていません");
    return;
  }
  try {
    await getAccessToken();
    updateSsoStatus(`サインイン中: ${msalAccount?.username || ""}`, true);
  } catch (err) {
    console.error(err);
    updateStatus("サインインに失敗しました");
    updateSsoStatus("サインイン失敗");
  }
}

function handleSsoLogout() {
  if (!msalClient) {
    updateSsoStatus("未設定");
    return;
  }
  const account = msalClient.getActiveAccount();
  if (account) {
    msalClient.logoutPopup({ account });
  }
  msalAccount = null;
  updateSsoStatus("未サインイン");
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
  if (idx === -1) {
    updateStatus("選択した歌は現在のキューにありません");
    return;
  }
  cancelAllTimers();
  queueIndex = idx;
  hasPlayedJoka = true;
  updateQueueInfo();
  updateStatus(`歌番号 ${poemId} から再生します`);
  updateDisplay(queue[queueIndex]);
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
    "ssoClientId",
    "ssoTenantId",
    "ssoScope",
    "selectedPoemId",
  ];
  keys.forEach((k) => localStorage.removeItem(k));
  cancelAllTimers();
  loadSettings();
  initMsalClient();
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

function playViaAudio(poem) {
  return new Promise((resolve) => {
    cancelPlayback();
    const audio = ensureAudioElement();
    const src = poem.audio || poem.audioUrl || poem.audio_url;
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
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
        audioObjectUrl = null;
      }
    };
    const handleEnd = () => {
      cleanup();
      safeResolve();
    };
    const handleError = () => {
      updateStatus("音声再生に失敗しました");
      cleanup();
      safeResolve();
    };

    currentAudioCleanup = cleanup;
    audio.addEventListener("ended", handleEnd, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    const requiresAuth = /sharepoint\.com/.test(src);
    const startPlayback = (audioUrl) => {
      audio.src = audioUrl;
      audio.play().catch(() => {
        updateStatus("音声の再生開始に失敗しました");
        cleanup();
        safeResolve();
      });
    };

    if (requiresAuth && !msalClient) {
      updateStatus("認証設定が必要です (Microsoft 365 サインイン)");
      cleanup();
      safeResolve();
    } else if (requiresAuth && msalClient) {
      getAccessToken()
        .then((token) =>
          fetch(src, { headers: { Authorization: `Bearer ${token}` } })
        )
        .then((resp) => {
          if (!resp.ok) throw new Error("audio fetch failed");
          return resp.blob();
        })
        .then((blob) => {
          audioObjectUrl = URL.createObjectURL(blob);
          startPlayback(audioObjectUrl);
        })
        .catch((err) => {
          console.error(err);
          updateStatus("認証付き音声の取得に失敗しました");
          cleanup();
          safeResolve();
        });
    } else {
      startPlayback(src);
    }
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

async function loadPoems() {
  try {
    const response = await fetch("poems.json");
    const data = await response.json();
    poems = data;
    allPoems = poems.filter((p) => p.type === "poem");
    jokaPoem = poems.find((p) => p.type === "joka") || null;
    populatePoemSelect();
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
    moveQueueToSelectedPoem(elements.poemSelect.value);
  });
  elements.resetButton.addEventListener("click", resetSettings);
  elements.ssoClientId.addEventListener("input", () => saveSetting("ssoClientId", elements.ssoClientId.value));
  elements.ssoTenantId.addEventListener("input", () => saveSetting("ssoTenantId", elements.ssoTenantId.value));
  elements.ssoScope.addEventListener("input", () => saveSetting("ssoScope", elements.ssoScope.value));
  elements.ssoLogin.addEventListener("click", handleSsoLogin);
  elements.ssoLogout.addEventListener("click", handleSsoLogout);
  elements.nextButton.addEventListener("click", handleNextClick);
  elements.startButton.addEventListener("click", () => {
    primeAudioUnlock();
    primeSpeechSynthesis();
    updateStatus("音声の準備が完了しました");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  updateReciteGapLabel();
  attachEventListeners();
  initMsalClient();
  populateVoices();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
  loadPoems();
  updateQueueInfo();
});
