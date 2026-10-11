import base64
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
from fastapi import HTTPException
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


def encoded(image, format="PNG"):
    buffer = io.BytesIO()
    image.save(buffer, format=format)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class ServiceTests(unittest.TestCase):
    def test_missing_and_invalid_confidence_stays_unknown(self):
        for value in [None, float("nan"), float("inf"), -0.1, 1.1, "bad"]:
            self.assertIsNone(app.confidence_value(value))
        self.assertEqual(app.confidence_value(0), 0)
        self.assertEqual(app.confidence_value(0.8), 0.8)

    def test_decoder_checks_data_and_format(self):
        image = Image.new("RGB", (100, 100), "white")
        for bad in ["invalid-base64", encoded(image, "GIF")]:
            with self.assertRaises(HTTPException) as caught:
                app.decode_base64_image(bad)
            self.assertEqual(caught.exception.status_code, 400)
        with app.decode_base64_image(encoded(image)) as result:
            self.assertEqual(result.size, image.size)
        image.close()

    def test_pixel_cap_before_decoding_pixels(self):
        with Image.new("RGB", (20, 20), "white") as image:
            payload = encoded(image)
        with patch.object(app, "MAX_IMAGE_PIXELS", 100):
            with self.assertRaises(HTTPException) as caught:
                app.decode_base64_image(payload)
            self.assertEqual(caught.exception.status_code, 413)

    def test_blank_page_returns_no_text_without_inference(self):
        with Image.new("RGB", (800, 1000), "white") as image:
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "fast_predict_batch") as infer:
            result = app.predict_lines(app.PredictRequest(image=payload))
            self.assertEqual(result.predictions, [])
            infer.assert_not_called()

    def test_empty_full_page_line_does_not_fall_back_to_line_model(self):
        with Image.new("RGB", (800, 1000), "white") as image:
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "fast_predict_batch") as infer:
            result = app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload, coordinates=[0, 0, 1, 1])]))
            self.assertEqual(result.predictions, [])
            infer.assert_not_called()

    def test_blank_page_without_coordinates_does_not_infer(self):
        with Image.new("RGB", (800, 1000), "white") as image:
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "fast_predict_batch") as infer:
            result = app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload)]))
            self.assertEqual(result.predictions, [])
            infer.assert_not_called()

    def test_blank_line_crop_does_not_infer(self):
        with Image.new("RGB", (300, 32), "white") as image:
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "fast_predict_batch") as infer:
            result = app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload, coordinates=[0.1, 0.1, 0.2, 0.9])]))
            self.assertEqual(result.predictions, [])
            infer.assert_not_called()

    def test_bordered_blank_page_and_dotted_crop_never_call_model(self):
        with Image.new("RGB", (800, 1000), "white") as image:
            draw = ImageDraw.Draw(image)
            draw.rectangle((50, 50, 750, 950), outline="black", width=2)
            for baseline in [200, 300, 400]:
                for horizontal in range(100, 700, 8):
                    draw.rectangle((horizontal, baseline, horizontal + 1, baseline + 1), fill="black")
            page_payload = encoded(image)
        with Image.new("RGB", (500, 40), "white") as image:
            draw = ImageDraw.Draw(image)
            for horizontal in range(20, 470, 8):
                draw.rectangle((horizontal, 25, horizontal + 1, 26), fill="black")
            crop_payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "fast_predict_batch") as infer:
            self.assertEqual(app.predict_lines(app.PredictRequest(image=page_payload)).predictions, [])
            self.assertEqual(app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=crop_payload, coordinates=[0.1, 0.1, 0.2, 0.9])])).predictions, [])
            infer.assert_not_called()

    def test_full_page_requests_split_multiline_regions_but_explicit_crops_do_not(self):
        with Image.new("RGB", (400, 200), "white") as image:
            ImageDraw.Draw(image).text((20, 30), "TEST PAGE", fill="black")
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "segment_document_lines", return_value=[]) as segment, \
                patch.object(app, "fast_predict_batch", return_value=(["TEST"], [0.95])):
            app.predict_lines(app.PredictRequest(image=payload))
            segment.assert_called_once()
            self.assertTrue(segment.call_args.kwargs["split_multiline"])
            segment.reset_mock()
            app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload, coordinates=[0, 0, 1, 1])]))
            segment.assert_called_once()
            self.assertTrue(segment.call_args.kwargs["split_multiline"])
            segment.reset_mock()
            app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload, coordinates=[0.1, 0.1, 0.2, 0.9])]))
            segment.assert_not_called()

    def test_failed_warmup_never_reports_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            weights = Path(directory) / "fake.pth"
            weights.write_bytes(b"fake model for unit test")
            with patch.object(app, "Predictor") as constructor, patch.dict(app.os.environ, {"VIETOCR_CONFIG_PATH": str(app.SERVICE_DIR / "inference.yml"), "VIETOCR_WEIGHTS_PATH": str(weights)}):
                constructor.return_value.predict_batch.side_effect = RuntimeError("test")
                with self.assertRaises(RuntimeError):
                    app.load_model()
                self.assertFalse(app.health()["ready"])

    def test_line_crops_retain_original_pixels_and_axis_scales(self):
        with Image.new("RGB", (3001, 2003), "white") as image:
            ImageDraw.Draw(image).rectangle((200, 300, 1000, 350), fill="black")
            regions = app.segment_document_lines(image)
            self.assertEqual(len(regions), 1)
            crop, box, _ = regions[0]
            try:
                self.assertGreater(crop.width, 700)
                self.assertAlmostEqual(crop.width, (box[3] - box[1]) * image.width)
                self.assertAlmostEqual(crop.height, (box[2] - box[0]) * image.height)
            finally:
                crop.close()

    def test_ruled_multiline_header_uses_cell_limited_line_crops(self):
        page = np.full((600, 800), 255, dtype=np.uint8)
        for horizontal in [220, 300, 340]:
            cv2.line(page, (100, horizontal), (700, horizontal), 0, 2)
        for vertical in [100, 160, 390, 520, 700]:
            cv2.line(page, (vertical, 220), (vertical, 340), 0, 2)
        cv2.putText(page, "NO", (110, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        cv2.putText(page, "FULL NAME", (175, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        cv2.putText(page, "DATE MONTH", (400, 254), cv2.FONT_HERSHEY_SIMPLEX, 0.45, 0, 2)
        cv2.putText(page, "YEAR", (425, 283), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        with Image.fromarray(page).convert("RGB") as image:
            regions = app.segment_document_lines(image)
            try:
                date_lines = [coords for _, coords, _ in regions if 0.45 <= coords[1] and coords[3] <= 0.66]
                self.assertEqual(len(date_lines), 2)
                self.assertLess(date_lines[0][0], date_lines[1][0])
                self.assertTrue(all(coords[3] < 0.66 for coords in date_lines))
            finally:
                for crop, _, _ in regions:
                    crop.close()

    def test_too_many_regions_is_explicit_error(self):
        with Image.new("RGB", (800, 1000), "white") as image:
            draw = ImageDraw.Draw(image)
            for y in [100, 200]:
                draw.rectangle((100, y, 600, y + 20), fill="black")
            with patch.object(app, "MAX_LINES", 1), self.assertRaises(HTTPException) as caught:
                app.segment_document_lines(image)
            self.assertEqual(caught.exception.status_code, 413)

    def test_model_missing_reports_unavailable(self):
        with patch.object(app, "predictor", None), self.assertRaises(HTTPException) as caught:
            app.predict_lines(app.PredictRequest())
        self.assertEqual(caught.exception.status_code, 503)

    def test_inference_error_releases_lock_and_does_not_synthesize_text(self):
        with Image.new("RGB", (300, 32), "white") as image:
            ImageDraw.Draw(image).rectangle((10, 10, 100, 20), fill="black")
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "fast_predict_batch", side_effect=RuntimeError("test")):
            with self.assertRaises(HTTPException) as caught:
                app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload)]))
            self.assertEqual(caught.exception.status_code, 500)
        self.assertFalse(app.inference_lock.locked())

    def test_response_preserves_null_and_zero(self):
        with Image.new("RGB", (300, 32), "white") as image:
            ImageDraw.Draw(image).rectangle((10, 10, 100, 20), fill="black")
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "fast_predict_batch", return_value=(["A", "B"], [None, 0])):
            result = app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload), app.LineItem(image=payload)]))
        self.assertIsNone(result.predictions[0].confidence)
        self.assertEqual(result.predictions[1].confidence, 0)

    def test_sparse_blank_crop_does_not_return_a_confidently_worded_model_guess(self):
        with Image.new("RGB", (180, 50), "white") as image:
            draw = ImageDraw.Draw(image)
            for horizontal in [15, 55, 95, 135]:
                draw.line((horizontal, 8, horizontal, 45), fill="black", width=1)
            payload = encoded(image)
        with patch.object(app, "predictor", object()), patch.object(app, "is_writing_area_without_text", return_value=False), \
                patch.object(app, "fast_predict_batch", return_value=(["TETTER"], [0.3])):
            result = app.predict_lines(app.PredictRequest(lines=[app.LineItem(image=payload, coordinates=[0.2, 0.2, 0.3, 0.7])]))
        self.assertEqual(result.predictions, [])


if __name__ == "__main__":
    unittest.main()
