// Distances use tabletop millimetres (one world unit per mm).
// The supplied fan has ten 18-degree intervals across its semicircle.
const RULES = { pointDegrees: 18, turnCost: 15, forwardHalfArc: 54, broadsideHalfArc: 27,
    yardsToWorld: yards => yards * 2.5, worldToYards: mm => mm / 2.5,
    die: () => Math.floor(Math.random() * 6) + 1,
    normal: angle => ((angle % 360) + 360) % 360,
    signed: angle => ((angle + 180) % 360 + 360) % 360 - 180,
    merchant: ship => ['Transport', 'Tanker', 'F-Lighter'].includes(ship.type.name),
    capital: ship => ['Transport', 'Tanker'].includes(ship.type.name),
    faction: ship => ship.faction || ship.type.faction,
};
const Geometry = {
    local(ship, x, y) {
        const rad = ship.heading * Math.PI / 180;
        return { x: ship.x + x * Math.cos(rad) - y * Math.sin(rad),
            y: ship.y + x * Math.sin(rad) + y * Math.cos(rad) };
    },
    inverse(ship, point) {
        const rad = ship.heading * Math.PI / 180, dx = point.x - ship.x, dy = point.y - ship.y;
        return { x: dx * Math.cos(rad) + dy * Math.sin(rad), y: -dx * Math.sin(rad) + dy * Math.cos(rad) };
    },
    corners(ship) {
        const w = ship.type.size.width / 2, l = ship.type.size.length / 2;
        return [[-w,-l],[w,-l],[w,l],[-w,l]].map(([x,y]) => this.local(ship,x,y));
    },
    nearest(ship, point) {
        const p = this.inverse(ship, point), w = ship.type.size.width / 2, l = ship.type.size.length / 2;
        return this.local(ship, Math.max(-w, Math.min(w,p.x)), Math.max(-l,Math.min(l,p.y)));
    },
    edge(ship, arc) {
        const w = ship.type.size.width / 2, l = ship.type.size.length / 2;
        return this.local(ship, arc === 'PORT' ? -w : arc === 'STARBOARD' ? w : 0,
            arc === 'FORWARD' ? -l : arc === 'ASTERN' ? l : 0);
    },
    range(origin, target) {
        const end = this.nearest(target, origin);
        return { origin, end, world: Math.hypot(end.x-origin.x,end.y-origin.y), yards: RULES.worldToYards(Math.hypot(end.x-origin.x,end.y-origin.y)) };
    },
    area(poly) {
        return Math.abs(poly.reduce((sum,p,i) => { const q = poly[(i+1)%poly.length]; return sum+p.x*q.y-q.x*p.y; },0))/2;
    },
    clip(poly, value) {
        const result=[];
        for(let i=0;i<poly.length;i++) {
            const a=poly[i],b=poly[(i+1)%poly.length],va=value(a),vb=value(b);
            if(va>=-1e-8) result.push(a);
            if((va<0)!==(vb<0)) { const t=va/(va-vb); result.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}); }
        }
        return result;
    },
    arcCoverage(attacker,target,arc) {
        const origin=this.edge(attacker,arc);
        const angle=attacker.heading+({FORWARD:0,STARBOARD:90,ASTERN:180,PORT:270}[arc]);
        const half=arc==='FORWARD'||arc==='ASTERN'?RULES.forwardHalfArc:RULES.broadsideHalfArc;
        const rad=angle*Math.PI/180, tan=Math.tan(half*Math.PI/180);
        const poly=this.corners(target).map(p=>({x:(p.x-origin.x)*Math.cos(rad)+(p.y-origin.y)*Math.sin(rad),
            y:-(p.x-origin.x)*Math.sin(rad)+(p.y-origin.y)*Math.cos(rad)}));
        let clipped=this.clip(poly,p=>-p.y*tan-p.x);
        clipped=this.clip(clipped,p=>-p.y*tan+p.x);
        return this.area(clipped)/this.area(poly);
    },
    firingSolutions(attacker,target) {
        return ['FORWARD','STARBOARD','ASTERN','PORT'].map(arc=>{
            const range=this.range(this.edge(attacker,arc),target), coverage=this.arcCoverage(attacker,target,arc);
            return {arc, ...range, coverage};
        }).filter(s=>s.coverage+1e-7>=(s.yards<=25?0.5:1));
    },
    overlaps(a,b) {
        const pa=this.corners(a),pb=this.corners(b);
        for(const ship of [a,b]) {
            const rad=ship.heading*Math.PI/180;
            for(const axis of [{x:Math.cos(rad),y:Math.sin(rad)},{x:-Math.sin(rad),y:Math.cos(rad)}]) {
                const project=poly=>poly.map(p=>p.x*axis.x+p.y*axis.y);
                const aa=project(pa),bb=project(pb);
                if(Math.max(...aa)<Math.min(...bb)-1e-7||Math.max(...bb)<Math.min(...aa)-1e-7) return false;
            }
        }
        return true;
    },
    segmentEntry(origin,end,ship) {
        const a=this.inverse(ship,origin),b=this.inverse(ship,end);
        let lo=0,hi=1;
        for(const [axis,half] of [['x',ship.type.size.width/2],['y',ship.type.size.length/2]]) {
            const delta=b[axis]-a[axis];
            if(Math.abs(delta)<1e-9) { if(Math.abs(a[axis])>half) return null; continue; }
            const t1=(-half-a[axis])/delta,t2=(half-a[axis])/delta;
            lo=Math.max(lo,Math.min(t1,t2)); hi=Math.min(hi,Math.max(t1,t2));
            if(lo>hi+1e-9) return null;
        }
        return hi>=0&&lo<1-1e-8?Math.max(0,lo):null;
    },
    nearestOnPath(path,point) {
        let result=path[0],distance=Infinity;
        for(let i=1;i<path.length;i++) {
            const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y;
            let p;
            if(b.arc) {
                const {center,start,sweep}=b.arc;
                const angle=Math.atan2(point.y-center.y,point.x-center.x);
                const delta=RULES.normal((angle-start)*180/Math.PI)*Math.PI/180;
                const progress=sweep>0?delta:(delta===0?0:2*Math.PI-delta);
                const radius=Math.hypot(a.x-center.x,a.y-center.y);
                if(progress<=Math.abs(sweep)+1e-9) p={x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)};
                else p=Math.hypot(point.x-a.x,point.y-a.y)<Math.hypot(point.x-b.x,point.y-b.y)?a:b;
            } else {
                const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
                p={x:a.x+t*dx,y:a.y+t*dy};
            }
            const d=Math.hypot(point.x-p.x,point.y-p.y);
            if(d<distance) {result=p;distance=d;}
        }
        return result;
    },
};
