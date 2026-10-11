import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from text_layout import has_header_text, has_text_ink, text_ink_mask, is_sparse_hallucination, ruled_header_cells, ruled_matrix_label_cells, split_multiline_region, suppress_overlapping_boxes


class TextLayoutTests(unittest.TestCase):
    def test_bordered_and_dotted_blank_area_has_no_text(self):
        page = np.full((500, 800), 255, dtype=np.uint8)
        cv2.rectangle(page, (40, 50), (740, 430), 0, 2)
        for baseline in [150, 250, 350]:
            for horizontal in range(70, 720, 8):
                cv2.rectangle(page, (horizontal, baseline), (horizontal + 1, baseline + 1), 0, -1)
        self.assertFalse(has_text_ink(page))
        self.assertEqual(np.count_nonzero(text_ink_mask(page)), 0)

    def test_empty_checkbox_and_separator_are_not_text(self):
        page = np.full((60, 600), 255, dtype=np.uint8)
        cv2.rectangle(page, (10, 10), (35, 35), 0, 2)
        cv2.line(page, (70, 40), (580, 40), 0, 2)
        self.assertFalse(has_text_ink(page))

    def test_low_contrast_text_is_not_dropped_by_a_contrast_threshold(self):
        page = np.full((100, 500), 238, dtype=np.uint8)
        cv2.putText(page, "HO VA TEN", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 232, 2)
        self.assertTrue(has_text_ink(page))

    def test_text_in_a_table_survives_line_removal(self):
        page = np.full((400, 800), 255, dtype=np.uint8)
        for baseline in [40, 120, 200, 280]:
            cv2.line(page, (40, baseline), (740, baseline), 0, 2)
        for horizontal in [40, 300, 740]:
            cv2.line(page, (horizontal, 40), (horizontal, 280), 0, 2)
        cv2.putText(page, "HO VA TEN", (60, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
        cv2.putText(page, "DIA CHI", (60, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
        mask = text_ink_mask(page)
        self.assertTrue(has_text_ink(page))
        self.assertGreater(np.count_nonzero(mask[60:110, 50:280]), 30)
        self.assertLess(np.count_nonzero(mask[:, 298:303]), 10)

    def test_wavy_scanned_grid_does_not_join_all_row_labels(self):
        page = np.full((600, 800), 255, dtype=np.uint8)
        for baseline in [150, 230, 310, 390, 470]:
            points = np.array([(horizontal, baseline + round(5 * np.sin(horizontal / 35)))
                               for horizontal in range(90, 711)], dtype=np.int32)
            cv2.polylines(page, [points], False, 0, 2)
        for vertical in [90, 170, 580, 710]:
            points = np.array([(vertical + round(5 * np.sin(height / 35)), height)
                               for height in range(150, 471)], dtype=np.int32)
            cv2.polylines(page, [points], False, 0, 2)
        cv2.putText(page, 'FULL NAME', (185, 205), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        cv2.putText(page, 'ADDRESS', (185, 285), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        mask = text_ink_mask(page)
        _, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        self.assertLess(max(stats[1:, cv2.CC_STAT_AREA]), 1000)
        self.assertGreater(np.count_nonzero(mask[180:210, 180:400]), 100)

    def test_accent_sized_specks_do_not_remove_actual_letter_strokes(self):
        page = np.full((100, 500), 255, dtype=np.uint8)
        cv2.putText(page, "NOI DUNG", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
        for horizontal in [25, 55, 83]:
            cv2.circle(page, (horizontal, 25), 1, 0, -1)
        self.assertTrue(has_text_ink(page))

    def test_sparse_blank_cell_fragments_are_not_recognized_as_words(self):
        page = np.full((50, 180), 255, dtype=np.uint8)
        for horizontal in [15, 55, 95, 135]:
            cv2.line(page, (horizontal, 8), (horizontal, 45), 0, 1)
        self.assertTrue(is_sparse_hallucination(page, 0.3))
        self.assertFalse(is_sparse_hallucination(page, None))

    def test_long_prediction_from_a_narrow_sparse_crop_is_rejected_but_short_digits_remain(self):
        page = np.full((36, 42), 255, dtype=np.uint8)
        for horizontal in [5, 16, 27]:
            cv2.rectangle(page, (horizontal, 8), (horizontal + 3, 22), 0, -1)
        self.assertTrue(is_sparse_hallucination(page, 0.41, 'Contraction'))
        self.assertFalse(is_sparse_hallucination(page, 0.41, '1'))
        self.assertFalse(is_sparse_hallucination(page, 0.9, 'Contraction'))

    def test_low_contrast_real_text_survives_sparse_hallucination_filter(self):
        page = np.full((100, 500), 238, dtype=np.uint8)
        cv2.putText(page, "HO VA TEN", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 232, 2)
        self.assertFalse(is_sparse_hallucination(page, 0.3))

    def test_ruled_header_cells_are_detected_without_blank_data_rows(self):
        page = np.full((600, 800), 255, dtype=np.uint8)
        for horizontal in [220, 300, 340]:
            cv2.line(page, (100, horizontal), (700, horizontal), 0, 2)
        for vertical in [100, 160, 390, 520, 700]:
            cv2.line(page, (vertical, 220), (vertical, 340), 0, 2)
        cv2.putText(page, "NO", (110, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        cv2.putText(page, "FULL NAME", (175, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        cv2.putText(page, "DATE MONTH", (400, 254), cv2.FONT_HERSHEY_SIMPLEX, 0.45, 0, 2)
        cv2.putText(page, "YEAR", (425, 283), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        cells = ruled_header_cells(page)
        self.assertGreaterEqual(len(cells), 3)
        self.assertTrue(any(390 < left < 410 and 510 < right < 530 for left, _, right, _ in cells))
        self.assertTrue(all(top < 260 < bottom and bottom <= 300 for _, top, _, bottom in cells))

    def test_unruled_text_and_empty_grid_do_not_create_header_cells(self):
        page = np.full((600, 800), 255, dtype=np.uint8)
        cv2.putText(page, "FULL NAME", (180, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
        self.assertEqual(ruled_header_cells(page), [])
        for horizontal in [220, 300]:
            cv2.line(page, (100, horizontal), (700, horizontal), 0, 2)
        for vertical in [100, 160, 390, 520, 700]:
            cv2.line(page, (vertical, 220), (vertical, 300), 0, 2)
        self.assertEqual(ruled_header_cells(page), [])

    def test_tall_header_with_nested_columns_ignores_page_watermark(self):
        page = np.full((1026, 1450), 255, dtype=np.uint8)
        for horizontal in [631, 824, 851]:
            cv2.line(page, (88, horizontal), (1316, horizontal), 0, 2)
        for vertical in [88, 137, 411, 484, 636, 910, 1081, 1194, 1316]:
            cv2.line(page, (vertical, 631), (vertical, 851), 0, 2)
        cv2.line(page, (484, 684), (636, 684), 0, 2)
        cv2.line(page, (559, 684), (559, 851), 0, 2)
        cv2.line(page, (1304, 98), (1304, 930), 0, 2)
        labels = [(95, 705, 'TT'), (150, 705, 'FULL NAME'), (418, 705, 'RELATION'),
                  (492, 666, 'BIRTH'), (494, 755, 'NAM'), (567, 755, 'NU'),
                  (646, 705, 'ADDRESS'), (920, 705, 'ID NUMBER'),
                  (1090, 705, 'INCOME'), (1200, 705, 'BENEFIT')]
        for horizontal, vertical, label in labels:
            cv2.putText(page, label, (horizontal, vertical), cv2.FONT_HERSHEY_SIMPLEX, 0.45, 0, 1)
        cells = ruled_header_cells(page)
        self.assertTrue(any(488 <= left <= 490 and 553 <= right <= 556 and top >= 680 for left, top, right, _ in cells))
        self.assertTrue(any(563 <= left <= 565 and 630 <= right <= 633 and top >= 680 for left, top, right, _ in cells))
        self.assertTrue(any(488 <= left <= 490 and 630 <= right <= 633 and bottom <= 685 for left, _, right, bottom in cells))
        self.assertFalse(any(left >= 1290 and right <= 1315 for left, _, right, _ in cells))

    def test_numbered_choice_matrix_yields_ordinal_and_description_crops_per_row(self):
        page = np.full((1000, 900), 255, dtype=np.uint8)
        for vertical in [100, 160, 600, 710, 810]:
            cv2.line(page, (vertical, 100), (vertical, 800), 0, 2)
        for horizontal in range(100, 801, 100):
            cv2.line(page, (100, horizontal), (810, horizontal), 0, 2)
        cells = ruled_matrix_label_cells(page)
        self.assertEqual(len(cells), 14)
        self.assertTrue(any(160 < left < 170 and 590 < right < 600 and 100 < top < 110 and 190 < bottom < 200
                            for left, top, right, bottom in cells))

    def test_other_table_geometry_is_not_treated_as_a_numbered_choice_matrix(self):
        page = np.full((1000, 900), 255, dtype=np.uint8)
        for vertical in [100, 160, 390, 520, 600, 710, 810]:
            cv2.line(page, (vertical, 100), (vertical, 800), 0, 2)
        for horizontal in range(100, 801, 100):
            cv2.line(page, (100, horizontal), (810, horizontal), 0, 2)
        self.assertEqual(ruled_matrix_label_cells(page), [])

    def test_open_bottom_choice_row_is_cropped_only_with_text_in_description(self):
        page = np.full((1000, 900), 255, dtype=np.uint8)
        for vertical in [100, 160, 600, 710, 810]:
            cv2.line(page, (vertical, 100), (vertical, 880), 0, 2)
        for horizontal in range(100, 801, 100):
            cv2.line(page, (100, horizontal), (810, horizontal), 0, 2)
        self.assertEqual(len(ruled_matrix_label_cells(page)), 14)
        cv2.putText(page, '8. WORK AT HOME', (175, 840), cv2.FONT_HERSHEY_SIMPLEX, 0.65, 0, 2)
        cells = ruled_matrix_label_cells(page)
        self.assertEqual(len(cells), 16)
        self.assertTrue(any(160 < left < 170 and 590 < right < 600 and 800 < top < 810
                            and 870 < bottom <= 880 for left, top, right, bottom in cells))

    def test_header_text_rejects_blank_cell_borders_and_accepts_words(self):
        blank = np.full((100, 200), 255, dtype=np.uint8)
        cv2.rectangle(blank, (0, 0), (199, 99), 0, 2)
        self.assertFalse(has_header_text(blank))
        cv2.putText(blank, 'NAME', (25, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
        self.assertTrue(has_header_text(blank))

    def test_wide_description_four_choice_matrix_only_crops_open_bottom_label(self):
        page = np.full((1450, 1028), 255, dtype=np.uint8)
        for vertical in [132, 495, 600, 718, 824, 920]:
            cv2.line(page, (vertical, 662), (vertical, 1322), 0, 2)
        for horizontal in [662, 797, 848, 899, 950, 1027, 1073, 1123, 1197]:
            cv2.line(page, (132, horizontal), (920, horizontal), 0, 2)
        cv2.putText(page, '8. WORK AT HOME', (155, 1240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, 0, 2)
        cells = ruled_matrix_label_cells(page)
        self.assertEqual(len(cells), 1)
        self.assertTrue(130 < cells[0][0] < 145 and 490 < cells[0][2] < 500
                        and 1195 < cells[0][1] < 1210 and 1310 < cells[0][3] < 1325)

    def test_four_multiline_rows_split_into_separate_ocr_crops(self):
        ink = np.zeros((118, 354), dtype=np.uint8)
        for top in [14, 41, 68, 95]:
            ink[top:top + 16, 20:320] = 255
        parts = split_multiline_region(ink, (0, 0, 354, 118))
        self.assertEqual(len(parts), 4)
        self.assertTrue(all(part[3] < 45 for part in parts))

    def test_tall_connected_form_lines_split_before_ocr(self):
        ink = np.zeros((195, 600), dtype=np.uint8)
        for top in [12, 45, 78, 111, 144]:
            ink[top:top + 18, 20:510] = 255
        parts = split_multiline_region(ink, (0, 0, 600, 178))
        self.assertEqual(len(parts), 5)
        self.assertTrue(all(part[3] < 50 for part in parts))

    def test_multiline_table_crop_splits_at_an_ink_valley_but_not_inside_one_line(self):
        ink = np.zeros((100, 500), dtype=np.uint8)
        ink[19:35, 30:420] = 255
        ink[48:64, 30:420] = 255
        parts = split_multiline_region(ink, (20, 10, 420, 65))
        self.assertEqual(len(parts), 2)
        self.assertLess(parts[0][1] + parts[0][3], 50)
        self.assertGreater(parts[1][1], 30)
        continuous = np.zeros_like(ink)
        continuous[19:64, 30:420] = 255
        self.assertEqual(split_multiline_region(continuous, (20, 10, 420, 65)), [(20, 10, 420, 65)])

    def test_suppress_overlapping_boxes_removes_nested_redundant_boxes(self):
        boxes = [
            (10, 10, 100, 30),     # Large box, area 3000
            (15, 12, 40, 20),      # Small box completely inside, area 800
            (10, 50, 100, 30),     # Separate non-overlapping box
        ]
        kept = suppress_overlapping_boxes(boxes, overlap_threshold=0.6)
        self.assertEqual(len(kept), 2)
        self.assertIn((10, 10, 100, 30), kept)
        self.assertIn((10, 50, 100, 30), kept)
        self.assertNotIn((15, 12, 40, 20), kept)


if __name__ == "__main__":
    unittest.main()
