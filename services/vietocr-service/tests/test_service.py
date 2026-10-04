import base64
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
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


if __name__ == "__main__":
    unittest.main()
