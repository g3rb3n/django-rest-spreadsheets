const ScreenStack = (() => {
    var stackIndex = 1;
    function push($overlay) {
        if (!$overlay.hasClass('overlay'))
            $overlay = $overlay.closest('.overlay');
        $overlay.css('z-index', stackIndex++);
        $overlay.addClass('visible');
    }
    function pop($overlay) {
        if (!$overlay.hasClass('overlay'))
            $overlay = $overlay.closest('.overlay');
        stackIndex--;
        $overlay.css('z-index', 0);
        $overlay.removeClass('visible');
    }
    function next($current, $next) {
        pop($current);
        push($next);
    }
    return {
        push: push,
        pop: pop,
        next: next,
    }
})();
