const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(roll = 4) {
    const math = Object.create(Math);
    math.random = () => (roll - 0.5) / 6;
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value: id === 'torpedo-count' ? '2' : 'SHALLOW',
            classList: { add() {}, remove() {}, toggle() {} }, prepend() {}, replaceChildren() {}, append() {},
            getContext: () => ({}),
        });
        return elements.get(id);
    };
    const context = vm.createContext({ Math: math, window: {},
        document: { getElementById: element, createElement: () => ({}) },
        requestAnimationFrame() {},
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../mtb_data.js'), 'utf8') + '\n' +
        fs.readFileSync(path.join(__dirname, '../mtb_rules.js'), 'utf8') + '\n' +
        fs.readFileSync(path.join(__dirname, '../mtb_game.js'), 'utf8') + '\n' +
        'Game.prototype.loop = function() {}; globalThis.api = { Ship, Game, SHIP_TYPES, RULES, Geometry };', context);
    const { Ship, Game, SHIP_TYPES: types } = context.api;
    const game = new Game();
    element('torpedo-count');
    game.logs = [];
    game.log = text => game.logs.push(text);
    game.ships = []; game.phase = 'ORDERS';
    const ship = (id, type, x = 400, y = 300, heading = 0) => {
        const result = new Ship(id, types[type], x, y, heading);
        game.ships.push(result);
        return result;
    };
    return { game, ship, types, elements, ...context.api, setRandom: fn => {math.random=fn;} };
}
test('gun damage uses table modifiers, and waits for stage 9', () => {
    const { game, ship } = setup();
    const a = ship(1, 'MTB', 200, 300), t = ship(2, 'TANKER', 200, 160);
    game.phase = 'FIRE_FIRST'; game.selectedShip = a; game.selectedTarget = t;
    game.fireGuns();
    assert.equal(t.currentBuoyancy, 270);
    assert.equal(game.pendingDamage[0].damage, 12);
    game.phase = 'DAMAGE'; game.resolvePendingDamage();
    assert.equal(t.currentBuoyancy, 258);
});
test('zero-factor astern guns cannot deal damage or consume a shot', () => {
    const { game, ship } = setup();
    const a = ship(1, 'TANKER'), t = ship(2, 'MTB', 400, 400);
    game.phase = 'FIRE_SECOND'; game.selectedShip = a; game.selectedTarget = t;
    game.fireGuns();
    assert.equal(game.pendingDamage.length, 0);
    assert.equal(a.hasFired, false);
});
test('only the currently phasing faction may fire', () => {
    const { game, ship } = setup();
    const a = ship(1, 'E_BOAT'), t = ship(2, 'MTB', 400, 200);
    game.phase = 'FIRE_FIRST'; game.selectedShip = a; game.selectedTarget = t;
    game.fireGuns(); assert.equal(game.pendingDamage.length, 0);
});
test('same target and weapon on consecutive turns earns +3', () => {
    const { game, ship } = setup();
    const a = ship(1, 'MTB'), t = ship(2, 'TANKER', 400, 200);
    game.phase = 'FIRE_FIRST'; game.selectedShip = a; game.selectedTarget = t;
    game.fireGuns(); const first = game.pendingDamage[0].damage;
    game.turn = 2; game.phase = 'FIRE_SECOND'; a.hasFired = false; game.selectedTarget = t;
    game.fireGuns(); assert.equal(game.pendingDamage[1].damage, first + 3);
});
test('ten-stage sequence moves factions separately and alternates priority', () => {
    const { game } = setup(); const events = [];
    game.executeMovement = faction => events.push(faction);
    game.resolveTorpedoOrders = () => events.push('torpedoes');
    game.resolveRamming = () => events.push('ramming');
    game.resolvePendingDamage = () => events.push('damage');
    for (let i = 0; i < 5; i++) game.nextPhase();
    assert.deepEqual(events, ['British', 'German', 'torpedoes', 'ramming', 'damage']);
    assert.equal(game.turn, 2); assert.equal(game.phase, 'ORDERS');
    events.length = 0;
    game.nextPhase(); game.nextPhase(); game.nextPhase();
    assert.deepEqual(events, ['German', 'British']);
});
test('stage 9 aggregates damage before applying damage-band actions', () => {
    const { game, ship } = setup(); const target = ship(1, 'MGB'); let checks = 0;
    game.checkFireRisk = () => checks++;
    game.phase = 'FIRE_FIRST'; game.applyDamageResults(target, 30); game.applyDamageResults(target, 20);
    game.phase = 'DAMAGE'; game.resolvePendingDamage();
    assert.equal(target.currentBuoyancy, 67); assert.equal(checks, 1);
});
test('defender loses points for its own damaged escorts', () => {
    const { game, ship } = setup();
    ship(1, 'MTB').currentBuoyancy -= 20;
    ship(2, 'E_BOAT').currentBuoyancy -= 30;
    ship(3, 'TRANSPORT');
    const result = game.computeVictory();
    assert.equal(result.attackerScore, 1); assert.equal(result.defenderScore, 72);
});
test('burning ships excluded from all scoring, ties go to defender', () => {
    const { game, ship } = setup();
    ship(1, 'TRANSPORT').isOnFire = true;
    const a = ship(2, 'MTB'); a.isOnFire = true; a.currentBuoyancy = 0; a.isDestroyed = true;
    const result = game.computeVictory();
    assert.equal(result.attackerScore, 0); assert.equal(result.defenderScore, 0);
    assert.equal(result.winner, 'Defender');
});
test('last move scores before opening another playable turn', () => {
    const { game } = setup(); game.turn = 10; game.endTurn(); game.updateUI();
    assert.equal(game.phase, 'GAME_OVER'); assert.equal(game.btnNextPhase.disabled, true);
    game.nextPhase(); assert.equal(game.turn, 10);
});
test('torpedo declaration consumes ammunition and records the pre-movement stern', () => {
    const { game, ship } = setup();
    const a = ship(1, 'MTB'), t = ship(2, 'TANKER', 400, 200);
    game.phase = 'TORPEDO_ORDERS'; game.selectedShip = a; game.selectedTarget = t;
    game.declareTorpedo();
    assert.equal(a.torpedoesLeft, 0); assert.equal(game.torpedoOrders[0].marker.y, a.y+a.type.size.length/2);
    a.x = 500; assert.equal(game.torpedoOrders[0].marker.x, 400);
    game.declareTorpedo(); assert.equal(game.torpedoOrders.length, 1);
});
test('torpedo eligibility requires at least quarter buoyancy', () => {
    const { game, ship } = setup(); const a = ship(1, 'MTB'), t = ship(2, 'TANKER');
    a.currentBuoyancy = 18; assert.equal(game.canDeclareTorpedo(a, t), false);
    a.currentBuoyancy = 19; assert.equal(game.canDeclareTorpedo(a, t), true);
});
test('two simultaneous torpedo hits destroy target at stage 9', () => {
    const { game, ship } = setup(6); const a = ship(1, 'MTB'), t = ship(2, 'TANKER', 400, 200);
    game.phase = 'TORPEDO_ORDERS'; game.selectedShip = a; game.selectedTarget = t; game.declareTorpedo();
    game.phase = 'TORPEDO_RESOLUTION'; game.resolveTorpedoOrders(); assert.equal(t.isDestroyed, false);
    game.phase = 'DAMAGE'; game.resolvePendingDamage(); assert.equal(t.isDestroyed, true);
});
test('one torpedo hit sinks smaller boats even on effect roll 6', () => {
    const { game, ship, elements } = setup(6); const a = ship(1, 'MTB'), t = ship(2, 'E_BOAT', 400, 200);
    elements.get('torpedo-count').value = '1';
    game.phase = 'TORPEDO_ORDERS'; game.selectedShip = a; game.selectedTarget = t; game.declareTorpedo();
    game.phase = 'TORPEDO_RESOLUTION'; game.resolveTorpedoOrders();
    game.phase = 'DAMAGE'; game.resolvePendingDamage(); assert.equal(t.isDestroyed, true);
});
test('new fires wait until subsequent move for first suppression attempt', () => {
    const { game, ship } = setup(6); const target = ship(1, 'MTB');
    target.isOnFire = true; target.fireStartedTurn = 1;
    game.endTurn(); assert.equal(target.isOnFire, true);
    game.endTurn(); assert.equal(target.isOnFire, false);
});
test('orders clamp invalid numeric input', () => {
    const { game, ship } = setup(); const a = ship(1, 'MTB'); game.selectedShip = a;
    game.updateOrder('speed', '500'); assert.equal(a.orderedSpeed, 40);
    game.updateOrder('speed', 'nonsense'); assert.equal(a.orderedSpeed, 40);
    game.updateOrder('turn', '-99'); assert.equal(a.orderedTurn, -9);
});
test('original PDF MTB action rows are mapped to the correct damage bands', () => {
    const { game, ship } = setup(); const a = ship(1, 'MTB');
    const cases = [[70, ''], [45, 'fireRisk'], [35, 'torpedoDamage'], [25, 'fireRisk'], [15, 'fireRisk,turnAway'], [5, 'deadInWater']];
    for (const [buoyancy, actions] of cases) {
        a.currentBuoyancy = buoyancy;
        assert.equal(game.lookupDamageBand(a).actions.join(','), actions);
    }
});
test('ramming uses paired PDF factors and separate rammer modifiers', () => {
    const { game, ship } = setup();
    const a = ship(1, 'MTB', 410, 300), t = ship(2, 'E_BOAT', 400, 300);
    a.currentSpeed = 30; t.currentSpeed = 20; game.phase = 'RAMMING';
    game.handleRam(a, t);
    const damage = new Map(game.pendingDamage.map(hit => [hit.target.id, hit.damage]));
    assert.equal(damage.get(t.id), 50); // 25 - 8 + 5 + 20 + 8
    assert.equal(damage.get(a.id) || 0, 0); // 15 - 8 + 3 - 20 + 8, clamped to 0
    assert.equal(a.lockedUntilTurn, 2);
    game.phase = 'DAMAGE'; game.resolvePendingDamage();
    game.endTurn(); assert.equal(a.lockedWith, t);
    game.endTurn(); assert.equal(a.lockedWith, null);
});
test('single hit sinking is delayed until the next move', () => {
    const { game, ship } = setup(4); const a = ship(1, 'MTB'), t = ship(2, 'TANKER', 400, 200);
    game.phase = 'TORPEDO_ORDERS'; game.selectedShip = a; game.selectedTarget = t;
    a.torpedoSystems.starboard = false; game.declareTorpedo();
    game.phase = 'TORPEDO_RESOLUTION'; game.resolveTorpedoOrders();
    game.phase='DAMAGE'; game.resolvePendingDamage();
    assert.equal(t.sinksOnTurn, 2);
    game.endTurn(); assert.equal(t.isDestroyed, false);
    game.endTurn(); assert.equal(t.isDestroyed, true);
});
test('one fired tube cannot be reused when the remaining loaded tube is damaged', () => {
    const { game, ship, elements } = setup(); const a = ship(1, 'MTB'), t = ship(2, 'TANKER');
    elements.get('torpedo-count').value = '1'; game.phase = 'TORPEDO_ORDERS';
    game.selectedShip = a; game.selectedTarget = t; game.declareTorpedo();
    game.torpedoOrders = []; a.torpedoSystems.starboard = false;
    assert.equal(a.torpedoesLeft, 1); assert.equal(game.canDeclareTorpedo(a, t), false);
});

const approx=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
test('initial speed may be maximum; turns spend distance rather than reducing combat speed',()=>{
    const {ship,RULES}=setup();const a=ship(1,'MTB',800,800);a.orderedSpeed=40;a.orderedTurn=4;a.applyOrders();
    assert.equal(a.currentSpeed,40);assert.equal(a.appliedTurn,4);assert.equal(a.heading,72);
    const r=15/(18*Math.PI/180);
    approx(a.x,800+r*(1-Math.cos(72*Math.PI/180))+140*Math.sin(72*Math.PI/180));
    approx(a.y,800-r*Math.sin(72*Math.PI/180)-140*Math.cos(72*Math.PI/180));
});
test('end turn travels straight first and uses the same movement budget',()=>{
    const {ship}=setup();const a=ship(1,'MTB',800,800);a.orderedSpeed=40;a.orderedTurn=4;a.turnAtEnd=true;a.applyOrders();
    const r=15/(18*Math.PI/180);approx(a.x,800+r*(1-Math.cos(72*Math.PI/180)));
    approx(a.y,660-r*Math.sin(72*Math.PI/180));assert.equal(a.currentSpeed,40);
});
test('subsequent acceleration and deceleration limits use speed, not distance',()=>{
    const {ship}=setup();const a=ship(1,'MTB');a.orderedSpeed=10;a.applyOrders();
    a.orderedSpeed=40;a.applyOrders();assert.equal(a.currentSpeed,30);
    a.orderedSpeed=0;a.applyOrders();assert.equal(a.currentSpeed,20);
    a.speedReducedDice=3;a.applyOrders();assert.equal(a.currentSpeed,0);
});
test('jammed rudders spend no turning distance and wear off after two moves',()=>{
    const {ship}=setup();const a=ship(1,'MTB',800,800);a.orderedSpeed=30;a.orderedTurn=2;a.rudderJamTurns=2;
    a.applyOrders();assert.equal(a.heading,0);assert.equal(a.y,650);
    a.applyOrders();assert.equal(a.heading,0);assert.equal(a.rudderJamTurns,0);
    a.applyOrders();assert.equal(a.heading,36);
});
test('turn orders cannot exceed available movement',()=>{
    const {ship}=setup();const a=ship(1,'MTB');a.orderedSpeed=5;a.orderedTurn=9;a.applyOrders();
    assert.equal(a.appliedTurn,1);assert.equal(a.heading,18);assert.equal(a.currentSpeed,5);
});
test('TA persists and withdraws toward the ship baseline without teleporting',()=>{
    const {game,ship}=setup();const a=ship(1,'MTB',800,800);a.heading=180;a.baseY=1200;a.compulsoryAction='TURN_AWAY';
    a.orderedSpeed=0;a.orderedTurn=4;game.executeMovement('British');
    assert.equal(a.currentSpeed,40);assert.equal(a.heading,180);assert.equal(a.compulsoryAction,'TURN_AWAY');
    game.turn++;game.executeMovement('British');assert.equal(a.exited,false);
    game.turn++;game.executeMovement('British');assert.equal(a.exited,true);
});
test('range is measured from the firing edge to the nearest target counter edge',()=>{
    const {Geometry}=setup();const a={x:0,y:0,heading:0,type:{size:{width:20,length:40}}};
    const b={x:0,y:-100,heading:0,type:{size:{width:20,length:40}}};
    assert.equal(Geometry.range(Geometry.edge(a,'FORWARD'),b).yards,24);
    b.x=100;b.y=0;assert.equal(Geometry.range(Geometry.edge(a,'STARBOARD'),b).yards,32);
});
test('whole target is required beyond 25 yards; half its area is enough at close range',()=>{
    const {Geometry}=setup();const a={x:0,y:0,heading:0,type:{size:{width:20,length:40}}};
    const b={x:40,y:-50,heading:0,type:{size:{width:20,length:20}}};
    const coverage=Geometry.arcCoverage(a,b,'FORWARD');assert.ok(coverage>0.5&&coverage<1);
    assert.ok(Geometry.firingSolutions(a,b).some(s=>s.arc==='FORWARD'));
    b.x=400;b.y=-320;assert.ok(!Geometry.firingSolutions(a,b).some(s=>s.arc==='FORWARD'));
});
test('the supplied fan leaves a gap between forward and broadside arcs',()=>{
    const {Geometry}=setup();const a={x:0,y:0,heading:0,type:{size:{width:20,length:40}}};
    const b={x:1000*Math.sin(Math.PI/3),y:-1000*Math.cos(Math.PI/3),heading:0,type:{size:{width:2,length:2}}};
    assert.equal(Geometry.firingSolutions(a,b).length,0);
});
test('rotated rectangles detect touching corners and reject separated counters',()=>{
    const {Geometry}=setup();const a={x:0,y:0,heading:45,type:{size:{width:20,length:80}}};
    const b={x:25,y:0,heading:0,type:{size:{width:20,length:40}}};assert.equal(Geometry.overlaps(a,b),true);
    b.x=100;assert.equal(Geometry.overlaps(a,b),false);
    a.heading=0;b.x=20;assert.equal(Geometry.overlaps(a,b),true);
});
test('intervening ships use rotated counter intersections and sort by first intersection',()=>{
    const {game,ship}=setup();const farther=ship(1,'TANKER',400,300,90),near=ship(2,'E_BOAT',400,450);
    const hits=game.findInterveningShips({x:400,y:500},{x:400,y:100},null,null);
    assert.equal(hits[0].ship,near);assert.equal(hits[1].ship,farther);
    near.x=420;near.heading=45;assert.ok(game.findInterveningShips({x:400,y:500},{x:400,y:100},null,null).some(h=>h.ship===near));
});
test('torpedoes pass under a fast first blocker and hit a later trawler',()=>{
    const {game,ship}=setup(6);const a=ship(1,'MTB',400,600),t=ship(2,'TANKER',400,100);
    const fast=ship(3,'E_BOAT',400,450);fast.currentSpeed=30;const slow=ship(4,'GERMAN_TRAWLER',400,300);
    game.phase='TORPEDO_ORDERS';game.selectedShip=a;game.selectedTarget=t;
    a.torpedoSystems.starboard=false;game.declareTorpedo();game.phase='TORPEDO_RESOLUTION';game.resolveTorpedoOrders();
    assert.equal(game.pendingDamage.length,1);assert.equal(game.pendingDamage[0].target,slow);
    assert.equal(t.currentBuoyancy,270);assert.equal(fast.currentBuoyancy,115);
});
test('a later merchant blocks overhead fire even if the first blocker may be fired over',()=>{
    const {game,ship}=setup();const a=ship(1,'TRANSPORT',400,600);a.faction='British';
    const t=ship(2,'E_BOAT',400,100);ship(3,'MTB',400,450);ship(4,'TANKER',400,300);
    game.phase='FIRE_FIRST';game.selectedShip=a;game.selectedTarget=t;game.fireGuns();
    assert.equal(game.pendingDamage.length,0);assert.ok(game.logs.some(l=>l.includes('blocks gunfire')));
});
test('depth charges use the closest stern drop point along the full move and preserve gunfire eligibility',()=>{
    const {game,ship,elements}=setup();const a=ship(1,'MGB',400,500),t=ship(2,'TRANSPORT',400,300);
    a.orderedSpeed=30;game.selectedShip=a;game.selectedTarget=t;game.declareDepthCharge();
    elements.get('dc-depth-select').value='DEEP'; // orders already committed to shallow
    game.executeMovement('British');const order=game.depthOrders[0];
    approx(order.marker.y,377);assert.equal(order.shallow,true);
    game.phase='DEPTH_CHARGES';game.depthChargeAttack();
    assert.equal(a.depthChargesLeft,20);assert.equal(a.hasFired,false);
    assert.equal(game.pendingDamage.find(h=>h.target===t).damage,50);
    assert.equal(t.deadInWater,false);game.phase='DAMAGE';game.resolvePendingDamage();assert.equal(t.deadInWater,true);
});
test('depth charge attacks from the non-phasing side move once before stage 3 and skip stage 4 movement',()=>{
    const {game,ship}=setup();const a=ship(1,'R_BOAT',400,500),t=ship(2,'MGB',400,300);
    a.orderedSpeed=24;game.selectedShip=a;game.selectedTarget=t;game.declareDepthCharge();
    let moves=0;const apply=a.applyOrders.bind(a);a.applyOrders=()=>{moves++;apply();};
    game.nextPhase();game.nextPhase();assert.equal(moves,1);
    game.nextPhase();assert.equal(moves,1);
});
test('multiple depth charge attackers share one defender die and consume only working dischargers',()=>{
    const {game,ship,RULES}=setup();const a=ship(1,'MGB'),b=ship(2,'R_BOAT',450,300),t=ship(3,'TRANSPORT',400,200);
    b.faction='British';a.depthChargeSystems.port=false;game.selectedShip=a;game.selectedTarget=t;game.declareDepthCharge();
    game.selectedShip=b;game.declareDepthCharge();
    for(const o of game.depthOrders) {o.marker={x:400,y:235};o.distance=0;}
    let rolls=0;RULES.die=()=>{rolls++;return 4;};game.phase='DEPTH_CHARGES';game.depthChargeAttack();
    assert.equal(rolls,3);assert.equal(a.depthChargesLeft,21);assert.equal(b.depthChargesLeft,2);
});
test('all three scenarios use full fleets and transferable merchant factions',()=>{
    const {game,setRandom}=setup();
    game.init('GERMAN_CONVOY');assert.equal(game.ships.length,22);assert.equal(game.startBattle(),true);
    assert.equal(game.ships.filter(s=>s.type.name==='Transport').length,3);
    game.init('BRITISH_CONVOY');assert.equal(game.ships.length,20);assert.equal(game.attackerFaction,'German');
    assert.equal(game.ships.filter(s=>s.faction==='British'&&s.type.name==='Transport').length,4);assert.equal(game.startBattle(),true);
    let rolls=[6,2];setRandom(()=>((rolls.shift()||3)-0.5)/6);game.init('ENCOUNTER');
    assert.equal(game.ships.length,14);assert.equal(game.attackerFaction,'British');assert.equal(game.startBattle(),true);
});
test('encounter attacker ties reroll both sides',()=>{
    const {game,setRandom}=setup();let rolls=[4,4,2,5];setRandom(()=>((rolls.shift()||3)-0.5)/6);
    game.init('ENCOUNTER');assert.equal(game.attackerFaction,'German');
});
test('transport longitudinal batteries follow the printed counter dispositions after damage',()=>{
    const {game}=setup();game.init('BRITISH_CONVOY');const transports=game.ships.filter(s=>s.type.name==='Transport');
    assert.equal(transports[0].currentWeapons.forward,0);assert.equal(transports[1].currentWeapons.forward,0);
    assert.equal(transports[2].currentWeapons.astern,0);assert.equal(transports[3].currentWeapons.astern,0);
    game.phase='DAMAGE';game.applyDamageResults(transports[3],100);assert.equal(transports[3].currentWeapons.astern,0);
});
test('every positive buoyancy value has exactly one damage band',()=>{
    const {types}=setup();for(const type of Object.values(types)) for(let value=1;value<=type.buoyancy;value++) {
        assert.equal(type.damageBands.filter(b=>b.min<=value&&value<=b.max).length,1,`${type.name} ${value}`);
    }
});
test('fleet damage scoring combines partial tens across ships',()=>{
    const {game,ship}=setup();ship(1,'MTB').currentBuoyancy-=9;ship(2,'MTB').currentBuoyancy-=9;
    ship(3,'E_BOAT').currentBuoyancy-=6;ship(4,'R_BOAT').currentBuoyancy-=6;
    const result=game.computeVictory();assert.equal(result.attackerScore,0);assert.equal(result.defenderScore,-1);
});
test('fog banks limit visibility to 25 yards and require one patch per side at setup',()=>{
    const {game,ship}=setup();game.init();game.visibilityMode='FOG';assert.equal(game.startBattle(),false);
    game.visibilityPatches=[{faction:'British',x:500,y:600},{faction:'German',x:1000,y:600}];assert.equal(game.startBattle(),true);
    game.ships=[];const a=ship(1,'MTB',400,400),t=ship(2,'E_BOAT',400,500);
    assert.equal(game.weatherVisible(a,t),true);t.y=700;assert.equal(game.weatherVisible(a,t),false);
    assert.equal(game.getVisibilityFireMod(20,a,t),0);
});
test('mist observers beyond 150 yards from a bank cannot see into it',()=>{
    const {game,ship}=setup();game.visibilityMode='MIST';game.visibilityPatches=[{x:800,y:600}];
    const a=ship(1,'MTB',100,600),t=ship(2,'E_BOAT',800,600);
    assert.equal(game.weatherVisible(a,t),false);a.x=300;assert.equal(game.weatherVisible(a,t),true);
});
test('night automatic range is three inches per moonlight point, not 75 yards',()=>{
    const {game,ship}=setup();game.visibilityMode='NIGHT';game.moonlightFactor=3;
    const a=ship(1,'MTB',400,500),t=ship(2,'E_BOAT',400,250);assert.equal(game.autoVisible(a,t),true);
    t.y=150;assert.equal(game.autoVisible(a,t),false);
});
test('night sighting has two attempts per side and never rolls during gunfire',()=>{
    const {game,ship}=setup(1);game.visibilityMode='NIGHT';game.moonlightFactor=1;game.phase='SIGHTING';
    const a=ship(1,'MTB',400,1000),t=ship(2,'E_BOAT',400,100);game.selectedShip=a;game.selectedTarget=t;
    assert.equal(game.attemptSighting(),false);assert.equal(game.attemptSighting(),false);assert.equal(game.attemptSighting(),false);
    assert.equal(game.sightingAttempts.British,2);game.phase='FIRE_FIRST';game.fireGuns();assert.equal(game.sightingAttempts.British,2);
});
test('night identification permits the observer next move and other ships one move later',()=>{
    const {game,ship}=setup(6);game.visibilityMode='NIGHT';game.moonlightFactor=1;game.phase='SIGHTING';
    const a=ship(1,'MTB',400,1000),other=ship(2,'MGB',600,1000),t=ship(3,'E_BOAT',400,100);
    t.currentSpeed=30;t.firedOnTurn=1;game.selectedShip=a;game.selectedTarget=t;
    assert.equal(game.attemptSighting(),true);assert.equal(game.canEngage(a,t),false);assert.equal(game.identifiedFor('British',t),true);
    game.turn=2;assert.equal(game.canEngage(a,t),true);assert.equal(game.canEngage(other,t),false);
    game.turn=3;assert.equal(game.canEngage(other,t),true);
});
test('illumination is a fixed 9-inch diameter area, lasts two moves, and consumes projectors',()=>{
    const {game,ship}=setup();game.visibilityMode='NIGHT';game.turn=2;game.phase='TORPEDO_ORDERS';
    const a=ship(1,'MTB',400,800),t=ship(2,'E_BOAT',400,300),near=ship(3,'E_BOAT',510,300),far=ship(4,'E_BOAT',550,300);
    a.seenLastTurn=new Map([[t.id,1]]);game.selectedShip=a;game.selectedTarget=t;game.illuminateTarget();
    assert.equal(a.projectorsLeft,1);assert.equal(game.isIlluminated(near),true);assert.equal(game.isIlluminated(far),false);
    game.illuminateTarget();assert.equal(a.projectorsLeft,1);t.x=700;assert.equal(game.isIlluminated(t),false);
    game.turn=3;assert.equal(game.isIlluminated(near),true);game.turn=4;assert.equal(game.isIlluminated(near),false);
});
test('British transports may fire star shells without projector inventory',()=>{
    const {game,ship}=setup();game.visibilityMode='NIGHT';game.turn=2;game.phase='TORPEDO_ORDERS';
    const a=ship(1,'TRANSPORT',400,800),t=ship(2,'E_BOAT',400,300);a.faction='British';
    a.seenLastTurn=new Map([[t.id,1]]);game.selectedShip=a;game.selectedTarget=t;
    game.illuminateTarget();assert.equal(game.illuminationAreas.length,1);assert.equal(a.projectorsLeft,0);
});
test('illumination prohibits broadside fire but permits forward fire that move',()=>{
    const {game,ship}=setup();game.visibilityMode='NIGHT';game.turn=2;
    const a=ship(1,'MGB',400,500),t=ship(2,'E_BOAT',400,300);a.illuminatedOnTurn=2;
    game.illuminationAreas=[{x:400,y:300,radius:112.5,expires:3}];game.phase='FIRE_SECOND';game.selectedShip=a;game.selectedTarget=t;
    game.fireGuns();assert.equal(game.pendingDamage.length,1);assert.equal(a.lastGunAttack.arc,'FORWARD');
});
test('close range visibility exceptions and night illuminated fire modifiers match the table',()=>{
    const {game,ship}=setup();const a=ship(1,'MTB'),t=ship(2,'E_BOAT');
    game.visibilityMode='MIST';assert.equal(game.getVisibilityFireMod(25,a,t),0);assert.equal(game.getVisibilityFireMod(26,a,t),-1);
    game.visibilityMode='NIGHT';game.moonlightFactor=3;assert.equal(game.getVisibilityFireMod(25,a,t),0);
    game.moonlightFactor=2;assert.equal(game.getVisibilityFireMod(25,a,t),-2);
    game.illuminationAreas=[{x:400,y:300,radius:112.5,expires:2}];assert.equal(game.getVisibilityFireMod(100,a,t),1);
    assert.equal(game.getVisibilityFireMod(251,a,t),-2);
});
test('explosions propagate through locked groups and nearby blast damage updates damage bands',()=>{
    const {game,ship}=setup(2);const a=ship(1,'MTB',100,100),b=ship(2,'E_BOAT',100,100),near=ship(3,'MGB',200,100);
    a.lockedWith=b;b.lockedWith=a;game.phase='DAMAGE';game.handleExplosion(a);
    assert.equal(a.isDestroyed,true);assert.equal(b.isDestroyed,true);assert.equal(near.currentBuoyancy,77);
    assert.equal(near.currentWeapons.broadside,95);
});
test('head-on encounters are avoided without ramming damage',()=>{
    const {game,ship,Geometry}=setup();const a=ship(1,'MTB',400,300,180),t=ship(2,'E_BOAT',400,320,0);
    game.phase='RAMMING';game.handleRam(a,t);assert.equal(game.pendingDamage.length,0);assert.equal(Geometry.overlaps(a,t),false);
});
test('intentional ram applies the separate +10/+5 bonuses',()=>{
    const {game,ship}=setup();const a=ship(1,'MTB',410,300),t=ship(2,'E_BOAT',400,300);
    a.currentSpeed=10;t.currentSpeed=10;a.orderedRam=true;game.phase='RAMMING';game.handleRam(a,t);
    assert.equal(game.pendingDamage.find(h=>h.target===a).damage,20);assert.equal(game.pendingDamage.find(h=>h.target===t).damage,35);
});
test('declared torpedo launch does not depend on whether gunfire was also used',()=>{
    const {game,ship}=setup(6);const a=ship(1,'MTB',400,500),t=ship(2,'TANKER',400,200);
    game.selectedShip=a;game.selectedTarget=t;game.declareTorpedo();a.hasFired=true;
    game.phase='TORPEDO_RESOLUTION';game.resolveTorpedoOrders();assert.equal(game.pendingDamage.length,1);
});
test('night torpedoes require a target seen on the previous move',()=>{
    const {game,ship}=setup();game.visibilityMode='NIGHT';game.moonlightFactor=6;
    const a=ship(1,'MTB'),t=ship(2,'E_BOAT',400,250);assert.equal(game.canDeclareTorpedo(a,t),false);
    a.seenLastTurn=new Map([[t.id,1]]);game.turn=2;assert.equal(game.canDeclareTorpedo(a,t),true);
});
for(const scenario of ['GERMAN_CONVOY','BRITISH_CONVOY','ENCOUNTER']) for(const mode of ['CLEAR','NIGHT','FOG','MIST']) {
    test(`complete ten-move ${scenario} ${mode} game reaches a scored final state`,()=>{
        const {game,setRandom,Geometry}=setup();let seed=53;
        setRandom(()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;});
        game.init(scenario);game.visibilityMode=mode;
        if(mode==='FOG'||mode==='MIST') game.visibilityPatches=[{faction:'British',x:500,y:600},{faction:'German',x:1000,y:600}];
        assert.equal(game.startBattle(),true);
        for(let stage=0;stage<90&&game.phase!=='GAME_OVER';stage++) {
            if(game.phase==='ORDERS') for(const ship of game.ships) {ship.orderedSpeed=ship.type.maxSpeed;ship.orderedTurn=game.turn>3?(ship.id%2?1:-1):0;}
            if(game.firingFaction) for(const ship of game.ships.filter(s=>s.faction===game.firingFaction&&!s.isDestroyed)) {
                const target=game.ships.find(t=>t.faction!==ship.faction&&!t.isDestroyed&&Geometry.firingSolutions(ship,t).length&&game.canEngage(ship,t));
                if(target) {game.selectedShip=ship;game.selectedTarget=target;game.fireGuns();}
            }
            if(game.phase==='SIGHTING') {
                for(const faction of ['British','German']) {
                    const observer=game.ships.find(s=>s.faction===faction&&!s.isDestroyed),target=game.ships.find(s=>s.faction!==faction&&!s.isDestroyed);
                    if(observer&&target) {game.selectedShip=observer;game.selectedTarget=target;game.attemptSighting();}
                }
            }
            game.nextPhase();
            for(const ship of game.ships) for(const field of ['x','y','heading','currentSpeed','currentBuoyancy']) assert.ok(Number.isFinite(ship[field]),`${field} must stay finite`);
        }
        assert.equal(game.phase,'GAME_OVER');assert.equal(game.turn,10);assert.ok(game.victory);
        assert.ok(Number.isFinite(game.victory.attackerScore));assert.ok(Number.isFinite(game.victory.defenderScore));
    });
}
test('depth discharger damage applies on both dice 3 and 4 as shown by the merged PDF cell',()=>{
    for(const roll of [3,4]) {const {game,ship}=setup(roll);const a=ship(1,'MGB');game.rollDepthDamage(a);assert.equal(a.depthChargeSystems.starboard,false);}
});
test('damage speed loss is rolled during stage 9 and cannot linger through a locked move',()=>{
    const {game,ship}=setup(4);const a=ship(1,'MGB');game.phase='DAMAGE';game.applyDamageResults(a,40);
    assert.equal(a.nextSpeedReduction,4);a.lockedWith=ship(2,'E_BOAT');a.rudderJamTurns=2;a.applyOrders();
    assert.equal(a.nextSpeedReduction,0);assert.equal(a.rudderJamTurns,1);
});
test('torpedo speed boundaries and dead-in-water bonus use all applicable printed factors',()=>{
    for(const [speed,dead,bonus] of [[10,false,3],[11,false,2],[19,false,2],[20,false,0],[21,false,-1],[30,false,-1],[31,false,-2],[0,true,8]]) {
        const {game,ship}=setup(3);const a=ship(1,'MTB',400,500),t=ship(2,'TANKER',400,300);t.currentSpeed=speed;t.deadInWater=dead;
        a.torpedoSystems.starboard=false;game.selectedShip=a;game.selectedTarget=t;game.declareTorpedo();game.phase='TORPEDO_RESOLUTION';game.resolveTorpedoOrders();
        const log=game.logs.find(l=>l.includes('hit(s), score'));const score=Number(log.match(/score (-?\d+)/)[1]);
        assert.equal(score,6-1+2+1+bonus,`speed ${speed} dead ${dead}`);
    }
});
test('guns retain an illuminated contact only with uninterrupted fire from the same observer',()=>{
    const {game,ship}=setup();game.visibilityMode='NIGHT';game.moonlightFactor=1;game.turn=3;
    const a=ship(1,'MTB',400,1000),other=ship(2,'MGB',600,1000),t=ship(3,'E_BOAT',400,100);
    game.contacts.set('British:3',{faction:'British',targetId:3,observerId:1,turn:1,illuminated:true});
    a.lastGunAttack={targetId:3,turn:2,wasIlluminated:true};
    assert.equal(game.canEngage(a,t),true);assert.equal(game.canEngage(other,t),false);
    game.turn=4;assert.equal(game.canEngage(a,t),false);
});
test('ramming a merchant changes headings rather than locking the vessels',()=>{
    const {game,ship}=setup();const a=ship(1,'MTB',410,300),t=ship(2,'TRANSPORT',400,300);
    a.currentSpeed=30;t.currentSpeed=18;game.phase='RAMMING';game.handleRam(a,t);
    assert.equal(a.lockedWith,null);assert.equal(t.lockedWith,null);assert.equal(a.heading,0);assert.equal(t.heading,324);
});
test('sinking a burning ship clears its fire state so the sunk ship counts for victory',()=>{
    const {game,ship}=setup();const t=ship(1,'TRANSPORT');t.isOnFire=true;game.phase='DAMAGE';game.applyDamageResults(t,180);
    assert.equal(t.isOnFire,false);assert.equal(game.computeVictory().attackerScore,75);
});
test('gun modifiers match every speed, range, weapon column and die boundary',()=>{
    const {game,ship,setRandom}=setup();game.world.height=4000;const a=ship(1,'MGB',400,2000),t=ship(2,'TANKER',400,1800);
    const speedRows=[[3,5,8,10],[2,3,5,8],[1,2,3,5],[0,0,1,3],[0,0,0,1]];
    const randomRows=[[-4,-3,-2,-1],[-2,-1,0,1],[0,0,3,4],[2,3,5,7],[3,7,7,8],[5,6,8,10]];
    const ranges=[[0,5],[25,5],[26,4],[50,4],[51,3],[100,3],[101,1],[200,1],[201,0],[300,0],[301,-1],[400,-1],[401,-2],[500,-2],[501,-4]];
    game.log=()=>{};
    for(const weapon of [1,25,26,50,51,75,76,100]) for(const speed of [0,1,10,11,20,21,30,31,40]) for(const [range,modifier] of ranges) for(let die=1;die<=6;die++) {
        game.phase='FIRE_FIRST';game.pendingDamage=[];a.hasFired=false;a.lastGunAttack=null;
        a.currentWeapons.forward=weapon;t.currentSpeed=speed;
        t.y=a.y-a.type.size.length/2-t.type.size.length/2-range*2.5;
        game.selectedShip=a;game.selectedTarget=t;setRandom(()=>(die-0.5)/6);game.fireGuns();
        const wf=range>500?Math.floor(weapon/2):weapon;
        const col=wf<=25?0:wf<=50?1:wf<=75?2:3,row=speed===0?0:speed<=10?1:speed<=20?2:speed<=30?3:4;
        const expected=wf===0?0:Math.max(0,speedRows[row][col]+(wf<=50?3:5)+modifier+randomRows[die-1][col]);
        const actual=game.pendingDamage.reduce((sum,h)=>sum+h.damage,0);
        assert.equal(actual,expected,`WF ${weapon}, speed ${speed}, range ${range}, die ${die}`);
    }
});
test('target-size modifiers match the PDF for both weapon column groups',()=>{
    const {game,ship}=setup(4);const a=ship(1,'MGB',400,1000);
    const sizes={MTB:[-3,-2],E_BOAT:[-2,-2],R_BOAT:[-1,1],MGB:[-1,1],BRITISH_TRAWLER:[0,3],GERMAN_TRAWLER:[0,3],F_LIGHTER:[1,2],TRANSPORT:[2,4],TANKER:[3,5]};
    for(const [type,mods] of Object.entries(sizes)) for(const [index,wf] of [25,100].entries()) {
        game.ships=[a];const t=ship(2,type);t.faction='German';t.y=1000-a.type.size.length/2-t.type.size.length/2-62.5;
        a.hasFired=false;a.lastGunAttack=null;a.currentWeapons.forward=wf;game.pendingDamage=[];game.phase='FIRE_FIRST';game.selectedShip=a;game.selectedTarget=t;
        game.fireGuns();assert.equal(game.pendingDamage[0].damage,(index?10:3)+mods[index]+5+(index?7:2),type);
    }
});
test('input events commit movement orders before another control changes focus',()=>{
    const {game,ship}=setup();const a=ship(1,'MTB');game.selectedShip=a;
    game.inpSpeed.oninput({target:{value:'40'}});game.inpTurn.oninput({target:{value:'2'}});
    game.nextPhase();assert.equal(a.orderedSpeed,40);assert.equal(a.orderedTurn,2);
});
test('fog torpedoes may attack a previously seen target now hidden in a bank',()=>{
    const {game,ship}=setup();game.visibilityMode='FOG';game.turn=2;game.visibilityPatches=[{x:400,y:300}];
    const a=ship(1,'MTB',400,1000),t=ship(2,'TANKER',400,300);a.seenLastTurn=new Map([[t.id,1]]);
    assert.equal(game.weatherVisible(a,t),false);assert.equal(game.canDeclareTorpedo(a,t),true);
});
test('attack orders may be cancelled before movement without losing ammunition',()=>{
    const {game,ship}=setup();const a=ship(1,'MTB'),t=ship(2,'TANKER',400,200);game.selectedShip=a;game.selectedTarget=t;
    game.declareTorpedo();assert.equal(a.torpedoesLeft,0);game.cancelAttackOrders();
    assert.equal(a.torpedoesLeft,2);assert.equal(a.loadedTubes.port,true);assert.equal(a.loadedTubes.starboard,true);assert.equal(game.torpedoOrders.length,0);
});
test('a consecutive broadside against the same target gets +3 on either side',()=>{
    const {game,ship}=setup();const a=ship(1,'MGB',800,800),t=ship(2,'TANKER',1000,800);
    game.phase='FIRE_FIRST';game.selectedShip=a;game.selectedTarget=t;game.fireGuns();const first=game.pendingDamage[0].damage;
    t.x=600;game.turn=2;game.phase='FIRE_SECOND';a.hasFired=false;game.selectedTarget=t;game.fireGuns();
    assert.equal(game.pendingDamage[1].damage,first+3);
});
test('a contact can be reacquired after leaving an illuminated area',()=>{
    const {game,ship}=setup(6);game.visibilityMode='NIGHT';game.moonlightFactor=1;game.turn=4;game.phase='SIGHTING';
    const a=ship(1,'MTB',400,1000),t=ship(2,'E_BOAT',400,100);t.currentSpeed=30;t.firedOnTurn=4;
    game.contacts.set('British:2',{faction:'British',targetId:2,observerId:1,turn:2,illuminated:true});
    game.selectedShip=a;game.selectedTarget=t;assert.equal(game.canEngage(a,t),false);
    assert.equal(game.attemptSighting(),true);game.turn=5;assert.equal(game.canEngage(a,t),true);
});
