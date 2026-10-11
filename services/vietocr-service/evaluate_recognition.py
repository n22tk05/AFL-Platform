import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
import app as service


def encoded(image):
    output = io.BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def edit_distance(first, second):
    previous = list(range(len(second) + 1))
    for first_index, first_char in enumerate(first, 1):
        current = [first_index]
        for second_index, second_char in enumerate(second, 1):
            current.append(min(current[-1] + 1, previous[second_index] + 1,
                               previous[second_index - 1] + (first_char != second_char)))
        previous = current
    return previous[-1]


def synthetic_pages():
    font_path = next((path for path in [Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")] if path.is_file()), None)
    if font_path is None:
        raise RuntimeError("A Unicode TrueType font is required for this evaluation")
    font = ImageFont.truetype(str(font_path), 28)
    page = Image.new("RGB", (1000, 800), "white")
    drawing = ImageDraw.Draw(page)
    expected = ["Họ và tên:", "Nội dung đề nghị:", "Nhận trực tiếp"]
    bounds = []
    for text, origin in zip(expected, [(70, 140), (70, 260), (115, 450)]):
        drawing.text(origin, text, font=font, fill="black")
        bounds.append(drawing.textbbox(origin, text, font=font))
    for left, baseline in [(260, 169), (340, 289), (70, 339), (70, 389)]:
        for horizontal in range(left, 910, 8):
            drawing.rectangle((horizontal, baseline, horizontal + 1, baseline + 1), fill="black")
    drawing.rectangle((70, 454, 94, 478), outline="black", width=2)
    drawing.rectangle((40, 80, 950, 540), outline="black", width=2)
    blank = Image.new("RGB", (1000, 800), "white")
    blank_draw = ImageDraw.Draw(blank)
    blank_draw.rectangle((40, 80, 950, 540), outline="black", width=2)
    blank_draw.rectangle((70, 454, 94, 478), outline="black", width=2)
    for baseline in [169, 289, 339, 389]:
        for horizontal in range(70, 910, 8):
            blank_draw.rectangle((horizontal, baseline, horizontal + 1, baseline + 1), fill="black")
    return page, blank, expected, bounds


def main():
    parser = argparse.ArgumentParser(description="Opt-in, offline VietOCR evaluation on synthetic, non-personal forms")
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    service.load_model()
    page, blank, expected, bounds = synthetic_pages()
    try:
        result = service.predict_lines(service.PredictRequest(image=encoded(page)))
        blank_result = service.predict_lines(service.PredictRequest(image=encoded(blank)))
        cropped = blank.crop((40, 80, 950, 540))
        try:
            blank_crop = service.predict_lines(service.PredictRequest(lines=[service.LineItem(image=encoded(cropped), coordinates=[0.1, 0.1, 0.8, 0.9])]))
        finally:
            cropped.close()
        predictions = [item.model_dump() for item in result.predictions]
        remaining = list(predictions)
        measured = []
        for text, rect in zip(expected, bounds):
            matched = min(remaining, key=lambda item: edit_distance(text.casefold(), item["text"].casefold()), default=None)
            if matched:
                remaining.remove(matched)
            measured.append({"expected": text, "recognized": matched["text"] if matched else "",
                "characterErrorRate": edit_distance(text, matched["text"] if matched else "") / len(text),
                "expectedLabelCoordsYXYX": [rect[1] / 800, rect[0] / 1000, rect[3] / 800, rect[2] / 1000],
                "detectedLabelCoordsYXYX": matched["coordinates"] if matched else None})
        summary = {"scope": "Synthetic text-line OCR, not field-detection acceptance or a 20-form benchmark",
            "model": "vgg_transformer local weights", "measurements": measured,
            "predictions": predictions, "unexpectedTextRegions": len(remaining),
            "blankPagePredictions": len(blank_result.predictions), "blankCropPredictions": len(blank_crop.predictions),
            "processingTimeMs": result.processingTimeMs}
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        page.save(arguments.output.with_suffix(".png"))
        print(json.dumps(summary, ensure_ascii=True))
        if summary["blankPagePredictions"] or summary["blankCropPredictions"]:
            raise RuntimeError("Blank regions produced hallucinated text")
    finally:
        page.close()
        blank.close()


if __name__ == "__main__":
    main()
