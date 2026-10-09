"""Pixel-backed page layout. OCR always receives native-resolution line crops."""
import math
from dataclasses import dataclass
from typing import List, Tuple

import cv2
import numpy as np
from PIL import Image

Box = Tuple[int, int, int, int]


def ink_mask(gray):
    # Local threshold survives shadows; Otsu retains faint uniform-page strokes.
    local = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 51, 8)
    _, global_mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if np.count_nonzero(global_mask) / gray.size < 0.12:
        local = cv2.bitwise_or(local, global_mask)
    return local


def rule_masks(binary):
    height, width = binary.shape
    masks = []
    for horizontal in (True, False):
        size = (max(40, width // 20), 1) if horizontal else (1, max(40, height // 25))
        opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, size))
        filtered = np.zeros_like(binary)
        contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            length, thickness = (w, h) if horizontal else (h, w)
            if thickness <= 6 and length / max(1, thickness) >= 15:
                filtered[y:y+h, x:x+w] = opened[y:y+h, x:x+w]
        masks.append(filtered)
    return masks


def remove_dotted_guides(binary):
    """Remove only regular runs of >=6 tiny dots from the detection mask."""
    _, _, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    characters = [h for x, y, w, h, area in stats[1:] if 5 <= h <= 80 and w <= 4*h]
    height = float(np.median(characters)) if characters else 12
    small = max(2, round(height*0.3))
    candidates = sorted((tuple(int(n) for n in box[:4]) for box in stats[1:]
                         if box[2] <= small and box[3] <= small), key=lambda b: (b[1]+b[3]/2, b[0]))
    rows = {}
    for box in candidates:
        center = box[1]+box[3]/2
        key = round(center)
        row = next((rows[k] for k in (key, key-1, key+1) if k in rows
                    and abs(rows[k][0][1]+rows[k][0][3]/2-center) <= 1), None)
        if row is None: rows[key] = [box]
        else: row.append(box)
    clean, found = binary.copy(), False
    for row in rows.values():
        runs, run = [], []
        for box in sorted(row):
            if run and not (3 <= box[0]-run[-1][0] <= max(12, height)):
                runs.append(run); run = []
            run.append(box)
        runs.append(run)
        for run in runs:
            if len(run) < 6: continue
            spacings = np.diff([box[0] for box in run])
            if np.std(spacings) > max(1, np.mean(spacings)*0.2): continue
            found = True
            for x, y, w, h in run: clean[y:y+h, x:x+w] = 0
    return clean, found


def skew_angle(binary):
    lines = cv2.HoughLinesP(binary, 1, np.pi / 720, threshold=35,
                            minLineLength=max(45, binary.shape[1] // 12), maxLineGap=12)
    if lines is None:
        return 0.0
    votes = []
    for x1, y1, x2, y2 in lines[:, 0]:
        if x2 < x1:
            x1, y1, x2, y2 = x2, y2, x1, y1
        angle = math.degrees(math.atan2(y2-y1, x2-x1))
        if abs(angle) <= 12:
            votes.append((angle, math.hypot(x2-x1, y2-y1)))
    if len(votes) < 3:
        return 0.0
    votes.sort()
    cumulative = 0
    total = sum(length for _, length in votes)
    median = votes[-1][0]
    for angle, length in votes:
        cumulative += length
        if cumulative >= total / 2:
            median = angle
            break
    support = sum(length for angle, length in votes if abs(angle-median) < 1.0) / total
    return median if support >= 0.65 and abs(median) >= 0.75 else 0.0


def ordered_boxes(boxes: List[Box]) -> List[Box]:
    rows = []
    for box in sorted(boxes, key=lambda b: (b[1] + b[3]/2, b[0])):
        x, y, w, h = box
        # Compare with each member, not an ever-expanding row union.
        row = next((r for r in rows if all(
            max(0, min(y+h, b[1]+b[3])-max(y, b[1])) / max(1, min(h, b[3])) >= 0.4
            for b in r)), None)
        if row is None:
            rows.append([box])
        else:
            row.append(box)
    rows.sort(key=lambda r: sum(b[1]+b[3]/2 for b in r)/len(r))
    return [b for row in rows for b in sorted(row, key=lambda b: (b[0], b[1]))]


def text_boxes(mask) -> List[Box]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    mask = mask.copy()
    for index, (x, y, w, h, area) in enumerate(stats[1:], 1):
        touches_edge = x <= 1 or y <= 1 or x+w >= mask.shape[1]-1 or y+h >= mask.shape[0]-1
        if touches_edge and (w > mask.shape[1]*0.65 or h > mask.shape[0]*0.65) and area > mask.size*0.005:
            mask[labels == index] = 0
    heights = [h for x, y, w, h, area in stats[1:] if area >= 4 and 4 <= h <= 80 and w <= h*5]
    character_height = float(np.median(heights)) if heights else 12.0
    kw = max(5, min(35, round(character_height * 1.2)))
    joined = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (kw, 3)))
    contours, _ = cv2.findContours(joined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if h < 5 or w < 4 or w*h < 24:
            continue
        # Tighten back to real ink: dilation must not add blank OCR width/height.
        yy, xx = np.nonzero(mask[y:y+h, x:x+w])
        if not len(xx):
            continue
        tight = (x+int(xx.min()), y+int(yy.min()), int(xx.max()-xx.min()+1), int(yy.max()-yy.min()+1))
        if tight[3] <= 4 and tight[2]/max(1, tight[3]) >= 20:
            continue
        if tight[3] >= 4 and tight[2] >= 2:
            boxes.append(tight)
    return ordered_boxes(boxes)


def _peaks(values, threshold):
    positions = np.flatnonzero(values >= threshold)
    if not len(positions):
        return []
    groups = np.split(positions, np.where(np.diff(positions) > 1)[0]+1)
    return [int(round(float(group.mean()))) for group in groups]


def table_grids(horizontal, vertical):
    joined = cv2.bitwise_or(horizontal, vertical)
    contours, _ = cv2.findContours(joined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    tables = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < 60 or h < 40:
            continue
        column_support = np.count_nonzero(vertical[y:y+h, x:x+w], axis=0)
        row_support = np.count_nonzero(horizontal[y:y+h, x:x+w], axis=1)
        xs = [x+p for p in _peaks(column_support, h*0.8)]
        ys = [y+p for p in _peaks(row_support, w*0.8)]
        # Only complete ruled grids; broken/merged layouts must not invent slots.
        if not (3 <= len(xs) <= 51 and 3 <= len(ys) <= 101):
            continue
        if min(np.diff(xs)) < 12 or min(np.diff(ys)) < 12:
            continue
        # Partial separators imply merged/broken cells, not a smaller uniform grid.
        if any(all(abs(x+p-line) > 4 for line in xs) for p in _peaks(column_support, h*0.15)):
            continue
        if any(all(abs(y+p-line) > 4 for line in ys) for p in _peaks(row_support, w*0.15)):
            continue
        tables.append((xs, ys))
    return sorted(tables, key=lambda t: (t[1][0], t[0][0]))


@dataclass
class PageLayout:
    regions: list
    tables: list
    warnings: list
    skew_degrees: float


def segment_page(image: Image.Image, target_width=2400, max_regions=1000) -> PageLayout:
    original_w, original_h = image.size
    proc_w = min(original_w, target_width)
    proc_h = max(1, round(original_h * proc_w/original_w))
    resized = image.resize((proc_w, proc_h)) if proc_w != original_w else image
    try:
        gray = np.asarray(resized.convert('L'))
    finally:
        if resized is not image:
            resized.close()
    binary = ink_mask(gray)
    angle = skew_angle(binary)
    native = np.asarray(image.convert('RGB'))
    transform = np.array([[1., 0., 0.], [0., 1., 0.]])
    if angle:
        transform = cv2.getRotationMatrix2D((original_w/2, original_h/2), angle, 1)
        radians = math.radians(angle)
        out_w = math.ceil(original_w*abs(math.cos(radians)) + original_h*abs(math.sin(radians)))
        out_h = math.ceil(original_h*abs(math.cos(radians)) + original_w*abs(math.sin(radians)))
        transform[0, 2] += (out_w-original_w)/2
        transform[1, 2] += (out_h-original_h)/2
        native = cv2.warpAffine(native, transform, (out_w, out_h), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
    native_h, native_w = native.shape[:2]
    proc_w = min(native_w, target_width)
    proc_h = max(1, round(native_h*proc_w/native_w))
    gray = cv2.cvtColor(cv2.resize(native, (proc_w, proc_h), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY)
    # Recover fine print at native resolution rather than discarding small components.
    binary = ink_mask(gray)
    _, _, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    char_heights = [h for x, y, w, h, area in stats[1:] if 2 <= h <= 60 and area >= 3 and w <= h*4]
    if proc_w < native_w and char_heights and np.median(char_heights) < 9:
        proc_w, proc_h = native_w, native_h
        gray = cv2.cvtColor(native, cv2.COLOR_RGB2GRAY)
        binary = ink_mask(gray)
    horizontal, vertical = rule_masks(binary)
    rules = cv2.bitwise_or(horizontal, vertical)
    clean = cv2.bitwise_and(binary, cv2.bitwise_not(rules))
    clean, dotted_guides = remove_dotted_guides(clean)
    grids = table_grids(horizontal, vertical)
    outside = clean.copy()
    entries, table_entries = [], []
    for table_index, (xs, ys) in enumerate(grids):
        rows = []
        for y1, y2 in zip(ys, ys[1:]):
            cells = []
            for x1, x2 in zip(xs, xs[1:]):
                bounds = (x1+2, y1+2, x2-x1-3, y2-y1-3)
                bx, by, bw, bh = bounds
                boxes = [(bx+x, by+y, w, h) for x, y, w, h in text_boxes(clean[by:by+bh, bx:bx+bw])]
                cell = {"lineIds": [], "coordinates": None}
                for box in boxes or [bounds]:
                    entries.append({"box": box, "cell": cell, "blank": not boxes, "bounds": bounds})
                cells.append(cell)
            rows.append(cells)
        table_entries.append({"id": f"table_{table_index+1:03d}", "rows": rows, "headerRowCount": 0})
        outside[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1] = 0
    entries.extend({"box": box, "cell": None, "blank": False, "bounds": None} for box in text_boxes(outside))
    if len(entries) > max_regions:
        raise ValueError('Too many text regions; split the document into smaller pages')
    # Assign deterministic IDs in geometric order (including empty table cells).
    order = {box: i for i, box in enumerate(ordered_boxes([e['box'] for e in entries]))}
    entries.sort(key=lambda e: order[e['box']])
    inverse = cv2.invertAffineTransform(transform)
    def source_coordinates(x1, y1, x2, y2):
        corners = np.array([[x1, y1, 1], [x2, y1, 1], [x2, y2, 1], [x1, y2, 1]]) @ inverse.T
        low, high = corners.min(axis=0), corners.max(axis=0)
        return [max(0., low[1]/original_h), max(0., low[0]/original_w), min(1., high[1]/original_h), min(1., high[0]/original_w)]
    regions = []
    try:
        for index, entry in enumerate(entries):
            x, y, w, h = entry['box']
            x1, y1, x2, y2 = max(0, x-3), max(0, y-4), min(proc_w, x+w+3), min(proc_h, y+h+4)
            if entry['bounds']:
                bx, by, bw, bh = entry['bounds']
                x1, y1, x2, y2 = max(bx, x1), max(by, y1), min(bx+bw, x2), min(by+bh, y2)
            x1, y1 = math.floor(x1*native_w/proc_w), math.floor(y1*native_h/proc_h)
            x2, y2 = math.ceil(x2*native_w/proc_w), math.ceil(y2*native_h/proc_h)
            crop = Image.fromarray(native[y1:y2, x1:x2])
            line_id = f"line_{index+1:04d}"
            coords = source_coordinates(x1, y1, x2, y2)
            regions.append((crop, coords, line_id))
            if entry['cell'] is not None:
                entry['cell']['lineIds'].append(line_id)
                bx, by, bw, bh = entry['bounds']
                entry['cell']['coordinates'] = source_coordinates(bx*native_w/proc_w, by*native_h/proc_h, (bx+bw)*native_w/proc_w, (by+bh)*native_h/proc_h)
    except Exception:
        for crop, _, _ in regions:
            crop.close()
        raise
    warnings = ['OCR_DESKEW_APPLIED'] if angle else []
    if grids:
        warnings.append('TABLE_HEADER_UNVERIFIED')
    if dotted_guides:
        warnings.append('OCR_DOTTED_GUIDES_DETECTED')
    return PageLayout(regions, table_entries, warnings, angle)
