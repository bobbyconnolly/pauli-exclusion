"""
# Pauli Exclusion Principle & Active Matter Simulation 👻

This project is an interactive web-based simulation celebrating the **100th Anniversary of the Pauli Exclusion Principle (1925–2025)**. It visualizes "Active Matter"—particles with internal energy and specific "urges"—and demonstrates how the exclusion principle gives matter its volume and structure.

Unlike inert grains of sand, these particles actively herd, climb, and fight gravity, creating emergent structures that resemble a living "ghost."

Built with **TypeScript** and a custom **Verlet Integration** physics engine using Spatial Hashing for high performance.

---

## Live Simulation

**Explore the simulation here:** 👉 [**https://bobbyconnolly.com/pe-simulation/**](https://bobbyconnolly.com/pe-simulation/)

---

## What It Shows

* **Active Matter:** The particles are not passive. They possess "Life Force"—a set of local rules (Herding + Climbing) that drive them to aggregate and move against gravity.
* **The Pauli Exclusion Principle:** In quantum mechanics, this principle prevents fermions (like electrons) from occupying the same state. In this macroscopic simulation, it is represented as **Stiffness**. Without this repulsive force, matter loses its volume and collapses into a dense singularity.
* **Emergence:** There is no code telling the ghost to "stand up." The behavior emerges entirely from local interactions between neighbors.
* **Topological Modes:**
    * **Flat Earth:** Standard gravity where particles pile up on a floor.
    * **Planetoid:** Radial gravity where particles orbit and settle on a central core, demonstrating tangential cohesion (sliding around a surface) rather than tunneling.

---

## Interactive Features

* **The God Hand:**
    * **Hover (Desktop):** The particles "fear" the cursor. Hovering creates a gentle repulsive field.
    * **Click & Drag / Touch:** Creates a gravitational singularity. You can "grab" the ghost, drag it up walls, or throw it around.
* **Preset Scenarios:**
    * **Inert Matter:** Turns off the "Life Force." Particles behave like dead sand.
    * **Active Ghost:** The default mode. Particles actively climb and herd.
    * **Quantum Collapse:** Turns off Pauli Exclusion. Watch the universe break as matter collapses into a single point.
* **Macro Controls:** Adjust **Gravity**, **Pauli Strength**, and **Life Force** directly to see how changing fundamental constants affects the universe.

---

## The Physics Engine

The simulation runs on a custom **Verlet Integration** loop with the following key components:

* **Spatial Hashing:** A grid-based lookup system ($O(N)$ complexity) allows for thousands of particle interactions at 60 FPS.
* **Newton's Third Law:** When a particle climbs "up," it exerts an equal and opposite force "down" on its neighbor. This creates realistic weight distribution and "base shear."
* **Asymptotic Pressure:** To prevent "deadlocks" deep in the pile, the climbing drive follows an asymptotic curve ($1 / (1 + P)$) rather than a hard cutoff, ensuring crushed particles retain a tiny spark of movement.
* **Vacuum Effect:** To prevent the "Slime Trail" artifact, grounded particles experience dynamic vertical cohesion, allowing the group to "pick up its feet" as it moves.

---

## Running Locally

This project uses [Vite](https://vitejs.dev/) with TypeScript.

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/bobbyconnolly/pauli-exclusion.git](https://github.com/bobbyconnolly/pauli-exclusion.git)
    cd pauli-exclusion
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
4.  **Build for production:**
    ```bash
    npm run build
    ```

---

Find the source code on [GitHub](https://github.com/bobbyconnolly/pauli-exclusion).
"""