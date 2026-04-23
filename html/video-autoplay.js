/**
 * Video Player SPA (Single Page Application)
 * 
 * Implements dynamic video loading to maintain browser session engagement,
 * allowing autoplay with sound. Preserves the Media Engagement Index by
 * keeping the same page loaded and dynamically replacing video content.
 */

(function() {
    const UNMUTE_PREFERENCE_KEY = 'video-player-user-unmuted';
    let videoElement = document.querySelector('video');
    let countdownInterval = null;
    let isOverlayActive = false;
    let isLoadingNextVideo = false;
    
    /**
     * Parse HTML response to extract video data
     */
    function parseVideoData(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Extract video source URL
        const videoSource = doc.querySelector('video source');
        const videoSrc = videoSource?.getAttribute('src') || '';
        
        // Extract data attributes
        const videoTag = doc.querySelector('video');
        const nextUrl = videoTag?.getAttribute('data-next-url') || '';
        const nextTitle = videoTag?.getAttribute('data-next-title') || '';
        const fallbackUrl = videoTag?.getAttribute('data-fallback-url') || '';
        const fallbackTitle = videoTag?.getAttribute('data-fallback-title') || '';
        
        // Extract title from page
        const titleElement = doc.querySelector('.video-title');
        const title = titleElement?.textContent || '';
        
        // Extract sidebar links
        const sidebar = doc.querySelector('.sidebar');
        const sidebarHtml = sidebar?.innerHTML || '';
        
        // Extract header title
        const headerTitle = doc.querySelector('.header-title');
        const headerText = headerTitle?.textContent || '';
        
        return {
            videoSrc,
            title,
            nextUrl,
            nextTitle,
            fallbackUrl,
            fallbackTitle,
            sidebarHtml,
            headerText,
            fullHtml: html
        };
    }
    
    /**
     * Load next video dynamically (SPA approach)
     */
    async function loadNextVideo(videoUrl) {
        if (isLoadingNextVideo) return;
        isLoadingNextVideo = true;
        
        try {
            const response = await fetch(videoUrl);
            if (!response.ok) throw new Error('Failed to load video page');
            
            const html = await response.text();
            const videoData = parseVideoData(html);
            
            // Update URL in browser without reloading
            window.history.replaceState(
                { videoUrl },
                videoData.title,
                videoUrl
            );
            
            // Update page title
            document.title = videoData.title;
            
            // Update header title
            const headerTitle = document.querySelector('.header-title');
            if (headerTitle) {
                headerTitle.textContent = videoData.headerText;
            }
            
            // Update video title
            const videoTitleElement = document.querySelector('.video-title');
            if (videoTitleElement) {
                videoTitleElement.textContent = videoData.title;
            }
            
            // Update sidebar
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.innerHTML = videoData.sidebarHtml;
            }
            
            // Update video element data attributes
            videoElement.setAttribute('data-next-url', videoData.nextUrl);
            videoElement.setAttribute('data-next-title', videoData.nextTitle);
            videoElement.setAttribute('data-fallback-url', videoData.fallbackUrl);
            videoElement.setAttribute('data-fallback-title', videoData.fallbackTitle);
            
            // Update video source and reload
            const videoSource = videoElement.querySelector('source');
            if (videoSource) {
                videoSource.setAttribute('src', videoData.videoSrc);
            }
            
            // Reload video element to fetch new source
            videoElement.load();
            
            // Auto-play the new video (unmuted if user previously unmuted)
            if (localStorage.getItem(UNMUTE_PREFERENCE_KEY) === 'true') {
                videoElement.muted = false;
            } else {
                videoElement.muted = true;
                createUnmuteButton();
            }
            
            // Play the video
            videoElement.play().catch(err => {
                console.log('Autoplay failed:', err);
            });
            
        } catch (error) {
            console.error('Error loading next video:', error);
            // Fallback to page navigation
            window.location.href = videoUrl;
        } finally {
            isLoadingNextVideo = false;
        }
    }
    
    /**
     * Create and show the unmute button overlay
     */
    function createUnmuteButton() {
        // Remove existing unmute button if present
        const existing = document.getElementById('unmute-button-overlay');
        if (existing) {
            existing.remove();
        }
        
        // Create button container - positioned absolutely over video
        const unmuteButton = document.createElement('div');
        unmuteButton.id = 'unmute-button-overlay';
        unmuteButton.role = 'button';
        unmuteButton.tabindex = '0';
        unmuteButton.style.cssText = `
            position: absolute;
            width: 200px;
            height: 200px;
            background: rgba(0, 0, 0, 0.7);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            font-weight: 500;
            color: white;
            cursor: pointer;
            z-index: 100;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            transition: all 0.2s;
            user-select: none;
        `;
        unmuteButton.innerHTML = 'Unmute 🔊';
        
        // Hover effect
        unmuteButton.onmouseover = () => {
            unmuteButton.style.background = 'rgba(0, 0, 0, 0.9)';
            unmuteButton.style.borderColor = 'rgba(255, 255, 255, 0.6)';
            unmuteButton.style.transform = 'scale(1.05)';
        };
        unmuteButton.onmouseout = () => {
            unmuteButton.style.background = 'rgba(0, 0, 0, 0.7)';
            unmuteButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            unmuteButton.style.transform = 'scale(1)';
        };
        
        // Click to unmute
        unmuteButton.onclick = (e) => {
            e.stopPropagation();
            videoElement.muted = false;
            localStorage.setItem(UNMUTE_PREFERENCE_KEY, 'true');
            unmuteButton.style.opacity = '0';
            unmuteButton.style.pointerEvents = 'none';
            setTimeout(() => {
                unmuteButton.remove();
            }, 300);
        };
        
        // Keyboard support
        unmuteButton.onkeypress = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                unmuteButton.onclick(e);
            }
        };
        
        return unmuteButton;
    }
    
    /**
     * Position the unmute button over the video element
     */
    function positionUnmuteButton(unmuteButton) {
        const videoRect = videoElement.getBoundingClientRect();
        const videoCenterX = videoRect.left + videoRect.width / 2;
        const videoCenterY = videoRect.top + videoRect.height / 2;
        
        unmuteButton.style.left = (videoCenterX - 100) + 'px';
        unmuteButton.style.top = (videoCenterY - 100) + 'px';
    }
    
    /**
     * Create and show the countdown overlay positioned over video
     */
    function showCountdownOverlay(nextUrl, nextTitle) {
        if (isOverlayActive || !nextUrl || !nextTitle) return;
        isOverlayActive = true;
        
        // Get video position to position overlay over it
        const videoRect = videoElement.getBoundingClientRect();
        
        // Create overlay container - positioned over video only
        const overlay = document.createElement('div');
        overlay.id = 'autoplay-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: ${videoRect.top}px;
            left: ${videoRect.left}px;
            width: ${videoRect.width}px;
            height: ${videoRect.height}px;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        `;
        
        // Create content container
        const content = document.createElement('div');
        content.style.cssText = `
            text-align: center;
            color: white;
            max-width: 90%;
        `;
        
        // Create title
        const title = document.createElement('div');
        title.textContent = 'Playing next:';
        title.style.cssText = `
            font-size: 18px;
            font-weight: 500;
            color: #aaa;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        `;
        
        // Create video title
        const videoTitle = document.createElement('div');
        videoTitle.textContent = nextTitle;
        videoTitle.style.cssText = `
            font-size: 28px;
            font-weight: 300;
            color: #f1f1f1;
            margin-bottom: 40px;
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        `;
        
        // Create countdown display
        const countdownDisplay = document.createElement('div');
        countdownDisplay.id = 'countdown-display';
        countdownDisplay.textContent = '12';
        countdownDisplay.style.cssText = `
            font-size: 80px;
            font-weight: 300;
            color: #065fd4;
            margin-bottom: 40px;
            font-variant-numeric: tabular-nums;
            transition: color 0.2s;
        `;
        
        // Create buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 16px;
            justify-content: center;
        `;
        
        // Create cancel button
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            padding: 12px 32px;
            background-color: transparent;
            border: 1px solid #606060;
            color: #f1f1f1;
            border-radius: 4px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        `;
        cancelButton.onmouseover = () => {
            cancelButton.style.borderColor = '#aaa';
            cancelButton.style.color = '#aaa';
        };
        cancelButton.onmouseout = () => {
            cancelButton.style.borderColor = '#606060';
            cancelButton.style.color = '#f1f1f1';
        };
        cancelButton.onclick = closeOverlay;
        
        // Create go button
        const goButton = document.createElement('button');
        goButton.textContent = 'Go Now';
        goButton.style.cssText = `
            padding: 12px 32px;
            background-color: #065fd4;
            border: none;
            color: #f1f1f1;
            border-radius: 4px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
        `;
        goButton.onmouseover = () => {
            goButton.style.backgroundColor = '#1473e6';
        };
        goButton.onmouseout = () => {
            goButton.style.backgroundColor = '#065fd4';
        };
        goButton.onclick = () => navigateToNextVideo(nextUrl);
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(goButton);
        
        // Assemble content
        content.appendChild(title);
        content.appendChild(videoTitle);
        content.appendChild(countdownDisplay);
        content.appendChild(buttonContainer);
        overlay.appendChild(content);
        
        // Add to page
        document.body.appendChild(overlay);
        
        // Start countdown
        startCountdown(nextUrl);
    }
    
    /**
     * Start the countdown timer (12 seconds)
     */
    function startCountdown(nextUrl) {
        let secondsLeft = 12;
        const countdownDisplay = document.getElementById('countdown-display');
        
        // Update display immediately
        updateCountdownDisplay(secondsLeft, countdownDisplay);
        
        countdownInterval = setInterval(() => {
            secondsLeft--;
            
            if (countdownDisplay) {
                updateCountdownDisplay(secondsLeft, countdownDisplay);
            }
            
            // When countdown reaches zero, navigate
            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                navigateToNextVideo(nextUrl);
            }
        }, 1000);
    }
    
    /**
     * Update the countdown display with animation
     */
    function updateCountdownDisplay(seconds, element) {
        element.textContent = seconds;
        
        // Add a subtle color pulse animation
        if (seconds <= 3) {
            element.style.color = '#ff6b6b';
        } else if (seconds <= 6) {
            element.style.color = '#ffa94d';
        } else {
            element.style.color = '#065fd4';
        }
    }
    
    /**
     * Close the overlay and stop countdown
     */
    function closeOverlay() {
        clearInterval(countdownInterval);
        const overlay = document.getElementById('autoplay-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => {
                overlay.remove();
                isOverlayActive = false;
            }, 300);
        }
    }
    
    /**
     * Navigate to the next video (SPA or fallback)
     */
    function navigateToNextVideo(nextUrl) {
        if (nextUrl) {
            // Try SPA loading first
            loadNextVideo(nextUrl);
            closeOverlay();
        }
    }
    
    /**
     * Handle video end event
     */
    function onVideoEnded() {
        // Determine next video URL
        const nextUrl = videoElement.getAttribute('data-next-url');
        const nextTitle = videoElement.getAttribute('data-next-title');
        
        let targetUrl = nextUrl || null;
        let targetTitle = nextTitle || null;
        
        // Use fallback if no next video
        if (!targetUrl) {
            targetUrl = videoElement.getAttribute('data-fallback-url');
            targetTitle = videoElement.getAttribute('data-fallback-title');
        }
        
        if (targetUrl && targetTitle) {
            showCountdownOverlay(targetUrl, targetTitle);
        }
    }
    
    /**
     * Handle video play event - auto-unmute if user has done it before
     */
    function onVideoPlay() {
        // Check if user has previously unmuted
        if (localStorage.getItem(UNMUTE_PREFERENCE_KEY) === 'true') {
            videoElement.muted = false;
        }
    }
    
    /**
     * Handle video loaded metadata event
     */
    function onVideoLoadedMetadata() {
        // Create and position unmute button if video is still muted
        if (localStorage.getItem(UNMUTE_PREFERENCE_KEY) !== 'true') {
            const unmuteButton = createUnmuteButton();
            // Position it in the DOM
            document.body.appendChild(unmuteButton);
            
            // Position it over the video
            const positionButton = () => {
                positionUnmuteButton(unmuteButton);
            };
            positionButton();
            
            // Reposition on window resize
            window.addEventListener('resize', positionButton);
        }
    }
    
    // Add event listeners
    videoElement.addEventListener('ended', onVideoEnded);
    videoElement.addEventListener('play', onVideoPlay);
    videoElement.addEventListener('loadedmetadata', onVideoLoadedMetadata);
})();
