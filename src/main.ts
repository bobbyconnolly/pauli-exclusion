import './style.css';
import { Simulation, type SimulationParams } from './Simulation';

const STORAGE_KEY = 'climbing-ghost-params';
const COLLAPSED_KEY = 'climbing-ghost-collapsed';

// === MACRO PARAMETER INTERFACE ===
// These are the high-level controls exposed to the user
interface MacroParams {
  gravity: number;           // 0 to 100 (slider percentage, maps quadratically to 0-4)
  pauliStrength: number;     // 0 to 100 (percentage)
  lifeForce: number;         // 0 to 100 (percentage)
  particleCount: number;     // 50 to 2025 (also controls container width)
  topology: 'flat' | 'planet'; // Topology mode
}

// === CONSTANTS: Hidden parameters set to optimal defaults ===
const CONSTANTS = {
  friction: 0.7,
  baseJitter: 0.5,
  speed: 0.5,
  topology: 'flat' as const, // Default topology
};

// === PRESET CONFIGURATIONS ===
// Note: Presets do NOT change particle count or topology - user controls those independently
const PRESETS: Record<string, Omit<MacroParams, 'particleCount' | 'topology'>> = {
  sand: {
    gravity: 50,       // 50% → quadratic maps to 1.0 (earth-like)
    pauliStrength: 50,  // Maps to stiffness: 0.2
    lifeForce: 0,       // No cohesion/climb/perception
  },
  ghost: {
    gravity: 50,       // 50% → quadratic maps to 1.0 (earth-like)
    pauliStrength: 50,  // Maps to stiffness: 0.2
    lifeForce: 50,      // High activity
  },
  collapse: {
    gravity: 70,       // 70% → quadratic maps to ~2.0 (heavy)
    pauliStrength: 1,   // Maps to stiffness: 0.005 (near zero)
    lifeForce: 0,
  },
};

// === MACRO TO PHYSICS MAPPING FUNCTIONS ===

// Map gravity slider (0-100%) to actual gravity (0-4) using quadratic scaling
// At 50%, gravity = 1.0 (earth-like)
function gravitySliderToGravity(sliderPercent: number): number {
  const t = sliderPercent / 100;
  return t * t * 4; // Quadratic: ranges from 0 to 4
}

// Map particle count to container width (50 → 250px, 2025 → viewport width)
// Uses exponential "ease-out" so container reaches max width very early
// On mobile (≤600px), always uses full viewport width regardless of particle count
function particleCountToContainerWidth(count: number): number {
  // Mobile: always use full viewport width
  if (window.innerWidth <= 600) {
    return window.innerWidth;
  }

  // Desktop: exponential ease-out
  const minCount = 50;
  const maxCount = 2025;
  const minWidth = 250;

  // Max width is ~90% of viewport (control panel overlays, so we just need small margins)
  const maxWidth = Math.max(600, window.innerWidth * 0.9);

  // Normalize count to 0-1 range
  const t = (count - minCount) / (maxCount - minCount);

  // Exponential ease-out: 1 - (1-t)^5
  // Grows VERY fast early, reaches ~92% of max width at just 40% of slider
  const easedT = 1 - Math.pow(1 - t, 5);

  // Interpolate using the eased value
  return minWidth + easedT * (maxWidth - minWidth);
}

// Map Pauli Strength (0-100%) to stiffness (0.001-0.4)
// Uses gamma correction (exponent 2.25) to map sweet spot (21% physics) to 50% slider
function pauliStrengthToStiffness(percent: number): number {
  const min = 0.001;
  const max = 0.4;
  const t = Math.pow(percent / 100, 2.25);
  return min + t * (max - min);
}

// Map Life Force (0-100%) to cohesion
// Remapped: old 50% is new 0%, old 100% is new 100%
// Uses gamma correction (exponent 2.4) for extended range while keeping 50% physics similar
function lifeForceToCohesion(percent: number): number {
  const min = 0.075; // old 50%
  const max = 0.2;   // Moderate extension for "Frenetic" behavior
  const t = Math.pow(percent / 100, 2.4);
  return min + t * (max - min);
}

// Map Life Force (0-100%) to climb drive
// Remapped: old 50% is new 0%, old 100% is new 100%
// Uses gamma correction (exponent 2.4) for extended range while keeping 50% physics similar
function lifeForceToClimbDrive(percent: number): number {
  const min = 0.25; // old 50%
  const max = 0.75; // Moderate extension for "Frenetic" behavior
  const t = Math.pow(percent / 100, 2.4);
  return min + t * (max - min);
}

// Map Life Force (0-100%) to perception radius
// Remapped: old 50% is new 0%, old 100% is new 100%
// Uses gamma correction (exponent 2.4) for extended range while keeping 50% physics similar
function lifeForceToPerception(percent: number): number {
  const min = 15; // old 50%
  const max = 40; // Moderate extension for "Frenetic" behavior
  const t = Math.pow(percent / 100, 2.4);
  return min + t * (max - min);
}

// Convert macro params to full simulation params
function macroToSimParams(macro: MacroParams): SimulationParams {
  return {
    gravity: gravitySliderToGravity(macro.gravity),
    stiffness: pauliStrengthToStiffness(macro.pauliStrength),
    cohesion: lifeForceToCohesion(macro.lifeForce),
    climbDrive: lifeForceToClimbDrive(macro.lifeForce),
    perceptionRadius: lifeForceToPerception(macro.lifeForce),
    particleCount: macro.particleCount,
    containerWidth: particleCountToContainerWidth(macro.particleCount),
    topology: macro.topology,
    friction: CONSTANTS.friction,
    baseJitter: CONSTANTS.baseJitter,
    speed: CONSTANTS.speed,
  };
}

// === DOM ELEMENTS ===
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const gravitySlider = document.getElementById('gravity') as HTMLInputElement;
const pauliStrengthSlider = document.getElementById('pauliStrength') as HTMLInputElement;
const lifeForceSlider = document.getElementById('lifeForce') as HTMLInputElement;
const particleCountSlider = document.getElementById('particleCount') as HTMLInputElement;
const resetButton = document.getElementById('reset') as HTMLButtonElement;
const collapseBtn = document.getElementById('collapseBtn') as HTMLButtonElement;
const collapsedTab = document.getElementById('collapsedTab') as HTMLDivElement;
const controlsPanel = document.getElementById('controls') as HTMLDivElement;

const gravityValue = document.getElementById('gravity-value')!;
const pauliStrengthValue = document.getElementById('pauliStrength-value')!;
const lifeForceValue = document.getElementById('lifeForce-value')!;
const particleCountValue = document.getElementById('particleCount-value')!;

const presetButtons = document.querySelectorAll('.preset-btn') as NodeListOf<HTMLButtonElement>;
const topologyRadios = document.querySelectorAll('input[name="topology"]') as NodeListOf<HTMLInputElement>;

const containerEdgeLeft = document.getElementById('containerEdgeLeft') as HTMLDivElement;
const containerEdgeRight = document.getElementById('containerEdgeRight') as HTMLDivElement;

// === CONTAINER RESIZE STATE ===
let isContainerFree = false;
let manualContainerWidth = 0;

// === STORAGE FUNCTIONS ===

function getDefaultMacroParams(): MacroParams {
  return {
    ...PRESETS.ghost,
    particleCount: 1025, // Default particle count
    topology: 'flat',     // Default topology
  };
}

function loadMacroParams(): MacroParams {
  const defaults = getDefaultMacroParams();
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(saved);

    return {
      gravity: typeof parsed.gravity === 'number' && Number.isFinite(parsed.gravity)
        ? parsed.gravity
        : defaults.gravity,
      pauliStrength: typeof parsed.pauliStrength === 'number' && Number.isFinite(parsed.pauliStrength)
        ? parsed.pauliStrength
        : defaults.pauliStrength,
      lifeForce: typeof parsed.lifeForce === 'number' && Number.isFinite(parsed.lifeForce)
        ? parsed.lifeForce
        : defaults.lifeForce,
      particleCount: typeof parsed.particleCount === 'number' && Number.isFinite(parsed.particleCount)
        ? parsed.particleCount
        : 1025, // Default to 1025 particles
      topology: (parsed.topology === 'flat' || parsed.topology === 'planet')
        ? parsed.topology
        : defaults.topology,
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return defaults;
  }
}

function saveMacroParams(params: MacroParams): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
}

// === UI INITIALIZATION ===

function updateUIFromMacro(macro: MacroParams): void {
  gravitySlider.value = String(macro.gravity);
  gravityValue.textContent = String(Math.round(macro.gravity));

  pauliStrengthSlider.value = String(macro.pauliStrength);
  pauliStrengthValue.textContent = String(macro.pauliStrength);

  lifeForceSlider.value = String(macro.lifeForce);
  lifeForceValue.textContent = String(macro.lifeForce);

  particleCountSlider.value = String(macro.particleCount);
  particleCountValue.textContent = String(macro.particleCount);

  // Set topology radio button
  topologyRadios.forEach(radio => {
    radio.checked = radio.value === macro.topology;
  });
}

function updatePresetButtonStates(activePreset: string | null): void {
  presetButtons.forEach(btn => {
    if (btn.dataset.preset === activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// === PANEL COLLAPSE LOGIC ===

function loadCollapsedState(): boolean {
  const saved = localStorage.getItem(COLLAPSED_KEY);
  return saved === 'true';
}

function saveCollapsedState(collapsed: boolean): void {
  localStorage.setItem(COLLAPSED_KEY, String(collapsed));
}

function setCollapsedState(collapsed: boolean): void {
  if (collapsed) {
    controlsPanel.classList.add('collapsed');
    collapsedTab.style.display = 'flex';
  } else {
    controlsPanel.classList.remove('collapsed');
    collapsedTab.style.display = 'none';
  }
  saveCollapsedState(collapsed);
}

// Update particle count slider max based on screen size
function updateParticleCountMax(): void {
  const isMobile = window.innerWidth <= 600;
  const maxParticles = isMobile ? 1200 : 2025;
  particleCountSlider.max = String(maxParticles);

  // If current value exceeds new max, clamp it
  const currentValue = parseInt(particleCountSlider.value, 10);
  if (currentValue > maxParticles) {
    particleCountSlider.value = String(maxParticles);
    particleCountValue.textContent = String(maxParticles);
    currentMacroParams.particleCount = maxParticles;
    simulation.updateParams({
      particleCount: maxParticles,
      containerWidth: getEffectiveContainerWidth(),
    });
    saveMacroParams(currentMacroParams);
    simulation.reset();
  }
}

// === CONTAINER EDGE DRAG LOGIC ===

// Get the effective container width (manual override or automatic)
function getEffectiveContainerWidth(): number {
  if (isContainerFree) {
    return manualContainerWidth;
  }
  return particleCountToContainerWidth(currentMacroParams.particleCount);
}

// Update the visual position of container edge indicators
function updateContainerEdgePositions(): void {
  const isMobile = window.innerWidth <= 600;
  if (isMobile) return; // Edges hidden on mobile

  const containerWidth = getEffectiveContainerWidth();
  const centerX = window.innerWidth / 2;
  const leftEdge = centerX - containerWidth / 2;
  const rightEdge = centerX + containerWidth / 2;

  containerEdgeLeft.style.left = `${leftEdge - 15}px`; // 15px = edge width
  containerEdgeRight.style.left = `${rightEdge}px`;
}

// Handle container edge dragging
let isDragging = false;
let dragStartX = 0;
let dragStartWidth = 0;
let draggedEdge: HTMLElement | null = null;

function startDrag(e: MouseEvent): void {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartWidth = getEffectiveContainerWidth();
  draggedEdge = e.target as HTMLElement;

  draggedEdge.classList.add('dragging');

  document.body.style.cursor = 'ew-resize';
  e.preventDefault();
}

function onDrag(e: MouseEvent): void {
  if (!isDragging || !draggedEdge) return;

  const delta = e.clientX - dragStartX;
  const isLeftEdge = draggedEdge.id === 'containerEdgeLeft';

  // When dragging left edge left (or right edge right), container expands
  // When dragging left edge right (or right edge left), container shrinks
  // Delta is applied symmetrically from center
  const widthDelta = isLeftEdge ? -delta * 2 : delta * 2;
  let newWidth = dragStartWidth + widthDelta;

  // Constrain width: min 250px, max (viewport - 100px) to keep edges grabbable
  const minWidth = 250;
  const maxWidth = window.innerWidth - 100;
  newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

  // Set manual override
  isContainerFree = true;
  manualContainerWidth = newWidth;

  // Update simulation and visuals
  simulation.updateParams({ containerWidth: newWidth });
  updateContainerEdgePositions();
}

function endDrag(): void {
  if (!isDragging) return;

  isDragging = false;
  document.body.style.cursor = '';

  containerEdgeLeft.classList.remove('dragging');
  containerEdgeRight.classList.remove('dragging');
  draggedEdge = null;
}

// Attach drag event listeners
containerEdgeLeft.addEventListener('mousedown', startDrag);
containerEdgeRight.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', onDrag);
document.addEventListener('mouseup', endDrag);

// === HELPER: Check which preset matches current params ===
function matchCurrentParamsToPreset(): void {
  let matchingPreset: string | null = null;
  
  // Iterate through presets to see if current physics params match
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (
      preset.gravity === currentMacroParams.gravity &&
      preset.pauliStrength === currentMacroParams.pauliStrength &&
      preset.lifeForce === currentMacroParams.lifeForce
    ) {
      matchingPreset = name;
      break;
    }
  }
  updatePresetButtonStates(matchingPreset);
}

// === INITIALIZATION ===

let currentMacroParams = loadMacroParams();
updateUIFromMacro(currentMacroParams);

// Restore collapsed state
const isCollapsed = loadCollapsedState();
setCollapsedState(isCollapsed);

// Set up mobile-specific particle count limits
updateParticleCountMax();

const simulation = new Simulation(canvas, macroToSimParams(currentMacroParams));
simulation.start();

// Initialize container edge positions and visibility based on topology
updateContainerEdgePositions();
if (currentMacroParams.topology === 'planet') {
  containerEdgeLeft.style.display = 'none';
  containerEdgeRight.style.display = 'none';
}

// Correctly set the active preset button on load
matchCurrentParamsToPreset();

// === EVENT HANDLERS ===

// Preset buttons (only update gravity, pauliStrength, lifeForce - NOT particle count)
presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const presetName = btn.dataset.preset!;
    const preset = PRESETS[presetName];

    if (preset) {
      // Preserve current particle count and topology, only update physics parameters
      currentMacroParams = {
        ...preset,
        particleCount: currentMacroParams.particleCount,
        topology: currentMacroParams.topology,
      };
      updateUIFromMacro(currentMacroParams);
      updatePresetButtonStates(presetName);

      // Preserve manual container width if it was set
      const simParams = macroToSimParams(currentMacroParams);
      if (isContainerFree) {
        simParams.containerWidth = manualContainerWidth;
      }

      simulation.updateParams(simParams);
      saveMacroParams(currentMacroParams);
    }
  });
});

// Topology radios - switch between flat and planet modes
topologyRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    const topology = radio.value as 'flat' | 'planet';
    currentMacroParams.topology = topology;

    // Update simulation with new topology
    const simParams = macroToSimParams(currentMacroParams);
    if (isContainerFree) {
      simParams.containerWidth = manualContainerWidth;
    }

    simulation.updateParams(simParams);
    simulation.reset(); // Reset particles when switching topology
    saveMacroParams(currentMacroParams);

    // Hide container edges in planet mode, show in flat mode
    if (topology === 'planet') {
      containerEdgeLeft.style.display = 'none';
      containerEdgeRight.style.display = 'none';
    } else {
      containerEdgeLeft.style.display = '';
      containerEdgeRight.style.display = '';
      updateContainerEdgePositions();
    }
  });
});

// Gravity slider
gravitySlider.addEventListener('input', () => {
  const sliderPercent = parseFloat(gravitySlider.value);
  gravityValue.textContent = String(Math.round(sliderPercent));
  currentMacroParams.gravity = sliderPercent;
  simulation.updateParams({ gravity: gravitySliderToGravity(sliderPercent) });
  saveMacroParams(currentMacroParams);
  updatePresetButtonStates(null); // Deactivate presets when manually adjusting
});

// Pauli Strength slider
pauliStrengthSlider.addEventListener('input', () => {
  const value = parseFloat(pauliStrengthSlider.value);
  pauliStrengthValue.textContent = String(Math.round(value));
  currentMacroParams.pauliStrength = value;
  simulation.updateParams({ stiffness: pauliStrengthToStiffness(value) });
  saveMacroParams(currentMacroParams);
  updatePresetButtonStates(null);
});

// Life Force slider (updates multiple physics parameters simultaneously)
lifeForceSlider.addEventListener('input', () => {
  const value = parseFloat(lifeForceSlider.value);
  lifeForceValue.textContent = String(Math.round(value));
  currentMacroParams.lifeForce = value;

  simulation.updateParams({
    cohesion: lifeForceToCohesion(value),
    climbDrive: lifeForceToClimbDrive(value),
    perceptionRadius: lifeForceToPerception(value),
  });

  saveMacroParams(currentMacroParams);
  updatePresetButtonStates(null);
});

// Particle count slider (requires reset, also updates container width)
particleCountSlider.addEventListener('input', () => {
  const value = parseInt(particleCountSlider.value, 10);
  particleCountValue.textContent = String(value);
  currentMacroParams.particleCount = value;

  // If container is manually sized, keep manual width; otherwise auto-calculate
  const containerWidth = isContainerFree
    ? manualContainerWidth
    : particleCountToContainerWidth(value);

  simulation.updateParams({
    particleCount: value,
    containerWidth: containerWidth,
  });
  saveMacroParams(currentMacroParams);
  simulation.reset();
  updatePresetButtonStates(null);
  updateContainerEdgePositions();
});

// Reset button - reloads saved parameters
resetButton.addEventListener('click', () => {
  const savedParams = loadMacroParams();
  currentMacroParams = savedParams;
  updateUIFromMacro(savedParams);

  // Preserve manual container width if it was set
  const simParams = macroToSimParams(savedParams);
  if (isContainerFree) {
    simParams.containerWidth = manualContainerWidth;
  }

  simulation.updateParams(simParams);
  simulation.reset();
  updateContainerEdgePositions();

  // Use the helper to update button states
  matchCurrentParamsToPreset();
});

// === INFO MODAL ===
const infoBtn = document.getElementById('infoBtn') as HTMLButtonElement;
const infoModal = document.getElementById('infoModal') as HTMLDivElement;
const infoCloseBtn = document.getElementById('infoCloseBtn') as HTMLButtonElement;
const infoCloseBtnMobile = document.getElementById('infoCloseBtnMobile') as HTMLButtonElement;
const infoOverlay = document.querySelector('.info-overlay') as HTMLDivElement;

// Open modal
infoBtn.addEventListener('click', () => {
  infoModal.classList.remove('hidden');
});

// Close modal (desktop X button)
infoCloseBtn.addEventListener('click', () => {
  infoModal.classList.add('hidden');
});

// Close modal (mobile FAB button)
infoCloseBtnMobile.addEventListener('click', () => {
  infoModal.classList.add('hidden');
});

// Close modal (click overlay background)
infoOverlay.addEventListener('click', () => {
  infoModal.classList.add('hidden');
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !infoModal.classList.contains('hidden')) {
    infoModal.classList.add('hidden');
  }
});

// Window resize handler - recalculate container width based on new viewport
window.addEventListener('resize', () => {
  updateParticleCountMax();

  // If container is manually sized, keep it (but clamp to new viewport if needed)
  if (isContainerFree) {
    const maxWidth = window.innerWidth - 100;
    if (manualContainerWidth > maxWidth) {
      manualContainerWidth = maxWidth;
      simulation.updateParams({ containerWidth: manualContainerWidth });
    }
  } else {
    simulation.updateParams({
      containerWidth: particleCountToContainerWidth(currentMacroParams.particleCount),
    });
  }

  updateContainerEdgePositions();
});

// Collapse button - hide the panel
collapseBtn.addEventListener('click', () => {
  setCollapsedState(true);
});

// Collapsed tab - show the panel
collapsedTab.addEventListener('click', () => {
  setCollapsedState(false);
});
