// Particle class using Verlet integration
// Active Matter: Particles with "urges" - herding and climbing
export class Particle {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  radius: number;
  width: number;

  // Pressure from overlapping neighbors
  pressure: number;

  // Grid cell index (for spatial hashing)
  cellIndex: number;

  constructor(x: number, y: number, radius: number = 10) {
    this.x = x;
    this.y = y;
    this.oldX = x;
    this.oldY = y;
    this.radius = radius;
    this.width = radius * 2;
    this.pressure = 0;
    this.cellIndex = -1;
  }

  get velocityX(): number {
    return this.x - this.oldX;
  }

  get velocityY(): number {
    return this.y - this.oldY;
  }

  get speed(): number {
    const vx = this.velocityX;
    const vy = this.velocityY;
    return Math.sqrt(vx * vx + vy * vy);
  }
}

// Spatial Hash Grid for O(N) neighbor lookups
class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private cells: Particle[][];

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize) + 1;
    this.rows = Math.ceil(height / cellSize) + 1;
    this.cells = [];

    // Pre-allocate cells
    for (let i = 0; i < this.cols * this.rows; i++) {
      this.cells[i] = [];
    }
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].length = 0;
    }
  }

  private getCellIndex(x: number, y: number): number {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    // Clamp to valid range
    const clampedCol = Math.max(0, Math.min(col, this.cols - 1));
    const clampedRow = Math.max(0, Math.min(row, this.rows - 1));
    return clampedRow * this.cols + clampedCol;
  }

  insert(particle: Particle): void {
    const index = this.getCellIndex(particle.x, particle.y);
    particle.cellIndex = index;
    this.cells[index].push(particle);
  }

  // Get all particles in the same cell and neighboring cells
  getNeighborCandidates(particle: Particle): Particle[] {
    const col = Math.floor(particle.x / this.cellSize);
    const row = Math.floor(particle.y / this.cellSize);
    const candidates: Particle[] = [];

    // Check 3x3 grid of cells (current + 8 neighbors)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const r = row + dr;

        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
          const cellIndex = r * this.cols + c;
          const cell = this.cells[cellIndex];
          for (let i = 0; i < cell.length; i++) {
            candidates.push(cell[i]);
          }
        }
      }
    }

    return candidates;
  }

  resize(width: number, height: number): void {
    this.cols = Math.ceil(width / this.cellSize) + 1;
    this.rows = Math.ceil(height / this.cellSize) + 1;

    // Resize cells array
    const totalCells = this.cols * this.rows;
    while (this.cells.length < totalCells) {
      this.cells.push([]);
    }
  }
}

// Simulation parameters
export interface SimulationParams {
  gravity: number;
  baseJitter: number;
  friction: number;
  stiffness: number;     // Collision stiffness (lower = softer, more overlap)
  cohesion: number;      // Strength of lateral herding (The Scrum)
  climbDrive: number;    // Strength of upward climbing (King of the Hill)
  perceptionRadius: number; // How far particles can "see" neighbors
  containerWidth: number;   // Width of the container (pixels)
  speed: number;            // Simulation speed multiplier (1 = normal)
  particleCount: number;
  topology: 'flat' | 'planet'; // Topology mode: flat floor or radial planet
}

// Main simulation class - Active Matter "Climbing Ghost"
export class Simulation {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private params: SimulationParams;
  private animationId: number = 0;
  private lastTime: number = 0;
  private lastStatsUpdate: number = 0;
  private cachedStatsText: string = '';

  // Spatial hash grid for O(N) neighbor lookups
  private grid: SpatialGrid;

  // Input tracking (mouse/touch)
  private inputX: number = 0;
  private inputY: number = 0;
  private isInputActive: boolean = false; // Click/touch is down
  private hasInput: boolean = false; // Mouse is on canvas

  // Planet state (dynamic in planetoid mode)
  private planetCenterX: number = 0;
  private planetCenterY: number = 0;
  private planetRadius: number = 100;
  private isDraggingPlanet: boolean = false;
  private isResizingPlanet: boolean = false;
  private planetDragOffsetX: number = 0;
  private planetDragOffsetY: number = 0;
  private planetHoverState: 'none' | 'edge' | 'interior' = 'none';

  // Planet ornaments (decorative glowing spots)
  private planetOrnaments: Array<{ angle: number; color: string; glowIntensity: number; phase: number }> = [];

  // Lava veins (fractal lightning-like paths)
  private lavaVeins: Array<{ x: number; y: number }[]> = [];
  private lavaParticles: Array<{
    veinIndex: number;
    progress: number; // 0-1 along the vein
    speed: number;
    trailColors: string[];
  }> = [];
  private lavaVeinsHidden: boolean = false;

  // Physics constants
  private readonly DAMPING = 0.98;
  private readonly COLLISION_ITERATIONS = 4;
  private readonly SUB_STEPS = 2;
  private readonly GRID_CELL_SIZE = 30; // Slightly larger than particle diameter

  constructor(canvas: HTMLCanvasElement, params: SimulationParams) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.params = params;

    this.resize();
    this.grid = new SpatialGrid(this.canvas.width, this.canvas.height, this.GRID_CELL_SIZE);

    // Initialize planet position at center
    this.planetCenterX = this.canvas.width / 2;
    this.planetCenterY = this.canvas.height / 2;
    // Mobile: 40% smaller diameter = 60% of desktop radius
    const isMobile = window.innerWidth <= 600;
    this.planetRadius = isMobile ? 60 : 100;
    this.initPlanetOrnaments();
    this.initLavaVeins();

    window.addEventListener('resize', () => this.resize());
    this.setupInputListeners();

    this.initParticles();
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.grid) {
      this.grid.resize(this.canvas.width, this.canvas.height);
    }
    // Re-center planet on resize
    this.planetCenterX = this.canvas.width / 2;
    this.planetCenterY = this.canvas.height / 2;
  }

  private initPlanetOrnaments(): void {
    // Create decorative glowing ornaments around the planet
    const ornamentColors = [
      '#ff3333', // Red
      '#33ff33', // Green
      '#3366ff', // Deep blue
      '#ffe6cc', // Warm white
      '#ff66ff', // Magenta
      '#ffaa00', // Orange
      '#00ffff', // Cyan
    ];

    this.planetOrnaments = [];
    const ornamentCount = 12; // Evenly distributed around planet

    for (let i = 0; i < ornamentCount; i++) {
      this.planetOrnaments.push({
        angle: (i / ornamentCount) * Math.PI * 2,
        color: ornamentColors[i % ornamentColors.length],
        glowIntensity: 0.3 + Math.random() * 0.4, // Vary brightness
        phase: Math.random() * Math.PI * 2, // For pulsing animation
      });
    }
  }

  private initLavaVeins(): void {
    // Generate fractal lava veins using midpoint displacement algorithm
    // Veins are stored RELATIVE to planet center (0,0) and translated when drawing
    const radius = this.planetRadius;

    this.lavaVeins = [];
    this.lavaParticles = [];

    // Create 5-6 main veins radiating from center
    const mainVeinCount = 5 + Math.floor(Math.random() * 2);

    for (let i = 0; i < mainVeinCount; i++) {
      // Random angle for this vein
      const angle = (i / mainVeinCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;

      // Start slightly off-center, end at edge (relative to 0,0)
      const startDist = radius * 0.15;
      const endDist = radius * 0.95;

      const startX = Math.cos(angle) * startDist;
      const startY = Math.sin(angle) * startDist;
      const endX = Math.cos(angle) * endDist;
      const endY = Math.sin(angle) * endDist;

      // Generate fractal path using midpoint displacement
      const mainPath = this.generateFractalPath(startX, startY, endX, endY, 5, radius * 0.15);
      this.lavaVeins.push(mainPath);

      // Add 1-2 branches from random points along the main vein
      const branchCount = 1 + Math.floor(Math.random() * 2);
      for (let b = 0; b < branchCount; b++) {
        // Pick a point 30-70% along the main path
        const branchPointIndex = Math.floor(mainPath.length * (0.3 + Math.random() * 0.4));
        const branchPoint = mainPath[branchPointIndex];

        // Branch angle: deviate 30-60 degrees from main direction
        const branchAngle = angle + (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5);
        const branchLength = radius * (0.2 + Math.random() * 0.3);
        const branchEndX = branchPoint.x + Math.cos(branchAngle) * branchLength;
        const branchEndY = branchPoint.y + Math.sin(branchAngle) * branchLength;

        // Shorter recursion depth for branches
        const branchPath = this.generateFractalPath(
          branchPoint.x, branchPoint.y,
          branchEndX, branchEndY,
          3, radius * 0.08
        );
        this.lavaVeins.push(branchPath);
      }
    }

    // Create particles for each vein
    const trailColorSets = [
      ['#ffffff', '#ffffaa', '#ffcc44', '#ff6600', '#cc3300'], // White to red
      ['#ffffff', '#ffeecc', '#ffaa44', '#ff5500', '#aa2200'], // Warm white to dark red
      ['#ffffcc', '#ffdd66', '#ff9933', '#ff4400', '#991100'], // Yellow to crimson
    ];

    for (let v = 0; v < this.lavaVeins.length; v++) {
      // 2-3 particles per vein
      const particleCount = 2 + Math.floor(Math.random() * 2);
      for (let p = 0; p < particleCount; p++) {
        this.lavaParticles.push({
          veinIndex: v,
          progress: Math.random(), // Start at random position
          speed: 0.002 + Math.random() * 0.003, // Varying speeds
          trailColors: trailColorSets[Math.floor(Math.random() * trailColorSets.length)],
        });
      }
    }
  }

  private generateFractalPath(
    x1: number, y1: number,
    x2: number, y2: number,
    depth: number,
    displacement: number
  ): { x: number; y: number }[] {
    // Base case: return endpoints
    if (depth === 0) {
      return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }

    // Find midpoint and displace perpendicular to line
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // Perpendicular direction
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / len;
    const perpY = dx / len;

    // Random displacement
    const offset = (Math.random() - 0.5) * 2 * displacement;
    const newMidX = midX + perpX * offset;
    const newMidY = midY + perpY * offset;

    // Recurse on both halves with reduced displacement
    const left = this.generateFractalPath(x1, y1, newMidX, newMidY, depth - 1, displacement * 0.55);
    const right = this.generateFractalPath(newMidX, newMidY, x2, y2, depth - 1, displacement * 0.55);

    // Combine (remove duplicate midpoint)
    return [...left.slice(0, -1), ...right];
  }

  private setupInputListeners(): void {
    // === MOUSE EVENTS ===
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      this.inputX = e.clientX;
      this.inputY = e.clientY;
      this.hasInput = true;

      // Handle planet dragging/resizing
      if (this.params.topology === 'planet') {
        if (this.isDraggingPlanet) {
          this.planetCenterX = this.inputX - this.planetDragOffsetX;
          this.planetCenterY = this.inputY - this.planetDragOffsetY;
        } else if (this.isResizingPlanet) {
          const dx = this.inputX - this.planetCenterX;
          const dy = this.inputY - this.planetCenterY;
          const newRadius = Math.sqrt(dx * dx + dy * dy);
          this.planetRadius = Math.max(30, Math.min(300, newRadius)); // Clamp 30-300px
        } else {
          // Update hover state
          this.updatePlanetHoverState();
        }

        // Update cursor style
        if (this.planetHoverState === 'edge') {
          this.canvas.style.cursor = 'ew-resize';
        } else if (this.planetHoverState === 'interior') {
          this.canvas.style.cursor = 'move';
        } else {
          this.canvas.style.cursor = 'default';
        }
      }
    });

    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      this.inputX = e.clientX;
      this.inputY = e.clientY;
      this.isInputActive = true;
      this.hasInput = true;

      // Start planet drag/resize in planetoid mode
      if (this.params.topology === 'planet') {
        this.updatePlanetHoverState();
        if (this.planetHoverState === 'edge') {
          this.isResizingPlanet = true;
          this.lavaVeinsHidden = true; // Hide veins during resize
        } else if (this.planetHoverState === 'interior') {
          this.isDraggingPlanet = true;
          this.planetDragOffsetX = this.inputX - this.planetCenterX;
          this.planetDragOffsetY = this.inputY - this.planetCenterY;
        }
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      // Regenerate lava veins after resize ends
      if (this.isResizingPlanet) {
        this.initLavaVeins();
        this.lavaVeinsHidden = false;
      }
      this.isInputActive = false;
      this.isDraggingPlanet = false;
      this.isResizingPlanet = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      // Regenerate lava veins if we were resizing
      if (this.isResizingPlanet) {
        this.initLavaVeins();
        this.lavaVeinsHidden = false;
      }
      this.hasInput = false;
      this.isInputActive = false;
      this.isDraggingPlanet = false;
      this.isResizingPlanet = false;
      this.planetHoverState = 'none';
      this.canvas.style.cursor = 'default';
    });

    // === TOUCH EVENTS ===
    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        this.inputX = e.touches[0].clientX;
        this.inputY = e.touches[0].clientY;
        this.isInputActive = true;
        this.hasInput = true;

        // Start planet drag/resize
        if (this.params.topology === 'planet') {
          this.updatePlanetHoverState();
          if (this.planetHoverState === 'edge') {
            this.isResizingPlanet = true;
            this.lavaVeinsHidden = true; // Hide veins during resize
          } else if (this.planetHoverState === 'interior') {
            this.isDraggingPlanet = true;
            this.planetDragOffsetX = this.inputX - this.planetCenterX;
            this.planetDragOffsetY = this.inputY - this.planetCenterY;
          }
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        this.inputX = e.touches[0].clientX;
        this.inputY = e.touches[0].clientY;
        this.hasInput = true;

        // Handle planet dragging/resizing
        if (this.params.topology === 'planet') {
          if (this.isDraggingPlanet) {
            this.planetCenterX = this.inputX - this.planetDragOffsetX;
            this.planetCenterY = this.inputY - this.planetDragOffsetY;
          } else if (this.isResizingPlanet) {
            const dx = this.inputX - this.planetCenterX;
            const dy = this.inputY - this.planetCenterY;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            this.planetRadius = Math.max(30, Math.min(300, newRadius));
          }
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      // Regenerate lava veins after resize ends
      if (this.isResizingPlanet) {
        this.initLavaVeins();
        this.lavaVeinsHidden = false;
      }
      this.isInputActive = false;
      this.hasInput = false;
      this.isDraggingPlanet = false;
      this.isResizingPlanet = false;
      this.planetHoverState = 'none';
    });
  }

  private updatePlanetHoverState(): void {
    const dx = this.inputX - this.planetCenterX;
    const dy = this.inputY - this.planetCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Larger touch target on mobile for easier resizing
    const isMobile = window.innerWidth <= 600;
    const edgeThreshold = isMobile ? 30 : 15;

    if (Math.abs(dist - this.planetRadius) < edgeThreshold) {
      this.planetHoverState = 'edge';
    } else if (dist < this.planetRadius - edgeThreshold) {
      this.planetHoverState = 'interior';
    } else {
      this.planetHoverState = 'none';
    }
  }

  private getContainerBounds(): { left: number; right: number } {
    const centerX = this.canvas.width / 2;
    const halfWidth = this.params.containerWidth / 2;
    return {
      left: centerX - halfWidth,
      right: centerX + halfWidth,
    };
  }

  private getPlanetRadius(): number {
    // Return dynamic planet radius
    // Mobile gets smaller default on init, but user can resize freely
    return this.planetRadius;
  }

  initParticles(): void {
    this.particles = [];

    if (this.params.topology === 'planet') {
      // === PLANET MODE: Polar coordinate spawn (random angle + radial distance) ===
      const centerX = this.planetCenterX;
      const centerY = this.planetCenterY;
      const planetRadius = this.getPlanetRadius();

      // Spawn particles in an annular region around the planet
      const minRadius = planetRadius + 15; // Just above planet surface
      const maxRadius = planetRadius + 150; // Spread them out in a ring

      for (let i = 0; i < this.params.particleCount; i++) {
        // Random polar coordinates
        const angle = Math.random() * Math.PI * 2; // 0 to 2π
        const radius = minRadius + Math.random() * (maxRadius - minRadius);

        // Convert polar to cartesian
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        this.particles.push(new Particle(x, y, 10));
      }
    } else {
      // === FLAT EARTH MODE: Rectangular spawn area (original logic) ===
      const { left, right } = this.getContainerBounds();
      const containerWidth = right - left;
      const floorY = this.canvas.height;
      const spawnWidth = containerWidth * 0.8;
      const spawnHeight = this.canvas.height * 0.4;
      const centerX = (left + right) / 2;

      for (let i = 0; i < this.params.particleCount; i++) {
        const x = centerX + (Math.random() - 0.5) * spawnWidth;
        const y = floorY - Math.random() * spawnHeight - 20;
        this.particles.push(new Particle(x, y, 10));
      }
    }
  }

  updateParams(params: Partial<SimulationParams>): void {
    Object.assign(this.params, params);
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.particles.length; i++) {
      this.grid.insert(this.particles[i]);
    }
  }

  private applyForcesFlat(dt: number): void {
    const gravity = this.params.gravity;
    const baseJitter = this.params.baseJitter;
    const cohesion = this.params.cohesion;
    const climbDrive = this.params.climbDrive;
    const perceptionRadius = this.params.perceptionRadius;
    const perceptionRadiusSq = perceptionRadius * perceptionRadius;

    const particles = this.particles;
    const len = particles.length;

    for (let i = 0; i < len; i++) {
      const p = particles[i];

      const tempX = p.x;
      const tempY = p.y;

      let vx = (p.x - p.oldX) * this.DAMPING;
      let vy = (p.y - p.oldY) * this.DAMPING;

      // === GRAVITY (The Weight) ===
      vy += gravity * dt;

      // === THERMAL NOISE (The Jitter) ===
      vx += (Math.random() - 0.5) * baseJitter * dt;
      vy += (Math.random() - 0.5) * baseJitter * dt;

      // === FLOOR BIAS: "Boiling the Floor" (Symmetry Breaking) ===
      // Particles touching the floor get a small random upward kick
      // This prevents the flatness trap where everyone is at the same height
      const onFloor = p.y >= this.canvas.height - p.radius - 2;
      if (onFloor) {
        vy -= Math.random() * 0.5 * baseJitter * dt; // Random upward bias
      }

      // === FIND NEIGHBORS (Using Spatial Grid) ===
      let neighborCount = 0;
      let centroidX = 0;
      let centroidY = 0;
      let highestNeighbor: Particle | null = null;
      let highestY = p.y; // Lower y = higher position

      const candidates = this.grid.getNeighborCandidates(p);
      for (let j = 0; j < candidates.length; j++) {
        const other = candidates[j];
        if (other === p) continue;

        const dx = other.x - p.x;
        const dy = other.y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < perceptionRadiusSq && distSq > 0.0001) {
          neighborCount++;
          centroidX += other.x;
          centroidY += other.y;

          // Track highest neighbor (lowest Y)
          if (other.y < highestY) {
            highestY = other.y;
            highestNeighbor = other;
          }
        }
      }

      // === BEHAVIOR A: THE SCRUM (Strictly Horizontal Herding) ===
      // Particles squeeze together laterally - forces overflow upward
      if (neighborCount > 0) {
        centroidX /= neighborCount;
        centroidY /= neighborCount;

        const toCentroidX = centroidX - p.x;
        const toCentroidY = centroidY - p.y;

        // === THE VACUUM EFFECT: Dynamic Vertical Cohesion ===
        // If particle is stuck on floor, group pulls HARD upward (picks up its feet)
        // If airborne, weak vertical pull (prevents levitation)
        const isGrounded = p.y >= this.canvas.height - p.radius - 2;
        const verticalScale = isGrounded ? 3.0 : 0.1;

        // STRONG horizontal squeeze, dynamic vertical
        vx += toCentroidX * cohesion * 5.0 * dt;
        vy += toCentroidY * cohesion * verticalScale * dt;
      }

      // === BEHAVIOR B: SHOULDER CLIMBING (King of the Hill) ===
      // Climb UP onto neighbors, not just toward them
      // NOW WITH NEWTON'S THIRD LAW: Climbing pushes the support DOWN
      if (highestNeighbor && highestNeighbor.y < p.y - 5) {
        // === PRESSURE STABILIZATION: "The Lazy Climber" ===
        // Particles under high pressure (core) slow down climbing to stabilize foundation
        // Uses asymptotic curve: never goes to zero, preventing complete deadlock
        // pressureInhibition: 1.0 when free (pressure=0), approaches 0 asymptotically
        const pressureInhibition = 1 / (1 + p.pressure * 0.5);

        const dx = highestNeighbor.x - p.x;

        // Calculate raw climb forces (modulated by pressure)
        // Horizontal: Move toward the neighbor (to get under/beside them)
        const horizontalForce = Math.sign(dx) * climbDrive * 0.5 * dt * pressureInhibition;

        // Vertical: Strong upward push (clamber up onto their shoulders)
        let verticalForce = -climbDrive * 2.0 * dt * pressureInhibition; // Negative = upward

        // === FORCE CLAMPING: "The Struggle Cap" ===
        // Prevent anti-gravity levitation by limiting upward force
        // Particles can lift their own weight (gravity) + a bit extra, but cannot fly
        // maxUpwardForce allows lifting self + 50% extra for acceleration
        const maxUpwardForce = gravity * dt * 1.5;

        // Clamp the upward force (verticalForce is negative, so we clamp its absolute value)
        if (Math.abs(verticalForce) > maxUpwardForce) {
          verticalForce = -maxUpwardForce; // Maintain upward direction (negative)
        }

        // Apply forces to climber (p)
        vx += horizontalForce;
        vy += verticalForce;

        // === NEWTON'S THIRD LAW: Apply opposite force to support ===
        // In Verlet integration, velocity = (currentPos - oldPos)
        // To add force to neighbor, modify their oldPos to create opposite velocity
        // If climber goes UP (negative vy), support gets pushed DOWN (positive vy)

        // === GROUNDED SUPPORT DAMPENING: "Don't Scrub Your Own Feet" ===
        // If support is on the floor, reduce reaction force to prevent pinning them down
        const supportIsGrounded = highestNeighbor.y >= this.canvas.height - highestNeighbor.radius - 2;
        const reactionFactor = supportIsGrounded ? 0.2 : 1.0;

        highestNeighbor.oldX -= horizontalForce * reactionFactor; // Opposite horizontal reaction (dampened if grounded)
        highestNeighbor.oldY -= verticalForce;   // Opposite vertical reaction (pushed down)
      }

      // === THE GOD HAND: Mouse/Touch Interaction ===
      // Skip if we're manipulating the planet itself
      if (this.hasInput && !this.isDraggingPlanet && !this.isResizingPlanet) {
        const dx = p.x - this.inputX;
        const dy = p.y - this.inputY;
        const distSq = dx * dx + dy * dy;

        if (this.isInputActive) {
          // === STRONG ATTRACTION (Click/Touch): "Grab" particles ===
          const attractRadius = 280;
          const attractRadiusSq = attractRadius * attractRadius;

          if (distSq < attractRadiusSq) {
            const dist = Math.sqrt(distSq);
            if (dist > 1) {
              const strength = 0.6 * (1 - dist / attractRadius); // Strong magnetic pull
              vx -= (dx / dist) * strength;
              vy -= (dy / dist) * strength;
            }
          }
        } else {
          // === GENTLE REPULSION (Hover): Ghost avoids cursor ===
          const repelRadius = 100;
          const repelRadiusSq = repelRadius * repelRadius;

          if (distSq < repelRadiusSq) {
            const dist = Math.sqrt(distSq);
            if (dist > 1) {
              const strength = 0.15 * (1 - dist / repelRadius); // Stronger when closer (3x boost)
              vx += (dx / dist) * strength;
              vy += (dy / dist) * strength;
            }
          }
        }
      }

      // Apply velocities
      p.x = p.x + vx;
      p.y = p.y + vy;

      p.oldX = tempX;
      p.oldY = tempY;
    }
  }

  private applyForcesPlanet(dt: number): void {
    const gravity = this.params.gravity;
    const baseJitter = this.params.baseJitter;
    const cohesion = this.params.cohesion;
    const climbDrive = this.params.climbDrive;
    const perceptionRadius = this.params.perceptionRadius;
    const perceptionRadiusSq = perceptionRadius * perceptionRadius;

    // Planet center (dynamic - can be moved by user)
    const centerX = this.planetCenterX;
    const centerY = this.planetCenterY;
    const planetRadius = this.getPlanetRadius();

    const particles = this.particles;
    const len = particles.length;

    for (let i = 0; i < len; i++) {
      const p = particles[i];

      const tempX = p.x;
      const tempY = p.y;

      let vx = (p.x - p.oldX) * this.DAMPING;
      let vy = (p.y - p.oldY) * this.DAMPING;

      // === RADIAL GRAVITY (Toward Center) ===
      const dx = centerX - p.x;
      const dy = centerY - p.y;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);

      if (distToCenter > 0.001) {
        // Normalize and apply radial gravity
        const gravityX = (dx / distToCenter) * gravity * dt;
        const gravityY = (dy / distToCenter) * gravity * dt;
        vx += gravityX;
        vy += gravityY;
      }

      // === THERMAL NOISE (The Jitter) ===
      vx += (Math.random() - 0.5) * baseJitter * dt;
      vy += (Math.random() - 0.5) * baseJitter * dt;

      // === FLOOR BIAS: "Boiling the Surface" (Radial Outward Jitter) ===
      // Particles near the planet surface get random outward kicks
      const nearSurface = distToCenter < planetRadius + p.radius + 5;
      if (nearSurface && distToCenter > 0.001) {
        const radialJitterX = (dx / distToCenter) * (-0.5 * baseJitter * dt * Math.random());
        const radialJitterY = (dy / distToCenter) * (-0.5 * baseJitter * dt * Math.random());
        vx += radialJitterX;
        vy += radialJitterY;
      }

      // === FIND NEIGHBORS (Using Spatial Grid) ===
      let neighborCount = 0;
      let centroidX = 0;
      let centroidY = 0;
      let lowestNeighbor: Particle | null = null; // "Lower" = closer to center
      let lowestDist = distToCenter; // Current particle's distance

      const candidates = this.grid.getNeighborCandidates(p);
      for (let j = 0; j < candidates.length; j++) {
        const other = candidates[j];
        if (other === p) continue;

        const dx2 = other.x - p.x;
        const dy2 = other.y - p.y;
        const distSq = dx2 * dx2 + dy2 * dy2;

        if (distSq < perceptionRadiusSq && distSq > 0.0001) {
          neighborCount++;
          centroidX += other.x;
          centroidY += other.y;

          // Track "lowest" neighbor (closest to center = support)
          const otherDx = centerX - other.x;
          const otherDy = centerY - other.y;
          const otherDistToCenter = Math.sqrt(otherDx * otherDx + otherDy * otherDy);

          if (otherDistToCenter < lowestDist) {
            lowestDist = otherDistToCenter;
            lowestNeighbor = other;
          }
        }
      }

      // === BEHAVIOR A: THE SCRUM (Tangential Cohesion) ===
      // Project cohesion force onto tangent plane to prevent tunneling into planet
      if (neighborCount > 0) {
        centroidX /= neighborCount;
        centroidY /= neighborCount;

        const toCentroidX = centroidX - p.x;
        const toCentroidY = centroidY - p.y;

        // Calculate normal vector (radial direction)
        const normalX = -dx / distToCenter; // Points away from center
        const normalY = -dy / distToCenter;

        // Project cohesion force onto tangent plane
        // Remove radial component to keep particles on the surface
        const radialComponent = toCentroidX * normalX + toCentroidY * normalY;
        const tangentX = toCentroidX - normalX * radialComponent;
        const tangentY = toCentroidY - normalY * radialComponent;

        // Dynamic cohesion (stronger for grounded particles)
        const isGrounded = distToCenter < planetRadius + p.radius + 5;
        const cohesionScale = isGrounded ? 3.0 : 0.1;

        // Apply ONLY tangential force (particles slide around surface to find each other)
        vx += tangentX * cohesion * cohesionScale * 5.0 * dt;
        vy += tangentY * cohesion * cohesionScale * 5.0 * dt;
      }

      // === BEHAVIOR B: RADIAL CLIMBING (King of the Hill) ===
      // Climb OUTWARD (away from center) onto neighbors closer to center
      if (lowestNeighbor && lowestDist < distToCenter - 5) {
        const pressureInhibition = 1 / (1 + p.pressure * 0.5);

        // Calculate "up" vector (radial outward from center)
        const upX = -dx / distToCenter; // Away from center
        const upY = -dy / distToCenter;

        // Vector toward neighbor
        const toNeighborX = lowestNeighbor.x - p.x;
        const toNeighborY = lowestNeighbor.y - p.y;

        // Project toNeighbor onto tangent plane (remove radial component)
        const neighborRadialDot = toNeighborX * upX + toNeighborY * upY;
        const tangentToNeighborX = toNeighborX - upX * neighborRadialDot;
        const tangentToNeighborY = toNeighborY - upY * neighborRadialDot;

        // Radial climb force (outward)
        const radialClimbForce = climbDrive * 2.0 * dt * pressureInhibition;

        // Clamp to prevent levitation
        const maxUpwardForce = gravity * dt * 1.5;
        const clampedForce = Math.min(radialClimbForce, maxUpwardForce);

        // Tangential scramble force (helps "roll" over the support)
        const tangentialScrambleForce = climbDrive * 1.5 * dt * pressureInhibition;

        // Apply forces
        vx += upX * clampedForce; // Climb outward (radial)
        vy += upY * clampedForce;
        vx += tangentToNeighborX * tangentialScrambleForce; // Scramble tangentially toward support
        vy += tangentToNeighborY * tangentialScrambleForce;

        // Newton's 3rd law: push support inward (toward center)
        const supportDx = centerX - lowestNeighbor.x;
        const supportDy = centerY - lowestNeighbor.y;
        const supportDistToCenter = Math.sqrt(supportDx * supportDx + supportDy * supportDy);

        if (supportDistToCenter > 0.001) {
          const supportIsGrounded = supportDistToCenter < planetRadius + lowestNeighbor.radius + 5;
          const reactionFactor = supportIsGrounded ? 0.2 : 1.0;

          const inwardX = (supportDx / supportDistToCenter) * clampedForce * reactionFactor;
          const inwardY = (supportDy / supportDistToCenter) * clampedForce * reactionFactor;

          lowestNeighbor.oldX += inwardX; // Push support toward center
          lowestNeighbor.oldY += inwardY;
        }
      }

      // === THE GOD HAND: Mouse/Touch Interaction ===
      // Skip if we're manipulating the planet itself
      if (this.hasInput && !this.isDraggingPlanet && !this.isResizingPlanet) {
        const dx = p.x - this.inputX;
        const dy = p.y - this.inputY;
        const distSq = dx * dx + dy * dy;

        if (this.isInputActive) {
          // === STRONG ATTRACTION (Click/Touch): "Grab" particles ===
          const attractRadius = 280;
          const attractRadiusSq = attractRadius * attractRadius;

          if (distSq < attractRadiusSq) {
            const dist = Math.sqrt(distSq);
            if (dist > 1) {
              const strength = 0.6 * (1 - dist / attractRadius); // Strong magnetic pull
              vx -= (dx / dist) * strength;
              vy -= (dy / dist) * strength;
            }
          }
        } else {
          // === GENTLE REPULSION (Hover): Ghost avoids cursor ===
          const repelRadius = 100;
          const repelRadiusSq = repelRadius * repelRadius;

          if (distSq < repelRadiusSq) {
            const dist = Math.sqrt(distSq);
            if (dist > 1) {
              const strength = 0.15 * (1 - dist / repelRadius); // Stronger when closer (3x boost)
              vx += (dx / dist) * strength;
              vy += (dy / dist) * strength;
            }
          }
        }
      }

      // Apply velocities
      p.x = p.x + vx;
      p.y = p.y + vy;

      p.oldX = tempX;
      p.oldY = tempY;
    }
  }

  private constrainBoundsFlat(): void {
    const { left, right } = this.getContainerBounds();
    const height = this.canvas.height;
    const bounce = 0.2;
    const friction = this.params.friction;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const vx = p.x - p.oldX;
      const vy = p.y - p.oldY;

      // Flat floor
      if (p.y + p.radius > height) {
        p.y = height - p.radius;
        p.oldY = p.y + vy * bounce;
        // Floor friction
        p.oldX = p.x - vx * friction;
      }

      // Ceiling
      if (p.y - p.radius < 0) {
        p.y = p.radius;
        p.oldY = p.y + vy * bounce;
      }

      // Container walls
      if (p.x - p.radius < left) {
        p.x = left + p.radius;
        p.oldX = p.x + vx * bounce;
      }
      if (p.x + p.radius > right) {
        p.x = right - p.radius;
        p.oldX = p.x + vx * bounce;
      }
    }
  }

  private constrainBoundsPlanet(): void {
    const centerX = this.planetCenterX;
    const centerY = this.planetCenterY;
    const planetRadius = this.getPlanetRadius();
    const bounce = 0.2;
    const friction = this.params.friction;

    // Outer ceiling - keep particles inside canvas
    const maxRadius = Math.min(this.canvas.width, this.canvas.height) / 2 - 20;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const vx = p.x - p.oldX;
      const vy = p.y - p.oldY;

      // Calculate distance from center
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);

      if (distToCenter < 0.001) continue; // Avoid division by zero

      // === CIRCULAR FLOOR (Planet Surface) ===
      // Keep particles outside the planet core
      if (distToCenter < planetRadius + p.radius) {
        // Push particle outward to surface
        const normalX = dx / distToCenter;
        const normalY = dy / distToCenter;

        p.x = centerX + normalX * (planetRadius + p.radius);
        p.y = centerY + normalY * (planetRadius + p.radius);

        // Calculate velocity component along normal (radial velocity)
        const radialVelocity = vx * normalX + vy * normalY;

        // Bounce radially outward
        p.oldX = p.x - (vx - normalX * radialVelocity * (1 + bounce));
        p.oldY = p.y - (vy - normalY * radialVelocity * (1 + bounce));

        // Apply friction tangentially
        const tangentVx = vx - normalX * radialVelocity;
        const tangentVy = vy - normalY * radialVelocity;
        p.oldX += tangentVx * (1 - friction);
        p.oldY += tangentVy * (1 - friction);
      }

      // === SOFT ATMOSPHERIC BOUNDARY (Infinite Space Feel) ===
      // Instead of hard bounce, apply gentle inward force that increases with distance
      // This creates an "atmosphere" effect - particles can venture far but are gently pulled back
      const atmosphereStart = maxRadius * 0.6; // Atmosphere starts at 60% of canvas radius

      if (distToCenter > atmosphereStart) {
        // Calculate how far into the atmosphere (0 = just entering, 1 = very far)
        const atmosphereDepth = (distToCenter - atmosphereStart) / (maxRadius * 2 - atmosphereStart);

        // Progressive inward force (quadratic - gentle at first, stronger farther out)
        const atmosphereStrength = atmosphereDepth * atmosphereDepth * 0.15;

        // Apply inward force (toward planet center)
        const normalX = -dx / distToCenter;
        const normalY = -dy / distToCenter;

        p.x += normalX * atmosphereStrength;
        p.y += normalY * atmosphereStrength;

        // Dampen velocity slightly (atmospheric drag)
        const dragFactor = 1 - atmosphereDepth * 0.02;
        p.oldX = p.x - vx * dragFactor;
        p.oldY = p.y - vy * dragFactor;
      }
    }
  }

  private resolveCollisions(): void {
    const friction = this.params.friction;
    const stiffness = this.params.stiffness;
    const particles = this.particles;
    const len = particles.length;

    // Reset pressure
    for (let i = 0; i < len; i++) {
      particles[i].pressure = 0;
    }

    // Use spatial grid for collision detection
    for (let i = 0; i < len; i++) {
      const p1 = particles[i];
      const candidates = this.grid.getNeighborCandidates(p1);

      for (let j = 0; j < candidates.length; j++) {
        const p2 = candidates[j];

        // Skip self and already-processed pairs (use memory address comparison via index)
        if (p2 === p1 || p2.cellIndex < p1.cellIndex ||
            (p2.cellIndex === p1.cellIndex && particles.indexOf(p2) <= i)) {
          continue;
        }

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distSq = dx * dx + dy * dy;
        const minDist = p1.radius + p2.radius;
        const minDistSq = minDist * minDist;

        if (distSq < minDistSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;

          // Accumulate pressure (normalized by radius)
          const pressureContrib = overlap / p1.radius;
          p1.pressure += pressureContrib;
          p2.pressure += pressureContrib;

          // Collision normal
          const nx = dx / dist;
          const ny = dy / dist;

          // Position correction (soft collision - lower stiffness = more overlap allowed)
          const correction = overlap * stiffness * 0.5;
          p1.x -= nx * correction;
          p1.y -= ny * correction;
          p2.x += nx * correction;
          p2.y += ny * correction;

          // Friction on collision
          if (friction > 0) {
            const v1x = p1.x - p1.oldX;
            const v1y = p1.y - p1.oldY;
            const v2x = p2.x - p2.oldX;
            const v2y = p2.y - p2.oldY;

            const relVx = v1x - v2x;
            const relVy = v1y - v2y;

            // Tangent vector
            const tx = -ny;
            const ty = nx;

            // Project relative velocity onto tangent
            const relVelTangent = relVx * tx + relVy * ty;

            // Apply friction force
            const frictionForce = relVelTangent * friction * 0.5;

            p1.oldX += tx * frictionForce;
            p1.oldY += ty * frictionForce;
            p2.oldX -= tx * frictionForce;
            p2.oldY -= ty * frictionForce;
          }
        }
      }
    }
  }

  private update(dt: number): void {
    const speed = this.params.speed;
    const subDt = (dt * speed) / this.SUB_STEPS;
    const topology = this.params.topology;

    for (let step = 0; step < this.SUB_STEPS; step++) {
      // Rebuild spatial grid each sub-step (particles move)
      this.rebuildGrid();

      // Route to topology-specific physics
      if (topology === 'planet') {
        this.applyForcesPlanet(subDt);
      } else {
        this.applyForcesFlat(subDt);
      }

      for (let iter = 0; iter < this.COLLISION_ITERATIONS; iter++) {
        this.resolveCollisions();

        // Route to topology-specific boundary constraints
        if (topology === 'planet') {
          this.constrainBoundsPlanet();
        } else {
          this.constrainBoundsFlat();
        }
      }
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const { left, right } = this.getContainerBounds();

    // Dark background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Draw topology-specific boundaries
    if (this.params.topology === 'planet') {
      // Draw planet core (circular floor) with decorative ornaments
      const centerX = this.planetCenterX;
      const centerY = this.planetCenterY;
      const planetRadius = this.getPlanetRadius();

      // Planet core with molten gradient (hot center, cooler edge)
      const coreGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, planetRadius
      );
      coreGradient.addColorStop(0, 'rgba(255, 140, 50, 0.9)');   // Bright orange center
      coreGradient.addColorStop(0.3, 'rgba(200, 80, 30, 0.85)'); // Mid orange
      coreGradient.addColorStop(0.7, 'rgba(120, 50, 20, 0.8)');  // Dark brown-orange
      coreGradient.addColorStop(1, 'rgba(60, 30, 15, 0.75)');    // Dark edge
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, planetRadius, 0, Math.PI * 2);
      ctx.fill();

      // === LAVA VEINS: Fractal lightning-like paths with traveling particles ===
      const time = performance.now() * 0.001;

      if (!this.lavaVeinsHidden && this.lavaVeins.length > 0) {
        // Clip to planet circle to keep veins inside
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, planetRadius - 2, 0, Math.PI * 2);
        ctx.clip();

        // Translate to planet center (veins are stored relative to 0,0)
        ctx.translate(centerX, centerY);

        // Draw the static vein paths (dim background glow)
        ctx.strokeStyle = 'rgba(255, 100, 30, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(255, 80, 20, 0.5)';

        for (const vein of this.lavaVeins) {
          if (vein.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(vein[0].x, vein[0].y);
          for (let i = 1; i < vein.length; i++) {
            ctx.lineTo(vein[i].x, vein[i].y);
          }
          ctx.stroke();
        }

        ctx.shadowBlur = 0;

        // Animate and draw particles traveling along veins
        for (const particle of this.lavaParticles) {
          const vein = this.lavaVeins[particle.veinIndex];
          if (!vein || vein.length < 2) continue;

          // Update particle position (loop around)
          particle.progress += particle.speed;
          if (particle.progress >= 1) {
            particle.progress -= 1;
          }

          // Draw particle trail (5 trailing dots with color gradient)
          const totalSegments = vein.length - 1;
          const trailLength = 5;
          for (let t = 0; t < trailLength; t++) {
            // Calculate trail position (going backwards along path)
            let trailProgress = particle.progress - t * 0.015;
            if (trailProgress < 0) trailProgress += 1;

            const trailExact = trailProgress * totalSegments;
            const trailSeg = Math.floor(trailExact);
            const trailSegProgress = trailExact - trailSeg;

            const tp1 = vein[Math.min(trailSeg, vein.length - 1)];
            const tp2 = vein[Math.min(trailSeg + 1, vein.length - 1)];
            const tx = tp1.x + (tp2.x - tp1.x) * trailSegProgress;
            const ty = tp1.y + (tp2.y - tp1.y) * trailSegProgress;

            // Draw trail dot with decreasing size and brightness
            const trailColor = particle.trailColors[Math.min(t, particle.trailColors.length - 1)];
            const trailSize = 2.5 - t * 0.4;
            const trailAlpha = 1 - t * 0.18;

            ctx.globalAlpha = trailAlpha;
            ctx.fillStyle = trailColor;
            ctx.shadowBlur = 6 - t;
            ctx.shadowColor = trailColor;
            ctx.beginPath();
            ctx.arc(tx, ty, Math.max(0.5, trailSize), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      // Decorative ornaments (glowing spots around the planet)
      for (const ornament of this.planetOrnaments) {
        const x = centerX + Math.cos(ornament.angle) * planetRadius;
        const y = centerY + Math.sin(ornament.angle) * planetRadius;

        // Pulsing glow intensity
        const pulse = Math.sin(time * 2 + ornament.phase) * 0.2 + 0.8;
        const intensity = ornament.glowIntensity * pulse;

        // Ornament size scales linearly with planet radius
        // 30px planet → 3px ornament, 300px planet → 11px ornament
        const ornamentRadius = 3 + (planetRadius - 30) * 0.03;
        const glowBlur = ornamentRadius * 2.5;

        ctx.shadowBlur = glowBlur * intensity;
        ctx.shadowColor = ornament.color;
        ctx.fillStyle = ornament.color;
        ctx.globalAlpha = intensity * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, ornamentRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Reset shadow
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // Planet surface (glowing ring)
      ctx.strokeStyle = 'rgba(200, 100, 50, 0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, planetRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle hover states
      if (this.planetHoverState === 'edge') {
        // Edge hover: subtle resize indicator
        ctx.strokeStyle = 'rgba(50, 220, 220, 0.15)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, planetRadius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (this.planetHoverState === 'interior') {
        // Interior hover: subtle move indicator
        ctx.fillStyle = 'rgba(50, 220, 220, 0.05)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, planetRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Draw container walls (flat mode)
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, 0);
      ctx.lineTo(left, height);
      ctx.moveTo(right, 0);
      ctx.lineTo(right, height);
      ctx.stroke();
    }

    // Find height range and max pressure for normalization
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    let maxPressure = 0;

    // Calculate height based on topology
    if (this.params.topology === 'planet') {
      // Planet mode: height = distance from center
      const centerX = this.planetCenterX;
      const centerY = this.planetCenterY;

      for (const p of this.particles) {
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);

        if (distToCenter < minHeight) minHeight = distToCenter;
        if (distToCenter > maxHeight) maxHeight = distToCenter;
        if (p.pressure > maxPressure) maxPressure = p.pressure;
      }
    } else {
      // Flat mode: height = Y coordinate (lower Y = higher)
      for (const p of this.particles) {
        if (p.y < minHeight) minHeight = p.y;
        if (p.y > maxHeight) maxHeight = p.y;
        if (p.pressure > maxPressure) maxPressure = p.pressure;
      }
    }

    const heightRange = Math.max(maxHeight - minHeight, 1);
    maxPressure = Math.max(maxPressure, 0.1);

    // Sort by pressure (high pressure in back, low pressure in front)
    const sortedParticles = [...this.particles].sort((a, b) => b.pressure - a.pressure);

    for (const p of sortedParticles) {
      // Normalize height based on topology
      let heightNorm: number;

      if (this.params.topology === 'planet') {
        // Planet mode: radial height (core=0, outer=1)
        const centerX = this.planetCenterX;
        const centerY = this.planetCenterY;
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);
        heightNorm = (distToCenter - minHeight) / heightRange;
      } else {
        // Flat mode: vertical height (bottom=0, top=1)
        heightNorm = 1 - (p.y - minHeight) / heightRange;
      }

      // Normalize pressure: 0 = free, 1 = max compression
      const pressureNorm = Math.min(p.pressure / 3, 1); // Cap at 3 for visualization

      // === COMBINED HEIGHT + PRESSURE COLORING ===
      // Height controls hue (bottom=purple, top=cyan)
      // Pressure controls brightness (compressed=bright/hot, free=dim)

      // Cell square - size shrinks under pressure (compression)
      const cellSize = p.width * (1 - pressureNorm * 0.3); // Shrinks up to 30% under pressure
      const cellR = Math.floor(40 + heightNorm * 60 + pressureNorm * 150);   // Gets redder under pressure
      const cellG = Math.floor(20 + heightNorm * 150);
      const cellB = Math.floor(80 + heightNorm * 175 - pressureNorm * 50);   // Less blue under pressure
      const cellOpacity = 0.3 + heightNorm * 0.3 + pressureNorm * 0.4;

      ctx.fillStyle = `rgba(${Math.min(cellR, 255)}, ${cellG}, ${Math.max(cellB, 0)}, ${cellOpacity})`;
      ctx.fillRect(
        p.x - cellSize / 2,
        p.y - cellSize / 2,
        cellSize,
        cellSize
      );
    }

    // Stats - show pile height and average pressure (throttled to 500ms updates)
    // Hide stats when controls panel is collapsed
    const controlsPanel = document.getElementById('controls');
    const isPanelCollapsed = controlsPanel?.classList.contains('collapsed');

    if (!isPanelCollapsed) {
      const now = performance.now();
      if (now - this.lastStatsUpdate >= 500) {
        const pileHeight = Math.round(heightRange);
        const avgPressure = this.particles.reduce((sum, p) => sum + p.pressure, 0) / this.particles.length;
        this.cachedStatsText = `Height: ${pileHeight}px | Pressure: ${avgPressure.toFixed(2)} | Particles: ${this.particles.length}`;
        this.lastStatsUpdate = now;
      }

      if (this.cachedStatsText) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px monospace';

        // Position stats at top (centered) on mobile, bottom (left) on desktop
        const isMobile = window.innerWidth <= 600;
        if (isMobile) {
          const textWidth = ctx.measureText(this.cachedStatsText).width;
          const statsX = (width - textWidth) / 2;
          ctx.fillText(this.cachedStatsText, statsX, 30);
        } else {
          ctx.fillText(this.cachedStatsText, 10, height - 40);
        }
      }
    }
  }

  private loop = (timestamp: number): void => {
    const dt = Math.min((timestamp - this.lastTime) / 16.67, 2);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    this.animationId = requestAnimationFrame(this.loop);
  };

  start(): void {
    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  reset(): void {
    this.initParticles();
  }
}
