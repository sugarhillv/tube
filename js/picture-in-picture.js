/**
 * Picture-in-Picture controls for supported browsers.
 * Uses standard PiP API with Safari/iOS presentation mode fallback.
 */
(function () {
    'use strict';

    function getVideoElement() {
        return document.querySelector('video');
    }

    function getPipButton() {
        return document.querySelector('.pip-toggle-button');
    }

    function consumeControlClick(event) {
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
    }

    function isStandardPipSupported(videoElement) {
        return Boolean(
            videoElement &&
            document.pictureInPictureEnabled &&
            typeof videoElement.requestPictureInPicture === 'function'
        );
    }

    function isWebkitPipSupported(videoElement) {
        return Boolean(
            videoElement &&
            typeof videoElement.webkitSetPresentationMode === 'function'
        );
    }

    function isInStandardPip(videoElement) {
        return document.pictureInPictureElement === videoElement;
    }

    function isInWebkitPip(videoElement) {
        return videoElement.webkitPresentationMode === 'picture-in-picture';
    }

    function updateButtonState(button, videoElement) {
        if (!button || !videoElement) return;
        const inPip = isInStandardPip(videoElement) || isInWebkitPip(videoElement);
        button.textContent = inPip ? 'Exit PiP' : 'PiP';
        button.setAttribute('aria-pressed', inPip ? 'true' : 'false');
    }

    async function togglePictureInPicture() {
        const videoElement = getVideoElement();
        const button = getPipButton();
        if (!videoElement || !button) return;

        try {
            if (isStandardPipSupported(videoElement)) {
                if (isInStandardPip(videoElement)) {
                    await document.exitPictureInPicture();
                } else {
                    await videoElement.requestPictureInPicture();
                }
            } else if (isWebkitPipSupported(videoElement)) {
                if (isInWebkitPip(videoElement)) {
                    videoElement.webkitSetPresentationMode('inline');
                } else {
                    videoElement.webkitSetPresentationMode('picture-in-picture');
                }
            }
        } catch (error) {
            console.warn('PiP toggle failed:', error);
        } finally {
            updateButtonState(button, videoElement);
        }
    }

    function bind() {
        const videoElement = getVideoElement();
        const button = getPipButton();
        if (!videoElement || !button) return;

        const supported = isStandardPipSupported(videoElement) || isWebkitPipSupported(videoElement);
        if (!supported) {
            button.hidden = true;
            return;
        }

        button.hidden = false;
        button.addEventListener('click', function (event) {
            consumeControlClick(event);
            togglePictureInPicture();
        });

        document.addEventListener('enterpictureinpicture', function () {
            updateButtonState(button, videoElement);
        });
        document.addEventListener('leavepictureinpicture', function () {
            updateButtonState(button, videoElement);
        });

        videoElement.addEventListener('webkitpresentationmodechanged', function () {
            updateButtonState(button, videoElement);
        });

        updateButtonState(button, videoElement);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    document.addEventListener('videoPageUpdated', function () {
        const button = getPipButton();
        const videoElement = getVideoElement();
        updateButtonState(button, videoElement);
    });
})();
