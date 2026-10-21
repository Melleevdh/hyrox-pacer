import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Application;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Sensor;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.UserProfile;
import Toybox.WatchUi;

// Schermen / toestanden
enum {
    S_LOADING,   // schema ophalen
    S_PAIR,      // koppelcode tonen
    S_READY,     // klaar om te starten
    S_RUN,       // race bezig
    S_PAUSE,     // gestopt (timer staat stil)
    S_DONE       // 16 onderdelen klaar
}

class RaceView extends WatchUi.View {

    const SEGMENTS = 16;
    const RUNS = 8;
    const POLL_SECONDS = 5;

    var state = S_LOADING;

    private var _names;
    private var _planName = "Standaard";
    private var _targets;      // doel per onderdeel (s), runs inclusief Roxzone-deel
    private var _cum;          // cumulatieve doeltijd (s)
    private var _roxzone = 0;  // totale Roxzone (s)
    private var _status = "";
    private var _code = "";
    private var _deviceId;
    private var _hrZones = null;

    private var _session = null;
    private var _segment = 0;
    private var _segStartS = 0;
    private var _segStartDist = 0.0;
    private var _lapDeltaS = 0;
    private var _finalS = 0;
    private var _speed = null;   // afgevlakte snelheid (m/s)

    private var _timer;
    private var _tick = 0;
    private var _requesting = false;

    function initialize() {
        View.initialize();
        _names = ["Run 1", "SkiErg", "Run 2", "Sled Push", "Run 3", "Sled Pull",
                  "Run 4", "Burpees", "Run 5", "Row", "Run 6", "Farmers",
                  "Run 7", "Lunges", "Run 8", "Wall Balls"];
        _deviceId = getDeviceId();

        // Eerst het laatst opgeslagen schema (werkt ook zonder telefoon), anders standaard.
        var cached = Application.Storage.getValue("plan");
        if (!applyPlan(cached)) {
            applyPlan({"name" => "Standaard",
                       "splits" => [300, 270, 300, 240, 330, 300, 330, 300, 330, 285, 330, 150, 330, 300, 345, 360],
                       "roxzone" => 360});
        }

        // Hartslagzones uit je Garmin-profiel (lopen).
        try {
            _hrZones = UserProfile.getHeartRateZones(UserProfile.HR_ZONE_SPORT_RUNNING);
        } catch (e) {
            _hrZones = null;
        }

        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
        fetchPlan();
    }

    function onShow() {
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function onHide() {
        if (_timer != null) {
            _timer.stop();
        }
    }

    function onTick() as Void {
        _tick += 1;
        if (state == S_PAIR && _tick % POLL_SECONDS == 0) {
            fetchPlan();
        }
        if (state == S_RUN) {
            // Snelheid afvlakken, zodat het tempo niet elke seconde verspringt.
            var info = Activity.getActivityInfo();
            if (info != null && info.currentSpeed != null) {
                var cur = info.currentSpeed;
                if (_speed == null) {
                    _speed = cur;
                } else {
                    _speed = _speed * 0.75 + cur * 0.25;
                }
            }
        }
        WatchUi.requestUpdate();
    }

    // ---------- Apparaat-ID ----------

    function getDeviceId() {
        var id = Application.Storage.getValue("deviceId");
        if (id instanceof String && id.length() >= 16) {
            return id;
        }
        Math.srand(System.getTimer() + Time.now().value());
        var hex = "0123456789abcdef";
        var s = "";
        for (var i = 0; i < 24; i++) {
            var r = Math.rand() % 16;
            s += hex.substring(r, r + 1);
        }
        Application.Storage.setValue("deviceId", s);
        return s;
    }

    // ---------- Schema ophalen ----------

    function fetchPlan() {
        if (_requesting) {
            return;
        }
        _requesting = true;
        Communications.makeWebRequest(
            BASE_URL + "/api/watch",
            {"id" => _deviceId},
            {:method => Communications.HTTP_REQUEST_METHOD_GET,
             :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON},
            method(:onReceive)
        );
    }

    function onReceive(responseCode as Number, data as Dictionary or String or Null) as Void {
        _requesting = false;
        if (state != S_LOADING && state != S_PAIR) {
            return; // race is al gestart: niets meer veranderen
        }
        if (responseCode == 200 && data instanceof Dictionary) {
            if (data["paired"] == true) {
                var plan = data["plan"];
                if (applyPlan(plan)) {
                    Application.Storage.setValue("plan", plan);
                    _status = "Schema bijgewerkt";
                } else {
                    _status = "Nog geen actief schema";
                }
                state = S_READY;
            } else {
                var code = data["code"];
                _code = (code != null) ? code.toString() : "";
                state = S_PAIR;
            }
        } else if (state == S_LOADING) {
            // Geen telefoon/internet: verder met het opgeslagen schema.
            _status = "Offline: opgeslagen schema";
            state = S_READY;
        }
        // Tijdens het koppelen bij een fout gewoon blijven wachten; de volgende poging komt vanzelf.
        WatchUi.requestUpdate();
    }

    function applyPlan(plan) {
        if (!(plan instanceof Dictionary)) {
            return false;
        }
        var splits = plan["splits"];
        if (!(splits instanceof Array) || splits.size() != SEGMENTS) {
            return false;
        }
        var rox = plan["roxzone"];
        if (!(rox instanceof Number) || rox < 0 || rox > 3600) {
            rox = 0;
        }
        var t = new [SEGMENTS];
        var c = new [SEGMENTS];
        var sum = 0;
        for (var i = 0; i < SEGMENTS; i++) {
            var v = splits[i];
            if (!(v instanceof Number) || v <= 0) {
                return false;
            }
            // De Roxzone telt mee bij de runs: je drukt LAP bij begin en eind van elk station.
            if (i % 2 == 0) {
                var k = i / 2;
                v += rox / RUNS;
                if (k < rox % RUNS) {
                    v += 1;
                }
            }
            t[i] = v;
            sum += v;
            c[i] = sum;
        }
        _targets = t;
        _cum = c;
        _roxzone = rox;
        var name = plan["name"];
        _planName = (name instanceof String) ? name : "Schema";
        return true;
    }

    // ---------- Race ----------

    function elapsedS() {
        if (state == S_DONE) {
            return _finalS;
        }
        var info = Activity.getActivityInfo();
        if (info != null && info.timerTime != null) {
            return info.timerTime / 1000;
        }
        return 0;
    }

    function distanceM() {
        var info = Activity.getActivityInfo();
        if (info != null && info.elapsedDistance != null) {
            return info.elapsedDistance;
        }
        return 0.0;
    }

    function start() {
        if (_session == null) {
            _session = ActivityRecording.createSession({
                :name => "Hyrox",
                :sport => Activity.SPORT_RUNNING,
                :subSport => Activity.SUB_SPORT_TREADMILL
            });
        }
        _session.start();
        _segment = 0;
        _segStartS = 0;
        _segStartDist = 0.0;
        _lapDeltaS = 0;
        _speed = null;
        state = S_RUN;
        WatchUi.requestUpdate();
    }

    function lap() {
        if (state != S_RUN) {
            return;
        }
        var now = elapsedS();
        _lapDeltaS = now - _cum[_segment];
        _segment += 1;
        _segStartS = now;
        _segStartDist = distanceM();
        _speed = null;
        if (_session != null) {
            _session.addLap();
        }
        if (_segment >= SEGMENTS) {
            _finalS = now;
            if (_session != null) {
                _session.stop();
            }
            state = S_DONE;
        }
        WatchUi.requestUpdate();
    }

    // Timer stilzetten (START tijdens de race).
    function stop() {
        if (state == S_RUN && _session != null) {
            _session.stop();
            state = S_PAUSE;
            WatchUi.requestUpdate();
        }
    }

    function resume() {
        if (state == S_PAUSE && _session != null) {
            _session.start();
            state = S_RUN;
            WatchUi.requestUpdate();
        }
    }

    function save() {
        if (_session != null) {
            if (_session.isRecording()) {
                _session.stop();
            }
            _session.save();
            _session = null;
        }
        System.exit();
    }

    function discard() {
        if (_session != null) {
            if (_session.isRecording()) {
                _session.stop();
            }
            _session.discard();
            _session = null;
        }
        System.exit();
    }

    function shutdown() {
        // App wordt afgesloten zonder opslaan/verwijderen: sla voor de zekerheid op.
        if (_session != null) {
            if (_session.isRecording()) {
                _session.stop();
            }
            _session.save();
            _session = null;
        }
    }

    // Voor/achter in seconden (negatief = voor).
    function currentDelta(now) {
        if (_segment >= SEGMENTS) {
            return _lapDeltaS;
        }
        var live = now - _cum[_segment];
        return (live > _lapDeltaS) ? live : _lapDeltaS;
    }

    // ---------- Tekenen ----------

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        if (state == S_LOADING) {
            text(dc, dc.getWidth() / 2, dc.getHeight() * 0.5, Graphics.FONT_SMALL, "Schema laden...", Graphics.COLOR_WHITE);
        } else if (state == S_PAIR) {
            drawPair(dc);
        } else if (state == S_READY) {
            drawReady(dc);
        } else {
            drawRace(dc);
        }
    }

    function text(dc, x, y, font, str, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, str, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function drawPair(dc) {
        var cx = dc.getWidth() / 2;
        var h = dc.getHeight();
        text(dc, cx, h * 0.22, Graphics.FONT_SMALL, "Koppel je horloge", Graphics.COLOR_YELLOW);
        text(dc, cx, h * 0.45, Graphics.FONT_NUMBER_MEDIUM, _code, Graphics.COLOR_WHITE);
        text(dc, cx, h * 0.64, Graphics.FONT_XTINY, "Vul deze code in op", Graphics.COLOR_LT_GRAY);
        text(dc, cx, h * 0.72, Graphics.FONT_XTINY, "hyrox-pacer.vercel.app", Graphics.COLOR_WHITE);
        text(dc, cx, h * 0.84, Graphics.FONT_XTINY, "Wachten...", Graphics.COLOR_DK_GRAY);
    }

    function drawReady(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var name = _planName;
        if (name.length() > 22) {
            name = name.substring(0, 21) + ".";
        }
        text(dc, cx, h * 0.14, Graphics.FONT_XTINY, "HYROX PACER", Graphics.COLOR_YELLOW);
        text(dc, cx, h * 0.27, Graphics.FONT_SMALL, name, Graphics.COLOR_WHITE);
        text(dc, cx, h * 0.43, Graphics.FONT_NUMBER_MEDIUM, fmtTime(_cum[SEGMENTS - 1]), Graphics.COLOR_WHITE);
        text(dc, cx, h * 0.56, Graphics.FONT_XTINY, "doeltijd incl. " + fmtTime(_roxzone) + " Roxzone", Graphics.COLOR_LT_GRAY);

        var bw = w * 0.52;
        var bh = h * 0.12;
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle((w - bw) / 2, h * 0.65, bw, bh, bh / 2);
        text(dc, cx, h * 0.71, Graphics.FONT_MEDIUM, "START", Graphics.COLOR_BLACK);
        text(dc, cx, h * 0.86, Graphics.FONT_XTINY, _status, Graphics.COLOR_LT_GRAY);
    }

    function drawRace(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var now = elapsedS();
        var delta = currentDelta(now);
        var behind = delta > 0;
        var active = _segment < SEGMENTS;
        var isRun = active && (_segment % 2 == 0);
        var info = Activity.getActivityInfo();

        // Klok
        var ct = System.getClockTime();
        var hour = ct.hour;
        if (!System.getDeviceSettings().is24Hour) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        text(dc, cx, h * 0.075, Graphics.FONT_XTINY, hour.toString() + ":" + ct.min.format("%02d"), Graphics.COLOR_LT_GRAY);

        // Totaal (links) en schema (rechts, rood = achter, groen = voor)
        var lx = w * 0.31;
        text(dc, lx, h * 0.17, Graphics.FONT_XTINY, "TOTAAL", Graphics.COLOR_LT_GRAY);
        text(dc, lx, h * 0.245, Graphics.FONT_MEDIUM, fmtTime(now), Graphics.COLOR_WHITE);

        var bx = w * 0.51;
        var by = h * 0.125;
        var bw = w * 0.33;
        var bh = h * 0.175;
        dc.setColor(behind ? Graphics.COLOR_RED : Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(bx, by, bw, bh, 10);
        var ink = behind ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK;
        text(dc, bx + bw / 2, by + bh * 0.28, Graphics.FONT_XTINY, "SCHEMA", ink);
        text(dc, bx + bw / 2, by + bh * 0.68, Graphics.FONT_MEDIUM, fmtDelta(delta), ink);

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(w * 0.07, h * 0.335, w * 0.93, h * 0.335);

        // Onderdeel
        var label;
        var labelColor = isRun ? Graphics.COLOR_YELLOW : Graphics.COLOR_WHITE;
        if (state == S_DONE) {
            label = "FINISH";
            labelColor = Graphics.COLOR_YELLOW;
        } else if (state == S_PAUSE) {
            label = "GESTOPT";
            labelColor = Graphics.COLOR_ORANGE;
        } else {
            label = (_segment + 1).toString() + "/16  " + _names[_segment];
        }
        text(dc, cx, h * 0.395, Graphics.FONT_SMALL, label, labelColor);

        // Middelste rij: meters (alleen lopen) | tijd in onderdeel | doel
        if (active) {
            var segS = now - _segStartS;
            if (segS < 0) {
                segS = 0;
            }
            var segColor = (segS > _targets[_segment]) ? Graphics.COLOR_RED : Graphics.COLOR_WHITE;
            text(dc, cx, h * 0.515, Graphics.FONT_NUMBER_MEDIUM, fmtTime(segS), segColor);
            text(dc, w * 0.85, h * 0.515, Graphics.FONT_SMALL, fmtTime(_targets[_segment]), Graphics.COLOR_LT_GRAY);
            if (isRun) {
                text(dc, w * 0.15, h * 0.515, Graphics.FONT_SMALL, fmtDist(distanceM() - _segStartDist), Graphics.COLOR_LT_GRAY);
            }
        } else {
            text(dc, cx, h * 0.515, Graphics.FONT_NUMBER_MEDIUM, fmtTime(now), Graphics.COLOR_WHITE);
        }

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(w * 0.07, h * 0.61, w * 0.93, h * 0.61);

        // Tempo (lopen) / instructies
        if (state == S_DONE) {
            text(dc, cx, h * 0.68, Graphics.FONT_SMALL, "START = opslaan", Graphics.COLOR_WHITE);
        } else if (state == S_PAUSE) {
            text(dc, cx, h * 0.68, Graphics.FONT_XTINY, "START hervat - LAP menu", Graphics.COLOR_WHITE);
        } else if (isRun) {
            text(dc, cx, h * 0.68, Graphics.FONT_MEDIUM, fmtPace(_speed) + " /km", Graphics.COLOR_WHITE);
        }

        // Volgend onderdeel
        if (active && state != S_PAUSE) {
            var next;
            if (_segment + 1 < SEGMENTS) {
                next = "Hierna: " + _names[_segment + 1] + "  " + fmtTime(_targets[_segment + 1]);
            } else {
                next = "Hierna: FINISH  (doel " + fmtTime(_cum[SEGMENTS - 1]) + ")";
            }
            text(dc, cx, h * 0.775, Graphics.FONT_XTINY, next, Graphics.COLOR_LT_GRAY);
        }

        // Hartslag in de kleur van je zone
        var hr = (info != null) ? info.currentHeartRate : null;
        drawHeartRate(dc, cx, h * 0.88, hr);
    }

    function drawHeartRate(dc, cx, y, hr) {
        var str = (hr != null) ? hr.toString() : "--";
        var zone = zoneOf(hr);
        var color = zoneColor(zone);
        var font = Graphics.FONT_SMALL;
        var tw = dc.getTextWidthInPixels(str, font);
        var s = dc.getFontHeight(font) * 0.28; // grootte hartje
        var zstr = (zone > 0) ? ("Z" + zone.toString()) : "";
        var zw = (zone > 0) ? dc.getTextWidthInPixels(zstr, Graphics.FONT_XTINY) + 6 : 0;
        var total = s * 2 + 6 + tw + zw;
        var x = cx - total / 2;

        drawHeart(dc, x + s, y, s, color);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + s * 2 + 6, y, font, str, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        if (zone > 0) {
            dc.drawText(x + s * 2 + 6 + tw + 6, y, Graphics.FONT_XTINY, zstr, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    function drawHeart(dc, x, y, s, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var r = s / 2;
        dc.fillCircle(x - r, y - r / 2, r);
        dc.fillCircle(x + r, y - r / 2, r);
        dc.fillPolygon([[x - s, y - r / 4], [x + s, y - r / 4], [x, y + s]]);
    }

    // Zone 1-5 volgens je Garmin-profiel (0 = onbekend).
    function zoneOf(hr) {
        if (hr == null) {
            return 0;
        }
        var z = _hrZones;
        if (z == null || z.size() < 6) {
            return 0;
        }
        if (hr <= z[1]) {
            return 1;
        }
        if (hr <= z[2]) {
            return 2;
        }
        if (hr <= z[3]) {
            return 3;
        }
        if (hr <= z[4]) {
            return 4;
        }
        return 5;
    }

    // Garmin-kleuren: 1 grijs, 2 blauw, 3 groen, 4 oranje, 5 rood.
    function zoneColor(zone) {
        if (zone == 1) {
            return Graphics.COLOR_LT_GRAY;
        }
        if (zone == 2) {
            return Graphics.COLOR_BLUE;
        }
        if (zone == 3) {
            return Graphics.COLOR_GREEN;
        }
        if (zone == 4) {
            return Graphics.COLOR_ORANGE;
        }
        if (zone == 5) {
            return Graphics.COLOR_RED;
        }
        return Graphics.COLOR_WHITE;
    }

    // ---------- Hulpfuncties ----------

    function fmtTime(secs) {
        if (secs < 0) {
            secs = 0;
        }
        var hrs = secs / 3600;
        var min = (secs % 3600) / 60;
        var sec = secs % 60;
        if (hrs > 0) {
            return hrs.toString() + ":" + min.format("%02d") + ":" + sec.format("%02d");
        }
        return min.toString() + ":" + sec.format("%02d");
    }

    function fmtDelta(d) {
        if (d < 0) {
            return "-" + fmtTime(-d);
        }
        return "+" + fmtTime(d);
    }

    // Snelheid (m/s) -> tempo "m:ss" per km.
    function fmtPace(speed) {
        if (speed == null || speed < 0.5) {
            return "--:--";
        }
        var secs = (1000.0 / speed).toNumber();
        if (secs > 3599) {
            return "--:--";
        }
        return (secs / 60).toString() + ":" + (secs % 60).format("%02d");
    }

    function fmtDist(m) {
        if (m < 0) {
            m = 0;
        }
        if (m < 1000) {
            return m.toNumber().toString() + "m";
        }
        return (m / 1000.0).format("%.2f") + "km";
    }
}
