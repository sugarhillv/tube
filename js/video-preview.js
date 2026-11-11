(function() {
    'use strict';

    const ANNOTATIONS_STORAGE_PREFIX = 'video-player-annotations:';

    function getHoverIntervalMs() {
        if (window.SugarHillSettings && typeof window.SugarHillSettings.get === 'function') {
            const value = Number(window.SugarHillSettings.get('previews.hoverIntervalMs', 840));
            return Number.isFinite(value) && value > 0 ? value : 840;
        }
        return 840;
    }

    function readSpriteData(element) {
        if (!element || !element.dataset.previewSrc) return null;
        const frameCount = parseInt(element.dataset.previewFrameCount, 10) || 0;
        const frameWidth = parseInt(element.dataset.previewFrameWidth, 10) || 0;
        const frameHeight = parseInt(element.dataset.previewFrameHeight, 10) || 0;
        const columns = parseInt(element.dataset.previewColumns, 10) || 0;
        if (!frameCount || !frameWidth || !frameHeight || !columns) return null;
        return {
            src: element.dataset.previewSrc,
            frameCount,
            frameWidth,
            frameHeight,
            columns,
            rows: Math.ceil(frameCount / columns)
        };
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getFrameIndexFromRatio(ratio, sprite) {
        return clamp(Math.floor(ratio * sprite.frameCount), 0, sprite.frameCount - 1);
    }

    function setElementFrame(element, sprite, frameIndex, mode) {
        const column = frameIndex % sprite.columns;
        const row = Math.floor(frameIndex / sprite.columns);
        element.style.backgroundImage = `url("${sprite.src}")`;

        if (mode === 'pixel') {
            const scaleX = element.clientWidth > 0 ? (element.clientWidth / sprite.frameWidth) : 1;
            const scaleY = element.clientHeight > 0 ? (element.clientHeight / sprite.frameHeight) : 1;
            element.style.backgroundSize = `${sprite.columns * sprite.frameWidth * scaleX}px ${sprite.rows * sprite.frameHeight * scaleY}px`;
            element.style.backgroundPosition = `-${column * sprite.frameWidth * scaleX}px -${row * sprite.frameHeight * scaleY}px`;
            return;
        }

        const x = sprite.columns > 1 ? (column / (sprite.columns - 1)) * 100 : 0;
        const y = sprite.rows > 1 ? (row / (sprite.rows - 1)) * 100 : 0;
        element.style.backgroundSize = `${sprite.columns * 100}% ${sprite.rows * 100}%`;
        element.style.backgroundPosition = `${x}% ${y}%`;
    }

    function setupThumbnailPreview(container) {
        if (container.dataset.previewInitialized === 'true') return;
        const sprite = readSpriteData(container);
        if (!sprite) return;

        container.dataset.previewInitialized = 'true';
        const preview = document.createElement('div');
        preview.className = 'video-preview-sprite';
        preview.setAttribute('aria-hidden', 'true');
        container.appendChild(preview);

        let frameIndex = 0;
        let intervalId = null;

        function showPreview() {
            container.classList.add('is-previewing');
            setElementFrame(preview, sprite, frameIndex, 'percent');
            intervalId = window.setInterval(() => {
                frameIndex = (frameIndex + 1) % sprite.frameCount;
                setElementFrame(preview, sprite, frameIndex, 'percent');
            }, getHoverIntervalMs());
        }

        function updateFromPointer(event) {
            const rect = container.getBoundingClientRect();
            if (!rect.width) return;
            const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 0.9999);
            frameIndex = getFrameIndexFromRatio(ratio, sprite);
            setElementFrame(preview, sprite, frameIndex, 'percent');
        }

        function hidePreview() {
            container.classList.remove('is-previewing');
            if (intervalId) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
            frameIndex = 0;
        }

        container.addEventListener('pointerenter', showPreview);
        container.addEventListener('pointermove', updateFromPointer);
        container.addEventListener('pointerleave', hidePreview);
        container.addEventListener('focusin', showPreview);
        container.addEventListener('focusout', hidePreview);
    }

    function formatTime(seconds) {
        const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const remainder = safeSeconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
        }
        return `${minutes}:${String(remainder).padStart(2, '0')}`;
    }

    function setupVideoScrubber(scrubber) {
        if (scrubber.dataset.previewInitialized === 'true') return;
        const range = scrubber.querySelector('.video-scrubber-range');
        const frame = scrubber.closest('.video-player-frame');
        const video = frame ? frame.querySelector('video') : null;
        const preview = scrubber.querySelector('.video-scrubber-preview');
        const previewImage = scrubber.querySelector('.video-scrubber-preview-image');
        const currentLabel = scrubber.querySelector('[data-scrubber-current]');
        const durationLabel = scrubber.querySelector('[data-scrubber-duration]');
        const sprite = readSpriteData(scrubber);

        if (!range || !video) return;
        scrubber.dataset.previewInitialized = 'true';

        if (sprite && preview) {
            preview.style.setProperty('--scrubber-preview-width', `${sprite.frameWidth}px`);
            preview.style.setProperty('--scrubber-preview-aspect', `${sprite.frameWidth} / ${sprite.frameHeight}`);
        }

        let isDragging = false;
        const markerLayer = document.createElement('div');
        markerLayer.className = 'video-scrubber-markers';
        markerLayer.setAttribute('aria-hidden', 'true');
        scrubber.appendChild(markerLayer);

        function duration() {
            return Number(video.duration) || Number(video.dataset.duration) || Number(range.max) || 0;
        }

        function updateFill(value) {
            const max = Number(range.max) || duration() || 1;
            const percent = clamp((Number(value) / max) * 100, 0, 100);
            scrubber.style.setProperty('--scrubber-percent', `${percent}%`);
            return percent;
        }

        function updatePreview(value) {
            if (!sprite || !preview || !previewImage) return;
            const max = Number(range.max) || duration() || 1;
            const ratio = clamp(Number(value) / max, 0, 0.9999);
            const percent = updateFill(value);
            setElementFrame(previewImage, sprite, getFrameIndexFromRatio(ratio, sprite), 'pixel');
            preview.style.left = `${range.offsetLeft + (range.offsetWidth * percent / 100)}px`;
        }

        function videoSourcePath() {
            const source = video.querySelector('source');
            const rawValue = (source && source.getAttribute('src')) || video.currentSrc || window.location.pathname;
            try {
                return new URL(rawValue, window.location.href).pathname;
            } catch (error) {
                return String(rawValue || window.location.pathname);
            }
        }

        function readAnnotations() {
            try {
                const rawValue = localStorage.getItem(ANNOTATIONS_STORAGE_PREFIX + videoSourcePath());
                const parsed = rawValue ? JSON.parse(rawValue) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                return [];
            }
        }

        function createMarker(className, start, end, label) {
            const max = duration();
            if (!max || start < 0 || start > max) return null;
            const left = clamp((start / max) * 100, 0, 100);
            const width = end > start
                ? clamp(((Math.min(end, max) - start) / max) * 100, 0.4, 100 - left)
                : 0.4;
            const marker = document.createElement('button');
            marker.type = 'button';
            marker.className = className;
            marker.style.left = `${left}%`;
            marker.style.width = `${width}%`;
            marker.title = label || 'Timeline marker';
            marker.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                video.currentTime = clamp(start, 0, max);
                video.pause();
            });
            return marker;
        }

        function renderTimelineMarkers() {
            const max = duration();
            markerLayer.replaceChildren();
            if (!max) return;

            if (window.SugarHillProgress && typeof window.SugarHillProgress.getVideoProgressStateByUrl === 'function') {
                const progress = window.SugarHillProgress.getVideoProgressStateByUrl(window.location.href, max);
                if (progress.currentTime > 0 && progress.status !== 'completed') {
                    const marker = createMarker('video-scrubber-marker video-scrubber-marker--progress', progress.currentTime, progress.currentTime, 'Saved progress');
                    if (marker) markerLayer.appendChild(marker);
                }
            }

            readAnnotations().forEach(annotation => {
                const start = Number(annotation && annotation.start);
                const end = Number(annotation && annotation.end);
                if (!Number.isFinite(start)) return;
                const label = annotation.type === 'image'
                    ? 'Image annotation'
                    : String(annotation.text || 'Annotation').slice(0, 80);
                const marker = createMarker(
                    'video-scrubber-marker video-scrubber-marker--annotation',
                    start,
                    Number.isFinite(end) ? end : start,
                    label
                );
                if (marker) markerLayer.appendChild(marker);
            });
        }

        function setRangeToVideoTime() {
            if (isDragging) return;
            const max = duration();
            if (max > 0) {
                range.max = String(max);
                if (durationLabel) durationLabel.textContent = formatTime(max);
            }
            range.value = String(video.currentTime || 0);
            if (currentLabel) currentLabel.textContent = formatTime(range.value);
            updateFill(range.value);
        }

        function scrubToRange() {
            const value = Number(range.value) || 0;
            video.currentTime = clamp(value, 0, duration());
            if (currentLabel) currentLabel.textContent = formatTime(value);
            updatePreview(value);
        }

        range.addEventListener('input', scrubToRange);
        range.addEventListener('pointerdown', () => {
            isDragging = true;
            scrubber.classList.add('is-previewing');
            updatePreview(range.value);
        });
        range.addEventListener('pointermove', () => {
            if (isDragging) updatePreview(range.value);
        });
        range.addEventListener('pointerup', () => {
            isDragging = false;
            scrubber.classList.remove('is-previewing');
            scrubToRange();
        });
        range.addEventListener('pointercancel', () => {
            isDragging = false;
            scrubber.classList.remove('is-previewing');
        });
        range.addEventListener('focus', () => {
            scrubber.classList.add('is-previewing');
            updatePreview(range.value);
        });
        range.addEventListener('blur', () => {
            scrubber.classList.remove('is-previewing');
        });

        video.addEventListener('loadedmetadata', () => {
            setRangeToVideoTime();
            renderTimelineMarkers();
        });
        video.addEventListener('timeupdate', setRangeToVideoTime);
        document.addEventListener('sugarhill:progress-changed', renderTimelineMarkers);
        document.addEventListener('sugarhill:annotations-changed', renderTimelineMarkers);
        window.addEventListener('storage', renderTimelineMarkers);
        setRangeToVideoTime();
        renderTimelineMarkers();
    }

    function initVideoPreviews(root) {
        const scope = root || document;
        forEachElement(scope, [
            '.video-item-thumbnail-container',
            '.nav-link-thumbnail-container',
            '.search-result-thumbnail-container',
            '.playlist-video-thumbnail-wrap'
        ].join(','), setupThumbnailPreview);
        forEachElement(scope, '.video-scrubber', setupVideoScrubber);
    }

    function forEachElement(scope, selector, callback) {
        if (scope.nodeType === 1 && scope.matches(selector)) {
            callback(scope);
        }
        scope.querySelectorAll(selector).forEach(callback);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initVideoPreviews(document));
    } else {
        initVideoPreviews(document);
    }

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) initVideoPreviews(node);
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.initVideoPreviews = initVideoPreviews;
})();
