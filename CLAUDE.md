# The Climbing Ghost

A browser-based "Active Matter" physics simulation using Verlet integration to visualize emergent biological behaviors. Particles actively herd together and climb upon neighbors to form dynamic, growing structures ("Ghosts") that fight gravity.

> **IMPORTANT FOR AI ASSISTANTS:**
> This file is the **source of truth** for architectural constraints and physics logic.
> All generated code must adhere strictly to the **Verlet Integration** pattern and the specific **Active Matter rules** (Herding/Climbing) defined below. Do not deviate without explicit instruction.

## Critical: Environment Rules
- **Runtime:** Node.js (LTS).
- **Build Tool:** Vite.
- **Language:** TypeScript (Strict mode).
- **Rendering:** HTML5 Canvas API (Context 2D).
- **Formatting:** Use standard Prettier/ESLint defaults.

---

## Code Documentation Style
**Embed physics logic directly in code comments.**
Complex vector math and behavioral rules must be explained in-line.
* **Example:**
    ```typescript
    // === BEHAVIOR: SHOULDER CLIMBING ===
    // If neighbor is higher, apply upward force to self AND downward force to neighbor (Newton's 3rd)
    ```

---

## Project Philosophy
- **Target Audience:** Physics enthusiasts, general audience interested in emergent behavior (LinkedIn-ready).
- **Narrative:** Celebrating 100 Years of Pauli Exclusion Principle (1925-2025).
- **Strategy:** Physics-first. Features are added by modifying particle interaction rules (Hamiltonians), not by hard-coding states.
- **Maintenance Priority:** Physics fidelity and Code Clarity > Micro-optimizations (except where N^2 complexity breaks the sim).
- **Architecture Style:** Client-side Simulation Engine (Class-based).

---

## Tech Stack

### Backend
*None (Client-side only application)*

### Frontend
| Concern | Technology |
|---------|------------|
| Language | TypeScript |
| Build Tool | Vite |
| Rendering | HTML5 Canvas |
| Styling | CSS (Vanilla) |
| State | In-memory Object (`SimulationParams`) |

---

## Folder Structure
/
├── index.html                  # Entry point (UI layout)
├── src/
│   ├── main.ts                 # App entry, UI binding, LocalStorage management, Macro parameter mapping
│   ├── Simulation.ts           # Core Physics Engine & Renderer
│   ├── style.css               # Museum exhibit styling
│   └── vite-env.d.ts           # TS definitions
├── package.json
└── CLAUDE.md                   # Project Knowledge Base

---

## Architectural Patterns

### Physics Engine (Core)
- **Verlet Integration:** Movement is calculated based on `currentPos - oldPos` (velocity) + acceleration.
- **Spatial Hashing:** A `SpatialGrid` class buckets particles into cells to optimize collision and neighbor detection from $O(N^2)$ to $O(N)$.
- **Soft-Body Dynamics:** Collision resolution allows for slight overlap ("Soft Spheres") to simulate pressure/compression.
- **Dual Topology System:** Physics engine supports two distinct topologies with separate force/boundary implementations.

### Emergent Behaviors (The Hamiltonian)
The simulation is driven by three conflicting forces:
1.  **Pauli Exclusion:** Particles resist overlap (Volume).
2.  **The Scrum (Cohesion):** Particles attract to their neighbors' centroid (Herding).
3.  **King of the Hill (Climbing):** Particles seek the highest local neighbor and apply force to climb on top of them.

### Topology System
The simulation supports two distinct physical topologies:

#### Flat Earth Mode (Default)
- **Gravity:** Uniform downward force
- **Floor:** Horizontal boundary at bottom of canvas
- **Walls:** Vertical container boundaries (user-adjustable)
- **Cohesion:** Strong horizontal + dynamic vertical (30x boost when grounded)
- **Climbing:** Upward onto higher neighbors (Y-axis based)
- **Coloring:** Vertical height gradient (bottom=hot, top=cool)
- **Spawning:** Rectangular region above floor

#### Planetoid Mode
- **Gravity:** Radial inward force toward planet center
- **Floor:** Circular planet core (user can drag/resize 30-300px)
- **Ceiling:** Soft atmospheric boundary (progressive inward pull, no hard wall)
- **Cohesion:** Tangential projection (slides around surface, prevents tunneling into core)
- **Climbing:** Radial outward onto neighbors closer to center
- **Coloring:** Radial distance gradient (core=hot, outer=cool)
- **Spawning:** Polar coordinates in annular ring around planet
- **Visual:** 12 pulsing ornaments (festive colors) decorating planet surface

### UI/UX Architecture (Abstraction Layer)
The interface uses **Macro Parameters** that map to underlying physics:
- **Preset System:** 3 narrative scenarios (Inert Matter, Active Ghost, Quantum Collapse).
- **Topology Selector:** Radio buttons to switch between Flat Earth and Planetoid modes.
- **Macro Sliders:** High-level controls with gamma correction curves.
- **Collapsible Panel:** Control panel can be hidden to view full simulation.
- **No Direct Physics Access:** Users cannot break the simulation with invalid parameter combinations.

---

## Coding Conventions

### Naming & Style
- **Classes:** PascalCase (`Simulation`, `Particle`, `SpatialGrid`).
- **Variables/Methods:** camelCase (`applyForces`, `resolveCollisions`).
- **Constants:** SCREAMING_SNAKE_CASE (`GRID_CELL_SIZE`, `SUB_STEPS`).

### State Management
- **Macro Parameters:** User-facing controls (`MacroParams` in `main.ts`) that map to physics values.
- **Simulation Parameters:** Internal physics values (`SimulationParams` in `Simulation.ts`).
- **Persistence:** Macro parameters saved to `localStorage` to preserve user sessions.
- **Particle State:** Each `Particle` maintains its own physics state (`x`, `y`, `pressure`, `velocity`, `cellIndex`).
- **Planet State:** Dynamic planet position/radius stored in `Simulation` class (not persisted).

### Physics Logic
- **Newton's Third Law:** Forces between particles (especially climbing) must be applied as **Action/Reaction** pairs (Equal and Opposite).
- **Pressure:** Calculated during collision resolution (`resolveCollisions`) and used to modulate behavior via **asymptotic curve** (never goes to zero).
- **Topology Routing:** `applyForces` and `constrainBounds` route to topology-specific implementations.

---

## Domain Specifics

### Key Physics Rules (Flat Earth Mode)
- **No Levitation:** Climbing logic must push the climber UP and the support DOWN.
- **Pressure Inhibition (Asymptotic):** "Lazy Climber" rule uses `1 / (1 + pressure * 0.5)` — particles under high pressure slow down but never stop completely.
- **The Toothpaste Effect:** Strong horizontal cohesion + Pauli Exclusion naturally forces the pile to grow upward.
- **Floor Bias ("Boiling the Floor"):** Particles touching floor receive random upward kicks to break symmetry deadlock.
- **Vacuum Effect:** Grounded particles experience 30× stronger vertical cohesion to prevent "slime trail" artifacts.
- **Grounded Support Dampening:** Reaction forces reduced to 20% when support is on floor to prevent pinning particles down.

### Key Physics Rules (Planetoid Mode)
- **Radial Gravity:** Force always points toward dynamic planet center.
- **Tangential Cohesion:** Cohesion force projected onto tangent plane to prevent tunneling into planet core.
- **Radial Climbing:** Particles climb outward (away from center) onto neighbors closer to center.
- **Soft Atmospheric Boundary:** Progressive inward force starts at 60% of max radius, uses quadratic scaling.
- **Circular Floor:** Particles bounce off planet surface with radial reflection.
- **Floor Jitter:** Radial outward kicks for particles near planet surface.
- **Grounded Cohesion:** 3× tangential boost for particles on planet surface.

### Parameter Mappings (main.ts)

#### Gravity (Quadratic Scaling)
- **User sees:** 0-100% slider
- **Physics gets:** `(percent/100)² × 4` → Range: 0 to 4
- **Key point:** 50% = 1.0 (earth-like)
- **Why:** Gentle control in lower range, aggressive in upper range

#### Pauli Exclusion (Gamma 2.25)
- **User sees:** 0-100% slider
- **Physics gets:** Stiffness from 0.001 to 0.4
- **Gamma curve:** `(percent/100)^2.25 × range + min`
- **Key point:** 50% slider = 21% physics (sweet spot tuning)
- **Why:** More control in useful lower-middle range

#### Life Force (Gamma 2.4, Renormalized)
- **User sees:** 0-100% slider
- **Physics gets:**
  - Cohesion: 0.075 to 0.15
  - Climb Drive: 0.25 to 0.5
  - Perception: 15 to 30
- **Gamma curve:** `(percent/100)^2.4 × range + min`
- **Key point:** 50% slider = 29% physics (sweet spot tuning)
- **Why:** Controls multiple parameters simultaneously, expanded useful range

#### Particle Count → Container Width (Exponential Ease-Out)
- **User sees:** 50 to 2025 particles (desktop), 50 to 1200 (mobile)
- **Physics gets:** Container width from 250px to 90% of viewport
- **Curve:** `1 - (1-t)⁵` where t = normalized particle count
- **Why:** Container reaches near-max early to give particles breathing room
- **Mobile:** Container always equals viewport width

### Mouse/Touch Interaction ("The God Hand")
Users can influence particles directly:

#### Hover (Desktop)
- **Effect:** Gentle repulsion (particles avoid cursor)
- **Radius:** 100px
- **Strength:** 0.15 (progressive falloff)
- **Purpose:** Explore ghost behavior without disrupting it

#### Click/Touch (All Platforms)
- **Effect:** Strong attraction (particles pulled toward cursor)
- **Radius:** 200px
- **Strength:** 0.3 (progressive falloff)
- **Purpose:** "Grab" and drag the ghost around

#### Planet Interaction (Planetoid Mode Only)
- **Drag Interior:** Relocate planet anywhere on canvas
- **Drag Edge:** Resize planet (30px to 300px radius)
- **Visual Feedback:** Subtle cyan glow on hover (edge or interior)
- **Cursor:** Changes to `move` (interior) or `ew-resize` (edge)
- **Disabled During:** Planet manipulation disables particle attraction/repulsion

### Container Edge Dragging (Flat Earth Mode, Desktop Only)
- **Visual:** Draggable vertical lines at container boundaries
- **Effect:** Resize container width independently of particle count
- **Freedom:** Container becomes "free" from particle count slider when manually adjusted
- **Reset:** Container freedom preserved through reset button
- **Hidden:** Edges hidden when in Planetoid mode

### Visualization

#### Color System
- **Flat Earth:** Vertical height + pressure
  - Bottom particles: Hot/bright (high pressure)
  - Top particles: Cool/dim (low pressure)
- **Planetoid:** Radial distance + pressure
  - Core particles: Hot/bright (high pressure)
  - Outer particles: Cool/dim (low pressure)

#### Stats Display
- **Desktop:** Bottom-left corner
- **Mobile:** Top-center
- **Content:** Pile height, average pressure, particle count
- **Throttling:** Updates every 500ms (performance optimization)
- **Hidden:** When control panel is collapsed

#### Planet Ornaments (Planetoid Mode)
- **Count:** 12 decorative spots around planet surface
- **Colors:** Red, Green, Deep Blue, Warm White, Magenta, Orange, Cyan
- **Animation:** Gentle pulsing (2 Hz sine wave with phase offset)
- **Glow:** Subtle shadow blur effect
- **Purpose:** Visual interest, centennial celebration aesthetic

---

## Building & Running

### Prerequisites
- Node.js (v18+)
- npm

### Development Commands
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Implemented Features

### Physics Engine
- [x] Verlet Physics Engine: Basic integration and boundary constraints.
- [x] Spatial Hash Grid: Performance optimization for 2000+ particles.
- [x] Dual Topology System: Flat Earth and Planetoid modes with topology-specific physics.
- [x] Active Cohesion: "The Scrum" behavior (Lateral herding with dynamic vertical).
- [x] Tangential Cohesion (Planetoid): Prevents particles from tunneling through planet core.
- [x] Climbing Drive: "King of the Hill" behavior (Upward/Outward propulsion with Newton's 3rd Law).
- [x] Floor Bias: Symmetry breaking to prevent flatness trap (both topologies).
- [x] Asymptotic Pressure Inhibition: Prevents complete deadlock in deep piles.
- [x] Vacuum Effect: Dynamic cohesion boost for grounded particles.
- [x] Grounded Support Dampening: Prevents "slime trail" artifacts.
- [x] Soft Atmospheric Boundary (Planetoid): Progressive inward force, no hard outer ceiling.

### UI/UX
- [x] Preset System: 3 narrative scenarios (Inert Matter, Active Ghost, Quantum Collapse).
- [x] Topology Selector: Radio buttons to switch between Flat Earth and Planetoid.
- [x] Macro Sliders: Abstracted controls with gamma correction (Gravity, Pauli, Life Force, Particle Count).
- [x] Collapsible Control Panel: Hide/show with animated tab.
- [x] Museum Exhibit Aesthetic: Clean, educational design for LinkedIn sharing (100 Years header).
- [x] Visualization: Height/Pressure heatmap rendering (topology-aware).
- [x] Persistence: Macro parameters save to LocalStorage.
- [x] Responsive: Desktop-first with mobile adaptations.
- [x] Stats Display: Throttled updates, position adapts to platform, hides when panel collapsed.
- [x] Planet Ornaments: 12 pulsing decorative lights in festive colors.

### Parameter Mappings
- [x] Quadratic Gravity Scaling: 50% slider = 1.0 gravity (earth-like).
- [x] Gamma Correction (Pauli): Exponent 2.25, 50% slider = 21% physics.
- [x] Gamma Correction (Life Force): Exponent 2.4, 50% slider = 29% physics, controls 3 parameters.
- [x] Exponential Container Width: Linked to particle count, reaches max early.
- [x] Hidden Constants: Friction, jitter, speed optimized and locked.

### Interaction
- [x] Mouse Hover Repulsion: Gentle avoidance (0.15 strength, 100px radius).
- [x] Click/Touch Attraction: Strong grab (0.3 strength, 200px radius).
- [x] Planet Dragging (Planetoid): Relocate planet by dragging interior.
- [x] Planet Resizing (Planetoid): Resize planet (30-300px) by dragging edge.
- [x] Container Edge Dragging (Flat Earth, Desktop): Manually resize container width.
- [x] Visual Feedback: Cursor changes, subtle hover glows (planet/container edges).

### Mobile Adaptations
- [x] Container Width: Always viewport width on mobile.
- [x] Max Particles: 1200 on mobile (vs 2025 on desktop).
- [x] Planet Size: 40% smaller diameter on mobile (60px vs 100px default).
- [x] Stats Position: Top-center on mobile (vs bottom-left on desktop).
- [x] Control Panel: Frosted glass effect, bottom-positioned.
- [x] Container Edges: Hidden on mobile (desktop-only feature).

---

## Known Limitations & Design Decisions
- **Desktop-First:** Optimized for larger screens; mobile support functional but secondary.
- **Max Particles:** 2025 desktop / 1200 mobile (anniversary theme + performance ceiling).
- **No Undo/Redo:** Simulation state is ephemeral; only macro parameters persist.
- **Presets Don't Control Particle Count:** User maintains manual control to prevent jarring resets.
- **Planet State Not Persisted:** Planet position/size resets to center/default on page reload.
- **No localStorage for Planet:** Intentional - allows fresh start each session.
- **Gamma Curves Tuned:** Sweet spots at 50% slider were empirically determined for "best feel".
