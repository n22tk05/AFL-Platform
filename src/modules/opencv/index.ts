export { loadOpenCv, type OpenCvRuntime } from "./loader";
export { convertToGrayscale } from "./grayscale";
export {
  runLineDetectionDebug,
  type DebugPipelineOptions,
  type DebugPipelineResult,
} from "./debug-pipeline";
export {
  DEFAULT_LINE_DETECTION_CONFIG,
  DEFAULT_PREPROCESS_CONFIG,
  type LineDetectionConfig,
  type PreprocessConfig,
} from "./config";
export {
  DEFAULT_CONTOUR_DETECTION_CONFIG,
  type ContourDetectionConfig,
  type ContourHierarchy,
  type FieldCandidate,
  type PixelRect,
} from "./field-types";
export { detectContourCandidates } from "./contour-detector";
export { calculateIou, filterCandidates } from "./box-filter";
export { sortCandidatesGeometrically } from "./geometric-sort";
