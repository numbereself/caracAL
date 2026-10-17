//Tail of the spoofed jinja block. Split from html_vars.js because the game
//files read those vars as they evaluate, while these statements call into the
//game files - so the vars load first and this loads last.

if (!is_sdk) {
  for (var f in log_flags) log_flags[f] = 0;
}

//handle_information() replaces this with the live list
X.servers = [];
X.characters = [];
X.tutorial = { step: 0, completed: [] };
X.unread = 0;
X.codes = {};

code_logic();
