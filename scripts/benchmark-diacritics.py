"""Measure detached marks against independently rendered glyph masks and live OCR."""
import argparse
import base64
import io
import json
import runpy
import time
import unicodedata
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/ocr-diacritics'
FIXTURES=ROOT/'test-results/diacritics/fixtures'
helpers=runpy.run_path(str(ROOT/'scripts/benchmark-line-separation.py'))


def scenes():
    definitions=[
        ('title-arial','arial.ttf',['CỘNG HÒA XÃ HỘI'],[60],False,False),
        ('stacked-arial','arial.ttf',['Nguyễn Đặng'],[60],False,False),
        ('stacked-times','times.ttf',['Nguyễn Đặng'],[40],False,False),
        ('stacked-tahoma','tahoma.ttf',['Nguyễn Đặng'],[40],False,False),
        ('vowel-above-below','tahoma.ttf',['ệ'],[60],False,False),
        ('horn-acute','tahoma.ttf',['Ứ'],[60],False,False),
        ('dot-below','tahoma.ttf',['ẠẠẠ'],[40],False,False),
        ('tight-accented-rows','arial.ttf',['Nguyễn Đặng','Độc lập Hạnh phúc'],[60,60],False,False),
        ('tight-accented-cell','tahoma.ttf',['Nguyễn Đặng','Độc lập Hạnh phúc'],[60,60],True,False),
        ('small-zero-control','arial.ttf',['O','0'],[40,10],False,False),
        ('camera-stacked','tahoma.ttf',['Nguyễn Đặng'],[60],False,True),
    ]
    FIXTURES.mkdir(parents=True,exist_ok=True)
    for name,fontname,texts,sizes,cell,camera in definitions:
        with Image.new('RGB',(1200,360),'white') as image:
            draw=ImageDraw.Draw(image);masks=[];top=50
            if cell:
                draw.rectangle((10,10,1190,350),outline='black',width=2)
            for text,size in zip(texts,sizes):
                font=ImageFont.truetype('C:/Windows/Fonts/'+fontname,size)
                with Image.new('L',image.size,0) as layer:
                    ImageDraw.Draw(layer).text((35,top),text,font=font,fill=255,anchor='lt')
                    masks.append(np.asarray(layer)>128)
                draw.text((35,top),text,font=font,fill='black',anchor='lt')
                top+=draw.textbbox((0,0),text,font=font,anchor='lt')[3]+(2 if name=='small-zero-control' else 1)
            image.save(FIXTURES/f'{name}.png')
            encoded=io.BytesIO();image.save(encoded,format='PNG')
            yield name,texts,masks,encoded.getvalue(),camera


def glyph_ownership(document,masks):
    width,height=document['processed']['width'],document['processed']['height']
    forward=np.asarray(document['transforms']['sourceToProcessed'])
    glyphs=cv2.warpPerspective(np.uint8(np.logical_or.reduce(masks)),forward,(width,height),flags=cv2.INTER_NEAREST)!=0
    coverage=np.zeros((height,width),np.uint16)
    unknown=0
    for element in document['elements']:
        x,y,right,bottom=element['processedBox']
        if element['kind']=='line':
            coverage[y:bottom,x:right]+=1
        elif element['kind']=='unknown_region' and np.any(glyphs[y:bottom,x:right]):
            unknown+=1
    return {'unownedGlyphPixels':int(np.count_nonzero(glyphs&(coverage==0))),
            'duplicateGlyphPixels':int(np.count_nonzero(glyphs&(coverage>1))),
            'unknownRecordsContainingGlyphs':unknown}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('label',choices=['before','after']);args=parser.parse_args()
    with urllib.request.urlopen('http://127.0.0.1:8000/openapi.json',timeout=10) as response:
        version=json.load(response)['info']['version']
    expected_version='1.7.0' if args.label=='before' else '1.7.1'
    if version!=expected_version:
        raise RuntimeError(f'Expected live service {expected_version}, got {version}; preserve the historical baseline.')
    OUT.mkdir(parents=True,exist_ok=True);results=[]
    for name,texts,masks,bytes_,camera in scenes():
        payload={'image':'data:image/png;base64,'+base64.b64encode(bytes_).decode(),
                 'recognizeWords':True,'photoMode':'camera' if camera else 'scan'}
        if camera:
            payload['quad']=[[0,0],[1199,0],[1199,359],[0,359]]
        started=time.monotonic()
        request=urllib.request.Request('http://127.0.0.1:8000/predict/detailed',json.dumps(payload).encode(),{'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=170) as response:
            document=json.load(response)
        geometry=helpers['geometry'](document,masks)
        expected=' '.join(unicodedata.normalize('NFC',' '.join(texts)).split())
        actual=' '.join(unicodedata.normalize('NFC',document['fullText']).split())
        result={'case':name,**geometry,**glyph_ownership(document,masks),
                'extraLineRecords':max(0,geometry['detectedLines']-(geometry['expectedLines']-geometry['missedOrMergedLines'])),
                'cer':helpers['edit_distance'](expected,actual)/max(1,len(expected)),
                'referenceText':'\n'.join(texts),'actualText':document['fullText'],
                'counts':document['counts'],'elapsedMs':round((time.monotonic()-started)*1000)}
        results.append(result)
        if args.label=='after':
            (OUT/f'{name}.layout.json').write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
            (OUT/f'{name}.fulltext.txt').write_text('AFL · BẢN NHÁP CẦN ĐỐI CHIẾU\n\n'+document['fullText']+'\n',encoding='utf8')
        (OUT/f'{args.label}.json').write_text(json.dumps({'syntheticOnly':True,'realLocalModel':True,'recognizeWords':True,
            'serviceVersion':version,'execution':'HTTP real service; independent glyph masks never supplied to inference',
            'results':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps({k:v for k,v in result.items() if k not in ('referenceText','actualText')},ensure_ascii=True),flush=True)
    checks=('missedOrMergedLines','neighborContaminatedCrops','unownedGlyphPixels','duplicateGlyphPixels','unknownRecordsContainingGlyphs','extraLineRecords')
    if args.label=='after' and any(r[k] for r in results for k in checks):
        raise RuntimeError('DIACRITIC_GEOMETRY_REGRESSION: inspect after.json')


if __name__=='__main__':main()
