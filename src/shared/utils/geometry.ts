import { CSSProperties } from "react";
import { NormalizedBoundingBox } from "@/shared/contracts";

/**
 * Chuyển đổi tọa độ NormalizedBoundingBox [ymin, xmin, ymax, xmax] sang style CSS %
 */
export function normalizeCoordsToBoxStyle(coords: NormalizedBoundingBox): CSSProperties {
  const [ymin, xmin, ymax, xmax] = coords;
  return {
    top: `${ymin * 100}%`,
    left: `${xmin * 100}%`,
    height: `${Math.max(0.008, ymax - ymin) * 100}%`,
    width: `${Math.max(0.008, xmax - xmin) * 100}%`,
  };
}
