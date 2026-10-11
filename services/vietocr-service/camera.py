"""Bounded camera preparation. All geometry comes from pixels or user corners."""
import math

import cv2
import numpy as np

MAX_PIXELS = 12_000_000
MAX_SIDE = 8192


def order_quad(points):
    points = np.asarray(points, dtype=np.float32).reshape(4, 2)
    center = points.mean(axis=0)
    points = points[np.argsort(np.arctan2(points[:,1]-center[1],points[:,0]-center[0]))]
    points = np.roll(points,-int(np.argmin(points.sum(axis=1))),axis=0)
    if cv2.contourArea(points.reshape(-1,1,2),oriented=True) < 0:
        points = points[[0,3,2,1]]
    return points


def detect_page(rgb):
    """Edge and illumination masks agree on a visible, bright page, not a table.

    A full-image rectangle and text/table-only contours are not paper evidence.
    Detect small, then map rounded X/Y scales back to native coordinates.
    """
    height,width = rgb.shape[:2]
    scale = min(1,1200/max(width,height))
    sw,sh = max(2,round(width*scale)),max(2,round(height*scale))
    gray = cv2.cvtColor(cv2.resize(rgb,(sw,sh),interpolation=cv2.INTER_AREA),cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray,(5,5),0)
    equalized = cv2.createCLAHE(clipLimit=2,tileGridSize=(8,8)).apply(blurred)
    edges = [cv2.Canny(blurred,18,65),cv2.Canny(blurred,50,150),cv2.Canny(equalized,35,110)]
    support_mask = cv2.dilate(cv2.bitwise_or(edges[0],edges[2]),np.ones((5,5),np.uint8))
    _,otsu = cv2.threshold(blurred,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    masks = [(cv2.morphologyEx(e,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8)),'edges') for e in edges]
    masks.append((otsu,'luminance'))
    for percentile in (55,70,82):
        cutoff=max(35,float(np.percentile(blurred,percentile)))
        masks.append(((blurred>cutoff).astype(np.uint8)*255,'luminance'))
    candidates=[]
    for mask,method in masks:
        if method=='luminance':
            mask = cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((11,11),np.uint8))
        contours,_ = cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours,key=cv2.contourArea,reverse=True)[:24]:
            if cv2.contourArea(contour)<sw*sh*0.14:
                continue
            hull=cv2.convexHull(contour)
            perimeter=cv2.arcLength(hull,True)
            for epsilon in (0.012,0.022,0.04):
                polygon=cv2.approxPolyDP(hull,perimeter*epsilon,True)
                if len(polygon)!=4 or not cv2.isContourConvex(polygon):
                    continue
                points=order_quad(polygon)
                area=cv2.contourArea(points.reshape(-1,1,2))
                area_ratio=area/(sw*sh)
                if not 0.15<=area_ratio<=0.94:
                    continue
                lengths=np.linalg.norm(points-np.roll(points,-1,axis=0),axis=1)
                if min(lengths)<min(sw,sh)*0.12 or max(lengths)/min(lengths)>7:
                    continue
                # A frame-sized contour is not a found page. Near-border paper is
                # allowed when its other sides still have measured support.
                near = ((points[:,0]<2)|(points[:,1]<2)|(points[:,0]>sw-3)|(points[:,1]>sh-3))
                if sum(near)>2:
                    continue
                page=np.zeros_like(gray)
                cv2.fillConvexPoly(page,np.rint(points).astype(np.int32),255)
                eroded=cv2.erode(page,np.ones((11,11),np.uint8))
                ring=cv2.bitwise_and(cv2.dilate(page,np.ones((21,21),np.uint8)),cv2.bitwise_not(page))
                inside=gray[eroded!=0]; outside=gray[ring!=0]
                if not len(inside) or len(outside)<20:
                    continue
                contrast=float(np.median(inside)-np.median(outside))
                if contrast<10:
                    continue
                supports=[]
                for a,b in zip(points,np.roll(points,-1,axis=0)):
                    samples=a+(b-a)*np.linspace(0.05,0.95,64)[:,None]
                    xx=np.clip(np.rint(samples[:,0]).astype(int),0,sw-1)
                    yy=np.clip(np.rint(samples[:,1]).astype(int),0,sh-1)
                    supports.append(float(np.mean(support_mask[yy,xx]!=0)))
                # Threshold boundaries can recover an edge under shadow; require
                # two well-supported sides and no unsupported entire side.
                if min(supports)<0.30 or sum(s>=0.65 for s in supports)<2:
                    continue
                rectangularity=area/max(1,np.prod(cv2.minAreaRect(points)[1]))
                score=0.35*float(np.mean(supports))+0.25*rectangularity+0.25*min(1,area_ratio/0.6)+0.15*min(1,contrast/60)
                if score<0.67:
                    continue
                candidates.append((float(score),points,page,method))
                break
    if not candidates:
        return None,None,None,False
    candidates.sort(key=lambda item:item[0],reverse=True)
    best=candidates[0]
    ambiguous=any(np.count_nonzero(cv2.bitwise_and(best[2],other[2]))/max(1,min(np.count_nonzero(best[2]),np.count_nonzero(other[2])))<0.25
                  for other in candidates[1:] if other[0]>=best[0]-0.12)
    if ambiguous:
        return None,best[0],best[3],True
    points=best[1].astype(float)
    points[:,0]=(points[:,0]+0.5)*width/sw-0.5
    points[:,1]=(points[:,1]+0.5)*height/sh-0.5
    points[:,0]=np.clip(points[:,0],0,width-1); points[:,1]=np.clip(points[:,1],0,height-1)
    return points,best[0],best[3],False


def normalize_illumination(rgb,force=False):
    gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
    height,width=gray.shape
    scale=min(1,900/max(width,height))
    small=cv2.resize(gray,(max(2,round(width*scale)),max(2,round(height*scale))),interpolation=cv2.INTER_AREA)
    background=cv2.morphologyEx(small,cv2.MORPH_CLOSE,np.ones((31,31),np.uint8))
    background=cv2.GaussianBlur(background,(0,0),7)
    variation=float(np.percentile(background,90)-np.percentile(background,10))
    median=float(np.median(background))
    low,high=np.percentile(background,[10,90])
    midtones=float(np.mean((background>low+8)&(background<high-8)))
    # Gray desk corners next to a white rotated scan are two flat surfaces,
    # not a shadow gradient. Whitening that boundary manufactures false ink.
    applied=(variation>24 and midtones>0.12) or (force and median<220) or median<180
    if not applied:
        return rgb,False
    background=cv2.resize(background,(width,height),interpolation=cv2.INTER_CUBIC).astype(np.float32)
    normalized=np.clip(gray.astype(np.float32)*255/np.maximum(background,24),0,255).astype(np.uint8)
    # Mild sharpening after interpolation; preserve grayscale, not hard-binarized
    # glyphs. No generative restoration or invented accents.
    soft=cv2.GaussianBlur(normalized,(0,0),0.65)
    normalized=cv2.addWeighted(normalized,1.18,soft,-0.18,0)
    return cv2.cvtColor(normalized,cv2.COLOR_GRAY2RGB),True


def quality_metrics(original,prepared):
    gray=cv2.cvtColor(original,cv2.COLOR_RGB2GRAY)
    clean=cv2.cvtColor(prepared,cv2.COLOR_RGB2GRAY)
    scale=min(1,1600/max(clean.shape))
    clean=cv2.resize(clean,(max(2,round(clean.shape[1]*scale)),max(2,round(clean.shape[0]*scale))),interpolation=cv2.INTER_AREA)
    lap=cv2.Laplacian(clean,cv2.CV_32F)
    tile_scores=[float(lap[y:y+64,x:x+64].var()) for y in range(0,clean.shape[0],64) for x in range(0,clean.shape[1],64)]
    median=float(np.median(gray)); contrast=max(0,median-float(np.percentile(gray,2)))
    return {'medianBrightness':median,'inkContrast':contrast,'edgeSharpness':float(np.percentile(tile_scores,90)),
            'saturatedPixelRatio':float(np.mean(gray>=250))}


def prepare_document(image,quad=None,photo_mode='auto'):
    if photo_mode not in ('auto','camera','scan'):
        raise ValueError('INVALID_PHOTO_MODE')
    if min(image.size)<1 or max(image.size)>MAX_SIDE or image.width*image.height>MAX_PIXELS:
        raise ValueError('DETAILED_IMAGE_LIMIT')
    native=np.asarray(image.convert('RGB'))
    source_h,source_w=native.shape[:2]
    forward=np.eye(3)
    warnings=[]
    score,method,ambiguous=None,None,False
    origin='manual' if quad is not None else 'none'
    if quad is None and photo_mode!='scan':
        quad,score,method,ambiguous=detect_page(native)
        if quad is not None:
            origin='auto'; warnings.append('DOCUMENT_QUAD_AUTO_DETECTED')
        elif ambiguous:
            warnings.append('MULTIPLE_PAGES_DETECTED')
        elif photo_mode=='camera':
            warnings.append('DOCUMENT_CORNERS_NEED_REVIEW')
    points=None
    if quad is not None:
        points=np.asarray(quad,dtype=np.float64)
        if points.shape!=(4,2) or not np.isfinite(points).all():
            raise ValueError('INVALID_DOCUMENT_QUAD')
        if np.any(points<0) or np.any(points[:,0]>source_w-1) or np.any(points[:,1]>source_h-1):
            raise ValueError('INVALID_DOCUMENT_QUAD')
        contour=points.astype(np.float32).reshape(-1,1,2)
        if not cv2.isContourConvex(contour) or cv2.contourArea(contour,oriented=True)<=4:
            raise ValueError('INVALID_DOCUMENT_QUAD')
        if not (points[:2,1].mean()<points[2:,1].mean() and points[[0,3],0].mean()<points[[1,2],0].mean()):
            raise ValueError('INVALID_DOCUMENT_QUAD_ORDER')
        out_w=round(max(np.linalg.norm(points[1]-points[0]),np.linalg.norm(points[2]-points[3])))
        out_h=round(max(np.linalg.norm(points[3]-points[0]),np.linalg.norm(points[2]-points[1])))
        if min(out_w,out_h)<20 or out_w*out_h>MAX_PIXELS or max(out_w,out_h)>MAX_SIDE:
            raise ValueError('PERSPECTIVE_OUTPUT_LIMIT')
        forward=cv2.getPerspectiveTransform(points.astype(np.float32),np.array([[0,0],[out_w-1,0],[out_w-1,out_h-1],[0,out_h-1]],np.float32))
        denominators=np.c_[points,np.ones(4)]@forward[2]
        if not np.isfinite(forward).all() or abs(np.linalg.det(forward))<1e-12 or np.min(denominators)*np.max(denominators)<=0:
            raise ValueError('INVALID_PERSPECTIVE_TRANSFORM')
        native=cv2.warpPerspective(native,forward,(out_w,out_h),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
        warnings.append('PERSPECTIVE_APPLIED')
    original=native
    native,normalized=normalize_illumination(native,force=origin!='none' or photo_mode=='camera') if photo_mode!='scan' else (native,False)
    if normalized:
        warnings.append('ILLUMINATION_NORMALIZED')
    metrics=quality_metrics(original,native)
    if metrics['medianBrightness']<150:
        warnings.append('CAMERA_LOW_LIGHT')
    if metrics['inkContrast']<18 and metrics['edgeSharpness']>1:
        warnings.append('CAMERA_LOW_CONTRAST')
    if 0.2<metrics['edgeSharpness']<35:
        warnings.append('CAMERA_BLUR_POSSIBLE')
    if metrics['medianBrightness']<215 and metrics['saturatedPixelRatio']>0.015:
        warnings.append('CAMERA_GLARE_POSSIBLE')
    metadata={'mode':photo_mode,'perspectiveOrigin':origin,'sourceQuad':points.tolist() if points is not None else None,
              'detectionScore':score,'detectionMethod':method,'illuminationNormalized':normalized,'quality':metrics}
    return native,forward,metadata,warnings


def camera_skew(binary):
    """Recover larger rotation only with a consistent measured line direction."""
    scale=min(1,1400/max(binary.shape))
    mask=cv2.resize(binary,(max(2,round(binary.shape[1]*scale)),max(2,round(binary.shape[0]*scale))),interpolation=cv2.INTER_NEAREST)
    lines=cv2.HoughLinesP(mask,1,np.pi/720,threshold=40,minLineLength=max(55,mask.shape[1]//10),maxLineGap=16)
    votes=[]
    if lines is not None:
        for x1,y1,x2,y2 in lines[:,0]:
            if x2<x1:
                x1,y1,x2,y2=x2,y2,x1,y1
            angle=math.degrees(math.atan2(y2-y1,x2-x1))
            if 12<abs(angle)<=35:
                votes.append((angle,math.hypot(x2-x1,y2-y1)))
    if len(votes)<4:
        return 0.0
    votes.sort(); total=sum(w for _,w in votes); cumulative=0
    for angle,weight in votes:
        cumulative+=weight
        if cumulative>=total/2:
            median=angle; break
    support=sum(w for a,w in votes if abs(a-median)<1.0)/total
    return median if support>=0.75 else 0.0
