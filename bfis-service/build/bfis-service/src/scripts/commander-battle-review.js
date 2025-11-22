/**
 * Commander Battle State Review Script
 *
 * Comprehensive end-to-end data capture and analysis script for BFIS.
 * Provides detailed battle state review with unit analysis, force composition,
 * engagement assessment, and commander recommendations.
 *
 * **CRITICAL: ALL testing MUST be performed in Docker container per AGENTS.md**
 *
 * Usage (Docker only):
 *   # From repository root:
 *   docker build -f bfis-service/Dockerfile -t bfis-service .
 *   docker run --rm --network host \
 *     -v /home/dcs/.creds:/home/dcs/.creds:ro \
 *     -v /home/dcs/DCSOlympus/bfis-service/logs:/app/bfis-service/logs \
 *     bfis-service \
 *     node build/bfis-service/src/scripts/commander-battle-review.js
 *
 * DO NOT run tests directly on host - use Docker container only.
 */
import { SnapshotReader } from "../snapshot/snapshot-reader.js";
import { loadConfig } from "../config/config.js";
import { createStructuredLogger } from "../logger/structured-logger.js";
async function main() {
    try {
        const config = loadConfig();
        const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
        const reader = new SnapshotReader(config, logger);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  BFIS COMMANDER BATTLE STATE REVIEW');
        console.log('  Comprehensive End-to-End Data Capture');
        console.log('  LARGE SCALE MISSION ANALYSIS');
        console.log('═══════════════════════════════════════════════════════════════\n');
        const startTime = Date.now();
        const snapshot = await reader.readContextOnce();
        const duration = Date.now() - startTime;
        console.log('=== MISSION METADATA ===');
        console.log(`Mission: ${snapshot.base.missionId}`);
        console.log(`Server: ${snapshot.base.serverId}`);
        console.log(`Session: ${snapshot.base.sessionHash}`);
        console.log(`Timestamp: ${new Date(snapshot.base.time).toISOString()}`);
        console.log(`Snapshot ID: ${snapshot.base.snapshotId}`);
        console.log(`Data Capture Duration: ${duration}ms\n`);
        // Analyze Units
        const unitAnalysis = {
            total: snapshot.base.units.length,
            byCoalition: {},
            byType: {},
            byCategory: {},
            withPositions: 0,
            airAssets: [],
            groundAssets: [],
            navalAssets: [],
            ghostUnits: [],
        };
        snapshot.base.units.forEach(unit => {
            const coalition = unit.coalition || 'UNKNOWN';
            const type = unit.unitType || 'UNKNOWN';
            const category = unit.category || 'UNKNOWN';
            unitAnalysis.byCoalition[coalition] = (unitAnalysis.byCoalition[coalition] || 0) + 1;
            unitAnalysis.byType[type] = (unitAnalysis.byType[type] || 0) + 1;
            unitAnalysis.byCategory[category] = (unitAnalysis.byCategory[category] || 0) + 1;
            if (unit.position && (unit.position.lat !== 0 || unit.position.lon !== 0)) {
                unitAnalysis.withPositions++;
            }
            if (category === 'Aircraft' || category === 'Helicopter') {
                unitAnalysis.airAssets.push({ id: unit.unitId, type, name: unit.name, coalition, position: unit.position });
            }
            else if (category === 'GroundUnit') {
                unitAnalysis.groundAssets.push({ id: unit.unitId, type, name: unit.name, coalition, position: unit.position });
            }
            else if (category === 'NavyUnit' || category === 'Ship') {
                unitAnalysis.navalAssets.push({ id: unit.unitId, type, name: unit.name, coalition, position: unit.position });
            }
            // Identify ghost units (UNKNOWN coalition + default position) - likely player slots or dead units
            const isDefaultPosition = unit.position.lat === 0 && unit.position.lon === 0 && unit.position.altMeters === 0;
            if (coalition === 'UNKNOWN' && isDefaultPosition) {
                // Heuristic: Units with category are more likely to be dead units (had data before)
                // Units without category are more likely to be player slots (never initialized)
                const classification = (category && category !== 'Unknown') ? 'dead-unit' : 'player-slot';
                unitAnalysis.ghostUnits.push({
                    id: unit.unitId,
                    type,
                    name: unit.name,
                    coalition,
                    category: category || 'No Category',
                    classification,
                });
            }
        });
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  UNIT ANALYSIS');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`Total Units Tracked: ${unitAnalysis.total}`);
        console.log(`Units with Valid Positions: ${unitAnalysis.withPositions}/${unitAnalysis.total}\n`);
        console.log('Coalition Distribution:');
        Object.entries(unitAnalysis.byCoalition).sort((a, b) => b[1] - a[1]).forEach(([coal, count]) => {
            const pct = ((count / unitAnalysis.total) * 100).toFixed(1);
            console.log(`  ${coal}: ${count} units (${pct}%)`);
        });
        console.log('');
        console.log('Unit Categories:');
        Object.entries(unitAnalysis.byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
            const pct = ((count / unitAnalysis.total) * 100).toFixed(1);
            console.log(`  ${cat}: ${count} (${pct}%)`);
        });
        console.log('');
        console.log('Top 20 Unit Types:');
        Object.entries(unitAnalysis.byType).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        if (Object.keys(unitAnalysis.byType).length > 20) {
            console.log(`  ... and ${Object.keys(unitAnalysis.byType).length - 20} more unit types`);
        }
        console.log('');
        // Group Analysis
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  UNIT GROUPS ANALYSIS');
        console.log('═══════════════════════════════════════════════════════════════\n');
        const groupsMap = new Map();
        const unitsWithoutGroup = [];
        snapshot.base.units.forEach(unit => {
            const coalition = unit.coalition || 'UNKNOWN';
            const type = unit.unitType || 'UNKNOWN';
            const category = unit.category || 'UNKNOWN';
            if (unit.groupId) {
                if (!groupsMap.has(unit.groupId)) {
                    groupsMap.set(unit.groupId, []);
                }
                groupsMap.get(unit.groupId).push({
                    id: unit.unitId,
                    type,
                    name: unit.name,
                    coalition,
                    category,
                });
            }
            else {
                unitsWithoutGroup.push({
                    id: unit.unitId,
                    type,
                    name: unit.name,
                    coalition,
                    category,
                });
            }
        });
        const totalGroups = groupsMap.size;
        const totalUnitsInGroups = Array.from(groupsMap.values()).reduce((sum, units) => sum + units.length, 0);
        console.log(`Total Groups: ${totalGroups}`);
        console.log(`Total Units in Groups: ${totalUnitsInGroups}`);
        console.log(`Units without Group: ${unitsWithoutGroup.length}`);
        console.log(`Average Units per Group: ${totalGroups > 0 ? (totalUnitsInGroups / totalGroups).toFixed(1) : 'N/A'}`);
        console.log('');
        // Group by coalition
        const groupsByCoalition = {};
        groupsMap.forEach((units, groupId) => {
            if (units.length > 0) {
                const coalition = units[0].coalition;
                if (!groupsByCoalition[coalition]) {
                    groupsByCoalition[coalition] = [];
                }
                groupsByCoalition[coalition].push({ groupId, units });
            }
        });
        Object.entries(groupsByCoalition).sort().forEach(([coalition, groups]) => {
            console.log(`${coalition} Forces: ${groups.length} groups, ${groups.reduce((sum, g) => sum + g.units.length, 0)} units`);
        });
        console.log('');
        // Show groups with unit counts by type
        console.log('Top 30 Groups by Unit Count:');
        const sortedGroups = Array.from(groupsMap.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 30);
        sortedGroups.forEach(([groupId, units], idx) => {
            const coalition = units[0]?.coalition || 'UNKNOWN';
            // Count units by type in this group
            const typeCounts = {};
            units.forEach(u => {
                typeCounts[u.type] = (typeCounts[u.type] || 0) + 1;
            });
            const typeBreakdown = Object.entries(typeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');
            console.log(`  ${idx + 1}. Group ${groupId} [${coalition}]: ${units.length} units (${typeBreakdown})`);
        });
        if (groupsMap.size > 30) {
            console.log(`  ... and ${groupsMap.size - 30} more groups`);
        }
        console.log('');
        if (unitsWithoutGroup.length > 0) {
            console.log(`Units without Group (${unitsWithoutGroup.length}):`);
            const ungroupedByCoalition = {};
            unitsWithoutGroup.forEach(u => {
                ungroupedByCoalition[u.coalition] = (ungroupedByCoalition[u.coalition] || 0) + 1;
            });
            Object.entries(ungroupedByCoalition).sort().forEach(([coalition, count]) => {
                console.log(`  ${coalition}: ${count} units`);
            });
            console.log('');
        }
        const blueAir = unitAnalysis.airAssets.filter(a => a.coalition === 'BLUE').length;
        const redAir = unitAnalysis.airAssets.filter(a => a.coalition === 'RED').length;
        const blueGround = unitAnalysis.groundAssets.filter(a => a.coalition === 'BLUE').length;
        const redGround = unitAnalysis.groundAssets.filter(a => a.coalition === 'RED').length;
        const blueNaval = unitAnalysis.navalAssets.filter(a => a.coalition === 'BLUE').length;
        const redNaval = unitAnalysis.navalAssets.filter(a => a.coalition === 'RED').length;
        console.log(`Air Assets: ${unitAnalysis.airAssets.length} total (BLUE: ${blueAir}, RED: ${redAir})`);
        console.log(`Ground Assets: ${unitAnalysis.groundAssets.length} total (BLUE: ${blueGround}, RED: ${redGround})`);
        console.log(`Naval Assets: ${unitAnalysis.navalAssets.length} total (BLUE: ${blueNaval}, RED: ${redNaval})`);
        console.log('');
        // Ghost Units (Player Slots / Dead Units)
        if (unitAnalysis.ghostUnits.length > 0) {
            const playerSlots = unitAnalysis.ghostUnits.filter(u => u.classification === 'player-slot');
            const deadUnits = unitAnalysis.ghostUnits.filter(u => u.classification === 'dead-unit');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('  GHOST UNITS - PLAYER SLOTS / DEAD UNITS');
            console.log('═══════════════════════════════════════════════════════════════\n');
            console.log(`Total Ghost Units: ${unitAnalysis.ghostUnits.length}`);
            console.log(`  🎮 Possible Player Slots: ${playerSlots.length} (uninitialized units)`);
            console.log(`  💀 Dead Units: ${deadUnits.length} (destroyed but still in cache)`);
            console.log('');
            if (playerSlots.length > 0) {
                console.log('Possible Player Slots (uninitialized):');
                playerSlots.slice(0, 10).forEach(unit => {
                    console.log(`  • Unit ${unit.id}: category=${unit.category}, type=${unit.type || 'N/A'}`);
                });
                if (playerSlots.length > 10) {
                    console.log(`  ... and ${playerSlots.length - 10} more`);
                }
                console.log('');
            }
            if (deadUnits.length > 0) {
                console.log('Dead Units (destroyed but in cache):');
                deadUnits.slice(0, 10).forEach(unit => {
                    console.log(`  • Unit ${unit.id}: category=${unit.category}, type=${unit.type || 'N/A'}, name=${unit.name || 'N/A'}`);
                });
                if (deadUnits.length > 10) {
                    console.log(`  ... and ${deadUnits.length - 10} more`);
                }
                console.log('');
            }
            console.log('Note: These units have UNKNOWN coalition and default position (0,0,0).');
            console.log('They are kept in snapshot for tracking but are not active battlefield entities.');
            console.log('');
        }
        // Airbases
        const airbaseAnalysis = { total: snapshot.airbases.length, byCoalition: {} };
        snapshot.airbases.forEach(ab => {
            const coalition = ab.coalition || 'NEUTRAL';
            airbaseAnalysis.byCoalition[coalition] = (airbaseAnalysis.byCoalition[coalition] || 0) + 1;
        });
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  AIRBASE INFRASTRUCTURE');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`Total Airbases: ${airbaseAnalysis.total}`);
        Object.entries(airbaseAnalysis.byCoalition).sort().forEach(([coal, count]) => {
            console.log(`  ${coal}: ${count} airbases`);
        });
        console.log('');
        // Bullseyes
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  BULLSEYE REFERENCE POINTS');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`Total Bullseyes: ${snapshot.bullseyes.length}`);
        snapshot.bullseyes.forEach(be => {
            const pos = be.position ? `lat=${be.position.lat.toFixed(4)}, lon=${be.position.lon.toFixed(4)}` : 'No position';
            console.log(`  [${be.coalition || 'UNKNOWN'}] ${be.id} - ${pos}`);
        });
        console.log('');
        // Spots
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  ACTIVE SPOTS (LASER/IR)');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`Total Active Spots: ${snapshot.spots.length}`);
        if (snapshot.spots.length > 0) {
            const spotTypes = {};
            snapshot.spots.forEach(spot => {
                const type = spot.type || 'unknown';
                spotTypes[type] = (spotTypes[type] || 0) + 1;
            });
            Object.entries(spotTypes).forEach(([type, count]) => {
                console.log(`  ${type}: ${count}`);
            });
        }
        console.log('');
        // Logs
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  RECENT LOG ENTRIES');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`Total Log Entries: ${snapshot.logs.length}`);
        if (snapshot.logs.length > 0) {
            const logCategories = {};
            snapshot.logs.forEach(log => {
                const cat = log.category || 'unknown';
                logCategories[cat] = (logCategories[cat] || 0) + 1;
            });
            Object.entries(logCategories).forEach(([cat, count]) => {
                console.log(`  ${cat}: ${count}`);
            });
            const sortedLogs = [...snapshot.logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            console.log('\nMost Recent Logs (last 5):');
            sortedLogs.slice(0, 5).forEach(log => {
                const time = log.timestamp ? new Date(log.timestamp).toISOString() : 'Unknown time';
                const msg = (log.message || 'No message').substring(0, 120);
                console.log(`  [${time}] ${msg}${(log.message || '').length > 120 ? '...' : ''}`);
            });
        }
        console.log('');
        // Weapons - Get full weapon data from cache
        const weaponCache = reader.weaponCache;
        const allWeapons = Array.from(weaponCache.values());
        const activeWeapons = allWeapons.filter(w => w.alive);
        // Store for use in recommendations section
        const activeWeaponCount = activeWeapons.length;
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  WEAPONS IN FLIGHT - DETAILED ANALYSIS');
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`Total Weapons Tracked: ${allWeapons.length} (${activeWeapons.length} active, ${allWeapons.length - activeWeapons.length} destroyed)`);
        const lastUpdate = snapshot.weaponsSummary.lastUpdateTime > 0
            ? new Date(snapshot.weaponsSummary.lastUpdateTime).toISOString()
            : 'Never';
        console.log(`Last Weapons Update: ${lastUpdate}\n`);
        if (activeWeapons.length > 0) {
            // Weapon analysis by category
            const weaponAnalysis = {
                byCategory: {},
                byName: {},
                byCoalition: {},
                bySpeed: {
                    slow: 0, // < 100 m/s
                    medium: 0, // 100-500 m/s
                    fast: 0, // 500-1000 m/s
                    veryFast: 0 // > 1000 m/s
                },
                byAltitude: {
                    low: 0, // < 1000m
                    medium: 0, // 1000-5000m
                    high: 0, // 5000-15000m
                    veryHigh: 0 // > 15000m
                },
                totalSpeed: 0,
                totalAltitude: 0,
                fastest: null,
                highest: null,
            };
            activeWeapons.forEach(weapon => {
                const category = weapon.category || 'Unknown';
                const name = weapon.name || 'Unknown';
                const coalition = weapon.coalition || 'UNKNOWN';
                weaponAnalysis.byCategory[category] = (weaponAnalysis.byCategory[category] || 0) + 1;
                weaponAnalysis.byName[name] = (weaponAnalysis.byName[name] || 0) + 1;
                weaponAnalysis.byCoalition[coalition] = (weaponAnalysis.byCoalition[coalition] || 0) + 1;
                const speed = weapon.speed || 0;
                const alt = weapon.position?.alt || 0;
                weaponAnalysis.totalSpeed += speed;
                weaponAnalysis.totalAltitude += alt;
                // Speed categorization
                if (speed < 100)
                    weaponAnalysis.bySpeed.slow++;
                else if (speed < 500)
                    weaponAnalysis.bySpeed.medium++;
                else if (speed < 1000)
                    weaponAnalysis.bySpeed.fast++;
                else
                    weaponAnalysis.bySpeed.veryFast++;
                // Altitude categorization
                if (alt < 1000)
                    weaponAnalysis.byAltitude.low++;
                else if (alt < 5000)
                    weaponAnalysis.byAltitude.medium++;
                else if (alt < 15000)
                    weaponAnalysis.byAltitude.high++;
                else
                    weaponAnalysis.byAltitude.veryHigh++;
                // Track fastest and highest
                if (!weaponAnalysis.fastest || speed > weaponAnalysis.fastest.speed) {
                    weaponAnalysis.fastest = weapon;
                }
                if (!weaponAnalysis.highest || alt > weaponAnalysis.highest.position.alt) {
                    weaponAnalysis.highest = weapon;
                }
            });
            const avgSpeed = activeWeapons.length > 0 ? (weaponAnalysis.totalSpeed / activeWeapons.length).toFixed(1) : '0';
            const avgAltitude = activeWeapons.length > 0 ? (weaponAnalysis.totalAltitude / activeWeapons.length).toFixed(0) : '0';
            console.log('📊 WEAPON BREAKDOWN BY CATEGORY:');
            Object.entries(weaponAnalysis.byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
                const pct = ((count / activeWeapons.length) * 100).toFixed(1);
                const icon = cat === 'Missile' ? '🚀' : cat === 'Bomb' ? '💣' : cat === 'Shell' ? '💥' : '⚙️';
                console.log(`  ${icon} ${cat}: ${count} (${pct}%)`);
            });
            console.log('');
            console.log('🎯 TOP 15 WEAPON TYPES:');
            Object.entries(weaponAnalysis.byName).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([name, count]) => {
                console.log(`  • ${name}: ${count}`);
            });
            if (Object.keys(weaponAnalysis.byName).length > 15) {
                console.log(`  ... and ${Object.keys(weaponAnalysis.byName).length - 15} more weapon types`);
            }
            console.log('');
            console.log('⚔️  WEAPONS BY COALITION:');
            Object.entries(weaponAnalysis.byCoalition).sort((a, b) => b[1] - a[1]).forEach(([coal, count]) => {
                const pct = ((count / activeWeapons.length) * 100).toFixed(1);
                const icon = coal === 'BLUE' ? '🔵' : coal === 'RED' ? '🔴' : '⚪';
                console.log(`  ${icon} ${coal}: ${count} weapons (${pct}%)`);
            });
            console.log('');
            console.log('⚡ SPEED ANALYSIS:');
            console.log(`  Average Speed: ${avgSpeed} m/s (${(Number(avgSpeed) * 3.6).toFixed(1)} km/h)`);
            console.log(`  Speed Distribution:`);
            console.log(`    🐌 Slow (< 100 m/s): ${weaponAnalysis.bySpeed.slow}`);
            console.log(`    🚗 Medium (100-500 m/s): ${weaponAnalysis.bySpeed.medium}`);
            console.log(`    ✈️  Fast (500-1000 m/s): ${weaponAnalysis.bySpeed.fast}`);
            console.log(`    🚀 Very Fast (> 1000 m/s): ${weaponAnalysis.bySpeed.veryFast}`);
            if (weaponAnalysis.fastest) {
                const speedKmh = (weaponAnalysis.fastest.speed * 3.6).toFixed(1);
                console.log(`  🏆 Fastest Weapon: ${weaponAnalysis.fastest.name || 'Unknown'} at ${weaponAnalysis.fastest.speed.toFixed(1)} m/s (${speedKmh} km/h)`);
            }
            console.log('');
            console.log('📈 ALTITUDE ANALYSIS:');
            console.log(`  Average Altitude: ${avgAltitude} m (${(Number(avgAltitude) * 3.28084).toFixed(0)} ft)`);
            console.log(`  Altitude Distribution:`);
            console.log(`    ⬇️  Low (< 1km): ${weaponAnalysis.byAltitude.low}`);
            console.log(`    ➡️  Medium (1-5km): ${weaponAnalysis.byAltitude.medium}`);
            console.log(`    ⬆️  High (5-15km): ${weaponAnalysis.byAltitude.high}`);
            console.log(`    🛰️  Very High (> 15km): ${weaponAnalysis.byAltitude.veryHigh}`);
            if (weaponAnalysis.highest) {
                const altFt = (weaponAnalysis.highest.position.alt * 3.28084).toFixed(0);
                console.log(`  🏔️  Highest Weapon: ${weaponAnalysis.highest.name || 'Unknown'} at ${weaponAnalysis.highest.position.alt.toFixed(0)} m (${altFt} ft)`);
            }
            console.log('');
            // Threat assessment
            const blueWeapons = activeWeapons.filter(w => w.coalition === 'BLUE').length;
            const redWeapons = activeWeapons.filter(w => w.coalition === 'RED').length;
            const neutralWeapons = activeWeapons.filter(w => w.coalition === 'NEUTRAL').length;
            console.log('⚠️  THREAT ASSESSMENT:');
            if (blueWeapons > 0 && redWeapons > 0) {
                const ratio = (redWeapons / blueWeapons).toFixed(2);
                console.log(`  Active Engagement: ${blueWeapons} BLUE vs ${redWeapons} RED weapons in flight`);
                console.log(`  Weapon Ratio: ${ratio}:1 (RED:BLUE)`);
                if (redWeapons > blueWeapons * 2) {
                    console.log(`  🔴 CRITICAL: RED has significant weapon advantage in the air`);
                }
                else if (blueWeapons > redWeapons * 2) {
                    console.log(`  🔵 ADVANTAGE: BLUE has significant weapon advantage in the air`);
                }
                else {
                    console.log(`  ⚖️  BALANCED: Relatively even weapon exchange`);
                }
            }
            else if (blueWeapons > 0) {
                console.log(`  🔵 BLUE has ${blueWeapons} weapons in flight (offensive/defensive operations)`);
            }
            else if (redWeapons > 0) {
                console.log(`  🔴 RED has ${redWeapons} weapons in flight (incoming threat)`);
            }
            if (neutralWeapons > 0) {
                console.log(`  ⚪ ${neutralWeapons} neutral weapons detected`);
            }
            console.log('');
        }
        else {
            console.log('  No active weapons currently in flight.\n');
        }
        // COMMANDER REVIEW
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  COMMANDER BATTLE STATE REVIEW');
        console.log('  LLM Commander Analysis - LARGE SCALE MISSION');
        console.log('═══════════════════════════════════════════════════════════════\n');
        const blueUnits = unitAnalysis.byCoalition['BLUE'] || 0;
        const redUnits = unitAnalysis.byCoalition['RED'] || 0;
        const neutralUnits = unitAnalysis.byCoalition['NEUTRAL'] || 0;
        const unknownUnits = unitAnalysis.byCoalition['UNKNOWN'] || 0;
        const ghostUnitsCount = unitAnalysis.ghostUnits.length;
        console.log('=== SITUATION ASSESSMENT ===\n');
        console.log('FORCE COMPOSITION:');
        console.log(`  BLUE Forces: ${blueUnits} total units (${blueAir} air, ${blueGround} ground, ${blueNaval} naval)`);
        console.log(`  RED Forces: ${redUnits} total units (${redAir} air, ${redGround} ground, ${redNaval} naval)`);
        if (neutralUnits > 0)
            console.log(`  NEUTRAL Forces: ${neutralUnits} units`);
        if (ghostUnitsCount > 0) {
            const playerSlots = unitAnalysis.ghostUnits.filter(u => u.classification === 'player-slot').length;
            const deadUnits = unitAnalysis.ghostUnits.filter(u => u.classification === 'dead-unit').length;
            console.log(`  GHOST UNITS: ${ghostUnitsCount} total (${playerSlots} possible player slots, ${deadUnits} dead units)`);
        }
        if (unknownUnits > ghostUnitsCount) {
            console.log(`  UNKNOWN Classification: ${unknownUnits - ghostUnitsCount} units (active but unclassified)`);
        }
        if (blueUnits > 0 && redUnits > 0) {
            const forceRatio = (redUnits / blueUnits).toFixed(2);
            console.log(`  Force Ratio: ${forceRatio}:1 (RED:BLUE)`);
        }
        console.log('');
        console.log('AIR SUPERIORITY:');
        if (blueAir > 0 || redAir > 0) {
            const airRatio = blueAir > 0 ? (redAir / blueAir).toFixed(2) : 'N/A';
            console.log(`  Air Asset Ratio: ${airRatio}:1 (RED:BLUE)`);
            if (blueAir > redAir * 1.5) {
                console.log('  Assessment: BLUE maintains SIGNIFICANT air superiority');
            }
            else if (blueAir > redAir) {
                console.log('  Assessment: BLUE maintains air superiority');
            }
            else if (redAir > blueAir * 1.5) {
                console.log('  Assessment: RED maintains SIGNIFICANT air superiority');
            }
            else if (redAir > blueAir) {
                console.log('  Assessment: RED maintains air superiority');
            }
            else {
                console.log('  Assessment: Air parity - contested airspace');
            }
        }
        else {
            console.log('  Assessment: No air assets currently active');
        }
        console.log('');
        console.log('GROUND FORCES:');
        if (blueGround > 0 || redGround > 0) {
            const groundRatio = blueGround > 0 ? (redGround / blueGround).toFixed(2) : 'N/A';
            console.log(`  Ground Asset Ratio: ${groundRatio}:1 (RED:BLUE)`);
            if (blueGround > redGround * 2) {
                console.log('  Assessment: BLUE has SIGNIFICANT ground force advantage');
            }
            else if (blueGround > redGround) {
                console.log('  Assessment: BLUE has ground force advantage');
            }
            else if (redGround > blueGround * 2) {
                console.log('  Assessment: RED has SIGNIFICANT ground force advantage');
            }
            else if (redGround > blueGround) {
                console.log('  Assessment: RED has ground force advantage');
            }
            else {
                console.log('  Assessment: Ground force parity');
            }
        }
        else {
            console.log('  Assessment: No ground assets currently active');
        }
        console.log('');
        console.log('INFRASTRUCTURE:');
        console.log(`  Airbases Available: ${airbaseAnalysis.total} total`);
        const neutralAirbases = airbaseAnalysis.byCoalition['NEUTRAL'] || 0;
        const blueAirbases = airbaseAnalysis.byCoalition['BLUE'] || 0;
        const redAirbases = airbaseAnalysis.byCoalition['RED'] || 0;
        if (blueAirbases > 0)
            console.log(`  BLUE Controlled: ${blueAirbases} airbases`);
        if (redAirbases > 0)
            console.log(`  RED Controlled: ${redAirbases} airbases`);
        if (neutralAirbases > 0)
            console.log(`  Neutral Airbases: ${neutralAirbases} (available for either side)`);
        console.log('');
        console.log('ACTIVE ENGAGEMENTS:');
        if (snapshot.spots.length > 0) {
            console.log(`  Active Targeting: ${snapshot.spots.length} laser/IR spots detected`);
            if (snapshot.spots.length > 20) {
                console.log('  Assessment: HEAVY targeting activity - multiple engagements in progress');
            }
            else if (snapshot.spots.length > 5) {
                console.log('  Assessment: MODERATE targeting activity - several engagements');
            }
            else {
                console.log('  Assessment: Active targeting/engagement in progress');
            }
        }
        else {
            console.log('  Assessment: No active targeting detected');
        }
        console.log('');
        if (activeWeaponCount > 0) {
            console.log(`  Active Weapons: ${activeWeaponCount} weapons in flight`);
            if (activeWeaponCount > 50) {
                console.log('  Assessment: 🔥 MASSIVE weapons engagement - high intensity conflict zone');
                console.log('             Multiple simultaneous engagements, heavy ordnance in the air');
            }
            else if (activeWeaponCount > 20) {
                console.log('  Assessment: ⚔️  HEAVY weapons engagement - significant conflict');
                console.log('             Sustained combat operations with multiple weapon systems active');
            }
            else if (activeWeaponCount > 10) {
                console.log('  Assessment: 🎯 MODERATE weapons engagement');
                console.log('             Active combat with several weapons in flight');
            }
            else {
                console.log('  Assessment: ⚡ Active weapons engagement ongoing');
                console.log('             Limited but active weapon deployment');
            }
        }
        else {
            console.log('  Active Weapons: None detected');
            console.log('  Assessment: ✅ No weapons in flight - airspace clear');
        }
        console.log('');
        console.log('=== COMMANDER RECOMMENDATIONS ===\n');
        const recommendations = [];
        if (unitAnalysis.total >= 400) {
            recommendations.push(`LARGE SCALE OPERATION: ${unitAnalysis.total} units tracked. This is a major engagement requiring comprehensive command and control.`);
        }
        else if (unitAnalysis.total >= 200) {
            recommendations.push(`MEDIUM-LARGE SCALE OPERATION: ${unitAnalysis.total} units tracked. Significant force deployment requiring coordinated operations.`);
        }
        if (blueAir === 0 && redAir > 0) {
            recommendations.push('CRITICAL: BLUE has no air assets. Consider deploying air cover immediately.');
        }
        else if (redAir === 0 && blueAir > 0) {
            recommendations.push(`AIR SUPERIORITY OPPORTUNITY: BLUE has ${blueAir} air assets vs RED's ${redAir}. Exploit air dominance for ground support.`);
        }
        else if (redAir > blueAir * 1.5) {
            recommendations.push(`AIR THREAT: RED maintains ${(redAir / blueAir).toFixed(1)}:1 air advantage. Prioritize air defense and SEAD operations.`);
        }
        if (snapshot.spots.length > 20) {
            recommendations.push(`HIGH INTENSITY CONFLICT: ${snapshot.spots.length} active targeting spots. Multiple simultaneous engagements. Prioritize threat assessment.`);
        }
        else if (snapshot.spots.length > 0) {
            recommendations.push(`ACTIVE ENGAGEMENT: ${snapshot.spots.length} targeting spots detected. Monitor for weapon launches.`);
        }
        if (activeWeaponCount > 50) {
            const blueCount = activeWeapons.filter(w => w.coalition === 'BLUE').length;
            const redCount = activeWeapons.filter(w => w.coalition === 'RED').length;
            recommendations.push(`🔥 MASSIVE WEAPONS ENGAGEMENT: ${activeWeaponCount} weapons in flight (${blueCount} BLUE, ${redCount} RED). High-intensity conflict zone. Execute defensive measures and coordinate air defense.`);
        }
        else if (activeWeaponCount > 20) {
            recommendations.push(`⚔️  HEAVY WEAPONS ENGAGEMENT: ${activeWeaponCount} active weapons. Significant combat activity. Monitor trajectories and maintain defensive posture.`);
        }
        else if (activeWeaponCount > 0) {
            const missileCount = activeWeapons.filter(w => w.category === 'Missile').length;
            const bombCount = activeWeapons.filter(w => w.category === 'Bomb').length;
            recommendations.push(`🎯 WEAPONS IN FLIGHT: ${activeWeaponCount} active weapons (${missileCount} missiles, ${bombCount} bombs). Track trajectories and prepare defensive measures.`);
        }
        if (blueUnits < redUnits && blueUnits > 0) {
            const ratio = (redUnits / blueUnits).toFixed(1);
            recommendations.push(`FORCE DISPARITY: BLUE outnumbered ${ratio}:1. Consider reinforcement, tactical withdrawal, or asymmetric warfare strategies.`);
        }
        else if (blueUnits > redUnits * 1.5 && redUnits > 0) {
            recommendations.push(`FORCE ADVANTAGE: BLUE outnumbers RED ${(blueUnits / redUnits).toFixed(1)}:1. Consider aggressive operations.`);
        }
        if (neutralAirbases > 0) {
            recommendations.push(`STRATEGIC OPPORTUNITY: ${neutralAirbases} neutral airbases available. Consider securing key facilities for forward operations.`);
        }
        // Only report unknown units if they're not ghost units (ghost units are tracked separately)
        const activeUnknownUnits = unknownUnits - ghostUnitsCount;
        if (activeUnknownUnits > 0) {
            recommendations.push(`DATA QUALITY ISSUE: ${activeUnknownUnits} active units with unknown classification. Verify identification and update tracking systems.`);
        }
        if (ghostUnitsCount > 0) {
            const playerSlots = unitAnalysis.ghostUnits.filter(u => u.classification === 'player-slot').length;
            const deadUnits = unitAnalysis.ghostUnits.filter(u => u.classification === 'dead-unit').length;
            recommendations.push(`GHOST UNITS DETECTED: ${ghostUnitsCount} ghost units tracked (${playerSlots} possible player slots, ${deadUnits} dead units). These are inactive but kept in snapshot for tracking.`);
        }
        if (snapshot.logs.length > 100) {
            recommendations.push(`HIGH ACTIVITY: ${snapshot.logs.length} log entries indicate intense mission activity. Maintain situational awareness.`);
        }
        if (unitAnalysis.withPositions < unitAnalysis.total * 0.9) {
            const pct = ((unitAnalysis.withPositions / unitAnalysis.total) * 100).toFixed(1);
            recommendations.push(`TRACKING ISSUE: Only ${pct}% of units have valid positions. Improve sensor coverage.`);
        }
        if (recommendations.length === 0) {
            recommendations.push('SITUATION STABLE: No immediate threats detected. Continue monitoring.');
        }
        recommendations.forEach((rec, idx) => {
            console.log(`  ${idx + 1}. ${rec}`);
        });
        console.log('');
        console.log('=== DATA QUALITY ASSESSMENT ===\n');
        const positionPct = unitAnalysis.total > 0 ? ((unitAnalysis.withPositions / unitAnalysis.total) * 100).toFixed(1) : '0.0';
        console.log(`Position Accuracy: ${positionPct}% of units have valid positions`);
        console.log(`Data Freshness: Snapshot captured in ${duration}ms`);
        console.log(`Context Completeness: All context endpoints queried and normalized`);
        console.log(`Scale: ${unitAnalysis.total} units, ${snapshot.airbases.length} airbases, ${snapshot.spots.length} spots, ${snapshot.logs.length} logs`);
        console.log('');
        console.log('=== MISSION SCALE CLASSIFICATION ===\n');
        if (unitAnalysis.total >= 500) {
            console.log('  CLASSIFICATION: MASSIVE SCALE OPERATION');
        }
        else if (unitAnalysis.total >= 300) {
            console.log('  CLASSIFICATION: LARGE SCALE OPERATION');
        }
        else if (unitAnalysis.total >= 100) {
            console.log('  CLASSIFICATION: MEDIUM SCALE OPERATION');
        }
        else {
            console.log('  CLASSIFICATION: SMALL SCALE OPERATION');
        }
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  END OF COMMANDER REVIEW');
        console.log('═══════════════════════════════════════════════════════════════');
    }
    catch (error) {
        console.error('Error running commander battle review:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}
// Run the script
void main();
