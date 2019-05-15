const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

let button;

function run(command) {
  let [, out, err, status] = GLib.spawn_command_line_sync(command);
  if (status !== 0) throw new Error(err);
  return out.toString().trim();
}

function isOn() {
  return run("etecsa status") === "Connected";
}

function toggle() {
  if (isOn()) return run("etecsa logout");
  else return run("etecsa login");
}

function init() {
  button = new St.Bin({
    style_class: "panel-button",
    reactive: true,
    x_fill: true,
    y_fill: false,
    track_hover: true,
    can_focus: true
  });
  const label = new St.Label({
    text: "--------"
  });
  button.set_child(label);
  button.connect("button-press-event", () => {
    try {
      toggle();
      update();
    } catch (err) {
      label.set_text(err.message.trim().substr(0, 12));
    }
  });
  update();
  function update() {
    label.set_text((isOn() ? "C" : "D") + " " + run("etecsa time"));
  }
}

function enable() {
  Main.panel._rightBox.insert_child_at_index(button, 0);
}

function disable() {
  Main.panel._rightBox.remove_child(button);
}
