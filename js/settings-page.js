(function () {
    'use strict';

    var SETTINGS = window.SugarHillSettings;
    if (!SETTINGS) return;

    var LEGACY_KEYS = {
        'playback.defaultVolume': 'video-player-volume',
        'playback.muted': 'video-player-muted',
        'playback.speed': 'video-player-speed',
        'playback.autoplayEnded': 'video-player-autoplay-ended',
        'playback.userUnmuted': 'video-player-user-unmuted',
        'annotations.visible': 'video-player-annotations-visible',
        'annotations.defaultColor': 'video-player-last-annotation-color'
    };

    function getPathValue(source, path, fallback) {
        return String(path || '').split('.').filter(Boolean).reduce(function (value, part) {
            if (value == null || typeof value !== 'object' || !(part in value)) {
                return fallback;
            }
            return value[part];
        }, source);
    }

    function readLegacyValue(key, type, fallback) {
        if (!key) return fallback;
        try {
            var rawValue = localStorage.getItem(key);
            if (rawValue === null) return fallback;
            if (type === 'boolean') return rawValue === 'true';
            if (type === 'number') {
                var number = Number(rawValue);
                return Number.isFinite(number) ? number : fallback;
            }
            return rawValue;
        } catch (error) {
            return fallback;
        }
    }

    function writeLegacyValue(key, value) {
        if (!key) return;
        try {
            localStorage.setItem(key, String(value));
        } catch (error) {
            console.warn('Unable to save legacy setting:', error);
        }
    }

    function parseControlValue(control) {
        var type = control.dataset.settingType || control.type || 'text';
        if (type === 'boolean' || control.type === 'checkbox') {
            return Boolean(control.checked);
        }
        if (type === 'number') {
            var value = Number(control.value);
            if (!Number.isFinite(value)) {
                value = Number(control.min) || 0;
            }
            if (control.min !== '') value = Math.max(Number(control.min), value);
            if (control.max !== '') value = Math.min(Number(control.max), value);
            return value;
        }
        if (type === 'color') {
            return SETTINGS.normalizeHexColor(control.value, getControlValue(control));
        }
        return control.value;
    }

    function getControlValue(control) {
        var path = control.dataset.settingPath;
        var type = control.dataset.settingType || control.type || 'text';
        var value = getPathValue(SETTINGS.getAll(), path, '');
        return readLegacyValue(control.dataset.legacyKey || LEGACY_KEYS[path], type, value);
    }

    function setControlValue(control, value) {
        if (control.type === 'checkbox' || control.dataset.settingType === 'boolean') {
            control.checked = Boolean(value);
            return;
        }
        control.value = String(value);
    }

    function setStatus(message) {
        var status = document.getElementById('settings-save-status');
        if (!status) return;
        status.textContent = message || '';
        window.clearTimeout(setStatus.timeoutId);
        if (message) {
            setStatus.timeoutId = window.setTimeout(function () {
                status.textContent = '';
            }, 2200);
        }
    }

    function saveControl(control) {
        var path = control.dataset.settingPath;
        if (!path) return;
        var value = parseControlValue(control);
        SETTINGS.set(path, value);
        writeLegacyValue(control.dataset.legacyKey || LEGACY_KEYS[path], value);
        setControlValue(control, value);
        setStatus('Saved');
    }

    function bindSettingControls() {
        document.querySelectorAll('[data-setting-path]').forEach(function (control) {
            setControlValue(control, getControlValue(control));
            var eventName = control.type === 'checkbox' || control.tagName === 'SELECT' ? 'change' : 'input';
            control.addEventListener(eventName, function () {
                saveControl(control);
            });
        });
    }

    function renderPresetOptions(select) {
        select.innerHTML = '';
        Object.keys(SETTINGS.presets).forEach(function (presetId) {
            var option = document.createElement('option');
            option.value = presetId;
            option.textContent = SETTINGS.presets[presetId].label;
            option.title = 'Switches every editable color token to the ' + SETTINGS.presets[presetId].label + ' preset.';
            select.appendChild(option);
        });
        var custom = document.createElement('option');
        custom.value = 'custom';
        custom.textContent = 'Custom';
        custom.title = 'Shows that individual color values have been edited from a preset.';
        select.appendChild(custom);
        select.value = SETTINGS.get('colorScheme.preset', 'default');
    }

    function isHexColor(value) {
        return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value || '').trim());
    }

    function renderColorFields() {
        var container = document.getElementById('color-settings-fields');
        if (!container) return;
        var colors = SETTINGS.getColorSettings();
        container.replaceChildren();

        SETTINGS.colorFields.forEach(function (field) {
            var row = document.createElement('label');
            row.className = 'settings-color-row';
            row.dataset.colorGroup = field.badge ? 'badge' : 'site';
            row.title = getColorTooltip(field);

            var label = document.createElement('span');
            label.className = 'settings-field-label';
            label.textContent = field.label;
            label.title = row.title;

            var textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.inputMode = 'text';
            textInput.spellcheck = false;
            textInput.value = colors[field.key];
            textInput.maxLength = 7;
            textInput.pattern = '#[0-9A-Fa-f]{6}';
            textInput.className = 'settings-color-text';
            textInput.setAttribute('aria-label', field.label + ' hex color');
            textInput.title = row.title;

            var colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = colors[field.key];
            colorInput.className = 'settings-color-swatch';
            colorInput.setAttribute('aria-label', field.label + ' swatch');
            colorInput.title = row.title;

            function saveColor(rawValue) {
                if (!isHexColor(rawValue)) {
                    textInput.setAttribute('aria-invalid', 'true');
                    return;
                }
                var color = SETTINGS.normalizeHexColor(rawValue, colors[field.key]);
                textInput.removeAttribute('aria-invalid');
                textInput.value = color;
                colorInput.value = color;
                colors[field.key] = color;
                SETTINGS.setColor(field.key, color);
                var presetSelect = document.getElementById('color-preset-select');
                if (presetSelect) presetSelect.value = 'custom';
                setStatus('Saved');
            }

            textInput.addEventListener('input', function () {
                saveColor(textInput.value);
            });
            colorInput.addEventListener('input', function () {
                saveColor(colorInput.value);
            });

            row.appendChild(label);
            row.appendChild(textInput);
            row.appendChild(colorInput);
            container.appendChild(row);
        });
    }

    function getColorTooltip(field) {
        if (field.badge) {
            return 'Sets the ' + field.label + ' color used by generated video metadata badges. Badge colors are shared across index cards, search results, playlists, and sidebar cards when the badge uses this standardized token.';
        }
        return 'Sets the ' + field.label + ' color token for the site theme. This value updates immediately and is saved in this browser.';
    }

    function bindColorSchemeControls() {
        var presetSelect = document.getElementById('color-preset-select');
        if (presetSelect) {
            renderPresetOptions(presetSelect);
            presetSelect.addEventListener('change', function () {
                if (presetSelect.value === 'custom') return;
                SETTINGS.applyPreset(presetSelect.value);
                renderColorFields();
                setStatus('Saved');
            });
        }
        renderColorFields();
    }

    function clearLegacySettings() {
        Object.keys(LEGACY_KEYS).forEach(function (path) {
            try {
                localStorage.removeItem(LEGACY_KEYS[path]);
            } catch (error) {
                console.warn('Unable to clear setting:', error);
            }
        });
    }

    function refreshControls() {
        document.querySelectorAll('[data-setting-path]').forEach(function (control) {
            setControlValue(control, getControlValue(control));
        });
        var presetSelect = document.getElementById('color-preset-select');
        if (presetSelect) {
            presetSelect.value = SETTINGS.get('colorScheme.preset', 'default');
        }
        renderColorFields();
    }

    function bindResetControls() {
        var resetSettings = document.getElementById('settings-reset-button');
        if (resetSettings) {
            resetSettings.addEventListener('click', function () {
                clearLegacySettings();
                SETTINGS.reset();
                refreshControls();
                setStatus('Reset');
            });
        }

        var resetColors = document.getElementById('settings-reset-colors-button');
        if (resetColors) {
            resetColors.addEventListener('click', function () {
                SETTINGS.applyPreset('default');
                refreshControls();
                setStatus('Reset');
            });
        }
    }

    function bindSectionActionControls() {
        var expandAll = document.getElementById('settings-expand-all-button');
        var collapseAll = document.getElementById('settings-collapse-all-button');
        if (expandAll) {
            expandAll.addEventListener('click', function () {
                setAllSectionsOpen(true);
            });
        }
        if (collapseAll) {
            collapseAll.addEventListener('click', function () {
                setAllSectionsOpen(false);
            });
        }
    }

    function bindCollapsibleSections() {
        document.querySelectorAll('.settings-section').forEach(function (section) {
            var summary = section.querySelector('.settings-section-title');
            var body = section.querySelector('.settings-section-body');
            if (!summary || !body || section.dataset.collapsibleBound === 'true') return;
            section.dataset.collapsibleBound = 'true';

            summary.addEventListener('click', function (event) {
                event.preventDefault();
                if (section.classList.contains('is-animating')) return;
                if (section.open) {
                    closeSection(section, body);
                } else {
                    openSection(section, body);
                }
            });
        });
    }

    function setAllSectionsOpen(isOpen) {
        document.querySelectorAll('.settings-section').forEach(function (section) {
            var body = section.querySelector('.settings-section-body');
            if (!body || section.classList.contains('is-animating')) return;
            if (isOpen && !section.open) {
                openSection(section, body);
            } else if (!isOpen && section.open) {
                closeSection(section, body);
            }
        });
    }

    function openSection(section, body) {
        section.open = true;
        section.classList.add('is-animating');
        body.style.overflow = 'hidden';
        body.style.height = '0px';
        body.offsetHeight;
        body.style.transition = 'height 100ms ease';
        window.requestAnimationFrame(function () {
            body.style.height = body.scrollHeight + 'px';
        });
        finishSectionAnimation(section, body, true);
    }

    function closeSection(section, body) {
        section.classList.add('is-animating');
        body.style.overflow = 'hidden';
        body.style.height = body.scrollHeight + 'px';
        body.offsetHeight;
        body.style.transition = 'height 100ms ease';
        window.requestAnimationFrame(function () {
            body.style.height = '0px';
        });
        finishSectionAnimation(section, body, false);
    }

    function finishSectionAnimation(section, body, isOpen) {
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            if (!isOpen) section.open = false;
            section.classList.remove('is-animating');
            body.style.height = '';
            body.style.overflow = '';
            body.style.transition = '';
        }
        body.addEventListener('transitionend', finish, { once: true });
        window.setTimeout(finish, 140);
    }

    function init() {
        bindCollapsibleSections();
        bindSectionActionControls();
        bindSettingControls();
        bindColorSchemeControls();
        bindResetControls();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
