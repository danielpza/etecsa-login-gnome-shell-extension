const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

const ON_CLASS = "etecsa-login-manager-on";
const OFF_CLASS = "";

function readline(stream, cb) {
  stream.read_line_async(GLib.PRIORITY_LOW, null, (source, res) => {
    let [out] = source.read_line_finish(res);
    if (out !== null) {
      cb(out);
    }
  });
}

function getStream(command) {
  let [, , , stdout, stderr] = GLib.spawn_async_with_pipes(
    ".",
    ["/usr/bin/env"].concat(command.split(" ")),
    null,
    GLib.SpawnFlags.SEARCH_PATH,
    null
  );
  let outstream = new Gio.DataInputStream({
    base_stream: new Gio.UnixInputStream({ fd: stdout })
  });
  let errstream = new Gio.DataInputStream({
    base_stream: new Gio.UnixInputStream({ fd: stderr })
  });
  return [outstream, errstream];
}

async function run(command) {
  return new Promise((s, r) => {
    const [outstream, errstream] = getStream(command);
    let ignore = false;
    readline(outstream, line => {
      if (ignore) return;
      ignore = true;
      s(line.toString().trim());
    });
    readline(errstream, line => {
      if (ignore) return;
      ignore = true;
      r(new Error(line.toString().trim()));
    });
  });
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
      style_class: OFF_CLASS,
      text: "--------"
    });
    this.bin.set_child(this.label);
    this.bin.connect("button-press-event", () => {
      if (!this.working) this.toggle();
    });
    this.working = false;
  }
  async isOn() {
    return (await run("etecsa status")) === "Connected";
  }
  async toggle() {
    try {
      this.working = true;
      if (await this.isOn()) await run("etecsa logout");
      else await run("etecsa login");
      await this.update();
      this.working = false;
    } catch (err) {
      this.label.set_text(err.message.trim().substr(0, 12));
      this.working = false;
    }
  }
  async update() {
    const [isOnP, timeP] = [this.isOn(), run("etecsa time")];
    const [isOn, time] = [await isOnP, await timeP];
    this.label.set_text((isOn ? "C" : "D") + " " + time);
    this.label.style_class = isOn ? ON_CLASS : OFF_CLASS;
  }
}

let manager = null,
  timeout = null;

function init() {
  manager = new LoginManager();
  manager.update();
}

function enable() {
  if (manager) {
    Main.panel._rightBox.insert_child_at_index(manager.bin, 0);
    timeout = Mainloop.timeout_add_seconds(60.0, () => manager.update());
  }
}

function disable() {
  if (manager) {
    Main.panel._rightBox.remove_child(manager.bin);
    Mainloop.source_remove(timeout);
  }
}
