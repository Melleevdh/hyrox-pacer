import Toybox.Lang;
import Toybox.WatchUi;

// Knoppen Venu 3:
//   bovenste knop (START/STOP) = KEY_ENTER
//   onderste knop (TERUG/LAP)  = KEY_ESC
// Aanrakingen en vegen worden genegeerd, zodat zweet of een tik niets doet.
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
                _view.pause();
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
        var menu = new WatchUi.Menu2({:title => "Activiteit"});
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
            _view.discard();
        }
    }

    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
