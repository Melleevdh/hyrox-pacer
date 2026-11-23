import Toybox.Lang;
import Toybox.WatchUi;

// Knoppen Venu:
//   bovenste knop (START/STOP) = KEY_ENTER
//   onderste knop (TERUG/LAP)  = KEY_ESC
// Aanrakingen en vegen worden genegeerd, zodat zweet of een tik niets doet.
//
// Tijdens de race:
//   START -> racemenu (tijd loopt door): Doorgaan / Ronde terug / Ronde erbij / Stoppen
//   LAP   -> volgende ronde (langs de IN) of volgend onderdeel
class RaceDelegate extends WatchUi.InputDelegate {

    private var _view;

    function initialize(view) {
        InputDelegate.initialize();
        _view = view;
    }

    function onKey(evt) {
        var key = evt.getKey();
        var s = _view.state;

        if (key == WatchUi.KEY_ENTER) {
            if (s == S_READY) {
                _view.start();
            } else if (s == S_RUN) {
                openRaceMenu();
            } else if (s == S_PAUSE) {
                _view.resume();
            } else if (s == S_DONE) {
                openMenu(false);
            }
            return true;
        }

        if (key == WatchUi.KEY_ESC) {
            if (s == S_RUN) {
                _view.press();
                return true;
            }
            if (s == S_PAUSE) {
                openMenu(true);
                return true;
            }
            if (s == S_DONE) {
                openMenu(false);
                return true;
            }
            return false; // voor de start: app afsluiten
        }
        return true;
    }

    function onTap(evt) {
        return true;
    }

    function onSwipe(evt) {
        return true;
    }

    // Racemenu: de tijd loopt gewoon door. Hier corrigeer je een verkeerd getelde ronde.
    function openRaceMenu() {
        var menu = new WatchUi.Menu2({:title => "Race"});
        menu.addItem(new WatchUi.MenuItem("Doorgaan", null, :cont, null));
        menu.addItem(new WatchUi.MenuItem("Ronde terug", "verkeerd geteld", :undo, null));
        menu.addItem(new WatchUi.MenuItem("Ronde erbij", "LAP gemist", :plus, null));
        menu.addItem(new WatchUi.MenuItem("Stoppen", "opslaan of verwijderen", :stop, null));
        WatchUi.pushView(menu, new RaceMenuDelegate(_view, self), WatchUi.SLIDE_UP);
    }

    function openMenu(withResume) {
        var menu = new WatchUi.Menu2({:title => "Gestopt"});
        if (withResume) {
            menu.addItem(new WatchUi.MenuItem("Hervatten", null, :resume, null));
        }
        if (!withResume) {
            // Na de finish: per ongeluk te vroeg op LAP gedrukt? Dan kun je nog terug.
            menu.addItem(new WatchUi.MenuItem("Ronde terug", "finish was te vroeg", :undo, null));
        }
        menu.addItem(new WatchUi.MenuItem("Opslaan", null, :save, null));
        menu.addItem(new WatchUi.MenuItem("Verwijderen", null, :discard, null));
        WatchUi.pushView(menu, new EndMenuDelegate(_view), WatchUi.SLIDE_UP);
    }
}

class RaceMenuDelegate extends WatchUi.Menu2InputDelegate {

    private var _view;
    private var _parent;

    function initialize(view, parent) {
        Menu2InputDelegate.initialize();
        _view = view;
        _parent = parent;
    }

    function onSelect(item) {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :undo) {
            _view.undo();
        } else if (id == :plus) {
            _view.advance();
        } else if (id == :stop) {
            _view.stop();
            _parent.openMenu(true);
        }
    }

    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

class EndMenuDelegate extends WatchUi.Menu2InputDelegate {

    private var _view;

    function initialize(view) {
        Menu2InputDelegate.initialize();
        _view = view;
    }

    function onSelect(item) {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :resume) {
            _view.resume();
        } else if (id == :undo) {
            _view.undo();
        } else if (id == :save) {
            _view.save();
        } else if (id == :discard) {
            // Eerst bevestigen, zodat je niet per ongeluk je race weggooit.
            WatchUi.pushView(new WatchUi.Confirmation("Activiteit verwijderen?"),
                             new DiscardConfirmDelegate(_view), WatchUi.SLIDE_UP);
        }
    }

    // Terug uit het menu: activiteit blijft gestopt. START hervat, LAP opent het menu weer.
    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

class DiscardConfirmDelegate extends WatchUi.ConfirmationDelegate {

    private var _view;

    function initialize(view) {
        ConfirmationDelegate.initialize();
        _view = view;
    }

    function onResponse(response) {
        if (response == WatchUi.CONFIRM_YES) {
            _view.discard();
        }
        return true;
    }
}
