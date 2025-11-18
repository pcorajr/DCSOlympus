# MVP BFIS Architecture (Non-Technical)
---

**MVP Architecture – In Plain Language**

Think of BFIS as a loop that keeps doing five things:

1. **See the battlefield (what’s going on?)**  
   _(Non-technical intent)_  
   - BFIS regularly asks Olympus: “What’s the current situation?”  
   - It gets back:
     - What mission is running and on which server.
     - Which units exist, roughly where they are, what side they’re on, and basic status.
     - Extra context: airbases, reference points (bullseyes), spots, drawings, and logs.  
   - BFIS turns this into a single, clean “snapshot” object: “At time T, here is the world as Olympus sees it.”

   **Implementation & MVP sub-stories**  
   - _MVP Implementation status:_ Snapshot ingestion + binary unit decoding and basic snapshot construction are implemented as part of spec 001 (see `shared-schemas/OlympusSnapshot` and `bfis-service/src/snapshot/SnapshotReader` & decoders). Context endpoints are fetched but not yet surfaced in a unified snapshot model.
   - **S1 – Raw picture (PARTIAL via spec 001):** BFIS can pull the current situation for mission metadata and units and assemble a faithful, low-level picture of what exists right now for those pieces. Incorporating full “context” (airbases, bullseyes, spots, drawings, logs, basic weapons state) into a single, consumable picture is still TODO.
   - **S2 – Simple summaries:** BFIS can describe the situation in human terms (“Blue has more aircraft in the north, Red holds most ground units around town X”) without yet suggesting actions.
   - **S3 – Noticing gaps and spikes:** BFIS can point out obvious holes or spikes in the picture (“no CAP over zone Y”, “unusually large Red push here”) so the human doesn’t have to hunt for them.
   - **S4 – Lightweight history:** BFIS can compare the current picture to recent snapshots and say what changed (“two new Red groups appeared here”, “this Blue flight disappeared”), still focused on understanding, not deciding actions.

   **Planned specs under this Epic**  
   - **Spec 001 – Snapshot ingestion & unit decoding (DONE):** Establish mission + units snapshot pipeline (already implemented, see above).
   - **Spec 002 – Context snapshot (PLANNED):**
     - Goal: extend “see the battlefield” from just mission + units to also include context: airbases, bullseyes, spots, drawings, and logs.
     - Shape: Focus on a richer picture and a clean way to surface that context alongside units in a single snapshot view. We need to make sure that we capture as much data as olympus give us. So that we can use it for decision making. We also need to make sure we start defining how we are going to present the data to the llm. What does that entails? these are modules in the bfis-service to keep things fast and clean. This needs to start shaping into a structured snapshots that are easy to use for the llm but deliver enough data to the llm to make decisions.
   - **Spec 003 – Minimal weapons / hostility awareness (PLANNED):**
     - Goal: use weapons data plus logs (and other cheap signals) to answer two questions:
       - “Is the player (or player coalition) being attacked right now?”
       - “Have real hostilities started yet in this mission?”
     - Scope: minimal detection only—flip a couple of booleans / simple signals, not a full combat AI.

2. **Understand goals/intent (what are we trying to achieve?)**  
   Two possible sources of “what should happen next”:
   - **Autopilot goals** – BFIS has standing goals, like:
     - Keep both sides roughly balanced.
     - Don’t leave a gap in CAP over area X.
     - Respond if one side is getting stomped too hard.
   - **Copilot intent** – The player says things like:
     - “Set up a CAP over the east coast for Blue.”
     - “Support the convoy that’s under attack.”
     - “Build a simple CAS mission around this town.”  
   For MVP, this “intent layer” doesn’t have to be fancy; it can be:
   - A simple “mode” switch (Autopilot vs Copilot).
   - A first pass at turning a sentence into a small list of desired actions (“spawn these”, “move those”).

3. **Decide actions (what exactly should BFIS do?)**  
   - Given one snapshot plus the current goal/intent, BFIS produces a *decision*:
     - A list of high‑level actions like “spawn 2 F‑16s here”, “move this group there”, “have this group attack that target”, “RTB this flight”.
   - Each action answers three things:
     - **Type** – Spawn, move, attack, RTB, hold, etc.
     - **Target** – Which unit/group/zone/coordinates.
     - **Parameters** – How many, roughly where, altitude, remarks.  
   - In Copilot mode, BFIS may:
     - Draft a set of actions.
     - Show/explain them to the player.
     - Only execute after confirmation (configurable).

4. **Act through Olympus (how does it change the world?)**  
   - BFIS never pokes DCS directly; it always says to Olympus:
     - “Please run this command that you already know how to do.”  
   - The “command adapter” part of BFIS:
     - Translates each BFIS action into one of Olympus’ existing commands.
     - Sends them.
     - Watches for “did that command complete or fail?”.
   - For MVP, this is a small, explicit set of supported actions:
     - Example: a short list like SPAWN, MOVE, ATTACK, RTB, maybe one scenario‑building action.

5. **Explain and log (what happened and why?)**  
   - Every time BFIS goes through the loop, it writes one log record describing:
     - Which mission/server and snapshot it looked at.
     - A short summary of the situation (e.g., “Blue 12 units, Red 18 units, Blue CAP weak east”).
     - What goal/intent it was following (autopilot heuristic or a summarized user request).
     - What actions it decided to take.
     - Which commands were actually sent to Olympus and whether they succeeded.  
   - It also produces short explanations you could show to a human:
     - “Reinforced Blue CAP over the east due to Red superiority.”
     - “Spawned requested SEAD package near WP3 as you asked.”  
   - This makes it easy later to replay: “Given this state and this request, BFIS chose these moves.”

---

**How This Feels in Practice (MVP)**

- BFIS runs alongside Olympus.
- You configure:
  - Whether it’s in Autopilot, Copilot, or “observe only” mode.
  - Which categories of actions are allowed (spawns only, or also moves/attacks, etc.).
  - Basic aggressiveness or conservatism.
- A single “tick” looks like:
  1. BFIS refreshes its picture of the world.
  2. It checks: “Do I need to do anything?”  
  3. If yes, it forms a small plan (a decision).
  4. It explains that plan (to logs, and optionally to the player).
  5. It asks Olympus to carry out the plan and watches how it goes.
- Over time, you end up with:
  - A stream of decisions that are easy to inspect.
  - A clear separation: Olympus = world, BFIS = brain.

---

**Clarifying Questions (let’s shape the personality + boundaries)**

I’ll keep these grouped so they’re easier to react to. Feel free to answer in bullets / rough notes.

1. **MVP focus: what kind of “brain” first?**  
   - Do you want the first MVP loop to be more:
     - A) **Combat assistant** (CAP/CAS/SEAD style actions in a running mission),  
     - B) **Scenario builder** (help set up missions before start / early in mission), or  
     - C) A mix, but with one clearly primary?  
   - If you had to name *one* flagship use case for BFIS v1 (“this is the cool demo”), what would it be?

2. **Autopilot vs Copilot: who’s in charge?**  
   - For MVP, should Autopilot be:
     - Always on (BFIS quietly tweaks the world unless told otherwise)?
     - Off by default, with a switch to enable it?
   - In Copilot mode, do you imagine:
     - BFIS mostly *suggesting* actions and waiting for explicit “go”, or  
     - BFIS allowed to act immediately on “obvious” requests (“spawn X here now”)?

3. **Safety rails and limits**  
   - What hard limits do you want BFIS to respect out of the box? For example:
     - Max number of units it can spawn per time window?
     - Restrictions on touching certain coalitions, groups, or zones?
     - “Never delete/despawn anything BFIS didn’t create”?  
   - Would you prefer:
     - A simple “BFIS sandbox” where it only works with units it spawned, or  
     - Permission to also manipulate existing mission units from day one?

4. **How chatty vs quiet should it be?**  
   - Do you want BFIS to:
     - Frequently explain what it’s doing (“log / chat style commentary”), or  
     - Be more terse and only summarize when asked?  
   - For player‑facing explanations, what tone are you imagining?
     - Dry and technical (“Spawned 2x F‑16, CAP_EAST, task=CAP”), or  
     - More conversational (“Pushed a CAP of two F‑16s to cover the east, since Red is heavy there”)?

5. **Decision tempo**  
   - How often should BFIS be *allowed* to change things in Autopilot?
     - Every snapshot if it sees something?  
     - Only every N seconds/minutes unless something urgent happens?  
   - Do you want an explicit idea of “urgency” for actions (e.g., emergency response vs routine shaping)?

6. **Player interaction channel**  
   - For Copilot MVP, what’s the simplest interaction you actually want to support:
     - Text chat in a console/terminal?
     - Some existing UI panel in Olympus later (even if not MVP)?
     - Voice is mentioned in the docs; is that MVP or clearly post‑MVP for you?  
   - Should BFIS remember a bit of conversation context (“earlier you asked for…”) in MVP, or keep it stateless (“each request stands alone”)?

7. **Scope of “understanding” mission context**  
   - Do you expect MVP BFIS to understand:
     - Only very concrete commands (“spawn 2 F‑16s at this zone”), or  
     - Higher‑level ideas (“reinforce Blue air defense in the north” → BFIS chooses how)?  
   - How much “initiative” should it have in Autopilot:
     - Acting strictly on simple heuristics (e.g., unit counts), or  
     - Being allowed to invent higher‑level plans (“set up CAP, then SEAD, then strike”)?

8. **Logging / replay expectations**  
   - When you imagine replaying logs, what question do you most want to answer?
     - “Why did BFIS do X at time T?”
     - “What did BFIS do during this mission?”
     - “How much did BFIS cost me in units?”  
   - Are you comfortable with logs including short paraphrases of user requests (“user asked to reinforce east CAP”), or do you want them even more minimal in v1?

9. **“Out of bounds” for BFIS (your personal line)**  
   - Beyond the constitution’s rules, do *you* have any intuitive “hell no” areas?
     - For example: “BFIS should never mess with player‑controlled flights,”  
       or “BFIS should never end a mission or restart it”?
