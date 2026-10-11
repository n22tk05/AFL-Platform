"""Independent glyph masks + real local OCR; no reference text sent to inference."""
import argparse
import base64
import io
import json
import time
import sys
import unicodedata
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/ocr-line-separation'
FIXTURES=ROOT/'test-results/line-separation/fixtures'


def baseline_split(mask,ownership_mask=None):
    """Snapshot of the 1.6.0 band splitter before this refinement."""
    from segmentation import text_boxes,ordered_boxes
    result=[]
    for x,y,w,h in text_boxes(mask):
        local=mask[y:y+h,x:x+w]
        active=np.flatnonzero(np.any(local!=0,axis=1))
        runs=np.split(active,np.where(np.diff(active)>1)[0]+1) if len(active) else []
        bands=[];limit=max(3,round(min(h,40)*0.14))
        for run in runs:
            top,bottom=int(run[0]),int(run[-1])+1
            if bands and top-bands[-1][1]<limit: bands[-1]=(bands[-1][0],bottom)
            else: bands.append((top,bottom))
        for top,bottom in bands:
            yy,xx=np.nonzero(local[top:bottom])
            if len(xx) and bottom-top>=2:
                result.append((x+int(xx.min()),y+top+int(yy.min()),int(xx.max()-xx.min()+1),int(yy.max()-yy.min()+1)))
    return ordered_boxes(result)


def baseline_crop(box,boxes,width,height,**options):
    x,y,w,h=box
    return max(0,x-3),max(0,y-4),min(width,x+w+3),min(height,y+h+4)


def baseline_non_text(mask,box,gray=None):
    x,y,w,h=box
    if h<=12 and w/max(1,h)>20 and np.mean(np.any(mask[y:y+h,x:x+w]!=0,axis=0))>=0.95: return 'guide_line'
    return 'unknown_region' if h<9 or w<4 else None


def scenes():
    definitions=[
        ('gap-one',['ALPHA 001234','BETA 567890'],[24,24],1,False,False),
        ('gap-two',['ALPHA 001234','BETA 567890'],[24,24],2,False,False),
        ('gap-three',['ALPHA 001234','BETA 567890'],[24,24],3,False,False),
        ('three-rows',['ALPHA 001234','BETA 567890','GAMMA 009876'],[24]*3,1,False,False),
        ('multiline-cell',['ALPHA 001234','BETA 567890'],[24,24],1,True,False),
        ('mixed-font',['ALPHA 001234','beta 567890'],[30,14],1,False,False),
        ('vietnamese-tight',['Nguyễn Đặng','Độc lập Hạnh phúc'],[24,24],1,False,False),
        ('vietnamese-control',['Nguyễn Đặng','Độc lập Hạnh phúc'],[24,24],14,False,False),
        ('offset-columns',['ALPHA','BETA'],[24,24],1,False,False),
        ('small-number',['001234'],[10],1,False,True),
        ('small-zero',['0'],[10],1,False,True),
    ]
    FIXTURES.mkdir(parents=True,exist_ok=True)
    for name,texts,sizes,gap,cell,camera in definitions:
        image=Image.new('RGB',(700,220),'white');draw=ImageDraw.Draw(image)
        if cell: draw.rectangle((10,10,690,210),outline='black',width=2)
        masks=[]; top=35
        for index,(text,size) in enumerate(zip(texts,sizes)):
            font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',size)
            x=120 if name=='offset-columns' and index else 30
            if name=='offset-columns' and index: top=44
            height=draw.textbbox((0,0),text,font=font,anchor='lt')[3]
            layer=Image.new('L',image.size,0)
            ImageDraw.Draw(layer).text((x,top),text,font=font,fill=255,anchor='lt')
            masks.append(np.asarray(layer)>128);layer.close()
            draw.text((x,top),text,font=font,fill='black',anchor='lt');top+=height+gap
        buffer=io.BytesIO();image.save(buffer,format='PNG');image.close()
        (FIXTURES/f'{name}.png').write_bytes(buffer.getvalue())
        yield name,texts,masks,buffer.getvalue(),camera


def edit_distance(a,b):
    row=list(range(len(b)+1))
    for i,left in enumerate(a,1):
        nxt=[i]
        for j,right in enumerate(b,1):
            nxt.append(min(row[j]+1,nxt[-1]+1,row[j-1]+(left!=right)))
        row=nxt
    return row[-1]


def geometry(document,masks):
    lines=[e for e in document['elements'] if e['kind']=='line']
    contaminated=0; missed=0; used=set()
    forward=np.asarray(document['transforms']['sourceToProcessed'])
    width,height=document['processed']['width'],document['processed']['height']
    for index,pixels in enumerate(masks):
        yy,xx=np.nonzero(pixels);gt=[xx.min(),yy.min(),xx.max()+1,yy.max()+1]
        matches=[]
        for i,line in enumerate(lines):
            x,y,r,b=line['bbox']
            intersection=max(0,min(r,gt[2])-max(x,gt[0]))*max(0,min(b,gt[3])-max(y,gt[1]))
            union=(r-x)*(b-y)+(gt[2]-gt[0])*(gt[3]-gt[1])-intersection
            matches.append((intersection/max(1,union),i))
        score,matched=max(matches,default=(0,-1))
        if score<0.65 or matched in used:
            missed+=1; continue
        used.add(matched)
        x,y,r,b=lines[matched]['cropBox']
        other=np.logical_or.reduce([m for j,m in enumerate(masks) if j!=index]) if len(masks)>1 else np.zeros_like(pixels)
        warped=cv2.warpPerspective(np.uint8(other),forward,(width,height),flags=cv2.INTER_NEAREST)
        contaminated+=int(np.any(warped[y:b,x:r]))
    return {'expectedLines':len(masks),'detectedLines':len(lines),'missedOrMergedLines':missed,'neighborContaminatedCrops':contaminated}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('label',choices=['before','after']);args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);results=[]
    if args.label=='before':
        sys.path.insert(0,str(ROOT/'services/vietocr-service'))
        import app
        app.load_model()
    for name,texts,masks,bytes_,camera in scenes():
        payload={'image':'data:image/png;base64,'+base64.b64encode(bytes_).decode(),'recognizeWords':False,'photoMode':'camera' if camera else 'scan'}
        if camera: payload['quad']=[[0,0],[699,0],[699,219],[0,219]]
        started=time.monotonic()
        request=urllib.request.Request('http://127.0.0.1:8000/predict/detailed',json.dumps(payload).encode(),{'Content-Type':'application/json'})
        if args.label=='before':
            with patch('detailed.split_lines',baseline_split),patch('detailed.isolated_crop',baseline_crop),patch('detailed.non_text_crop',baseline_non_text):
                document=app.predict_detailed(app.DetailedRequest(**payload))
        else:
            with urllib.request.urlopen(request,timeout=170) as response: document=json.load(response)
        expected=' '.join(unicodedata.normalize('NFC',' '.join(texts)).split())
        actual=' '.join(unicodedata.normalize('NFC',document['fullText']).split())
        result={'case':name,**geometry(document,masks),'cer':edit_distance(expected,actual)/max(1,len(expected)),
                'referenceText':'\n'.join(texts),'actualText':document['fullText'],'counts':document['counts'],'elapsedMs':round((time.monotonic()-started)*1000)}
        results.append(result)
        if args.label=='after':
            (OUT/f'{name}.layout.json').write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
            (OUT/f'{name}.fulltext.txt').write_text('AFL · BẢN NHÁP CẦN ĐỐI CHIẾU\n\n'+document['fullText']+'\n',encoding='utf8')
        (OUT/f'{args.label}.json').write_text(json.dumps({'syntheticOnly':True,'realLocalModel':True,'recognizeWords':False,
            'execution':'1.6.0 splitter/crop/small-text snapshots, in-process real model' if args.label=='before' else 'HTTP real service, current implementation',
            'geometryScope':'Independent glyph masks; one-to-one IoU >= 0.65, OCR crop tested for neighboring glyphs; no reference supplied to OCR.',
            'results':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps({k:v for k,v in result.items() if k not in ('referenceText','actualText')},ensure_ascii=True),flush=True)
    if args.label=='after' and any(r['missedOrMergedLines'] or r['neighborContaminatedCrops'] for r in results):
        raise RuntimeError('LINE_GEOMETRY_REGRESSION: inspect after.json')


if __name__=='__main__': main()
