import sys
import unittest
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'services/vietocr-service'))
from camera import detect_page, prepare_document, camera_skew
from detailed import build_layout
from segmentation import ink_mask, segment_page


def page():
    image=Image.new('RGB',(600,800),'white')
    draw=ImageDraw.Draw(image)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
    for i in range(7):
        draw.text((45,70+i*80),f'Native document line {i:02d} 001234',font=font,fill='black')
    return image


def photograph(image,quad,dark=0.5):
    source=np.asarray(image)
    h,w=source.shape[:2]
    output=np.full((1100,1000,3),(75,70,85),np.uint8)
    matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),np.float32(quad))
    warp=cv2.warpPerspective(source,matrix,(1000,1100))
    mask=cv2.warpPerspective(np.full((h,w),255,np.uint8),matrix,(1000,1100))
    output[mask>127]=warp[mask>127]
    factor=dark+(1-dark)*np.linspace(0,1,1000)
    output=np.uint8(output.astype(float)*factor[None,:,None])
    encoded=cv2.imencode('.jpg',cv2.cvtColor(output,cv2.COLOR_RGB2BGR),[cv2.IMWRITE_JPEG_QUALITY,80])[1]
    return Image.fromarray(cv2.cvtColor(cv2.imdecode(encoded,cv2.IMREAD_COLOR),cv2.COLOR_BGR2RGB))


class CameraTests(unittest.TestCase):
    def test_independent_keystone_shadow_and_near_border_cases_find_real_corners(self):
        quads=[[[100,30],[850,130],[790,1030],[160,920]],
               [[260,80],[810,220],[900,940],[50,1020]],
               [[3,110],[810,4],[920,950],[80,1090]]]
        for quad in quads:
            with self.subTest(quad=quad),page() as original,photograph(original,quad) as image:
                points,score,_,ambiguous=detect_page(np.asarray(image))
                self.assertFalse(ambiguous)
                self.assertIsNotNone(points)
                self.assertLess(float(np.max(np.linalg.norm(points-np.array(quad),axis=1))),6)
                self.assertGreater(score,0.67)
                document,_,_=build_layout(image)
                self.assertEqual(document['counts']['line'],7)
                self.assertEqual(document['preprocessing']['perspectiveOrigin'],'auto')
                self.assertIn('ILLUMINATION_NORMALIZED',document['warnings'])
                forward=np.array(document['transforms']['sourceToProcessed'])
                inverse=np.array(document['transforms']['processedToSource'])
                np.testing.assert_allclose(forward@inverse,np.eye(3),atol=1e-8)

    def test_clean_scan_and_printed_grid_are_not_mistaken_for_page_boundaries(self):
        for fixture in ('tc01_clean_accents','tc04_table_empty_cells'):
            with self.subTest(fixture=fixture),Image.open(ROOT/f'tests/fixtures/ocr-json/{fixture}.png') as image:
                native,forward,metadata,warnings=prepare_document(image)
                self.assertEqual(metadata['perspectiveOrigin'],'none')
                self.assertFalse(metadata['illuminationNormalized'])
                np.testing.assert_array_equal(native,np.asarray(image.convert('RGB')))
                np.testing.assert_array_equal(forward,np.eye(3))

    def test_scan_mode_explicitly_preserves_source_even_for_shadowed_photo(self):
        with page() as original,photograph(original,[[100,30],[850,130],[790,1030],[160,920]]) as image:
            native,matrix,meta,_=prepare_document(image,photo_mode='scan')
            self.assertEqual(meta['perspectiveOrigin'],'none')
            self.assertFalse(meta['illuminationNormalized'])
            np.testing.assert_array_equal(native,np.asarray(image))
            np.testing.assert_array_equal(matrix,np.eye(3))

    def test_manual_corners_recover_low_contrast_paper_without_invented_quad(self):
        quad=[[100,80],[890,100],[850,1010],[150,980]]
        with page() as original,photograph(original,quad,dark=0.2) as image:
            _,matrix,meta,warnings=prepare_document(image,quad,photo_mode='camera')
            self.assertEqual(meta['perspectiveOrigin'],'manual')
            np.testing.assert_array_equal(meta['sourceQuad'],quad)
            self.assertIn('PERSPECTIVE_APPLIED',warnings)
            self.assertIn('ILLUMINATION_NORMALIZED',warnings)
            self.assertNotEqual(float(np.linalg.det(matrix)),0)

    def test_dark_frame_and_cropped_page_request_review_instead_of_fake_quad(self):
        for image in (Image.new('RGB',(400,400),(10,10,10)),page().crop((80,100,500,600))):
            with image:
                _,_,meta,warnings=prepare_document(image,photo_mode='camera')
                self.assertEqual(meta['perspectiveOrigin'],'none')
                self.assertIsNone(meta['sourceQuad'])
                self.assertIn('DOCUMENT_CORNERS_NEED_REVIEW',warnings)

    def test_multiple_separate_pages_are_flagged_and_not_silently_cropped(self):
        with Image.new('RGB',(1000,800),(60,60,60)) as image:
            draw=ImageDraw.Draw(image)
            draw.rectangle((40,50,430,740),fill='white')
            draw.rectangle((560,80,950,750),fill='white')
            points,_,_,ambiguous=detect_page(np.asarray(image))
            self.assertIsNone(points)
            self.assertTrue(ambiguous)
            _,_,meta,warnings=prepare_document(image)
            self.assertEqual(meta['perspectiveOrigin'],'none')
            self.assertIn('MULTIPLE_PAGES_DETECTED',warnings)

    def test_blur_and_glare_warnings_are_based_on_pixels(self):
        with page() as image:
            blurred=Image.fromarray(cv2.GaussianBlur(np.asarray(image),(0,0),4))
            with blurred:
                _,_,meta,warnings=prepare_document(blurred,photo_mode='camera')
                self.assertLess(meta['quality']['edgeSharpness'],35)
                self.assertIn('CAMERA_BLUR_POSSIBLE',warnings)
        with Image.new('RGB',(500,500),(120,120,120)) as image:
            ImageDraw.Draw(image).rectangle((180,50,260,200),fill='white')
            _,_,meta,warnings=prepare_document(image,photo_mode='scan')
            self.assertGreater(meta['quality']['saturatedPixelRatio'],0.015)
            self.assertIn('CAMERA_GLARE_POSSIBLE',warnings)

    def test_otsu_does_not_turn_near_white_texture_into_glyphs(self):
        gray=np.full((300,400),255,np.uint8)
        gray[:,::10]=250
        mask=ink_mask(gray)
        self.assertEqual(int(np.count_nonzero(mask)),0)

    def test_camera_underline_and_small_ink_remain_geometry_without_false_ocr_lines(self):
        with page() as original:
            draw=ImageDraw.Draw(original)
            draw.line((110,108,420,109),fill='black',width=3)
            draw.rectangle((100,25,108,28),fill='black')
            with photograph(original,[[260,80],[810,220],[900,940],[50,1020]]) as image:
                document,_,crops=build_layout(image)
        self.assertEqual(document['counts']['line'],7)
        self.assertTrue(any(e['kind']=='guide_line' for e in document['elements']))
        self.assertTrue(any(e['kind']=='unknown_region' for e in document['elements']))
        self.assertTrue(all(e['processedBox'][3]-e['processedBox'][1]>=6 for e,_ in crops if e['kind']=='line'))

    def test_rotation_over_twelve_degrees_has_measured_support(self):
        mask=np.zeros((700,700),np.uint8)
        for y in range(80,520,50):
            cv2.line(mask,(80,y),(550,y+150),255,2)
        angle=camera_skew(mask)
        self.assertAlmostEqual(angle,17.7,delta=0.5)

    def test_legacy_page_path_uses_same_camera_correction_and_source_bounds(self):
        with page() as original,photograph(original,[[100,30],[850,130],[790,1030],[160,920]]) as image:
            layout=segment_page(image)
        try:
            self.assertIn('PERSPECTIVE_APPLIED',layout.warnings)
            self.assertEqual(len(layout.regions),7)
            self.assertTrue(all(0<=n<=1 for _,box,_ in layout.regions for n in box))
        finally:
            for crop,_,_ in layout.regions: crop.close()

    def test_invalid_quad_and_mode_remain_hard_errors(self):
        with page() as image:
            with self.assertRaisesRegex(ValueError,'INVALID_PHOTO_MODE'):
                prepare_document(image,photo_mode='invent')
            with self.assertRaisesRegex(ValueError,'INVALID_DOCUMENT_QUAD'):
                prepare_document(image,[[0,0],[0,700],[500,700],[500,0]])


if __name__=='__main__':
    unittest.main()
