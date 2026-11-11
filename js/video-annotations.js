(function () {
    'use strict';

    var ANNOTATIONS_STORAGE_PREFIX = 'video-player-annotations:';
    var ANNOTATIONS_VISIBLE_KEY = 'video-player-annotations-visible';
    var LAST_ANNOTATION_COLOR_KEY = 'video-player-last-annotation-color';
    var FALLBACK_ANNOTATION_LENGTH_SECONDS = 5;
    var FALLBACK_ANNOTATION_COLOR = '#FFF8DC';
    var FALLBACK_ANNOTATION_FONT = 'system';
    var ANNOTATION_TYPE_TEXT = 'text';
    var ANNOTATION_TYPE_IMAGE = 'image';
    var EDITOR_QUERY_PARAM = 'annotations';
    var EDITOR_QUERY_VALUE = '1';
    var FONT_OPTIONS = [
        {
            value: 'system',
            label: 'System',
            family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        },
        {
            value: 'serif',
            label: 'Serif',
            family: "Georgia, 'Times New Roman', serif"
        },
        {
            value: 'mono',
            label: 'Mono',
            family: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
        },
        {
            value: 'hand',
            label: 'Hand',
            family: "'Segoe Print', 'Comic Sans MS', cursive"
        }
    ];
    var RESIZE_EDGES = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];

    var state = {
        video: null,
        frame: null,
        layer: null,
        annotations: [],
        placementMode: false,
        placementPreview: null,
        placementClickSuppressUntil: 0,
        editor: null,
        editorOverlay: null,
        editorPreview: null,
        editorRect: null,
        editorAnnotationId: '',
        editorControls: null,
        editorHasChanges: false,
        editorMode: false,
        savedAnnotationsSnapshot: '[]',
        savedSidebarHtml: null,
        focusedAnnotationId: '',
        warningPromptShown: false,
        sidebarSignature: '',
        editorGlobalBound: false
    };

    function getVideo() {
        return document.querySelector('.video-player-frame video') || document.querySelector('video');
    }

    function getFrame() {
        return document.querySelector('.video-player-frame');
    }

    function getAnnotationButton() {
        return document.querySelector('[data-player-annotation-create]');
    }

    function getVisibilityButton() {
        return document.querySelector('[data-player-annotations-visible-button]');
    }

    function getEditorEntryButton() {
        return document.querySelector('[data-annotations-editor-open]');
    }

    function getEditorToolbar() {
        return document.querySelector('.video-actions-primary');
    }

    function isSidebarEditor() {
        return state.editorMode;
    }

    function isEditorUrl() {
        try {
            var url = new URL(window.location.href);
            return url.searchParams.get(EDITOR_QUERY_PARAM) === EDITOR_QUERY_VALUE;
        } catch (error) {
            return false;
        }
    }

    function getEditorUrl() {
        var url = new URL(window.location.href);
        url.searchParams.set(EDITOR_QUERY_PARAM, EDITOR_QUERY_VALUE);
        return url.href;
    }

    function getNonEditorUrl() {
        var url = new URL(window.location.href);
        url.searchParams.delete(EDITOR_QUERY_PARAM);
        return url.href;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toFiniteNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function getSetting(path, fallback) {
        if (window.SugarHillSettings && typeof window.SugarHillSettings.get === 'function') {
            return window.SugarHillSettings.get(path, fallback);
        }
        return fallback;
    }

    function getDefaultAnnotationLengthSeconds() {
        var value = Number(getSetting('annotations.defaultLengthSeconds', FALLBACK_ANNOTATION_LENGTH_SECONDS));
        return Number.isFinite(value) && value > 0 ? value : FALLBACK_ANNOTATION_LENGTH_SECONDS;
    }

    function getDefaultAnnotationColor() {
        return getSetting('annotations.defaultColor', FALLBACK_ANNOTATION_COLOR);
    }

    function getDefaultAnnotationFont() {
        return getSetting('annotations.defaultFont', FALLBACK_ANNOTATION_FONT);
    }

    function normalizeColor(value) {
        var color = String(value || '').trim();
        return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : getDefaultAnnotationColor();
    }

    function normalizeFont(value) {
        var font = String(value || '').trim();
        return FONT_OPTIONS.some(function (option) {
            return option.value === font;
        }) ? font : getDefaultAnnotationFont();
    }

    function getFontFamily(font) {
        var normalizedFont = normalizeFont(font);
        var match = FONT_OPTIONS.find(function (option) {
            return option.value === normalizedFont;
        });
        return match ? match.family : FONT_OPTIONS[0].family;
    }

    function normalizeAnnotationType(value) {
        return value === ANNOTATION_TYPE_IMAGE ? ANNOTATION_TYPE_IMAGE : ANNOTATION_TYPE_TEXT;
    }

    function normalizeImageUrl(value) {
        return String(value || '').trim();
    }

    function getImageSrc(value) {
        var url = normalizeImageUrl(value);
        if (/^[a-zA-Z]:[\\/]/.test(url)) {
            return 'file:///' + url.replace(/\\/g, '/');
        }
        if (url.indexOf('\\') !== -1) {
            return url.replace(/\\/g, '/');
        }
        return url;
    }

    function getLastAnnotationColor() {
        return normalizeColor(getStoredItem(LAST_ANNOTATION_COLOR_KEY));
    }

    function readStoredBoolean(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            if (value === null) return fallback;
            return value === 'true';
        } catch (error) {
            return fallback;
        }
    }

    function setStoredItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.warn('Unable to save video annotations:', error);
        }
    }

    function getStoredItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function getVideoSource(video) {
        if (!video) return window.location.pathname;
        var source = video.querySelector('source');
        return (source && source.getAttribute('src')) || video.currentSrc || window.location.pathname;
    }

    function getVideoStorageKey() {
        var source = getVideoSource(state.video);
        try {
            source = new URL(source, window.location.href).pathname;
        } catch (error) {
            source = String(source || window.location.pathname);
        }
        return ANNOTATIONS_STORAGE_PREFIX + source;
    }

    function normalizeAnnotation(annotation) {
        if (!annotation || typeof annotation !== 'object') return null;

        var type = normalizeAnnotationType(annotation.type);
        var text = String(annotation.text || '');
        var imageUrl = normalizeImageUrl(annotation.imageUrl || annotation.url);
        if (type === ANNOTATION_TYPE_IMAGE) {
            if (!imageUrl) return null;
        } else if (!text.trim()) {
            return null;
        }

        var start = Math.max(0, toFiniteNumber(annotation.start, 0));
        var end = Math.max(start + 0.1, toFiniteNumber(annotation.end, start + getDefaultAnnotationLengthSeconds()));
        var width = clamp(toFiniteNumber(annotation.width, 32), 5, 100);
        var height = clamp(toFiniteNumber(annotation.height, 20), 5, 100);
        var x = clamp(toFiniteNumber(annotation.x, 12), 0, 100 - width);
        var y = clamp(toFiniteNumber(annotation.y, 12), 0, 100 - height);

        return {
            id: String(annotation.id || Date.now() + '-' + Math.random().toString(16).slice(2)),
            type: type,
            text: text,
            imageUrl: imageUrl,
            start: start,
            end: end,
            x: x,
            y: y,
            width: width,
            height: height,
            color: normalizeColor(annotation.color),
            fontFamily: normalizeFont(annotation.fontFamily)
        };
    }

    function cloneAnnotation(annotation) {
        return normalizeAnnotation(Object.assign({}, annotation));
    }

    function cloneAnnotations(annotations) {
        return (Array.isArray(annotations) ? annotations : [])
            .map(cloneAnnotation)
            .filter(Boolean);
    }

    function serializeAnnotations(annotations) {
        return JSON.stringify(cloneAnnotations(annotations));
    }

    function getAnnotationById(annotationId) {
        return state.annotations.find(function (annotation) {
            return annotation.id === annotationId;
        }) || null;
    }

    function getAnnotationIndexById(annotationId) {
        return state.annotations.findIndex(function (annotation) {
            return annotation.id === annotationId;
        });
    }

    function loadAnnotations() {
        var rawValue = getStoredItem(getVideoStorageKey());
        if (!rawValue) {
            state.annotations = [];
            return;
        }

        try {
            var parsed = JSON.parse(rawValue);
            state.annotations = Array.isArray(parsed)
                ? parsed.map(normalizeAnnotation).filter(Boolean)
                : [];
        } catch (error) {
            state.annotations = [];
        }
    }

    function saveAnnotations() {
        setStoredItem(getVideoStorageKey(), JSON.stringify(state.annotations));
        notifyAnnotationsChanged();
    }

    function notifyAnnotationsChanged() {
        document.dispatchEvent(new CustomEvent('sugarhill:annotations-changed', {
            detail: {
                annotations: cloneAnnotations(state.annotations)
            }
        }));
    }

    function ensureLayer() {
        if (!state.frame) return null;

        var layer = state.frame.querySelector('.video-annotation-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'video-annotation-layer';
            layer.setAttribute('aria-live', 'polite');
            var controls = state.frame.querySelector('.video-controls');
            state.frame.insertBefore(layer, controls || null);
        }

        state.layer = layer;
        return layer;
    }

    function areAnnotationsVisible() {
        return readStoredBoolean(ANNOTATIONS_VISIBLE_KEY, getSetting('annotations.visible', true));
    }

    function updateVisibilityButton() {
        var button = getVisibilityButton();
        if (!button) return;

        var isVisible = state.editorMode || areAnnotationsVisible();
        button.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
        button.setAttribute('aria-label', state.editorMode ? 'Exit annotations editor' : isVisible ? 'Hide annotations' : 'Show annotations');
        button.classList.toggle('is-off', !isVisible);
    }

    function renderAnnotation(annotation) {
        var node = document.createElement('div');
        node.className = 'video-annotation video-annotation--' + annotation.type;
        node.setAttribute('role', 'note');
        node.dataset.annotationId = annotation.id;
        if (state.editorMode && annotation.id === state.focusedAnnotationId) {
            node.classList.add('is-focused');
        }
        node.style.left = annotation.x + '%';
        node.style.top = annotation.y + '%';
        node.style.width = annotation.width + '%';
        node.style.height = annotation.height + '%';

        if (annotation.type === ANNOTATION_TYPE_IMAGE) {
            var image = document.createElement('img');
            image.className = 'video-annotation-image';
            if (annotation.imageUrl) {
                image.src = getImageSrc(annotation.imageUrl);
            }
            image.alt = annotation.text || '';
            node.appendChild(image);
            return node;
        }

        node.style.color = annotation.color;
        node.style.fontFamily = getFontFamily(annotation.fontFamily);
        node.textContent = annotation.text;
        return node;
    }

    function syncVisibleAnnotations() {
        var layer = ensureLayer();
        if (!layer || !state.video) return;

        if (!state.editorMode && !areAnnotationsVisible()) {
            layer.hidden = true;
            removeEditorPreview();
            layer.replaceChildren();
            renderAnnotationsEditorSidebar();
            return;
        }

        layer.hidden = false;
        var currentTime = Number(state.video.currentTime) || 0;
        var visibleAnnotations = state.annotations.filter(function (annotation) {
            if (state.editor && state.editorAnnotationId && annotation.id === state.editorAnnotationId) return false;
            return currentTime >= annotation.start && currentTime <= annotation.end;
        });

        state.editorPreview = null;
        layer.replaceChildren.apply(
            layer,
            visibleAnnotations.map(renderAnnotation)
        );
        updateEditorPreview();
        renderAnnotationsEditorSidebar();
    }

    function updateFrameAnnotationState() {
        if (!state.frame) return;

        var isActive = state.placementMode || (!state.editorMode && Boolean(state.editor));
        state.frame.classList.toggle('is-annotation-mode', isActive);
        state.frame.classList.toggle('is-annotation-placement-mode', state.placementMode);
        if (isActive || state.editorOverlay) {
            state.frame.classList.add('is-controls-visible');
        }
    }

    function setPlacementMode(isEnabled) {
        if (state.editor) return;
        state.placementMode = Boolean(isEnabled);
        if (!state.placementMode) {
            removePlacementPreview();
        }
        updateFrameAnnotationState();
        updateEditorToolbar();
    }

    function getFrameDimensions() {
        if (!state.frame) return { width: 1, height: 1 };
        return {
            width: Math.max(1, state.frame.clientWidth || 1),
            height: Math.max(1, state.frame.clientHeight || 1)
        };
    }

    function getMinWidthPercent() {
        var dimensions = getFrameDimensions();
        return Math.min(100, (50 / dimensions.width) * 100);
    }

    function getMinHeightPercent() {
        var dimensions = getFrameDimensions();
        return Math.min(100, (20 / dimensions.height) * 100);
    }

    function clampEditorRect(rect) {
        var width = clamp(toFiniteNumber(rect.width, 36), getMinWidthPercent(), 100);
        var height = clamp(toFiniteNumber(rect.height, 24), getMinHeightPercent(), 100);
        var x = clamp(toFiniteNumber(rect.x, 8), 0, 100 - width);
        var y = clamp(toFiniteNumber(rect.y, 8), 0, 100 - height);
        return { x: x, y: y, width: width, height: height };
    }

    function removePlacementPreview() {
        if (state.placementPreview) {
            state.placementPreview.remove();
        }
        state.placementPreview = null;
    }

    function showPlacementPreview(rect) {
        if (!state.frame) return;
        if (!state.placementPreview) {
            var preview = document.createElement('div');
            preview.className = 'video-annotation-placement-preview';
            preview.setAttribute('aria-hidden', 'true');
            state.placementPreview = preview;
            state.frame.appendChild(preview);
        }
        applyEditorRect(state.placementPreview, rect);
    }

    function applyEditorRect(editor, rect) {
        editor.style.left = rect.x + '%';
        editor.style.top = rect.y + '%';
        editor.style.width = rect.width + '%';
        editor.style.height = rect.height + '%';
    }

    function applyVisibleAnnotationRect(annotationId, rect) {
        if (!state.layer || !annotationId) return;

        state.layer.querySelectorAll('.video-annotation').forEach(function (node) {
            if (node.dataset.annotationId !== annotationId) return;
            applyEditorRect(node, rect);
        });
    }

    function updateEditorRect(rect, markChanged) {
        if (!state.editor) return;
        state.editorRect = clampEditorRect(rect);
        if (!isSidebarEditor()) {
            applyEditorRect(state.editor, state.editorRect);
        }
        if (state.editorOverlay) {
            applyEditorRect(state.editorOverlay, state.editorRect);
        }
        applyVisibleAnnotationRect(state.editorAnnotationId, state.editorRect);
        updateEditorPreview();
        if (markChanged !== false) {
            state.editorHasChanges = true;
        }
    }

    function removeEditorOverlay() {
        if (state.editorOverlay) {
            state.editorOverlay.remove();
        }
        state.editorOverlay = null;
    }

    function removeEditorPreview() {
        if (state.editorPreview) {
            state.editorPreview.remove();
        }
        state.editorPreview = null;
    }

    function getDraftAnnotationFromEditor() {
        var controls = state.editorControls;
        if (!controls || !state.editorRect) return null;

        return {
            id: state.editorAnnotationId || 'editor-preview',
            type: controls.typeField.getValue(),
            text: controls.textarea.value,
            imageUrl: normalizeImageUrl(controls.imageUrlField.value),
            start: parseTimestamp(controls.startInput.value),
            end: parseTimestamp(controls.endInput.value),
            x: state.editorRect.x,
            y: state.editorRect.y,
            width: state.editorRect.width,
            height: state.editorRect.height,
            color: normalizeColor(controls.colorInput.value),
            fontFamily: normalizeFont(controls.fontInput.value)
        };
    }

    function updateEditorPreview() {
        if (!state.editorMode || !state.editor || !state.editorRect) {
            removeEditorPreview();
            return;
        }

        var layer = ensureLayer();
        if (!layer) return;

        var previewAnnotation = getDraftAnnotationFromEditor();
        if (!previewAnnotation) {
            removeEditorPreview();
            return;
        }

        var preview = renderAnnotation(previewAnnotation);
        preview.classList.add('video-annotation--editor-preview');
        preview.dataset.annotationPreview = 'true';
        preview.setAttribute('aria-hidden', 'true');

        if (state.editorPreview && state.editorPreview.isConnected) {
            state.editorPreview.replaceWith(preview);
        } else {
            layer.appendChild(preview);
        }
        state.editorPreview = preview;
    }

    function showEditorOverlay() {
        removeEditorOverlay();
        if (!state.frame || !state.editorRect) return;

        var overlay = document.createElement('div');
        overlay.className = 'video-annotation-edit-frame';
        overlay.setAttribute('aria-hidden', 'true');
        applyEditorRect(overlay, state.editorRect);
        RESIZE_EDGES.forEach(function (edge) {
            overlay.appendChild(createResizeHandle(edge));
        });
        overlay.addEventListener('pointerdown', function (event) {
            if (event.target && event.target.classList.contains('video-annotation-resize-handle')) return;
            startPointerInteraction(event, 'move');
        });

        state.editorOverlay = overlay;
        state.frame.appendChild(overlay);
    }

    function formatTimestamp(seconds) {
        var totalTenths = Math.max(0, Math.round((Number(seconds) || 0) * 10));
        var hours = Math.floor(totalTenths / 36000);
        var minutes = Math.floor((totalTenths % 36000) / 600);
        var wholeSeconds = Math.floor((totalTenths % 600) / 10);
        var tenths = totalTenths % 10;

        if (hours > 0) {
            return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(wholeSeconds).padStart(2, '0') + '.' + tenths;
        }
        return minutes + ':' + String(wholeSeconds).padStart(2, '0') + '.' + tenths;
    }

    function parseTimestamp(value) {
        var text = String(value || '').trim();
        if (!text) return NaN;

        if (text.indexOf(':') === -1) {
            var seconds = Number(text);
            return Number.isFinite(seconds) ? seconds : NaN;
        }

        var parts = text.split(':');
        if (parts.length > 3) return NaN;

        var total = 0;
        var multiplier = 1;
        for (var index = parts.length - 1; index >= 0; index -= 1) {
            var part = Number(parts[index]);
            if (!Number.isFinite(part)) return NaN;
            total += part * multiplier;
            multiplier *= 60;
        }
        return total;
    }

    function createTimeField(labelText, value) {
        var label = document.createElement('label');
        label.className = 'video-annotation-time-field';

        var labelSpan = document.createElement('span');
        labelSpan.textContent = labelText;

        var input = document.createElement('input');
        input.type = 'text';
        input.value = formatTimestamp(value);
        input.inputMode = 'decimal';
        input.setAttribute('aria-label', labelText + ' time');

        label.appendChild(labelSpan);
        label.appendChild(input);

        return { label: label, input: input };
    }

    function createColorField(value) {
        var label = document.createElement('label');
        label.className = 'video-annotation-style-field';

        var labelSpan = document.createElement('span');
        labelSpan.textContent = 'Color';

        var input = document.createElement('input');
        input.type = 'color';
        input.value = normalizeColor(value || getLastAnnotationColor());
        input.setAttribute('aria-label', 'Annotation text color');

        label.appendChild(labelSpan);
        label.appendChild(input);

        return { label: label, input: input };
    }

    function createTypeField(value) {
        var wrapper = document.createElement('div');
        wrapper.className = 'video-annotation-type-toggle';

        var inputs = {};
        var groupName = 'video-annotation-type-' + Date.now();
        var selectedType = normalizeAnnotationType(value);
        [ANNOTATION_TYPE_TEXT, ANNOTATION_TYPE_IMAGE].forEach(function (type) {
            var label = document.createElement('label');
            var input = document.createElement('input');
            var text = document.createElement('span');

            input.type = 'radio';
            input.name = groupName;
            input.value = type;
            input.checked = type === selectedType;
            text.textContent = type === ANNOTATION_TYPE_TEXT ? 'Text' : 'Image';

            label.appendChild(input);
            label.appendChild(text);
            wrapper.appendChild(label);
            inputs[type] = input;
        });

        return {
            wrapper: wrapper,
            inputs: inputs,
            getValue: function () {
                return inputs[ANNOTATION_TYPE_IMAGE].checked ? ANNOTATION_TYPE_IMAGE : ANNOTATION_TYPE_TEXT;
            }
        };
    }

    function createFontField(value) {
        var label = document.createElement('label');
        label.className = 'video-annotation-style-field';

        var labelSpan = document.createElement('span');
        labelSpan.textContent = 'Font';

        var select = document.createElement('select');
        select.setAttribute('aria-label', 'Annotation font');
        var selectedFont = normalizeFont(value);
        FONT_OPTIONS.forEach(function (option) {
            var item = document.createElement('option');
            item.value = option.value;
            item.textContent = option.label;
            if (option.value === selectedFont) {
                item.selected = true;
            }
            select.appendChild(item);
        });

        label.appendChild(labelSpan);
        label.appendChild(select);

        return { label: label, input: select };
    }

    function createImageUrlField() {
        var textarea = document.createElement('textarea');
        textarea.className = 'video-annotation-url';
        textarea.placeholder = 'Image URL or local file path';
        textarea.spellcheck = false;
        textarea.setAttribute('aria-label', 'Image URL or local file path');
        textarea.addEventListener('input', function () {
            textarea.removeAttribute('aria-invalid');
        });
        return textarea;
    }

    function createResizeHandle(edge) {
        var handle = document.createElement('span');
        handle.className = 'video-annotation-resize-handle video-annotation-resize-handle--' + edge;
        handle.dataset.resizeEdge = edge;
        handle.setAttribute('aria-hidden', 'true');
        handle.addEventListener('pointerdown', function (event) {
            startPointerInteraction(event, 'resize', edge);
        });
        return handle;
    }

    function isTextEntryTarget(target) {
        return Boolean(target && target.closest(
            'textarea, input, select, button, a, label, .video-annotation-type-toggle, .video-annotation-format-toolbar, .video-annotation-editor-footer'
        ));
    }

    function resizeRectFromEdges(startRect, dxPercent, dyPercent, edge) {
        var rect = {
            x: startRect.x,
            y: startRect.y,
            width: startRect.width,
            height: startRect.height
        };

        if (edge.indexOf('e') !== -1) {
            rect.width = clamp(startRect.width + dxPercent, getMinWidthPercent(), 100 - startRect.x);
        }
        if (edge.indexOf('s') !== -1) {
            rect.height = clamp(startRect.height + dyPercent, getMinHeightPercent(), 100 - startRect.y);
        }
        if (edge.indexOf('w') !== -1) {
            var right = startRect.x + startRect.width;
            rect.x = clamp(startRect.x + dxPercent, 0, right - getMinWidthPercent());
            rect.width = right - rect.x;
        }
        if (edge.indexOf('n') !== -1) {
            var bottom = startRect.y + startRect.height;
            rect.y = clamp(startRect.y + dyPercent, 0, bottom - getMinHeightPercent());
            rect.height = bottom - rect.y;
        }

        return rect;
    }

    function startPointerInteraction(event, mode, edge) {
        if (event.button && event.button !== 0) return;
        if (!state.editor || !state.editorRect) return;
        if (mode === 'move' && isTextEntryTarget(event.target)) return;

        event.preventDefault();
        event.stopPropagation();

        var pointerId = event.pointerId;
        var startX = event.clientX;
        var startY = event.clientY;
        var startRect = {
            x: state.editorRect.x,
            y: state.editorRect.y,
            width: state.editorRect.width,
            height: state.editorRect.height
        };

        function handlePointerMove(moveEvent) {
            if (typeof pointerId !== 'undefined' && moveEvent.pointerId !== pointerId) return;

            var dimensions = getFrameDimensions();
            var dxPercent = ((moveEvent.clientX - startX) / dimensions.width) * 100;
            var dyPercent = ((moveEvent.clientY - startY) / dimensions.height) * 100;

            if (mode === 'move') {
                updateEditorRect({
                    x: startRect.x + dxPercent,
                    y: startRect.y + dyPercent,
                    width: startRect.width,
                    height: startRect.height
                });
            } else {
                updateEditorRect(resizeRectFromEdges(startRect, dxPercent, dyPercent, edge));
            }

            moveEvent.preventDefault();
        }

        function stopPointerInteraction(upEvent) {
            if (typeof pointerId !== 'undefined' && upEvent.pointerId !== pointerId) return;
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', stopPointerInteraction);
            document.removeEventListener('pointercancel', stopPointerInteraction);
        }

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', stopPointerInteraction);
        document.addEventListener('pointercancel', stopPointerInteraction);
    }

    function closeEditor(renderSidebar) {
        if (state.editor) {
            state.editor.remove();
        }
        removeEditorOverlay();
        removeEditorPreview();
        removePlacementPreview();
        state.editor = null;
        state.editorRect = null;
        state.editorAnnotationId = '';
        state.editorControls = null;
        state.editorHasChanges = false;
        state.placementMode = false;
        updateFrameAnnotationState();
        updateEditorToolbar();
        if (renderSidebar !== false && state.editorMode) {
            renderAnnotationsEditorSidebar(true);
        }
    }

    function saveEditor(controls) {
        controls = controls || state.editorControls;
        if (!controls || !state.editorRect) return false;

        var type = controls.typeField.getValue();
        var text = controls.textarea.value;
        var imageUrl = normalizeImageUrl(controls.imageUrlField.value);
        var start = parseTimestamp(controls.startInput.value);
        var end = parseTimestamp(controls.endInput.value);
        if (!Number.isFinite(start)) start = Math.max(0, state.video ? Number(state.video.currentTime) || 0 : 0);
        if (!Number.isFinite(end) || end <= start) {
            end = start + getDefaultAnnotationLengthSeconds();
        }

        if (type === ANNOTATION_TYPE_IMAGE) {
            if (!imageUrl) {
                controls.imageUrlField.setAttribute('aria-invalid', 'true');
                controls.imageUrlField.focus();
                return false;
            }
        } else if (!text.trim()) {
            controls.textarea.setAttribute('aria-invalid', 'true');
            controls.textarea.focus();
            return false;
        }

        var color = normalizeColor(controls.colorInput.value);
        setStoredItem(LAST_ANNOTATION_COLOR_KEY, color);

        var annotation = normalizeAnnotation({
            id: state.editorAnnotationId || Date.now() + '-' + Math.random().toString(16).slice(2),
            type: type,
            text: text,
            imageUrl: imageUrl,
            start: start,
            end: end,
            x: state.editorRect.x,
            y: state.editorRect.y,
            width: state.editorRect.width,
            height: state.editorRect.height,
            color: color,
            fontFamily: normalizeFont(controls.fontInput.value)
        });

        if (!annotation) return false;

        if (state.editorAnnotationId) {
            var existingIndex = getAnnotationIndexById(state.editorAnnotationId);
            if (existingIndex >= 0) {
                state.annotations[existingIndex] = annotation;
            } else {
                state.annotations.push(annotation);
            }
            state.focusedAnnotationId = annotation.id;
        } else {
            state.annotations.push(annotation);
            state.focusedAnnotationId = annotation.id;
        }

        if (!state.editorMode) {
            saveAnnotations();
        }
        closeEditor(false);
        syncVisibleAnnotations();
        renderAnnotationsEditorSidebar(true);
        return true;
    }

    function showEditor(rect, initialAnnotation) {
        var annotation = initialAnnotation ? cloneAnnotation(initialAnnotation) : null;
        closeEditor(false);
        state.editorAnnotationId = annotation ? annotation.id : '';
        state.editorHasChanges = false;
        state.editorRect = clampEditorRect(annotation || rect);

        var editor = document.createElement('div');
        editor.className = 'video-annotation-editor';
        editor.setAttribute('role', 'dialog');
        editor.setAttribute('aria-label', 'Video annotation editor');
        if (!isSidebarEditor()) {
            applyEditorRect(editor, state.editorRect);
        }

        var typeField = createTypeField(annotation ? annotation.type : ANNOTATION_TYPE_TEXT);
        var textPanel = document.createElement('div');
        textPanel.className = 'video-annotation-text-panel';

        var textarea = document.createElement('textarea');
        textarea.className = 'video-annotation-text';
        textarea.placeholder = 'Annotation text';
        textarea.setAttribute('aria-label', 'Annotation text');
        textarea.value = annotation ? annotation.text : '';
        textarea.addEventListener('input', function () {
            textarea.removeAttribute('aria-invalid');
            state.editorHasChanges = true;
            updateEditorPreview();
        });

        var startTime = annotation ? annotation.start : Math.max(0, state.video ? Number(state.video.currentTime) || 0 : 0);
        var endTime = annotation ? annotation.end : startTime + getDefaultAnnotationLengthSeconds();
        var startField = createTimeField('Start', startTime);
        var endField = createTimeField('End', endTime);
        var colorField = createColorField(annotation ? annotation.color : '');
        var fontField = createFontField(annotation ? annotation.fontFamily : '');

        var formatToolbar = document.createElement('div');
        formatToolbar.className = 'video-annotation-format-toolbar';
        formatToolbar.appendChild(colorField.label);
        formatToolbar.appendChild(fontField.label);
        textPanel.appendChild(formatToolbar);
        textPanel.appendChild(textarea);

        var imagePanel = document.createElement('div');
        imagePanel.className = 'video-annotation-image-panel';
        imagePanel.hidden = true;
        var imageUrlField = createImageUrlField();
        imageUrlField.value = annotation ? annotation.imageUrl : '';
        imagePanel.appendChild(imageUrlField);

        var editorBody = document.createElement('div');
        editorBody.className = 'video-annotation-editor-body';
        editorBody.appendChild(textPanel);
        editorBody.appendChild(imagePanel);

        var footer = document.createElement('div');
        footer.className = 'video-annotation-editor-footer';

        var timeFields = document.createElement('div');
        timeFields.className = 'video-annotation-time-fields';
        timeFields.appendChild(startField.label);
        timeFields.appendChild(endField.label);

        var actions = document.createElement('div');
        actions.className = 'video-annotation-actions';

        var saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', function () {
            saveEditor({
                typeField: typeField,
                textarea: textarea,
                imageUrlField: imageUrlField,
                startInput: startField.input,
                endInput: endField.input,
                colorInput: colorField.input,
                fontInput: fontField.input
            });
        });

        var cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', function () {
            closeEditor();
            syncVisibleAnnotations();
        });

        actions.appendChild(saveButton);
        actions.appendChild(cancelButton);
        footer.appendChild(timeFields);
        footer.appendChild(actions);

        editor.appendChild(typeField.wrapper);
        editor.appendChild(editorBody);
        editor.appendChild(footer);
        if (!isSidebarEditor()) {
            RESIZE_EDGES.forEach(function (edge) {
                editor.appendChild(createResizeHandle(edge));
            });

            editor.addEventListener('pointerdown', function (event) {
                if (event.target && event.target.classList.contains('video-annotation-resize-handle')) return;
                startPointerInteraction(event, 'move');
            });
        }
        editor.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        colorField.input.addEventListener('input', function () {
            state.editorHasChanges = true;
            var color = normalizeColor(colorField.input.value);
            setStoredItem(LAST_ANNOTATION_COLOR_KEY, color);
            textarea.style.color = color;
            updateEditorPreview();
        });
        fontField.input.addEventListener('change', function () {
            state.editorHasChanges = true;
            textarea.style.fontFamily = getFontFamily(fontField.input.value);
            updateEditorPreview();
        });
        Object.keys(typeField.inputs).forEach(function (type) {
            typeField.inputs[type].addEventListener('change', function () {
                state.editorHasChanges = true;
                setEditorMode(typeField.getValue());
            });
        });
        imageUrlField.addEventListener('input', function () {
            state.editorHasChanges = true;
            updateImagePreview();
            updateEditorPreview();
        });
        startField.input.addEventListener('input', function () {
            state.editorHasChanges = true;
            updateEditorPreview();
        });
        endField.input.addEventListener('input', function () {
            state.editorHasChanges = true;
            updateEditorPreview();
        });

        function setEditorMode(type) {
            var isImage = type === ANNOTATION_TYPE_IMAGE;
            textPanel.hidden = isImage;
            imagePanel.hidden = !isImage;
            editor.classList.toggle('is-image-annotation-editor', isImage);
            updateImagePreview();
            updateEditorPreview();
            if (isImage) {
                imageUrlField.focus();
            } else {
                textarea.focus();
            }
        }

        function updateImagePreview() {
            return;
        }

        textarea.style.color = normalizeColor(annotation ? annotation.color : getLastAnnotationColor());
        textarea.style.fontFamily = getFontFamily(annotation ? annotation.fontFamily : getDefaultAnnotationFont());

        state.editor = editor;
        state.editorControls = {
            typeField: typeField,
            textarea: textarea,
            imageUrlField: imageUrlField,
            startInput: startField.input,
            endInput: endField.input,
            colorInput: colorField.input,
            fontInput: fontField.input
        };
        if (isSidebarEditor()) {
            showEditorOverlay();
            renderAnnotationsEditorSidebar(true);
        } else {
            state.frame.appendChild(editor);
        }
        setEditorMode(typeField.getValue());
        updateEditorPreview();
        state.editorHasChanges = false;
        updateFrameAnnotationState();
        if (typeField.getValue() === ANNOTATION_TYPE_IMAGE) {
            imageUrlField.focus();
        } else {
            textarea.focus();
        }
    }

    function getActiveAnnotationIds() {
        var currentTime = state.video ? Number(state.video.currentTime) || 0 : 0;
        return state.annotations
            .filter(function (annotation) {
                return currentTime >= annotation.start && currentTime <= annotation.end;
            })
            .map(function (annotation) {
                return annotation.id;
            });
    }

    function getSortedAnnotationsForSidebar() {
        return cloneAnnotations(state.annotations).sort(function (left, right) {
            if (left.start !== right.start) return left.start - right.start;
            return left.end - right.end;
        });
    }

    function getAnnotationPreviewText(annotation) {
        var text = annotation.type === ANNOTATION_TYPE_IMAGE
            ? (annotation.text || annotation.imageUrl || 'Image annotation')
            : annotation.text;
        text = String(text || 'Untitled annotation').replace(/\s+/g, ' ').trim();
        return text.length > 82 ? text.slice(0, 79) + '...' : text;
    }

    function renderAnnotationsEditorSidebar(force) {
        if (!state.editorMode) return;

        var sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        var activeIds = getActiveAnnotationIds();
        var signature = [
            serializeAnnotations(state.annotations),
            activeIds.join(','),
            state.focusedAnnotationId
        ].join('|');
        if (!force && signature === state.sidebarSignature) return;
        state.sidebarSignature = signature;

        var section = document.createElement('div');
        section.className = 'sidebar-section annotations-editor-sidebar';

        if (state.editor) {
            var pane = document.createElement('div');
            pane.className = 'annotations-editor-pane';
            pane.appendChild(state.editor);
            section.appendChild(pane);
        }

        var label = document.createElement('div');
        label.className = 'sidebar-label';
        label.textContent = 'Annotations';
        section.appendChild(label);

        var list = document.createElement('div');
        list.className = 'annotations-editor-list';

        var annotations = getSortedAnnotationsForSidebar();
        if (annotations.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'annotations-editor-empty';
            empty.textContent = 'No annotations yet.';
            list.appendChild(empty);
        }

        annotations.forEach(function (annotation) {
            var isActive = activeIds.indexOf(annotation.id) !== -1;
            var row = document.createElement('div');
            row.className = 'annotations-editor-item';
            row.dataset.annotationId = annotation.id;
            row.classList.toggle('is-active', isActive);
            row.classList.toggle('is-focused', annotation.id === state.focusedAnnotationId);

            var focusButton = document.createElement('button');
            focusButton.type = 'button';
            focusButton.className = 'annotations-editor-focus';
            focusButton.dataset.annotationId = annotation.id;
            focusButton.addEventListener('click', function () {
                focusAnnotation(annotation.id);
            });

            if (annotation.type === ANNOTATION_TYPE_IMAGE) {
                var thumb = document.createElement('span');
                thumb.className = 'annotations-editor-thumb';
                var image = document.createElement('img');
                image.src = getImageSrc(annotation.imageUrl);
                image.alt = annotation.text || 'Image annotation';
                thumb.appendChild(image);
                focusButton.appendChild(thumb);
            }

            var time = document.createElement('span');
            time.className = 'annotations-editor-time';
            time.textContent = formatTimestamp(annotation.start) + ' - ' + formatTimestamp(annotation.end);

            var title = document.createElement('span');
            title.className = 'annotations-editor-title';
            title.textContent = getAnnotationPreviewText(annotation);

            focusButton.appendChild(time);
            focusButton.appendChild(title);

            var deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'annotations-editor-delete';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', function (event) {
                event.stopPropagation();
                deleteAnnotation(annotation.id);
            });

            row.appendChild(focusButton);
            row.appendChild(deleteButton);
            list.appendChild(row);
        });

        section.appendChild(list);
        sidebar.replaceChildren(section);

        var activeItem = list.querySelector('.annotations-editor-item.is-active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }
    }

    function focusAnnotation(annotationId) {
        var annotation = getAnnotationById(annotationId);
        if (!annotation) return;

        state.focusedAnnotationId = annotation.id;
        if (state.video) {
            state.video.pause();
            state.video.currentTime = annotation.start;
        }
        showEditor(annotation, annotation);
        syncVisibleAnnotations();
        renderAnnotationsEditorSidebar(true);
    }

    function deleteAnnotation(annotationId) {
        var index = getAnnotationIndexById(annotationId);
        if (index < 0) return;

        state.annotations.splice(index, 1);
        if (state.focusedAnnotationId === annotationId) {
            state.focusedAnnotationId = '';
        }
        if (state.editorAnnotationId === annotationId) {
            closeEditor();
        }
        state.sidebarSignature = '';
        syncVisibleAnnotations();
        renderAnnotationsEditorSidebar(true);
    }

    function hasUnsavedEditorChanges() {
        return state.editorMode && (
            state.editorHasChanges ||
            serializeAnnotations(state.annotations) !== state.savedAnnotationsSnapshot
        );
    }

    function commitOpenEditorChanges() {
        if (!state.editor || !state.editorHasChanges) return true;
        return saveEditor(state.editorControls);
    }

    function saveEditorMode() {
        if (!state.editorMode) return true;
        if (!commitOpenEditorChanges()) return false;

        saveAnnotations();
        state.savedAnnotationsSnapshot = serializeAnnotations(state.annotations);
        state.warningPromptShown = false;
        renderAnnotationsEditorSidebar(true);
        return true;
    }

    function updateEditorEntryButton() {
        var button = getEditorEntryButton();
        if (!button) return;

        button.href = state.editorMode ? getNonEditorUrl() : getEditorUrl();
        button.textContent = state.editorMode ? 'Exit Editor' : 'Annotations';
        button.setAttribute('aria-pressed', state.editorMode ? 'true' : 'false');
        button.classList.toggle('is-active', state.editorMode);
    }

    function updateEditorToolbar() {
        var toolbar = getEditorToolbar();
        if (toolbar) {
            toolbar.querySelectorAll('[data-annotations-add], [data-annotations-export], [data-annotations-import], [data-annotations-save], [data-annotations-editor-open]').forEach(function (button) {
                button.hidden = !state.editorMode;
            });
            toolbar.querySelectorAll('[data-annotations-add]').forEach(function (button) {
                button.textContent = state.placementMode ? 'Cancel Add' : 'Add Annotation';
                button.setAttribute('aria-pressed', state.placementMode ? 'true' : 'false');
            });
            toolbar.querySelectorAll('.playlist-modal-anchor').forEach(function (item) {
                item.hidden = state.editorMode;
            });
        }
    }

    function enterEditorMode(pushHistory) {
        if (state.editorMode) {
            updateEditorEntryButton();
            updateEditorToolbar();
            renderAnnotationsEditorSidebar(true);
            return;
        }

        loadAnnotations();
        state.annotations = cloneAnnotations(state.annotations);
        state.savedAnnotationsSnapshot = serializeAnnotations(state.annotations);
        state.savedSidebarHtml = (document.querySelector('.sidebar') || {}).innerHTML || '';
        state.focusedAnnotationId = '';
        state.warningPromptShown = false;
        state.sidebarSignature = '';
        state.editorMode = true;

        document.body.classList.add('is-annotations-editor');
        updateEditorEntryButton();
        updateEditorToolbar();
        if (pushHistory && !isEditorUrl()) {
            window.history.pushState({ annotationsEditor: true }, document.title, getEditorUrl());
        }
        syncVisibleAnnotations();
        renderAnnotationsEditorSidebar(true);
    }

    function exitEditorMode(saveFirst, updateUrl) {
        if (!state.editorMode) return true;
        if (saveFirst && !saveEditorMode()) return false;

        closeEditor(false);
        state.editorMode = false;
        state.focusedAnnotationId = '';
        state.sidebarSignature = '';
        document.body.classList.remove('is-annotations-editor');

        if (!saveFirst) {
            loadAnnotations();
        }

        var sidebar = document.querySelector('.sidebar');
        if (sidebar && state.savedSidebarHtml !== null) {
            sidebar.innerHTML = state.savedSidebarHtml;
        }
        state.savedSidebarHtml = null;
        updateEditorEntryButton();
        updateEditorToolbar();
        syncVisibleAnnotations();

        if (updateUrl && isEditorUrl()) {
            window.history.replaceState({ annotationsEditor: false }, document.title, getNonEditorUrl());
        }

        return true;
    }

    function promptToSaveBeforeLeaving() {
        if (!hasUnsavedEditorChanges() || state.warningPromptShown) return true;

        state.warningPromptShown = true;
        if (window.confirm('You have unsaved annotations. Save before leaving?')) {
            return saveEditorMode();
        }
        return true;
    }

    function exportAnnotationsJson() {
        if (!commitOpenEditorChanges()) return;

        var title = document.querySelector('.video-title');
        var baseName = title ? title.textContent : 'video';
        var safeName = String(baseName || 'video')
            .trim()
            .replace(/[^a-z0-9-_]+/gi, '-')
            .replace(/^-+|-+$/g, '') || 'video';
        var blob = new Blob([JSON.stringify(cloneAnnotations(state.annotations), null, 2)], {
            type: 'application/json;charset=utf-8'
        });
        var objectUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = objectUrl;
        link.download = safeName + '-annotations.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(function () {
            URL.revokeObjectURL(objectUrl);
        }, 0);
    }

    function parseImportedAnnotations(rawValue) {
        var parsed = JSON.parse(rawValue);
        var source = Array.isArray(parsed)
            ? parsed
            : parsed && Array.isArray(parsed.annotations)
                ? parsed.annotations
                : null;
        if (!source) {
            throw new Error('Invalid annotations file.');
        }
        return source.map(normalizeAnnotation).filter(Boolean);
    }

    function importAnnotationsFile(file) {
        if (!file) return;

        var reader = new FileReader();
        reader.addEventListener('load', function () {
            try {
                state.annotations = parseImportedAnnotations(reader.result);
                state.focusedAnnotationId = '';
                closeEditor();
                state.sidebarSignature = '';
                syncVisibleAnnotations();
                renderAnnotationsEditorSidebar(true);
            } catch (error) {
                window.alert('Could not import annotations JSON.');
            }
        });
        reader.readAsText(file);
    }

    function bindEditorControls() {
        var entryButton = getEditorEntryButton();
        if (entryButton && entryButton.dataset.annotationsEditorBound !== 'true') {
            entryButton.dataset.annotationsEditorBound = 'true';
            entryButton.addEventListener('click', function (event) {
                event.preventDefault();
                if (state.editorMode) {
                    exitEditorMode(false, true);
                } else {
                    enterEditorMode(true);
                }
            });
        }

        var toolbar = getEditorToolbar();
        if (toolbar) {
            var addButton = toolbar.querySelector('[data-annotations-add]');
            var exportButton = toolbar.querySelector('[data-annotations-export]');
            var importButton = toolbar.querySelector('[data-annotations-import]');
            var importInput = toolbar.querySelector('[data-annotations-import-input]');
            var saveButton = toolbar.querySelector('[data-annotations-save]');

            if (addButton && addButton.dataset.annotationsActionBound !== 'true') {
                addButton.dataset.annotationsActionBound = 'true';
                addButton.addEventListener('click', function () {
                    if (!state.editorMode) return;
                    if (state.placementMode) {
                        setPlacementMode(false);
                        return;
                    }
                    if (!commitOpenEditorChanges()) return;
                    if (state.editor) {
                        closeEditor(false);
                    }
                    state.focusedAnnotationId = '';
                    setPlacementMode(true);
                });
            }
            if (exportButton && exportButton.dataset.annotationsActionBound !== 'true') {
                exportButton.dataset.annotationsActionBound = 'true';
                exportButton.addEventListener('click', exportAnnotationsJson);
            }
            if (importButton && importInput && importButton.dataset.annotationsActionBound !== 'true') {
                importButton.dataset.annotationsActionBound = 'true';
                importButton.addEventListener('click', function () {
                    importInput.click();
                });
            }
            if (importInput && importInput.dataset.annotationsActionBound !== 'true') {
                importInput.dataset.annotationsActionBound = 'true';
                importInput.addEventListener('change', function () {
                    importAnnotationsFile(importInput.files && importInput.files[0]);
                    importInput.value = '';
                });
            }
            if (saveButton && saveButton.dataset.annotationsActionBound !== 'true') {
                saveButton.dataset.annotationsActionBound = 'true';
                saveButton.addEventListener('click', saveEditorMode);
            }
        }

        updateEditorEntryButton();
        updateEditorToolbar();

        if (!state.editorGlobalBound) {
            state.editorGlobalBound = true;
            document.addEventListener('click', handleEditorNavigationClick, true);
            window.addEventListener('popstate', handleEditorPopState);
        }
    }

    function handleEditorNavigationClick(event) {
        if (!state.editorMode || event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!link || link.matches('[data-annotations-editor-open]')) return;
        if (!hasUnsavedEditorChanges()) return;

        event.preventDefault();
        if (promptToSaveBeforeLeaving()) {
            window.location.href = link.href;
        }
    }

    function handleEditorPopState() {
        if (isEditorUrl()) {
            enterEditorMode(false);
            return;
        }

        if (!state.editorMode) return;

        if (promptToSaveBeforeLeaving()) {
            exitEditorMode(false, false);
        } else {
            window.history.pushState({ annotationsEditor: true }, document.title, getEditorUrl());
        }
    }

    function initializeEditorModeFromUrl() {
        if (!isEditorUrl()) {
            updateEditorEntryButton();
            updateEditorToolbar();
            return;
        }

        var editorUrl = window.location.href;
        window.history.replaceState({ annotationsEditor: false }, document.title, getNonEditorUrl());
        window.history.pushState({ annotationsEditor: true }, document.title, editorUrl);
        enterEditorMode(false);
    }

    function makeEditorRectFromClick(event) {
        var frameRect = state.frame.getBoundingClientRect();
        var width = frameRect.width < 520 ? 62 : 36;
        var height = frameRect.height < 360 ? 36 : 24;
        var x = ((event.clientX - frameRect.left) / Math.max(1, frameRect.width)) * 100 - (width / 2);
        var y = ((event.clientY - frameRect.top) / Math.max(1, frameRect.height)) * 100 - (height / 2);

        return clampEditorRect({
            x: x,
            y: y,
            width: width,
            height: height
        });
    }

    function getFramePointFromClient(clientX, clientY) {
        var frameRect = state.frame.getBoundingClientRect();
        var relativeX = clamp(clientX - frameRect.left, 0, Math.max(1, frameRect.width));
        var relativeY = clamp(clientY - frameRect.top, 0, Math.max(1, frameRect.height));
        return {
            x: relativeX,
            y: relativeY,
            width: Math.max(1, frameRect.width),
            height: Math.max(1, frameRect.height)
        };
    }

    function makePlacementRectFromPoints(startPoint, endPoint) {
        var left = Math.min(startPoint.x, endPoint.x);
        var top = Math.min(startPoint.y, endPoint.y);
        var right = Math.max(startPoint.x, endPoint.x);
        var bottom = Math.max(startPoint.y, endPoint.y);
        return {
            x: (left / startPoint.width) * 100,
            y: (top / startPoint.height) * 100,
            width: ((right - left) / startPoint.width) * 100,
            height: ((bottom - top) / startPoint.height) * 100
        };
    }

    function isPlacementRectLargeEnough(rect) {
        return rect.width >= getMinWidthPercent() && rect.height >= getMinHeightPercent();
    }

    function handleVideoPlacementPointerDown(event) {
        if (!state.placementMode) return;
        if (event.button && event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        if (!state.video.paused) {
            state.video.pause();
        }

        var pointerId = event.pointerId;
        var startPoint = getFramePointFromClient(event.clientX, event.clientY);
        var hasDragged = false;
        var previewRect = null;
        var dragThreshold = 4;

        function handlePointerMove(moveEvent) {
            if (typeof pointerId !== 'undefined' && moveEvent.pointerId !== pointerId) return;

            var endPoint = getFramePointFromClient(moveEvent.clientX, moveEvent.clientY);
            var deltaX = Math.abs(endPoint.x - startPoint.x);
            var deltaY = Math.abs(endPoint.y - startPoint.y);
            hasDragged = hasDragged || deltaX >= dragThreshold || deltaY >= dragThreshold;
            if (!hasDragged) return;

            var candidateRect = makePlacementRectFromPoints(startPoint, endPoint);
            if (isPlacementRectLargeEnough(candidateRect)) {
                previewRect = candidateRect;
                showPlacementPreview(candidateRect);
            } else {
                previewRect = null;
                removePlacementPreview();
            }

            moveEvent.preventDefault();
        }

        function stopPlacementPointer(upEvent) {
            if (typeof pointerId !== 'undefined' && upEvent.pointerId !== pointerId) return;

            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', stopPlacementPointer);
            document.removeEventListener('pointercancel', stopPlacementPointer);

            var finalRect = previewRect;
            removePlacementPreview();
            state.placementClickSuppressUntil = Date.now() + 400;
            setPlacementMode(false);
            showEditor(finalRect || makeEditorRectFromClick(upEvent));
            upEvent.preventDefault();
        }

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', stopPlacementPointer);
        document.addEventListener('pointercancel', stopPlacementPointer);
    }

    function suppressPlacementFollowupClick(event) {
        if (Date.now() > state.placementClickSuppressUntil) return;
        event.preventDefault();
        event.stopPropagation();
    }

    function bindControls() {
        var button = getAnnotationButton();
        if (button && button.dataset.annotationBound !== 'true') {
            button.dataset.annotationBound = 'true';
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (!state.editorMode) {
                    enterEditorMode(true);
                }
            });
        }

        var visibilityButton = getVisibilityButton();
        if (visibilityButton && visibilityButton.dataset.annotationVisibilityBound !== 'true') {
            visibilityButton.dataset.annotationVisibilityBound = 'true';
            visibilityButton.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                if (state.editorMode) {
                    exitEditorMode(false, true);
                    return;
                }
                setStoredItem(ANNOTATIONS_VISIBLE_KEY, String(!areAnnotationsVisible()));
                updateVisibilityButton();
                syncVisibleAnnotations();
            });
        }
    }

    function bind() {
        state.video = getVideo();
        state.frame = getFrame();
        if (!state.video || !state.frame || state.frame.dataset.videoAnnotationsInitialized === 'true') {
            return;
        }

        state.frame.dataset.videoAnnotationsInitialized = 'true';
        ensureLayer();
        bindControls();
        bindEditorControls();
        updateVisibilityButton();
        loadAnnotations();
        syncVisibleAnnotations();
        initializeEditorModeFromUrl();

        state.video.addEventListener('pointerdown', handleVideoPlacementPointerDown, true);
        state.video.addEventListener('click', suppressPlacementFollowupClick, true);
        state.video.addEventListener('timeupdate', syncVisibleAnnotations);
        state.video.addEventListener('seeked', syncVisibleAnnotations);
        state.video.addEventListener('loadedmetadata', function () {
            if (!state.editorMode) {
                loadAnnotations();
            }
            syncVisibleAnnotations();
        });

        document.addEventListener('fullscreenchange', function () {
            if (state.editorRect) {
                updateEditorRect(state.editorRect, false);
            }
        });

        document.addEventListener('videoPageUpdated', function () {
            closeEditor(false);
            state.video = getVideo();
            state.frame = getFrame();
            ensureLayer();
            bindControls();
            bindEditorControls();
            updateVisibilityButton();
            if (state.editorMode) {
                state.editorMode = false;
                state.focusedAnnotationId = '';
                state.savedSidebarHtml = null;
                state.sidebarSignature = '';
                document.body.classList.remove('is-annotations-editor');
                updateEditorEntryButton();
                updateEditorToolbar();
            }
            loadAnnotations();
            syncVisibleAnnotations();
            initializeEditorModeFromUrl();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    window.areVideoAnnotationsVisible = areAnnotationsVisible;
})();
