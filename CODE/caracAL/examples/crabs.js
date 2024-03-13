const mon_type = "crab";

setInterval(function () {
  if (character.rip) {
    respawn();
  }
}, 2e3);

setInterval(function () {
  if (character.rip) {
    return;
  }
  if (can_use("hp")) {
    if (
      character.hp / character.max_hp <= 0.5 ||
      character.max_hp - character.hp >= 200
    ) {
      use("hp");
    }
    if (
      character.mp / character.max_mp <= 0.5 ||
      character.max_mp - character.mp >= 300
    ) {
      use("mp");
    }
  }
  loot();

  const target = get_nearest_monster({ type: mon_type });

  if (target) {
    change_target(target);
    if (can_attack(target)) {
      attack(target);
    } else {
      const dist = simple_distance(target, character);
      if (!is_moving(character) && dist > character.range - 10) {
        if (can_move_to(target.real_x, target.real_y)) {
          move(
            (target.real_x + character.real_x) / 2,
            (target.real_y + character.real_y) / 2,
          );
        } else {
          smart_move(target);
        }
      }
    }
  } else if (!is_moving(character)) {
    smart_move(mon_type);
  }
}, 100);
