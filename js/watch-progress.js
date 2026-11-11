/**
 * Watch Progress Tracking
 * 
 * Periodically stores currentTime in localStorage per video URL.
 * When video is loaded, restores last recorded time or resets to beginning if
 * progress is within 1% of the end.
 */

const PROGRESS_KEY_PREFIX = 'video-progress-';
const WATCH_HISTORY_KEY = 'sugarhill-watch-history-v1';

function getProgressConfig() {
    if (window.SugarHillSettings && typeof window.SugarHillSettings.get === 'function') {
        return window.SugarHillSettings.get('progressBars', {});
    }
    return (window.SUGARHILL_CONFIG && window.SUGARHILL_CONFIG.progressBars) || {};
}

function areProgressBarsVisible() {
    const config = getProgressConfig();
    return config.visible !== false;
}

function getProgressSaveInterval() {
    const config = getProgressConfig();
    return Number(config.saveIntervalMs) || 2000;
}

function getResetThresholdPercentage() {
    const config = getProgressConfig();
    return Number(config.resetThresholdPercentage) || 0.04;
}

function getProgressStorageKey(videoPath) {
    return `${PROGRESS_KEY_PREFIX}${encodeURIComponent(videoPath)}`;
}

function readWatchHistory() {
    try {
        const rawValue = localStorage.getItem(WATCH_HISTORY_KEY);
        const parsed = rawValue ? JSON.parse(rawValue) : {};
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
        console.warn('Error reading watch history:', e);
        return {};
    }
}

function writeWatchHistory(history) {
    try {
        localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history || {}));
    } catch (e) {
        console.warn('Error saving watch history:', e);
    }
}

function notifyProgressChanged() {
    document.dispatchEvent(new CustomEvent('sugarhill:progress-changed', {
        detail: {
            history: readWatchHistory()
        }
    }));
}

function getVideosIndexList() {
    return window.VIDEOS_INDEX && Array.isArray(window.VIDEOS_INDEX.videos)
        ? window.VIDEOS_INDEX.videos
        : [];
}

function findIndexedVideo(videoPath) {
    const pageUrl = getVideoPathFromHref(videoPath) || videoPath || getCurrentVideoPath();
    return getVideosIndexList().find(video => getVideoPathFromHref(video.url) === pageUrl) || null;
}

function getProgressStatus(currentTime, duration) {
    const safeTime = Math.max(0, Number(currentTime) || 0);
    const safeDuration = Math.max(0, Number(duration) || 0);
    if (!safeDuration || safeTime <= 0.5) return 'unwatched';
    if (shouldBeReset(safeTime, safeDuration)) return 'completed';
    const ratio = safeTime / safeDuration;
    if (ratio >= 0.75) return 'nearlyFinished';
    return 'inProgress';
}

function rememberWatchHistory(videoPath, currentTime, durationOverride) {
    const safeTime = Math.max(0, Number(currentTime) || 0);
    if (safeTime <= 0.5) return;

    const pageUrl = getVideoPathFromHref(videoPath) || videoPath || getCurrentVideoPath();
    if (!pageUrl) return;

    const indexed = findIndexedVideo(pageUrl);
    const duration = Number(durationOverride)
        || Number(indexed && indexed.duration)
        || Number((readWatchHistory()[pageUrl] || {}).duration)
        || 0;
    const status = getProgressStatus(safeTime, duration);
    const history = readWatchHistory();
    const previous = history[pageUrl] || {};

    history[pageUrl] = {
        id: (indexed && indexed.id) || previous.id || pageUrl,
        url: pageUrl,
        title: (indexed && indexed.title) || previous.title || pageUrl,
        show: (indexed && indexed.show) || previous.show || '',
        duration: duration,
        currentTime: safeTime,
        progressRatio: duration > 0 ? Math.max(0, Math.min(1, safeTime / duration)) : 0,
        status: status,
        thumbnail: (indexed && indexed.thumbnail) || previous.thumbnail || '',
        previewSprite: (indexed && indexed.previewSprite) || previous.previewSprite || null,
        updatedAt: new Date().toISOString()
    };
    writeWatchHistory(history);
}

function getVideoProgressState(video) {
    const pageUrl = getVideoPathFromHref(video && video.url) || (video && video.url) || '';
    const history = pageUrl ? readWatchHistory()[pageUrl] : null;
    const storedProgress = pageUrl ? getStoredProgress(pageUrl) : null;
    const duration = Number(video && video.duration) || Number(history && history.duration) || 0;
    const currentTime = storedProgress !== null && storedProgress > 0
        ? storedProgress
        : Number(history && history.currentTime) || 0;
    const status = history && history.status === 'completed'
        ? 'completed'
        : getProgressStatus(currentTime, duration);

    return {
        currentTime,
        duration,
        ratio: duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0,
        status,
        updatedAt: history && history.updatedAt ? history.updatedAt : ''
    };
}

function getVideoProgressStateByUrl(videoUrl, duration) {
    const indexed = Object.assign({}, findIndexedVideo(videoUrl) || {
        url: getVideoPathFromHref(videoUrl) || videoUrl,
        duration: duration
    });
    if (duration) {
        indexed.duration = duration;
    }
    return getVideoProgressState(indexed);
}


/**
 * Get stored progress for a video path
 * @param {string} videoPath - The video filename/path from URL
 * @returns {number|null} - Stored currentTime in seconds, or null if not found
 */
function getStoredProgress(videoPath) {
    try {
        const stored = localStorage.getItem(getProgressStorageKey(videoPath));
        if (!stored) return null;
        if (stored.trim().startsWith('{')) {
            const parsed = JSON.parse(stored);
            const parsedTime = Number(parsed && parsed.currentTime);
            return Number.isFinite(parsedTime) ? parsedTime : null;
        }
        const value = parseFloat(stored);
        return Number.isFinite(value) ? value : null;
    } catch (e) {
        console.warn('Error reading video progress:', e);
        return null;
    }
}


/**
 * Store progress for a video using the browser URL path as key
 * @param {string} videoPath - The video filename (from URL)
 * @param {number} currentTime - Current time in seconds
 */
function storeProgress(videoPath, currentTime, duration) {
    try {
        localStorage.setItem(getProgressStorageKey(videoPath), String(currentTime));
        rememberWatchHistory(videoPath, currentTime, duration);
        notifyProgressChanged();
    } catch (e) {
        console.warn('Error saving video progress:', e);
    }
}

/**
 * Get the duration of a video in seconds using metadata attribute if available
 * @param {HTMLElement} videoElement - The video element
 * @returns {number} - Duration in seconds, or NaN if unknown
 */
function getVideoDuration(videoElement) {
    // Check if we have duration from data attribute (set by server)
    const durationAttr = videoElement.getAttribute('data-duration');
    if (durationAttr) {
        return parseFloat(durationAttr);
    }
    
    // Fallback to naturalWidth/naturalHeight for estimation (not accurate but works)
    if (videoElement.readyState >= 2 && videoElement.duration > 0) {
        return videoElement.duration;
    }
    
    return NaN;
}

/**
 * Parse duration text like "12:34" or "1:02:03" into seconds.
 * @param {string} durationText
 * @returns {number}
 */
function parseDurationToSeconds(durationText) {
    if (!durationText || typeof durationText !== 'string') return NaN;
    const parts = durationText.trim().split(':').map(Number);
    if (parts.some(Number.isNaN)) return NaN;
    if (parts.length === 2) {
        return (parts[0] * 60) + parts[1];
    }
    if (parts.length === 3) {
        return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }
    return NaN;
}

/**
 * Get a page filename from a URL or path.
 * @param {string} href
 * @returns {string}
 */
function getVideoPathFromHref(href) {
    if (!href || typeof href !== 'string') return '';
    try {
        const url = new URL(href, window.location.href);
        const path = url.pathname || '';
        return path.substring(path.lastIndexOf('/') + 1);
    } catch (e) {
        return '';
    }
}

/**
 * Render progress bars for thumbnail overlays in nav and index cards.
 */
function renderThumbnailProgressBars() {
    const overlays = document.querySelectorAll('.nav-link-thumbnail-overlay, .video-item-thumbnail-overlay');
    overlays.forEach((overlay) => {
        if (!areProgressBarsVisible()) {
            overlay.classList.remove('has-progress');
            overlay.style.setProperty('--progress-percent', '0%');
            return;
        }

        const link = overlay.closest('a[href]');
        const videoPath = link ? getVideoPathFromHref(link.getAttribute('href')) : '';
        if (!videoPath) {
            overlay.classList.remove('has-progress');
            return;
        }

        const storedProgress = getStoredProgress(videoPath);
        const durationSecondsAttr = Number(overlay.getAttribute('data-duration-seconds'));
        const durationText = overlay.getAttribute('data-duration');
        const durationSeconds = Number.isFinite(durationSecondsAttr) && durationSecondsAttr > 0
            ? durationSecondsAttr
            : parseDurationToSeconds(durationText);
        if (storedProgress === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            overlay.classList.remove('has-progress');
            return;
        }

        // Hide bars for effectively completed videos.
        if (shouldBeReset(storedProgress, durationSeconds)) {
            overlay.classList.remove('has-progress');
            overlay.style.setProperty('--progress-percent', '0%');
            return;
        }

        const progressRatio = Math.max(0, Math.min(1, storedProgress / durationSeconds));
        overlay.style.setProperty('--progress-percent', `${(progressRatio * 100).toFixed(2)}%`);
        overlay.classList.toggle('has-progress', progressRatio > 0);
    });
}

/**
 * Check if progress is within reset threshold from end
 * @param {number} currentTime - Current time in seconds
 * @param {number} duration - Total duration in seconds
 * @returns {boolean} - True if should reset to beginning
 */
function shouldBeReset(currentTime, duration) {
    if (isNaN(duration) || duration <= 0) return false;
    
    const remainingPercentage = (duration - currentTime) / duration;
    return remainingPercentage < getResetThresholdPercentage();
}

/**
 * Restore or reset video progress using current browser URL as key
 * @param {HTMLElement} videoElement - The video element to control
 */
function restoreOrResetProgress(videoElement) {
    if (!videoElement || typeof videoElement.play !== 'function') return;
    
    // Get video path from current browser URL instead of video source
    const videoPath = getCurrentVideoPath();
    if (!videoPath) return;
    
    // Get stored progress or duration to check reset threshold
    let storedProgress = getStoredProgress(videoPath);
    const duration = getVideoDuration(videoElement);
    
    // If no stored progress OR within 5% of end, start from beginning
    if (storedProgress === null || shouldBeReset(storedProgress, duration)) {
        videoElement.currentTime = 0;
        storeProgress(videoPath, 0, duration);
        
        console.log(`[${videoPath}] Starting fresh`);
    } else if (storedProgress !== null) {
        videoElement.currentTime = storedProgress;
        console.log(`[${videoPath}] Resumed at ${storedProgress}s`);
        
        // Store current time now to maintain progress
        storeProgress(videoPath, storedProgress, duration);
    }
}


/**
 * Save current progress when user is actively watching (not just paused)
 * @param {HTMLElement} videoElement - The video element
 */
function saveCurrentProgress(videoElement) {
    const currentTime = videoElement.currentTime;
    const duration = getVideoDuration(videoElement);
    
    // Only save if we have meaningful progress (> 1 second in, or > 5% of total)
    if (duration > 0) {
        // Use current browser URL path for storage key
        const videoPath = getCurrentVideoPath();
        storeProgress(videoPath, currentTime, duration);
        renderThumbnailProgressBars();
    }
}

/**
 * Set up video element with automatic progress tracking
 * @param {HTMLElement} videoElement - The video element to configure
 */
function setupVideoProgress(videoElement) {
    if (!videoElement || typeof videoElement.play !== 'function') return;
    
    // Restore/reset on load
    videoElement.addEventListener('loadeddata', function() {
        restoreOrResetProgress(videoElement);
    });
    
    // Save progress periodically while playing
    const saveFunction = function() {
        if (videoElement.paused || videoElement.ended) return;
        saveCurrentProgress(videoElement);
    };
    
    let saveInterval = setInterval(saveFunction, getProgressSaveInterval());
    
    // Clear interval when video is removed from DOM or stopped
    videoElement.addEventListener('play', function() {
        clearInterval(saveInterval);
        saveInterval = setInterval(saveFunction, getProgressSaveInterval());
    });

    videoElement.addEventListener('pause', function() {
        clearInterval(saveInterval);
        saveCurrentProgress(videoElement);
    });
    
    videoElement.addEventListener('ended', function() {
        saveCurrentProgress(videoElement);
        clearInterval(saveInterval);
        restoreOrResetProgress(videoElement);
    });

    
}

// Auto-apply to all video elements on page load
document.addEventListener('DOMContentLoaded', function() {
    const videos = document.querySelectorAll('video');
    videos.forEach(setupVideoProgress);
    renderThumbnailProgressBars();
});

window.addEventListener('storage', function(event) {
    if (event && event.key && (event.key.startsWith(PROGRESS_KEY_PREFIX) || event.key === WATCH_HISTORY_KEY)) {
        renderThumbnailProgressBars();
        notifyProgressChanged();
    }
});

document.addEventListener('videoPageUpdated', function() {
    renderThumbnailProgressBars();
});

document.addEventListener('sugarhill:settings-changed', function() {
    renderThumbnailProgressBars();
});


/**
 * Get the current browser URL path (part after last forward slash)
 * @returns {string} - The video filename from the current page URL
 */
function getCurrentVideoPath() {
    try {
        const url = window.location.pathname;
        // Get part of URL after last forward slash
        const lastSlashIndex = url.lastIndexOf('/');
        if (lastSlashIndex === -1) return '';
        return url.substring(lastSlashIndex + 1);
    } catch (e) {
        console.warn('Error getting current video path:', e);
        return '';
    }
}

/**
 * Public API - Setup progress tracking for a specific video element
 */
window.setupVideoProgress = setupVideoProgress;
window.restoreOrResetProgress = restoreOrResetProgress;
window.getStoredProgress = getStoredProgress;
window.storeProgress = storeProgress;
window.saveCurrentProgress = saveCurrentProgress;

// Expose duration getter for server-side use
window.getVideoDuration = getVideoDuration;
window.shouldBeReset = shouldBeReset;
window.getCurrentVideoPath = getCurrentVideoPath;
window.renderThumbnailProgressBars = renderThumbnailProgressBars;
window.readWatchHistory = readWatchHistory;
window.getVideoProgressState = getVideoProgressState;
window.getVideoProgressStateByUrl = getVideoProgressStateByUrl;
window.SugarHillProgress = {
    progressKeyPrefix: PROGRESS_KEY_PREFIX,
    historyKey: WATCH_HISTORY_KEY,
    getStoredProgress,
    storeProgress,
    readWatchHistory,
    getVideoProgressState,
    getVideoProgressStateByUrl,
    getVideoPathFromHref,
    getCurrentVideoPath,
    renderThumbnailProgressBars
};
