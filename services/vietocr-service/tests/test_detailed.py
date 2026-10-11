import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services/vietocr-service'))
from detailed import build_layout, recognize_layout, word_boxes
import app


def font(size=22):
    return ImageFont.truetype('C:/Windows/Fonts/arial.ttf', size)


class DetailedTests(unittest.TestCase):
    def test_native_dimension_cap_is_checked_before_segmentation(self):
        with Image.new('RGB', (8193, 2), 'white') as image:
            with self.assertRaisesRegex(ValueError, 'DETAILED_IMAGE_LIMIT'), patch('detailed.ink_mask') as detector:
                build_layout(image)
            detector.assert_not_called()

    def test_even_single_pixel_unassigned_mark_keeps_a_coordinate_record(self):
        with Image.new('RGB', (200, 100), 'white') as image:
            ImageDraw.Draw(image).point((170, 80), fill='black')
            document, _, _ = build_layout(image)
        unknown = [e for e in document['elements'] if e['kind'] == 'unknown_region']
        self.assertEqual(len(unknown), 1)
        self.assertEqual(unknown[0]['bbox'], [170, 80, 171, 81])
        self.assertEqual(document['coverage']['unassignedInkPixels'], 1)
        self.assertEqual(unknown[0]['recognitionStatus'], 'unreadable')

    def test_pixel_words_do_not_depend_on_ocr_text(self):
        with Image.new('RGB', (600, 100), 'white') as image:
            ImageDraw.Draw(image).text((20, 20), 'Alpha beta 0012', font=font(), fill='black')
            document, native, crops = build_layout(image)
        words = [e for e in document['elements'] if e['kind'] == 'word']
        self.assertEqual(len(words), 3)
        self.assertEqual(len({e['parentId'] for e in words}), 1)
        self.assertTrue(all(e['textRaw'] == '' for e in words))
        self.assertTrue(all(a['bbox'][2] < b['bbox'][0] for a, b in zip(words, words[1:])))

    def test_table_fixture_keeps_25_cells_four_blanks_and_child_lines(self):
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc04_table_empty_cells.png') as image:
            document, _, _ = build_layout(image)
        cells = [e for e in document['elements'] if e['kind'] == 'cell']
        self.assertEqual(len(cells), 25)
        self.assertEqual(sum(e['recognitionStatus'] == 'blank' for e in cells), 4)
        ids = {e['id'] for e in cells}
        self.assertEqual(sum(e['parentId'] in ids and e['kind'] == 'line' for e in document['elements']), 21)
        self.assertEqual(document['counts'].get('checkbox', 0), 0)

    def test_multiline_cell_keeps_each_line_and_word(self):
        with Image.new('RGB', (500, 250), 'white') as image:
            draw = ImageDraw.Draw(image)
            draw.rectangle((20, 20, 480, 230), outline='black', width=2)
            draw.text((40, 60), 'Alpha beta', font=font(), fill='black')
            draw.text((40, 130), 'Gamma delta', font=font(), fill='black')
            document, _, _ = build_layout(image)
        cells = [e for e in document['elements'] if e['kind'] == 'cell']
        self.assertEqual(len(cells), 1)
        lines = [e for e in document['elements'] if e['kind'] == 'line']
        self.assertEqual(len(lines), 2)
        self.assertTrue(all(e['parentId'] == cells[0]['id'] for e in lines))
        self.assertLess(lines[0]['bbox'][3], lines[1]['bbox'][1])
        self.assertEqual(document['counts']['word'], 4)

    def test_merged_cell_has_span_from_absent_border(self):
        with Image.new('RGB', (600, 330), 'white') as image:
            draw = ImageDraw.Draw(image)
            draw.rectangle((20, 20, 580, 310), outline='black', width=2)
            draw.line((20, 160, 580, 160), fill='black', width=2)
            draw.line((280, 160, 280, 310), fill='black', width=2)
            document, _, _ = build_layout(image)
        cells = [e for e in document['elements'] if e['kind'] == 'cell']
        self.assertEqual(len(cells), 3)
        self.assertEqual(cells[0]['columnSpan'], 2)
        self.assertEqual(cells[0]['rowSpan'], 1)

    def test_ambiguous_nonrectangular_table_span_still_reads_all_ink_lines(self):
        with Image.new('RGB',(600,330),'white') as image:
            draw = ImageDraw.Draw(image)
            draw.rectangle((20,20,580,310),outline='black',width=2)
            draw.line((300,160,580,160),fill='black',width=2)
            draw.line((300,160,300,310),fill='black',width=2)
            for x,y,text in [(50,50,'Alpha'),(350,50,'Beta'),(50,210,'Gamma'),(350,210,'Delta')]:
                draw.text((x,y),text,font=font(),fill='black')
            document,_,_ = build_layout(image)
        self.assertIn('BROKEN_TABLE_BOUNDARY',document['warnings'])
        self.assertEqual(document['counts']['line'],4)

    def test_checkboxes_do_not_remove_printed_o_or_d(self):
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc01_clean_accents.png') as image:
            document, _, _ = build_layout(image)
        self.assertEqual(document['counts'].get('checkbox', 0), 0)
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc05_checkboxes.png') as image:
            document, _, _ = build_layout(image)
        self.assertEqual(document['counts']['checkbox'], 7)
        states = [e['checkboxState'] for e in document['elements'] if e['kind'] == 'checkbox']
        self.assertEqual(states.count('checked'), 3)
        self.assertEqual(states.count('unchecked'), 4)
        self.assertTrue(all(e['labelIds'] for e in document['elements'] if e['kind'] == 'checkbox'))

    def test_rotated_polygons_and_inverse_transform_roundtrip(self):
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc07_skewed_perspective.png') as image:
            document, _, _ = build_layout(image)
        forward = np.array(document['transforms']['sourceToProcessed'])
        inverse = np.array(document['transforms']['processedToSource'])
        np.testing.assert_allclose(forward @ inverse, np.eye(3), atol=1e-8)
        for e in document['elements']:
            if e['kind'] != 'line':
                continue
            polygon = np.c_[np.array(e['polygon']), np.ones(4)] @ forward.T
            polygon = polygon[:, :2] / polygon[:, 2:]
            x1, y1, x2, y2 = e['processedBox']
            np.testing.assert_allclose(polygon, [[x1,y1],[x2,y1],[x2,y2],[x1,y2]], atol=1e-7)

    def test_perspective_transform_and_invalid_quad(self):
        with Image.new('RGB', (600, 400), 'white') as image:
            draw = ImageDraw.Draw(image)
            draw.text((100, 140), 'Perspective test', font=font(), fill='black')
            document, _, _ = build_layout(image, [[50,40],[550,70],[530,350],[70,340]])
            self.assertIn('PERSPECTIVE_APPLIED', document['warnings'])
            self.assertGreater(document['counts']['line'], 0)
            for quad in ([[0,0],[600,0],[599,399],[0,399]], [[0,0],[599,399],[599,0],[0,399]], [[0,0]]*4):
                with self.assertRaises(ValueError):
                    build_layout(image, quad)

    def test_page_over_70_regions_and_1000_words_is_not_truncated(self):
        with Image.new('RGB', (1000, 3200), 'white') as image:
            draw = ImageDraw.Draw(image)
            for index in range(130):
                draw.text((20, 10+index*24), 'one two three four five six seven eight', font=font(14), fill='black')
            document, _, _ = build_layout(image)
        self.assertEqual(document['counts']['line'], 130)
        self.assertGreaterEqual(document['counts']['word'], 1040)

    def test_small_footer_and_diacritics_keep_ink_boxes(self):
        with Image.new('RGB', (3200, 2000), 'white') as image:
            draw = ImageDraw.Draw(image)
            draw.text((5, 1960), 'Nguyễn Văn An 001234', font=font(14), fill='black')
            document, _, _ = build_layout(image)
        self.assertEqual(document['counts']['line'], 1)
        self.assertEqual(document['counts']['word'], 4)
        self.assertGreaterEqual(next(e for e in document['elements'] if e['kind'] == 'line')['bbox'][1], 1960)

    def test_inference_failure_and_budget_preserve_every_record(self):
        with Image.new('RGB', (600,100), 'white') as image:
            ImageDraw.Draw(image).text((20,20), 'Alpha beta', font=font(), fill='black')
            document, native, crops = build_layout(image)
        ids = [e['id'] for e in document['elements']]
        def failure(images):
            raise RuntimeError('fake batch failure')
        result = recognize_layout(document, native, crops, failure)
        self.assertEqual(ids, [e['id'] for e in result['elements']])
        self.assertIn('OCR_BATCH_FAILED', result['warnings'])
        self.assertIn('[UNREADABLE:', result['fullText'])
        with Image.new('RGB', (600,100), 'white') as image:
            ImageDraw.Draw(image).text((20,20), 'Alpha beta', font=font(), fill='black')
            document, native, crops = build_layout(image)
        result = recognize_layout(document, native, crops, lambda images: ([], []), budget_seconds=0)
        self.assertIn('OCR_TIME_BUDGET_EXHAUSTED', result['warnings'])
        self.assertEqual(result['status'], 'partial')

    def test_fast_alignment_is_explicitly_unverified(self):
        with Image.new('RGB', (600,100), 'white') as image:
            ImageDraw.Draw(image).text((20,20), 'Alpha beta', font=font(), fill='black')
            document, native, crops = build_layout(image)
        result = recognize_layout(document, native, crops, lambda images: (['Alpha beta']*len(images), [0.9]*len(images)), recognize_words=False)
        words = [e for e in result['elements'] if e['kind'] == 'word']
        self.assertEqual([e['textRaw'] for e in words], ['Alpha','beta'])
        self.assertTrue(all('WORD_TEXT_ALIGNMENT_UNVERIFIED' in e['reviewReasons'] for e in words))

    def test_fulltext_keeps_checkbox_states_without_duplicating_label_text(self):
        with Image.open(ROOT / 'tests/fixtures/ocr-json/tc05_checkboxes.png') as image:
            document, native, crops = build_layout(image)
        result = recognize_layout(document, native, crops, lambda images: (['label']*len(images), [0.9]*len(images)), recognize_words=False)
        self.assertEqual(result['fullText'].count('[x]'), 3)
        self.assertEqual(result['fullText'].count('[ ]'), 4)

    def test_ambiguous_word_group_is_preserved_and_refined_at_real_pixel_gaps(self):
        with Image.new('RGB',(600,100),'white') as image:
            ImageDraw.Draw(image).text((20,20),'Alpha beta',font=font(),fill='black')
            # Simulate an undersegmented detector, with genuine source ink bounds.
            with patch('detailed.word_boxes',side_effect=lambda mask,box:[box]):
                document,native,crops = build_layout(image)
        original_id = next(e['id'] for e in document['elements'] if e['kind']=='word')
        calls = 0
        def recognize(images):
            nonlocal calls
            calls += 1
            return (['Alpha beta']*len(images) if calls==1 else ['Alpha','beta'], [0.9]*len(images))
        result = recognize_layout(document,native,crops,recognize)
        group = next(e for e in result['elements'] if e['id']==original_id)
        self.assertEqual(group['kind'],'word_group')
        self.assertEqual(group['textRaw'],'Alpha beta')
        words = [e for e in result['elements'] if e['kind']=='word']
        self.assertEqual([e['textRaw'] for e in words],['Alpha','beta'])
        self.assertTrue(all(e['parentId']==original_id for e in words))
        self.assertLess(words[0]['bbox'][2],words[1]['bbox'][0])
        self.assertEqual(result['counts']['word'],2)
        self.assertEqual(result['fullText'],'Alpha beta')

    def test_blank_page_does_not_invoke_predictor(self):
        with Image.new('RGB', (600,100), 'white') as image:
            document, native, crops = build_layout(image)
        def unexpected(images):
            self.fail('Blank page must not call OCR')
        result = recognize_layout(document, native, crops, unexpected)
        self.assertEqual(result['fullText'], '')
        self.assertEqual(result['counts'], {'page': 1})

    def test_endpoint_uses_local_model_lock_and_keeps_legacy_shape(self):
        from test_service import encoded
        with Image.new('RGB', (400,100), 'white') as image:
            ImageDraw.Draw(image).text((20,20), 'Alpha beta', font=font(), fill='black')
            request = app.DetailedRequest(image=encoded(image), recognizeWords=False)
        with patch.object(app, 'predictor', object()), patch.object(app, 'fast_predict_batch', side_effect=lambda pred, images: (['Alpha beta']*len(images), [0.9]*len(images))):
            result = app.predict_detailed(request)
        self.assertEqual(result['schemaVersion'], 'detailed-1.0')
        self.assertFalse(app.inference_lock.locked())
        self.assertEqual(set(app.PredictResponse(predictions=[]).model_dump()), {'predictions','processingTimeMs','tables','warnings','skewDegrees'})
        with patch.object(app, 'predictor', None):
            with self.assertRaises(HTTPException) as caught:
                app.predict_detailed(request)
        self.assertEqual(caught.exception.status_code, 503)


if __name__ == '__main__':
    unittest.main()
