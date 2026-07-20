const STORAGE_KEY = "luz-de-tela-preferences";

const defaults = {
  color: "#ff3b30",
  name: "Vermelha",
  intensity: 35,
};

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const colorIsValid = /^#[0-9a-f]{6}$/i.test(saved?.color || "");
    const intensityIsValid = Number.isFinite(saved?.intensity);

    return {
      color: colorIsValid ? saved.color : defaults.color,
      name: typeof saved?.name === "string" ? saved.name : defaults.name,
      intensity: intensityIsValid
        ? Math.max(5, Math.min(100, saved.intensity))
        : defaults.intensity,
    };
  } catch {
    return { ...defaults };
  }
}

const state = {
  ...readPreferences(),
  wakeLock: null,
  installPrompt: null,
  isOn: false,
  timerMinutes: 0,
  timerId: null,
  timerEndsAt: null,
};

const controlsScreen = document.querySelector("#controlsScreen");
const lightStage = document.querySelector("#lightStage");
const turnOn = document.querySelector("#turnOn");
const presetButtons = [...document.querySelectorAll(".tone-option[data-color]")];
const customTone = document.querySelector(".custom-tone");
const customColor = document.querySelector("#customColor");
const customSwatch = document.querySelector("#customSwatch");
const intensity = document.querySelector("#intensity");
const intensityValue = document.querySelector("#intensityValue");
const timerButtons = [...document.querySelectorAll(".timer-option")];
const selectionSummary = document.querySelector("#selectionSummary");
const timerStatus = document.querySelector("#timerStatus");
const installButton = document.querySelector("#installButton");
const installDialog = document.querySelector("#installDialog");
const installClose = document.querySelector("#installClose");
const installDone = document.querySelector("#installDone");
const stageFeedback = document.querySelector("#stageFeedback");
const stageIntensity = document.querySelector("#stageIntensity");
const stageTimer = document.querySelector("#stageTimer");
const themeColor = document.querySelector('meta[name="theme-color"]');

const gesture = {
  active: false,
  moved: false,
  ignoreClick: false,
  pointerId: null,
  startY: 0,
  startIntensity: 0,
  feedbackTimer: null,
  clickResetTimer: null,
};

const isIos =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function dimColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = Math.max(0.05, Math.min(1, percent / 100));
  const rgb = {
    r: Math.round(r * factor),
    g: Math.round(g * factor),
    b: Math.round(b * factor),
  };

  return {
    ...rgb,
    css: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
  };
}

function textColorFor({ r, g, b }) {
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 145 ? "#111111" : "#ffffff";
}

function savePreferences() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        color: state.color,
        name: state.name,
        intensity: state.intensity,
      }),
    );
  } catch {
    // The light still works when private browsing blocks local storage.
  }
}

function updateUi() {
  const activeColor = dimColor(state.color, state.intensity);
  const customIsSelected = state.name === "RGB personalizada";
  const timerLabel = state.timerMinutes > 0 ? ` · ${state.timerMinutes} min` : "";

  document.documentElement.style.setProperty("--accent", state.color);
  document.documentElement.style.setProperty("--active-light", activeColor.css);
  document.documentElement.style.setProperty("--stage-ink", textColorFor(activeColor));
  document.documentElement.style.setProperty("--range-progress", `${state.intensity}%`);
  customSwatch.style.background = customColor.value;
  intensity.value = state.intensity;
  intensityValue.value = `${state.intensity}%`;
  intensityValue.textContent = `${state.intensity}%`;
  selectionSummary.textContent = `${state.name} · ${state.intensity}%${timerLabel}`;
  stageTimer.hidden = state.timerMinutes === 0;
  stageTimer.textContent = state.timerMinutes > 0 ? `${state.timerMinutes} min` : "";

  presetButtons.forEach((button) => {
    const isSelected = !customIsSelected && button.dataset.color === state.color;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  customTone.classList.toggle("selected", customIsSelected);

  timerButtons.forEach((button) => {
    const isSelected = Number(button.dataset.minutes) === state.timerMinutes;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (state.isOn) themeColor.setAttribute("content", activeColor.css);
}

function selectColor(color, name) {
  state.color = color.toLowerCase();
  state.name = name;
  updateUi();
  savePreferences();
}

function selectTimer(minutes) {
  state.timerMinutes = minutes;
  timerStatus.textContent = "";
  updateUi();
}

function clearLightTimer() {
  window.clearTimeout(state.timerId);
  state.timerId = null;
  state.timerEndsAt = null;
}

function scheduleLightTimer(endTime) {
  window.clearTimeout(state.timerId);
  const remaining = endTime - Date.now();

  if (remaining <= 0) {
    void turnLightOff("timer");
    return;
  }

  state.timerId = window.setTimeout(() => {
    void turnLightOff("timer");
  }, remaining);
}

function startLightTimer() {
  clearLightTimer();
  if (state.timerMinutes === 0) return;

  state.timerEndsAt = Date.now() + state.timerMinutes * 60 * 1000;
  scheduleLightTimer(state.timerEndsAt);
}

function showStageFeedback() {
  window.clearTimeout(gesture.feedbackTimer);
  stageIntensity.textContent = `${state.intensity}%`;
  stageFeedback.classList.add("visible");
}

function hideStageFeedbackSoon() {
  window.clearTimeout(gesture.feedbackTimer);
  gesture.feedbackTimer = window.setTimeout(() => {
    stageFeedback.classList.remove("visible");
  }, 650);
}

function closeInstallDialog() {
  if (installDialog.open && typeof installDialog.close === "function") {
    installDialog.close();
  } else {
    installDialog.removeAttribute("open");
  }
}

function showIosInstallHelp() {
  if (typeof installDialog.showModal === "function") {
    installDialog.showModal();
  } else {
    installDialog.setAttribute("open", "");
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;

  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    state.wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!state.wakeLock) return;

  try {
    await state.wakeLock.release();
  } finally {
    state.wakeLock = null;
  }
}

async function enterFullscreen() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen support varies by mobile browser.
    }
  }
}

async function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch {
      // Some mobile browsers ignore fullscreen exit requests.
    }
  }
}

async function turnLightOn() {
  state.isOn = true;
  timerStatus.textContent = "";
  updateUi();
  lightStage.classList.add("active");
  lightStage.setAttribute("aria-hidden", "false");
  controlsScreen.setAttribute("aria-hidden", "true");
  controlsScreen.inert = true;
  stageFeedback.classList.remove("visible");
  startLightTimer();
  lightStage.focus({ preventScroll: true });
  await enterFullscreen();
  await requestWakeLock();
}

async function turnLightOff(reason = "manual") {
  clearLightTimer();
  if (!state.isOn) return;

  state.isOn = false;
  lightStage.classList.remove("active");
  lightStage.setAttribute("aria-hidden", "true");
  controlsScreen.removeAttribute("aria-hidden");
  controlsScreen.inert = false;
  stageFeedback.classList.remove("visible");
  themeColor.setAttribute("content", "#000000");
  await releaseWakeLock();
  await exitFullscreen();
  turnOn.focus({ preventScroll: true });

  if (reason === "timer") {
    timerStatus.textContent = "Temporizador concluído. A luz foi apagada.";
  }
}

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectColor(button.dataset.color, button.dataset.name);
  });
});

customColor.addEventListener("input", (event) => {
  selectColor(event.target.value, "RGB personalizada");
});

intensity.addEventListener("input", (event) => {
  state.intensity = Number(event.target.value);
  updateUi();
  savePreferences();
});

timerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTimer(Number(button.dataset.minutes));
  });
});

turnOn.addEventListener("click", turnLightOn);
lightStage.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

  gesture.active = true;
  gesture.moved = false;
  gesture.pointerId = event.pointerId;
  gesture.startY = event.clientY;
  gesture.startIntensity = state.intensity;
  lightStage.setPointerCapture?.(event.pointerId);
});

lightStage.addEventListener("pointermove", (event) => {
  if (!gesture.active || event.pointerId !== gesture.pointerId) return;

  const delta = gesture.startY - event.clientY;
  if (!gesture.moved && Math.abs(delta) < 8) return;

  event.preventDefault();
  gesture.moved = true;
  const travel = Math.max(240, window.innerHeight * 0.6);
  state.intensity = Math.max(
    5,
    Math.min(100, gesture.startIntensity + Math.round((delta / travel) * 100)),
  );
  updateUi();
  showStageFeedback();
});

lightStage.addEventListener("pointerup", (event) => {
  if (!gesture.active || event.pointerId !== gesture.pointerId) return;

  gesture.active = false;
  lightStage.releasePointerCapture?.(event.pointerId);
  if (!gesture.moved) return;

  gesture.ignoreClick = true;
  savePreferences();
  hideStageFeedbackSoon();
  window.clearTimeout(gesture.clickResetTimer);
  gesture.clickResetTimer = window.setTimeout(() => {
    gesture.ignoreClick = false;
  }, 500);
});

lightStage.addEventListener("pointercancel", () => {
  gesture.active = false;
  if (gesture.moved) {
    savePreferences();
    hideStageFeedbackSoon();
  }
});

lightStage.addEventListener("click", (event) => {
  if (gesture.ignoreClick) {
    event.preventDefault();
    gesture.ignoreClick = false;
    return;
  }
  turnLightOff();
});
lightStage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    turnLightOff();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!state.installPrompt) {
    if (isIos) showIosInstallHelp();
    return;
  }
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  installButton.hidden = true;
});

installClose.addEventListener("click", closeInstallDialog);
installDone.addEventListener("click", closeInstallDialog);
installDialog.addEventListener("click", (event) => {
  if (event.target === installDialog) closeInstallDialog();
});

window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  installButton.hidden = true;
});

if (isIos && !isStandalone) installButton.hidden = false;

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.isOn) return;

  requestWakeLock();
  if (state.timerEndsAt) scheduleLightTimer(state.timerEndsAt);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

const savedPreset = presetButtons.find((button) => button.dataset.color === state.color);
if (!savedPreset) customColor.value = state.color;
updateUi();
