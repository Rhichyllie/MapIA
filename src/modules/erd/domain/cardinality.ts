import type { ErdCardinality } from "./types";

export type ErdCardinalityPreset = "1:1" | "1:N" | "N:1" | "N:N";

const PRESET_MAP: Record<ErdCardinalityPreset, ErdCardinality> = {
  "1:1": {
    minSource: 1,
    maxSource: 1,
    minTarget: 1,
    maxTarget: 1,
  },
  "1:N": {
    minSource: 1,
    maxSource: 1,
    minTarget: 0,
    maxTarget: "N",
  },
  "N:1": {
    minSource: 0,
    maxSource: "N",
    minTarget: 1,
    maxTarget: 1,
  },
  "N:N": {
    minSource: 0,
    maxSource: "N",
    minTarget: 0,
    maxTarget: "N",
  },
};

function compareCardinality(left: ErdCardinality, right: ErdCardinality) {
  return (
    left.minSource === right.minSource &&
    left.maxSource === right.maxSource &&
    left.minTarget === right.minTarget &&
    left.maxTarget === right.maxTarget
  );
}

export function erdCardinalityFromPreset(preset: ErdCardinalityPreset): ErdCardinality {
  return { ...PRESET_MAP[preset] };
}

export function erdCardinalityToPreset(
  cardinality: ErdCardinality | undefined,
): ErdCardinalityPreset | undefined {
  if (!cardinality) {
    return undefined;
  }

  const entries = Object.entries(PRESET_MAP) as Array<[
    ErdCardinalityPreset,
    ErdCardinality,
  ]>;
  const found = entries.find(([, presetValue]) =>
    compareCardinality(cardinality, presetValue),
  );

  return found?.[0];
}

export function formatErdCardinalityLabel(cardinality: ErdCardinality | undefined) {
  if (!cardinality) {
    return "Cardinalidade indefinida";
  }

  return `${cardinality.minSource}..${cardinality.maxSource} - ${cardinality.minTarget}..${cardinality.maxTarget}`;
}

export function isOneToOne(cardinality: ErdCardinality | undefined) {
  if (!cardinality) {
    return false;
  }

  return (
    cardinality.minSource === 1 &&
    cardinality.maxSource === 1 &&
    cardinality.minTarget === 1 &&
    cardinality.maxTarget === 1
  );
}

export function isManyToMany(cardinality: ErdCardinality | undefined) {
  if (!cardinality) {
    return false;
  }

  return cardinality.maxSource === "N" && cardinality.maxTarget === "N";
}

export function inferDependentSideFromCardinality(cardinality: ErdCardinality | undefined) {
  if (!cardinality) {
    return undefined;
  }

  if (cardinality.maxSource === "N" && cardinality.maxTarget !== "N") {
    return "source" as const;
  }

  if (cardinality.maxTarget === "N" && cardinality.maxSource !== "N") {
    return "target" as const;
  }

  return undefined;
}
