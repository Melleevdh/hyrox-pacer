import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

// Adres van de website. Pas dit aan als je website een ander adres krijgt.
const BASE_URL = "https://hyrox-pacer.vercel.app";

class HyroxPacerApp extends Application.AppBase {

    private var _view = null;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
    }

    function onStop(state) {
        var v = _view;
        if (v != null) {
            v.shutdown();
        }
    }

    function getInitialView() {
        _view = new RaceView();
        return [_view, new RaceDelegate(_view)];
    }
}
