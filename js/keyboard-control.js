(function() {
    "use strict";
    
    var keyPressTimes = {};
    var videoEl = document.querySelector('video');
    var handlerId = null;

    function getSetting(path, fallback) {
        if (window.SugarHillSettings && typeof window.SugarHillSettings.get === 'function') {
            return window.SugarHillSettings.get(path, fallback);
        }
        return fallback;
    }

    function isTextEntryTarget(target) {
        return Boolean(target && target.closest('input, textarea, select, [contenteditable="true"]'));
    }
    
    function handleKeyPress(e) {
        if (isTextEntryTarget(e.target)) return;
        if (getSetting('keyboard.enabled', true) === false) return;
        if (!handlerId || !e.isDefaultPrevented()) return;
        
        var now = new Date().getTime();
        e.preventDefault();
        
        // Rate limit: max 5 presses per second (200ms between same key press)
        var repeatMs = Number(getSetting('keyboard.repeatMs', 198)) || 198;
        if (!keyPressTimes.hasOwnProperty(e.key) || (now - keyPressTimes[e.key]) >= repeatMs) {
            keyPressTimes[e.key] = now;
            
            if (!videoEl) return;
            videoEl.focus(); // Ensure focus before handling
            
            switch(e.key.toLowerCase()) {
                case 'j': 
                    videoEl.currentTime = Math.max(0, videoEl.currentTime - (Number(getSetting('keyboard.rewindSeconds', 10)) || 10));
                    break;
                case 'k': 
                    if (videoEl.paused) {
                        videoEl.play();
                    } else {
                        videoEl.pause();
                    }
                    break;
                case 'l': 
                    var duration = videoEl.duration || 0;
                    videoEl.currentTime = Math.min(duration, videoEl.currentTime + (Number(getSetting('keyboard.forwardSeconds', 30)) || 30));
                    break;
            }
        }
    }
    
    if (videoEl) {
        // Attach listener to video element - capture phase ensures it works before other handlers
        var options = document.querySelectorAll('video');
        if (options.length > 0) {
            handlerId = requestAnimationFrame(function() {
                options.forEach(function(v) {
                    v.addEventListener("keydown", handleKeyPress, true);
                    // Prevent default for these keys even when focused elsewhere
                    v.setAttribute('data-key-prevent', 'j k l');
                });
                
                // Global listener to ensure keys work regardless of focus
                var globalHandler = function(e) {
                    if (isTextEntryTarget(e.target)) return;
                    if (getSetting('keyboard.enabled', true) === false) return;
                    if (e.key.toLowerCase() === 'escape') {
                        videoEl.focus();
                    } else if (["j", "k", "l"].indexOf(e.key.toLowerCase()) >= 0) {
                        e.preventDefault();
                    }
                };
                document.addEventListener("keydown", globalHandler);
            });
        }
    }
})();
