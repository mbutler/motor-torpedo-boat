class Ship {
    constructor(id, type, x, y, heading) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.heading = heading; // Degrees, 0 is North (Up)
        
        // Stats
        this.currentBuoyancy = type.buoyancy;
        this.startingBuoyancy = type.buoyancy;
        this.currentSpeed = 0; // Current speed setting
        this.orderedSpeed = 0;
        this.orderedTurn = 0; // Points (positive = starboard, negative = port)
        this.baseY = 0;
        this.faction = type.faction;
        this.turnAtEnd = false;
        this.orderedRam = false;
        this.projectorsLeft = /^(MTB|MGB|E-Boat|R-Boat)$/.test(type.name) ? 2 : 0;
        
        this.isDestroyed = false;
        this.exited = false;
        this.hasMoved = false;
        this.hasFired = false;
        
        // Status Effects
        this.isOnFire = false;
        this.fireTimer = 0; // 3 turns to put out
        this.speedReducedDice = 0; // If damage causes speed loss (applied next move)
        this.compulsoryAction = null; // e.g. "TURN_AWAY"

        // Dynamic weapon factors (degrade with damage)
        this.currentWeapons = { ...type.weapons };

        // Equipment status
        this.torpedoSystems = { fireControl: true, port: true, starboard: true };
        this.depthChargeSystems = { port: true, starboard: true };
        this.depthChargesLeft = type.depthCharges || 0;
        this.torpedoesLeft = type.torpedoes || 0;
        this.lastGunAttack = null;
        this.loadedTubes = { port: type.torpedoes > 0, starboard: type.torpedoes > 1 };

        this.deadInWater = false;
        this.lockedWith = null;
        this.lockTimer = 0;
        this.rudderJamTurns = 0;
    }

    draw(ctx, isSelected, isTarget) {
        if (this.isDestroyed || this.exited) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.heading * Math.PI) / 180);

        const w=this.type.size.width,l=this.type.size.length;
        const artwork=typeof MTBVisuals!=='undefined'?MTBVisuals.image(this):null;
        // Paper footprint exactly matches the rules counter, not the hull silhouette.
        ctx.shadowColor='#283d374d';ctx.shadowBlur=3;ctx.shadowOffsetX=2;ctx.shadowOffsetY=3;
        ctx.fillStyle='#f8f1df';ctx.fillRect(-w/2,-l/2,w,l);
        ctx.shadowColor='transparent';
        if(artwork?.complete&&artwork.naturalWidth) ctx.drawImage(artwork,-w/2,-l/2,w,l);
        else {ctx.strokeStyle='#52675e';ctx.strokeRect(-w/2,-l/2,w,l);}
        if(isSelected||isTarget) {
            ctx.strokeStyle=isTarget?'#a43e32':'#304e57';ctx.lineWidth=1.8;
            ctx.setLineDash([5,3]);ctx.strokeRect(-w/2-4,-l/2-4,w+8,l+8);ctx.setLineDash([]);
        }
        if(this.currentSpeed>0) {
            ctx.strokeStyle='#638b8070';ctx.lineWidth=.8;ctx.beginPath();
            for(const side of [-1,1]) {ctx.moveTo(side*w/3,l/2+3);ctx.quadraticCurveTo(side*w/2,l/2+this.currentSpeed,side*w,l/2+this.currentSpeed*2);}
            ctx.stroke();
        }
        if(this.isOnFire) {
            const fire=typeof MTBVisuals!=='undefined'?MTBVisuals.counters.fire:null;
            if(fire?.complete&&fire.naturalWidth) ctx.drawImage(fire,w/2+3,-10,32,18);
            else {ctx.fillStyle='#a43e32';ctx.fillRect(w/2+3,-8,12,16);}
        }
        ctx.restore();
        if(isSelected||isTarget||this.currentBuoyancy<this.type.buoyancy) {
            ctx.fillStyle='#b3ad98';ctx.fillRect(this.x-15,this.y-l/2-12,30,3);
            ctx.fillStyle='#a43e32';ctx.fillRect(this.x-15,this.y-l/2-12,30*this.currentBuoyancy/this.type.buoyancy,3);
        }
        ctx.fillStyle='#344b47';ctx.font='11px Courier New';ctx.textAlign='center';
        ctx.fillText(`${this.type.name} ${this.id}`,this.x,this.y+l/2+15);
    }

    applyOrders() {
        this.movementPath = [{ x: this.x, y: this.y }];
        this.dropPath=[Geometry.edge(this,'ASTERN')];
        this.appliedTurn = 0;
        const jammed=this.rudderJamTurns>0;
        if(jammed) this.rudderJamTurns--;
        if (this.isDestroyed || this.exited || this.deadInWater || this.lockedWith) {
            this.speedReducedDice=0;this.nextSpeedReduction=0;
            this.currentSpeed = 0;
            return;
        }
        const requested = Math.max(0, Math.min(this.type.maxSpeed, this.orderedSpeed));
        let speed = this.hasMoved ? Math.max(this.currentSpeed - 10, Math.min(this.currentSpeed + 20, requested)) : requested;
        let reduction = this.nextSpeedReduction || 0;
        this.nextSpeedReduction=0;
        for (let i=0; i<this.speedReducedDice; i++) reduction += RULES.die();
        this.speedReducedDice = 0;
        speed = Math.max(0, speed - reduction);
        let turn = Math.max(-9, Math.min(9, this.orderedTurn));
        if (jammed) turn = 0;
        if (this.compulsoryAction === 'TURN_AWAY') {
            // TA persists: withdraw to the ship's own baseline at best possible speed.
            speed = Math.min(this.type.maxSpeed, this.hasMoved ? this.currentSpeed + 20 : this.type.maxSpeed);
            speed = Math.max(0,speed-reduction);
            const wanted = this.baseY > 0 ? 180 : 0;
            turn = jammed ? 0 : Math.round(RULES.signed(wanted-this.heading)/RULES.pointDegrees);
            turn = Math.max(-9, Math.min(9, turn));
        }
        turn = Math.sign(turn) * Math.min(Math.abs(turn), Math.floor(speed / 3));
        this.currentSpeed = speed;
        this.appliedTurn = turn;
        this.hasMoved = true;
        const moveStraight = distance => {
            const rad=(this.heading-90)*Math.PI/180;
            this.x += Math.cos(rad)*distance; this.y += Math.sin(rad)*distance;
            this.movementPath.push({x:this.x,y:this.y});
            this.dropPath.push(Geometry.edge(this,'ASTERN'));
        };
        const moveTurn = () => {
            // Rotate around the stationary fan on the turning side. Each point traverses 15 mm.
            const sign=Math.sign(turn), theta=RULES.pointDegrees*Math.PI/180;
            const radius=RULES.turnCost/theta;
            for(let i=0;i<Math.abs(turn);i++) {
                const pivot=Geometry.local(this,sign*radius,0);
                const dx=this.x-pivot.x,dy=this.y-pivot.y;
                const dropStart=Geometry.edge(this,'ASTERN');
                const angle=sign*theta;
                this.x=pivot.x+dx*Math.cos(angle)-dy*Math.sin(angle);
                this.y=pivot.y+dx*Math.sin(angle)+dy*Math.cos(angle);
                this.heading=RULES.normal(this.heading+sign*RULES.pointDegrees);
                this.movementPath.push({x:this.x,y:this.y,arc:{center:pivot,start:Math.atan2(dy,dx),sweep:angle}});
                this.dropPath.push({...Geometry.edge(this,'ASTERN'),arc:{center:pivot,start:Math.atan2(dropStart.y-pivot.y,dropStart.x-pivot.x),sweep:angle}});
            }
        };
        const straight = speed * SCALE.PIXELS_PER_KNOT - Math.abs(turn) * RULES.turnCost;
        if (this.turnAtEnd) { moveStraight(straight); moveTurn(); }
        else { moveTurn(); moveStraight(straight); }
    }

}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ships = [];
        this.selectedShip = null;
        this.selectedTarget = null;
        this.turn = 1;
        this.phase = 'ORDERS';
        this.attackerFaction = 'British';
        this.defenderFaction = 'German';
        this.pendingDamage = [];
        this.pendingEffects = [];
        this.torpedoOrders = [];
        this.depthOrders = [];
        this.illuminationAreas = [];
        this.contacts = new Map();
        this.sightingAttempts = { British: 0, German: 0 };
        this.visibilityPatches = [];
        this.viewFaction = 'British';
        this.logEl = document.getElementById('log');
        this.visibilityMode = 'CLEAR'; // CLEAR | MIST | FOG | NIGHT
        this.moonlightFactor = 3; // updates on odd turns at night
        this.world = { width: 1600, height: 1200 };
        this.baselineY = { British: this.world.height, German: 0 };
        this.canvas.width = this.world.width; this.canvas.height = this.world.height;

        // UI Binding
        this.btnNextPhase = document.getElementById('next-phase-btn');
        this.btnNextPhase.onclick = () => this.nextPhase();
        
        this.panelOrders = document.getElementById('ship-orders');
        this.inpSpeed = document.getElementById('speed-input');
        this.inpTurn = document.getElementById('turn-input');
        
        this.inpSpeed.onchange = (e) => this.updateOrder('speed', e.target.value);
        this.inpTurn.onchange = (e) => this.updateOrder('turn', e.target.value);
        this.inpSpeed.oninput=this.inpSpeed.onchange;
        this.inpTurn.oninput=this.inpTurn.onchange;

        // Combat Buttons
        this.btnFire = document.getElementById('fire-btn');
        this.btnTorpedo = document.getElementById('torpedo-btn');
        this.btnDepth = document.getElementById('depth-btn');
        this.btnIllum = document.getElementById('illum-btn');
        
        this.btnFire.onclick = () => this.fireGuns();
        this.btnTorpedo.onclick = () => this.declareTorpedo();
        this.btnDepth.onclick = () => this.declareDepthCharge();
        document.getElementById('cancel-attacks').onclick=()=>this.cancelAttackOrders();
        this.btnIllum.onclick = () => this.illuminateTarget();

        this.canvas.onclick = (e) => this.handleClick(e);

        document.getElementById('new-game-btn').onclick = () => this.init(document.getElementById('scenario-select').value);
        document.getElementById('turn-timing').onchange = e => {
            if (this.selectedShip && this.phase === 'ORDERS') this.selectedShip.turnAtEnd = e.target.value === 'END';
        };
        document.getElementById('ram-order').onchange = e => {
            if (this.selectedShip && this.phase === 'ORDERS') this.selectedShip.orderedRam = e.target.checked;
        };
        document.getElementById('view-faction').onchange = e => { this.viewFaction = e.target.value; this.updateUI(); };
        document.getElementById('fleet-select').onchange=e=>{
            this.selectedShip=this.ships.find(ship=>ship.id===Number(e.target.value))||null;
            this.selectedTarget=null;this.updateUI();
        };
        document.getElementById('sight-btn').onclick = () => this.attemptSighting();
        document.getElementById('place-british-patch').onclick = () => { if(this.phase==='SETUP') this.placingPatch='British'; };
        document.getElementById('place-german-patch').onclick = () => { if(this.phase==='SETUP') this.placingPatch='German'; };
        document.getElementById('setup-heading').onchange = e => {
            if(this.phase==='SETUP' && this.selectedShip) this.selectedShip.heading=RULES.normal(Number(e.target.value)||0);
        };
        // Visibility select
        const visSel = document.getElementById('visibility-select');
        visSel.onchange = (e) => {
            if(this.phase!=='SETUP') {e.target.value=this.visibilityMode;return;}
            this.visibilityMode = e.target.value;
            this.log(`Visibility set to ${this.visibilityMode}`); this.updateUI();
        };
        this.dcDepthSel = document.getElementById('dc-depth-select');

        this.init();
        this.updateUI();
        this.loop();
    }

    log(msg, privateFaction=null) {
        const p = document.createElement('div');
        p.textContent = `T${this.turn}: ${msg}`;
        p.dataset ||= {};p.dataset.faction=privateFaction||'';
        p.hidden=this.visibilityMode==='NIGHT'&&privateFaction&&privateFaction!==this.viewFaction;
        this.logEl.prepend(p);
    }

    init(scenario = 'GERMAN_CONVOY') {
        this.scenario = ['GERMAN_CONVOY','BRITISH_CONVOY','ENCOUNTER'].includes(scenario) ? scenario : 'GERMAN_CONVOY';
        this.ships = []; this.turn = 1; this.phase = 'SETUP';
        this.pendingDamage = []; this.pendingEffects = []; this.torpedoOrders = []; this.depthOrders=[];
        this.illuminationAreas=[]; this.visibilityPatches=[]; this.contacts=new Map();
        this.sightingAttempts={British:0,German:0}; this.selectedShip=null; this.selectedTarget=null;
        this.victory=null; this.moveSequence=0; this.moveAdjusted=false;
        this.logEl.textContent='';
        this.attackerFaction = this.scenario === 'BRITISH_CONVOY' ? 'German' : 'British';
        if(this.scenario==='ENCOUNTER') {
            const british=RULES.die(),german=RULES.die();
            this.attackerFaction=british>=german?'British':'German';
            this.log(`Encounter attacker roll: British ${british}, German ${german}${british===german?' (tie rerolled below)':''}.`);
            if(british===german) {
                let br,ge; do {br=RULES.die();ge=RULES.die();} while(br===ge);
                this.attackerFaction=br>ge?'British':'German';
                this.log(`Encounter reroll: British ${br}, German ${ge}.`);
            }
        }
        this.defenderFaction=this.attackerFaction==='British'?'German':'British';
        this.baselineY={[this.attackerFaction]:this.world.height,[this.defenderFaction]:0};
        const omitted=Number(document.getElementById('omitted-transport').value)||4;
        let id=1;
        const add=(key,count,faction=SHIP_TYPES[key].faction)=>{
            for(let i=0;i<count;i++) {
                if(key==='TRANSPORT'&&this.scenario==='GERMAN_CONVOY'&&i+1===omitted) continue;
                const ship=new Ship(id++,SHIP_TYPES[key],0,0,faction===this.attackerFaction?0:180);
                ship.faction=faction;
                if(key==='TRANSPORT') {ship.transportNumber=i+1;ship.transportArc=i<2?'astern':'forward';ship.currentWeapons[i<2?'forward':'astern']=0;}
                ship.baseY=this.baselineY[faction]; this.ships.push(ship);
            }
        };
        add('MTB',4); add('MGB',3); add('E_BOAT',5); add('R_BOAT',2);
        if(this.scenario!=='ENCOUNTER') {
            add(this.defenderFaction==='British'?'BRITISH_TRAWLER':'GERMAN_TRAWLER',1);
            add('TRANSPORT',4,this.defenderFaction);
            add('TANKER',1,this.defenderFaction);
            if(this.defenderFaction==='German') add('F_LIGHTER',3,this.defenderFaction);
        }
        for(const faction of ['British','German']) {
            const fleet=this.ships.filter(ship=>RULES.faction(ship)===faction);
            fleet.forEach((ship,i)=>{
                ship.x=this.world.width/2+(i%5-2)*115;
                ship.y=faction===this.attackerFaction?this.world.height-65-Math.floor(i/5)*90:65+Math.floor(i/5)*100;
            });
        }
        this.viewFaction=this.attackerFaction;
        document.getElementById('view-faction').value=this.viewFaction;
        this.log(`${this.scenario}: ${this.attackerFaction} attacks. Select a ship then click to place it; attacker within 250 mm of its baseline.`);
        this.updateUI();
    }

    startBattle() {
        const required = this.visibilityMode==='MIST'||this.visibilityMode==='FOG';
        if(required && !['British','German'].every(faction=>this.visibilityPatches.some(p=>p.faction===faction))) {
            this.log('Place one 18-inch visibility patch for each side before starting.'); return false;
        }
        for(const ship of this.ships) {
            const corners=Geometry.corners(ship);
            if(corners.some(p=>p.x<0||p.x>this.world.width||p.y<0||p.y>this.world.height)) {
                this.log(`#${ship.id} must fit on the table.`);return false;
            }
            if(RULES.faction(ship)===this.attackerFaction && corners.some(p=>this.world.height-p.y>250)) {
                this.log('Attacking counters must start within 10 inches of their baseline.');return false;
            }
            if(RULES.faction(ship)===this.defenderFaction && (ship.y>this.world.height/3||ship.x<this.world.width/4||ship.x>3*this.world.width/4)) {
                this.log('Set the defending fleet in the middle of its end of the table.');return false;
            }
        }
        for(let i=0;i<this.ships.length;i++) for(let j=i+1;j<this.ships.length;j++) {
            if(Geometry.overlaps(this.ships[i],this.ships[j])) {this.log('Separate touching ship counters before starting.');return false;}
        }
        this.phase='ORDERS';
        if(this.visibilityMode==='NIGHT') this.moonlightFactor=RULES.die();
        this.log(`Battle begins. ${this.visibilityMode}${this.visibilityMode==='NIGHT'?`, moonlight ${this.moonlightFactor}`:''}.`);
        return true;
    }

    updateUI() {
        if(typeof MTBVisuals!=='undefined') MTBVisuals.sync(this);
        for(const row of this.logEl.children||[]) row.hidden=this.visibilityMode==='NIGHT'&&row.dataset.faction&&row.dataset.faction!==this.viewFaction;
        if (this.selectedShip?.isDestroyed) this.selectedShip = null;
        if (this.selectedTarget?.isDestroyed) this.selectedTarget = null;
        document.getElementById('turn-number').textContent = this.turn;
        document.getElementById('phase-name').textContent = this.phase.replaceAll('_', ' ') +
            (this.firingFaction ? ` (${this.firingFaction})` : '');
        this.btnNextPhase.disabled = this.phase === 'GAME_OVER';
        const fleetSelect=document.getElementById('fleet-select');
        fleetSelect.replaceChildren();
        const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select your ship';fleetSelect.append(placeholder);
        for(const ship of this.ships.filter(s=>RULES.faction(s)===this.viewFaction&&!s.isDestroyed)) {
            const option=document.createElement('option');option.value=ship.id;
            option.textContent=`${ship.type.name} #${ship.id}${ship.exited?' (withdrawn)':!this.onTable(ship)?' (off table)':''}`;
            fleetSelect.append(option);
        }
        fleetSelect.value=this.selectedShip&&RULES.faction(this.selectedShip)===this.viewFaction?String(this.selectedShip.id):'';
        document.getElementById('visibility-select').disabled=this.phase!=='SETUP';
        document.getElementById('setup-controls').classList.toggle('hidden',this.phase!=='SETUP');
        const help = {
            SETUP: 'Place the fleets. Select visibility and patches if needed, then begin.',
            SIGHTING: 'Select a ship and an enemy contact. Each side has at most two sighting attempts before next move.',
            ORDERS: 'Write movement, torpedo, depth charge, and intentional ram orders for both fleets.',
            TORPEDO_ORDERS: 'Declare torpedoes and illumination before either fleet moves.',
            DEPTH_CHARGES: `${this.phasingFaction} has moved. Resolve depth charges before the other fleet moves.`,
            FIRE_FIRST: `${this.phasingFaction} fires first. Select a friendly ship, then an enemy.`,
            FIRE_SECOND: `${this.nonPhasingFaction} fires next. Advance to resolve torpedoes, ramming, and damage.`,
            GAME_OVER: this.victory ? `${this.victory.winner} wins. Attacker ${this.victory.attackerScore} · Defender ${this.victory.defenderScore}` : 'Battle complete.'
        };
        document.getElementById('phase-help').textContent = help[this.phase] || '';
        this.btnNextPhase.textContent = this.phase==='SETUP'?'Begin battle →':this.phase==='SIGHTING'?'Finish sightings →':this.phase === 'ORDERS' ? 'Confirm orders →' :
            this.phase === 'FIRE_SECOND' ? 'Resolve attacks & end move →' :
            this.phase === 'GAME_OVER' ? 'Battle complete' : 'Next stage →';

        if (this.selectedShip) {
            this.panelOrders.classList.remove('hidden');
            document.getElementById('selected-ship-name').textContent = `${this.selectedShip.type.name} (#${this.selectedShip.id})`;
            
            document.getElementById('ship-status').textContent =
                `Buoyancy ${this.selectedShip.currentBuoyancy}/${this.selectedShip.startingBuoyancy} · Speed ${this.selectedShip.currentSpeed} kn\n` +
                `Torpedoes ${this.selectedShip.torpedoesLeft} · Depth charges ${this.selectedShip.depthChargesLeft}` +
                (this.selectedShip.transportNumber?`\nTransport card ${this.selectedShip.transportNumber}: ${this.selectedShip.transportArc} battery`:'') +
                (this.selectedShip.isOnFire ? '\nON FIRE' : '') +
                (this.selectedShip.lockedWith ? '\nLOCKED AFTER RAM' : '') +
                (this.selectedTarget ? `\nTarget: ${this.identifiedFor(this.viewFaction,this.selectedTarget)?this.selectedTarget.type.name:'Contact'} #${this.selectedTarget.id}` : '');
            // Update Speed Input Max based on Ship Type
            this.inpSpeed.max = this.selectedShip.type.maxSpeed;
            this.inpSpeed.value = this.selectedShip.orderedSpeed;
            
            this.inpTurn.value = this.selectedShip.orderedTurn;

            const ship=this.selectedShip,target=this.selectedTarget;
            const canFire=this.firingFaction && RULES.faction(ship)===this.firingFaction &&
                !ship.hasFired&&!ship.isOnFire&&!ship.lockedWith&&!ship.exited;
            this.btnFire.disabled=!target||!canFire;
            this.btnTorpedo.disabled=!['ORDERS','TORPEDO_ORDERS'].includes(this.phase)||!this.canDeclareTorpedo(ship,target);
            this.btnDepth.disabled=this.phase!=='ORDERS'||!target||ship.depthChargesLeft<1||ship.isOnFire||ship.lockedWith||
                this.depthOrders.some(o=>o.ship===ship);
            this.btnIllum.disabled=!this.canIlluminate(ship,target);
            document.getElementById('cancel-attacks').disabled=!['ORDERS','TORPEDO_ORDERS'].includes(this.phase)||
                ![...this.torpedoOrders,...this.depthOrders].some(o=>o.ship===ship);
            document.getElementById('sight-btn').disabled=this.phase!=='SIGHTING'||!target||
                this.sightingAttempts[RULES.faction(ship)]>=2;
            this.inpSpeed.disabled=this.phase!=='ORDERS'; this.inpTurn.disabled=this.phase!=='ORDERS';
            document.getElementById('turn-timing').disabled=this.phase!=='ORDERS';
            document.getElementById('turn-timing').value=ship.turnAtEnd?'END':'START';
            document.getElementById('ram-order').disabled=this.phase!=='ORDERS';
            document.getElementById('ram-order').checked=ship.orderedRam;
            document.getElementById('setup-heading').value=ship.heading;
            if(!this.identifiedFor(this.viewFaction,ship)) {
                this.inpSpeed.value='';this.inpTurn.value='';
                this.inpSpeed.disabled=true;this.inpTurn.disabled=true;
                document.getElementById('selected-ship-name').textContent=`Unidentified contact #${ship.id}`;
                document.getElementById('ship-status').textContent='';
            }

        } else {
            this.panelOrders.classList.add('hidden');
        }
    }

    updateOrder(type, value) {
        if (!this.selectedShip) return;
        if (this.phase !== 'ORDERS') {
            this.log("Cannot change orders outside Orders phase.");
            return;
        }

        if (type === 'speed') {
            const speed = Number(value);
            if (!Number.isFinite(speed)) return;
            this.selectedShip.orderedSpeed = Math.max(0, Math.min(this.selectedShip.type.maxSpeed, Math.trunc(speed)));
        } else if (type === 'turn') {
            const turn = Number(value);
            if (!Number.isFinite(turn)) return;
            this.selectedShip.orderedTurn = Math.max(-9, Math.min(9, Math.trunc(turn)));
        }
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.canvas.clientLeft) * this.canvas.width / this.canvas.clientWidth;
        const y = (e.clientY - rect.top - this.canvas.clientTop) * this.canvas.height / this.canvas.clientHeight;

        if(this.phase==='SETUP'&&this.placingPatch) {
            const faction=this.placingPatch;
            this.visibilityPatches=this.visibilityPatches.filter(p=>p.faction!==faction);
            this.visibilityPatches.push({faction,x:Math.max(225,Math.min(this.world.width-225,x)),y:Math.max(225,Math.min(this.world.height-225,y))});
            this.placingPatch=null;this.log(`${faction} placed an 18-inch patch.`);return;
        }
        // Hit Detection scaled to ship size
        let clickedShip = null;
        // Search in reverse order to click "top" ships first if overlapping
        for (let i = this.ships.length - 1; i >= 0; i--) {
            const ship = this.ships[i];
            if (ship.isDestroyed || ship.exited) continue; // Ignore destroyed ships

            const radius = Math.max(ship.type.size.width, ship.type.size.length) / 2 + 20; // Increased click buffer
            const dx = ship.x - x;
            const dy = ship.y - y;
            const point=Geometry.inverse(ship,{x,y});
            const size=this.identifiedFor(this.viewFaction,ship)?ship.type.size:{width:25,length:50};
            if (Math.abs(point.x)<=size.width/2+5 && Math.abs(point.y)<=size.length/2+5) {
                clickedShip = ship;
                break;
            }
        }

        if (clickedShip) {
            if (this.firingFaction || ['ORDERS','TORPEDO_ORDERS','SIGHTING'].includes(this.phase)) {
                // Combat Phase Selection Logic:
                // 1. If no ship selected, select clicked ship as Attacker.
                // 2. If clicked ship is same faction as current Attacker, switch Attacker to clicked ship.
                // 3. If clicked ship is different faction, set as Target.
                
                if (!this.selectedShip || RULES.faction(clickedShip) === RULES.faction(this.selectedShip)) {
                    this.selectedShip = clickedShip;
                    this.selectedTarget = null; // Reset target when switching attacker
                } else {
                    this.selectedTarget = clickedShip;
                    this.log(`Targeting contact #${clickedShip.id}`);
                }
            } else {
                // ORDERS/EXECUTE: Allow selecting any ship to view orders/status
                this.selectedShip = clickedShip;
                this.selectedTarget = null;
            }
        } else {
            if(this.phase==='SETUP'&&this.selectedShip) {
                this.selectedShip.x=x;this.selectedShip.y=y;this.updateUI();return;
            }
            // Background Click Logic:
            // 1. If Target exists, clear Target.
            // 2. If no Target, clear Selected Ship (Attacker).
            if (this.selectedTarget) {
                this.selectedTarget = null;
            } else {
                this.selectedShip = null;
            }
        }
        this.updateUI();
    }

    // Helper method removed (getFriendlyFaction)


    findNearestEnemy(me=this.selectedShip) {
        if (!me) return null;
        let best = null;
        let bestDist = Infinity;
        for (const s of this.ships) {
            if (s.isDestroyed) continue;
            if (RULES.faction(s) === RULES.faction(me)) continue;
            const dx = s.x - me.x;
            const dy = s.y - me.y;
            const d2 = dx*dx + dy*dy;
            if (d2 < bestDist) {
                bestDist = d2;
                best = s;
            }
        }
        return best;
    }

    get phasingFaction() {
        return this.turn % 2 === 1 ? this.attackerFaction : this.defenderFaction;
    }

    get firingFaction() {
        return this.phase === 'FIRE_FIRST' ? this.phasingFaction :
            this.phase === 'FIRE_SECOND' ? this.nonPhasingFaction : null;
    }

    get nonPhasingFaction() {
        return this.phasingFaction === this.attackerFaction ? this.defenderFaction : this.attackerFaction;
    }

    nextPhase() {
        switch (this.phase) {
            case 'SETUP':
                this.startBattle(); break;
            case 'SIGHTING':
                this.endTurn(); break;
            case 'ORDERS':
                this.phase = 'TORPEDO_ORDERS';
                this.log('Stage 1: declare torpedoes and illumination before movement.');
                break;
            case 'TORPEDO_ORDERS':
                this.executeMovement(this.phasingFaction);
                if(this.depthOrders.some(o=>RULES.faction(o.ship)===this.nonPhasingFaction)) this.executeMovement(this.nonPhasingFaction, true);
                this.phase = 'DEPTH_CHARGES';
                this.log('Stage 3: resolve depth charge attacks, then advance.');
                break;
            case 'DEPTH_CHARGES':
                this.depthChargeAttack();
                this.executeMovement(this.nonPhasingFaction);
                this.phase = 'FIRE_FIRST';
                this.log(`Stage 5: ${this.phasingFaction} gunfire.`);
                break;
            case 'FIRE_FIRST':
                this.phase = 'FIRE_SECOND';
                this.log(`Stage 6: ${this.nonPhasingFaction} gunfire.`);
                break;
            case 'FIRE_SECOND':
                this.phase = 'TORPEDO_RESOLUTION';
                this.resolveTorpedoOrders();
                this.phase = 'RAMMING';
                this.resolveRamming();
                this.phase = 'DAMAGE';
                this.resolvePendingDamage();
                if(this.visibilityMode==='NIGHT') {
                    this.finishMove(); this.phase='SIGHTING';
                    this.log('End-of-move sighting: at most two attempts per side.');
                } else this.endTurn();
                break;
        }
        this.updateUI();
    }

    executeMovement(faction, depthOnly=false) {
        this.log(`Movement: ${faction}`);
        this.ships.filter(ship => !ship.isDestroyed && !ship.exited && RULES.faction(ship) === faction &&
            ship.movedOnTurn!==this.turn && (!depthOnly||this.depthOrders.some(o=>o.ship===ship))).forEach(ship => {
            const dir = ship.orderedTurn > 0 ? 'ST' : 'PT';
            this.log(`Ship #${ship.id}: ${Math.abs(ship.orderedTurn)}P ${dir} ${ship.orderedSpeed}K`,RULES.faction(ship));
            ship.moveSequence = (this.moveSequence = (this.moveSequence || 0) + 1);
            ship.applyOrders(); ship.movedOnTurn=this.turn;
            const ownBaseline=ship.baseY===0?ship.y+ship.type.size.length/2<0:ship.y-ship.type.size.length/2>this.world.height;
            if(ownBaseline && ship.compulsoryAction==='TURN_AWAY') ship.exited=true;
            for(const order of this.depthOrders.filter(o=>o.ship===ship)) {
                const stern=Geometry.edge(order.target,'ASTERN');
                order.marker=Geometry.nearestOnPath(ship.dropPath,stern);
                order.distance=Math.hypot(order.marker.x-stern.x,order.marker.y-stern.y);
            }
        });
    }

    resolvePendingDamage() {
        const totals = new Map();
        for (const hit of this.pendingDamage) totals.set(hit.target, (totals.get(hit.target) || 0) + hit.damage);
        this.pendingDamage = [];
        for (const effect of this.pendingEffects) effect();
        this.pendingEffects = [];
        for (const [target, damage] of totals) this.applyDamageResults(target, damage, 0);
        for (const ship of this.ships) {
            if (ship.pendingExplosion) {
                ship.pendingExplosion = false;
                this.handleExplosion(ship);
            }
        }
    }

    fireGuns() {
        const attacker = this.selectedShip;
        const target = this.selectedTarget;
        const report=msg=>this.log(msg,attacker?RULES.faction(attacker):null);
        
        if (!attacker || !target || attacker.isDestroyed || target.isDestroyed ||
            RULES.faction(attacker) !== this.firingFaction || RULES.faction(attacker) === RULES.faction(target)) return;

        if (attacker.hasFired) {
            report("This ship has already fired this turn!");
            return;
        }

        if (attacker.lockedWith) {
            report("Locked in ram — cannot fire.");
            return;
        }

        if (attacker.isOnFire || attacker.exited || target.exited) return;
        const solutions=Geometry.firingSolutions(attacker,target);
        const solution=solutions.find(sol=>{
            const key=sol.arc==='PORT'||sol.arc==='STARBOARD'?'broadside':sol.arc.toLowerCase();
            return attacker.currentWeapons[key]>0 && !(attacker.illuminatedOnTurn===this.turn&&key==='broadside') &&
                (sol.yards<=500||key!=='astern'&&attacker.type.starLongRange);
        });
        if(!solution) {report('Target counter is outside eligible firing arcs.');return;}
        const {arc,origin,end}=solution;
        const arcName=arc==='PORT'||arc==='STARBOARD'?'BROADSIDE':arc;
        let weaponFactor=attacker.currentWeapons[arcName.toLowerCase()];
        const distYards=solution.yards;
        if(!this.canEngage(attacker,target)) {report('Target not visible or not yet eligible after sighting.');return;}
        const visMod=this.getVisibilityFireMod(distYards,attacker,target);
        report(`${attacker.type.name} fires ${arc} at #${target.id}. Range ${distYards.toFixed(1)} yards.`);

        // --- FULL COMBAT CALCULATION ---

        // Over 500 yards long range rule
        if (distYards > 500 && (arcName === "FORWARD" || arcName === "BROADSIDE")) {
            if (attacker.type.starLongRange) {
                weaponFactor = Math.floor(weaponFactor / 2);
            } else {
                weaponFactor = 0; // cannot engage
            }
        }

        if (weaponFactor <= 0 || (distYards > 500 && arcName === 'ASTERN')) {
            report('No eligible weapons can engage this target.');
            return;
        }

        const blockers=this.findInterveningShips(origin,end,attacker,target);
        if(blockers.some(({ship})=>ship.isOnFire||!RULES.capital(attacker)||RULES.capital(ship)||
            Geometry.range(Geometry.nearest(ship,target),target).yards<=100)) {
            report('Intervening counter blocks gunfire.'); return;
        }

        // 2. Target Speed Factor
        let speedFactor = 0;
        const tSpeed = target.currentSpeed;
        
        if (tSpeed <= 0) {
            if (weaponFactor <= 25) speedFactor = 3;
            else if (weaponFactor <= 50) speedFactor = 5;
            else if (weaponFactor <= 75) speedFactor = 8;
            else speedFactor = 10; // 76-100
        } else if (tSpeed <= 10) {
            if (weaponFactor <= 25) speedFactor = 2;
            else if (weaponFactor <= 50) speedFactor = 3;
            else if (weaponFactor <= 75) speedFactor = 5;
            else speedFactor = 8;
        } else if (tSpeed <= 20) {
            if (weaponFactor <= 25) speedFactor = 1;
            else if (weaponFactor <= 50) speedFactor = 2;
            else if (weaponFactor <= 75) speedFactor = 3;
            else speedFactor = 5;
        } else if (tSpeed <= 30) {
            if (weaponFactor <= 50) speedFactor = 0;
            else if (weaponFactor <= 75) speedFactor = 1;
            else speedFactor = 3;
        } else {
             if (weaponFactor > 75) speedFactor = 1;
        }

        // 3. Target Size Factor
        let sizeFactor = 0;
        const targetType = target.type.name;
        const isSmallGun = weaponFactor <= 50;

        if (targetType.includes("MTB")) sizeFactor = isSmallGun ? -3 : -2;
        else if (targetType.includes("E-Boat")) sizeFactor = -2; 
        else if (targetType.includes("R-Boat") || targetType.includes("MGB")) sizeFactor = isSmallGun ? -1 : 1;
        else if (targetType.includes("Trawler")) sizeFactor = isSmallGun ? 0 : 3;
        else if (targetType.includes("Lighter")) sizeFactor = isSmallGun ? 1 : 2;
        else if (targetType.includes("Transport")) sizeFactor = isSmallGun ? 2 : 4;
        else if (targetType.includes("Tanker")) sizeFactor = isSmallGun ? 3 : 5;

        // 4. Range Factor
        let rangeFactor = 0;
        if (distYards <= 25) rangeFactor = 5;
        else if (distYards <= 50) rangeFactor = 4;
        else if (distYards <= 100) rangeFactor = 3;
        else if (distYards <= 200) rangeFactor = 1;
        else if (distYards <= 300) rangeFactor = 0;
        else if (distYards <= 400) rangeFactor = -1;
        else if (distYards <= 500) rangeFactor = -2;
        else rangeFactor = -4;

        // 4b. Visibility factor
        rangeFactor += visMod;

        // 5. Random Effect (Dice 1-6)
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        let randomFactor = 0;
        
        let colIdx = 0;
        if (weaponFactor > 25) colIdx = 1;
        if (weaponFactor > 50) colIdx = 2;
        if (weaponFactor > 75) colIdx = 3;

        const randomTable = [
            [-4, -3, -2, -1], // Dice 1
            [-2, -1,  0,  1], // Dice 2
            [ 0,  0,  3,  4], // Dice 3
            [ 2,  3,  5,  7], // Dice 4
            [ 3,  7,  7,  8], // Dice 5
            [ 5,  6,  8, 10]  // Dice 6
        ];
        randomFactor = randomTable[diceRoll-1][colIdx];

        // Total Damage
        const previous = attacker.lastGunAttack;
        const repeatFactor = previous && previous.turn === this.turn - 1 &&
            previous.targetId === target.id && previous.factorKind === arcName && previous.weaponFactor === weaponFactor ? 3 : 0;
        let totalDamage = speedFactor + sizeFactor + rangeFactor + randomFactor + repeatFactor;
        attacker.lastGunAttack = { turn: this.turn, targetId: target.id, arc, factorKind:arcName, weaponFactor,
            wasIlluminated:this.isIlluminated(target)||!!(previous&&previous.turn===this.turn-1&&previous.targetId===target.id&&previous.wasIlluminated) };
        report(`Damage factors: speed ${speedFactor}, size ${sizeFactor}, range/visibility ${rangeFactor}, dice ${randomFactor}, repeat ${repeatFactor}.`);
        
        if (totalDamage > 0) {
            this.applyDamageResults(target, totalDamage, diceRoll);
        } else {
            report(`Miss! (Damage <= 0). Dice: ${diceRoll}`);
        }

        attacker.hasFired = true;
        attacker.firedOnTurn=this.turn;
        attacker.engagedTargetId=target.id;
        this.recordEngagement(attacker,target);
        this.selectedTarget = null;
        this.updateUI();
    }

    applyDamageResults(target, damage, diceRoll) {
        const report=msg=>this.log(msg,RULES.faction(target));
        if (!Number.isFinite(damage) || damage <= 0 || target.isDestroyed) return;
        if (['DEPTH_CHARGES', 'FIRE_FIRST', 'FIRE_SECOND', 'TORPEDO_RESOLUTION', 'RAMMING'].includes(this.phase)) {
            this.pendingDamage.push({ target, damage });
            report(`${damage} damage pending for ${target.type.name} (#${target.id}); adjust at stage 9.`);
            return;
        }
        target.currentBuoyancy -= damage;
        target.currentBuoyancy=Math.max(0,target.currentBuoyancy);
        report(`Hit! Damage: ${damage}. Target Buoyancy: ${target.currentBuoyancy}`);

        if (target.currentBuoyancy <= 0) {
            target.isDestroyed = true;
            target.isOnFire=false;
            report(`${target.type.name} SINKING!`);
            return;
        }

        const band = this.lookupDamageBand(target);
        if (!band) return;

        // Update weapon factors to band values (degrade)
        target.currentWeapons = { ...band.weapons };
        if(target.transportArc) target.currentWeapons[target.transportArc==='forward'?'astern':'forward']=0;

        // Speed reduction dice applies next move
        target.nextSpeedReduction=0;
        for(let i=0;i<(band.speedDice||0);i++) target.nextSpeedReduction+=RULES.die();

        // Compulsory actions
        if (band.actions) {
            for (const act of band.actions) {
                if (act === "fireRisk") this.checkFireRisk(target);
                if (act === "turnAway") target.compulsoryAction = "TURN_AWAY";
                if (act === "deadInWater") { target.deadInWater = true; target.currentSpeed = 0; }
                if (act === "torpedoDamage") this.rollTorpedoDamage(target);
                if (act === "depthChargeDamage") this.rollDepthDamage(target);
            }
        }
    }

    lookupDamageBand(ship) {
        const bands = ship.type.damageBands;
        if (!bands) return null;
        for (const b of bands) {
            if (ship.currentBuoyancy >= b.min && ship.currentBuoyancy <= b.max) return b;
        }
        return null;
    }

    checkFireRisk(ship) {
        const report=msg=>this.log(msg,RULES.faction(ship));
        if (ship.isOnFire) return;
        const mod = ship.type.fireRiskMod || 0;
        const d1 = Math.floor(Math.random()*6)+1;
        const d2 = Math.floor(Math.random()*6)+1;
        const total = d1 + d2 + mod;
        if (total <= 5) {
            ship.isOnFire = true;
            ship.fireTimer = 0; // counts attempts
            ship.fireStartedTurn = this.turn;
            report(`${ship.type.name} catches FIRE!`);
        }
    }

    rollTorpedoDamage(ship) {
        const report=msg=>this.log(msg,RULES.faction(ship));
        const die = Math.floor(Math.random()*6)+1;
        if (die <= 2) {
            ship.torpedoSystems.fireControl = false;
            report("Torpedo fire control knocked out.");
        } else if (die === 3) {
            ship.torpedoSystems.starboard = false;
            report("Starboard torpedo tube knocked out.");
        } else if (die === 4) {
            ship.torpedoSystems.port = false;
            report("Port torpedo tube knocked out.");
        } else {
            report("Torpedo gear intact.");
        }
    }

    rollDepthDamage(ship) {
        const report=msg=>this.log(msg,RULES.faction(ship));
        const die = Math.floor(Math.random()*6)+1;
        if (die <= 2) {
            ship.depthChargeSystems.port = false;
            report("Port depth discharger jammed.");
        } else if (die <= 4) {
            ship.depthChargeSystems.starboard = false;
            report("Starboard depth discharger jammed.");
        } else {
            report("Depth charge gear intact.");
        }
    }

    canDeclareTorpedo(ship, target) {
        return !!(ship && target && !ship.isDestroyed && !target.isDestroyed && !ship.exited && !target.exited && this.onTable(ship) && this.onTable(target) &&
            this.torpedoVisibleLastMove(ship,target) &&
            RULES.faction(ship) !== RULES.faction(target) && !ship.isOnFire && !ship.lockedWith &&
            ship.currentBuoyancy >= ship.startingBuoyancy / 4 && ship.torpedoesLeft > 0 &&
            ship.torpedoSystems.fireControl &&
            (ship.torpedoSystems.port && ship.loadedTubes.port || ship.torpedoSystems.starboard && ship.loadedTubes.starboard) &&
            !this.torpedoOrders.some(order => order.ship === ship));
    }

    declareTorpedo() {
        if (!['ORDERS','TORPEDO_ORDERS'].includes(this.phase) || !this.canDeclareTorpedo(this.selectedShip, this.selectedTarget)) return;
        const ship = this.selectedShip;
        const target = this.selectedTarget;
        const availableTubes = ['port', 'starboard'].filter(side => ship.torpedoSystems[side] && ship.loadedTubes[side]);
        const tubes = availableTubes.length;
        const requested = Number(document.getElementById('torpedo-count').value);
        const count = Math.min(requested === 2 ? 2 : 1, tubes, ship.torpedoesLeft);
        const rad = (ship.heading - 90) * Math.PI / 180;
        const marker = {
            x: ship.x - Math.cos(rad) * ship.type.size.length / 2,
            y: ship.y - Math.sin(rad) * ship.type.size.length / 2
        };
        this.torpedoOrders.push({ ship, target, count, marker, tubes:availableTubes.slice(0,count) });
        ship.torpedoesLeft -= count;
        availableTubes.slice(0, count).forEach(side => { ship.loadedTubes[side] = false; });
        this.log(`${ship.type.name} (#${ship.id}) declares ${count} torpedo(es) at #${target.id}.`);
        this.updateUI();
    }

    cancelAttackOrders() {
        const ship=this.selectedShip;
        if(!ship||!['ORDERS','TORPEDO_ORDERS'].includes(this.phase)) return;
        for(const order of this.torpedoOrders.filter(o=>o.ship===ship)) {
            ship.torpedoesLeft+=order.count;
            for(const side of order.tubes) ship.loadedTubes[side]=true;
        }
        this.torpedoOrders=this.torpedoOrders.filter(o=>o.ship!==ship);
        this.depthOrders=this.depthOrders.filter(o=>o.ship!==ship);
        this.log(`#${ship.id} attack orders cancelled before movement.`);this.updateUI();
    }

    resolveTorpedoOrders() {
        this.log('Stage 7: resolve declared torpedoes from launch markers.');
        for (const order of this.torpedoOrders) {
            const { ship, marker, count } = order;
            ship.firedOnTurn=this.turn;
            let target = order.target;
            if(target.isDestroyed||target.exited) {this.log(`Torpedo target #${target.id} no longer on table.`);continue;}
            let automaticHit=false;
            const blockers=this.findInterveningShips(marker,Geometry.nearest(target,marker),ship,target);
            for(const {ship:intervening} of blockers) {
                const name=intervening.type.name;
                if(/Transport|Trawler/.test(name) || name==='Tanker' ||
                    name==='F-Lighter'&&target.type.name==='F-Lighter' ||
                    !/Transport|Tanker|Trawler|Lighter/.test(name)&&intervening.currentSpeed<20&&target.type.name!=='Tanker') {
                    target=intervening; automaticHit=true; break;
                }
            }
            const yards=Geometry.range(marker,target).yards;
            let score = (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1);
            score -= Math.ceil(yards / 100);
            if (Math.abs(target.appliedTurn || 0) > 2) score -= 1;
            if (target.deadInWater) score += 5;
            if (target.currentSpeed > 30) score -= 2;
            else if (target.currentSpeed > 20) score -= 1;
            else if (target.currentSpeed > 10 && target.currentSpeed < 20) score += 2;
            else if (target.currentSpeed <= 10) score += 3;
            if (target.type === SHIP_TYPES.TANKER) score += 2;
            else if (target.type === SHIP_TYPES.TRANSPORT) score += 1;
            else score -= 1;
            score += count;
            if (this.visibilityMode === 'MIST' || this.visibilityMode === 'NIGHT' && !this.isIlluminated(target)) score -= 1;
            if (this.visibilityMode === 'NIGHT' && this.moonlightFactor > 3) score += 1;
            if(this.visibilityMode==='FOG'&&this.coveredByPatch(target)) score-=5;
            const hits = automaticHit ? count : score >= 10 && count === 2 ? 2 : score >= 7 ? 1 : 0;
            this.log(`Torpedoes at #${target.id}: ${hits} hit(s), score ${score}${automaticHit ? ', intercepted' : ''}.`);
            if (!hits) continue;
            if (hits === 2) {
                target.pendingExplosion = true;
                this.applyDamageResults(target, target.startingBuoyancy, 0);
            } else if ([SHIP_TYPES.MTB, SHIP_TYPES.MGB, SHIP_TYPES.E_BOAT, SHIP_TYPES.R_BOAT, SHIP_TYPES.F_LIGHTER].includes(target.type)) {
                this.applyDamageResults(target, target.startingBuoyancy, 0);
            } else if (Math.floor(Math.random() * 6) + 1 <= 4) {
                this.pendingEffects.push(()=>{target.sinksOnTurn = this.turn + 1;});
                this.log(`#${target.id} will sink next move.`);
            } else {
                this.applyDamageResults(target, 100, 0);
            }
        }
        this.torpedoOrders = [];
    }

    declareDepthCharge() {
        const ship=this.selectedShip,target=this.selectedTarget;
        if(this.phase!=='ORDERS'||!ship||!target||ship.isOnFire||ship.lockedWith||ship.deadInWater||
            ship.isDestroyed||target.isDestroyed||RULES.faction(ship)===RULES.faction(target)||
            this.depthOrders.some(o=>o.ship===ship)||ship.depthChargesLeft<1) return;
        const count=Math.min(ship.depthChargesLeft,Number(ship.depthChargeSystems.port)+Number(ship.depthChargeSystems.starboard));
        if(!count) return;
        const shallow=this.dcDepthSel.value==='SHALLOW';
        this.depthOrders.push({ship,target,count,shallow});
        this.log(`#${ship.id} orders ${count} ${shallow?'shallow':'deep'} depth charges against #${target.id}.`);
        this.updateUI();
    }

    depthChargeAttack() {
        if(this.phase!=='DEPTH_CHARGES') return;
        const groups=new Map();
        for(const order of this.depthOrders) {
            if(!order.marker||order.ship.isDestroyed||order.ship.isOnFire||order.ship.exited) continue;
            if(!groups.has(order.target)) groups.set(order.target,[]);
            groups.get(order.target).push(order);
        }
        const dcRoll=()=>{const die=RULES.die();return die<=2?-1:die<=4?1:2;};
        const result=(score,ship,attacker)=>{
            const damage=attacker?[0,10,15,25,30]:[10,15,25,25,50];
            const index=score<=1?0:score>=5?4:score-1;
            this.applyDamageResults(ship,damage[index],0);
            if(score>=5 || score===4&&!attacker) this.pendingEffects.push(()=>{ship.rudderJamTurns=Math.max(ship.rudderJamTurns,2);});
            if(score>=5&&!attacker) this.pendingEffects.push(()=>{ship.deadInWater=true;ship.currentSpeed=0;});
        };
        for(const [target,orders] of groups) {
            // One defender die for the target, including all dropped charges.
            let defender=dcRoll();
            for(const order of orders) {
                const {ship,count,shallow}=order;
                const stern=Geometry.edge(target,'ASTERN');
                const inches=Math.ceil(Math.hypot(order.marker.x-stern.x,order.marker.y-stern.y)/25-1e-9);
                let score=dcRoll()-inches+2*count+(shallow?1:-2);
                if(ship.currentSpeed<10) score+=2;
                else if(ship.currentSpeed<=20||ship.currentSpeed>30) score--;
                result(score,ship,true);
                defender+=count-inches+(shallow?2:-2);
                ship.depthChargesLeft-=count;
                this.log(`#${ship.id} depth charges at (${order.marker.x.toFixed(1)},${order.marker.y.toFixed(1)}), ${inches} inches from stern: attacker score ${score}.`);
            }
            if(target.currentSpeed>30) defender--;
            else if(target.currentSpeed>=20) defender++;
            else if(target.currentSpeed>=10) defender+=2;
            else defender+=3;
            result(defender,target,false);
            this.log(`#${target.id} depth charge defender score ${defender}.`);
        }
        this.depthOrders=[];
    }

    finishMove() {
        if(this.moveAdjusted) return;
        this.moveAdjusted=true;
        for(const ship of this.ships) {
            if(ship.isOnFire) this.processFire(ship);
            if(ship.sinksOnTurn&&ship.sinksOnTurn<=this.turn) {
                ship.isDestroyed=true;ship.currentBuoyancy=0;ship.isOnFire=false;
                this.log(`#${ship.id} sinks from its torpedo hit.`);
            }
            if(ship.lockedWith&&ship.lockedUntilTurn<=this.turn) {ship.lockedWith=null;ship.lockedGroup=null;}
        }
        this.updateAutomaticContacts();
    }

    endTurn() {
        this.finishMove();
        if(this.turn===10) {
            this.computeVictory();this.phase='GAME_OVER';this.updateUI();return;
        }
        this.turn++; this.phase='ORDERS'; this.moveAdjusted=false;
        this.sightingAttempts={British:0,German:0};
        for(const ship of this.ships) {ship.hasFired=false;ship.engagedTargetId=null;}
        this.illuminationAreas=this.illuminationAreas.filter(area=>area.expires>=this.turn);
        if(this.visibilityMode==='NIGHT'&&this.turn%2===1) {
            this.moonlightFactor=RULES.die();this.log(`Moonlight factor ${this.moonlightFactor}.`);
        }
        this.log(`Start Turn ${this.turn}`);
    }

    computeVictory() {
        let attackerLost=0,escortLost=0,attackerSunkPoints=0,defenderSunkPoints=0,merchantPoints=0;
        for(const ship of this.ships) {
            if(ship.isOnFire) continue;
            const lost=Math.max(0,ship.startingBuoyancy-Math.max(ship.currentBuoyancy,0));
            if(RULES.faction(ship)===this.attackerFaction) {
                attackerLost+=lost;
                if(ship.isDestroyed) defenderSunkPoints+=ship.type.points;
            } else if(RULES.faction(ship)===this.defenderFaction) {
                if(!RULES.merchant(ship)) escortLost+=lost;
                if(ship.isDestroyed) attackerSunkPoints+=ship.type.points;
                else if(RULES.merchant(ship)) merchantPoints+=ship.type.points;
            }
        }
        const attackerScore=attackerSunkPoints+Math.floor(escortLost/10)-Math.floor(attackerLost/10);
        const defenderScore=defenderSunkPoints+merchantPoints-Math.floor(escortLost/10);
        const winner=attackerScore>defenderScore?'Attacker':'Defender';
        this.log(`GAME OVER Turn 10. Attacker Score: ${attackerScore}, Defender Score: ${defenderScore}`);
        this.log(`${winner} Victory.`);this.victory={attackerScore,defenderScore,winner};return this.victory;
    }

    canIlluminate(ship,target) {
        if(this.phase!=='TORPEDO_ORDERS'||!ship||!target||ship.isOnFire||ship.lockedWith||ship.exited||
            ship.illuminatedOnTurn===this.turn||RULES.faction(ship)===RULES.faction(target)||this.visibilityMode!=='NIGHT') return false;
        const star=ship.type.name.includes('Trawler')||ship.type.name==='F-Lighter'&&RULES.faction(ship)==='German'||
            ship.type.name==='Transport'&&RULES.faction(ship)==='British';
        return (star||ship.projectorsLeft>0)&&this.torpedoVisibleLastMove(ship,target);
    }

    illuminateTarget() {
        const ship=this.selectedShip,target=this.selectedTarget;
        if(!this.canIlluminate(ship,target)) return;
        const star=ship.type.name.includes('Trawler')||ship.type.name==='F-Lighter'||ship.type.name==='Transport';
        if(!star) ship.projectorsLeft--;
        ship.illuminatedOnTurn=this.turn;ship.firedOnTurn=this.turn;
        this.illuminationAreas.push({x:target.x,y:target.y,radius:112.5,expires:this.turn+1});
        for(const covered of this.ships.filter(s=>this.isIlluminated(s))) {
            const faction=RULES.faction(covered)==='British'?'German':'British';
            const key=this.contactKey(faction,covered),previous=this.contacts.get(key);
            this.contacts.set(key,{...(previous||{faction,targetId:covered.id,observerId:ship.id,turn:this.turn}),illuminated:true});
        }
        this.log(`#${ship.id} illuminates a 9-inch diameter area for moves ${this.turn} and ${this.turn+1}.`);
        this.updateUI();
    }

    processFire(ship) {
        const report=msg=>this.log(msg,RULES.faction(ship));
        if (!ship.isOnFire || ship.isDestroyed || ship.fireStartedTurn === this.turn) return;
        const thresholds = [8, 10, 11]; // first, second, third move
        const attempt = Math.min(ship.fireTimer, 2);
        const required = thresholds[attempt];
        const roll = (Math.floor(Math.random()*6)+1) + (Math.floor(Math.random()*6)+1);

        if (roll >= required) {
            ship.isOnFire = false;
            ship.fireTimer = 0;
            report(`${ship.type.name} (#${ship.id}) FIRE EXTINGUISHED (roll ${roll} >= ${required}).`);
            return;
        }

        ship.fireTimer += 1;
        if (ship.fireTimer >= 3) {
            report(`${ship.type.name} (#${ship.id}) EXPLODES due to fire!`);
            this.handleExplosion(ship);
            ship.isDestroyed = true;
            return;
        } else {
            report(`${ship.type.name} (#${ship.id}) remains on fire (roll ${roll} < ${required}).`);
        }
    }

    handleExplosion(sourceShip, exploded = new Set()) {
        if (exploded.has(sourceShip)) return;
        exploded.add(sourceShip);
        sourceShip.isDestroyed = true;
        sourceShip.currentBuoyancy = 0;
        sourceShip.isOnFire = false;
        const partners=sourceShip.lockedGroup || new Set(sourceShip.lockedWith?[sourceShip.lockedWith]:[]);
        for(const partner of partners) if(partner!==sourceShip&&!partner.isDestroyed) {
            this.log(`#${partner.id} explodes with its locked partner.`);this.handleExplosion(partner,exploded);
        }
        const radiusPx = 50 * SCALE.PIXELS_PER_10_YARDS / 10;
        for (const target of this.ships) {
            if (target === sourceShip || target.isDestroyed) continue;
            if (Math.hypot(target.x - sourceShip.x, target.y - sourceShip.y) <= radiusPx) {
                this.applyDamageResults(target, (Math.floor(Math.random()*6)+1)*10, 0);
            }
        }
    }

    findInterveningShips(origin,end,sourceShip,target) {
        return this.ships.filter(ship=>ship!==sourceShip&&ship!==target&&!ship.isDestroyed&&!ship.exited)
            .map(ship=>({ship,t:Geometry.segmentEntry(origin,end,ship)}))
            .filter(hit=>hit.t!==null).sort((a,b)=>a.t-b.t);
    }

    contactKey(faction,target) {return `${faction}:${target.id}`;}

    isIlluminated(ship) {
        if(!ship) return false;
        return this.illuminationAreas.some(area=>area.expires>=this.turn &&
            Math.hypot(Geometry.nearest(ship,area).x-area.x,Geometry.nearest(ship,area).y-area.y)<=area.radius);
    }

    coveredByPatch(ship) {
        return this.visibilityPatches.some(patch=>Geometry.overlaps(ship,{...patch,heading:0,type:{size:{width:450,length:450}}}));
    }

    weatherVisible(observer,target) {
        if(this.visibilityMode!=='FOG'&&this.visibilityMode!=='MIST') return true;
        const origin=Geometry.nearest(observer,target),end=Geometry.nearest(target,origin);
        const range=RULES.worldToYards(Math.hypot(end.x-origin.x,end.y-origin.y));
        for(const patch of this.visibilityPatches) {
            const box={...patch,heading:0,type:{size:{width:450,length:450}}};
            if(this.visibilityMode==='FOG'&&Geometry.segmentEntry(origin,end,box)!==null&&range>25) return false;
            if(this.visibilityMode==='MIST'&&Geometry.overlaps(target,box)&&!Geometry.overlaps(observer,box)&&
                Geometry.range(origin,box).yards>150) return false;
        }
        return true;
    }

    autoVisible(observer,target) {
        return Geometry.range(Geometry.nearest(observer,target),target).yards <= this.moonlightFactor*30;
    }

    onTable(ship) {
        return Geometry.overlaps(ship,{x:this.world.width/2,y:this.world.height/2,heading:0,type:{size:{width:this.world.width,length:this.world.height}}});
    }

    canEngage(observer,target) {
        if(observer.isDestroyed||target.isDestroyed||observer.exited||target.exited||!this.onTable(observer)||!this.onTable(target)) return false;
        if(!this.weatherVisible(observer,target)) return false;
        if(this.visibilityMode!=='NIGHT') return true;
        if(this.isIlluminated(target)||this.autoVisible(observer,target)) return true;
        if(observer.lastGunAttack?.targetId===target.id&&observer.lastGunAttack.turn===this.turn-1&&
            observer.lastGunAttack.wasIlluminated) return true;
        const contact=this.contacts.get(this.contactKey(RULES.faction(observer),target));
        return !!(contact && !contact.illuminated && (this.turn>=contact.turn+2 || this.turn>=contact.turn+1&&contact.observerId===observer.id));
    }

    recordEngagement(observer,target) {
        observer.engagedTargetId=target.id;
    }

    torpedoVisibleLastMove(observer,target) {
        if(this.visibilityMode==='CLEAR') return true;
        if(observer.seenLastTurn?.get(target.id)===this.turn-1) return true;
        const contact=this.contacts.get(this.contactKey(RULES.faction(observer),target));
        return !!(this.visibilityMode==='NIGHT'&&contact&&!contact.illuminated&&contact.turn<this.turn&&this.canEngage(observer,target));
    }

    updateAutomaticContacts() {
        if(this.visibilityMode==='CLEAR') return;
        for(const observer of this.ships.filter(s=>!s.isDestroyed&&!s.exited)) {
            observer.seenLastTurn ||= new Map();
            for(const target of this.ships.filter(s=>!s.isDestroyed&&!s.exited&&RULES.faction(s)!==RULES.faction(observer))) {
                if(this.visibilityMode==='NIGHT'?(this.isIlluminated(target)||this.autoVisible(observer,target)||this.canEngage(observer,target)):this.weatherVisible(observer,target))
                    observer.seenLastTurn.set(target.id,this.turn);
            }
        }
        for(const [key,contact] of this.contacts) {
            const target=this.ships.find(s=>s.id===contact.targetId);
            if(!target||target.isDestroyed) {this.contacts.delete(key);continue;}
            if(contact.illuminated && !this.isIlluminated(target) &&
                !this.ships.some(s=>RULES.faction(s)===contact.faction && !s.isDestroyed &&
                    (this.autoVisible(s,target)||s.engagedTargetId===target.id))) this.contacts.delete(key);
        }
    }

    attemptSighting() {
        const observer=this.selectedShip,target=this.selectedTarget;
        if(this.phase!=='SIGHTING'||this.visibilityMode!=='NIGHT'||!observer||!target||observer.isDestroyed||
            target.isDestroyed||observer.exited||target.exited||RULES.faction(observer)===RULES.faction(target)) return false;
        const faction=RULES.faction(observer);
        if(this.sightingAttempts[faction]>=2) {this.log(`${faction} has used both sighting attempts.`);return false;}
        if(this.autoVisible(observer,target)||this.isIlluminated(target)) {
            this.log('Target automatically visible; no sighting roll needed.');return true;
        }
        this.sightingAttempts[faction]++;
        const range=Geometry.range(Geometry.nearest(observer,target),target).yards;
        let score=RULES.die()+RULES.die()-Math.ceil(range/100)+this.moonlightFactor;
        const speed=target.currentSpeed;
        // At the overlapping printed boundary of 10 knots, use the slower (<=10) band.
        if(speed<=10) score-=4;
        else if(speed<=17) score-=2;
        else if(speed<=29) score--;
        else score++;
        if(observer.currentSpeed>15) score-=2;
        if(target.firedOnTurn===this.turn) score+=5;
        const seen=score>=6;
        if(seen) {
            const key=this.contactKey(faction,target);
            if(!this.contacts.has(key)||this.contacts.get(key).illuminated) this.contacts.set(key,{faction,targetId:target.id,observerId:observer.id,turn:this.turn});
            observer.seenLastTurn ||= new Map();observer.seenLastTurn.set(target.id,this.turn);
        }
        this.log(`${faction} sighting attempt ${this.sightingAttempts[faction]}/2: score ${score}, ${seen?'identified':'unidentified'}.`);
        this.updateUI();return seen;
    }

    identifiedFor(faction,target) {
        if(this.visibilityMode!=='NIGHT'||RULES.faction(target)===faction) return true;
        if(this.contacts.has(this.contactKey(faction,target))&&!this.contacts.get(this.contactKey(faction,target)).illuminated) return true;
        return this.ships.some(observer=>RULES.faction(observer)===faction&&!observer.isDestroyed&&!observer.exited&&this.canEngage(observer,target));
    }

    getVisibilityFireMod(distYards,observer=this.selectedShip,target=this.selectedTarget) {
        const br=distYards<=100?0:distYards<=250?1:distYards<=500?2:3;
        if(this.visibilityMode==='MIST') {
            if(distYards<=25) return 0;
            return [-1,-2,-3,-5][br];
        }
        if(this.visibilityMode==='NIGHT') {
            if(this.isIlluminated(target)) return [1,0,-2,-3][br];
            if(distYards<=25&&this.moonlightFactor>=3) return 0;
            return [-2,-4,-7,-9][br];
        }
        // No fog gunfire modifier is printed: fog changes visibility instead.
        return 0;
    }

    resolveRamming() {
        // Simple overlap detection
        const collisions = [];
        for (let i=0; i<this.ships.length; i++) {
            const a = this.ships[i];
            if (a.isDestroyed || a.exited) continue;
            for (let j=i+1; j<this.ships.length; j++) {
                const b = this.ships[j];
                if (b.isDestroyed || b.exited || a.lockedWith === b) continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                if (Geometry.overlaps(a,b)) {
                    collisions.push([a,b]);
                }
            }
        }

        const impacts=new Map(this.ships.map(ship=>[ship,{x:ship.x,y:ship.y,heading:ship.heading,currentSpeed:ship.currentSpeed}]));
        collisions.forEach(([a,b]) => (a.moveSequence || 0) > (b.moveSequence || 0) ? this.handleRam(a,b,impacts) : this.handleRam(b,a,impacts));
    }

    shipKey(ship) {
        const n = ship.type.name.toUpperCase();
        if (n.includes('TANKER')) return 'TANKER';
        if (n.includes('TRANSPORT')) return 'TRANSPORT';
        if (n.includes('TRAWLER')) return 'TRAWLER';
        if (n.includes('LIGHTER')) return 'LIGHTER';
        if (n.includes('MGB')) return 'MGB';
        if (n.includes('R-BOAT')) return 'R';
        if (n.includes('E-BOAT')) return 'E';
        return 'MTB';
    }

    getRammingFactors(rammer, rammed) {
        // Printed page 13: each cell is [rammed ship, ramming ship].
        const table = {
            TANKER: [[12,30],[15,28],[18,28],[15,26],[24,28]],
            TRANSPORT: [[15,25],[18,25],[20,24],[18,22],[32,30]],
            TRAWLER: [[18,20],[20,22],[24,22],[20,18],[35,25]],
            MGB: [[20,16],[24,18],[26,18],[22,15],[38,20]],
            R: [[23,15],[25,15],[30,14],[24,13],[42,15]],
            E: [[25,15],[25,14],[30,14],[25,12],[45,12]],
            MTB: [[30,15],[28,10],[32,10],[30,10],[50,10]],
            LIGHTER: [[15,14],[16,12],[18,10],[20,10],[40,8]]
        };
        const key = this.shipKey(rammer);
        const col = key === 'MTB' ? 0 : key === 'R' || key === 'E' ? 1 :
            key === 'MGB' ? 2 : key === 'TRAWLER' || key === 'LIGHTER' ? 3 : 4;
        return table[this.shipKey(rammed)][col];
    }

    handleRam(rammer, rammed, impacts=null) {
        const a=impacts?.get(rammer)||rammer,b=impacts?.get(rammed)||rammed;
        const dx = a.x - b.x, dy = a.y - b.y;
        const bearing = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        const rel = ((bearing - b.heading) % 360 + 360) % 360;
        // Head-on collisions are avoided under the rules.
        if (Math.abs(RULES.signed(a.heading-b.heading))>150 && (rel<54||rel>306)) {
            const rad=rammer.heading*Math.PI/180;
            for(let step=0;step<200&&Geometry.overlaps(rammer,rammed);step++) {rammer.x+=Math.cos(rad);rammer.y+=Math.sin(rad);}
            this.log('Head-on collision avoided.');return;
        }
        const broadside = rel < 135 || rel >= 225;
        const intentional = !!rammer.orderedRam;
        const [rammedBase, rammerBase] = this.getRammingFactors(rammer, rammed);
        const dice = () => (Math.floor(Math.random()*6)+1) + (Math.floor(Math.random()*6)+1);
        const stationary = b.currentSpeed <= 0;
        const rammedDamage = Math.max(0, rammedBase - dice() + (intentional ? 10 : 5) +
            Math.max(a.currentSpeed - 10, 0) + (stationary ? 10 : 0) + (broadside ? 8 : 4));
        const rammerDamage = Math.max(0, rammerBase - dice() + (intentional ? 5 : 3) -
            2 * Math.max(b.currentSpeed - 10, 0) + (stationary ? 5 : 0) + (broadside ? 8 : -5));
        this.applyDamageResults(rammed, rammedDamage, 0);
        this.applyDamageResults(rammer, rammerDamage, 0);
        const merchant = ship => ['TRANSPORT', 'TANKER'].includes(this.shipKey(ship));
        const awayTurn = (ship, other, points) => {
            const relative = ((Math.atan2(other.y - ship.y, other.x - ship.x) * 180 / Math.PI + 90 - ship.heading) % 360 + 360) % 360;
            ship.heading = (ship.heading + (relative < 180 ? -1 : 1) * points * RULES.pointDegrees + 360) % 360;
        };
        if (merchant(rammer) && !merchant(rammed)) {
            rammed.heading = rammer.heading;
            awayTurn(rammer, rammed, 1);
        } else if (!merchant(rammer) && merchant(rammed)) {
            rammer.heading = rammed.heading;
            awayTurn(rammed, rammer, this.shipKey(rammed) === 'TRANSPORT' ? 2 : 1);
        } else {
            const group=new Set([rammer,rammed,...(rammer.lockedGroup||[]),...(rammed.lockedGroup||[])]);
            rammer.lockedWith=rammed;rammed.lockedWith=rammer;
            for(const ship of group) {ship.lockedGroup=group;ship.lockedUntilTurn=this.turn+1;ship.currentSpeed=0;}

        }
        this.log(`Ramming: #${rammer.id} into #${rammed.id}; damage ${rammerDamage}/${rammedDamage}.`);
    }

    loop() {
        this.ctx.fillStyle='#dce4dc';
        this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        if(typeof MTBVisuals!=='undefined'&&MTBVisuals.chart?.complete&&MTBVisuals.chart.naturalWidth)
            this.ctx.drawImage(MTBVisuals.chart,0,0,this.canvas.width,this.canvas.height);

        for(const patch of this.visibilityPatches) {
            this.ctx.fillStyle=this.visibilityMode==='FOG'?'#b8c5ce88':'#c6d6df44';
            this.ctx.fillRect(patch.x-225,patch.y-225,450,450);
        }
        for(const area of this.illuminationAreas.filter(a=>a.expires>=this.turn)) {
            this.ctx.fillStyle='#edc78744'; this.ctx.beginPath();this.ctx.arc(area.x,area.y,area.radius,0,Math.PI*2);this.ctx.fill();
        }
        // Launch markers remain at the stern position before movement.
        this.ctx.fillStyle = '#a43e32';
        this.ctx.font = '11px sans-serif';
        for (const order of this.torpedoOrders) {
            this.ctx.fillRect(order.marker.x - 4, order.marker.y - 4, 8, 8);
            this.ctx.fillText(`T${order.ship.id}`, order.marker.x + 8, order.marker.y);
        }
        this.ctx.strokeStyle = '#536d69';
        this.ctx.beginPath();
        this.ctx.moveTo(65, 1090); this.ctx.lineTo(190, 1090);
        this.ctx.stroke();
        this.ctx.fillStyle = '#536d69';
        this.ctx.font = '11px sans-serif';
        this.ctx.fillText('50 yards', 65, 1110);
        // Draw Ships
        this.ships.forEach(ship => {
            const isSelected = this.selectedShip === ship;
            const isTarget = this.selectedTarget === ship;
            if(this.identifiedFor(this.viewFaction,ship)) ship.draw(this.ctx,isSelected,isTarget);
            else if(!ship.isDestroyed&&!ship.exited) {
                this.ctx.save();this.ctx.translate(ship.x,ship.y);this.ctx.rotate(ship.heading*Math.PI/180);
                this.ctx.fillStyle='#8b9383';this.ctx.fillRect(-12.5,-25,25,50);this.ctx.restore();
                this.ctx.fillStyle='#344b47';this.ctx.fillText(`Contact #${ship.id}`,ship.x,ship.y+35);
            }
        });

        requestAnimationFrame(() => this.loop());
    }
}

// Start Game
window.onload = () => {
    const game = new Game();
};
