"""Native-resolution, pixel-backed document tree. No OCR text invents geometry."""
import math
import time
from collections import Counter

import cv2
import numpy as np
from PIL import Image

from segmentation import ink_mask, rule_masks, remove_dotted_guides, skew_angle, text_boxes, ordered_boxes, _peaks

MAX_ELEMENTS = 16000
MAX_WORDS = 8000


def groups(indices):
    if not len(indices):
        return []
    return np.split(indices, np.where(np.diff(indices) > 1)[0] + 1)


def word_boxes(mask, box, gap_threshold=None):
    """Whitespace projections retain all ink, including detached accents/punctuation."""
    x, y, w, h = box
    local = mask[y:y+h, x:x+w]
    columns = np.flatnonzero(np.any(local != 0, axis=0))
    runs = groups(columns)
    if not runs:
        return []
    # Letter gaps are usually narrower than spaces. Do not divide by OCR token count.
    # Use a fractional threshold: rounding 3.5 down to 3 split narrow '10' and
    # punctuation off a numbered list. Global gap percentiles overmerge italics.
    threshold = max(2, h * 0.22) if gap_threshold is None else gap_threshold
    spans, start, end = [], int(runs[0][0]), int(runs[0][-1]) + 1
    for run in runs[1:]:
        left, right = int(run[0]), int(run[-1]) + 1
        if left - end >= threshold:
            spans.append((start, end))
            start = left
        end = right
    spans.append((start, end))
    result = []
    for left, right in spans:
        yy, xx = np.nonzero(local[:, left:right])
        if len(xx):
            result.append((x+left+int(xx.min()), y+int(yy.min()), int(xx.max()-xx.min()+1), int(yy.max()-yy.min()+1)))
    return result


def split_lines(mask):
    """Separate vertically fused bands using real empty rows, then tighten ink bounds."""
    result = []
    for x, y, w, h in text_boxes(mask):
        local = mask[y:y+h, x:x+w]
        active = groups(np.flatnonzero(np.any(local != 0, axis=1)))
        # Join detached accents to the body; split only substantial interline whitespace.
        gap_limit = max(3, round(min(h, 40) * 0.14))
        bands = []
        for run in active:
            top, bottom = int(run[0]), int(run[-1])+1
            if bands and top-bands[-1][1] < gap_limit:
                bands[-1] = (bands[-1][0], bottom)
            else:
                bands.append((top, bottom))
        for top, bottom in bands:
            yy, xx = np.nonzero(local[top:bottom])
            if len(xx) and bottom-top >= 2:
                result.append((x+int(xx.min()), y+top+int(yy.min()), int(xx.max()-xx.min()+1), int(yy.max()-yy.min()+1)))
    return ordered_boxes(result)


def ruled_cells(horizontal, vertical):
    """Connected grid slots; absent internal borders produce a merged rectangular cell.

    Reject nonrectangular/ambiguous unions instead of manufacturing regular cells.
    """
    height, width = horizontal.shape
    contours, _ = cv2.findContours(cv2.bitwise_or(horizontal, vertical), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    tables = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < 55 or h < 35:
            continue
        xs = [x+p for p in _peaks(np.count_nonzero(vertical[y:y+h, x:x+w], axis=0), max(12, h*0.12))]
        ys = [y+p for p in _peaks(np.count_nonzero(horizontal[y:y+h, x:x+w], axis=1), max(12, w*0.12))]
        if not (2 <= len(xs) <= 51 and 2 <= len(ys) <= 101) or min(np.diff(xs)) < 10 or min(np.diff(ys)) < 10:
            continue
        # Only treat a component as enclosed when all its outside edges have support.
        def v_support(px, top, bottom):
            return np.count_nonzero(np.any(vertical[top:bottom, max(0, px-2):min(width, px+3)], axis=1)) / max(1, bottom-top)
        def h_support(py, left, right):
            return np.count_nonzero(np.any(horizontal[max(0, py-2):min(height, py+3), left:right], axis=0)) / max(1, right-left)
        if min(v_support(xs[0], ys[0], ys[-1]), v_support(xs[-1], ys[0], ys[-1]),
               h_support(ys[0], xs[0], xs[-1]), h_support(ys[-1], xs[0], xs[-1])) < 0.65:
            continue
        rows, cols = len(ys)-1, len(xs)-1
        owners = list(range(rows*cols))
        def root(i):
            while owners[i] != i:
                owners[i] = owners[owners[i]]
                i = owners[i]
            return i
        def join(a, b):
            owners[root(a)] = root(b)
        uncertain = False
        for r in range(rows):
            for c in range(cols):
                if c+1 < cols:
                    support = v_support(xs[c+1], ys[r]+3, ys[r+1]-3)
                    if support < 0.2:
                        join(r*cols+c, r*cols+c+1)
                    elif support < 0.65:
                        uncertain = True
                if r+1 < rows:
                    support = h_support(ys[r+1], xs[c]+3, xs[c+1]-3)
                    if support < 0.2:
                        join(r*cols+c, (r+1)*cols+c)
                    elif support < 0.65:
                        uncertain = True
        members = {}
        for r in range(rows):
            for c in range(cols):
                members.setdefault(root(r*cols+c), []).append((r, c))
        cells = []
        for slots in members.values():
            r0, c0 = min(r for r, _ in slots), min(c for _, c in slots)
            r1, c1 = max(r for r, _ in slots)+1, max(c for _, c in slots)+1
            if len(slots) != (r1-r0)*(c1-c0):
                uncertain = True
                continue
            cells.append({'box': (xs[c0], ys[r0], xs[c1]-xs[c0]+1, ys[r1]-ys[r0]+1),
                          'rowIndex': r0, 'columnIndex': c0, 'rowSpan': r1-r0, 'columnSpan': c1-c0})
        if cells:
            tables.append({'box': (xs[0], ys[0], xs[-1]-xs[0]+1, ys[-1]-ys[0]+1),
                           'cells': sorted(cells, key=lambda a: (a['rowIndex'], a['columnIndex'])), 'uncertain': uncertain})
    return sorted(tables, key=lambda a: (a['box'][1], a['box'][0]))


def checkbox_boxes(binary):
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    height, width = binary.shape
    result = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if min(w, h) < 9 or max(w, h) > min(100, max(24, width*0.065)) or not 0.75 <= w/h <= 1.33:
            continue
        if cv2.contourArea(contour) / (w*h) < 0.65:
            continue
        approximation = cv2.approxPolyDP(contour, cv2.arcLength(contour, True)*0.035, True)
        if len(approximation) != 4 or not cv2.isContourConvex(approximation):
            continue
        # Printed O/D/0 can have a rectangular hole. A box has actual square corners
        # and is separated from the preceding glyph, unlike letters within a word.
        corner = max(1, round(min(w, h)*0.12))
        local = binary[y:y+h, x:x+w]
        if min(np.mean(local[:corner, :corner] != 0), np.mean(local[:corner, -corner:] != 0),
               np.mean(local[-corner:, :corner] != 0), np.mean(local[-corner:, -corner:] != 0)) < 0.35:
            continue
        left = binary[max(0, y+2):max(0, y+h-2), max(0, x-round(w*0.7)):x]
        if left.size and np.count_nonzero(left) > h*0.2:
            continue
        border = max(2, round(min(w, h)*0.18))
        if min(np.mean(np.any(local[:border] != 0, axis=0)), np.mean(np.any(local[-border:] != 0, axis=0)),
               np.mean(np.any(local[:, :border] != 0, axis=1)), np.mean(np.any(local[:, -border:] != 0, axis=1))) < 0.7:
            continue
        if any(abs(x-bx) <= 4 and abs(y-by) <= 4 and abs(w-bw) <= 8 and abs(h-bh) <= 8 for bx, by, bw, bh in result):
            continue
        result.append((x, y, w, h))
    # Open [x] / [ ] marks are not closed contours. Match two real bracket
    # components with opposite stems, then retain their measured union.
    _, _, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    lefts, rights = [], []
    for x, y, w, h, area in stats[1:]:
        if not (8 <= h <= 60 and 2 <= w <= h*0.45):
            continue
        local = binary[y:y+h, x:x+w] != 0
        edge = max(1, round(h*0.18))
        if min(np.mean(np.any(local[:edge], axis=0)), np.mean(np.any(local[-edge:], axis=0))) < 0.7:
            continue
        middle = local[edge:-edge]
        if np.mean(np.any(middle[:, :max(1,math.ceil(w*0.65))], axis=1)) >= 0.75 and np.mean(middle[:, -max(1,w//3):]) < 0.15:
            lefts.append((int(x),int(y),int(w),int(h)))
        if np.mean(np.any(middle[:, w-math.ceil(w*0.65):], axis=1)) >= 0.75 and np.mean(middle[:, :max(1,w//3)]) < 0.15:
            rights.append((int(x),int(y),int(w),int(h)))
    used = set()
    for x,y,w,h in lefts:
        matches = [(i,b) for i,b in enumerate(rights) if i not in used and x+w+1 <= b[0] <= x+2*h and abs(b[1]-y) <= 2 and abs(b[3]-h) <= 2]
        if not matches:
            continue
        i,(rx,ry,rw,rh) = min(matches,key=lambda item:item[1][0])
        if x > 0 and np.count_nonzero(binary[y+2:y+h-2,max(0,x-round(h*0.4)):x]) > h*0.2:
            continue
        used.add(i)
        result.append((x,min(y,ry),rx+rw-x,max(y+h,ry+rh)-min(y,ry)))
    return sorted(result, key=lambda b: (b[1], b[0]))


def build_layout(image, quad=None):
    if min(image.size) < 1 or max(image.size) > 8192 or image.width*image.height > 12_000_000:
        raise ValueError('DETAILED_IMAGE_LIMIT')
    native = np.asarray(image.convert('RGB'))
    source_h, source_w = native.shape[:2]
    forward = np.eye(3)
    warnings = []
    if quad is not None:
        points = np.asarray(quad, dtype=np.float64)
        if points.shape != (4, 2) or not np.isfinite(points).all():
            raise ValueError('INVALID_DOCUMENT_QUAD')
        if np.any(points < 0) or np.any(points[:, 0] > source_w-1) or np.any(points[:, 1] > source_h-1):
            raise ValueError('INVALID_DOCUMENT_QUAD')
        contour = points.astype(np.float32).reshape(-1, 1, 2)
        if not cv2.isContourConvex(contour) or cv2.contourArea(contour, oriented=True) <= 4:
            raise ValueError('INVALID_DOCUMENT_QUAD')
        # Require TL, TR, BR, BL winding with top/left edges in the corresponding halves.
        if not (points[:2, 1].mean() < points[2:, 1].mean() and points[[0, 3], 0].mean() < points[[1, 2], 0].mean()):
            raise ValueError('INVALID_DOCUMENT_QUAD_ORDER')
        out_w = round(max(np.linalg.norm(points[1]-points[0]), np.linalg.norm(points[2]-points[3])))
        out_h = round(max(np.linalg.norm(points[3]-points[0]), np.linalg.norm(points[2]-points[1])))
        if min(out_w, out_h) < 20 or out_w*out_h > 12_000_000 or max(out_w, out_h) > 8192:
            raise ValueError('PERSPECTIVE_OUTPUT_LIMIT')
        forward = cv2.getPerspectiveTransform(points.astype(np.float32), np.array([[0, 0], [out_w-1, 0], [out_w-1, out_h-1], [0, out_h-1]], np.float32))
        denominators = np.c_[points, np.ones(4)] @ forward[2]
        if not np.isfinite(forward).all() or abs(np.linalg.det(forward)) < 1e-12 or np.min(denominators)*np.max(denominators) <= 0:
            raise ValueError('INVALID_PERSPECTIVE_TRANSFORM')
        native = cv2.warpPerspective(native, forward, (out_w, out_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        warnings.append('PERSPECTIVE_APPLIED')
    binary = ink_mask(cv2.cvtColor(native, cv2.COLOR_RGB2GRAY))
    angle = skew_angle(binary)
    if angle:
        h, w = binary.shape
        rotation = cv2.getRotationMatrix2D((w/2, h/2), angle, 1)
        radians = math.radians(angle)
        out_w = math.ceil(w*abs(math.cos(radians)) + h*abs(math.sin(radians)))
        out_h = math.ceil(h*abs(math.cos(radians)) + w*abs(math.sin(radians)))
        if out_w*out_h > 12_000_000 or max(out_w, out_h) > 8192:
            warnings.append('DESKEW_OUTPUT_LIMIT')
            angle = 0.0
        else:
            rotation[:, 2] += ((out_w-w)/2, (out_h-h)/2)
            native = cv2.warpAffine(native, rotation, (out_w, out_h), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
            forward = np.vstack([rotation, [0, 0, 1]]) @ forward
            binary = ink_mask(cv2.cvtColor(native, cv2.COLOR_RGB2GRAY))
            warnings.append('OCR_DESKEW_APPLIED')
    height, width = binary.shape
    inverse = np.linalg.inv(forward)
    horizontal, vertical = rule_masks(binary)
    rules = cv2.bitwise_or(horizontal, vertical)
    clean = cv2.bitwise_and(binary, cv2.bitwise_not(rules))
    before_dots = clean
    clean, dotted = remove_dotted_guides(clean)
    dotted_mask = cv2.bitwise_and(before_dots, cv2.bitwise_not(clean))
    if dotted:
        warnings.append('OCR_DOTTED_GUIDES_DETECTED')
    elements, crops = [], []
    counters = Counter()

    def add(kind, box, parent='page_001', **extra):
        if len(elements) >= MAX_ELEMENTS:
            raise ValueError('DETAILED_ELEMENT_LIMIT')
        x, y, w, h = [int(n) for n in box]
        x, y = max(0, x), max(0, y)
        w, h = min(width-x, w), min(height-y, h)
        if w <= 0 or h <= 0:
            raise ValueError('INVALID_ELEMENT_GEOMETRY')
        polygon = np.array([[x, y, 1], [x+w, y, 1], [x+w, y+h, 1], [x, y+h, 1]], dtype=float) @ inverse.T
        if np.any(np.abs(polygon[:, 2]) < 1e-10):
            raise ValueError('INVALID_ELEMENT_PROJECTION')
        polygon = polygon[:, :2] / polygon[:, 2:]
        low = np.maximum(polygon.min(axis=0), [0, 0])
        high = np.minimum(polygon.max(axis=0), [source_w, source_h])
        if np.any(high <= low):
            raise ValueError('ELEMENT_OUTSIDE_SOURCE')
        counters[kind] += 1
        element_id = 'page_001' if kind == 'page' else f'{kind}_{counters[kind]:05d}'
        element = {'id': element_id, 'parentId': parent, 'page': 1, 'kind': kind, 'order': len(elements),
                   'bbox': [float(low[0]), float(low[1]), float(high[0]), float(high[1])],
                   'normalizedBox': [float(low[0]/source_w), float(low[1]/source_h), float(high[0]/source_w), float(high[1]/source_h)],
                   'polygon': polygon.tolist(), 'processedBox': [x, y, x+w, y+h], 'cropBox': [x, y, x+w, y+h],
                   'textRaw': '', 'ocrConfidence': None, 'recognitionStatus': 'not_applicable',
                   'geometryOrigin': 'pixel_detector', 'textOrigin': 'none', 'reviewReasons': [], **extra}
        elements.append(element)
        return element

    add('page', (0, 0, width, height), None)
    outside = clean.copy()
    covered = np.zeros_like(binary)
    line_entries = []
    tables = ruled_cells(horizontal, vertical)
    checkboxes = [box for box in checkbox_boxes(binary) if not any(
        abs(box[0]-c['box'][0]) < 5 and abs(box[1]-c['box'][1]) < 5 and abs(box[2]-c['box'][2]) < 10 and abs(box[3]-c['box'][3]) < 10
        for t in tables for c in t['cells'])]
    for x,y,w,h in checkboxes:
        clean[y:y+h, x:x+w] = 0
        outside[y:y+h, x:x+w] = 0
    for table in tables:
        tx, ty, tw, th = table['box']
        table_element = add('table' if len(table['cells']) > 1 else 'region', table['box'],
                            reviewReasons=['TABLE_STRUCTURE_UNVERIFIED'] + (['BROKEN_TABLE_BOUNDARY'] if table['uncertain'] else []))
        if table['uncertain']:
            warnings.append('BROKEN_TABLE_BOUNDARY')
        for cell in table['cells']:
            cx, cy, cw, ch = cell['box']
            outside[cy:cy+ch, cx:cx+cw] = 0
            cell_element = add('cell', cell['box'], table_element['id'], **{k: v for k, v in cell.items() if k != 'box'})
            pad = min(3, max(1, min(cw, ch)//10))
            cx, cy, cw, ch = cx+pad, cy+pad, cw-2*pad, ch-2*pad
            local = clean[cy:cy+ch, cx:cx+cw]
            boxes = split_lines(local)
            cell_element['recognitionStatus'] = 'blank' if not np.any(local) else 'not_applicable'
            if not boxes and np.any(local):
                add('unknown_region', (cx, cy, cw, ch), cell_element['id'], recognitionStatus='unreadable', reviewReasons=['UNSEGMENTED_CELL_INK'])
            line_entries.extend(((cx+x, cy+y, w, h), cell_element['id']) for x, y, w, h in boxes)
        # Unresolved, nonrectangular spans still flow through the independent text
        # detector. Masking the entire table here would discard those source lines.
    for box in checkboxes:
        x, y, w, h = box
        # An entire small table cell is not an independent checkbox.
        if any(abs(x-c['box'][0]) < 5 and abs(y-c['box'][1]) < 5 and abs(w-c['box'][2]) < 10 and abs(h-c['box'][3]) < 10
               for t in tables for c in t['cells']):
            continue
        inset = max(2, round(min(w, h)*0.24))
        inner = binary[y+inset:y+h-inset, x+inset:x+w-inset]
        ratio = float(np.count_nonzero(inner) / max(1, inner.size))
        state = 'checked' if ratio > 0.16 else 'unchecked' if ratio < 0.04 else 'unknown'
        parent = next((e['id'] for e in elements if e['kind'] == 'cell' and
                       e['processedBox'][0] <= x and e['processedBox'][1] <= y and e['processedBox'][2] >= x+w and e['processedBox'][3] >= y+h), 'page_001')
        add('checkbox', box, parent, checkboxState=state, reviewReasons=['CHECKBOX_PIXEL_HEURISTIC'])
        if parent != 'page_001':
            next(e for e in elements if e['id'] == parent)['recognitionStatus'] = 'not_applicable'
        outside[y:y+h, x:x+w] = 0
        clean[y:y+h, x:x+w] = 0
        covered[y:y+h, x:x+w] = 255
    for box in split_lines(outside):
        x,y,w,h = box
        parent = next((e['id'] for e in elements if e['kind'] in ('table','region') and e['parentId']=='page_001'
                       and e['processedBox'][0] <= x and e['processedBox'][1] <= y and e['processedBox'][2] >= x+w and e['processedBox'][3] >= y+h), 'page_001')
        region = add('region', box,parent)
        line_entries.append((box, region['id']))
    ordering = {b: i for i, b in enumerate(ordered_boxes([b for b, _ in line_entries]))}
    line_entries.sort(key=lambda entry: ordering[entry[0]])
    for line_order, (box, parent) in enumerate(line_entries):
        x, y, w, h = box
        line = add('line', box, parent, recognitionStatus='unreadable', readingOrder=line_order)
        px, py, right, bottom = max(0, x-3), max(0, y-4), min(width, x+w+3), min(height, y+h+4)
        parent_element = next(e for e in elements if e['id'] == parent)
        if parent_element['kind'] == 'cell':
            bounds = parent_element['processedBox']
            px, py, right, bottom = max(px, bounds[0]+1), max(py, bounds[1]+1), min(right, bounds[2]-1), min(bottom, bounds[3]-1)
        line['cropBox'] = [px, py, right, bottom]
        crops.append((line, (px, py, right, bottom)))
        covered[y:y+h, x:x+w] = 255
        for word_order, word_box in enumerate(word_boxes(clean, box)):
            if counters['word'] >= MAX_WORDS:
                raise ValueError('DETAILED_WORD_LIMIT')
            word = add('word', word_box, line['id'], recognitionStatus='unreadable', readingOrder=word_order)
            wx, wy, ww, wh = word_box
            crop = [max(px, wx-2), max(py, wy-3), min(right, wx+ww+2), min(bottom, wy+wh+3)]
            word['cropBox'] = crop
            crops.append((word, tuple(crop)))
    by_id = {e['id']:e for e in elements}
    for checkbox in [e for e in elements if e['kind'] == 'checkbox']:
        x1,y1,x2,y2 = checkbox['processedBox']
        matches = [e for e in elements if e['kind'] == 'line' and (e['parentId'] == checkbox['parentId'] or
                   checkbox['parentId'] == 'page_001' and by_id[e['parentId']]['kind'] == 'region' and by_id[e['parentId']]['parentId'] == 'page_001')
                   and e['processedBox'][0] >= x2-3 and e['processedBox'][0]-x2 <= max(30, (y2-y1)*4)
                   and min(y2,e['processedBox'][3])-max(y1,e['processedBox'][1]) >= min(y2-y1,e['processedBox'][3]-e['processedBox'][1])*0.35]
        checkbox['labelIds'] = [min(matches,key=lambda e:e['processedBox'][0])['id']] if matches else []
        if not matches:
            checkbox['reviewReasons'].append('CHECKBOX_LABEL_UNRESOLVED')
    # Keep structural strokes as explicit records, separately from recognized text.
    for kind, mask in (('guide_line', horizontal), ('guide_line', vertical)):
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=lambda c: (cv2.boundingRect(c)[1], cv2.boundingRect(c)[0])):
            add(kind, cv2.boundingRect(contour))
    if dotted:
        joined_dots = cv2.dilate(dotted_mask, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 3)))
        contours, _ = cv2.findContours(joined_dots, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            yy, xx = np.nonzero(dotted_mask[y:y+h, x:x+w])
            if len(xx):
                add('guide_line', (x+int(xx.min()), y+int(yy.min()), int(xx.max()-xx.min()+1), int(yy.max()-yy.min()+1)),
                    reviewReasons=['DOTTED_INPUT_GUIDE'])
    residual = cv2.bitwise_and(clean, cv2.bitwise_not(covered))
    count, _, stats, _ = cv2.connectedComponentsWithStats(residual, 8)
    for x, y, w, h, area in stats[1:]:
        if area >= 1:
            add('unknown_region', (x, y, w, h), recognitionStatus='unreadable', reviewReasons=['UNASSIGNED_INK'])
    ink_pixels = int(np.count_nonzero(clean))
    residual_pixels = int(np.count_nonzero(residual))
    if residual_pixels:
        warnings.append('UNASSIGNED_INK_PRESENT')
    if not line_entries:
        warnings.append('NO_TEXT_DETECTED')
    document = {'schemaVersion': 'detailed-1.0', 'status': 'partial', 'requiresReview': True,
                'coordinateSystem': 'source-oriented-pixels-xyxy', 'pixelBounds': 'half-open',
                'source': {'width': source_w, 'height': source_h}, 'processed': {'width': width, 'height': height},
                'transforms': {'sourceToProcessed': forward.tolist(), 'processedToSource': inverse.tolist(), 'skewDegrees': float(angle)},
                'elements': elements, 'warnings': warnings, 'fullText': '',
                'coverage': {'inkPixels': ink_pixels, 'unassignedInkPixels': residual_pixels,
                             'explainedInkRatio': 1-residual_pixels/max(1, ink_pixels), 'isCompletenessGuarantee': False},
                'counts': dict(Counter(e['kind'] for e in elements)), 'timingMs': {}}
    return document, native, crops


def recognize_layout(document, native, crops, recognize, recognize_words=True, budget_seconds=120):
    """Bounded serial batches. Preserve every element when inference fails/expires."""
    started = time.monotonic()
    pending = [(e, bounds) for e, bounds in crops if e['kind'] == 'line' or recognize_words]
    pending.sort(key=lambda item: item[0]['kind'] != 'line')
    for start in range(0, len(pending), 16):
        if time.monotonic()-started >= budget_seconds:
            document['warnings'].append('OCR_TIME_BUDGET_EXHAUSTED')
            break
        batch = pending[start:start+16]
        images = []
        try:
            for _, (x1, y1, x2, y2) in batch:
                images.append(Image.fromarray(native[y1:y2, x1:x2]))
            texts, scores = recognize(images)
            if len(texts) != len(batch) or len(scores) != len(batch):
                raise RuntimeError('OCR_BATCH_COUNT_MISMATCH')
            for (element, _), text, score in zip(batch, texts, scores):
                element['textRaw'] = str(text) if text is not None else ''
                element['ocrConfidence'] = float(score) if isinstance(score, (float, int)) and math.isfinite(score) and 0 <= score <= 1 else None
                element['textOrigin'] = 'word_crop_ocr' if element['kind'] == 'word' else 'line_crop_ocr'
                element['recognitionStatus'] = 'recognized' if element['textRaw'].strip() else 'unreadable'
                if not element['textRaw'].strip():
                    element['reviewReasons'].append('OCR_EMPTY_ON_INK')
                if element['ocrConfidence'] is None or element['ocrConfidence'] < 0.8:
                    element['reviewReasons'].append('LOW_OR_UNKNOWN_OCR_CONFIDENCE')
                if element['kind'] == 'word' and len(element['textRaw'].split()) > 1:
                    element['reviewReasons'].append('WORD_BOUNDARY_UNCERTAIN')
        except Exception:
            document['warnings'].append('OCR_BATCH_FAILED')
            for element, _ in batch:
                element['reviewReasons'].append('OCR_BATCH_FAILED')
        finally:
            for image in images:
                image.close()
    # A crop recognized as several tokens is a measured word group. Preserve the
    # original record and split only at actual ink-free columns; never at equal
    # fractions of its width. Read the refined crops independently as well.
    ambiguous = [e for e in document['elements'] if e['kind'] == 'word' and len(e['textRaw'].split()) > 1]
    refined = []
    word_count = sum(e['kind'] == 'word' for e in document['elements'])
    if recognize_words and ambiguous:
        mask = ink_mask(cv2.cvtColor(native, cv2.COLOR_RGB2GRAY))
        horizontal, vertical = rule_masks(mask)
        mask = cv2.bitwise_and(mask, cv2.bitwise_not(cv2.bitwise_or(horizontal, vertical)))
        inverse = np.array(document['transforms']['processedToSource'])
        source_w, source_h = document['source']['width'], document['source']['height']
        for group in ambiguous[:128]:
            x1,y1,x2,y2 = group['processedBox']
            runs = groups(np.flatnonzero(np.any(mask[y1:y2,x1:x2] != 0,axis=0)))
            gaps = sorted({int(b[0]-a[-1]-1) for a,b in zip(runs,runs[1:])},reverse=True)
            candidates = []
            for gap in gaps:
                boxes = word_boxes(mask,(x1,y1,x2-x1,y2-y1),gap_threshold=gap-0.5)
                if len(boxes) == len(group['textRaw'].split()):
                    candidates = boxes
                    break
            if not candidates or len(document['elements'])+len(candidates) > MAX_ELEMENTS or word_count-1+len(candidates) > MAX_WORDS:
                continue
            word_count += len(candidates)-1
            group['kind'] = 'word_group'
            group['reviewReasons'].append('WORD_GROUP_REFINED_AT_PIXEL_GAPS')
            for index,(x,y,w,h) in enumerate(candidates):
                polygon = np.array([[x,y,1],[x+w,y,1],[x+w,y+h,1],[x,y+h,1]],float) @ inverse.T
                polygon = polygon[:,:2]/polygon[:,2:]
                low = np.maximum(polygon.min(axis=0),[0,0]); high = np.minimum(polygon.max(axis=0),[source_w,source_h])
                px,py,pr,pb = group['cropBox']
                crop = [max(px,x-2),max(py,y-3),min(pr,x+w+2),min(pb,y+h+3)]
                child = {**group,'id':f"word_refined_{len(refined)+1:05d}",'parentId':group['id'],'kind':'word','order':len(document['elements']),
                         'bbox':[float(low[0]),float(low[1]),float(high[0]),float(high[1])],
                         'normalizedBox':[float(low[0]/source_w),float(low[1]/source_h),float(high[0]/source_w),float(high[1]/source_h)],
                         'polygon':polygon.tolist(),'processedBox':[x,y,x+w,y+h],'cropBox':crop,'textRaw':'','textOrigin':'none',
                         'ocrConfidence':None,'recognitionStatus':'unreadable','readingOrder':index,'reviewReasons':['REFINED_WORD_REQUIRES_REVIEW']}
                document['elements'].append(child); refined.append((child,crop))
        for start in range(0,len(refined),16):
            if time.monotonic()-started >= budget_seconds:
                document['warnings'].append('OCR_TIME_BUDGET_EXHAUSTED')
                break
            batch = refined[start:start+16]; images = []
            try:
                images = [Image.fromarray(native[y1:y2,x1:x2]) for _,(x1,y1,x2,y2) in batch]
                texts,scores = recognize(images)
                if len(texts) != len(batch) or len(scores) != len(batch):
                    raise RuntimeError('OCR_BATCH_COUNT_MISMATCH')
                for (element,_),text,score in zip(batch,texts,scores):
                    element['textRaw'] = str(text) if text is not None else ''
                    element['ocrConfidence'] = float(score) if isinstance(score,(float,int)) and math.isfinite(score) and 0 <= score <= 1 else None
                    element['textOrigin'] = 'word_crop_ocr'
                    element['recognitionStatus'] = 'recognized' if element['textRaw'].strip() else 'unreadable'
                    if element['ocrConfidence'] is None or element['ocrConfidence'] < 0.8:
                        element['reviewReasons'].append('LOW_OR_UNKNOWN_OCR_CONFIDENCE')
                    if len(element['textRaw'].split()) > 1:
                        element['reviewReasons'].append('WORD_BOUNDARY_UNCERTAIN')
            except Exception:
                document['warnings'].append('OCR_BATCH_FAILED')
                for element,_ in batch:
                    element['reviewReasons'].append('OCR_BATCH_FAILED')
            finally:
                for image in images:
                    image.close()
    by_id = {e['id']:e for e in document['elements']}
    for element in document['elements']:
        if element['kind'] != 'line':
            continue
        words = sorted([e for e in document['elements'] if e['kind'] == 'word' and (e['parentId'] == element['id'] or
                       by_id[e['parentId']]['kind'] == 'word_group' and by_id[e['parentId']]['parentId'] == element['id'])], key=lambda e:e['processedBox'][0])
        for index,word in enumerate(words):
            word['readingOrder'] = index
        tokens = element['textRaw'].split()
        if not recognize_words:
            if len(tokens) == len(words):
                for word, token in zip(words, tokens):
                    word['textRaw'] = token
                    word['textOrigin'] = 'line_token_alignment'
                    word['recognitionStatus'] = 'recognized'
                    word['reviewReasons'].append('WORD_TEXT_ALIGNMENT_UNVERIFIED')
            else:
                for word in words:
                    word['reviewReasons'].append('WORD_TOKEN_COUNT_MISMATCH')
        elif words and ' '.join(w['textRaw'] for w in words).split() != tokens:
            element['reviewReasons'].append('LINE_WORD_OCR_DISAGREEMENT')
            for word in words:
                word['reviewReasons'].append('LINE_WORD_OCR_DISAGREEMENT')
    for element in document['elements']:
        if element['recognitionStatus'] == 'unreadable' and not element['reviewReasons']:
            element['reviewReasons'].append('OCR_NOT_COMPLETED')
    lines = sorted([e for e in document['elements'] if e['kind'] == 'line'], key=lambda e: e['readingOrder'])
    marks = {'checked': '[x]', 'unchecked': '[ ]', 'unknown': '[?]'}
    def transcript(line):
        prefix = ' '.join(marks[e['checkboxState']] for e in document['elements'] if e['kind'] == 'checkbox' and line['id'] in e.get('labelIds', []))
        text = line['textRaw'] if line['textRaw'].strip() else f"[UNREADABLE:{line['id']}]"
        return prefix+' '+text if prefix else text
    document['fullText'] = '\n'.join(transcript(e) for e in lines)
    document['warnings'] = list(dict.fromkeys(document['warnings']))
    document['counts'] = dict(Counter(e['kind'] for e in document['elements']))
    document['status'] = 'complete' if not any(e['recognitionStatus'] == 'unreadable' for e in document['elements']) else 'partial'
    document['timingMs']['recognition'] = round((time.monotonic()-started)*1000)
    return document
