import sys
import unittest
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from detailed import build_layout
from segmentation import segment_page, ink_mask
from line_layout import refine_lines


def sample(texts=('ALPHA 001234','BETA 567890'),sizes=(24,24),gap=1,cell=False,fontname='arial.ttf'):
    image=Image.new('RGB',(1800,400) if max(sizes)>40 else (700,220),'white')
    draw=ImageDraw.Draw(image)
    expected=[]; top=35
    if cell:
        draw.rectangle((10,10,image.width-10,image.height-10),outline='black',width=2)
    for text,size in zip(texts,sizes):
        font=ImageFont.truetype('C:/Windows/Fonts/'+fontname,size)
        height=draw.textbbox((0,0),text,font=font,anchor='lt')[3]
        layer=Image.new('L',image.size,0)
        ImageDraw.Draw(layer).text((30,top),text,font=font,fill=255,anchor='lt')
        draw.text((30,top),text,font=font,fill='black',anchor='lt')
        expected.append(np.asarray(layer)>128)
        layer.close(); top+=height+gap
    return image,expected


class LineLayoutTests(unittest.TestCase):
    def processed_masks(self,document,expected):
        forward=np.asarray(document['transforms']['sourceToProcessed'])
        size=(document['processed']['width'],document['processed']['height'])
        return [cv2.warpPerspective(np.uint8(p),forward,size,flags=cv2.INTER_NEAREST)!=0 for p in expected]

    def assert_separate(self,image,expected):
        document,_,_=build_layout(image,photo_mode='scan')
        expected=self.processed_masks(document,expected)
        lines=[e for e in document['elements'] if e['kind']=='line']
        self.assertEqual(len(lines),len(expected))
        for i,(line,pixels) in enumerate(zip(lines,expected)):
            x,y,right,bottom=line['processedBox']
            self.assertEqual(int(np.count_nonzero(pixels[y:bottom,x:right])),int(np.count_nonzero(pixels)))
            cx,cy,cr,cb=line['cropBox']
            for other in expected[:i]+expected[i+1:]:
                self.assertFalse(np.any(other[cy:cb,cx:cr]),'OCR padding contains neighboring glyphs')
        return document

    def test_one_two_and_three_pixel_gaps_keep_independent_lines_and_crops(self):
        for gap in (1,2,3):
            with self.subTest(gap=gap):
                image,expected=sample(gap=gap)
                with image: self.assert_separate(image,expected)

    def test_three_tight_rows_are_kept_without_losing_words(self):
        image,expected=sample(('ALPHA 001234','BETA 567890','GAMMA 009876'),(24,24,24))
        with image:
            document=self.assert_separate(image,expected)
        self.assertGreaterEqual(document['counts']['word'],6)
        covered=np.zeros(expected[0].shape,bool)
        for word in [e for e in document['elements'] if e['kind']=='word']:
            x,y,right,bottom=word['processedBox']; covered[y:bottom,x:right]=True
        self.assertTrue(all(np.all(covered[pixels]) for pixels in expected))

    def test_tight_multiline_cell_keeps_cell_parent_and_all_glyphs(self):
        image,expected=sample(cell=True)
        with image: document=self.assert_separate(image,expected)
        cell=next(e for e in document['elements'] if e['kind']=='cell')
        self.assertTrue(all(e['parentId']==cell['id'] for e in document['elements'] if e['kind']=='line'))

    def test_adjacent_large_and_small_fonts_remain_separate(self):
        image,expected=sample(('ALPHA 001234','beta 567890'),(30,14))
        with image: self.assert_separate(image,expected)

    def test_tight_vietnamese_lines_retain_all_accents(self):
        for size in (16,24,40):
            image,expected=sample(('Nguyễn Đặng','Độc lập Hạnh phúc'),(size,size))
            with self.subTest(size=size),image: self.assert_separate(image,expected)

    def test_descenders_and_accented_capitals_on_one_baseline_are_not_split(self):
        for size in (14,24,40):
            image,expected=sample(('gyp BẮC',),(size,))
            with self.subTest(size=size),image: self.assert_separate(image,expected)

    def test_offset_columns_do_not_form_a_single_diagonal_text_band(self):
        with Image.new('RGB',(500,180),'white') as image:
            draw=ImageDraw.Draw(image);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',24)
            draw.text((30,35),'ALPHA',font=font,fill='black',anchor='lt')
            draw.text((120,44),'BETA',font=font,fill='black',anchor='lt')
            document,_,_=build_layout(image,photo_mode='scan')
        self.assertEqual(document['counts']['line'],2)

    def test_small_camera_text_and_single_zero_are_read_candidates(self):
        for text in ('001234','0'):
            with self.subTest(text=text),Image.new('RGB',(400,180),'white') as image:
                draw=ImageDraw.Draw(image)
                draw.text((35,55),text,font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',10),fill='black',anchor='lt')
                document,_,crops=build_layout(image,[[0,0],[399,0],[399,179],[0,179]],'camera')
            self.assertEqual(document['counts'].get('line'),1)
            line=next(e for e in document['elements'] if e['kind']=='line')
            self.assertIn('SMALL_TEXT_OCR_REVIEW',line['reviewReasons'])
            self.assertTrue(any(e['kind']=='line' for e,_ in crops))

    def test_legacy_path_keeps_two_rows_and_uncontaminated_source_crops(self):
        image,expected=sample()
        with image: layout=segment_page(image)
        try:
            self.assertEqual(len(layout.regions),2)
            for i,(_,box,_) in enumerate(layout.regions):
                y,x,bottom,right=[round(n*size) for n,size in zip(box,(220,700,220,700))]
                self.assertFalse(np.any(expected[1-i][y:bottom,x:right]))
        finally:
            for crop,_,_ in layout.regions: crop.close()

    def test_sparse_bridge_does_not_merge_two_full_text_rows(self):
        image,_=sample(gap=2)
        with image:
            mask=ink_mask(cv2.cvtColor(np.asarray(image),cv2.COLOR_RGB2GRAY))
            # One-pixel vertical speck defeats a whole-width empty-row projection.
            mask[35:71,40]=255
            from segmentation import text_boxes
            boxes=refine_lines(mask,text_boxes(mask))
        self.assertEqual(len(boxes),2)

    def assert_no_detached_glyph_records(self,document,expected):
        ink=np.logical_or.reduce(self.processed_masks(document,expected))
        for element in document['elements']:
            if element['kind']=='unknown_region':
                x,y,right,bottom=element['processedBox']
                self.assertFalse(np.any(ink[y:bottom,x:right]),'A glyph mark became an unknown record')

    def test_detached_large_title_accents_are_not_extra_lines(self):
        for fontname in ('arial.ttf','times.ttf','tahoma.ttf','ariali.ttf'):
            for size in (40,60,80):
                with self.subTest(font=fontname,size=size):
                    image,expected=sample(('CỘNG HÒA XÃ HỘI',),(size,),fontname=fontname)
                    with image:
                        if size<80:
                            document=self.assert_separate(image,expected)
                        else:
                            document,_,_=build_layout(image,photo_mode='scan')
                            # Wide spaces may yield separate same-baseline text
                            # regions. No region may consist only of a detached mark.
                            coverage=np.zeros(expected[0].shape,np.uint8)
                            for line in (e for e in document['elements'] if e['kind']=='line'):
                                x,y,right,bottom=line['processedBox']
                                coverage[y:bottom,x:right]+=1
                                local=ink_mask(np.asarray(image.convert('L')))[y:bottom,x:right]
                                _,_,stats,_=cv2.connectedComponentsWithStats(local,8)
                                self.assertTrue(any(s[3]>=size*0.4 for s in stats[1:]))
                            self.assertTrue(np.all(coverage[expected[0]]==1))
                    self.assert_no_detached_glyph_records(document,expected)

    def test_stacked_circumflex_tilde_stays_with_vowel(self):
        for fontname in ('arial.ttf','times.ttf','tahoma.ttf','ariali.ttf'):
            for size in (40,60,80):
                with self.subTest(font=fontname,size=size):
                    image,expected=sample(('Nguyễn Đặng',),(size,),fontname=fontname)
                    with image: document=self.assert_separate(image,expected)
                    self.assert_no_detached_glyph_records(document,expected)
                    self.assertEqual(document['counts'].get('word'),2)

    def test_individual_vowel_keeps_above_below_and_horn_marks(self):
        for fontname in ('arial.ttf','times.ttf','tahoma.ttf','ariali.ttf'):
            for text in ('ệ','Ỉ','Ứ','Ự'):
                for size in (40,60,80):
                    with self.subTest(font=fontname,text=text,size=size):
                        image,expected=sample((text,),(size,),fontname=fontname)
                        with image: document=self.assert_separate(image,expected)
                        self.assert_no_detached_glyph_records(document,expected)
                        self.assertEqual(document['counts'].get('word'),1)

    def test_accented_large_rows_and_cell_keep_independent_full_glyphs(self):
        for fontname in ('arial.ttf','times.ttf','tahoma.ttf','ariali.ttf'):
            for cell in (False,True):
                with self.subTest(font=fontname,cell=cell):
                    image,expected=sample(('Nguyễn Đặng','Độc lập Hạnh phúc'),(60,60),gap=1,cell=cell,fontname=fontname)
                    with image: document=self.assert_separate(image,expected)
                    self.assert_no_detached_glyph_records(document,expected)

    def test_small_zero_below_large_letter_is_not_a_diacritic(self):
        image,expected=sample(('O','0'),(40,10),gap=2)
        with image: document=self.assert_separate(image,expected)
        self.assert_no_detached_glyph_records(document,expected)

    def test_small_numeric_row_below_large_text_is_not_a_row_of_accents(self):
        for size in (10,12,14):
            with self.subTest(size=size):
                image,expected=sample(('ALPHA 567890','123 001234'),(60,size),gap=2)
                with image: self.assert_separate(image,expected)

    def test_repeated_below_marks_are_not_dotted_input_guides(self):
        image,expected=sample(('ẠẠẠẠẠẠẠẠ',),(60,),fontname='tahoma.ttf')
        with image: document=self.assert_separate(image,expected)
        self.assertNotIn('OCR_DOTTED_GUIDES_DETECTED',document['warnings'])
        self.assert_no_detached_glyph_records(document,expected)

    def test_marks_in_separate_form_cells_keep_their_own_parent(self):
        image,expected=sample(('Nguyễn Đặng','Độc lập Hạnh phúc'),(60,60),gap=24,cell=True,fontname='tahoma.ttf')
        with image:
            first_rows=np.nonzero(expected[0])[0]
            second_rows=np.nonzero(expected[1])[0]
            separator=(int(first_rows.max())+int(second_rows.min()))//2
            ImageDraw.Draw(image).line((10,separator,image.width-10,separator),fill='black',width=2)
            document=self.assert_separate(image,expected)
        lines=[e for e in document['elements'] if e['kind']=='line']
        self.assertEqual(document['counts']['cell'],2)
        self.assertNotEqual(lines[0]['parentId'],lines[1]['parentId'])
        self.assert_no_detached_glyph_records(document,expected)

    def test_unaligned_ink_is_not_attached_as_an_accent(self):
        image,expected=sample(('Nguyễn Đặng',),(60,))
        with image:
            ImageDraw.Draw(image).ellipse((600,20,605,25),fill='black')
            document,_,_=build_layout(image,photo_mode='scan')
        self.assertTrue(any(e['kind']=='line' and e['processedBox'][0]<100
                            and e['processedBox'][2]<590 for e in document['elements']))
        self.assertTrue(any(e['processedBox'][0]>=590 and e['kind'] in ('line','unknown_region')
                            for e in document['elements']))

    def test_legacy_path_keeps_stacked_accents_in_source_crop(self):
        image,expected=sample(('Nguyễn Đặng',),(60,),fontname='times.ttf')
        with image: layout=segment_page(image)
        try:
            self.assertEqual(len(layout.regions),1)
            _,box,_=layout.regions[0]
            y,x,bottom,right=[round(n*size) for n,size in zip(box,(400,1800,400,1800))]
            self.assertEqual(np.count_nonzero(expected[0][y:bottom,x:right]),np.count_nonzero(expected[0]))
        finally:
            for crop,_,_ in layout.regions: crop.close()


if __name__=='__main__':
    unittest.main()
