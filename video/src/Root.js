import { jsx as _jsx } from "react/jsx-runtime";
import { Composition } from "remotion";
import { Demo, DURATION, FPS } from "./Demo.js";
import { EMPTY_FOOTAGE, FALLBACK_DATA } from "./types.js";
export function Root() {
    return (_jsx(Composition, { id: "AgencyDiffDemo", component: Demo, durationInFrames: DURATION, fps: FPS, width: 1920, height: 1080, defaultProps: { data: FALLBACK_DATA, footage: EMPTY_FOOTAGE } }));
}
