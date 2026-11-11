(function () {
    'use strict';

    var AUTOPLAY_ENDED_KEY = 'video-player-autoplay-ended';
    var USER_UNMUTED_KEY = 'video-player-user-unmuted';
    var VOLUME_KEY = 'video-player-volume';
    var MUTED_KEY = 'video-player-muted';
    var SPEED_KEY = 'video-player-speed';

    function getSetting(path, fallback) {
        if (window.SugarHillSettings && typeof window.SugarHillSettings.get === 'function') {
            return window.SugarHillSettings.get(path, fallback);
        }
        return fallback;
    }

    function getVideo() {
        return document.querySelector('video');
    }

    function getControls() {
        return document.querySelector('.video-controls');
    }

    function getFrame() {
        return document.querySelector('.video-player-frame');
    }

    function getButton(selector) {
        return document.querySelector(selector);
    }

    function consumeControlClick(event) {
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function setIconVisible(icon, isVisible) {
        if (!icon) return;
        icon.hidden = !isVisible;
        icon.style.display = isVisible ? '' : 'none';
    }

    function readStoredBoolean(key, fallback) {
        var value = localStorage.getItem(key);
        if (value === null) return fallback;
        return value === 'true';
    }

    function readStoredNumber(key, fallback) {
        var rawValue = localStorage.getItem(key);
        if (rawValue === null) return fallback;
        var value = Number(rawValue);
        return Number.isFinite(value) ? value : fallback;
    }

    function updatePlayButton(video, button) {
        if (!button) return;
        var isPlaying = video && !video.paused && !video.ended;
        var playIcon = button.querySelector('.video-icon-play');
        var pauseIcon = button.querySelector('.video-icon-pause');
        setIconVisible(playIcon, !isPlaying);
        setIconVisible(pauseIcon, isPlaying);
        button.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    }

    function updateMuteButton(video, button) {
        if (!video || !button) return;
        var isMuted = video.muted || video.volume === 0;
        var volumeIcon = button.querySelector('.video-icon-volume');
        var mutedIcon = button.querySelector('.video-icon-muted');
        setIconVisible(volumeIcon, !isMuted);
        setIconVisible(mutedIcon, isMuted);
        button.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
    }

    function updateVolumeSlider(input, value) {
        if (!input) return;
        var percent = clamp(Number(value || 0) * 100, 0, 100);
        input.style.setProperty('--volume-percent', percent + '%');
    }

    function updateFullscreenButton(button) {
        if (!button) return;
        var isFullscreen = Boolean(document.fullscreenElement);
        button.setAttribute('aria-label', isFullscreen ? 'Exit full screen' : 'Enter full screen');
    }

    function syncSubtitleControl(video, select) {
        var wrapper = select ? select.closest('.video-subtitles-control') : null;
        if (!video || !select || !wrapper) return;

        while (select.options.length > 1) {
            select.remove(1);
        }

        var tracks = Array.prototype.slice.call(video.textTracks || []);
        tracks.forEach(function (track, index) {
            var option = document.createElement('option');
            option.value = String(index);
            option.textContent = track.label || track.language || 'Track ' + (index + 1);
            select.appendChild(option);
            track.mode = 'disabled';
        });

        wrapper.hidden = tracks.length === 0;
        select.value = 'off';
    }

    function setSubtitleTrack(video, value) {
        var tracks = Array.prototype.slice.call(video.textTracks || []);
        tracks.forEach(function (track, index) {
            track.mode = value === String(index) ? 'showing' : 'disabled';
        });
    }

    function removeUnmuteOverlay() {
        var overlay = document.getElementById('unmute-button-overlay');
        if (overlay) overlay.remove();
    }

    function hasRemotePlaybackPrompt(video) {
        return Boolean(video && video.remote && typeof video.remote.prompt === 'function');
    }

    function hasWebKitPlaybackPicker(video) {
        return Boolean(video && typeof video.webkitShowPlaybackTargetPicker === 'function');
    }

    function supportsCast(video) {
        return hasRemotePlaybackPrompt(video) || hasWebKitPlaybackPicker(video);
    }


    function syncCastButton(video, button) {
        if (!button) return;
        var supported = supportsCast(video);
        button.hidden = !supported;
        button.disabled = !supported;
    }

    async function castToTv(video) {
        if (!video) return;
        try {
            if (hasRemotePlaybackPrompt(video)) {
                await video.remote.prompt();
                return;
            }
            if (hasWebKitPlaybackPicker(video)) {
                video.webkitShowPlaybackTargetPicker();
            }
        } catch (error) {
            console.warn('Cast prompt failed:', error);
        }
    }

    async function toggleFullscreen() {
        var player = getFrame();
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (player && typeof player.requestFullscreen === 'function') {
                await player.requestFullscreen();
            }
        } catch (error) {
            console.warn('Full screen toggle failed:', error);
        }
    }

    function applyStoredPlaybackSettings(video, volume, speed) {
        if (!video) return;
        var storedVolume = readStoredNumber(VOLUME_KEY, getSetting('playback.defaultVolume', video.volume || 1));
        var storedMuted = readStoredBoolean(MUTED_KEY, getSetting('playback.muted', video.muted));
        var storedSpeed = readStoredNumber(SPEED_KEY, getSetting('playback.speed', 1));

        video.volume = clamp(storedVolume, 0, 1);
        video.muted = storedMuted;
        video.playbackRate = storedSpeed > 0 ? storedSpeed : 1;

        if (volume) {
            volume.value = String(video.volume);
            updateVolumeSlider(volume, video.volume);
        }
        if (speed) speed.value = String(video.playbackRate);
    }

    async function playVideo(video) {
        if (!video) return;
        if (video.ended) {
            video.currentTime = 0;
        }

        try {
            await video.play();
        } catch (error) {
            console.warn('Play failed, retrying muted:', error);
            video.muted = true;
            await video.play().catch(function (retryError) {
                console.warn('Muted retry failed:', retryError);
            });
        }
    }

    function togglePlayback(video) {
        if (!video) return;
        if (video.paused || video.ended) {
            playVideo(video);
            return;
        }
        video.pause();
    }

    function toggleMute(video) {
        if (!video) return;
        if (video.muted || video.volume === 0) {
            var restoredVolume = readStoredNumber(VOLUME_KEY, 1);
            video.volume = restoredVolume > 0 ? restoredVolume : 1;
            video.muted = false;
            localStorage.setItem(USER_UNMUTED_KEY, 'true');
            removeUnmuteOverlay();
            return;
        }
        localStorage.setItem(VOLUME_KEY, String(video.volume));
        video.muted = true;
    }

    function bind() {
        var video = getVideo();
        var controls = getControls();
        var frame = getFrame();
        if (!video || !controls || controls.dataset.playerControlsInitialized === 'true') {
            return;
        }

        controls.dataset.playerControlsInitialized = 'true';

        var playButton = getButton('[data-player-play]');
        var volume = getButton('[data-player-volume]');
        var muteButton = getButton('[data-player-mute]');
        var speed = getButton('[data-player-speed]');
        var subtitles = getButton('[data-player-subtitles]');
        var castButton = getButton('[data-player-cast]');
        var fullscreenButton = getButton('[data-player-fullscreen]');
        var autoplayEnded = getButton('[data-player-autoplay-ended]');

        if (autoplayEnded) {
            autoplayEnded.checked = readStoredBoolean(AUTOPLAY_ENDED_KEY, getSetting('playback.autoplayEnded', true));
        }

        applyStoredPlaybackSettings(video, volume, speed);
        syncSubtitleControl(video, subtitles);
        syncCastButton(video, castButton);
        updatePlayButton(video, playButton);
        updateMuteButton(video, muteButton);
        updateFullscreenButton(fullscreenButton);

        function showControlsBriefly() {
            if (!frame) return;
            frame.classList.add('is-controls-visible');
            window.clearTimeout(showControlsBriefly.timeoutId);
            showControlsBriefly.timeoutId = window.setTimeout(function () {
                if (!frame.matches(':hover') && !frame.contains(document.activeElement)) {
                    frame.classList.remove('is-controls-visible');
                }
            }, 2200);
        }

        if (frame) {
            frame.addEventListener('pointermove', showControlsBriefly);
            frame.addEventListener('pointerdown', showControlsBriefly);
            frame.addEventListener('focusin', showControlsBriefly);
            frame.addEventListener('mouseleave', function () {
                if (!frame.contains(document.activeElement)) {
                    frame.classList.remove('is-controls-visible');
                }
            });
        }

        video.addEventListener('click', function () {
            showControlsBriefly();
            togglePlayback(video);
        });

        if (playButton) {
            playButton.addEventListener('click', function (event) {
                consumeControlClick(event);
                togglePlayback(video);
            });
        }

        if (muteButton) {
            muteButton.addEventListener('click', function (event) {
                consumeControlClick(event);
                toggleMute(video);
            });
        }

        if (volume) {
            volume.addEventListener('input', function (event) {
                consumeControlClick(event);
                video.volume = Number(volume.value);
                video.muted = video.volume === 0;
                if (!video.muted) {
                    localStorage.setItem(USER_UNMUTED_KEY, 'true');
                    removeUnmuteOverlay();
                }
                updateVolumeSlider(volume, video.volume);
                localStorage.setItem(VOLUME_KEY, String(video.volume));
                localStorage.setItem(MUTED_KEY, String(video.muted));
            });
        }

        if (speed) {
            speed.addEventListener('change', function (event) {
                consumeControlClick(event);
                video.playbackRate = Number(speed.value) || 1;
                localStorage.setItem(SPEED_KEY, String(video.playbackRate));
            });
        }

        if (subtitles) {
            subtitles.addEventListener('change', function (event) {
                consumeControlClick(event);
                setSubtitleTrack(video, subtitles.value);
            });
        }

        if (castButton) {
            castButton.addEventListener('click', function (event) {
                consumeControlClick(event);
                castToTv(video);
            });
        }

        if (fullscreenButton) {
            fullscreenButton.addEventListener('click', function (event) {
                consumeControlClick(event);
                toggleFullscreen();
            });
        }

        if (autoplayEnded) {
            autoplayEnded.addEventListener('change', function (event) {
                consumeControlClick(event);
                localStorage.setItem(AUTOPLAY_ENDED_KEY, String(autoplayEnded.checked));
            });
        }

        video.addEventListener('play', function () {
            updatePlayButton(video, playButton);
        });
        video.addEventListener('pause', function () {
            updatePlayButton(video, playButton);
        });
        video.addEventListener('ended', function () {
            updatePlayButton(video, playButton);
        });
        video.addEventListener('volumechange', function () {
            if (volume) {
                volume.value = String(video.volume);
                updateVolumeSlider(volume, video.volume);
            }
            updateMuteButton(video, muteButton);
            localStorage.setItem(MUTED_KEY, String(video.muted));
            localStorage.setItem(VOLUME_KEY, String(video.volume));
        });
        video.addEventListener('loadedmetadata', function () {
            syncSubtitleControl(video, subtitles);
            syncCastButton(video, castButton);
            applyStoredPlaybackSettings(video, volume, speed);
            updateMuteButton(video, muteButton);
        });
        document.addEventListener('fullscreenchange', function () {
            updateFullscreenButton(fullscreenButton);
        });

        document.addEventListener('videoPageUpdated', function () {
            syncSubtitleControl(video, subtitles);
            syncCastButton(video, castButton);
            applyStoredPlaybackSettings(video, volume, speed);
            updatePlayButton(video, playButton);
            updateMuteButton(video, muteButton);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    window.isVideoEndedAutoplayEnabled = function () {
        return readStoredBoolean(AUTOPLAY_ENDED_KEY, getSetting('playback.autoplayEnded', true));
    };
})();
