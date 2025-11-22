# Spec 003 - Hostility Awareness: Research Spike Findings

**Date**: 2025-11-20  
**Data Source**: 184 captures from live mission (2025-11-20T02:03:43 to 2025-11-20T02:06:XX)  
**Status**: Analysis complete

## Data Summary

- **Total Captures**: 184 snapshots
- **Player Detection**: 158 captures with player unit (86%)
- **Weapon Activity**: 41 captures with active weapons
- **Enemy Attacks**: 32 captures with RED coalition weapons (SA-10 missiles)
- **Player Unit**: A-10C_2 (ID: 17090), BLUE coalition
- **Timeline**: Player spawn → First weapon (82s) → Enemy attack (116s)

---

## Questions Answered

### ✅ 1. Player Coalition Identification

**Answer**: Player coalition is identified via `human: true` flag in unit data.

**Findings**:
- Player unit has `human: true` and `controlled: false` in unit binary data
- Player coalition: BLUE (detected from unit data)
- Player unit ID: 17090 (A-10C_2)
- **Method**: Use `human: true` flag to identify player units, then read `coalition` field
- **Support for multiple players**: Yes - any unit with `human: true` is a player

**Data Evidence**:
```json
{
  "unitId": "17090",
  "name": "A-10C_2",
  "coalition": "BLUE",
  "human": true,
  "controlled": false
}
```

**Recommendation**: 
- Primary: Detect player coalition from unit data (`human: true` → read `coalition`)
- No config needed - dynamic detection from data
- Supports multiple players across different coalitions

---

### ✅ 2. "Being Attacked" Detection

**Answer**: Attack can be detected via enemy weapons (`coalition != player coalition`) with proximity and trajectory analysis.

**Findings**:
- **Attack Signal**: SA-10 missiles (RED coalition) launched when player was 21.24 km away
- **Engagement Range**: Player was within SA-10 engagement range (30-35 km typical)
- **Weapon Data Available**: Position, heading, speed, coalition, alive status
- **Target Data**: NOT available in weapon binary stream (no `targetID` or `targetPosition` fields)

**Detection Method**:
1. Identify active weapons from enemy coalition (`alive: true`, `coalition != player coalition`)
2. Calculate proximity to player units (distance from weapon position to player position)
3. Analyze trajectory (weapon heading + position) to determine if heading toward player
4. Time window: Last 30-60 seconds for "active attack"

**Data Evidence**:
- SA-10 launch: `2025-11-20T02:06:05.620Z`
- Player position: 36.456°N, -115.668°W, 1994m altitude
- Weapon position: 36.609°N, -115.526°W, 935m altitude
- Distance: 21.24 km (within engagement range)
- Weapon heading: -2.435 radians (~-139.5 degrees)
- Weapon speed: 39 m/s (accelerating to 520+ m/s)

**Limitations**:
- No direct target ID in weapon data - must infer from position/heading
- Must calculate trajectory manually using weapon position + heading
- Proximity alone isn't sufficient (need heading analysis)

**Recommendation**:
- Primary signal: Enemy weapons within engagement range + heading toward player
- Proximity threshold: Weapon within 35 km of player (SA-10 max range)
- Heading analysis: Calculate bearing from weapon to player, compare to weapon heading
- Time window: Last 30 seconds for "active attack" status

---

### ✅ 3. "Hostilities Started" Detection

**Answer**: Hostilities can be detected via first weapon fired OR first enemy weapon proximity to player.

**Findings**:
- **First Weapon**: AI A-10C dropped BDU_33 bomb at `02:05:31` (82s after player spawn)
- **First Enemy Weapon**: SA-10 missile launched at `02:06:05` (116s after player spawn)
- **Logs**: No combat logs captured (logs array was empty in all captures)

**Detection Signals**:
1. **First weapon fired** (any coalition): `02:05:31` - BDU_33 bomb
2. **First enemy weapon** (RED coalition): `02:06:05` - SA-10 missile
3. **First cross-coalition engagement**: `02:06:05` - RED weapon targeting BLUE player

**Recommendation**:
- Primary signal: First weapon fired from enemy coalition OR first weapon fired targeting player coalition
- One-time flag per mission session (reset on `sessionHash` change)
- Alternative: First weapon fired period (any coalition) - simpler but less precise

---

### ⚠️ 4. Data Sources Priority

**Answer**: Weapons data is primary, logs are unreliable (empty in captures), unit data is secondary.

**Findings**:

**Weapons Data (PRIMARY)**:
- ✅ Reliable: 41 captures with active weapons
- ✅ Complete: Position, heading, speed, coalition, alive status
- ✅ Real-time: Updates every 1-2 seconds
- ❌ Missing: Target ID, target position (not in binary format)

**Logs Data (UNRELIABLE)**:
- ❌ Empty: No logs captured in any of 184 snapshots
- ❌ Unknown: May require specific mission events or log level configuration
- ⚠️ Cannot rely on logs for attack detection in current setup

**Unit Data (SECONDARY)**:
- ✅ Reliable: Player detection via `human: true` flag
- ✅ Complete: Position, coalition, status
- ⚠️ Limited: No health/damage states visible in current data
- ⚠️ Indirect: Can infer attacks from unit destruction, but not real-time

**Recommendation**:
1. **Primary**: Weapons data (active enemy weapons + proximity/heading analysis)
2. **Secondary**: Unit data (player position for proximity calculations)
3. **Tertiary**: Logs (if available in future - not reliable in current captures)

---

### ✅ 5. Output Format

**Answer**: Start with booleans + metadata (which weapons, timestamps) for MVP.

**Findings**:
- Simple booleans are sufficient for initial detection
- Metadata is valuable for debugging and analysis
- Timestamps enable time-window analysis

**Recommended Output**:
```typescript
{
  isPlayerUnderAttack: boolean,
  hostilitiesStarted: boolean,
  // Metadata for debugging/analysis
  activeThreats: Array<{
    weaponId: number,
    weaponName: string,
    coalition: string,
    distance: number, // meters from player
    heading: number, // radians
    speed: number, // m/s
    timestamp: number
  }>,
  hostilitiesStartTime?: number, // timestamp of first weapon/engagement
  lastAttackTime?: number // timestamp of most recent threat
}
```

**Rationale**:
- Booleans provide simple yes/no answers
- Metadata enables detailed analysis and debugging
- Timestamps enable time-window calculations
- Can simplify to booleans-only later if metadata isn't needed

---

### ⚠️ 6. Edge Cases

**Answer**: Some edge cases observed, others need more data.

**Findings**:

**Observed Edge Cases**:
1. **AI weapons vs Player weapons**: AI A-10C dropped BDU_33 bomb (BLUE coalition) - not player weapon
   - Solution: Distinguish player units (`human: true`) from AI units
   - Only count weapons from player units OR weapons targeting player units

2. **Dead weapons**: Weapons with `alive: false` are tracked in cache
   - Solution: Only consider `alive: true` weapons for attack detection
   - Dead weapons can be ignored for "active attack" status

3. **Multiple weapons**: Up to 2 SA-10 missiles tracked simultaneously
   - Solution: Count all active enemy weapons, not just one
   - Aggregate threat level based on weapon count + proximity

**Edge Cases Not Observed (Need More Data)**:
1. **Friendly fire**: No friendly fire incidents in captures
2. **Training exercises**: No non-hostile weapon launches observed
3. **Weapon proximity without heading**: All weapons had heading data

**Recommendation**:
- Handle observed edge cases (AI vs player, dead weapons, multiple weapons)
- Document unobserved edge cases for future testing
- Add validation for edge cases as they appear in production

---

## Key Findings Summary

### ✅ What We Can Detect:
1. **Player identification**: Via `human: true` flag in unit data
2. **Player coalition**: Dynamic from unit data (BLUE in test)
3. **Active weapons**: Position, heading, speed, coalition, alive status
4. **Enemy weapons**: RED coalition weapons detected
5. **Attack proximity**: Distance calculations (21.24 km in test)
6. **Attack timing**: Timestamps for spawn, weapon launch, attack

### ❌ What We Cannot Detect:
1. **Weapon target**: No `targetID` or `targetPosition` in weapon binary stream
2. **Combat logs**: Logs array was empty in all captures
3. **Unit health/damage**: No health/damage states in current unit data
4. **Direct target assignment**: Must infer from position/heading analysis

### ⚠️ What We Can Infer:
1. **Attack intent**: Enemy weapons heading toward player (via heading + proximity)
2. **Engagement range**: Player within weapon engagement range (21.24 km < 35 km)
3. **Hostilities started**: First enemy weapon fired (116s after player spawn)

---

## Recommendations for Spec 003

### MVP Approach:
1. **Player Detection**: Use `human: true` flag to identify player units
2. **Attack Detection**: 
   - Active enemy weapons (`alive: true`, `coalition != player coalition`)
   - Within engagement range (proximity threshold: 35 km)
   - Heading analysis (weapon heading toward player position)
   - Time window: Last 30 seconds
3. **Hostilities Detection**: First enemy weapon fired OR first weapon targeting player coalition
4. **Output**: Booleans + metadata (weapon IDs, timestamps, distances)

### Implementation Notes:
- **No target data**: Must calculate trajectory from weapon position + heading
- **No logs**: Cannot rely on log entries for detection
- **Proximity + heading**: Combine distance and heading analysis for attack detection
- **Time windows**: Use timestamps to determine "active" vs "historical" attacks

### Data Requirements:
- ✅ All required data is available in current captures
- ✅ Weapons data is sufficient for attack detection
- ⚠️ Logs are not reliable (empty in captures)
- ✅ Unit data is sufficient for player identification

---

## Next Steps

1. ✅ Research complete - all questions answered
2. Write formal specification document (spec.md)
3. Create implementation plan
4. Implement MVP hostility awareness feature

