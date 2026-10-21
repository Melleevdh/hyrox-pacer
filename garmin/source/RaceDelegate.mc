import Toybox.Lang;
import Toybox.WatchUi;

// Knoppen Venu:
//   bovenste knop (START/STOP) = KEY_ENTER
//   onderste knop (TERUG/LAP)  = KEY_ESC
// Aanrakingen en vegen worden genegeerd, zodat zweet of een tik niets doet.
//
// Tijdens de race:
//   START -> activiteit stoppen (timer staat stil) + menu: Hervatten / Opslaan / Verwijderen
//   LAP   -> volgend onderdeel
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
                _view.stop();
                openMenu(true);
            } else if (s == S_PAUSE) {
                _view.resume();
            } else if (s == S_DONE) {
                openMenu(false);
            }
            return true;
        }

        if (key == WatchUi.KEY_ESC) {
            if (s == S_RUN) {
                _view.lap();
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

    function openMenu(withResume) {
        var menu = new WatchUi.Menu2({:title => "Gestopt"});
        if (withResume) {
            menu.addItem(new WatchUi.MenuItem("Hervatten", null, :resume, null));
        }
        menu.addItem(new WatchUi.MenuItem("Opslaan", null, :save, null));
        menu.addItem(new WatchUi.MenuItem("Verwijderen", null, :discard, null));
        WatchUi.pushView(menu, new EndMenuDelegate(_view), WatchUi.SLIDE_UP);
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
