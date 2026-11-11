/**
 * Search UI - Client-Side Video Search with Fuzzy Matching
 * 
 * Features:
 * - Levenshtein distance-based fuzzy matching for typo tolerance
 * - Search across title, show name, and tags
 * - Filter by show name and duration range
 * - Results modal with instant filtering
 */

(function() {
    'use strict';

    function getSearchConfig() {
        const settings = window.SugarHillSettings;
        const settingNumber = (path, fallback) => {
            const value = Number(settings && settings.get(path, fallback));
            return Number.isFinite(value) ? value : fallback;
        };
        return {
            FUZZY_THRESHOLD: settingNumber('search.fuzzyThreshold', 0.65),
            LEVENSHTEIN_MAX_DISTANCE: settingNumber('search.levenshteinMaxDistance', 3),
            MIN_QUERY_LENGTH: settingNumber('search.minQueryLength', 1)
        };
    }

    /**
     * Calculate Levenshtein distance between two strings.
     * Measures the minimum number of edits (insertions, deletions, substitutions) needed.
     */
    function levenshteinDistance(a, b) {
        const lenA = a.length;
        const lenB = b.length;

        if (lenA === 0) return lenB;
        if (lenB === 0) return lenA;

        const matrix = Array(lenB + 1)
            .fill(null)
            .map(() => Array(lenA + 1).fill(0));

        // Initialize first row and column
        for (let i = 0; i <= lenA; i++) matrix[0][i] = i;
        for (let i = 0; i <= lenB; i++) matrix[i][0] = i;

        // Fill matrix
        for (let j = 1; j <= lenB; j++) {
            for (let i = 1; i <= lenA; i++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,      // Deletion
                    matrix[j - 1][i] + 1,      // Insertion
                    matrix[j - 1][i - 1] + cost // Substitution
                );
            }
        }

        return matrix[lenB][lenA];
    }

    /**
     * Calculate fuzzy match score (0-1).
     * Higher score = better match.
     */
    function fuzzyScore(query, target, config = getSearchConfig()) {
        query = query.toLowerCase();
        target = target.toLowerCase();

        // Exact match - score 1.0
        if (target === query) return 1.0;

        // Substring match - score 0.9
        if (target.includes(query)) return 0.9;

        // Levenshtein distance-based fuzzy match
        const distance = levenshteinDistance(query, target);
        if (distance > config.LEVENSHTEIN_MAX_DISTANCE) return 0;
        const maxLen = Math.max(query.length, target.length);
        const score = 1 - distance / maxLen;

        return Math.max(0, score);
    }

    function getVideoFacets(video) {
        const badges = Array.isArray(video.badges) ? video.badges : [];
        const fallback = {
            resolution: (video.resolution_badge && video.resolution_badge.label) || (badges[0] && badges[0].label) || '',
            codec: (badges[0] && badges[0].tooltip) || '',
            fps: (badges[1] && badges[1].label) || '',
            bitrate: (badges[2] && badges[2].label) || '',
            size: (badges[2] && badges[2].tooltip) || ''
        };
        return Object.assign(fallback, video.facets || {});
    }

    function getProgressState(video) {
        if (window.SugarHillProgress && typeof window.SugarHillProgress.getVideoProgressState === 'function') {
            return window.SugarHillProgress.getVideoProgressState(video);
        }
        return { status: 'unwatched', ratio: 0, updatedAt: '' };
    }

    function matchesSelected(value, selected) {
        return !selected || selected === 'all' || String(value || '') === selected;
    }

    function sortSearchResults(results, sortValue) {
        const sort = sortValue || 'relevance';
        const byTitle = (a, b) => String(a.video.title || '').localeCompare(String(b.video.title || ''));
        const sorted = results.slice();

        sorted.sort((a, b) => {
            if (sort === 'duration_desc') return (Number(b.video.duration) || 0) - (Number(a.video.duration) || 0);
            if (sort === 'duration_asc') return (Number(a.video.duration) || 0) - (Number(b.video.duration) || 0);
            if (sort === 'title') return byTitle(a, b);
            if (sort === 'show') {
                const showCompare = String(a.video.show || '').localeCompare(String(b.video.show || ''));
                return showCompare || byTitle(a, b);
            }
            if (sort === 'recent') {
                return String(getProgressState(b.video).updatedAt || '').localeCompare(String(getProgressState(a.video).updatedAt || '')) || byTitle(a, b);
            }
            if (sort === 'progress') {
                return (Number(getProgressState(b.video).ratio) || 0) - (Number(getProgressState(a.video).ratio) || 0) || byTitle(a, b);
            }
            return b.score - a.score || byTitle(a, b);
        });

        return sorted;
    }

    /**
     * Search videos based on query and filters.
     */
    function searchVideos(videos, query, filters = {}) {
        if (!videos || !Array.isArray(videos)) return [];

        const {
            showFilter = 'all',
            statusFilter = 'all',
            resolutionFilter = 'all',
            codecFilter = 'all',
            fpsFilter = 'all',
            durationMin = 0,
            durationMax = Infinity,
            sort = 'relevance'
        } = filters;
        const minDuration = Number(durationMin) || 0;
        const maxDuration = Number(durationMax) || Infinity;

        return sortSearchResults(videos
            .map(video => {
                const facets = getVideoFacets(video);
                const progress = getProgressState(video);
                const duration = Number(video.duration) || 0;

                if (!matchesSelected(video.show, showFilter)) return null;
                if (!matchesSelected(progress.status, statusFilter)) return null;
                if (!matchesSelected(facets.resolution, resolutionFilter)) return null;
                if (!matchesSelected(facets.codec, codecFilter)) return null;
                if (!matchesSelected(facets.fps, fpsFilter)) return null;
                if (duration < minDuration || duration > maxDuration) return null;

                const config = getSearchConfig();
                if (!query || query.trim().length < config.MIN_QUERY_LENGTH) {
                    return { video, score: 0 };
                }

                const titleScore = fuzzyScore(query, video.title, config);
                const showScore = fuzzyScore(query, video.show, config) * 0.8;
                const facetScore = Math.max(
                    fuzzyScore(query, facets.resolution || '', config),
                    fuzzyScore(query, facets.codec || '', config),
                    fuzzyScore(query, facets.fps || '', config)
                ) * 0.55;
                const tagScores = video.tags && video.tags.length
                    ? video.tags.map(tag => fuzzyScore(query, tag, config))
                    : [];
                const maxTagScore = tagScores.length > 0 ? Math.max(...tagScores) * 0.6 : 0;

                const maxScore = Math.max(titleScore, showScore, facetScore, maxTagScore);

                return maxScore >= config.FUZZY_THRESHOLD ? { video, score: maxScore } : null;
            })
            .filter(result => result !== null), sort)
            .map(result => result.video);
    }

    /**
     * Format duration in MM:SS or H:MM:SS format.
     */
    function formatDuration(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Create a video result card HTML.
     */
    function createVideoCard(video) {
        const duration = formatDuration(video.duration);
        const thumbnail = video.thumbnail || 'placeholder.jpg';
        const resolutionBadgeHtml = createResolutionBadgeHtml(video.resolution_badge);
        const previewAttrs = createPreviewAttrs(video.previewSprite);

        return `
            <a href="${escapeHtml(video.url)}" class="video-item search-result-card">
                <div class="video-item-thumbnail-container search-result-thumbnail-container"${previewAttrs}>
                    <img src="${escapeHtml(thumbnail)}" alt="Thumbnail" class="video-item-thumbnail search-result-thumbnail" />
                    <div class="video-item-thumbnail-overlay search-result-thumbnail-overlay" data-duration="${escapeHtml(duration)}" data-duration-seconds="${Number(video.duration) || 0}"></div>
                    <div class="video-item-duration search-result-duration">${duration}</div>
                </div>
                <div class="video-item-content search-result-content">
                    <div class="video-item-title search-result-title">${escapeHtml(video.title)}</div>
                    ${resolutionBadgeHtml}
                    <div class="search-result-show">${escapeHtml(video.show)}</div>
                </div>
            </a>
        `;
    }

    function createResolutionBadgeHtml(resolutionBadge) {
        if (!resolutionBadge || !resolutionBadge.label || !resolutionBadge.color) {
            return '';
        }
        const badgeClass = resolutionBadge.light_text === false
            ? 'video-item-badge video-item-badge--dark-text search-result-badge'
            : 'video-item-badge search-result-badge';
        return `
            <div class="video-item-badge-bar search-result-badge-bar">
                <span class="${badgeClass}" style="${escapeHtml(getBadgeStyle(resolutionBadge.color))}">
                    ${escapeHtml(resolutionBadge.label)}
                </span>
            </div>
        `;
    }

    function createPreviewAttrs(previewSprite) {
        if (!previewSprite || !previewSprite.src) return '';
        return [
            `data-preview-src="${escapeHtml(previewSprite.src)}"`,
            `data-preview-frame-count="${Number(previewSprite.frame_count) || 0}"`,
            `data-preview-frame-width="${Number(previewSprite.frame_width) || 0}"`,
            `data-preview-frame-height="${Number(previewSprite.frame_height) || 0}"`,
            `data-preview-columns="${Number(previewSprite.columns) || 0}"`
        ].join(' ').replace(/^/, ' ');
    }

    function getBadgeStyle(color) {
        if (window.SugarHillSettings && typeof window.SugarHillSettings.getBadgeStyle === 'function') {
            return window.SugarHillSettings.getBadgeStyle(color);
        }
        return `background-color: ${color};`;
    }

    /**
     * Escape HTML to prevent XSS.
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Render search results in the modal.
     */
    function renderResults(results) {
        const resultsContainer = document.getElementById('search-results-container');
        const resultCount = document.getElementById('search-result-count');

        if (!resultsContainer) return;

        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="search-no-results">No videos found. Try a different search.</div>';
            if (resultCount) resultCount.textContent = '0';
            return;
        }

        const cardsHtml = results.map(video => createVideoCard(video)).join('');
        resultsContainer.innerHTML = cardsHtml;
        if (resultCount) resultCount.textContent = results.length;
        if (typeof window.renderThumbnailProgressBars === 'function') {
            window.renderThumbnailProgressBars();
        }
        if (typeof window.initVideoPreviews === 'function') {
            window.initVideoPreviews(resultsContainer);
        }
        if (window.SugarHillQueue && typeof window.SugarHillQueue.decorateVideoCards === 'function') {
            window.SugarHillQueue.decorateVideoCards(resultsContainer);
        }
    }

    /**
     * Initialize search UI.
     */
    function getVideosIndex() {
        if (window.VIDEOS_INDEX && window.VIDEOS_INDEX.videos) {
            return Promise.resolve(window.VIDEOS_INDEX);
        }
        if (window.VIDEOS_INDEX_PROMISE) {
            return window.VIDEOS_INDEX_PROMISE;
        }
        return Promise.resolve(null);
    }

    async function initSearch() {
        const searchInput = document.getElementById('search-input');
        const showFilter = document.getElementById('show-filter');
        const statusFilter = document.getElementById('status-filter');
        const resolutionFilter = document.getElementById('resolution-filter');
        const codecFilter = document.getElementById('codec-filter');
        const fpsFilter = document.getElementById('fps-filter');
        const sortFilter = document.getElementById('sort-filter');
        const durationMin = document.getElementById('duration-min');
        const durationMax = document.getElementById('duration-max');
        const durationMinLabel = document.getElementById('duration-min-label');
        const durationMaxLabel = document.getElementById('duration-max-label');
        const closeButton = document.getElementById('search-modal-close');
        const backdrop = document.getElementById('search-modal-backdrop');
        const modal = document.getElementById('search-modal');

        if (!searchInput || !modal) {
            console.warn('Search UI elements not found in DOM');
            return;
        }

        // Check if videos index exists
        const indexData = await getVideosIndex();
        if (!indexData || !indexData.videos) {
            console.warn('Videos index not found. Search will not work.');
            return;
        }

        const videosIndex = indexData.videos;

        // Populate show filter dropdown
        if (showFilter) {
            const shows = ['All Shows', ...new Set(videosIndex.map(v => v.show))];
            showFilter.innerHTML = shows.map((show, idx) => 
                `<option value="${idx === 0 ? 'all' : escapeHtml(show)}">${escapeHtml(show)}</option>`
            ).join('');
        }

        function populateFacetSelect(select, key) {
            if (!select) return;
            const firstOption = select.querySelector('option');
            const firstLabel = firstOption ? firstOption.textContent : 'All';
            const values = [...new Set(videosIndex
                .map(video => getVideoFacets(video)[key])
                .filter(Boolean))]
                .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
            select.innerHTML = `<option value="all">${escapeHtml(firstLabel)}</option>` + values
                .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
                .join('');
        }

        populateFacetSelect(resolutionFilter, 'resolution');
        populateFacetSelect(codecFilter, 'codec');
        populateFacetSelect(fpsFilter, 'fps');

        let activeRangeThumb = null;
        const rangeSlider = document.querySelector('.filter-range-slider');

        if (durationMin && durationMax) {
            const maxVideoDuration = Math.max(...videosIndex.map(v => v.duration));
            const sliderMax = Math.max(60, maxVideoDuration);
            durationMin.max = sliderMax;
            durationMax.max = sliderMax;
            durationMin.value = 0;
            durationMax.value = sliderMax;
            updateDurationLabels(durationMin.value, durationMax.value, durationMinLabel, durationMaxLabel);
            updateDurationRangeFill(durationMin.value, durationMax.value, sliderMax);
        }

        /**
         * Update duration range labels.
         */
        function updateDurationLabels(minVal, maxVal, minLabel, maxLabel) {
            if (minLabel) minLabel.textContent = formatDuration(parseInt(minVal));
            if (maxLabel) maxLabel.textContent = formatDuration(parseInt(maxVal));
        }

        function updateDurationRangeFill(minVal, maxVal, maxSlider) {
            const fill = document.getElementById('duration-range-fill');
            if (!fill || typeof maxSlider === 'undefined') return;

            const min = Number(minVal);
            const max = Number(maxVal);
            const width = Math.max(0, ((max - min) / maxSlider) * 100);
            const left = Math.min(100, (min / maxSlider) * 100);

            fill.style.width = `${width}%`;
            fill.style.left = `${left}%`;
        }

        function getRangeValueFromClientX(clientX) {
            if (!rangeSlider || !durationMax) return 0;
            const rect = rangeSlider.getBoundingClientRect();
            const maxSlider = parseInt(durationMax.max, 10) || 60;
            const relativeX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
            return Math.round((relativeX / rect.width) * maxSlider);
        }

        function chooseActiveRangeThumb(clientX) {
            if (!rangeSlider || !durationMin || !durationMax) return 'max';
            const rect = rangeSlider.getBoundingClientRect();
            const maxSlider = parseInt(durationMax.max, 10) || 60;
            const clickX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
            const minPos = (parseInt(durationMin.value, 10) / maxSlider) * rect.width;
            const maxPos = (parseInt(durationMax.value, 10) / maxSlider) * rect.width;
            return Math.abs(clickX - minPos) <= Math.abs(clickX - maxPos) ? 'min' : 'max';
        }

        function setActiveRangeValue(clientX) {
            if (!durationMin || !durationMax) return;
            const maxSlider = parseInt(durationMax.max, 10) || 60;
            const newValue = getRangeValueFromClientX(clientX);

            if (activeRangeThumb === 'min') {
                durationMin.value = Math.min(newValue, parseInt(durationMax.value, 10));
            } else {
                durationMax.value = Math.max(newValue, parseInt(durationMin.value, 10));
            }

            const actualMin = parseInt(durationMin.value, 10);
            const actualMax = parseInt(durationMax.value, 10);
            updateDurationLabels(actualMin, actualMax, durationMinLabel, durationMaxLabel);
            updateDurationRangeFill(actualMin, actualMax, maxSlider);
        }

        function pointerMoveHandler(e) {
            if (!activeRangeThumb) return;
            e.preventDefault();
            setActiveRangeValue(e.clientX);
            performSearch();
        }

        function pointerUpHandler() {
            activeRangeThumb = null;
            document.removeEventListener('pointermove', pointerMoveHandler);
            document.removeEventListener('pointerup', pointerUpHandler);
            document.removeEventListener('pointercancel', pointerUpHandler);
        }

        function pointerDownHandler(e) {
            if (!durationMin || !durationMax) return;
            e.preventDefault();
            activeRangeThumb = chooseActiveRangeThumb(e.clientX);
            setActiveRangeValue(e.clientX);
            performSearch();
            document.addEventListener('pointermove', pointerMoveHandler);
            document.addEventListener('pointerup', pointerUpHandler);
            document.addEventListener('pointercancel', pointerUpHandler);
        }

        if (rangeSlider) {
            rangeSlider.addEventListener('pointerdown', pointerDownHandler);
        }

        if (durationMin) {
            durationMin.addEventListener('pointerdown', (e) => e.preventDefault(), { passive: false });
        }

        if (durationMax) {
            durationMax.addEventListener('pointerdown', (e) => e.preventDefault(), { passive: false });
        }

        /**
         * Perform search with current filters.
         */
        function performSearch() {
            const query = searchInput.value.trim();
            const filters = {
                showFilter: showFilter ? showFilter.value : 'all',
                statusFilter: statusFilter ? statusFilter.value : 'all',
                resolutionFilter: resolutionFilter ? resolutionFilter.value : 'all',
                codecFilter: codecFilter ? codecFilter.value : 'all',
                fpsFilter: fpsFilter ? fpsFilter.value : 'all',
                durationMin: durationMin ? parseInt(durationMin.value) : 0,
                durationMax: durationMax ? parseInt(durationMax.value) : Infinity,
                sort: sortFilter ? sortFilter.value : 'relevance'
            };

            const results = searchVideos(videosIndex, query, filters);
            renderResults(results);

            const defaultDuration = durationMax ? parseInt(durationMax.max) : Infinity;
            const hasDurationFilter = durationMin && durationMax && (
                parseInt(durationMin.value) > 0 || parseInt(durationMax.value) < defaultDuration
            );
            const hasFacetFilter = [
                showFilter,
                statusFilter,
                resolutionFilter,
                codecFilter,
                fpsFilter
            ].some(select => select && select.value !== 'all');
            const hasSortFilter = sortFilter && sortFilter.value !== 'relevance';

            // Show modal if user is actively searching, using filters, or still focused on the search input
            const config = getSearchConfig();
            if (query.length >= config.MIN_QUERY_LENGTH || 
                hasFacetFilter ||
                hasSortFilter ||
                hasDurationFilter || 
                document.activeElement === searchInput) {
                modal.classList.add('active');
            } else {
                modal.classList.remove('active');
            }
        }

        // Event listeners
        if (searchInput) {
            searchInput.addEventListener('input', performSearch);
            searchInput.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.classList.add('active');
            });
            searchInput.addEventListener('focus', () => {
                modal.classList.add('active');
            });
        }

        // Close modal when clicking outside
        document.addEventListener('click', (e) => {
            // Don't close if clicking inside the search input, modal, or its children
            if (searchInput && searchInput.contains(e.target)) return;
            if (modal && modal.contains(e.target)) return;
            
            modal.classList.remove('active');
        });

        if (showFilter) {
            showFilter.addEventListener('change', performSearch);
        }
        [statusFilter, resolutionFilter, codecFilter, fpsFilter, sortFilter].forEach(select => {
            if (select) {
                select.addEventListener('change', performSearch);
            }
        });

        document.addEventListener('sugarhill:progress-changed', () => {
            if (modal.classList.contains('active')) {
                performSearch();
            }
        });

        if (durationMin) {
            durationMin.addEventListener('input', (e) => {
                const minValue = parseInt(e.target.value);
                const maxValue = durationMax ? parseInt(durationMax.value) : minValue;
                if (minValue > maxValue) {
                    e.target.value = maxValue;
                }
                const actualMin = durationMin ? parseInt(durationMin.value) : 0;
                const actualMax = durationMax ? parseInt(durationMax.value) : maxValue;
                updateDurationLabels(actualMin, actualMax, durationMinLabel, durationMaxLabel);
                updateDurationRangeFill(actualMin, actualMax, durationMax ? parseInt(durationMax.max) : actualMax);
                performSearch();
            });
        }

        if (durationMax) {
            durationMax.addEventListener('input', (e) => {
                const maxValue = parseInt(e.target.value);
                const minValue = durationMin ? parseInt(durationMin.value) : maxValue;
                if (maxValue < minValue) {
                    e.target.value = minValue;
                }
                const actualMin = durationMin ? parseInt(durationMin.value) : 0;
                const actualMax = durationMax ? parseInt(durationMax.value) : maxValue;
                updateDurationLabels(actualMin, actualMax, durationMinLabel, durationMaxLabel);
                updateDurationRangeFill(actualMin, actualMax, durationMax ? parseInt(durationMax.max) : actualMax);
                performSearch();
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.classList.remove('active');
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target === backdrop) {
                    modal.classList.remove('active');
                }
            });
        }

        // Prevent modal content clicks from closing the modal
        const modalContent = modal.querySelector('.search-modal-content');
        if (modalContent) {
            modalContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
            
        // Enable backdrop pointer-events when modal is active
        const originalAdd = modal.classList.add.bind(modal.classList);
        const originalRemove = modal.classList.remove.bind(modal.classList);
        
        modal.classList.add = function(...args) {
            originalAdd(...args);
            if (args.includes('active')) {
                backdrop.style.pointerEvents = 'auto';
            }
        };
        
        modal.classList.remove = function(...args) {
            originalRemove(...args);
            if (args.includes('active')) {
                backdrop.style.pointerEvents = 'none';
            }
        };

        console.log('Search UI initialized with', videosIndex.length, 'videos');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearch);
    } else {
        initSearch();
    }

    // Expose for debugging
    window.SearchUI = {
        fuzzyScore,
        levenshteinDistance,
        searchVideos,
        formatDuration
    };
})();
