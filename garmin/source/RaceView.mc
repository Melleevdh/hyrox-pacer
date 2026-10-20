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
import Toybox.WatchUi;

// Schermen / toestanden
enum {
    S_LOADING,   // schema ophalen
    S_PAIR,      // koppelcode tonen
    S_READY,     // klaar om te starten
    S_RUN,       // race bezig
    S_PAUSE,     // gepauzeerd
    S_DONE       // 16 onderdelen klaar
}

class RaceView extends WatchUi.View {

    const SEGMENTS = 16;
    const POLL_SECONDS = 5;

    var state = S_LOADING;

    private var _names;
    private var _planName = "Standaard";
    private var _targets;     // doeltijd per onderdeel (s)
    private var _cum;         // cumulatieve doeltijd (s)
    private var _status = "";  // statusregel onderaan
    private var _code = "";    // koppelcode
    private var _deviceId;

    private var _session = null;
    private var _segment = 0;
    private var _segStartS = 0;
    private var _lapDeltaS = 0;
    private var _finalS = 0;

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
            applyPlan({"name" => "Standaard 1:20:00",
                       "splits" => [300, 270, 300, 240, 330, 300, 330, 300, 330, 285, 330, 150, 330, 300, 345, 360]});
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
        var t = new [SEGMENTS];
        var c = new [SEGMENTS];
        var sum = 0;
        for (var i = 0; i < SEGMENTS; i++) {
            var v = splits[i];
            if (!(v instanceof Number) || v <= 0) {
                return false;
            }
            t[i] = v;
            sum += v;
            c[i] = sum;
        }
        _targets = t;
        _cum = c;
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
        _lapDeltaS = 0;
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

    function pause() {
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
            drawCenter(dc, "Schema laden...", Graphics.FONT_SMALL, Graphics.COLOR_WHITE, 0.5);
        } else if (state == S_PAIR) {
            drawPair(dc);
        } else if (state == S_READY) {
            drawReady(dc);
        } else {
            drawRace(dc);
        }
    }

    function drawCenter(dc, text, font, color, yFrac) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, dc.getHeight() * yFrac, font, text,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function drawPair(dc) {
        drawCenter(dc, "Koppel je horloge", Graphics.FONT_SMALL, Graphics.COLOR_YELLOW, 0.22);
        drawCenter(dc, _code, Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE, 0.45);
        drawCenter(dc, "Vul deze code in op", Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY, 0.64);
        drawCenter(dc, "hyrox-pacer.vercel.app", Graphics.FONT_XTINY, Graphics.COLOR_WHITE, 0.72);
        drawCenter(dc, "Wachten...", Graphics.FONT_XTINY, Graphics.COLOR_DK_GRAY, 0.84);
    }

    function drawReady(dc) {
        var name = _planName;
        if (name.length() > 22) {
            name = name.substring(0, 21) + ".";
        }
        drawCenter(dc, "HYROX PACER", Graphics.FONT_XTINY, Graphics.COLOR_YELLOW, 0.15);
        drawCenter(dc, name, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, 0.29);
        drawCenter(dc, fmtTime(_cum[SEGMENTS - 1]), Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE, 0.46);
        drawCenter(dc, "doeltijd", Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY, 0.59);

        var w = dc.getWidth();
        var h = dc.getHeight();
        var bw = w * 0.52;
        var bh = h * 0.12;
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle((w - bw) / 2, h * 0.67, bw, bh, bh / 2);
        drawCenter(dc, "START", Graphics.FONT_MEDIUM, Graphics.COLOR_BLACK, 0.67 + 0.06);
        drawCenter(dc, _status, Graphics.FONT_XTINY, Graphics.COLOR_LT_GRAY, 0.88);
    }

    function drawRace(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var now = elapsedS();
        var delta = currentDelta(now);
        var ahead = delta <= 0;

        // 1. Onderdeel / status
        var label;
        var labelColor = Graphics.COLOR_LT_GRAY;
        if (state == S_DONE) {
            label = "FINISH";
            labelColor = Graphics.COLOR_YELLOW;
        } else if (state == S_PAUSE) {
            label = "PAUZE";
            labelColor = Graphics.COLOR_YELLOW;
        } else {
            label = (_segment + 1).toString() + "/16  " + _names[_segment];
        }
        drawCenter(dc, label, Graphics.FONT_SMALL, labelColor, 0.13);

        // 2. Totale tijd
        drawCenter(dc, fmtTime(now), Graphics.FONT_NUMBER_MEDIUM, Graphics.COLOR_WHITE, 0.31);

        // 3. Tijd in onderdeel / doel
        if (_segment < SEGMENTS) {
            var segS = now - _segStartS;
            if (segS < 0) {
                segS = 0;
            }
            drawCenter(dc, fmtTime(segS) + " / " + fmtTime(_targets[_segment]),
                       Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY, 0.48);
        } else {
            drawCenter(dc, "doel " + fmtTime(_cum[SEGMENTS - 1]), Graphics.FONT_SMALL, Graphics.COLOR_LT_GRAY, 0.48);
        }

        // 4. km/u bij lopen, hartslag op stations
        var info = Activity.getActivityInfo();
        var big = "--";
        if (state == S_DONE) {
            big = "START = opslaan";
        } else if (_segment % 2 == 0) {
            if (info != null && info.currentSpeed != null) {
                big = (info.currentSpeed * 3.6).format("%.1f");
            }
            big += " km/u";
        } else {
            if (info != null && info.currentHeartRate != null) {
                big = info.currentHeartRate.toString();
            }
            big += " bpm";
        }
        drawCenter(dc, big, (state == S_DONE) ? Graphics.FONT_SMALL : Graphics.FONT_LARGE,
                   Graphics.COLOR_WHITE, 0.62);

        // 5. Voor / achter
        var bw = w * 0.62;
        var bh = h * 0.15;
        var by = h * 0.73;
        dc.setColor(ahead ? Graphics.COLOR_GREEN : Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle((w - bw) / 2, by, bw, bh, bh / 2);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, by + bh / 2, Graphics.FONT_MEDIUM,
                    (ahead ? "VOOR " : "ACHTER ") + fmtDelta(delta),
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
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
}
