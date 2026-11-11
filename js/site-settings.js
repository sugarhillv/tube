(function () {
    'use strict';

    var STORAGE_KEY = 'sugarhill-user-settings-v1';
    var generatedProgress = (window.SUGARHILL_CONFIG && window.SUGARHILL_CONFIG.progressBars) || {};

    var DEFAULT_COLORS = {
        pageBg: '#1F0F0F',
        text: '#F1F1F1',
        textPrimary: '#FFF8DC',
        textSecondary: '#FFE4C4',
        textTertiary: '#F5DEB3',
        textMuted: '#DEB887',
        textSubtle: '#AAAAAA',
        headerBg: '#030303',
        surface: '#181818',
        surfacePanel: '#1A1A1A',
        surfaceRaised: '#212121',
        surfaceHover: '#2A2A2A',
        surfaceInput: '#0F0F0F',
        border: '#272727',
        borderSoft: '#303030',
        borderStrong: '#3A3A3A',
        borderMuted: '#555555',
        scrollbar: '#404040',
        scrollbarHover: '#505050',
        accent: '#A0522D',
        accentStrong: '#B8860B',
        accentFocus: '#065FD4',
        accentFocusHover: '#1473E6',
        buttonBg: '#F1F1F1',
        buttonText: '#0F0F0F',
        disabledBg: '#3A3A3A',
        disabledText: '#888888',
        danger: '#800000',
        dangerSurface: '#2A1111',
        dangerBorder: '#5C1F1F',
        error: '#FF8F8F',
        success: '#DAA520',
        white: '#FFFFFF',
        black: '#000000',
        badge0: '#FFF8DC',
        badge1: '#FFE4C4',
        badge2: '#F5DEB3',
        badge3: '#DEB887',
        badge4: '#F4A460',
        badge5: '#DAA520',
        badge6: '#B8860B',
        badge7: '#A0522D',
        badge8: '#8B4513',
        badge9: '#A52A2A',
        badge10: '#800000',
        badgeTextLight: '#FFF8DC',
        badgeTextDark: '#8B4513'
    };

    var COLOR_FIELDS = [
        { key: 'pageBg', label: 'Page background', cssVar: '--color-page-bg' },
        { key: 'text', label: 'Body text', cssVar: '--color-text' },
        { key: 'textPrimary', label: 'Primary text', cssVar: '--color-text-primary' },
        { key: 'textSecondary', label: 'Secondary text', cssVar: '--color-text-secondary' },
        { key: 'textTertiary', label: 'Tertiary text', cssVar: '--color-text-tertiary' },
        { key: 'textMuted', label: 'Muted text', cssVar: '--color-text-muted' },
        { key: 'textSubtle', label: 'Subtle text', cssVar: '--color-text-subtle' },
        { key: 'headerBg', label: 'Header background', cssVar: '--color-header-bg' },
        { key: 'surface', label: 'Surface', cssVar: '--color-surface' },
        { key: 'surfacePanel', label: 'Panel surface', cssVar: '--color-surface-panel' },
        { key: 'surfaceRaised', label: 'Raised surface', cssVar: '--color-surface-raised' },
        { key: 'surfaceHover', label: 'Hover surface', cssVar: '--color-surface-hover' },
        { key: 'surfaceInput', label: 'Input surface', cssVar: '--color-surface-input' },
        { key: 'border', label: 'Border', cssVar: '--color-border' },
        { key: 'borderSoft', label: 'Soft border', cssVar: '--color-border-soft' },
        { key: 'borderStrong', label: 'Strong border', cssVar: '--color-border-strong' },
        { key: 'borderMuted', label: 'Muted border', cssVar: '--color-border-muted' },
        { key: 'scrollbar', label: 'Scrollbar', cssVar: '--color-scrollbar' },
        { key: 'scrollbarHover', label: 'Scrollbar hover', cssVar: '--color-scrollbar-hover' },
        { key: 'accent', label: 'Accent', cssVar: '--color-accent' },
        { key: 'accentStrong', label: 'Strong accent', cssVar: '--color-accent-strong' },
        { key: 'accentFocus', label: 'Focus accent', cssVar: '--color-accent-focus' },
        { key: 'accentFocusHover', label: 'Focus accent hover', cssVar: '--color-accent-focus-hover' },
        { key: 'buttonBg', label: 'Primary button', cssVar: '--color-button-bg' },
        { key: 'buttonText', label: 'Primary button text', cssVar: '--color-button-text' },
        { key: 'disabledBg', label: 'Disabled surface', cssVar: '--color-disabled-bg' },
        { key: 'disabledText', label: 'Disabled text', cssVar: '--color-disabled-text' },
        { key: 'danger', label: 'Danger', cssVar: '--color-danger' },
        { key: 'dangerSurface', label: 'Danger surface', cssVar: '--color-danger-surface' },
        { key: 'dangerBorder', label: 'Danger border', cssVar: '--color-danger-border' },
        { key: 'error', label: 'Error', cssVar: '--color-error' },
        { key: 'success', label: 'Success', cssVar: '--color-success' },
        { key: 'white', label: 'White', cssVar: '--color-white' },
        { key: 'black', label: 'Black', cssVar: '--color-black' },
        { key: 'badge0', label: 'Badge 0', cssVar: '--color-badge-0', badge: true },
        { key: 'badge1', label: 'Badge 1', cssVar: '--color-badge-1', badge: true },
        { key: 'badge2', label: 'Badge 2', cssVar: '--color-badge-2', badge: true },
        { key: 'badge3', label: 'Badge 3', cssVar: '--color-badge-3', badge: true },
        { key: 'badge4', label: 'Badge 4', cssVar: '--color-badge-4', badge: true },
        { key: 'badge5', label: 'Badge 5', cssVar: '--color-badge-5', badge: true },
        { key: 'badge6', label: 'Badge 6', cssVar: '--color-badge-6', badge: true },
        { key: 'badge7', label: 'Badge 7', cssVar: '--color-badge-7', badge: true },
        { key: 'badge8', label: 'Badge 8', cssVar: '--color-badge-8', badge: true },
        { key: 'badge9', label: 'Badge 9', cssVar: '--color-badge-9', badge: true },
        { key: 'badge10', label: 'Badge 10', cssVar: '--color-badge-10', badge: true },
        { key: 'badgeTextLight', label: 'Badge light text', cssVar: '--color-badge-text-light', badge: true },
        { key: 'badgeTextDark', label: 'Badge dark text', cssVar: '--color-badge-text-dark', badge: true }
    ];

    function mergeColors(overrides) {
        return Object.assign({}, DEFAULT_COLORS, overrides || {});
    }

    var PRESETS = {
        default: {
            label: 'Sugar Hill',
            colors: mergeColors()
        },
        blue: {
            label: 'Blue Focused',
            colors: mergeColors({
                pageBg: '#07131F',
                text: '#E8F3FF',
                textPrimary: '#E8F3FF',
                textSecondary: '#CFE6FF',
                textTertiary: '#9FC8F2',
                textMuted: '#75A7D9',
                textSubtle: '#8BA7BF',
                headerBg: '#04101C',
                surface: '#0E1D2B',
                surfacePanel: '#102235',
                surfaceRaised: '#13283A',
                surfaceHover: '#18334A',
                surfaceInput: '#06111D',
                border: '#1E344A',
                borderSoft: '#24425E',
                borderStrong: '#315A80',
                borderMuted: '#4C6B87',
                scrollbar: '#284966',
                scrollbarHover: '#376789',
                accent: '#2F80ED',
                accentStrong: '#56CCF2',
                accentFocus: '#4EA1FF',
                accentFocusHover: '#7BB8FF',
                buttonBg: '#D7ECFF',
                buttonText: '#04101C',
                success: '#3DB8C2',
                danger: '#792E4A',
                dangerSurface: '#25101B',
                dangerBorder: '#703452',
                badge0: '#E8F3FF',
                badge1: '#CFE6FF',
                badge2: '#A7D0FF',
                badge3: '#7EB8F5',
                badge4: '#56A3E8',
                badge5: '#2F80ED',
                badge6: '#2364BF',
                badge7: '#1B4E95',
                badge8: '#153B70',
                badge9: '#102B52',
                badge10: '#071C36',
                badgeTextDark: '#06111D'
            })
        },
        green: {
            label: 'Green Focused',
            colors: mergeColors({
                pageBg: '#07190F',
                text: '#EDF8EF',
                textPrimary: '#F0FFF4',
                textSecondary: '#D7F5DD',
                textTertiary: '#B8E9C3',
                textMuted: '#89C99A',
                textSubtle: '#8AAD91',
                headerBg: '#031008',
                surface: '#0D2114',
                surfacePanel: '#112918',
                surfaceRaised: '#17321F',
                surfaceHover: '#1D4028',
                surfaceInput: '#07150C',
                border: '#213A29',
                borderSoft: '#2A4933',
                borderStrong: '#3B6548',
                borderMuted: '#52725B',
                scrollbar: '#31553B',
                scrollbarHover: '#3F704E',
                accent: '#2FA85A',
                accentStrong: '#7ACB82',
                accentFocus: '#38C172',
                accentFocusHover: '#5ED990',
                buttonBg: '#DDF8E2',
                buttonText: '#031008',
                success: '#7ACB82',
                danger: '#7A3B2F',
                dangerSurface: '#24120F',
                dangerBorder: '#6E4138',
                badge0: '#F0FFF4',
                badge1: '#D7F5DD',
                badge2: '#B8E9C3',
                badge3: '#94D8A6',
                badge4: '#70C989',
                badge5: '#48B76B',
                badge6: '#2FA85A',
                badge7: '#238047',
                badge8: '#1A6236',
                badge9: '#124628',
                badge10: '#092C19',
                badgeTextDark: '#07150C'
            })
        },
        gray: {
            label: 'Gray Focused',
            colors: mergeColors({
                pageBg: '#111111',
                text: '#F0F0F0',
                textPrimary: '#FAFAFA',
                textSecondary: '#E0E0E0',
                textTertiary: '#C8C8C8',
                textMuted: '#A8A8A8',
                textSubtle: '#8A8A8A',
                headerBg: '#050505',
                surface: '#1A1A1A',
                surfacePanel: '#202020',
                surfaceRaised: '#262626',
                surfaceHover: '#303030',
                surfaceInput: '#101010',
                border: '#2E2E2E',
                borderSoft: '#383838',
                borderStrong: '#505050',
                borderMuted: '#666666',
                scrollbar: '#4A4A4A',
                scrollbarHover: '#606060',
                accent: '#6F7A86',
                accentStrong: '#9AA3AD',
                accentFocus: '#8CA0B3',
                accentFocusHover: '#AFC1D0',
                buttonBg: '#F0F0F0',
                buttonText: '#101010',
                success: '#8DA08D',
                danger: '#704040',
                dangerSurface: '#211313',
                dangerBorder: '#654343',
                badge0: '#FAFAFA',
                badge1: '#E5E5E5',
                badge2: '#D0D0D0',
                badge3: '#B8B8B8',
                badge4: '#9E9E9E',
                badge5: '#858585',
                badge6: '#6C6C6C',
                badge7: '#555555',
                badge8: '#404040',
                badge9: '#2C2C2C',
                badge10: '#171717',
                badgeTextDark: '#111111'
            })
        },
        youtube2012: {
            label: '2012 YouTube',
            colors: mergeColors({
                pageBg: '#EBEBEB',
                text: '#333333',
                textPrimary: '#222222',
                textSecondary: '#333333',
                textTertiary: '#555555',
                textMuted: '#767676',
                textSubtle: '#777777',
                headerBg: '#F8F8F8',
                surface: '#FFFFFF',
                surfacePanel: '#F1F1F1',
                surfaceRaised: '#F7F7F7',
                surfaceHover: '#EAEAEA',
                surfaceInput: '#FFFFFF',
                border: '#CCCCCC',
                borderSoft: '#D9D9D9',
                borderStrong: '#B8B8B8',
                borderMuted: '#AAAAAA',
                scrollbar: '#C6C6C6',
                scrollbarHover: '#A8A8A8',
                accent: '#CC181E',
                accentStrong: '#A00000',
                accentFocus: '#167AC6',
                accentFocusHover: '#2793E6',
                buttonBg: '#F8F8F8',
                buttonText: '#333333',
                disabledBg: '#E5E5E5',
                disabledText: '#999999',
                danger: '#CC181E',
                dangerSurface: '#F8E6E6',
                dangerBorder: '#CC181E',
                error: '#CC181E',
                success: '#689F38',
                white: '#FFFFFF',
                black: '#000000',
                badge0: '#FFFFFF',
                badge1: '#F1F1F1',
                badge2: '#E6E6E6',
                badge3: '#D6D6D6',
                badge4: '#BDBDBD',
                badge5: '#999999',
                badge6: '#777777',
                badge7: '#555555',
                badge8: '#333333',
                badge9: '#CC181E',
                badge10: '#A00000',
                badgeTextLight: '#FFFFFF',
                badgeTextDark: '#222222'
            })
        }
    };

    var DEFAULTS = {
        progressBars: {
            visible: generatedProgress.visible !== false,
            saveIntervalMs: Number(generatedProgress.saveIntervalMs) || 2000,
            resetThresholdPercentage: Number(generatedProgress.resetThresholdPercentage) || 0.04
        },
        playback: {
            defaultVolume: 1,
            muted: true,
            speed: 1,
            autoplayEnded: true,
            userUnmuted: false,
            autoplayCountdownSeconds: 12
        },
        search: {
            fuzzyThreshold: 0.65,
            levenshteinMaxDistance: 3,
            minQueryLength: 1
        },
        previews: {
            hoverIntervalMs: 840
        },
        playlists: {
            notificationDurationMs: 10000
        },
        annotations: {
            visible: true,
            defaultLengthSeconds: 5,
            defaultColor: '#FFF8DC',
            defaultFont: 'system'
        },
        keyboard: {
            enabled: true,
            rewindSeconds: 10,
            forwardSeconds: 30,
            repeatMs: 198
        },
        colorScheme: {
            preset: 'default',
            colors: mergeColors()
        }
    };

    var BADGE_HEX_TO_KEY = {};
    for (var badgeIndex = 0; badgeIndex <= 10; badgeIndex += 1) {
        BADGE_HEX_TO_KEY[DEFAULT_COLORS['badge' + badgeIndex]] = 'badge' + badgeIndex;
    }

    function isPlainObject(value) {
        return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
    }

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function mergeDeep(target, source) {
        var output = deepClone(target || {});
        Object.keys(source || {}).forEach(function (key) {
            if (isPlainObject(output[key]) && isPlainObject(source[key])) {
                output[key] = mergeDeep(output[key], source[key]);
                return;
            }
            output[key] = source[key];
        });
        return output;
    }

    function readStoredSettings() {
        try {
            var rawValue = localStorage.getItem(STORAGE_KEY);
            if (!rawValue) return {};
            var parsed = JSON.parse(rawValue);
            return isPlainObject(parsed) ? parsed : {};
        } catch (error) {
            console.warn('Unable to read Sugar Hill settings:', error);
            return {};
        }
    }

    function writeStoredSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings || {}));
        } catch (error) {
            console.warn('Unable to save Sugar Hill settings:', error);
        }
    }

    function getAll() {
        return mergeDeep(DEFAULTS, readStoredSettings());
    }

    function getPathValue(source, path, fallback) {
        var parts = String(path || '').split('.');
        var value = source;
        for (var index = 0; index < parts.length; index += 1) {
            if (!parts[index]) continue;
            if (value == null || typeof value !== 'object' || !(parts[index] in value)) {
                return fallback;
            }
            value = value[parts[index]];
        }
        return value;
    }

    function setPathValue(source, path, value) {
        var parts = String(path || '').split('.').filter(Boolean);
        var cursor = source;
        parts.forEach(function (part, index) {
            if (index === parts.length - 1) {
                cursor[part] = value;
                return;
            }
            if (!isPlainObject(cursor[part])) {
                cursor[part] = {};
            }
            cursor = cursor[part];
        });
        return source;
    }

    function normalizeHexColor(value, fallback) {
        var color = String(value || '').trim();
        if (/^#[0-9a-f]{3}$/i.test(color)) {
            color = '#' + color.slice(1).split('').map(function (char) {
                return char + char;
            }).join('');
        }
        if (/^#[0-9a-f]{6}$/i.test(color)) {
            return color.toUpperCase();
        }
        return fallback || '#000000';
    }

    function getColorSettings(settings) {
        var source = (settings || getAll()).colorScheme || {};
        var colors = Object.assign({}, DEFAULT_COLORS, source.colors || {});
        Object.keys(colors).forEach(function (key) {
            colors[key] = normalizeHexColor(colors[key], DEFAULT_COLORS[key]);
        });
        return colors;
    }

    function ensureThemeStyleElement() {
        var existing = document.getElementById('sugarhill-user-theme');
        if (existing) return existing;
        if (!document.head) return null;
        var style = document.createElement('style');
        style.id = 'sugarhill-user-theme';
        document.head.appendChild(style);
        return style;
    }

    function applyColorScheme(settings) {
        var style = ensureThemeStyleElement();
        if (!style) return;
        var colors = getColorSettings(settings);
        var css = ':root{';
        COLOR_FIELDS.forEach(function (field) {
            css += field.cssVar + ':' + colors[field.key] + ';';
        });
        css += '}';
        style.textContent = css;
    }

    function notifyChanged() {
        var event = new CustomEvent('sugarhill:settings-changed', {
            detail: getAll()
        });
        document.dispatchEvent(event);
    }

    function saveStoredSettings(settings) {
        writeStoredSettings(settings);
        applyColorScheme();
        notifyChanged();
    }

    function updateSettings(partial) {
        var current = readStoredSettings();
        saveStoredSettings(mergeDeep(current, partial || {}));
    }

    function setSetting(path, value) {
        var current = readStoredSettings();
        saveStoredSettings(setPathValue(current, path, value));
    }

    function resetSettings() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.warn('Unable to reset Sugar Hill settings:', error);
        }
        applyColorScheme();
        notifyChanged();
    }

    function applyPreset(presetId) {
        var id = PRESETS[presetId] ? presetId : 'default';
        updateSettings({
            colorScheme: {
                preset: id,
                colors: PRESETS[id].colors
            }
        });
    }

    function setColor(key, value) {
        var colors = getColorSettings();
        colors[key] = normalizeHexColor(value, colors[key] || DEFAULT_COLORS[key]);
        updateSettings({
            colorScheme: {
                preset: 'custom',
                colors: colors
            }
        });
    }

    function getSetting(path, fallback) {
        return getPathValue(getAll(), path, fallback);
    }

    function getBadgeCssValue(color) {
        var normalized = normalizeHexColor(color, '');
        var key = BADGE_HEX_TO_KEY[normalized];
        var field = key && COLOR_FIELDS.find(function (item) {
            return item.key === key;
        });
        if (!field) {
            return normalized || String(color || '').trim();
        }
        return 'var(' + field.cssVar + ', ' + normalized + ')';
    }

    function getBadgeStyle(color) {
        return 'background-color: ' + getBadgeCssValue(color) + ';';
    }

    function applyBadgeElement(element, color) {
        if (!element) return;
        element.style.setProperty('background-color', getBadgeCssValue(color));
    }

    window.SugarHillSettings = {
        storageKey: STORAGE_KEY,
        defaults: deepClone(DEFAULTS),
        colorFields: COLOR_FIELDS.map(function (field) {
            return Object.assign({}, field);
        }),
        presets: Object.keys(PRESETS).reduce(function (result, key) {
            result[key] = {
                label: PRESETS[key].label,
                colors: deepClone(PRESETS[key].colors)
            };
            return result;
        }, {}),
        normalizeHexColor: normalizeHexColor,
        getAll: getAll,
        get: getSetting,
        set: setSetting,
        update: updateSettings,
        reset: resetSettings,
        applyPreset: applyPreset,
        setColor: setColor,
        getColorSettings: getColorSettings,
        applyColorScheme: applyColorScheme,
        getBadgeCssValue: getBadgeCssValue,
        getBadgeStyle: getBadgeStyle,
        applyBadgeElement: applyBadgeElement
    };

    applyColorScheme();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            applyColorScheme();
        });
    }

    window.addEventListener('storage', function (event) {
        if (!event || event.key !== STORAGE_KEY) return;
        applyColorScheme();
        notifyChanged();
    });
})();
