const mon_type = "crab";

function smart_potion_logic() {
  if (character.rip) return;

  if (is_on_cooldown("use_hp")) return;

  function can_consume_fully(pot: String) {
    if ("regen_hp" === pot) return character.max_hp - character.hp >= 50;
    if ("regen_mp" === pot) return character.max_mp - character.mp >= 100;
    if (pot.startsWith("hp")) {
      return character.max_hp - character.hp >= G.items[pot].gives[0][1];
    } else {
      return character.max_mp - character.mp >= G.items[pot].gives[0][1];
    }
  }
  function choose_potion(priorities: Array<String>, fallback: String = "") {
    let using_slot;
    for (let pot of priorities) {
      if (can_consume_fully(pot) && (using_slot = locate_item(pot)) >= 0) {
        equip(using_slot);
        return;
      }
    }
    if (fallback && can_consume_fully(fallback)) use_skill(fallback);
  }
  const hp_critical = character.hp / character.max_hp <= 0.5;
  const mp_critical = character.mp / character.max_mp <= 0.2;
  const priest_present = parent.party_list.some(
    (name) => "priest" === get_player(name)?.ctype,
  );
  if (mp_critical) {
    //force restore mp
    choose_potion(["mpot1", "mpot0"], "regen_mp");
  } else if (hp_critical) {
    //force restore hp
    choose_potion(["hpot1", "hpot0"], "regen_hp");
  } else if (priest_present) {
    //heavily prefer mp
    choose_potion(["mpot1", "mpot0", "hpot1", "hpot0"]);
  } else {
    //prefer hp
    choose_potion(["hpot1", "mpot1", "hpot0", "mpot0"]);
  }
}

setInterval(function () {
  if (character.rip) {
    respawn();
  }
}, 2e3);

setInterval(function () {
  if (character.rip) {
    return;
  }
  smart_potion_logic();
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
