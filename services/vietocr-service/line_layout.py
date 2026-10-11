"""Pixel-backed refinement of coarse text bands; OCR never determines boundaries."""
import cv2
import numpy as np


def _tight(mask, x, y, w, h):
    yy, xx = np.nonzero(mask[y:y+h, x:x+w])
    if not len(xx):
        return None
    return (x+int(xx.min()), y+int(yy.min()), int(xx.max()-xx.min()+1), int(yy.max()-yy.min()+1))


def _bands(local):
    active = np.flatnonzero(np.any(local != 0, axis=1))
    if not len(active):
        return []
    return [(int(run[0]), int(run[-1])+1) for run in np.split(active, np.where(np.diff(active)>1)[0]+1)]


def _diacritic_parents(mask, stats):
    """Associate detached ink with an aligned, substantially taller glyph.

    Work on original components, before dilation: stacked accents can themselves
    form a convincing coarse text band. Keep enclosed small glyphs (e.g. 0) and
    unaligned punctuation independent. A spatial index bounds local searches.
    """
    if len(stats)>50000:
        return {}
    index={}
    for i,(x,y,w,h,area) in enumerate(stats):
        joined_word=h>=12 and w>h*4 and 0.05<=area/max(1,w*h)<=0.75
        if not (6<=h<=256 and area>=5 and w>=h*0.08 and (w<=h*4 or joined_word)):
            continue
        reach=max(3,h*0.45)
        for gy in range(max(0,int(y-reach)//64),int(y+h+reach)//64+1):
            for gx in range(max(0,int(x-h*0.25)//64),int(x+w+h*0.25)//64+1):
                index.setdefault((gx,gy),[]).append(i)
    parents={}; labels=None; holes={}
    def has_counter(i):
        if i not in holes:
            x,y,w,h,_=stats[i]
            contours,hierarchy=cv2.findContours(mask[y:y+h,x:x+w],cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
            holes[i]=hierarchy is not None and any(hierarchy[0,k,3]>=0 and cv2.contourArea(c)>=2
                                                   for k,c in enumerate(contours))
        return holes[i]
    for i,(x,y,w,h,area) in enumerate(stats):
        nearby=index.get((int(x+w/2)//64,int(y+h/2)//64),[])
        if len(nearby)>256:
            continue
        choices=[]
        for j in nearby:
            bx,by,bw,bh,barea=stats[j]
            if h>=bh*0.45 or w>bh*0.9 or area>barea*0.8:
                continue
            dx=abs(x+w/2-(bx+bw/2))
            if dx>bw/2+bh*0.2:
                continue
            body_top,body_bottom=by,by+bh
            near_top=y+h/2<by+bh*0.35
            near_bottom=y+h/2>by+bh*0.65
            if y+h>by and y<by+bh and (near_top or near_bottom):
                # A horn or serif may extend above the stem beside an acute mark.
                # Measure the body at the mark's columns, not its global rectangle.
                if labels is None:
                    _,labels=cv2.connectedComponents(mask,8)
                left,right=max(x,bx),min(x+w,bx+bw)
                if right>left:
                    rows=np.flatnonzero(np.any(labels[by:by+bh,left:right]==j+1,axis=1))
                    if len(rows):
                        if near_top:
                            body_top=min(by+int(rows[0]),by+round(bh*0.25))
                        if near_bottom:
                            body_bottom=max(by+int(rows[-1])+1,by+bh-round(bh*0.15))
            above=y+h<=body_top
            below=y>=body_bottom
            gap=body_top-y-h if above else y-body_bottom
            if not (above or below) or gap>max(3,bh*(0.45 if above else 0.2)):
                continue
            if below and (h>bh*0.25 or w>bh*0.45 or not 0.4<=w/max(1,h)<=2):
                continue
            choices.append((gap/max(1,bh)+dx/max(1,bw+bh*0.2),j))
        if not choices:
            continue
        # A small zero/letter with a counter is still text, not a detached mark.
        if has_counter(i):
            continue
        parents[i]=min(choices)[1]
    # Vietnamese vowels may have two detached levels (e.g. circumflex + tilde).
    # Extend only through an already attached mark, never by enlarging every gap.
    stacked_index={}
    for j in parents:
        mx,my,mw,mh,_=stats[j]
        root=parents[j]
        while root in parents:
            root=parents[root]
        by,bh=stats[root][1],stats[root][3]
        if my+mh>by+bh*0.25:
            continue
        for gy in range(max(0,int(my-bh*0.45)//64),int(my+mh)//64+1):
            for gx in range(max(0,int(mx-bh*0.25)//64),int(mx+mw+bh*0.25)//64+1):
                stacked_index.setdefault((gx,gy),[]).append(j)
    for i,(x,y,w,h,area) in enumerate(stats):
        if i in parents:
            continue
        choices=[]
        nearby=stacked_index.get((int(x+w/2)//64,int(y+h/2)//64),[])
        if len(nearby)>256:
            continue
        for j in nearby:
            mx,my,mw,mh,_=stats[j]
            root=parents[j]
            while root in parents:
                root=parents[root]
            bx,by,bw,bh,barea=stats[root]
            gap=my-y-h
            if (0<=gap<=max(3,bh*0.25) and h<bh*0.45 and w<=bh*0.9 and area<=barea*0.8
                    and abs(x+w/2-(mx+mw/2))<=max(mw,w)*0.6
                    and by-y-h<=bh*0.8 and not has_counter(i)):
                choices.append((gap,root))
        if choices:
            parents[i]=min(choices)[1]
    return parents


def _attach_detached_marks(mask, boxes):
    """Return each mark to its glyph's line, including marks the coarse detector
    omitted. Remove a separate box only when every component belongs elsewhere.
    Unrelated ink remains available to the residual/review path.
    """
    if not boxes:
        return boxes
    _,_,stats,_=cv2.connectedComponentsWithStats(mask,8)
    stats=stats[1:]
    parents=_diacritic_parents(mask,stats)
    if not parents:
        return boxes
    index={}
    for i,(x,y,w,h) in enumerate(boxes):
        for gy in range(y//64,(y+h)//64+1):
            for gx in range(x//64,(x+w)//64+1):
                index.setdefault((gx,gy),[]).append(i)
    owners={}; members=[[] for _ in boxes]
    for i,(x,y,w,h,_) in enumerate(stats):
        choices=[]
        for j in index.get((int(x+w/2)//64,int(y+h/2)//64),[]):
            bx,by,bw,bh=boxes[j]
            if bx<=x and by<=y and bx+bw>=x+w and by+bh>=y+h:
                choices.append((bw*bh,j))
        if choices:
            owner=min(choices)[1]; owners[i]=owner; members[owner].append(i)
    destinations={}
    for i in parents:
        root=i
        while root in parents:
            root=parents[root]
        if root in owners:
            destinations[i]=owners[root]
    removed={j for j,items in enumerate(members) if items and
             all(i in destinations and destinations[i]!=j for i in items)}
    bounds=[[x,y,x+w,y+h] for x,y,w,h in boxes]
    for i,j in destinations.items():
        owner=owners.get(i)
        if owner is not None and owner!=j and owner not in removed:
            continue
        x,y,w,h,_=stats[i]
        b=bounds[j]; b[0]=min(b[0],int(x)); b[1]=min(b[1],int(y))
        b[2]=max(b[2],int(x+w)); b[3]=max(b[3],int(y+h))
    return [(left,top,right-left,bottom-top) for i,(left,top,right,bottom) in enumerate(bounds) if i not in removed]


def _deduplicate_lines(boxes):
    """A dilation contour's rectangle can also contain ink from an inner
    contour. Keep one crop for contained ink on the same baseline, not two.
    """
    boxes=list(dict.fromkeys(boxes))
    index={}
    for i,(x,y,w,h) in enumerate(boxes):
        for gy in range(y//64,(y+h)//64+1):
            for gx in range(x//64,(x+w)//64+1):
                index.setdefault((gx,gy),[]).append(i)
    result=[]
    for i,(x,y,w,h) in enumerate(boxes):
        contained=False
        for j in index.get(((x+w//2)//64,(y+h//2)//64),[]):
            if j==i:
                continue
            bx,by,bw,bh=boxes[j]
            same_baseline=abs(y+h/2-(by+bh/2))<=min(h,bh)*0.35
            shared_stem=abs(y-by)<=1 and h>=bh*0.35
            if (bx<=x and by<=y and bx+bw>=x+w and by+bh>=y+h
                    and (same_baseline or shared_stem)):
                contained=True; break
        if not contained:
            result.append((x,y,w,h))
    return result


def _projection_rows(local, stats):
    """One blank row separates two full glyph bands, even at small font sizes.
    Detached accents are not full glyph bands and attach to the closest body.
    """
    runs = _bands(local)
    marks=_diacritic_parents(local,stats)
    anchors = []
    for index, (top, bottom) in enumerate(runs):
        height = bottom-top
        columns = np.flatnonzero(np.any(local[top:bottom] != 0, axis=0))
        if height < 4 or not len(columns):
            continue
        density = len(columns)/max(1,int(columns[-1]-columns[0]+1))
        full = sum(i not in marks and h >= max(4,height*0.6) and y >= top and y+h <= bottom and area >= 3
                   for i,(x,y,w,h,area) in enumerate(stats))
        counter=False
        if full and height<9:
            contours,hierarchy=cv2.findContours(local[top:bottom],cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
            counter=hierarchy is not None and any(hierarchy[0,k,3]>=0 and cv2.contourArea(c)>=2
                                                 for k,c in enumerate(contours))
        if full and (height >= 9 or full >= 2 and density >= 0.55 or counter):
            anchors.append(index)
    if len(anchors) < 2:
        return None
    bounds = {index:list(runs[index]) for index in anchors}
    for index, (top,bottom) in enumerate(runs):
        if index in bounds:
            continue
        nearest = min(anchors, key=lambda anchor:(max(0,runs[anchor][0]-bottom,top-runs[anchor][1]),
                                                 abs((top+bottom)-(runs[anchor][0]+runs[anchor][1]))))
        bounds[nearest][0] = min(bounds[nearest][0],top)
        bounds[nearest][1] = max(bounds[nearest][1],bottom)
    return [(0,top,local.shape[1],bottom-top) for top,bottom in bounds.values()]


def _component_rows(local, stats):
    """Recover offset columns / sparse bridges using glyph body centers, rather
    than the connected component formed by horizontal dilation."""
    heights = [h for x,y,w,h,area in stats if h >= 4 and area >= 4 and w <= h*4]
    if not heights:
        return None
    typical = float(np.percentile(heights,65))
    marks=_diacritic_parents(local,stats)
    bodies = [tuple(int(n) for n in stat) for i,stat in enumerate(stats)
              if max(4,typical*0.5) <= stat[3] <= typical*1.8 and stat[4] >= 4 and stat[2] <= stat[3]*4
              and i not in marks]
    if len(bodies)>4096:
        # Pathological connected noise does not get an unbounded clustering pass.
        # Retain the original measured region for the caller's budget/review flow.
        return None
    rows = []
    for component in sorted(bodies,key=lambda s:(s[1]+s[3]/2,s[0])):
        x,y,w,h,_ = component
        center = y+h/2
        def same_row(row):
            typical_h=float(np.median([s[3] for s in row]))
            row_top=float(np.median([s[1] for s in row]))
            row_bottom=float(np.median([s[1]+s[3] for s in row]))
            centered=abs(center-np.median([s[1]+s[3]/2 for s in row]))<=max(2,min(h,typical_h)*0.35)
            overlap=max(0,min(y+h,row_bottom)-max(y,row_top))/max(1,min(h,typical_h))
            # Descenders and accented capitals have different centers on the
            # same baseline. Strong overlap + close lower edge keeps them whole.
            baseline=overlap>=0.65 and abs(y+h-row_bottom)<=max(2,min(h,typical_h)*0.35)
            return centered or baseline
        match=next((row for row in rows if same_row(row)),None)
        if match is None:
            rows.append([component])
        else:
            match.append(component)
    if len(rows)<2:
        return None
    # A single partial glyph is weak evidence for a new row. Keep it with the
    # original band unless its size supports a separate full-height character.
    if any(len(row)==1 and row[0][3]<typical*0.75 for row in rows):
        return None
    bounds = [[min(s[0] for s in row),min(s[1] for s in row),
               max(s[0]+s[2] for s in row),max(s[1]+s[3] for s in row)] for row in rows]
    owned = set(bodies)
    for component in stats:
        x,y,w,h,area = (int(n) for n in component)
        if (x,y,w,h,area) in owned or h>typical*1.2 or w>typical*2:
            continue
        candidates = [(max(0,top-y-h,y-bottom),i) for i,(left,top,right,bottom) in enumerate(bounds)
                      if x+w>=left-typical*0.4 and x<=right+typical*0.4]
        if candidates:
            distance,index=min(candidates)
            if distance<=max(3,typical*0.45):
                b=bounds[index]; b[0]=min(b[0],x); b[1]=min(b[1],y); b[2]=max(b[2],x+w); b[3]=max(b[3],y+h)
    return [(left,top,right-left,bottom-top) for left,top,right,bottom in bounds]


def refine_lines(mask, boxes, ownership_mask=None):
    result = []
    for x,y,w,h in boxes:
        local=mask[y:y+h,x:x+w]
        _,_,stats,_=cv2.connectedComponentsWithStats(local,8)
        components=stats[1:]
        rows=_projection_rows(local,components) or _component_rows(local,components)
        if rows is None:
            result.append((x,y,w,h)); continue
        for rx,ry,rw,rh in rows:
            tight=_tight(mask,x+rx,y+ry,rw,rh)
            if tight:
                result.append(tight)
    return _deduplicate_lines(_attach_detached_marks(mask if ownership_mask is None else ownership_mask,result))


def isolated_crop(box, boxes, width, height, padding_x=3, padding_y=4):
    """Keep padding in whitespace, outside neighboring glyph boxes. All bounds
    stay half-open. Independent columns do not restrict each other's padding."""
    x,y,w,h=box
    left,top,right,bottom=max(0,x-padding_x),max(0,y-padding_y),min(width,x+w+padding_x),min(height,y+h+padding_y)
    boxes=np.asarray(boxes,dtype=np.int32).reshape(-1,4)
    if len(boxes):
        nx,ny,nw,nh=boxes.T
        boxes=boxes[(nx<right)&(nx+nw>left)&(ny<bottom)&(ny+nh>top)]
    for nx,ny,nw,nh in boxes:
        nx,ny,nw,nh=(int(n) for n in (nx,ny,nw,nh))
        if (nx,ny,nw,nh)==box:
            continue
        if nx<right and nx+nw>left:
            if ny+nh<=y:
                top=max(top,(ny+nh+y)//2)
            elif ny>=y+h:
                bottom=min(bottom,(y+h+ny+1)//2)
        if ny<bottom and ny+nh>top:
            if nx+nw<=x:
                left=max(left,(nx+nw+x)//2)
            elif nx>=x+w:
                right=min(right,(x+w+nx+1)//2)
    return left,top,right,bottom


def small_text_evidence(mask, gray, box):
    """Permit small printed text with contrast and glyph support, keeping pale
    JPEG specks / solid blobs as unknown. This is a review heuristic, not OCR."""
    x,y,w,h=box
    if h<5 or w<3 or gray is None:
        return False
    local=mask[y:y+h,x:x+w]
    pixels=gray[y:y+h,x:x+w]
    if float(np.percentile(pixels,95)-np.percentile(pixels,5))<45:
        return False
    density=float(np.mean(local!=0))
    if not 0.08<=density<=0.75:
        return False
    _,_,stats,_=cv2.connectedComponentsWithStats(local,8)
    bodies=[s for s in stats[1:] if s[3]>=max(3,h*0.5) and s[4]>=3 and s[2]<=s[3]*2]
    interior=local[1:-1,1:-1]
    shaped=bool(interior.size and np.any(interior==0))
    return len(bodies)>=2 or len(bodies)==1 and 0.35<=w/h<=1.5 and (density<0.7 or shaped)
