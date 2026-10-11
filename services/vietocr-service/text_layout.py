import cv2
import numpy as np


def text_ink_mask(gray):
    if gray.ndim != 2 or gray.size == 0:
        raise ValueError("Expected a non-empty grayscale image")
    if int(gray.max()) - int(gray.min()) <= 1:
        return np.zeros(gray.shape, dtype=np.uint8)
    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    height, width = gray.shape
    scale = max(0.5, width / 1200.0)
    remove = np.zeros_like(ink)
    for kernel_size, horizontal in [((max(40, width // 20), 1), True), ((1, max(40, height // 20)), False)]:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, kernel_size)
        lines = cv2.morphologyEx(ink, cv2.MORPH_OPEN, kernel)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(lines, connectivity=8)
        remove_labels = np.zeros(count, dtype=bool)
        for component in range(1, count):
            rect_width, rect_height = stats[component, cv2.CC_STAT_WIDTH], stats[component, cv2.CC_STAT_HEIGHT]
            thickness = rect_height if horizontal else rect_width
            span = rect_width if horizontal else rect_height
            page_span = width if horizontal else height
            fill_ratio = stats[component, cv2.CC_STAT_AREA] / (rect_width * rect_height)
            if thickness <= max(4, round(4 * scale)) or (
                thickness <= max(4, round(20 * scale)) and span >= page_span * 0.25 and fill_ratio < 0.65
            ):
                remove_labels[component] = True
        remove[remove_labels[labels]] = 255
    cleaned = cv2.bitwise_and(ink, cv2.bitwise_not(remove))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
    dots = []
    discard_labels = np.zeros(count, dtype=bool)
    for component in range(1, count):
        left, top, rect_width, rect_height, pixels = [int(value) for value in stats[component]]
        if pixels <= 2 and np.any(remove[max(0, top - 1):top + rect_height + 1, max(0, left - 1):left + rect_width + 1]):
            discard_labels[component] = True
        if rect_width <= 7 * scale and rect_height <= 7 * scale and 0.4 <= rect_width / rect_height <= 2.5:
            dots.append((component, left, top, rect_width, rect_height))
        if 10 * scale <= min(rect_width, rect_height) <= 100 * scale and 0.7 <= rect_width / rect_height <= 1.4:
            crop = ink[top:top + rect_height, left:left + rect_width]
            thickness = max(1, round(min(rect_width, rect_height) * 0.12))
            edges = [crop[:thickness, :], crop[-thickness:, :], crop[:, :thickness], crop[:, -thickness:]]
            covered = [np.count_nonzero(edge) / edge.size for edge in edges]
            interior = crop[thickness:-thickness, thickness:-thickness]
            if min(covered) >= 0.35 and interior.size and np.count_nonzero(interior) / interior.size < 0.02:
                discard_labels[component] = True
    rows = []
    for dot in sorted(dots, key=lambda value: (value[2] + value[4], value[1])):
        baseline = dot[2] + dot[4]
        row = next((existing for existing in rows if abs(existing[0][2] + existing[0][4] - baseline) <= 2 * scale), None)
        if row is None:
            rows.append([dot])
        else:
            row.append(dot)
    for row in rows:
        sequence = []
        groups = []
        for dot in sorted(row, key=lambda value: value[1]):
            if sequence and dot[1] - sequence[-1][1] - sequence[-1][3] > 12 * scale:
                groups.append(sequence)
                sequence = []
            sequence.append(dot)
        groups.append(sequence)
        for group in groups:
            if len(group) < 8 or group[-1][1] + group[-1][3] - group[0][1] < max(40 * scale, width * 0.035):
                continue
            intervals = np.diff([value[1] for value in group])
            if intervals.mean() > 0 and intervals.std() / intervals.mean() <= 0.35:
                for component, *_ in group:
                    discard_labels[component] = True
    cleaned[discard_labels[labels]] = 0
    return cleaned


def has_text_ink(gray):
    mask = text_ink_mask(gray)
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    return any(stats[index, cv2.CC_STAT_HEIGHT] >= 3 and stats[index, cv2.CC_STAT_AREA] >= 6 for index in range(1, count))


def is_sparse_hallucination(gray, confidence, text=""):
    if confidence is None or confidence >= 0.65:
        return False
    mask = text_ink_mask(gray)
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    characters = sum(
        stats[index, cv2.CC_STAT_WIDTH] >= 2
        and stats[index, cv2.CC_STAT_HEIGHT] >= 6
        and stats[index, cv2.CC_STAT_AREA] >= 6
        for index in range(1, count)
    )
    if characters == 0:
        return True
    if confidence < 0.55 and len(text.strip()) >= 8 and gray.shape[1] < 60 and characters <= 4:
        return True
    if 0 < confidence < 0.20 and len(text.strip()) >= 4 and characters <= 2:
        return True
    return characters == 1 and gray.shape[1] >= 60 and np.count_nonzero(mask) / mask.size < 0.03


def ruled_matrix_label_cells(gray):
    if gray.ndim != 2 or gray.shape[0] < 600 or gray.shape[1] < 500:
        return []
    height, width = gray.shape
    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    vertical = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
                                cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(30, height // 35))))
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
                                  cv2.getStructuringElement(cv2.MORPH_RECT, (max(80, width // 10), 1)))
    vertical_contours, _ = cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    horizontal_contours, _ = cv2.findContours(horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = sorted((cv2.boundingRect(contour) for contour in vertical_contours
                         if cv2.boundingRect(contour)[3] >= height * 0.3
                         and cv2.boundingRect(contour)[2] <= max(20, width * 0.025)), key=lambda rect: rect[0])
    walls = None
    positions = None
    label_columns = None
    for start in range(len(candidates) - 4):
        group = candidates[start:start + 5]
        locations = [left + rect_width // 2 for left, _, rect_width, _ in group]
        gaps = np.diff(locations)
        shared_top = max(rect[1] for rect in group)
        shared_bottom = min(rect[1] + rect[3] for rect in group)
        if (30 <= gaps[0] <= width * 0.14 and gaps[1] >= max(200, gaps[0] * 3)
                and all(45 <= gap <= width * 0.2 for gap in gaps[2:])
                and max(gaps[2:]) / min(gaps[2:]) <= 1.5
                and locations[-1] - locations[0] >= width * 0.5
                and shared_bottom - shared_top >= height * 0.28):
            walls, positions, label_columns = group, locations, [(0, 1), (1, 2)]
            break
    if walls is None:
        for anchor in candidates:
            aligned = [rect for rect in candidates if abs(rect[1] - anchor[1]) <= 15
                       and abs(rect[1] + rect[3] - anchor[1] - anchor[3]) <= 15]
            for start in range(len(aligned) - 5):
                group = aligned[start:start + 6]
                locations = [left + rect_width // 2 for left, _, rect_width, _ in group]
                gaps = np.diff(locations)
                shared_top = max(rect[1] for rect in group)
                shared_bottom = min(rect[1] + rect[3] for rect in group)
                if (width * 0.2 <= gaps[0] <= width * 0.5
                        and all(45 <= gap <= width * 0.2 for gap in gaps[1:])
                        and max(gaps[1:]) / min(gaps[1:]) <= 1.5
                        and locations[-1] - locations[0] >= width * 0.5
                        and shared_bottom - shared_top >= height * 0.28):
                    walls, positions, label_columns = group, locations, [(0, 1)]
                    break
            if walls is not None:
                break
    if walls is None:
        return []
    top = max(rect[1] for rect in walls)
    bottom = min(rect[1] + rect[3] for rect in walls)
    if bottom - top < height * 0.28:
        return []
    rules = sorted((cv2.boundingRect(contour) for contour in horizontal_contours
                    if cv2.boundingRect(contour)[2] >= (positions[-1] - positions[0]) * 0.85
                    and cv2.boundingRect(contour)[0] <= positions[0] + 30
                    and cv2.boundingRect(contour)[0] + cv2.boundingRect(contour)[2] >= positions[-1] - 10
                    and top - 15 <= cv2.boundingRect(contour)[1] <= bottom + 15), key=lambda rect: rect[1])
    boundaries = [min(rect[1] for rect in walls)]
    for _, rule_top, _, rule_height in rules:
        location = rule_top + rule_height // 2
        if location - boundaries[-1] >= 25:
            boundaries.append(location)
    open_bottom = bottom - boundaries[-1]
    description_start, description_end = label_columns[-1]
    if (35 <= open_bottom <= max(150, height * 0.13)
            and has_header_text(gray[boundaries[-1] + 3:bottom - 3,
                                     positions[description_start] + 4:positions[description_end] - 4])):
        boundaries.append(bottom)
    if len(boundaries) < 5:
        return []
    cells = []
    for row_top, row_bottom in zip(boundaries, boundaries[1:]):
        if len(label_columns) == 1 and row_bottom != bottom:
            continue
        if row_bottom - row_top > max(150, height * 0.13):
            continue
        for start, end in label_columns:
            first, second = positions[start], positions[end]
            left, right = first + 4, second - 4
            upper, lower = row_top + 3, row_bottom - 3
            if right - left >= 25 and lower - upper >= 20:
                cells.append((left, upper, right, lower))
    return cells


def split_multiline_region(ink, rect):
    left, top, width, height = rect
    if width < 100 or not 44 <= height <= 240:
        return [rect]
    density = np.count_nonzero(ink[top:top + height, left:left + width], axis=1)
    smoothed = np.convolve(density, np.ones(5) / 5, mode="same")
    search_start = round(height * 0.35)
    search_end = round(height * 0.65)
    valley = search_start + int(np.argmin(smoothed[search_start:search_end]))
    if valley < 20 or height - valley < 20:
        return [rect]
    first_peak = max(smoothed[:valley - 8], default=0)
    second_peak = max(smoothed[valley + 8:], default=0)
    if min(first_peak, second_peak) < 18 or smoothed[valley] > min(first_peak, second_peak) * 0.25:
        return [rect]
    upper = (left, top, width, valley + 2)
    lower = (left, top + valley - 2, width, height - valley + 2)
    return split_multiline_region(ink, upper) + split_multiline_region(ink, lower)


def has_header_text(gray):
    mask = text_ink_mask(gray)
    height, width = mask.shape
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    interior = 0
    for index in range(1, count):
        left, top, rect_width, rect_height, pixels = [int(value) for value in stats[index]]
        center_x = left + rect_width / 2
        center_y = top + rect_height / 2
        if (rect_height >= 6 and pixels >= 10 and width * 0.08 <= center_x <= width * 0.92
                and height * 0.08 <= center_y <= height * 0.92):
            interior += 1
    return interior >= 2


def ruled_header_cells(gray):
    if gray.ndim != 2 or gray.shape[0] < 150 or gray.shape[1] < 300:
        return []
    height, width = gray.shape
    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
                                  cv2.getStructuringElement(cv2.MORPH_RECT, (max(80, width // 10), 1)))
    vertical = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
                                cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(30, height // 35))))
    horizontal_contours, _ = cv2.findContours(horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    vertical_contours, _ = cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    horizontal_rules = [cv2.boundingRect(contour) for contour in horizontal_contours]
    rules = sorted((rect for rect in horizontal_rules
                    if rect[2] >= width * 0.35 and rect[3] <= 6),
                   key=lambda rect: rect[1])
    columns = [cv2.boundingRect(contour) for contour in vertical_contours]
    for upper, lower in zip(rules, rules[1:]):
        top = upper[1] + upper[3] // 2
        bottom = lower[1] + lower[3] // 2
        if not 40 <= bottom - top <= max(130, height // 4):
            continue
        left = max(upper[0], lower[0])
        right = min(upper[0] + upper[2], lower[0] + lower[2])
        if right - left < width * 0.35:
            continue
        walls = sorted(rect[0] + rect[2] // 2 for rect in columns
                       if top - 8 <= rect[1] <= top + 5 and rect[1] + rect[3] >= bottom - 5
                       and left - 4 <= rect[0] <= right + 4)
        boundaries = []
        for wall in walls:
            if not boundaries or wall - boundaries[-1] > 4:
                boundaries.append(wall)
        if not 4 <= len(boundaries) <= 21:
            continue
        cells = []
        for first, second in zip(boundaries, boundaries[1:]):
            if second - first < 28:
                continue
            inner_walls = sorted((rect for rect in columns
                                  if first + 25 <= rect[0] <= second - 25
                                  and top + 20 <= rect[1] <= bottom - 20
                                  and rect[1] + rect[3] >= bottom - 5), key=lambda rect: rect[0])
            split = round(np.median([rect[1] for rect in inner_walls])) if inner_walls else 0
            has_divider = inner_walls and all(abs(rect[1] - split) <= 5 for rect in inner_walls)
            has_divider = has_divider and any(abs(rule[1] - split) <= 5
                                              and rule[0] <= first + 5
                                              and rule[0] + rule[2] >= second - 5
                                              for rule in horizontal_rules)
            if has_divider:
                cells.append((first + 4, top + 4, second - 4, split - 4))
                nested = [first, *[rect[0] + rect[2] // 2 for rect in inner_walls], second]
                cells.extend((start + 4, split + 4, end - 4, bottom - 4)
                             for start, end in zip(nested, nested[1:]) if end - start >= 28)
            else:
                cells.append((first + 4, top + 4, second - 4, bottom - 4))
        with_text = [cell for cell in cells if has_header_text(gray[cell[1]:cell[3], cell[0]:cell[2]])]
        if len(with_text) >= 3:
            return with_text
    return []


def suppress_overlapping_boxes(boxes, overlap_threshold=0.6):
    """
    Suppresses redundant bounding boxes that are heavily overlapping or contained
    within larger boxes. boxes is a list of (x, y, w, h).
    """
    if len(boxes) <= 1:
        return boxes
    # Sort boxes by area descending so larger boxes are considered first
    sorted_boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
    kept = []
    for rect in sorted_boxes:
        x1, y1, w1, h1 = rect
        area1 = max(w1 * h1, 1)
        is_redundant = False
        for kx, ky, kw, kh in kept:
            ix1 = max(x1, kx)
            iy1 = max(y1, ky)
            ix2 = min(x1 + w1, kx + kw)
            iy2 = min(y1 + h1, ky + kh)
            if ix2 > ix1 and iy2 > iy1:
                inter_area = (ix2 - ix1) * (iy2 - iy1)
                if inter_area / area1 >= overlap_threshold:
                    is_redundant = True
                    break
        if not is_redundant:
            kept.append(rect)
    return kept
