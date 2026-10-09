import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services/vietocr-service'))
from segmentation import segment_page
from recognition import split_wide_line
import app


class SegmentationTests(unittest.TestCase):
    def test_table_grid_has_all_slots_including_four_blank_cells(self):
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc04_table_empty_cells.png') as image:
            result = segment_page(image)
        try:
            self.assertEqual(len(result.tables), 1)
            rows = result.tables[0]['rows']
            self.assertEqual([len(row) for row in rows], [5]*5)
            self.assertEqual(len(result.regions), 26)
            by_id = {i: crop for crop, _, i in result.regions}
            blanks = [cell for row in rows for cell in row if app.is_flat_image(by_id[cell['lineIds'][0]])]
            self.assertEqual(len(blanks), 4)
        finally:
            for crop, _, _ in result.regions: crop.close()

    def test_rotated_page_has_reading_order_and_source_coordinates(self):
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc07_skewed_perspective.png') as image:
            result = segment_page(image)
        try:
            self.assertAlmostEqual(result.skew_degrees, 7, delta=0.3)
            self.assertEqual(len(result.regions), 13)
            centers = [(box[0]+box[2])/2 for _, box, _ in result.regions]
            self.assertEqual(centers, sorted(centers))
            self.assertTrue(all(0 <= n <= 1 for _, box, _ in result.regions for n in box))
            self.assertTrue(all(crop.height < 40 for crop, _, _ in result.regions))
        finally:
            for crop, _, _ in result.regions: crop.close()

    def test_dotted_form_separates_inline_labels_and_never_crops_dot_only_regions(self):
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc02_dotted_form.png') as image:
            result = segment_page(image)
        try:
            self.assertEqual(len(result.regions), 13)
            self.assertIn('OCR_DOTTED_GUIDES_DETECTED', result.warnings)
            self.assertTrue(all(crop.height > 10 for crop, _, _ in result.regions))
            self.assertLess(max(crop.width for crop, _, _ in result.regions), 500)
        finally:
            for crop, _, _ in result.regions: crop.close()

    def test_large_page_retains_small_text_and_edge_footer(self):
        with Image.new('RGB', (3200, 2200), 'white') as image:
            draw = ImageDraw.Draw(image)
            font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
            for y in (40, 1000, 2160): draw.text((5, y), 'Small text 001234567890', font=font, fill='black')
            result = segment_page(image)
        try:
            self.assertEqual(len(result.regions), 3)
            self.assertGreater(result.regions[-1][1][0], 0.97)
        finally:
            for crop, _, _ in result.regions: crop.close()

    def test_dense_page_over_previous_120_region_limit_is_retained(self):
        with Image.new('RGB', (800, 2400), 'white') as image:
            draw = ImageDraw.Draw(image)
            font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 12)
            for index in range(130): draw.text((20, 10+index*18), f'Line {index:03d} text', font=font, fill='black')
            result = segment_page(image)
        try: self.assertEqual(len(result.regions), 130)
        finally:
            for crop, _, _ in result.regions: crop.close()

    def test_merged_table_is_not_misrepresented_as_a_smaller_uniform_grid(self):
        with Image.new('RGB', (500, 400), 'white') as image:
            draw = ImageDraw.Draw(image)
            for y in (50, 150, 250): draw.line((50, y, 450, y), fill='black', width=2)
            for x in (50, 250, 450): draw.line((x, 50, x, 250), fill='black', width=2)
            draw.line((150, 50, 150, 150), fill='black', width=2)
            result = segment_page(image)
        try: self.assertEqual(result.tables, [])
        finally:
            for crop, _, _ in result.regions: crop.close()

    def test_long_line_splits_at_whitespace_without_losing_pixels(self):
        with Image.new('RGB', (1200, 32), 'white') as image:
            draw = ImageDraw.Draw(image)
            for x in range(10, 1200, 80): draw.rectangle((x, 7, x+50, 25), fill='black')
            fragments = split_wide_line(image, 32, 512)
            try:
                self.assertGreater(len(fragments), 1)
                self.assertLessEqual(max(c.width for c in fragments), 512)
                self.assertTrue(np.array_equal(np.concatenate([np.asarray(c) for c in fragments], axis=1), np.asarray(image)))
            finally:
                for crop in fragments:
                    if crop is not image: crop.close()

    def test_batch_width_rounding_matches_upstream_and_restores_input_order(self):
        class Vocab:
            def batch_decode(self, values): return [str(value[0]) for value in values]
        class Predictor:
            config = {'dataset': {'image_height': 32, 'image_min_width': 32, 'image_max_width': 512}}
            device = 'cpu'
            model = object()
            vocab = Vocab()
        def translate(batch, model):
            size = batch.shape[0]
            return app.torch.tensor([[int(batch[i, 0, 0, 0]*255)] for i in range(size)]), app.torch.ones(size)
        images = [Image.new('RGB', (w, h), (value, value, value)) for w, h, value in [(345,24,50), (350,24,80), (40,32,120)]]
        try:
            with patch.object(app, 'translate', translate):
                texts, scores = app.fast_predict_batch(Predictor(), images)
                self.assertEqual(texts, ['50', '80', '120'])
                self.assertEqual(scores, [1, 1, 1])
        finally:
            for image in images: image.close()


if __name__ == '__main__': unittest.main()
