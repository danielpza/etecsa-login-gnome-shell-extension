const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

function run(command) {
  let [, out, err, status] = GLib.spawn_command_line_sync(command);
  if (status !== 0) throw new Error(err);
  return out.toString().trim();
}

class LoginManager {
  constructor() {
    this.bin = new St.Bin({
      style_class: "panel-button",
      reactive: true,
      x_fill: true,
      y_fill: false,
      track_hover: true,
      can_focus: true
    });
    this.label = new St.Label({
      text: "--------"
    });
    this.bin.set_child(this.label);
    this.bin.connect("button-press-event", () => {
      this.toggle();
    });
  }
  isOn() {
    return run("etecsa status") === "Connected";
  }
  toggle() {
    try {
      if (this.isOn()) run("etecsa logout");
      else run("etecsa login");
      this.update();
    } catch (err) {
      this.label.set_text(err.message.trim().substr(0, 12));
    }
  }
  update() {
    this.label.set_text((this.isOn() ? "C" : "D") + " " + run("etecsa time"));
  }
}

let manager = null;

function init() {
  manager = new LoginManager();
  manager.update();
}

function enable() {
  if (manager) Main.panel._rightBox.insert_child_at_index(manager.bin, 0);
}

function disable() {
  if (manager) Main.panel._rightBox.remove_child(manager.bin);
}
