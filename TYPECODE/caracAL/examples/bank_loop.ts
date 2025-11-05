/// <reference types="typed-adventureland" />

/**
 * Bank Loop Script
 *
 * This script moves the character between the bank and mainland in a continuous loop.
 * Useful for testing movement, pathfinding, or just keeping characters active.
 */

// Movement destinations
const BANK_LOCATION = "bank";
const MAINLAND_LOCATION = "main"; // Main spawn area in mainland

// Current target
let currentTarget: string = BANK_LOCATION;

// Track if we're currently moving
let isCurrentlyMoving = false;

/**
 * Check if we've arrived at our destination
 */
function hasArrived(): boolean {
  // Check if we're at the bank
  if (currentTarget === BANK_LOCATION) {
    return character.map === "bank";
  }

  // Check if we're at mainland
  if (currentTarget === MAINLAND_LOCATION) {
    return character.map === "main";
  }

  return false;
}

/**
 * Move to the current target location
 */
function moveToTarget() {
  if (character.rip) {
    game_log("Dead, waiting to respawn...", "red");
    return;
  }

  // Check if we've arrived
  if (hasArrived()) {
    game_log(`Arrived at ${currentTarget}!`, "green");
    isCurrentlyMoving = false;

    // Switch target
    if (currentTarget === BANK_LOCATION) {
      currentTarget = MAINLAND_LOCATION;
      game_log("Switching target to mainland", "cyan");
    } else {
      currentTarget = BANK_LOCATION;
      game_log("Switching target to bank", "cyan");
    }

    // Wait a bit before moving again (2 seconds)
    setTimeout(() => {
      moveToTarget();
    }, 2000);

    return;
  }

  // Start moving if not already moving
  if (!isCurrentlyMoving) {
    isCurrentlyMoving = true;
    game_log(`Moving to ${currentTarget}...`, "yellow");

    smart_move(currentTarget).then(() => {
      game_log(`smart_move completed for ${currentTarget}`, "gray");
      isCurrentlyMoving = false;
    }).catch((error) => {
      game_log(`smart_move error: ${error}`, "red");
      isCurrentlyMoving = false;
    });
  }
}

// Handle respawn
setInterval(() => {
  if (character.rip) {
    respawn();
  }
}, 2000);

// Main loop - check position every 5 seconds
setInterval(() => {
  if (!character.rip && !isCurrentlyMoving) {
    moveToTarget();
  }
}, 5000);

// Start the script
setTimeout(() => {
  game_log("Bank loop script started!", "green");
  game_log(`Starting location: ${character.map}`, "cyan");
  game_log(`First target: ${currentTarget}`, "cyan");
  moveToTarget();
}, 2000);
