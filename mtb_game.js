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
        
        this.isDestroyed = false;
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

        this.deadInWater = false;
        this.lockedWith = null;
        this.lockTimer = 0;
        this.rudderJamTurns = 0;
    }

    draw(ctx, isSelected, isTarget) {
        if (this.isDestroyed) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.heading * Math.PI) / 180);

        // Draw Ship Body
        ctx.fillStyle = this.type.color;
        ctx.strokeStyle = isSelected ? "#f1c40f" : (isTarget ? "#e74c3c" : "#fff");
        ctx.lineWidth = (isSelected || isTarget) ? 3 : 1;

        // Simple boat shape
        ctx.beginPath();
        const w = this.type.size.width;
        const l = this.type.size.length;
        
        // Pointy front
        ctx.moveTo(0, -l/2); 
        ctx.lineTo(w/2, -l/4);
        ctx.lineTo(w/2, l/2);
        ctx.lineTo(-w/2, l/2);
        ctx.lineTo(-w/2, -l/4);
        ctx.closePath();
        
        ctx.fill();
        ctx.stroke();
        
        // FIRE EFFECT
        if (this.isOnFire) {
            ctx.fillStyle = "rgba(231, 76, 60, 0.7)";
            ctx.beginPath();
            ctx.arc(0, 0, w/1.5, 0, Math.PI*2);
            ctx.fill();
        }

        // Direction Indicator (Wake)
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.moveTo(0, l/2);
        ctx.lineTo(0, l/2 + this.currentSpeed * 2); // Visual wake
        ctx.stroke();

        ctx.restore();

        // Target Indicator (Crosshair) if Target
        if (isTarget) {
             ctx.strokeStyle = "#e74c3c";
             ctx.lineWidth = 2;
             ctx.beginPath();
             ctx.arc(this.x, this.y, 40, 0, Math.PI * 2);
             ctx.stroke();
        }

        // Health Bar
        if (isSelected || isTarget || this.currentBuoyancy < this.type.buoyancy) {
            ctx.fillStyle = "red";
            ctx.fillRect(this.x - 15, this.y - 30, 30, 4);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(this.x - 15, this.y - 30, 30 * (this.currentBuoyancy / this.type.buoyancy), 4);
        }
        
        // Name Label
        ctx.fillStyle = "#fff";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        let label = this.type.name;
        if (this.isOnFire) label += " (FIRE!)";
        ctx.fillText(label, this.x, this.y + 30);
    }

    // 1 Point = 11.25 degrees
    applyOrders() {
        if (this.isDestroyed) return;
        if (this.deadInWater) {
            this.currentSpeed = 0;
            return;
        }
        if (this.lockedWith) {
            if (this.lockTimer > 0) this.lockTimer -= 1;
            // Unlock after one locked turn
            if (this.lockTimer <= 0) {
                if (this.lockedWith && this.lockedWith.lockedWith === this) {
                    this.lockedWith.lockedWith = null;
                    this.lockedWith.lockTimer = 0;
                }
                this.lockedWith = null;
            }
            // Locked ships cannot move this turn
            this.currentSpeed = 0;
            return;
        }

        // Apply Turn
        let appliedTurn = this.orderedTurn;
        if (this.rudderJamTurns > 0) {
            appliedTurn = 0;
            this.rudderJamTurns -= 1;
        }
        // Compulsory turn away: face away from nearest enemy or toward own baseline
        if (this.compulsoryAction === "TURN_AWAY") {
            const enemy = this.findNearestEnemy && this.findNearestEnemy();
            if (enemy) {
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                let bearing = Math.atan2(dy, dx) * 180 / Math.PI + 90;
                if (bearing < 0) bearing += 360;
                let away = bearing + 180;
                if (away >= 360) away -= 360;
                this.heading = away;
            } else {
                // fallback: head to baseline
                if (this.baseY > this.y) this.heading = 180;
                else this.heading = 0;
            }
            appliedTurn = 0;
            // Force best possible speed toward baseline
            this.orderedSpeed = this.type.maxSpeed;
            this.compulsoryAction = null; // fulfilled
        }

        const turnDegrees = appliedTurn * 11.25;
        this.heading += turnDegrees;

        // Calculate Cost of Turn
        // Rule: "Each point turn that a ship makes will be the equivalent of three knots in speed."
        const speedCost = Math.abs(this.orderedTurn) * 3;

        // Effective Speed
        // Enforce speed change limits: +20 / -10 per move unless damage
        const prevSpeed = this.currentSpeed;
        const maxUp = prevSpeed + 20;
        const maxDown = Math.max(prevSpeed - 10, 0);
        const requested = this.orderedSpeed;
        const limitedRequested = Math.min(Math.max(requested, maxDown), maxUp);

        let effectiveSpeed = limitedRequested - speedCost;
        if (effectiveSpeed < 0) effectiveSpeed = 0;
        
        // Apply Speed Reduction from Damage (Dice roll previously stored)
        if (this.speedReducedDice > 0) {
            let reduction = 0;
            for(let i=0; i<this.speedReducedDice; i++) {
                reduction += Math.floor(Math.random() * 6) + 1;
            }
            effectiveSpeed -= reduction;
            this.speedReducedDice = 0; 
        }

        if (effectiveSpeed < 0) effectiveSpeed = 0;

        // Cap Speed at Max
        effectiveSpeed = Math.min(effectiveSpeed, this.type.maxSpeed);
        this.currentSpeed = effectiveSpeed; // Store effective speed for combat calc

        // Move
        const moveDistance = effectiveSpeed * SCALE.PIXELS_PER_KNOT;
        const rad = (this.heading - 90) * Math.PI / 180; 
        
        this.x += Math.cos(rad) * moveDistance;
        this.y += Math.sin(rad) * moveDistance;

        // Keep in bounds
        this.x = Math.max(0, Math.min(800, this.x));
        this.y = Math.max(0, Math.min(600, this.y));
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
        this.phase = 'ORDERS'; // ORDERS, EXECUTE, COMBAT
        this.logEl = document.getElementById('log');
        this.visibilityMode = 'CLEAR'; // CLEAR | MIST | FOG | NIGHT
        this.moonlightFactor = 3; // updates on odd turns at night
        this.baselineY = { British: 600, German: 0 };

        // UI Binding
        this.btnNextPhase = document.getElementById('next-phase-btn');
        this.btnNextPhase.onclick = () => this.nextPhase();
        
        this.panelOrders = document.getElementById('ship-orders');
        this.inpSpeed = document.getElementById('speed-input');
        this.inpTurn = document.getElementById('turn-input');
        
        this.inpSpeed.onchange = (e) => this.updateOrder('speed', e.target.value);
        this.inpTurn.onchange = (e) => this.updateOrder('turn', e.target.value);

        // Combat Buttons
        this.btnFire = document.getElementById('fire-btn');
        this.btnTorpedo = document.getElementById('torpedo-btn');
        this.btnDepth = document.getElementById('depth-btn');
        this.btnIllum = document.getElementById('illum-btn');
        
        this.btnFire.onclick = () => this.fireGuns();
        this.btnTorpedo.onclick = () => this.fireTorpedo();
        this.btnDepth.onclick = () => this.depthChargeAttack();
        this.btnIllum.onclick = () => this.illuminateTarget();

        this.canvas.onclick = (e) => this.handleClick(e);

        // Visibility select
        const visSel = document.getElementById('visibility-select');
        visSel.onchange = (e) => {
            this.visibilityMode = e.target.value;
            this.log(`Visibility set to ${this.visibilityMode}`);
        };
        this.dcDepthSel = document.getElementById('dc-depth-select');

        this.init();
        this.loop();
    }

    log(msg) {
        const p = document.createElement('div');
        p.textContent = `T${this.turn}: ${msg}`;
        this.logEl.prepend(p);
    }

    init() {
        // Scenario 1: Standard Setup
        // British Attackers
        this.ships.push(new Ship(1, SHIP_TYPES.MTB, 100, 500, 0)); // 0 = Up
        this.ships.push(new Ship(2, SHIP_TYPES.MTB, 150, 520, 0));
        this.ships.push(new Ship(3, SHIP_TYPES.MGB, 200, 500, 0));
        
        // German Defenders (Convoy + Escort)
        this.ships.push(new Ship(4, SHIP_TYPES.TRANSPORT, 400, 100, 180)); // 180 = Down
        this.ships.push(new Ship(5, SHIP_TYPES.TANKER, 480, 120, 180));
        this.ships.push(new Ship(6, SHIP_TYPES.E_BOAT, 350, 200, 180));
        this.ships.push(new Ship(7, SHIP_TYPES.E_BOAT, 500, 200, 180));

        // assign baselines
        this.ships.forEach(s => {
            s.baseY = this.baselineY[s.type.faction] || 0;
        });

        this.log("Game Start. British (Red) vs German (Black).");
    }

    updateUI() {
        document.getElementById('turn-number').textContent = this.turn;
        document.getElementById('phase-name').textContent = this.phase;

        if (this.selectedShip) {
            this.panelOrders.classList.remove('hidden');
            document.getElementById('selected-ship-name').textContent = `${this.selectedShip.type.name} (#${this.selectedShip.id})`;
            
            // Update Speed Input Max based on Ship Type
            this.inpSpeed.max = this.selectedShip.type.maxSpeed;
            this.inpSpeed.value = this.selectedShip.orderedSpeed;
            
            this.inpTurn.value = this.selectedShip.orderedTurn;

            // Combat Buttons State
            if (this.phase === 'COMBAT') {
                const hasTarget = this.selectedTarget !== null;
                // Cannot fire if on fire
                const canFire = !this.selectedShip.hasFired && !this.selectedShip.isOnFire;
                
                this.btnFire.disabled = !hasTarget || !canFire;
                this.btnTorpedo.disabled = !hasTarget || !canFire || this.selectedShip.type.torpedoes === 0;
                const hasDC = (this.selectedShip.type.depthCharges || 0) > 0 &&
                              (this.selectedShip.depthChargeSystems.port || this.selectedShip.depthChargeSystems.starboard) &&
                              this.selectedShip.depthChargesLeft > 0;
                this.btnDepth.disabled = !hasTarget || !canFire || !hasDC;
                this.btnIllum.disabled = !hasTarget || this.selectedShip.hasFired;
            } else {
                this.btnFire.disabled = true;
                this.btnTorpedo.disabled = true;
                this.btnDepth.disabled = true;
                this.btnIllum.disabled = true;
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
            this.selectedShip.orderedSpeed = parseInt(value);
        } else if (type === 'turn') {
            this.selectedShip.orderedTurn = parseInt(value);
        }
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Hit Detection scaled to ship size
        let clickedShip = null;
        // Search in reverse order to click "top" ships first if overlapping
        for (let i = this.ships.length - 1; i >= 0; i--) {
            const ship = this.ships[i];
            if (ship.isDestroyed) continue; // Ignore destroyed ships

            const radius = Math.max(ship.type.size.width, ship.type.size.length) / 2 + 20; // Increased click buffer
            const dx = ship.x - x;
            const dy = ship.y - y;
            if (Math.hypot(dx, dy) <= radius) {
                clickedShip = ship;
                break;
            }
        }

        if (clickedShip) {
            if (this.phase === 'COMBAT') {
                // Combat Phase Selection Logic:
                // 1. If no ship selected, select clicked ship as Attacker.
                // 2. If clicked ship is same faction as current Attacker, switch Attacker to clicked ship.
                // 3. If clicked ship is different faction, set as Target.
                
                if (!this.selectedShip || clickedShip.type.faction === this.selectedShip.type.faction) {
                    this.selectedShip = clickedShip;
                    this.selectedTarget = null; // Reset target when switching attacker
                } else {
                    this.selectedTarget = clickedShip;
                    this.log(`Targeting ${clickedShip.type.name} (#${clickedShip.id})`);
                }
            } else {
                // ORDERS/EXECUTE: Allow selecting any ship to view orders/status
                this.selectedShip = clickedShip;
                this.selectedTarget = null;
            }
        } else {
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


    findNearestEnemy() {
        if (!this.selectedShip) return null;
        const me = this.selectedShip;
        let best = null;
        let bestDist = Infinity;
        for (const s of this.ships) {
            if (s.isDestroyed) continue;
            if (s.type.faction === me.type.faction) continue;
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

    nextPhase() {
        if (this.phase === 'ORDERS') {
            this.phase = 'EXECUTE';
            this.log("Executing Movement...");
            this.executeMovement();
        } else if (this.phase === 'EXECUTE') {
            this.phase = 'COMBAT';
            this.log("Combat Phase. Select your ship, then click an enemy to fire.");
        } else if (this.phase === 'COMBAT') {
            this.endTurn();
        }
        this.updateUI();
    }

    executeMovement() {
        // Animate movement (instant for now)
        this.ships.forEach(ship => {
            if (ship.isDestroyed) return;

            // Log Order in Rulebook Nomenclature
            // Example: "4P ST 30K"
            let orderParts = [];
            
            if (ship.orderedTurn !== 0) {
                const points = Math.abs(ship.orderedTurn);
                const dir = ship.orderedTurn > 0 ? "ST" : "PT"; // ST=Starboard, PT=Port
                orderParts.push(`${points}P ${dir}`);
            }
            
            orderParts.push(`${ship.orderedSpeed}K`);
            
            this.log(`${ship.type.name} (#${ship.id}): ${orderParts.join(' ')}`);

            ship.applyOrders();
        });

        this.resolveRamming();

        // Auto-advance
        setTimeout(() => this.nextPhase(), 500); 
    }

    fireGuns() {
        const attacker = this.selectedShip;
        const target = this.selectedTarget;
        
        if (!attacker || !target) return;

        if (attacker.hasFired) {
            this.log("This ship has already fired this turn!");
            return;
        }

        if (attacker.lockedWith) {
            this.log("Locked in ram — cannot fire.");
            return;
        }

        if (this.visibilityMode !== 'CLEAR') {
            // Sighting check: at most 2 attempts per side per move (simplified: always allow first)
            const distPixels = Math.hypot(target.x - attacker.x, target.y - attacker.y);
            const distYards = (distPixels / SCALE.PIXELS_PER_10_YARDS) * 10;
            const seen = this.sightingCheck(attacker, target, distYards);
            if (!seen) {
                this.log("Target not sighted/illuminated; cannot fire.");
                return;
            }
        }

        if (attacker.isOnFire) {
             this.log("Ship is ON FIRE and cannot fire weapons!");
             return;
        }
        
        // Distance
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distPixels = Math.sqrt(dx*dx + dy*dy);
        const distYards = (distPixels / SCALE.PIXELS_PER_10_YARDS) * 10;

        // Calculate Bearing relative to Ship Heading
        let angleToTarget = Math.atan2(dy, dx) * 180 / Math.PI; // -180 to 180
        let bearing = angleToTarget + 90; 
        if (bearing < 0) bearing += 360;
        if (bearing >= 360) bearing -= 360;

        let relativeBearing = bearing - attacker.heading;
        while (relativeBearing < 0) relativeBearing += 360;
        while (relativeBearing >= 360) relativeBearing -= 360;

        // Arcs of Fire
        let arcName = "BROADSIDE";
        let weaponFactor = attacker.currentWeapons.broadside;

        if (relativeBearing >= 315 || relativeBearing < 45) {
            arcName = "FORWARD";
            weaponFactor = attacker.currentWeapons.forward;
        } else if (relativeBearing >= 135 && relativeBearing < 225) {
            arcName = "ASTERN";
            weaponFactor = attacker.currentWeapons.astern;
        } else {
            arcName = "BROADSIDE";
            weaponFactor = attacker.currentWeapons.broadside;
        }

        // Visibility modifiers
        const visMod = this.getVisibilityFireMod(distYards);

        this.log(`${attacker.type.name} fires ${arcName} guns at ${target.type.name}. Range: ${Math.floor(distYards)} yds. VisMod ${visMod}`);

        // --- FULL COMBAT CALCULATION ---

        // Over 500 yards long range rule
        if (distYards > 500 && (arcName === "FORWARD" || arcName === "BROADSIDE")) {
            if (attacker.type.starLongRange) {
                weaponFactor = Math.floor(weaponFactor / 2);
            } else {
                weaponFactor = 0; // cannot engage
            }
        }

        // Overhead firing restriction
        const over = this.findInterveningShip(attacker, target);
        if (over) {
            const overName = over.type.name.toUpperCase();
            const attName = attacker.type.name.toUpperCase();
            const distOT = Math.hypot(over.x - target.x, over.y - target.y);
            const within10in = distOT <= 250; // 10\" = 250px
            const attIsMerchant = attName.includes("TRANSPORT") || attName.includes("TANKER");
            const overIsMerchant = overName.includes("TRANSPORT") || overName.includes("TANKER");
            if (over.isOnFire) {
                this.log("Cannot fire over a ship on fire.");
                return;
            }
            if (overIsMerchant || overName.includes("TRAWLER")) {
                if (!attIsMerchant || within10in) {
                    this.log("Overhead firing blocked by intervening ship.");
                    return;
                }
            }
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
        let totalDamage = weaponFactor + speedFactor + sizeFactor + rangeFactor + randomFactor;
        
        // Log calculation details
        // console.log(`Calc: WF(${weaponFactor}) + Spd(${speedFactor}) + Sz(${sizeFactor}) + Rng(${rangeFactor}) + Rnd(${randomFactor} from dice ${diceRoll}) = ${totalDamage}`);

        if (totalDamage > 0) {
            this.applyDamageResults(target, totalDamage, diceRoll);
        } else {
            this.log(`Miss! (Damage <= 0). Dice: ${diceRoll}`);
        }

        attacker.hasFired = true;
        this.selectedTarget = null;
        this.updateUI();
    }

    applyDamageResults(target, damage, diceRoll) {
        target.currentBuoyancy -= damage;
        this.log(`Hit! Damage: ${damage}. Target Buoyancy: ${target.currentBuoyancy}`);

        if (target.currentBuoyancy <= 0) {
            target.isDestroyed = true;
            this.log(`${target.type.name} SINKING!`);
            return;
        }

        const band = this.lookupDamageBand(target);
        if (!band) return;

        // Update weapon factors to band values (degrade)
        target.currentWeapons = { ...band.weapons };

        // Speed reduction dice applies next move
        target.speedReducedDice = band.speedDice || 0;

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
        if (ship.isOnFire) return;
        const mod = ship.type.fireRiskMod || 0;
        const d1 = Math.floor(Math.random()*6)+1;
        const d2 = Math.floor(Math.random()*6)+1;
        const total = d1 + d2 + mod;
        if (total <= 5) {
            ship.isOnFire = true;
            ship.fireTimer = 0; // counts attempts
            this.log(`${ship.type.name} catches FIRE!`);
        }
    }

    rollTorpedoDamage(ship) {
        const die = Math.floor(Math.random()*6)+1;
        if (die <= 2) {
            ship.torpedoSystems.fireControl = false;
            this.log("Torpedo fire control knocked out.");
        } else if (die === 3) {
            ship.torpedoSystems.starboard = false;
            this.log("Starboard torpedo tube knocked out.");
        } else if (die === 4) {
            ship.torpedoSystems.port = false;
            this.log("Port torpedo tube knocked out.");
        } else {
            this.log("Torpedo gear intact.");
        }
    }

    rollDepthDamage(ship) {
        const die = Math.floor(Math.random()*6)+1;
        if (die <= 2) {
            ship.depthChargeSystems.port = false;
            this.log("Port depth discharger jammed.");
        } else if (die === 3) {
            ship.depthChargeSystems.starboard = false;
            this.log("Starboard depth discharger jammed.");
        } else {
            this.log("Depth charge gear intact.");
        }
    }

    fireTorpedo() {
        const attacker = this.selectedShip;
        const target = this.selectedTarget;

        if (!attacker || !target) return;
        
        if (attacker.type.torpedoes === 0) {
            this.log("This ship has no torpedoes!");
            return;
        }

        if (this.visibilityMode !== 'CLEAR') {
            const distPixels = Math.hypot(target.x - attacker.x, target.y - attacker.y);
            const distYards = (distPixels / SCALE.PIXELS_PER_10_YARDS) * 10;
            const seen = this.sightingCheck(attacker, target, distYards);
            if (!seen) {
                this.log("Target not sighted/illuminated; cannot fire torpedo.");
                return;
            }
        }

        if (!attacker.torpedoSystems.fireControl || (!attacker.torpedoSystems.port && !attacker.torpedoSystems.starboard)) {
            this.log("Torpedo systems inoperative!");
            return;
        }

        if (attacker.hasFired) {
             this.log("This ship has already fired/acted this turn!");
             return;
        }

        // Intervening ships check
        const intervening = this.findInterveningShip(attacker, target);
        if (intervening) {
            const tName = intervening.type.name.toUpperCase();
            if (tName.includes("TRANSPORT") || tName.includes("TRAWLER")) {
                this.log(`Torpedo hits intervening ${intervening.type.name}!`);
                this.applyDamageResults(intervening, 100, 0);
                attacker.hasFired = true;
                this.selectedTarget = null;
                this.updateUI();
                return;
            }
            if (tName.includes("F-LIGHTER")) {
                if (target.type.name.toUpperCase().includes("F-LIGHTER")) {
                    this.log("Torpedo hits intervening F-Lighter!");
                    this.applyDamageResults(intervening, 100, 0);
                    attacker.hasFired = true;
                    this.selectedTarget = null;
                    this.updateUI();
                    return;
                } else {
                    this.log("Torpedo passes under intervening F-Lighter.");
                }
            }
            const isWarship = (name) => name.includes("MTB") || name.includes("MGB") || name.includes("E-BOAT") || name.includes("R-BOAT");
            if (isWarship(tName) && intervening.currentSpeed >= 20) {
                this.log("Torpedo passes under fast warship intervening.");
            } else if (isWarship(tName) && target.type.name.toUpperCase().includes("TANKER")) {
                this.log("Slow warship blocks torpedo aimed at tanker — torpedo hits intervening ship!");
                this.applyDamageResults(intervening, 100, 0);
                attacker.hasFired = true;
                this.selectedTarget = null;
                this.updateUI();
                return;
            }
        }

        if (attacker.isOnFire) {
             this.log("Ship is ON FIRE and cannot fire weapons!");
             return;
        }

        // Distance
        const dx = attacker.x - target.x;
        const dy = attacker.y - target.y;
        const distPixels = Math.sqrt(dx*dx + dy*dy);
        const distYards = (distPixels / SCALE.PIXELS_PER_10_YARDS) * 10;
        
        this.log(`${attacker.type.name} fires TORPEDO at ${target.type.name}. Range: ${Math.floor(distYards)} yds.`);

        // --- TORPEDO CALCULATION (Simplified from Page 12) ---
        // Score 7+ for 1 hit.
        
        let score = 0;
        
        // Dice Roll (2 dice)
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const diceTotal = d1 + d2;
        score += diceTotal;

        // Modifiers
        // -1 per 100 yards
        score -= Math.ceil(distYards / 100);

        // Speed modifiers
        const tSpeed = target.currentSpeed;
        if (tSpeed > 30) score -= 2;
        else if (tSpeed >= 20) score -= 1;
        else if (tSpeed > 10) score += 2;
        else if (tSpeed > 0) score += 3;
        else score += 5; // Dead in water

        // Target Size
        const targetType = target.type.name;
        if (targetType.includes("Transport")) score += 1;
        if (targetType.includes("Tanker")) score += 2;
        if (targetType.includes("MTB") || targetType.includes("E-Boat")) score -= 1; // Smaller than transport

        // console.log(`Torpedo Calc: Dice(${diceTotal}) + Mods = Score ${score}`);

        if (score >= 7) {
            // HIT
            // Effect Table: 1-4 Sink, 5-6 Lose 100 Buoyancy
            const effectRoll = Math.floor(Math.random() * 6) + 1;
            this.log(`TORPEDO HIT! (Score ${score}). Effect Roll: ${effectRoll}`);
            
            if (effectRoll <= 4 && !targetType.includes("Tanker") && !targetType.includes("Transport")) {
                 target.currentBuoyancy = 0;
                 target.isDestroyed = true;
                 this.log("Target BLOWN UP and SINKS immediately!");
            } else {
                 if (effectRoll >= 5) {
                     target.currentBuoyancy -= 100;
                     this.log("Target takes MASSIVE damage (100 pts).");
                 } else {
                     target.currentBuoyancy = 0;
                     target.isDestroyed = true;
                     this.log("Target struck! Sinking...");
                 }
            }
        } else {
            this.log(`Torpedo Missed. (Score ${score} < 7)`);
        }

        attacker.hasFired = true;
        this.selectedTarget = null;
        this.updateUI();
    }

    depthChargeAttack() {
        const attacker = this.selectedShip;
        const target = this.selectedTarget;
        if (!attacker || !target) return;
        if (attacker.hasFired || attacker.isOnFire) {
            this.log("Cannot depth-charge: already acted or on fire.");
            return;
        }
        if ((attacker.type.depthCharges || 0) === 0) {
            this.log("No depth charges available.");
            return;
        }
        if (!attacker.depthChargeSystems.port && !attacker.depthChargeSystems.starboard) {
            this.log("Depth charge gear inoperative.");
            return;
        }

        // Must be near stern of target and close range
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distPixels = Math.sqrt(dx*dx + dy*dy);
        const distYards = (distPixels / SCALE.PIXELS_PER_10_YARDS) * 10;
        if (distYards > 50) {
            this.log("Too far for depth charge attack (need <=50 yds).");
            return;
        }
        // Relative bearing: attacker behind target (target sees attacker astern)
        let bearing = Math.atan2(attacker.y - target.y, attacker.x - target.x) * 180 / Math.PI + 90;
        if (bearing < 0) bearing += 360;
        let rel = bearing - target.heading;
        while (rel < 0) rel += 360;
        while (rel >= 360) rel -= 360;
        if (rel < 135 || rel > 225) {
            this.log("Depth charge requires approach from astern.");
            return;
        }

        // Settings: shallow/deep from UI
        const shallow = (this.dcDepthSel && this.dcDepthSel.value === 'SHALLOW');
        const inches = Math.ceil(distYards / 25);
        const dcRoll = () => {
            const r = Math.floor(Math.random()*6)+1;
            if (r <= 2) return -1;
            if (r <= 4) return 1;
            return 2;
        };

        // Attacker score
        let attScore = dcRoll();
        attScore += -1 * inches;
        attScore += 2 * 2; // two charges
        if (attacker.currentSpeed < 10) attScore += 2;
        else if (attacker.currentSpeed >= 10 && attacker.currentSpeed <= 20) attScore -= 1;
        else if (attacker.currentSpeed > 30) attScore -= 1;
        attScore += shallow ? 1 : -2;

        // Defender score
        let defScore = dcRoll();
        defScore += -1 * inches;
        defScore += 1 * 2; // two charges
        if (target.currentSpeed > 30) defScore -= 1;
        else if (target.currentSpeed >= 20) defScore += 1;
        else if (target.currentSpeed >= 10) defScore += 2;
        else defScore += 3;
        defScore += shallow ? 2 : -2;

        this.log(`Depth Charge attack (${shallow ? "Shallow" : "Deep"}). Attacker ${attScore}, Defender ${defScore}`);

        // Apply effects per table
        const applyDCResult = (score, ship, isAttacker) => {
            if (score <= 1) {
                if (!isAttacker) this.applyDamageResults(ship, 10, 0);
                return;
            }
            if (score === 2) {
                this.applyDamageResults(ship, isAttacker ? 10 : 15, 0);
                return;
            }
            if (score === 3) {
                this.applyDamageResults(ship, isAttacker ? 15 : 25, 0);
                return;
            }
            if (score === 4) {
                this.applyDamageResults(ship, isAttacker ? 25 : 25, 0);
                if (!isAttacker) ship.rudderJamTurns = Math.max(ship.rudderJamTurns, 2);
                return;
            }
            if (score >= 5) {
                this.applyDamageResults(ship, isAttacker ? 30 : 50, 0);
                ship.rudderJamTurns = Math.max(ship.rudderJamTurns, 2);
                if (!isAttacker) {
                    ship.deadInWater = true;
                    ship.currentSpeed = 0;
                }
            }
        };

        applyDCResult(attScore, attacker, true);
        applyDCResult(defScore, target, false);

        // consume charges
        attacker.depthChargesLeft = Math.max(attacker.depthChargesLeft - 2, 0);
        attacker.hasFired = true;
        this.selectedTarget = null;
        this.updateUI();
    }

    endTurn() {
        this.turn++;
        this.phase = 'ORDERS';
        this.ships.forEach(s => {
            s.hasFired = false;
            if (s.isOnFire) this.processFire(s);
        });
        if (this.turn > 10) {
            this.computeVictory();
            this.phase = 'GAME_OVER';
        } else {
            if (this.visibilityMode === 'NIGHT' && this.turn % 2 === 1) {
                this.moonlightFactor = Math.floor(Math.random()*6)+1;
                this.log(`Moonlight factor: ${this.moonlightFactor}`);
            }

            // Decay illumination
            this.ships.forEach(s => {
                if (s.illumTurns && s.illumTurns > 0) {
                    s.illumTurns -= 1;
                    if (s.illumTurns <= 0) s.illumTurns = 0;
                }
            });

            this.log(`Start Turn ${this.turn}`);
        }
    }

    computeVictory() {
        // Assume British = attacker, German = defender for current scenario
        let attackerScore = 0;
        let defenderScore = 0;

        const escorts = (ship) => {
            const n = ship.type.name.toUpperCase();
            return n.includes("MTB") || n.includes("MGB") || n.includes("E-BOAT") || n.includes("R-BOAT") || n.includes("TRAWLER");
        };
        const merchant = (ship) => {
            const n = ship.type.name.toUpperCase();
            return n.includes("TRANSPORT") || n.includes("TANKER") || n.includes("LIGHTER");
        };

        this.ships.forEach(s => {
            const lost = s.startingBuoyancy - Math.max(s.currentBuoyancy, 0);
            if (s.type.faction === "British") {
                attackerScore -= Math.floor(lost / 10);
            } else {
                if (escorts(s)) attackerScore += Math.floor(lost / 10);
            }
        });

        this.ships.forEach(s => {
            if (s.type.faction === "German" && s.isDestroyed) {
                attackerScore += s.type.points;
            }
            if (s.type.faction === "British" && s.isDestroyed) {
                defenderScore += s.type.points;
            }
            const lost = s.startingBuoyancy - Math.max(s.currentBuoyancy, 0);
            if (s.type.faction === "British" && escorts(s)) defenderScore -= Math.floor(lost / 10);
            if (s.type.faction === "German" && merchant(s) && !s.isDestroyed) defenderScore += s.type.points;
        });

        this.log(`GAME OVER Turn 10. Attacker Score: ${attackerScore}, Defender Score: ${defenderScore}`);
        if (attackerScore > defenderScore) this.log("Attacker Victory.");
        else if (defenderScore > attackerScore) this.log("Defender Victory.");
        else this.log("Draw.");
    }

    illuminateTarget() {
        if (!this.selectedTarget) {
            this.log("No target selected to illuminate.");
            return;
        }
        if (this.selectedShip && this.selectedShip.hasFired) {
            this.log("Already acted this turn.");
            return;
        }
        this.selectedTarget.illumTurns = 2;
        this.log(`${this.selectedTarget.type.name} illuminated for 2 moves.`);
        if (this.selectedShip) this.selectedShip.hasFired = true;
        this.updateUI();
    }

    processFire(ship) {
        if (!ship.isOnFire || ship.isDestroyed) return;
        const thresholds = [8, 10, 11]; // first, second, third move
        const attempt = Math.min(ship.fireTimer, 2);
        const required = thresholds[attempt];
        const roll = (Math.floor(Math.random()*6)+1) + (Math.floor(Math.random()*6)+1);

        if (roll >= required) {
            ship.isOnFire = false;
            ship.fireTimer = 0;
            this.log(`${ship.type.name} (#${ship.id}) FIRE EXTINGUISHED (roll ${roll} >= ${required}).`);
            return;
        }

        ship.fireTimer += 1;
        if (ship.fireTimer >= 3) {
            this.log(`${ship.type.name} (#${ship.id}) EXPLODES due to fire!`);
            this.handleExplosion(ship);
            ship.isDestroyed = true;
            return;
        } else {
            this.log(`${ship.type.name} (#${ship.id}) remains on fire (roll ${roll} < ${required}).`);
        }
    }

    handleExplosion(sourceShip) {
        const radiusPx = 125; // 50 yards * (25px/10yds) = 125
        this.ships.forEach(target => {
            if (target === sourceShip || target.isDestroyed) return;
            const dx = target.x - sourceShip.x;
            const dy = target.y - sourceShip.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist <= radiusPx) {
                const dmg = (Math.floor(Math.random()*6)+1) * 10;
                target.currentBuoyancy -= dmg;
                this.log(`${target.type.name} (#${target.id}) takes ${dmg} blast damage from explosion!`);
                if (target.currentBuoyancy <= 0) {
                    target.isDestroyed = true;
                    this.log(`${target.type.name} (#${target.id}) SINKS from blast!`);
                }
            }
        });
    }

    findInterveningShip(attacker, target) {
        const ax = attacker.x, ay = attacker.y;
        const bx = target.x, by = target.y;
        const maxDist = 15;
        const lineLen2 = (bx-ax)*(bx-ax) + (by-ay)*(by-ay);
        if (lineLen2 === 0) return null;
        for (const s of this.ships) {
            if (s === attacker || s === target || s.isDestroyed) continue;
            const px = s.x, py = s.y;
            let t = ((px-ax)*(bx-ax) + (py-ay)*(by-ay)) / lineLen2;
            t = Math.max(0, Math.min(1, t));
            const projx = ax + t*(bx-ax);
            const projy = ay + t*(by-ay);
            const dx = px - projx;
            const dy = py - projy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist <= maxDist) return s;
        }
        return null;
    }

    sightingCheck(attacker, target, distYards) {
        // Automatic sight if within 3 x moonlight factor (night) or clear day; simplified
        if (this.visibilityMode === 'CLEAR') return true;
        if (target.illumTurns && target.illumTurns > 0) return true;
        const moonFactor = this.moonlightFactor || 3;
        const autoRange = this.visibilityMode === 'NIGHT' ? moonFactor * 3 * 25 : 0; // in yards
        if (autoRange && distYards <= autoRange) return true;

        let score = 0;
        const d1 = Math.floor(Math.random()*6)+1;
        const d2 = Math.floor(Math.random()*6)+1;
        score += d1 + d2;
        score -= Math.ceil(distYards / 100);

        const tSpeed = target.currentSpeed;
        if (tSpeed >= 18 && tSpeed <= 29) score -= 1;
        else if (tSpeed >= 10 && tSpeed <= 17) score -= 2;
        else if (tSpeed <= 10) score -= 4;

        const aSpeed = attacker.currentSpeed;
        if (aSpeed > 15) score -= 2;

        if (this.visibilityMode === 'NIGHT') score += moonFactor;
        // Firing last move not tracked; skip.

        return score >= 6;
    }

    getVisibilityFireMod(distYards) {
        if (this.visibilityMode === 'CLEAR') return 0;
        const br = distYards <= 100 ? 0 : distYards <= 250 ? 1 : distYards <= 500 ? 2 : 3;
        if (this.visibilityMode === 'MIST') {
            return [-1, -2, -3, -5][br];
        }
        if (this.visibilityMode === 'FOG') {
            return [-2, -3, -4, -6][br];
        }
        if (this.visibilityMode === 'NIGHT') {
            const illum = (this.selectedTarget && this.selectedTarget.illumTurns > 0);
            if (illum) return [1, 0, -2, -3][br];
            return [-2, -4, -7, -9][br];
        }
        return 0;
    }

    resolveRamming() {
        // Simple overlap detection
        const collisions = [];
        for (let i=0; i<this.ships.length; i++) {
            const a = this.ships[i];
            if (a.isDestroyed) continue;
            for (let j=i+1; j<this.ships.length; j++) {
                const b = this.ships[j];
                if (b.isDestroyed) continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
                    collisions.push([a,b]);
                }
            }
        }

        collisions.forEach(pair => this.handleRam(pair[0], pair[1]));
    }

    handleRam(rammer, rammed) {
        // Both lock for next move
        rammer.lockedWith = rammed;
        rammed.lockedWith = rammer;
        rammer.lockTimer = 1;
        rammed.lockTimer = 1;
        rammer.currentSpeed = 0;
        rammed.currentSpeed = 0;

        // Determine ramming factors
        const factor = this.getRammingFactor(rammer, rammed);
        const revFactor = this.getRammingFactor(rammed, rammer);

        const rollRammer = (Math.floor(Math.random()*6)+1) + (Math.floor(Math.random()*6)+1);
        const rollRammed = (Math.floor(Math.random()*6)+1) + (Math.floor(Math.random()*6)+1);

        const dmgRammer = this.computeRamDamage(factor, rollRammed, rammer, rammed);
        const dmgRammed = this.computeRamDamage(revFactor, rollRammer, rammed, rammer);

        if (dmgRammer > 0) this.applyDamageResults(rammer, dmgRammer, 0);
        if (dmgRammed > 0) this.applyDamageResults(rammed, dmgRammed, 0);

        this.log(`Ramming! ${rammer.type.name} <-> ${rammed.type.name}`);
    }

    getRammingFactor(rammer, rammed) {
        const table = {
            TANKER: { MTB:12, R:15, E:15, MGB:18, TRAWLER:15, TRANSPORT:24, LIGHTER:15 },
            TRANSPORT: { MTB:15, R:18, E:18, MGB:20, TRAWLER:18, TRANSPORT:32, LIGHTER:18 },
            TRAWLER: { MTB:18, R:20, E:20, MGB:24, TRAWLER:20, TRANSPORT:35, LIGHTER:20 },
            MGB: { MTB:20, R:24, E:24, MGB:26, TRAWLER:22, TRANSPORT:38, LIGHTER:22 },
            R: { MTB:23, R:25, E:25, MGB:30, TRAWLER:24, TRANSPORT:42, LIGHTER:24 },
            E: { MTB:25, R:25, E:25, MGB:30, TRAWLER:25, TRANSPORT:45, LIGHTER:25 },
            MTB: { MTB:30, R:28, E:28, MGB:32, TRAWLER:30, TRANSPORT:50, LIGHTER:30 },
            LIGHTER: { MTB:15, R:16, E:16, MGB:18, TRAWLER:20, TRANSPORT:40, LIGHTER:20 }
        };

        const nameKey = (t) => {
            const n = t.type.name.toUpperCase();
            if (n.includes("TANKER")) return "TANKER";
            if (n.includes("TRANSPORT")) return "TRANSPORT";
            if (n.includes("TRAWLER")) return "TRAWLER";
            if (n.includes("LIGHTER")) return "LIGHTER";
            if (n.includes("MGB")) return "MGB";
            if (n.includes("R-BOAT") || n.includes("R BOAT")) return "R";
            if (n.includes("E-BOAT") || n.includes("E BOAT")) return "E";
            if (n.includes("MTB")) return "MTB";
            return "MTB";
        };

        const rKey = nameKey(rammer);
        const dKey = nameKey(rammed);
        const row = table[dKey] || table.MTB;
        const base = row ? row[rKey] : 20;
        return base;
    }

    computeRamDamage(baseFactor, oppRoll, rammed, rammer) {
        let total = baseFactor - oppRoll;

        // accidental ram
        total += 5;
        // speed bonus
        const speedOver10 = Math.max(rammer.currentSpeed - 10, 0);
        total += speedOver10;
        // dead in water modifier
        if (rammed.currentSpeed <= 0) total += 10;

        // broadside/stern approx
        const dx = rammer.x - rammed.x;
        const dy = rammer.y - rammed.y;
        let angle = Math.atan2(dy, dx) * 180/Math.PI + 90;
        if (angle < 0) angle += 360;
        let rel = angle - rammed.heading;
        while (rel < 0) rel += 360;
        while (rel >= 360) rel -= 360;
        if (rel >= 60 && rel <= 120 || rel >= 240 && rel <= 300) total += 8; // broadside
        else if (rel > 120 && rel < 240) total += 4; // stern

        return Math.max(total, 0);
    }

    loop() {
        // Clear
        this.ctx.fillStyle = "#2980b9";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid (Optional: every 100 yards = 250px)
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        this.ctx.beginPath();
        for(let x=0; x<800; x+=250) { this.ctx.moveTo(x,0); this.ctx.lineTo(x,600); }
        for(let y=0; y<600; y+=250) { this.ctx.moveTo(0,y); this.ctx.lineTo(800,y); }
        this.ctx.stroke();

        // Draw Ships
        this.ships.forEach(ship => {
            const isSelected = this.selectedShip === ship;
            const isTarget = this.selectedTarget === ship;
            ship.draw(this.ctx, isSelected, isTarget);
        });

        requestAnimationFrame(() => this.loop());
    }
}

// Start Game
window.onload = () => {
    const game = new Game();
};
