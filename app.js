import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";
import { buildProfile, deviation, extractFeatures } from "./posture_math.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const video = document.querySelector("#video");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");

const startButton = document.querySelector("#startButton");
const calibrateButton = document.querySelector("#calibrateButton");
const testAlertButton = document.querySelector("#testAlertButton");
const thresholdInput = document.querySelector("#threshold");
const thresholdValue = document.querySelector("#thresholdValue");
const delayInput = document.querySelector("#delay");
const delayValue = document.querySelector("#delayValue");
const statusPill = document.querySelector("#statusPill");
const stateMetric = document.querySelector("#stateMetric");
const scoreMetric = document.querySelector("#scoreMetric");
const fpsMetric = document.querySelector("#fpsMetric");
const sampleMetric = document.querySelector("#sampleMetric");
const headMeter = document.querySelector("#headMeter");
const shoulderMeter = document.querySelector("#shoulderMeter");
const torsoMeter = document.querySelector("#torsoMeter");
const message = document.querySelector("#message");

let poseLandmarker;
let drawingUtils;
let running = false;
let lastVideoTime = -1;
let lastFrameAt = performance.now();
let fps = 0;
let targetProfile = null;
let badStartedAt = null;
let lastAlertAt = 0;
let audioContext = null;

let threshold = Number(thresholdInput.value);
let alertDelayMs = Number(delayInput.value) * 1000;

const calibration = {
  active: false,
  endsAt: 0,
  samples: [],
};

function updateMessage(text) {
  message.textContent = text;
}

function setState(text, tone = "") {
  statusPill.textContent = text;
  statusPill.className = `status-pill ${tone}`.trim();
  stateMetric.textContent = text;
}

function updateMeters(parts) {
  headMeter.value = (parts?.headOffset ?? 0) + (parts?.headHeight ?? 0);
  shoulderMeter.value = (parts?.shoulderTilt ?? 0) + (parts?.shoulderLevel ?? 0);
  torsoMeter.value = (parts?.torsoLean ?? 0) + (parts?.torsoHeight ?? 0);
}

function syncControls() {
  threshold = Number(thresholdInput.value);
  alertDelayMs = Number(delayInput.value) * 1000;
  thresholdValue.textContent = threshold.toFixed(2);
  delayValue.textContent = `${delayInput.value}초`;
}

async function ensureAudio() {
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    audioContext = new Context();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

async function beep() {
  await ensureAudio();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 980;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.3);
}

function maybeAlert(now) {
  if (now - lastAlertAt < 3500) {
    return;
  }
  lastAlertAt = now;
  beep();
}

async function loadModel() {
  if (poseLandmarker) {
    return;
  }

  setState("로딩", "warn");
  updateMessage("AI 모델을 불러오는 중입니다.");
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  drawingUtils = new DrawingUtils(ctx);
}

function sizeCanvas() {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;
}

async function startCamera() {
  startButton.disabled = true;
  try {
    await ensureAudio();
    await loadModel();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      },
    });
    video.srcObject = stream;
    await video.play();
    sizeCanvas();
    running = true;
    calibrateButton.disabled = false;
    testAlertButton.disabled = false;
    setState("준비", "");
    updateMessage("바른 자세로 앉고 목표 자세를 저장하세요.");
    requestAnimationFrame(renderLoop);
  } catch (error) {
    startButton.disabled = false;
    setState("오류", "bad");
    updateMessage(`카메라를 시작하지 못했습니다: ${error.message}`);
  }
}

function startCalibration() {
  if (!running) {
    return;
  }
  calibration.active = true;
  calibration.endsAt = performance.now() + 3000;
  calibration.samples = [];
  targetProfile = null;
  badStartedAt = null;
  setState("저장 중", "warn");
  updateMessage("자세를 유지하세요.");
}

function finishCalibration() {
  calibration.active = false;
  if (calibration.samples.length < 8) {
    setState("재시도", "warn");
    sampleMetric.textContent = String(calibration.samples.length);
    updateMessage("몸 전체가 보이도록 앉은 뒤 다시 저장하세요.");
    return;
  }

  targetProfile = buildProfile(calibration.samples);
  sampleMetric.textContent = String(calibration.samples.length);
  setState("저장됨", "good");
  updateMessage("목표 자세가 저장되었습니다.");
}

function drawBlank() {
  ctx.fillStyle = "#15181d";
  ctx.fillRect(0, 0, canvas.width || 1280, canvas.height || 720);
}

function drawResults(results) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const landmarks = results.landmarks?.[0];
  if (landmarks) {
    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: "#14b8a6",
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: "#f97316",
      lineWidth: 2,
      radius: 3,
    });
  }
  ctx.restore();
}

function updatePostureState(features, now) {
  if (calibration.active) {
    calibration.samples.push(features);
    const remaining = Math.max(0, (calibration.endsAt - now) / 1000);
    sampleMetric.textContent = String(calibration.samples.length);
    setState(`${remaining.toFixed(1)}초`, "warn");
    if (now >= calibration.endsAt) {
      finishCalibration();
    }
    return;
  }

  if (!targetProfile) {
    setState("준비", "");
    scoreMetric.textContent = "-";
    updateMeters(null);
    return;
  }

  const result = deviation(features, targetProfile);
  scoreMetric.textContent = result.score.toFixed(3);
  updateMeters(result.parts);

  if (result.score > threshold) {
    badStartedAt ??= now;
    const badMs = now - badStartedAt;
    if (badMs >= alertDelayMs) {
      setState("자세 이탈", "bad");
      updateMessage("목표 자세에서 벗어났습니다.");
      maybeAlert(now);
    } else {
      setState("주의", "warn");
      updateMessage(`${(badMs / 1000).toFixed(1)}초 동안 자세가 흔들렸습니다.`);
    }
  } else {
    badStartedAt = null;
    setState("좋은 자세", "good");
    updateMessage("목표 자세 범위 안에 있습니다.");
  }
}

function updateFps(now) {
  const delta = now - lastFrameAt;
  lastFrameAt = now;
  fps = fps * 0.88 + (1000 / Math.max(delta, 1)) * 0.12;
  fpsMetric.textContent = String(Math.round(fps));
}

function renderLoop(now) {
  if (!running) {
    return;
  }

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    updateFps(now);
    const results = poseLandmarker.detectForVideo(video, now);
    drawResults(results);

    const landmarks = results.landmarks?.[0];
    if (!landmarks) {
      badStartedAt = null;
      scoreMetric.textContent = "-";
      updateMeters(null);
      setState("미감지", "warn");
      updateMessage("상체가 화면 안에 들어오게 앉으세요.");
    } else {
      updatePostureState(extractFeatures(landmarks), now);
    }
  }

  requestAnimationFrame(renderLoop);
}

startButton.addEventListener("click", startCamera);
calibrateButton.addEventListener("click", startCalibration);
testAlertButton.addEventListener("click", beep);
thresholdInput.addEventListener("input", syncControls);
delayInput.addEventListener("input", syncControls);

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s" && !calibrateButton.disabled) {
    startCalibration();
  }
});

syncControls();
drawBlank();
