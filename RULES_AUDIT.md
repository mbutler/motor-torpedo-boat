# Rules audit

Source: `MTB.pdf`, checked against `datalab-output-MTB.pdf.md` and `.html`. Page references below use the printed rulebook page numbers. This records the rules completion pass before the visual overhaul.

## Implemented coverage

| Printed pages | Systems checked and implemented |
| --- | --- |
| 2–3 | All three scenario fleets, merchant ownership, transport-card selection, setup and encounter attacker selection |
| 4–5 | Ten moves, alternating phasing side, orders and stages, acceleration/deceleration, start/end turns, turning movement, range and firing arcs, victory scoring |
| 6–9 | Gun tables and modifiers, target size, repeat-target bonus, intervening ships, accumulated stage-9 damage, every ship's damage bands, equipment losses, delayed speed losses and fire |
| 10–11 | Depth-charge declarations, stern-path drop markers, shared defender roll, depth/distance effects and torpedo ammunition/declarations |
| 12–13 | Torpedo modifiers, ordered interception, delayed sinking, paired ramming factors, both vessels' modifiers, intentional rams, head-on avoidance, locks and explosions |
| 14–16 | Mist/fog patches, night moon and sighting, contact delays, illumination inventory and persistence, optional torpedo visibility modifiers |
| Component sheet | Rotated counter footprints, transport forward/astern batteries, range ruler and turning/firing fans |

## Corrections confirmed from the PDF

- Gun weapon factors select table columns; they are not added again to damage.
- Damage is accumulated and applied in stage 9, with equipment and subsequent-move effects following the correct bands.
- MTB fire-risk bands are 49–40 and 29–20; 39–30 damages torpedo equipment. The penultimate band includes fire risk and turn-away.
- The ramming vessel has its own modifier column, omitted by the OCR. Both vessels receive separate rolls and factors.
- Depth-charge discharger damage rolls 1–2 affect port and 3–4 affect starboard.
- Transport cards 3–4 carry forward guns; cards 1–2 carry astern guns, as shown on the counter sheet.
- Turning spends movement distance while combat still uses actual speed. Range and arcs use rotated counter geometry.
- Night automatic sighting uses three inches per moon point. Illumination stays at its launch location for two moves.

## Adopted interpretations

These are the adopted rules for this digital version, resolving typos, missing bounds and insufficient geometric detail in the source. They are settled implementation decisions, not pending approvals or blockers.

Interpretation policy: preserve explicit printed rules and tables. When the source is ambiguous, choose the reading most consistent with neighboring rules, the game's intended tactical behavior and a playable, deterministic implementation. Prefer the smallest correction that closes a gap; avoid adding exceptions or changing balance without evidence. Resolve future ambiguities using this policy without holding up development. Revisit an adopted interpretation if clearer source evidence or a demonstrated gameplay problem warrants it.

| Issue | Implemented interpretation |
| --- | --- |
| MTB band printed `10–10` | Read as 19–10, filling the gap between 29–20 and 9–1. |
| Tanker final band printed 24–11 | Extend its dead-in-water band through 1; it sinks at zero. No extra equipment effect is invented. |
| Counter/fan scan | Rounded physical footprints calibrated from the printed ruler; 18-degree turn points, forward/astern half-arcs of 54 degrees and broadside half-arcs of 27 degrees. Scan calibration limits geometric precision. |
| Defender setup described as the middle of one end | Use the central half of table width and near third of table length. Attackers' entire counters must be within ten inches of their baseline. |
| Encounter dice tie | Reroll both sides until an attacker is determined. |
| Overlapping night speed bands at ten knots | Use the “ten knots or less” modifier at ten. |
| Multiple depth-charge attackers | One defender die; each attacking drop contributes charge, distance and depth factors, with target speed counted once. One charge per working discharger. No extra maximum range is imposed. |
| Nonphasing depth-charge movement | Move declared attackers before stage-3 resolution and skip their second movement in stage 4, reconciling the full attacking move with the stage order. |
| Half-counter firing eligibility | Measure counter area inside the arc; at short range at least half must be covered. |
| Mist and fog | Apply the printed mist gun modifiers globally; patches govern sight lines. Fog blocks covered sight lines beyond 25 yards and adds the printed torpedo modifier, without an invented gun-damage modifier. |
| Optional torpedo declarations | Require observation on the preceding move; there is no previous observation on move 1. |
| Intervening tanker | Treat as a transport/capital ship for automatic torpedo interception. |
| Head-on avoidance | Separate the overlapping counters sideways without ram damage. |
| Explosion distance | Use a radius around the exploding ship's center; the source does not specify a measurement anchor. |
| Buoyancy-loss scoring | Sum a fleet's eligible losses, then award one point per full ten lost. |
| Table exits | Ordinary ships may leave and reenter without wrapping or automatic sinking; they cannot fire while outside. A turn-away ship fully crossing its own baseline is withdrawn and still counts as afloat. |

## Verification and limits

`node --test tests/rules.test.cjs`: 79 tests pass, including 6,480 gun-table combinations, target-size checks and twelve complete ten-move simulations (three scenarios × four visibility modes). Tests also cover combat boundaries, curved drop paths, ammunition cancellation, deferred damage, delayed sinking, fire timing, ramming, contacts, illumination and final scoring.

Browser checks covered setup validation, editable speed/turn timing, phase progression, night sighting and fog-patch setup, with no browser errors observed. These checks establish implementation consistency with the adopted rules above. Scan measurements remain approximate, but the documented calibration is the working geometry for this version. Source ambiguities are resolved by the adopted interpretations and do not block the visual overhaul.
