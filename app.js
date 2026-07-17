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
const selectionSummary = document.querySelector("#selectionSummary");
const installButton = document.querySelector("#installButton");
const themeColor = document.querySelector('meta[name="theme-color"]');

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

  document.documentElement.style.setProperty("--accent", state.color);
  document.documentElement.style.setProperty("--active-light", activeColor.css);
  document.documentElement.style.setProperty("--stage-ink", textColorFor(activeColor));
  document.documentElement.style.setProperty("--range-progress", `${state.intensity}%`);
  customSwatch.style.background = customColor.value;
  intensity.value = state.intensity;
  intensityValue.value = `${state.intensity}%`;
  intensityValue.textContent = `${state.intensity}%`;
  selectionSummary.textContent = `${state.name} · ${state.intensity}%`;

  presetButtons.forEach((button) => {
    const isSelected = !customIsSelected && button.dataset.color === state.color;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  customTone.classList.toggle("selected", customIsSelected);

  if (state.isOn) themeColor.setAttribute("content", activeColor.css);
}

function selectColor(color, name) {
  state.color = color.toLowerCase();
  state.name = name;
  updateUi();
  savePreferences();
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
  updateUi();
  lightStage.classList.add("active");
  lightStage.setAttribute("aria-hidden", "false");
  controlsScreen.setAttribute("aria-hidden", "true");
  controlsScreen.inert = true;
  lightStage.focus({ preventScroll: true });
  await enterFullscreen();
  await requestWakeLock();
}

async function turnLightOff() {
  state.isOn = false;
  lightStage.classList.remove("active");
  lightStage.setAttribute("aria-hidden", "true");
  controlsScreen.removeAttribute("aria-hidden");
  controlsScreen.inert = false;
  themeColor.setAttribute("content", "#000000");
  await releaseWakeLock();
  await exitFullscreen();
  turnOn.focus({ preventScroll: true });
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

turnOn.addEventListener("click", turnLightOn);
lightStage.addEventListener("click", turnLightOff);
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
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  installButton.hidden = true;
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.isOn) requestWakeLock();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

const savedPreset = presetButtons.find((button) => button.dataset.color === state.color);
if (!savedPreset) customColor.value = state.color;
updateUi();
