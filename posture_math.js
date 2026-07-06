export const landmarkIndex = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
};

const featureKeys = [
  "headOffset",
  "headHeight",
  "shoulderTilt",
  "shoulderLevel",
  "torsoLean",
  "torsoHeight",
];

const toleranceFloor = {
  headOffset: 0.04,
  headHeight: 0.12,
  shoulderTilt: 0.035,
  shoulderLevel: 0.055,
  torsoLean: 0.04,
  torsoHeight: 0.10,
};

const featureWeights = {
  headOffset: 1.0,
  headHeight: 1.2,
  shoulderTilt: 1.2,
  shoulderLevel: 0.8,
  torsoLean: 1.0,
  torsoHeight: 1.5,
};

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function shoulderWidth(landmarks) {
  const left = landmarks[landmarkIndex.leftShoulder];
  const right = landmarks[landmarkIndex.rightShoulder];
  return Math.max(Math.abs(right.x - left.x), 0.001);
}

export function extractFeatures(landmarks) {
  const nose = landmarks[landmarkIndex.nose];
  const leftShoulder = landmarks[landmarkIndex.leftShoulder];
  const rightShoulder = landmarks[landmarkIndex.rightShoulder];
  const leftHip = landmarks[landmarkIndex.leftHip];
  const rightHip = landmarks[landmarkIndex.rightHip];
  const shoulders = midpoint(leftShoulder, rightShoulder);
  const hips = midpoint(leftHip, rightHip);
  const width = shoulderWidth(landmarks);

  return {
    headOffset: Math.abs(nose.x - shoulders.x) / width,
    headHeight: (shoulders.y - nose.y) / width,
    shoulderTilt: Math.abs(leftShoulder.y - rightShoulder.y) / width,
    shoulderLevel: shoulders.y,
    torsoLean: Math.abs(shoulders.x - hips.x) / width,
    torsoHeight: (hips.y - shoulders.y) / width,
  };
}

export function averageFeatures(samples) {
  const totals = samples.reduce(
    (acc, sample) => {
      for (const key of featureKeys) {
        acc[key] += sample[key];
      }
      return acc;
    },
    {
      headOffset: 0,
      headHeight: 0,
      shoulderTilt: 0,
      shoulderLevel: 0,
      torsoLean: 0,
      torsoHeight: 0,
    },
  );

  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / samples.length]));
}

export function buildProfile(samples) {
  const target = averageFeatures(samples);
  const tolerance = {};

  for (const key of featureKeys) {
    const averageAbsoluteDeviation =
      samples.reduce((sum, sample) => sum + Math.abs(sample[key] - target[key]), 0) / samples.length;
    tolerance[key] = Math.max(toleranceFloor[key], averageAbsoluteDeviation * 2.8);
  }

  return { target, tolerance };
}

function targetFromProfile(profileOrTarget) {
  return profileOrTarget.target ?? profileOrTarget;
}

function toleranceFromProfile(profileOrTarget) {
  return profileOrTarget.tolerance ?? {};
}

export function deviation(current, profileOrTarget) {
  const target = targetFromProfile(profileOrTarget);
  const tolerance = toleranceFromProfile(profileOrTarget);
  const parts = {};

  for (const key of featureKeys) {
    const rawDifference = Math.abs(current[key] - target[key]);
    parts[key] = Math.max(0, rawDifference - (tolerance[key] ?? 0));
  }

  return {
    score: featureKeys.reduce((sum, key) => sum + parts[key] * featureWeights[key], 0),
    parts,
  };
}
