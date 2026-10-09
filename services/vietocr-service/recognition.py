"""Split oversized OCR lines at pixel whitespace, keeping every piece in order."""
import math

import numpy as np


def split_wide_line(image, target_height, max_width):
    width, height = image.size
    limit = max(1, math.floor((max_width-20)*height/target_height))
    if width <= limit:
        return [image]
    gray = np.asarray(image.convert('L'))
    # A true word gap has no dark pixels, including Vietnamese diacritics.
    ink = np.any(gray < max(0, float(np.percentile(gray, 90))-25), axis=0)
    gaps = np.flatnonzero(~ink)
    runs = np.split(gaps, np.where(np.diff(gaps) > 1)[0]+1) if len(gaps) else []
    boundaries = [int(round(float(run.mean()))) for run in runs
                  if len(run) >= max(2, round(height*0.12))]
    starts, position = [0], 0
    while width-position > limit:
        candidates = [b for b in boundaries if position+limit*0.45 <= b <= position+limit]
        if not candidates:
            # Do not slice through glyphs. This remainder uses the model width cap.
            break
        position = max(candidates)
        starts.append(position)
    if len(starts) == 1:
        return [image]
    starts.append(width)
    return [image.crop((left, 0, right, height)) for left, right in zip(starts, starts[1:])]
