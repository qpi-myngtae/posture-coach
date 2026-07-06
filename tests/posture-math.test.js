import { averageFeatures, buildProfile, deviation, extractFeatures } from "../posture_math.js";

const result = document.querySelector("#result");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function landmarks({ noseY = 0.22, shoulderY = 0.44, hipY = 0.74, shoulderX = 0.5 } = {}) {
  return [
    { x: shoulderX, y: noseY },
    {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
    { x: shoulderX - 0.1, y: shoulderY },
    { x: shoulderX + 0.1, y: shoulderY },
    {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
    { x: shoulderX - 0.07, y: hipY },
    { x: shoulderX + 0.07, y: hipY },
  ];
}

function run() {
  const target = averageFeatures([extractFeatures(landmarks())]);
  const centeredButSlumped = extractFeatures(
    landmarks({
      noseY: 0.31,
      shoulderY: 0.50,
      hipY: 0.70,
    }),
  );
  const result = deviation(centeredButSlumped, target);

  assert(result.score > 0.18, `Expected slumped posture to exceed threshold, got ${result.score}`);
  assert(result.parts.headHeight > 0, "Expected head height change to contribute");
  assert(result.parts.torsoHeight > 0, "Expected torso height change to contribute");

  const profile = buildProfile([
    extractFeatures(landmarks()),
    extractFeatures(landmarks({ noseY: 0.225, shoulderY: 0.445, hipY: 0.745 })),
    extractFeatures(landmarks({ noseY: 0.215, shoulderY: 0.435, hipY: 0.735 })),
  ]);
  const sameGoodPostureFromSlightlyDifferentCamera = extractFeatures(
    landmarks({
      noseY: 0.25,
      shoulderY: 0.49,
      hipY: 0.80,
    }),
  );
  const tolerantResult = deviation(sameGoodPostureFromSlightlyDifferentCamera, profile);

  assert(
    tolerantResult.score < 0.18,
    `Expected tolerated good posture to stay under threshold, got ${tolerantResult.score}`,
  );
  assert(profile.tolerance.headHeight > 0, "Expected profile to include head height tolerance");
}

try {
  run();
  result.textContent = "PASS";
  window.__POSTURE_TEST_RESULT__ = { ok: true };
} catch (error) {
  result.textContent = `FAIL: ${error.message}`;
  window.__POSTURE_TEST_RESULT__ = { ok: false, message: error.message };
  throw error;
}
