const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

const HOST_CLASS = "etecsa-login-manager-on-host";
const ON_CLASS = "etecsa-login-manager-on";
const ERROR_CLASS = "etecsa-login-manager-error";
const OFF_CLASS = "";

class Interval {
  constructor(timeout, cb) {
    this.timeout = timeout;
    this.cb = cb;
    this.timer = null;
  }
  start() {
    if (this.timer === null)
      this.timer = Mainloop.timeout_add_seconds(this.timeout, this.cb);
  }
  stop() {
    if (this.timer !== null) {
      Mainloop.source_remove(this.timer);
      this.timer = null;
    }
  }
}

function parseTime(timestr) {
  return timestr.split(":").map(el => parseInt(el));
}

function decreaseTime([hours, min, sec], amount = 1) {
  sec -= amount;
  if (sec < 0) {
    sec += 60;
    min--;
  }
  if (min < 0) {
    min += 60;
    hours--;
  }
  if (hours < 0) return [0, 0, 0];
  return [hours, min, sec];
}

function timeToString(time) {
  return time
    .map(el => (el < 10 ? "0" + el.toString() : el.toString()))
    .join(":");
}

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
    this.prevtime = "00:00:00";
    this.time = [0, 0, 0];
    this.working = false;
    this.host = false;
    this.on = false;
    this.clock = new Interval(1.0, () => this.tick());
    this.decreasing = false;
  }
  tick() {
    if (!this.decreasing) return;
    this.time = decreaseTime(this.time);
    this.draw();
    // FIXME why is this needed?
    this.clock.stop();
    this.clock.start();
  }
  async isOn() {
    return (await run("etecsa status")) === "Connected";
  }
  async toggle() {
    try {
      this.working = true;
      if (await this.isOn()) {
        await run("etecsa logout");
        this.host = false;
      } else {
        await run("etecsa login");
        this.host = true;
      }
      await this.update();
      this.working = false;
    } catch (err) {
      this.label.set_text("Error");
      this.label.style_class = ERROR_CLASS;
      this.working = false;
    }
  }
  async update() {
    const [isOnP, timeP] = [this.isOn(), run("etecsa time")];
    const [isOn, time] = [await isOnP, await timeP];
    if (time === "00:00:00") this.decreasing = false;
    else this.decreasing = time < this.prevtime;
    this.prevtime = time;
    this.time = parseTime(time);
    this.on = isOn;
    if (!this.on) {
      this.host = false;
      this.decreasing = false;
      this.clock.stop();
    }
    if (this.host) {
      this.decreasing = true;
    }
    if (this.decreasing) {
      this.clock.start();
    }
    this.draw();
  }
  async draw() {
    this.label.set_text((this.on ? "C" : "D") + " " + timeToString(this.time));
    this.label.style_class = this.on
      ? this.host
        ? HOST_CLASS
        : ON_CLASS
      : OFF_CLASS;
  }
}

let manager = null;
let interval = new Interval(60.0, () => manager.update());

function init() {
  manager = new LoginManager();
  manager.update();
}

function enable() {
  if (manager) {
    Main.panel._rightBox.insert_child_at_index(manager.bin, 0);
    manager.update();
    interval.start();
  }
}

function disable() {
  if (manager) {
    Main.panel._rightBox.remove_child(manager.bin);
    interval.stop();
  }
}
