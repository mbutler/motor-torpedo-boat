const SHIP_TYPES = {
    // British
    MTB: {
        name: "MTB",
        faction: "British",
        buoyancy: 75,
        points: 40,
        maxSpeed: 40,
        torpedoes: 2,
        depthCharges: 0,
        weapons: { broadside: 30, forward: 20, astern: 40 },
        color: "#c0392b", // Red base
        size: { width: 20, length: 40 },
        starLongRange: true,
        fireRiskMod: -2,
        damageBands: [
            { min: 60, max: 75, speedDice: 1, weapons: { broadside: 30, forward: 20, astern: 40 }, actions: ["fireRisk", "torpedoDamage"] },
            { min: 50, max: 59, speedDice: 1, weapons: { broadside: 30, forward: 20, astern: 35 }, actions: [] },
            { min: 40, max: 49, speedDice: 1, weapons: { broadside: 25, forward: 15, astern: 35 }, actions: [] },
            { min: 30, max: 39, speedDice: 2, weapons: { broadside: 20, forward: 15, astern: 30 }, actions: [] },
            { min: 20, max: 29, speedDice: 3, weapons: { broadside: 15, forward: 10, astern: 25 }, actions: [] },
            { min: 10, max: 19, speedDice: 3, weapons: { broadside: 10, forward: 5, astern: 15 }, actions: [] },
            { min: 1,  max: 9,  speedDice: 0, weapons: { broadside: 5, forward: 0, astern: 10 }, actions: ["deadInWater"] }
        ]
    },
    MGB: {
        name: "MGB",
        faction: "British",
        buoyancy: 117,
        points: 50,
        maxSpeed: 30,
        torpedoes: 0,
        depthCharges: 22,
        weapons: { broadside: 100, forward: 80, astern: 80 },
        color: "#c0392b",
        size: { width: 22, length: 45 },
        starLongRange: true,
        fireRiskMod: -2,
        damageBands: [
            { min: 90, max: 117, speedDice: 0, weapons: { broadside: 100, forward: 80, astern: 80 }, actions: [] },
            { min: 70, max: 89,  speedDice: 1, weapons: { broadside: 95, forward: 75, astern: 75 }, actions: [] },
            { min: 50, max: 69,  speedDice: 1, weapons: { broadside: 85, forward: 65, astern: 75 }, actions: ["fireRisk"] },
            { min: 30, max: 49,  speedDice: 2, weapons: { broadside: 75, forward: 60, astern: 65 }, actions: [] },
            { min: 20, max: 29,  speedDice: 2, weapons: { broadside: 65, forward: 55, astern: 60 }, actions: ["depthChargeDamage"] },
            { min: 15, max: 19,  speedDice: 3, weapons: { broadside: 45, forward: 35, astern: 40 }, actions: ["fireRisk", "turnAway"] },
            { min: 1,  max: 14,  speedDice: 0, weapons: { broadside: 30, forward: 20, astern: 30 }, actions: ["deadInWater"] }
        ]
    },
    BRITISH_TRAWLER: {
        name: "Trawler (Br)",
        faction: "British",
        buoyancy: 160,
        points: 40,
        maxSpeed: 15,
        torpedoes: 0,
        depthCharges: 0,
        weapons: { broadside: 40, forward: 30, astern: 10 },
        color: "#c0392b",
        size: { width: 30, length: 60 },
        starLongRange: true,
        fireRiskMod: 1,
        damageBands: [
            { min: 100, max: 160, speedDice: 0, weapons: { broadside: 40, forward: 30, astern: 10 }, actions: [] },
            { min: 75,  max: 99,  speedDice: 0, weapons: { broadside: 35, forward: 25, astern: 10 }, actions: [] },
            { min: 50,  max: 74,  speedDice: 1, weapons: { broadside: 30, forward: 20, astern: 10 }, actions: [] },
            { min: 30,  max: 49,  speedDice: 0, weapons: { broadside: 25, forward: 15, astern: 10 }, actions: ["fireRisk"] },
            { min: 15,  max: 29,  speedDice: 2, weapons: { broadside: 15, forward: 15, astern: 0 }, actions: ["fireRisk"] },
            { min: 1,   max: 14,  speedDice: 0, weapons: { broadside: 10, forward: 10, astern: 0 }, actions: ["deadInWater"] }
        ]
    },

    // German
    E_BOAT: {
        name: "E-Boat",
        faction: "German",
        buoyancy: 115,
        points: 45,
        maxSpeed: 40,
        torpedoes: 2,
        depthCharges: 0,
        weapons: { broadside: 60, forward: 40, astern: 50 },
        color: "#2c3e50", // Black base (dark grey)
        size: { width: 20, length: 45 },
        starLongRange: false,
        fireRiskMod: -2,
        damageBands: [
            { min: 100, max: 135, speedDice: 0, weapons: { broadside: 60, forward: 40, astern: 50 }, actions: [] },
            { min: 80,  max: 99,  speedDice: 1, weapons: { broadside: 55, forward: 35, astern: 50 }, actions: [] },
            { min: 60,  max: 79,  speedDice: 1, weapons: { broadside: 50, forward: 25, astern: 40 }, actions: ["fireRisk"] },
            { min: 40,  max: 59,  speedDice: 2, weapons: { broadside: 45, forward: 25, astern: 35 }, actions: ["torpedoDamage", "depthChargeDamage"] },
            { min: 30,  max: 39,  speedDice: 2, weapons: { broadside: 35, forward: 15, astern: 30 }, actions: [] },
            { min: 20,  max: 29,  speedDice: 3, weapons: { broadside: 25, forward: 15, astern: 20 }, actions: ["fireRisk"] },
            { min: 15,  max: 19,  speedDice: 3, weapons: { broadside: 25, forward: 10, astern: 15 }, actions: ["turnAway"] },
            { min: 1,   max: 14,  speedDice: 0, weapons: { broadside: 15, forward: 10, astern: 10 }, actions: ["deadInWater"] }
        ]
    },
    R_BOAT: {
        name: "R-Boat",
        faction: "German",
        buoyancy: 135,
        points: 32,
        maxSpeed: 24,
        torpedoes: 0,
        depthCharges: 4,
        weapons: { broadside: 60, forward: 40, astern: 50 },
        color: "#2c3e50",
        size: { width: 25, length: 50 },
        starLongRange: true,
        fireRiskMod: -1,
        damageBands: [
            { min: 100, max: 135, speedDice: 0, weapons: { broadside: 60, forward: 40, astern: 50 }, actions: [] },
            { min: 80,  max: 99,  speedDice: 1, weapons: { broadside: 55, forward: 35, astern: 50 }, actions: [] },
            { min: 60,  max: 79,  speedDice: 1, weapons: { broadside: 50, forward: 25, astern: 40 }, actions: ["fireRisk"] },
            { min: 40,  max: 59,  speedDice: 2, weapons: { broadside: 45, forward: 25, astern: 35 }, actions: ["torpedoDamage", "depthChargeDamage"] },
            { min: 30,  max: 39,  speedDice: 2, weapons: { broadside: 35, forward: 15, astern: 30 }, actions: [] },
            { min: 20,  max: 29,  speedDice: 3, weapons: { broadside: 25, forward: 15, astern: 20 }, actions: ["fireRisk"] },
            { min: 15,  max: 19,  speedDice: 3, weapons: { broadside: 25, forward: 10, astern: 15 }, actions: ["turnAway"] },
            { min: 1,   max: 14,  speedDice: 0, weapons: { broadside: 15, forward: 10, astern: 10 }, actions: ["deadInWater"] }
        ]
    },
    GERMAN_TRAWLER: {
        name: "Trawler (Ger)",
        faction: "German",
        buoyancy: 120,
        points: 40,
        maxSpeed: 15,
        torpedoes: 0,
        depthCharges: 6,
        weapons: { broadside: 40, forward: 30, astern: 10 },
        color: "#2c3e50",
        size: { width: 30, length: 60 },
        starLongRange: true,
        fireRiskMod: 1,
        damageBands: [
            { min: 100, max: 160, speedDice: 0, weapons: { broadside: 40, forward: 30, astern: 10 }, actions: [] },
            { min: 75,  max: 99,  speedDice: 0, weapons: { broadside: 35, forward: 25, astern: 10 }, actions: [] },
            { min: 50,  max: 74,  speedDice: 1, weapons: { broadside: 30, forward: 20, astern: 10 }, actions: [] },
            { min: 30,  max: 49,  speedDice: 0, weapons: { broadside: 25, forward: 15, astern: 10 }, actions: ["fireRisk"] },
            { min: 15,  max: 29,  speedDice: 2, weapons: { broadside: 15, forward: 15, astern: 0 }, actions: ["fireRisk"] },
            { min: 1,   max: 14,  speedDice: 0, weapons: { broadside: 10, forward: 10, astern: 0 }, actions: ["deadInWater"] }
        ]
    },
    TRANSPORT: {
        name: "Transport",
        faction: "German",
        buoyancy: 180,
        points: 75,
        maxSpeed: 18,
        torpedoes: 0,
        depthCharges: 0,
        weapons: { broadside: 20, forward: 20, astern: 20 },
        color: "#2c3e50",
        size: { width: 40, length: 80 },
        starLongRange: true,
        fireRiskMod: 1,
        damageBands: [
            { min: 100, max: 180, speedDice: 0, weapons: { broadside: 20, forward: 20, astern: 20 }, actions: [] },
            { min: 50,  max: 99,  speedDice: 1, weapons: { broadside: 15, forward: 15, astern: 15 }, actions: ["fireRisk"] },
            { min: 25,  max: 49,  speedDice: 0, weapons: { broadside: 10, forward: 10, astern: 10 }, actions: [] },
            { min: 10,  max: 24,  speedDice: 2, weapons: { broadside: 5, forward: 5, astern: 5 }, actions: ["fireRisk"] },
            { min: 1,   max: 9,   speedDice: 0, weapons: { broadside: 0, forward: 0, astern: 0 }, actions: ["deadInWater"] }
        ]
    },
    TANKER: {
        name: "Tanker",
        faction: "German",
        buoyancy: 270,
        points: 120,
        maxSpeed: 18,
        torpedoes: 0,
        depthCharges: 0,
        weapons: { broadside: 20, forward: 20, astern: 0 },
        color: "#2c3e50",
        size: { width: 45, length: 90 },
        starLongRange: true,
        fireRiskMod: -3,
        damageBands: [
            { min: 200, max: 270, speedDice: 0, weapons: { broadside: 20, forward: 20, astern: 0 }, actions: [] },
            { min: 100, max: 199, speedDice: 1, weapons: { broadside: 15, forward: 15, astern: 0 }, actions: ["fireRisk"] },
            { min: 50,  max: 99,  speedDice: 0, weapons: { broadside: 10, forward: 10, astern: 0 }, actions: ["fireRisk"] },
            { min: 25,  max: 49,  speedDice: 2, weapons: { broadside: 5, forward: 5, astern: 0 }, actions: ["fireRisk"] },
            { min: 11,  max: 24,  speedDice: 0, weapons: { broadside: 0, forward: 0, astern: 0 }, actions: ["deadInWater"] }
        ]
    },
    F_LIGHTER: {
        name: "F-Lighter",
        faction: "German",
        buoyancy: 80,
        points: 25,
        maxSpeed: 10,
        torpedoes: 0,
        depthCharges: 0,
        weapons: { broadside: 50, forward: 70, astern: 40 },
        color: "#2c3e50",
        size: { width: 30, length: 70 },
        starLongRange: true,
        fireRiskMod: 2,
        damageBands: [
            { min: 50, max: 80, speedDice: 0, weapons: { broadside: 50, forward: 70, astern: 40 }, actions: [] },
            { min: 25, max: 49, speedDice: 0, weapons: { broadside: 35, forward: 60, astern: 40 }, actions: ["fireRisk"] },
            { min: 15, max: 24, speedDice: 1, weapons: { broadside: 35, forward: 55, astern: 25 }, actions: [] },
            { min: 10, max: 14, speedDice: 0, weapons: { broadside: 30, forward: 45, astern: 20 }, actions: ["fireRisk"] },
            { min: 1,  max: 9,  speedDice: 0, weapons: { broadside: 20, forward: 30, astern: 10 }, actions: ["deadInWater"] }
        ]
    }
};

const SCALE = {
    PIXELS_PER_KNOT: 5,  // 1 knot = 5mm = 5px (approx)
    PIXELS_PER_10_YARDS: 25 // 10 yards = 25mm = 25px
};

