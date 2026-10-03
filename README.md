# MTB Commander

A local, two-sided browser implementation of the tabletop game *MTB*. Open `index.html`, or run `python3 -m http.server 8765` and visit `http://localhost:8765`.

## Playing

Choose German convoy, British convoy, or warship encounter, then choose visibility. During setup, use Perspective to position both fleets; select a ship and click the table to move its counter. Set its heading with the setup control. Mist and fog require one patch from each side. Begin the battle after setup is valid.

Each move follows the printed sequence: movement and attack orders; illumination and torpedo declarations; phasing movement; depth charges; other-side movement; first-side guns; second-side guns; torpedoes; ramming; accumulated damage. Night games then allow two sighting attempts per side. The attacker phases first on odd moves and the defender on even moves. Battles end and score after ten moves.

Use the fleet selector or a counter to select a ship, then enter speed, turn, and turn timing. Attack controls declare torpedoes, depth charges, and intentional rams before movement. Cancel attack orders before movement to restore unspent ammunition. Both fleets are controlled at the same computer; change Perspective to issue each side's orders and see its contacts.

## Rules and verification

The original `MTB.pdf` is the authority; the Markdown and HTML OCR are supporting references. See [RULES_AUDIT.md](RULES_AUDIT.md) for coverage, corrections, and adopted interpretations of gaps in the printed rules. Those decisions resolve the ambiguities for this version: follow the printed game wherever clear, and otherwise use the most consistent, playable reading in its spirit.

Run `node --test tests/rules.test.cjs`. The 79 tests exercise real ship data and game methods with deterministic dice. Coverage includes 6,480 gun-table combinations, target-size modifiers, movement and geometry, scenario setup, damage and equipment, depth charges, torpedoes, ramming, visibility, illumination, fire, scoring, and twelve ten-move simulations spanning all three scenarios and all four visibility modes.

This is a local prototype with a paper-and-ink interface, original scanned counters, an illustrated chart, contextual combat controls and 100–300% chart zoom. See [assets/README.md](assets/README.md) for artwork provenance. Counter dimensions and firing-fan angles are calibrated from the scanned components, so they remain approximate rather than original vector measurements.
