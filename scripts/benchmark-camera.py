"""Reproducible camera degradations, independent reference, real local OCR only."""
import argparse
import base64
import json
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'test-results/camera/fixtures'
REPORTS = ROOT / 'docs/ocr-camera'


def scenes():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261011)
    definitions = [
        ('scan-control', 'TC01', None, 1.0, 0.0, 95),
        ('diagonal-shadow', 'TC01', [[150,70],[1160,200],[1030,1530],[220,1380]], 0.55, 0.3, 85),
        ('strong-perspective', 'TC01', [[380,150],[1110,350],[1280,1400],[120,1560]], 0.8, 0.3, 85),
        ('low-light', 'TC01', [[130,140],[1150,90],[1260,1450],[60,1550]], 0.32, 0.45, 75),
        ('table-phone', 'TC04', [[350,100],[1350,380],[1200,1550],[120,1450]], 0.62, 0.35, 85),
        ('near-border', 'TC01', [[3,180],[1180,5],[1330,1500],[60,1670]], 0.7, 0.3, 85),
    ]
    truth = json.loads((ROOT/'tests/fixtures/ocr-json/ground-truth.json').read_text(encoding='utf-8'))['fixtures']
    for name, fixture, quad, dark, blur, quality in definitions:
        reference = truth[fixture]
        clean = cv2.imread(str(ROOT/'tests/fixtures/ocr-json'/reference['filename']))
        if quad is None:
            image = clean.copy()
        else:
            h,w = clean.shape[:2]
            canvas_h,canvas_w = 1750,1500
            yy,xx = np.mgrid[:canvas_h,:canvas_w]
            noise = rng.normal(0,1.8,(canvas_h,canvas_w))
            wood = 76+8*np.sin(xx/28)+4*np.cos(yy/95)+noise
            image = np.stack([wood*0.85,wood,wood*1.14],axis=2).clip(0,255).astype(np.uint8)
            matrix = cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),np.float32(quad))
            warped = cv2.warpPerspective(clean,matrix,(canvas_w,canvas_h),flags=cv2.INTER_CUBIC)
            mask = cv2.warpPerspective(np.full((h,w),255,np.uint8),matrix,(canvas_w,canvas_h))
            image[mask>127] = warped[mask>127]
            illumination = dark+(1-dark)*(xx/canvas_w)
            illumination *= 1-0.22*np.exp(-((xx/canvas_w-0.35)/0.18)**2)
            image = (image.astype(float)*illumination[:,:,None]).clip(0,255).astype(np.uint8)
            if blur:
                image = cv2.GaussianBlur(image,(3,3),blur)
        encoded = cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,quality])[1].tobytes()
        (FIXTURES/f'{name}.jpg').write_bytes(encoded)
        yield {'name':name,'fixture':fixture,'bytes':encoded,'quad':quad,
               'reference':'\n'.join(reference['expectedFullTextInReadingOrder']), 'synthetic':True}


def normalize(text):
    return ' '.join(unicodedata.normalize('NFC',text).split())


def distance(a,b):
    row = list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt = [i]
        for j,y in enumerate(b,1):
            nxt.append(min(row[j]+1,nxt[-1]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('label',choices=['before','after'])
    args=parser.parse_args()
    REPORTS.mkdir(parents=True,exist_ok=True)
    results=[]
    for scene in scenes():
        started=time.monotonic()
        data=json.dumps({'image':'data:image/jpeg;base64,'+base64.b64encode(scene['bytes']).decode(),
                         'recognizeWords':False,'photoMode':'auto'}).encode()
        request=urllib.request.Request('http://127.0.0.1:8000/predict/detailed',data,{'Content-Type':'application/json'})
        result={'case':scene['name'],'fixture':scene['fixture'],'reference':scene['reference']}
        try:
            with urllib.request.urlopen(request,timeout=170) as response:
                document=json.load(response)
            text=document['fullText']
            expected,actual=normalize(scene['reference']),normalize(text)
            result.update({'success':True,'cer':distance(expected,actual)/max(1,len(expected)),
                           'wer':distance(expected.split(),actual.split())/max(1,len(expected.split())),
                           'counts':document['counts'],'warnings':document['warnings'],'actualText':text,
                           'preprocessing':document.get('preprocessing'),
                           'elapsedMs':round((time.monotonic()-started)*1000)})
            if args.label=='after':
                (REPORTS/f"{scene['name']}.layout.json").write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
                (REPORTS/f"{scene['name']}.fulltext.txt").write_text('BAN NHAP CAN DOI CHIEU\n\n'+text+'\n',encoding='utf-8')
        except Exception as error:
            result.update({'success':False,'error':type(error).__name__,'cer':None,'wer':None})
            if isinstance(error,urllib.error.HTTPError):
                result['httpStatus']=error.code
        results.append(result)
        print(json.dumps({k:v for k,v in result.items() if k not in ('reference','actualText','preprocessing')},ensure_ascii=True),flush=True)
        report={'syntheticOnly':True,'model':'real-local-vietocr','mode':'auto','wordRecognition':False,
                'metricScope':'NFC, collapsed whitespace, no reference text supplied to OCR; six deterministic scenes, not a real-phone holdout.',
                'results':results}
        (REPORTS/f'{args.label}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if any(not result['success'] for result in results):
        sys.exit(1)


if __name__=='__main__':
    main()
