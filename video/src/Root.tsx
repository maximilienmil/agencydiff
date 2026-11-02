import React from "react";
import type { ComponentType } from "react";
import { Composition } from "remotion";
import { Demo, DURATION, FPS } from "./Demo.js";
import { EMPTY_FOOTAGE, FALLBACK_DATA } from "./types.js";
import type { DemoProps } from "./types.js";

export function Root() {
  return (
    <Composition
      id="AgencyDiffDemo"
      component={Demo as unknown as ComponentType<Record<string, unknown>>}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ data: FALLBACK_DATA, footage: EMPTY_FOOTAGE }}
    />
  );
}
