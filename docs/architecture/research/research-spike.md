# Spec 003 - Hostility Awareness: Research Spike

**Date**: 2025-11-19  
**Status**: Research in progress  
**Goal**: Gather telemetry data to understand player identification and attack detection signals before writing the specification.

## Research Plan

**User will:**
1. Load up a new mission
2. Setup PC to log into the server
3. Gather telemetry to identify a player coming into the game
4. Use the same mission and spawn an enemy unit that targets the player
5. Collect data on:
   - How player coalition is identified in logs/telemetry
   - What signals appear when a player joins
   - What signals appear when an enemy unit targets/attacks the player
   - Weapon data patterns during attacks
   - Log entry patterns during attacks

---

## Questions to Answer After Research

### 1. Player Coalition Identification
- How do we identify the "player coalition"?
  - Config-based? Detect from logs? Assume BLUE?
  - Should we support multiple player coalitions?
- **Research focus**: What telemetry/logs indicate a player has joined and which coalition they're on?

### 2. "Being Attacked" Detection
- What signals indicate an attack?
  - Active weapons heading toward player units?
  - Log entries mentioning player units being hit/destroyed?
  - Proximity of enemy weapons to player units?
- Time window: How recent counts as "right now"? (e.g., last 30 seconds?)
- **Research focus**: What data appears when an enemy unit targets/attacks the player?

### 3. "Hostilities Started" Detection
- What indicates hostilities have begun?
  - First weapon fired?
  - First unit destroyed?
  - First log entry about combat?
  - Cross-coalition weapon proximity?
- Should this be a one-time flag or reset per mission session?
- **Research focus**: What's the first signal that combat has begun?

### 4. Data Sources Priority
- Primary: Weapons data (active weapons, coalition, position, heading)
- Secondary: Logs (combat events, unit destruction)
- Tertiary: Unit data (unit health/damage states if available)
- **Research focus**: Which data source is most reliable for detection?

### 5. Output Format
- Simple booleans: `isPlayerUnderAttack: boolean`, `hostilitiesStarted: boolean`?
- Or richer signals: `attackSeverity: "none" | "low" | "medium" | "high"`, `hostilityLevel: number`?
- Include metadata: which weapons, which units, timestamps?
- **Research focus**: What level of detail is actually useful vs. overkill?

### 6. Edge Cases
- Friendly fire (weapon from player coalition targeting player units)?
- Training/friendly exercises (weapons fired but not hostile)?
- Dead weapons (`alive=false`) — ignore or track for history?
- **Research focus**: What edge cases appear in real mission data?

---

## Initial Ideas (To Validate)

### Attack Detection
- Active weapons (`alive=true`) from enemy coalition heading toward player units
- Proximity check: within X meters, heading within Y degrees
- Time window: last 30-60 seconds for "right now" attacks

### Hostilities Detection
- First weapon fired from enemy coalition OR
- First log entry mentioning combat/destruction
- One-time flag per mission session (reset on session hash change)

### Simple Output (MVP)
- Start with booleans: `isPlayerUnderAttack`, `hostilitiesStarted`
- Add metadata later if needed (which weapons, which units, timestamps)

---

## Research Data Collection Points

**When player joins:**
- Log entries (what appears in `/olympus/logs`?)
- Unit data (new unit appears? special flags?)
- Any other telemetry signals?

**When enemy targets player:**
- Weapon data (what weapons appear? what's their coalition/position/heading?)
- Log entries (what combat messages appear?)
- Unit data (any state changes on player unit?)
- Timing (how long between spawn and first weapon? between weapon spawn and impact?)

**During active attack:**
- Weapon count over time
- Weapon proximity to player unit
- Log message frequency
- Any other patterns?

---

## Next Steps After Research

1. Review collected telemetry data
2. Answer questions above based on real data
3. Refine initial ideas based on findings
4. Write formal specification document
5. Create implementation plan

---

## Notes

- Keep this document updated with findings during research
- Document any surprises or unexpected patterns
- Note any limitations in available data sources

