/* ==========================================================================
   Aetheria Smart Home IoT - Application Engine
   ========================================================================== */

// Remote debugging hook and buffer
window.logBuffer = [];
window.remoteLog = function(type, message) {
    const formatted = `[${type}] ${message}`;
    window.logBuffer.push(formatted);
    if (window.dbgLog) {
        window.dbgLog(formatted);
    }
    fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: type, message: String(message) })
    }).catch(() => {});
};
window.addEventListener('error', function(e) {
    window.remoteLog('ERROR', e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno + '\nStack: ' + (e.error ? e.error.stack : ''));
});
window.addEventListener('unhandledrejection', function(e) {
    window.remoteLog('REJECTION', e.reason ? (e.reason.message || String(e.reason)) : 'Unknown promise rejection');
});
// Override console.error
const originalConsoleError = console.error;
console.error = function(...args) {
    window.remoteLog('CONSOLE_ERROR', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalConsoleError.apply(console, args);
};
// Override console.log
const originalConsoleLog = console.log;
console.log = function(...args) {
    window.remoteLog('CONSOLE_LOG', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalConsoleLog.apply(console, args);
};

window.remoteLog('INIT', 'Script loaded, initializing boot logic...');

function initAetheria() {
    try {
        // Create floating debug panel (positioned bottom-right for visibility)
        const dbg = document.createElement('div');
        dbg.id = 'floating-debug-log';
        dbg.style.cssText = "position: fixed; bottom: 20px; right: 20px; width: 360px; height: 200px; background: rgba(10,10,25,0.95); color: #00f2fe; padding: 12px; font-family: monospace; font-size: 11px; z-index: 100000; border: 2px solid #00f2fe; border-radius: 12px; overflow-y: auto; line-height: 1.4; box-shadow: 0 0 20px rgba(0, 242, 254, 0.4); pointer-events: none;";
        dbg.innerHTML = "<strong>AETHERIA DEBUG CONSOLE:</strong><br>";
        document.body.appendChild(dbg);

        window.dbgLog = function(msg) {
            dbg.innerHTML += msg + "<br>";
            dbg.scrollTop = dbg.scrollHeight;
        };
        
        // Print all buffered logs
        window.logBuffer.forEach(msg => window.dbgLog(msg));
        
        window.dbgLog("System Booting...");
        window.dbgLog("Booting core modules...");

    // ----------------------------------------------------------------------
    // 1. Core State Store
    // ----------------------------------------------------------------------
    const state = {
        devices: {
            'living-light': { on: true, brightness: 80, color: '#ffb366', powerRate: 60, name: 'Living Room Light' },
            'living-ac': { on: true, targetTemp: 21, mode: 'cool', ambientTemp: 22.4, powerRate: 850, name: 'Climate Control AC' },
            'front-lock': { locked: true, battery: 92, name: 'Front Door Lock' },
            'media-sound': { on: true, volume: 50, playing: true, trackIndex: 0, progress: 24, duration: 244, name: 'Smart Sound System' },
            'patio-flood': { on: false, autoThreshold: true, powerRate: 120, lux: 110, motion: false, name: 'Patio Floodlights' },
            'vacuum': { status: 'charging', battery: 98, x: 50, y: 50, powerRate: 40, name: 'Aegis Robo-Vacuum' },
            'bedroom-blinds': { on: true, position: 60, powerRate: 20, name: 'Bedroom Blinds' },
            'bedroom-lamp': { on: true, brightness: 40, color: '#ffb366', powerRate: 40, name: 'Sleep Ambient Lamp' },
            'bedroom-purifier': { on: true, aqi: 12, pm25: 12, fan: 'auto', powerRate: 30, name: 'Bedroom Air Purifier' },
            'kitchen-coffee': { on: true, recipe: 'americano', brewing: false, brewProgress: 0, powerRate: 1400, name: 'Coffee Maker Node' },
            'kitchen-fridge': { fridgeTemp: 3.5, freezerTemp: -18.0, items: ['Fresh Milk', 'Avocados'], powerRate: 180, name: 'AeroTemp Fridge' },
            'backyard-sprinkler': { on: false, moisture: 34, powerRate: 80, name: 'Garden Sprinklers' }
        },
        scenes: 'arrive', // Current active ambient scene
        simulationEnabled: true,
        simulationSpeed: 2000, // Update tick interval in ms
        alertSensitivity: 'critical',
        activeCamId: 'cam-driveway',
        notifications: [],
        automations: [
            { id: 1, triggerDevice: 'temp-sensor', triggerCondition: 'gt', triggerValue: '24', actionDevice: 'living-ac', actionState: 'turn-on', active: true, label: 'Cool Down: IF Living Temp > 24°C THEN Turn AC ON' },
            { id: 2, triggerDevice: 'motion-sensor', triggerCondition: 'eq', triggerValue: 'Detected', actionDevice: 'patio-flood', actionState: 'turn-on', active: true, label: 'Night Light: IF Patio Motion Detected THEN Turn Patio Floodlight ON' }
        ],
        // Analytics baseline logs
        historyPower: [1.1, 1.3, 1.4, 0.9, 0.8, 1.1, 1.25, 1.2],
        historyLabels: ['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00']
    };

    // Tracks playlist
    const playlist = [
        { title: 'Midnight City', artist: 'M83', duration: 244 },
        { title: 'Intro', artist: 'The xx', duration: 128 },
        { title: 'Sleepyhead', artist: 'Passion Pit', duration: 227 },
        { title: 'Digital Love', artist: 'Daft Punk', duration: 300 }
    ];

    // Canvas contexts
    let miniCamContext = null;
    let largeCamContext = null;
    let miniCamAnimationId = null;
    let largeCamAnimationId = null;

    // Charts instances
    let miniEnergyChartObj = null;
    let largeEnergyChartObj = null;
    let applianceChartObj = null;

    // Simulation timer
    let simTimerId = null;

    // ----------------------------------------------------------------------
    // 2. Navigation Navigation Router
    // ----------------------------------------------------------------------
    const menuItems = document.querySelectorAll('.menu-item');
    const routePanels = document.querySelectorAll('.route-panel');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            
            // Remove active status
            menuItems.forEach(mi => mi.classList.remove('active'));
            routePanels.forEach(rp => rp.classList.remove('active'));
            
            // Activate targets
            item.classList.add('active');
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            // Canvas feeds re-sync on tab switches
            if (targetId === 'security-section' || targetId === 'overview-section') {
                initCanvasFeeds();
            }

            // Charts resize trigger to ensure glassmorphic containment
            if (targetId === 'analytics-section' && largeEnergyChartObj) {
                largeEnergyChartObj.resize();
                applianceChartObj.resize();
            }
        });
    });

    // ----------------------------------------------------------------------
    // 3. UI Sync State View Engines
    // ----------------------------------------------------------------------
    function syncDeviceUI() {
        // --- 3a. Living Room Light Widget ---
        const light = state.devices['living-light'];
        const lightToggle = document.getElementById('widget-light-toggle');
        const overviewLightToggle = document.getElementById('toggle-living-light');
        const lightControls = document.getElementById('widget-light-controls');
        const lightIconBox = document.getElementById('widget-light-icon-box');
        const lightBrightSlider = document.getElementById('widget-light-brightness');
        const lightBrightVal = document.getElementById('light-bright-val');
        const lightGlowColor = document.getElementById('light-glow-color');

        if (lightToggle) lightToggle.checked = light.on;
        if (overviewLightToggle) overviewLightToggle.checked = light.on;
        
        if (light.on) {
            lightControls.classList.remove('disabled-state');
            lightIconBox.classList.add('active');
            lightIconBox.style.color = light.color;
            lightIconBox.style.borderColor = light.color + '4D';
            lightIconBox.style.boxShadow = `0 0 15px ${light.color}59`;
            lightGlowColor.style.background = `radial-gradient(circle, ${light.color}26 0%, rgba(0,0,0,0) 70%)`;
            
            // Update quick control status label
            const qc = document.querySelector('[data-device="living-light"] .sub-label');
            if (qc) qc.textContent = `ON • ${light.brightness}% Brightness`;
        } else {
            lightControls.classList.add('disabled-state');
            lightIconBox.classList.remove('active');
            lightIconBox.style.color = '';
            lightIconBox.style.borderColor = '';
            lightIconBox.style.boxShadow = '';
            lightGlowColor.style.background = '';
            const qc = document.querySelector('[data-device="living-light"] .sub-label');
            if (qc) qc.textContent = `OFF`;
        }
        
        if (lightBrightSlider) lightBrightSlider.value = light.brightness;
        if (lightBrightVal) lightBrightVal.textContent = `${light.brightness}%`;

        // Update presets active color dot
        document.querySelectorAll('.color-dot').forEach(dot => {
            const hex = dot.getAttribute('data-color');
            if (hex === light.color) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });

        // --- 3b. Smart Climate Widget ---
        const ac = state.devices['living-ac'];
        const acToggle = document.getElementById('widget-thermostat-toggle');
        const overviewAcToggle = document.getElementById('toggle-living-ac');
        const acControls = document.getElementById('widget-thermostat-controls');
        const acIconBox = document.getElementById('widget-thermostat-icon-box');
        const thermoDisplay = document.getElementById('thermo-display-temp');
        const thermoAmbient = document.getElementById('thermo-ambient-val');

        if (acToggle) acToggle.checked = ac.on;
        if (overviewAcToggle) overviewAcToggle.checked = ac.on;

        if (ac.on) {
            acControls.classList.remove('disabled-state');
            acIconBox.classList.add('active');
            thermoDisplay.textContent = `${ac.targetTemp}°C`;
            thermoAmbient.textContent = `${ac.ambientTemp.toFixed(1)}°C`;
            const qc = document.querySelector('[data-device="living-ac"] .sub-label');
            if (qc) qc.textContent = `${ac.mode.toUpperCase()}ING AT ${ac.targetTemp}°C`;
            
            // Mode Selectors
            document.querySelectorAll('.mode-btn').forEach(btn => {
                if (btn.getAttribute('data-mode') === ac.mode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            syncThermostatDial();
        } else {
            acControls.classList.add('disabled-state');
            acIconBox.classList.remove('active');
            thermoDisplay.textContent = '--';
            const qc = document.querySelector('[data-device="living-ac"] .sub-label');
            if (qc) qc.textContent = `OFF`;
        }

        // --- 3c. Smart Lock Widget ---
        const lock = state.devices['front-lock'];
        const overviewLockToggle = document.getElementById('toggle-front-lock');
        const lockShieldWrapper = document.getElementById('lock-shield-indicator');
        const lockStatusLabel = document.getElementById('lock-status-label');
        const slideText = document.getElementById('slide-to-unlock-text');
        const slideBtn = document.getElementById('slide-to-unlock-btn');

        if (overviewLockToggle) overviewLockToggle.checked = lock.locked;

        if (lock.locked) {
            lockShieldWrapper.classList.remove('unlocked');
            lockShieldWrapper.querySelector('.secure-icon').className = "fa-solid fa-shield-halved secure-icon";
            lockStatusLabel.textContent = "FRONT DOOR SECURED";
            lockStatusLabel.className = "lock-state-text text-neon-teal";
            if (slideText) slideText.textContent = "SLIDE TO UNLOCK";
            if (slideBtn) {
                slideBtn.style.left = "4px";
                slideBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
                slideBtn.style.background = '';
            }
            const qcIcon = document.querySelector('[data-device="front-lock"] .quick-toggle-icon');
            if (qcIcon) {
                qcIcon.className = "quick-toggle-icon active-secure";
                qcIcon.innerHTML = '<i class="fa-solid fa-lock"></i>';
            }
            const qc = document.querySelector('[data-device="front-lock"] .sub-label');
            if (qc) {
                qc.className = "sub-label text-neon-teal";
                qc.textContent = "SECURELY LOCKED";
            }
        } else {
            lockShieldWrapper.classList.add('unlocked');
            lockShieldWrapper.querySelector('.secure-icon').className = "fa-solid fa-lock-open secure-icon";
            lockStatusLabel.textContent = "FRONT DOOR UNLOCKED";
            lockStatusLabel.className = "lock-state-text text-neon-pink";
            if (slideText) slideText.textContent = "SLIDE TO LOCK";
            if (slideBtn) {
                slideBtn.style.left = "calc(100% - 44px)";
                slideBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
                slideBtn.style.background = 'linear-gradient(135deg, var(--neon-pink), var(--neon-purple))';
            }
            const qcIcon = document.querySelector('[data-device="front-lock"] .quick-toggle-icon');
            if (qcIcon) {
                qcIcon.className = "quick-toggle-icon";
                qcIcon.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
            }
            const qc = document.querySelector('[data-device="front-lock"] .sub-label');
            if (qc) {
                qc.className = "sub-label text-neon-pink";
                qc.textContent = "UNLOCKED / EXPOSED";
            }
        }

        // --- 3d. Smart Sound System Widget ---
        const sound = state.devices['media-sound'];
        const soundToggle = document.getElementById('widget-music-toggle');
        const overviewSoundToggle = document.getElementById('toggle-media-sound');
        const soundControls = document.getElementById('widget-music-controls');
        const soundIconBox = document.getElementById('widget-music-icon-box');
        const playBtn = document.getElementById('btn-track-play');
        const rotatingVinyl = document.getElementById('rotating-vinyl');
        const vinylTonearm = document.getElementById('vinyl-tonearm');
        const volumeSlider = document.getElementById('widget-music-volume');
        const timelineProgress = document.getElementById('music-timeline-progress');

        if (soundToggle) soundToggle.checked = sound.on;
        if (overviewSoundToggle) overviewSoundToggle.checked = sound.on;

        if (sound.on) {
            soundControls.classList.remove('disabled-state');
            soundIconBox.classList.add('active');
            
            // Set current active track info
            const track = playlist[sound.trackIndex];
            document.getElementById('current-track-name').textContent = track.title;
            document.getElementById('current-track-artist').textContent = track.artist;
            document.getElementById('track-time-total').textContent = formatMediaTime(track.duration);
            document.getElementById('track-time-elapsed').textContent = formatMediaTime(sound.progress);
            
            if (timelineProgress) {
                timelineProgress.max = track.duration;
                timelineProgress.value = sound.progress;
            }

            if (sound.playing) {
                playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                rotatingVinyl.style.animationPlayState = 'running';
                vinylTonearm.classList.add('active');
                
                const qc = document.querySelector('[data-device="media-sound"] .sub-label');
                if (qc) qc.textContent = `PLAYING • "${track.title}"`;
            } else {
                playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                rotatingVinyl.style.animationPlayState = 'paused';
                vinylTonearm.classList.remove('active');
                
                const qc = document.querySelector('[data-device="media-sound"] .sub-label');
                if (qc) qc.textContent = `PAUSED • "${track.title}"`;
            }
        } else {
            soundControls.classList.add('disabled-state');
            soundIconBox.classList.remove('active');
            rotatingVinyl.style.animationPlayState = 'paused';
            vinylTonearm.classList.remove('active');
            
            const qc = document.querySelector('[data-device="media-sound"] .sub-label');
            if (qc) qc.textContent = `OFF`;
        }
        
        if (volumeSlider) volumeSlider.value = sound.volume;

        // --- 3e. Backyard Floodlights ---
        const flood = state.devices['patio-flood'];
        const floodToggle = document.getElementById('widget-floodlight-toggle');
        const floodControls = document.getElementById('widget-floodlight-controls');
        const floodIconBox = document.getElementById('widget-floodlight-icon-box');

        if (floodToggle) floodToggle.checked = flood.on;
        if (flood.on) {
            floodIconBox.classList.add('active');
            document.getElementById('sensor-motion-status').textContent = 'ILLUMINATED';
            document.getElementById('sensor-motion-status').className = 'readout-val text-neon-gold';
        } else {
            floodIconBox.classList.remove('active');
            document.getElementById('sensor-motion-status').textContent = flood.motion ? 'MOTION!' : 'SECURE';
            document.getElementById('sensor-motion-status').className = flood.motion ? 'readout-val text-neon-pink' : 'readout-val text-neon-teal';
        }

        // --- Smart Window Blinds ---
        const blinds = state.devices['bedroom-blinds'];
        const blindsToggle = document.getElementById('widget-blinds-toggle');
        const blindsControls = document.getElementById('widget-blinds-controls');
        const blindsIconBox = document.getElementById('widget-blinds-icon-box');
        const blindsPosSlider = document.getElementById('widget-blinds-position');
        const blindsPosVal = document.getElementById('blinds-pos-val');
        const slatsGroup = document.getElementById('blinds-slats-group');

        if (blindsToggle) blindsToggle.checked = blinds.on;
        if (blinds.on) {
            if (blindsControls) blindsControls.classList.remove('disabled-state');
            if (blindsIconBox) blindsIconBox.classList.add('active');
            if (blindsPosVal) blindsPosVal.textContent = `${blinds.position}%`;
            if (slatsGroup) {
                slatsGroup.style.transform = `scale(1, ${1 - (blinds.position / 100)})`;
            }
        } else {
            if (blindsControls) blindsControls.classList.add('disabled-state');
            if (blindsIconBox) blindsIconBox.classList.remove('active');
            if (slatsGroup) {
                slatsGroup.style.transform = `scale(1, 1)`;
            }
        }
        if (blindsPosSlider) blindsPosSlider.value = blinds.position;

        // --- Sleep Bedside Lamp ---
        const lamp = state.devices['bedroom-lamp'];
        const lampToggle = document.getElementById('widget-lamp-toggle');
        const lampControls = document.getElementById('widget-lamp-controls');
        const lampIconBox = document.getElementById('widget-lamp-icon-box');
        const lampBrightSlider = document.getElementById('widget-lamp-brightness');
        const lampBrightVal = document.getElementById('lamp-bright-val');
        const lampGlowColor = document.getElementById('lamp-glow-color');

        if (lampToggle) lampToggle.checked = lamp.on;
        if (lamp.on) {
            if (lampControls) lampControls.classList.remove('disabled-state');
            if (lampIconBox) {
                lampIconBox.classList.add('active');
                lampIconBox.style.color = lamp.color;
                lampIconBox.style.borderColor = lamp.color + '4D';
                lampIconBox.style.boxShadow = `0 0 15px ${lamp.color}59`;
            }
            if (lampGlowColor) lampGlowColor.style.background = `radial-gradient(circle, ${lamp.color}1F 0%, rgba(0,0,0,0) 70%)`;
        } else {
            if (lampControls) lampControls.classList.add('disabled-state');
            if (lampIconBox) {
                lampIconBox.classList.remove('active');
                lampIconBox.style.color = '';
                lampIconBox.style.borderColor = '';
                lampIconBox.style.boxShadow = '';
            }
            if (lampGlowColor) lampGlowColor.style.background = '';
        }
        if (lampBrightSlider) lampBrightSlider.value = lamp.brightness;
        if (lampBrightVal) lampBrightVal.textContent = `${lamp.brightness}%`;

        // --- Air Purifier ---
        const purifier = state.devices['bedroom-purifier'];
        const purifierToggle = document.getElementById('widget-purifier-toggle');
        const purifierControls = document.getElementById('widget-purifier-controls');
        const purifierIconBox = document.getElementById('widget-purifier-icon-box');
        const purifierAqiStatus = document.getElementById('purifier-aqi-status');
        const purifierPm25Val = document.getElementById('purifier-pm25-val');

        if (purifierToggle) purifierToggle.checked = purifier.on;
        if (purifier.on) {
            if (purifierControls) purifierControls.classList.remove('disabled-state');
            if (purifierIconBox) purifierIconBox.classList.add('active');
            if (purifierPm25Val) purifierPm25Val.textContent = `${Math.round(purifier.pm25)} µg/m³`;
            if (purifierAqiStatus) {
                if (purifier.pm25 < 15) {
                    purifierAqiStatus.textContent = 'EXCELLENT';
                    purifierAqiStatus.className = 'readout-val text-neon-teal';
                } else if (purifier.pm25 < 35) {
                    purifierAqiStatus.textContent = 'GOOD';
                    purifierAqiStatus.className = 'readout-val text-neon-cyan';
                } else {
                    purifierAqiStatus.textContent = 'MODERATE';
                    purifierAqiStatus.className = 'readout-val text-neon-gold';
                }
            }
            document.querySelectorAll('.fan-mode-selector button').forEach(btn => {
                if (btn.getAttribute('data-fan') === purifier.fan) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        } else {
            if (purifierControls) purifierControls.classList.add('disabled-state');
            if (purifierIconBox) purifierIconBox.classList.remove('active');
            if (purifierAqiStatus) {
                purifierAqiStatus.textContent = 'OFF';
                purifierAqiStatus.className = 'readout-val text-neon-muted';
            }
        }

        // --- Coffee Maker ---
        const coffee = state.devices['kitchen-coffee'];
        const coffeeToggle = document.getElementById('widget-coffee-toggle');
        const coffeeControls = document.getElementById('widget-coffee-controls');
        const coffeeIconBox = document.getElementById('widget-coffee-icon-box');
        const brewWrapper = document.getElementById('brew-progress-wrapper');
        const brewPercentText = document.getElementById('brew-percent-text');
        const brewFillBar = document.getElementById('brew-progress-fill-bar');
        const brewStatusText = document.getElementById('brew-status-text');
        const recipeSelect = document.getElementById('coffee-recipe-select');

        if (coffeeToggle) coffeeToggle.checked = coffee.on;
        if (coffee.on) {
            if (coffeeControls) coffeeControls.classList.remove('disabled-state');
            if (coffeeIconBox) coffeeIconBox.classList.add('active');
            if (recipeSelect) recipeSelect.value = coffee.recipe;

            if (coffee.brewing) {
                if (brewWrapper) brewWrapper.style.display = 'block';
                if (brewPercentText) brewPercentText.textContent = `${Math.round(coffee.brewProgress)}%`;
                if (brewFillBar) brewFillBar.style.width = `${coffee.brewProgress}%`;
                if (brewStatusText) brewStatusText.textContent = `Brewing ${coffee.recipe.toUpperCase()}...`;
            } else {
                if (brewWrapper) brewWrapper.style.display = 'none';
            }
        } else {
            if (coffeeControls) coffeeControls.classList.add('disabled-state');
            if (coffeeIconBox) coffeeIconBox.classList.remove('active');
            if (brewWrapper) brewWrapper.style.display = 'none';
        }

        // --- Smart Refrigerator ---
        const fridge = state.devices['kitchen-fridge'];
        const fridgeTemp = document.getElementById('fridge-temp-val');
        const freezerTemp = document.getElementById('freezer-temp-val');
        const listContainer = document.getElementById('shopping-list-container');

        if (fridgeTemp) fridgeTemp.textContent = `${fridge.fridgeTemp.toFixed(1)}°C`;
        if (freezerTemp) freezerTemp.textContent = `${fridge.freezerTemp.toFixed(1)}°C`;

        if (listContainer) {
            if (fridge.items.length === 0) {
                listContainer.innerHTML = '<div class="empty-state" style="padding: 10px 0;">Shopping cart empty</div>';
            } else {
                listContainer.innerHTML = fridge.items.map(item => `
                    <div class="shopping-item">
                        <span>${item}</span>
                        <button class="btn-trash delete-shopping-btn" data-item="${item}">&times;</button>
                    </div>
                `).join('');

                listContainer.querySelectorAll('.delete-shopping-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const itemToDelete = btn.getAttribute('data-item');
                        fridge.items = fridge.items.filter(it => it !== itemToDelete);
                        syncDeviceUI();
                    });
                });
            }
        }

        // --- Garden Sprinklers ---
        const sprinkler = state.devices['backyard-sprinkler'];
        const sprinklerToggle = document.getElementById('widget-sprinkler-toggle');
        const sprinklerControls = document.getElementById('widget-sprinkler-controls');
        const sprinklerIconBox = document.getElementById('widget-sprinkler-icon-box');
        const sprinklerMoisture = document.getElementById('sprinkler-moisture-val');
        const sprinklerStatus = document.getElementById('sprinkler-status-lbl');

        if (sprinklerToggle) sprinklerToggle.checked = sprinkler.on;
        if (sprinklerIconBox) {
            if (sprinkler.on) {
                sprinklerIconBox.classList.add('active');
                if (sprinklerControls) sprinklerControls.classList.remove('disabled-state');
                if (sprinklerStatus) {
                    sprinklerStatus.textContent = 'ACTIVE';
                    sprinklerStatus.className = 'readout-val text-neon-teal';
                }
            } else {
                sprinklerIconBox.classList.remove('active');
                if (sprinklerStatus) {
                    sprinklerStatus.textContent = 'STANDBY';
                    sprinklerStatus.className = 'readout-val text-neon-muted';
                }
            }
        }
        if (sprinklerMoisture) sprinklerMoisture.textContent = `${Math.round(sprinkler.moisture)}%`;

        // --- 3f. Global stats updates ---
        updateOverallStats();
    }

    // Dynamic energy tally helper
    function updateOverallStats() {
        let load = 0.0; // in Watts
        let active = 0;
        
        for (const [key, dev] of Object.entries(state.devices)) {
            const isDeviceActive = dev.on || 
                                   (key === 'front-lock' && !dev.locked) || 
                                   (key === 'vacuum' && dev.status === 'cleaning') || 
                                   (key === 'kitchen-coffee' && dev.brewing) ||
                                   (key === 'kitchen-fridge');

            if (isDeviceActive) {
                if (key === 'living-light') {
                    load += (dev.brightness / 100) * dev.powerRate;
                } else if (key === 'bedroom-lamp') {
                    load += (dev.brightness / 100) * dev.powerRate;
                } else if (key === 'living-ac') {
                    load += dev.mode === 'eco' ? dev.powerRate * 0.5 : dev.powerRate;
                } else if (key === 'media-sound') {
                    load += (dev.volume / 100) * 30;
                } else if (key === 'kitchen-coffee') {
                    load += dev.brewing ? dev.powerRate : 5;
                } else if (dev.powerRate) {
                    load += dev.powerRate;
                }
                
                if (key !== 'front-lock' && key !== 'patio-flood' && key !== 'kitchen-fridge') {
                    active++;
                }
            }
        }
        
        load += 150; 
        
        const totalKW = (load / 1000).toFixed(2);
        document.getElementById('stat-power-val').textContent = `${totalKW} kW`;
        document.getElementById('stat-active-devices').textContent = `${active} / 11`;
        document.getElementById('stat-temp-val').textContent = `${state.devices['living-ac'].ambientTemp.toFixed(1)}°C`;
    }

    function formatMediaTime(sec) {
        const mins = Math.floor(sec / 60);
        const secs = Math.floor(sec % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // ----------------------------------------------------------------------
    // 4. Custom Thermostat Dial Rotator Engine (Circular SVG slider)
    // ----------------------------------------------------------------------
    const dialRing = document.getElementById('dial-value-ring');
    const dialKnob = document.getElementById('dial-rotator-knob');
    const thermoControls = document.getElementById('widget-thermostat-controls');

    function syncThermostatDial() {
        if (!dialRing || !dialKnob) return;
        const ac = state.devices['living-ac'];
        
        // Map temp (16 - 30) to dashoffset of standard circular stroke
        // Circle circumference is 2 * PI * r = 2 * 3.14159 * 80 ≈ 502
        // We only use 270 degrees of the circle (3/4 of 502 = 376 max progress stroke)
        const minTemp = 16;
        const maxTemp = 30;
        const pct = (ac.targetTemp - minTemp) / (maxTemp - minTemp);
        
        const totalCircumference = 502;
        const activeSpan = 376; 
        const offset = totalCircumference - (pct * activeSpan);
        
        dialRing.style.strokeDashoffset = offset;
        
        // Coordinate placement for indicator knob (135 degrees offset start, sweeps to 405)
        const angleDegrees = -135 + (pct * 270);
        const angleRadians = (angleDegrees * Math.PI) / 180;
        
        const cx = 100 + 80 * Math.cos(angleRadians);
        const cy = 100 + 80 * Math.sin(angleRadians);
        
        dialKnob.setAttribute('cx', cx);
        dialKnob.setAttribute('cy', cy);
    }

    // Handle dial rotations drag events
    let isDraggingDial = false;
    
    if (dialKnob) {
        const handleDialStart = (e) => {
            if (state.devices['living-ac'].on) {
                isDraggingDial = true;
                e.preventDefault();
            }
        };

        dialKnob.addEventListener('mousedown', handleDialStart);
        dialKnob.addEventListener('touchstart', handleDialStart, { passive: false });

        const handleDialMove = (e) => {
            if (!isDraggingDial) return;
            e.preventDefault();
            
            const rect = document.querySelector('.thermostat-svg').getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            // Calculate angle from center of SVG in degrees
            let angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
            
            // Map degrees (-180 to 180) to normal clockwise space starting at -135 degrees (minimum temp)
            // Sweep range is -135 degrees to +135 degrees
            if (angle < -135) angle += 360;
            if (angle > 135) {
                // Snap to boundaries
                angle = angle > 180 - 45 ? -135 : 135;
            }
            
            // Percent progress
            const pct = (angle + 135) / 270;
            const minTemp = 16;
            const maxTemp = 30;
            const target = Math.round(minTemp + pct * (maxTemp - minTemp));
            
            if (target >= minTemp && target <= maxTemp && state.devices['living-ac'].targetTemp !== target) {
                state.devices['living-ac'].targetTemp = target;
                syncDeviceUI();
            }
        };

        window.addEventListener('mousemove', handleDialMove);
        window.addEventListener('touchmove', handleDialMove, { passive: false });

        const handleDialEnd = () => {
            isDraggingDial = false;
        };
        window.addEventListener('mouseup', handleDialEnd);
        window.addEventListener('touchend', handleDialEnd);
    }

    // ----------------------------------------------------------------------
    // 5. Smart Lock Slide gesture track controller
    // ----------------------------------------------------------------------
    const slideBtn = document.getElementById('slide-to-unlock-btn');
    const slideTrack = document.getElementById('slide-to-unlock-track');
    let isDraggingLock = false;
    let startX = 0;
    let trackWidth = 0;
    let btnWidth = 0;

    if (slideBtn && slideTrack) {
        const handleLockStart = (e) => {
            isDraggingLock = true;
            startX = e.touches ? e.touches[0].clientX : e.clientX;
            trackWidth = slideTrack.offsetWidth;
            btnWidth = slideBtn.offsetWidth;
            slideBtn.style.transition = 'none';
            e.preventDefault();
        };

        slideBtn.addEventListener('mousedown', handleLockStart);
        slideBtn.addEventListener('touchstart', handleLockStart, { passive: false });

        const handleLockMove = (e) => {
            if (!isDraggingLock) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let deltaX = clientX - startX;
            const maxSlide = trackWidth - btnWidth - 8; // padding margin
            
            if (state.devices['front-lock'].locked) {
                // Sliding right to unlock
                if (deltaX < 0) deltaX = 0;
                if (deltaX > maxSlide) deltaX = maxSlide;
                slideBtn.style.left = `${deltaX + 4}px`;
            } else {
                // Sliding left to lock
                let currentPos = maxSlide + deltaX;
                if (currentPos < 0) currentPos = 0;
                if (currentPos > maxSlide) currentPos = maxSlide;
                slideBtn.style.left = `${currentPos + 4}px`;
            }
        };

        window.addEventListener('mousemove', handleLockMove);
        window.addEventListener('touchmove', handleLockMove, { passive: false });

        const handleLockEnd = (e) => {
            if (!isDraggingLock) return;
            isDraggingLock = false;
            slideBtn.style.transition = 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            
            const maxSlide = trackWidth - btnWidth - 8;
            const currentLeft = parseFloat(slideBtn.style.left) - 4;
            
            if (state.devices['front-lock'].locked) {
                if (currentLeft > maxSlide * 0.75) {
                    // Successful Unlock
                    state.devices['front-lock'].locked = false;
                    addNotification('Security Alert', 'Front Door has been manually UNLOCKED.', 'pink');
                    addSecurityLog('Lock Status', 'Unlocked - Front Entrance Exposed', 'log-alert');
                } else {
                    slideBtn.style.left = "4px";
                }
            } else {
                if (currentLeft < maxSlide * 0.25) {
                    // Successful Lock
                    state.devices['front-lock'].locked = true;
                    addNotification('Security Hub', 'Front Door is now SECURE.', 'teal');
                    addSecurityLog('Lock Status', 'Locked - Securely Armed', 'log-success');
                } else {
                    slideBtn.style.left = `${maxSlide + 4}px`;
                }
            }
            syncDeviceUI();
        };

        window.addEventListener('mouseup', handleLockEnd);
        window.addEventListener('touchend', handleLockEnd);
        
        // Tap shield to lock/unlock quickly as backup
        const lockShield = document.getElementById('lock-shield-indicator');
        if (lockShield) {
            lockShield.addEventListener('click', () => {
                state.devices['front-lock'].locked = !state.devices['front-lock'].locked;
                if (state.devices['front-lock'].locked) {
                    addNotification('Security Hub', 'Front Door is now SECURE.', 'teal');
                    addSecurityLog('Lock Status', 'Locked - Securely Armed', 'log-success');
                } else {
                    addNotification('Security Alert', 'Front Door has been UNLOCKED.', 'pink');
                    addSecurityLog('Lock Status', 'Unlocked - Front Entrance Exposed', 'log-alert');
                }
                syncDeviceUI();
            });
        }
    }

    // ----------------------------------------------------------------------
    // 6. Custom Premium Music Actions
    // ----------------------------------------------------------------------
    const timelineProgress = document.getElementById('music-timeline-progress');
    let timelineTimerId = null;

    function playTrack() {
        const sound = state.devices['media-sound'];
        sound.playing = true;
        syncDeviceUI();
        
        // Play timeline tick
        clearInterval(timelineTimerId);
        timelineTimerId = setInterval(() => {
            if (sound.playing && sound.on) {
                sound.progress++;
                const track = playlist[sound.trackIndex];
                if (sound.progress >= track.duration) {
                    // Next track
                    sound.progress = 0;
                    sound.trackIndex = (sound.trackIndex + 1) % playlist.length;
                    addNotification('Music Node', `Now playing: ${playlist[sound.trackIndex].title}`, 'cyan');
                }
                syncDeviceUI();
            }
        }, 1000);
    }

    function pauseTrack() {
        const sound = state.devices['media-sound'];
        sound.playing = false;
        clearInterval(timelineTimerId);
        syncDeviceUI();
    }

    const btnPlay = document.getElementById('btn-track-play');
    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            const sound = state.devices['media-sound'];
            if (sound.playing) {
                pauseTrack();
            } else {
                playTrack();
            }
        });
    }

    const btnPrev = document.getElementById('btn-track-prev');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            const sound = state.devices['media-sound'];
            sound.progress = 0;
            sound.trackIndex = (sound.trackIndex - 1 + playlist.length) % playlist.length;
            syncDeviceUI();
        });
    }

    const btnNext = document.getElementById('btn-track-next');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const sound = state.devices['media-sound'];
            sound.progress = 0;
            sound.trackIndex = (sound.trackIndex + 1) % playlist.length;
            syncDeviceUI();
        });
    }

    if (timelineProgress) {
        timelineProgress.addEventListener('input', (e) => {
            state.devices['media-sound'].progress = parseInt(e.target.value);
            syncDeviceUI();
        });
    }

    // ----------------------------------------------------------------------
    // 7. Security Cameras Procedural Rendering Engine
    // ----------------------------------------------------------------------
    function initCanvasFeeds() {
        const miniCanvas = document.getElementById('miniCameraFeed');
        const largeCanvas = document.getElementById('largeCameraFeed');
        
        if (miniCanvas) miniCamContext = miniCanvas.getContext('2d');
        if (largeCanvas) largeCamContext = largeCanvas.getContext('2d');
        
        // Cancel existing loops
        if (miniCamAnimationId) cancelAnimationFrame(miniCamAnimationId);
        if (largeCamAnimationId) cancelAnimationFrame(largeCamAnimationId);
        
        // Start loops
        if (miniCamContext) {
            miniCanvas.width = miniCanvas.parentElement.clientWidth;
            miniCanvas.height = 160;
            renderCam(miniCamContext, 'cam-driveway', true);
        }
        if (largeCamContext) {
            largeCanvas.width = largeCanvas.parentElement.clientWidth;
            largeCanvas.height = 340;
            renderCam(largeCamContext, state.activeCamId, false);
        }
    }

    let panAngle = 0;
    let noiseSeed = 0;

    function renderCam(ctx, camId, isMini) {
        const canvas = ctx.canvas;
        const w = canvas.width;
        const h = canvas.height;
        
        // Resize check
        if (canvas.clientWidth !== w) {
            canvas.width = canvas.clientWidth;
        }

        // Draw camera void
        ctx.fillStyle = '#0a0918';
        ctx.fillRect(0, 0, w, h);
        
        // Draw grid overlay
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.05)';
        ctx.lineWidth = 1;
        const gridSize = isMini ? 20 : 40;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Draw simulated CCTV scene geometry
        ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;

        panAngle += 0.005;
        const sweepX = Math.sin(panAngle) * (w * 0.1);
        
        ctx.save();
        ctx.translate(w/2 + sweepX, h/2);

        if (camId === 'cam-driveway') {
            // Draw driveway outline (perspective trapezoid)
            ctx.beginPath();
            ctx.moveTo(-w*0.3, h*0.4);
            ctx.lineTo(-w*0.1, -h*0.2);
            ctx.lineTo(w*0.1, -h*0.2);
            ctx.lineTo(w*0.3, h*0.4);
            ctx.closePath();
            ctx.stroke();
            
            // Draw driveway columns
            ctx.fillStyle = '#171431';
            ctx.fillRect(-w*0.35, -h*0.3, w*0.06, h*0.7);
            ctx.fillRect(w*0.29, -h*0.3, w*0.06, h*0.7);
            
            // Simulated car shape
            ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
            ctx.fillRect(-w*0.08, 0, w*0.16, h*0.2);
            ctx.strokeRect(-w*0.08, 0, w*0.16, h*0.2);
            
            // Bounding indicators
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
            ctx.strokeRect(-w*0.09, -5, w*0.18, h*0.25);
            ctx.fillStyle = 'rgba(0, 242, 254, 0.8)';
            ctx.font = '9px monospace';
            ctx.fillText("OBJECT: SUV", -w*0.08, -10);
            
        } else if (camId === 'cam-backyard') {
            // Patio deck & pool
            ctx.beginPath();
            ctx.ellipse(0, h*0.1, w*0.25, h*0.15, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 235, 215, 0.05)';
            ctx.fill();
            
            // Pool chairs
            ctx.strokeRect(-w*0.2, -h*0.1, 20, 15);
            ctx.strokeRect(-w*0.15, -h*0.1, 20, 15);
            
            if (state.devices['patio-flood'].motion) {
                // Dynamic motion circle tracker bounds
                ctx.strokeStyle = 'var(--neon-pink)';
                ctx.beginPath();
                ctx.arc(w*0.1, -h*0.15, 25, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = 'rgba(255, 0, 127, 0.15)';
                ctx.fill();
                ctx.fillStyle = 'var(--neon-pink)';
                ctx.font = '9px monospace';
                ctx.fillText("WARN: MOTION", w*0.1 - 25, -h*0.15 - 30);
            }
        } else {
            // CAM_03 Living Room (Hallway)
            ctx.strokeRect(-w*0.25, -h*0.3, w*0.5, h*0.6);
            ctx.strokeRect(-w*0.15, -h*0.3, w*0.3, h*0.5);
            // Sofa outline
            ctx.fillStyle = 'rgba(255,255,255,0.02)';
            ctx.fillRect(-w*0.2, h*0.05, w*0.4, h*0.15);
            ctx.strokeRect(-w*0.2, h*0.05, w*0.4, h*0.15);
        }
        
        ctx.restore();

        // Scanlines
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
        for (let i = 0; i < h; i += 4) {
            ctx.fillRect(0, i, w, 1.5);
        }

        // Sweeping beam scanner line
        const sweepY = (Date.now() / 15) % (h * 2.5) - h;
        if (sweepY >= 0 && sweepY < h) {
            const grad = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY);
            grad.addColorStop(0, 'rgba(0, 242, 254, 0)');
            grad.addColorStop(1, 'rgba(0, 242, 254, 0.12)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, sweepY - 40, w, 40);
            ctx.fillStyle = 'rgba(0, 242, 254, 0.6)';
            ctx.fillRect(0, sweepY, w, 1);
        }

        // Camera Noise / Static interference
        noiseSeed = (noiseSeed + 1) % 5;
        if (noiseSeed === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            for (let i = 0; i < 20; i++) {
                const nx = Math.random() * w;
                const ny = Math.random() * h;
                ctx.fillRect(nx, ny, Math.random() * 4 + 1, 1);
            }
        }

        // Border corners overlay bounds
        ctx.strokeStyle = camId === 'cam-backyard' && state.devices['patio-flood'].motion ? 'var(--neon-pink)' : 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        const cornerSize = isMini ? 10 : 20;
        
        // Top Left
        ctx.beginPath(); ctx.moveTo(cornerSize, 5); ctx.lineTo(5, 5); ctx.lineTo(5, cornerSize); ctx.stroke();
        // Top Right
        ctx.beginPath(); ctx.moveTo(w - cornerSize, 5); ctx.lineTo(w - 5, 5); ctx.lineTo(w - 5, cornerSize); ctx.stroke();
        // Bottom Left
        ctx.beginPath(); ctx.moveTo(cornerSize, h - 5); ctx.lineTo(5, h - 5); ctx.lineTo(5, h - cornerSize); ctx.stroke();
        // Bottom Right
        ctx.beginPath(); ctx.moveTo(w - cornerSize, h - 5); ctx.lineTo(w - 5, h - 5); ctx.lineTo(w - 5, h - cornerSize); ctx.stroke();

        if (isMini) {
            miniCamAnimationId = requestAnimationFrame(() => renderCam(ctx, camId, isMini));
        } else {
            largeCamAnimationId = requestAnimationFrame(() => renderCam(ctx, camId, isMini));
        }
    }

    // Camera pills selector clicks
    document.querySelectorAll('.cam-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.cam-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            const cam = pill.getAttribute('data-cam');
            state.activeCamId = cam;
            
            const titles = {
                'cam-driveway': 'CAM_01 // DRIVEWAY ENTRY',
                'cam-backyard': 'CAM_02 // BACKYARD PATIO',
                'cam-hallway': 'CAM_03 // HALLWAY FOYER'
            };
            
            document.getElementById('large-cam-title').textContent = titles[cam];
            initCanvasFeeds();
        });
    });

    // ----------------------------------------------------------------------
    // 8. Background Simulation Engine Loop (Ticks updates)
    // ----------------------------------------------------------------------
    function runSimulationTick() {
        if (!state.simulationEnabled) return;

        const ac = state.devices['living-ac'];
        const light = state.devices['living-light'];
        const flood = state.devices['patio-flood'];
        const vacuum = state.devices['vacuum'];

        // --- 8a. Thermostat ambient temperature flow ---
        const outdoorTemp = 22.5; 
        if (ac.on) {
            const pullStrength = ac.mode === 'eco' ? 0.08 : 0.16;
            const diff = ac.targetTemp - ac.ambientTemp;
            ac.ambientTemp += diff * pullStrength;
        } else {
            const leakStrength = 0.02;
            const diff = outdoorTemp - ac.ambientTemp;
            ac.ambientTemp += diff * leakStrength;
        }

        // --- 8b. Robo-Vacuum movement path coordinates ---
        if (vacuum.status === 'cleaning') {
            vacuum.battery -= 1.5;
            const angle = Math.random() * Math.PI * 2;
            const step = 8;
            vacuum.x += Math.cos(angle) * step;
            vacuum.y += Math.sin(angle) * step;
            
            if (vacuum.x < 10) vacuum.x = 10;
            if (vacuum.x > 90) vacuum.x = 90;
            if (vacuum.y < 10) vacuum.y = 10;
            if (vacuum.y > 90) vacuum.y = 90;

            const vacuumPointer = document.getElementById('vacuum-pointer');
            if (vacuumPointer) {
                vacuumPointer.style.left = `${vacuum.x}%`;
                vacuumPointer.style.top = `${vacuum.y}%`;
            }

            if (vacuum.battery <= 15) {
                vacuum.status = 'returning';
                addNotification('Robo-Vacuum', 'Battery low (<15%). Auto docking...', 'purple');
            }
        } else if (vacuum.status === 'returning') {
            const dx = 50 - vacuum.x;
            const dy = 50 - vacuum.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 4) {
                vacuum.status = 'charging';
                vacuum.x = 50;
                vacuum.y = 50;
                addNotification('Robo-Vacuum', 'Vacuum successfully docked and charging.', 'teal');
            } else {
                vacuum.x += (dx / dist) * 6;
                vacuum.y += (dy / dist) * 6;
            }

            const vacuumPointer = document.getElementById('vacuum-pointer');
            if (vacuumPointer) {
                vacuumPointer.style.left = `${vacuum.x}%`;
                vacuumPointer.style.top = `${vacuum.y}%`;
            }
        } else if (vacuum.status === 'charging') {
            if (vacuum.battery < 100) {
                vacuum.battery = Math.min(100, vacuum.battery + 2);
            }
        }
        
        const vacStatusLabel = document.getElementById('mini-vacuum-status');
        if (vacStatusLabel) {
            vacStatusLabel.textContent = `${vacuum.status.toUpperCase()} • ${Math.round(vacuum.battery)}%`;
            vacStatusLabel.className = vacuum.status === 'cleaning' ? 'status-text text-neon-cyan' : 'status-text text-neon-teal';
        }

        // --- Coffee Brewing simulation ---
        const coffee = state.devices['kitchen-coffee'];
        if (coffee.on && coffee.brewing) {
            coffee.brewProgress += 20; 
            if (coffee.brewProgress >= 100) {
                coffee.brewing = false;
                coffee.brewProgress = 0;
                addNotification('Coffee Maker', `Your ${coffee.recipe.toUpperCase()} is ready! ☕`, 'teal');
                addSecurityLog('Kitchen Hub', `Espresso brew cycle completed: [${coffee.recipe}]`, 'log-success');
            }
        }

        // --- Air Purifier PM2.5 simulation ---
        const purifier = state.devices['bedroom-purifier'];
        if (purifier.on) {
            const pullVal = purifier.fan === 'high' ? 4 : purifier.fan === 'med' ? 6 : 9;
            purifier.pm25 += (pullVal - purifier.pm25) * 0.2;
        } else {
            purifier.pm25 += (32 - purifier.pm25) * 0.05;
        }

        // --- Sprinkler Soil Moisture simulation ---
        const sprinkler = state.devices['backyard-sprinkler'];
        if (sprinkler.on) {
            sprinkler.moisture = Math.min(100, sprinkler.moisture + 4);
        } else {
            sprinkler.moisture = Math.max(20, sprinkler.moisture - 0.2);
        }

        // --- 8c. Random Security Alerts Trigger ---
        if (Math.random() < 0.08) {
            triggerProceduralAlert();
        }

        // --- 8d. Run Compiled Automation Rules Loops ---
        evaluateAutomationRules();

        // --- 8e. Append power metrics to database log history ---
        let load = 0.0;
        for (const [key, dev] of Object.entries(state.devices)) {
            const isDeviceActive = dev.on || 
                                   (key === 'front-lock' && !dev.locked) || 
                                   (key === 'vacuum' && dev.status === 'cleaning') || 
                                   (key === 'kitchen-coffee' && dev.brewing) ||
                                   (key === 'kitchen-fridge');

            if (isDeviceActive) {
                if (key === 'living-light') {
                    load += (dev.brightness / 100) * dev.powerRate;
                } else if (key === 'bedroom-lamp') {
                    load += (dev.brightness / 100) * dev.powerRate;
                } else if (key === 'living-ac') {
                    load += dev.mode === 'eco' ? dev.powerRate * 0.5 : dev.powerRate;
                } else if (key === 'media-sound') {
                    load += (dev.volume / 100) * 30;
                } else if (key === 'kitchen-coffee') {
                    load += dev.brewing ? dev.powerRate : 5;
                } else if (dev.powerRate) {
                    load += dev.powerRate;
                }
            }
        }
        load += 150; 
        
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        state.historyPower.push(parseFloat((load / 1000).toFixed(2)));
        state.historyLabels.push(timeNow);
        
        if (state.historyPower.length > 10) {
            state.historyPower.shift();
            state.historyLabels.shift();
        }

        updateChartsData();
        syncDeviceUI();
    }

    function triggerProceduralAlert() {
        const flood = state.devices['patio-flood'];
        
        // Randomly simulate motion in Backyard
        flood.motion = true;
        flood.lux = Math.round(10 + Math.random() * 40); // Dark outside
        
        addSecurityLog('Driveway Cam', 'Motion detected near Backyard Patio', 'log-alert');
        addNotification('Intrusion Warning', 'Motion detected: CAM_02 Backyard Patio.', 'pink');
        
        // Flash floodlight icon alarm state
        const floodWidgetBox = document.getElementById('widget-floodlight-icon-box');
        if (floodWidgetBox) {
            floodWidgetBox.classList.add('alarm-state');
        }

        // Reset alarm after 8 seconds
        setTimeout(() => {
            flood.motion = false;
            flood.lux = 110;
            if (floodWidgetBox) floodWidgetBox.classList.remove('alarm-state');
            syncDeviceUI();
        }, 8000);
    }

    function evaluateAutomationRules() {
        state.automations.forEach(rule => {
            if (!rule.active) return;
            
            let evaluatedTrue = false;
            
            // 1. Evaluate Trigger Conditions
            if (rule.triggerDevice === 'temp-sensor') {
                const val = state.devices['living-ac'].ambientTemp;
                const limit = parseFloat(rule.triggerValue);
                if (rule.triggerCondition === 'gt' && val > limit) evaluatedTrue = true;
                if (rule.triggerCondition === 'lt' && val < limit) evaluatedTrue = true;
            } else if (rule.triggerDevice === 'door-lock') {
                const isLocked = state.devices['front-lock'].locked;
                const matchVal = rule.triggerValue.toLowerCase();
                if (rule.triggerCondition === 'eq') {
                    if (matchVal === 'unlocked' && !isLocked) evaluatedTrue = true;
                    if (matchVal === 'locked' && isLocked) evaluatedTrue = true;
                }
            } else if (rule.triggerDevice === 'motion-sensor') {
                const motionActive = state.devices['patio-flood'].motion;
                if (rule.triggerCondition === 'eq' && motionActive) evaluatedTrue = true;
            }

            // 2. Perform Target Action if true
            if (evaluatedTrue) {
                const target = state.devices[rule.actionDevice];
                let actionTriggered = false;

                if (rule.actionState === 'turn-on' && !target.on) {
                    target.on = true;
                    actionTriggered = true;
                } else if (rule.actionState === 'turn-off' && target.on) {
                    target.on = false;
                    actionTriggered = true;
                } else if (rule.actionState === 'dim-50' && target.brightness !== 50) {
                    target.on = true;
                    target.brightness = 50;
                    actionTriggered = true;
                } else if (rule.actionState === 'set-cool' && (target.targetTemp !== 20 || target.mode !== 'cool')) {
                    target.on = true;
                    target.targetTemp = 20;
                    target.mode = 'cool';
                    actionTriggered = true;
                } else if (rule.actionState === 'lock' && !target.locked) {
                    target.locked = true;
                    actionTriggered = true;
                }

                if (actionTriggered) {
                    addNotification('Ecosystem Automation', `Trigger Executed: ${target.name} adjusted automatically.`, 'purple');
                    addSecurityLog('Automation System', `Rule Executed: [${rule.label.substring(0, 16)}...] triggered target state.`, 'log-info');
                    syncDeviceUI();
                }
            }
        });
    }

    // Toggle simulation setting speed
    function restartSimulationInterval() {
        clearInterval(simTimerId);
        if (state.simulationEnabled) {
            simTimerId = setInterval(runSimulationTick, state.simulationSpeed);
        }
    }

    // ----------------------------------------------------------------------
    // 9. Floating Toast Notification Engine
    // ----------------------------------------------------------------------
    function addNotification(title, text, colorCode = 'cyan') {
        const hub = document.getElementById('toast-notification-hub');
        if (!hub) return;

        const toast = document.createElement('div');
        toast.className = 'toast-message';
        
        let iconClass = 'fa-info';
        if (colorCode === 'pink') iconClass = 'fa-triangle-exclamation';
        if (colorCode === 'teal') iconClass = 'fa-shield-halved';
        if (colorCode === 'purple') iconClass = 'fa-gears';

        toast.innerHTML = `
            <div class="toast-icon ${colorCode}"><i class="fa-solid ${iconClass}"></i></div>
            <div class="toast-content">
                <span class="toast-title">${title}</span>
                <span class="toast-body">${text}</span>
            </div>
            <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
        `;

        hub.appendChild(toast);

        // Play float toast audio sound tone (procedural beep using Audio API!)
        playBeepTone(colorCode === 'pink' ? 220 : 440);

        // Bind delete action
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            dismissToast(toast);
        });

        // Add to header list
        state.notifications.unshift({
            id: Date.now(),
            title,
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            color: colorCode
        });
        
        updateNotificationsDropdown();

        // Auto dismiss
        setTimeout(() => {
            dismissToast(toast);
        }, 6000);
    }

    function dismissToast(toast) {
        if (!toast.parentElement) return;
        toast.classList.add('dismiss');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 300);
    }

    // Procedural synthesised beep using Web Audio API so it works beautifully!
    function playBeepTone(freq = 440) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime); // Low volume profile
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
            
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.15);
        } catch (e) {
            // Audio context disabled by autoplay blocker policies
        }
    }

    function updateNotificationsDropdown() {
        const countBadge = document.getElementById('notification-count');
        const listContainer = document.getElementById('notification-list');
        
        if (countBadge) {
            countBadge.textContent = state.notifications.length;
            countBadge.style.display = state.notifications.length === 0 ? 'none' : 'flex';
        }
        
        if (listContainer) {
            if (state.notifications.length === 0) {
                listContainer.innerHTML = '<div class="empty-state">No recent activities.</div>';
                return;
            }
            
            listContainer.innerHTML = state.notifications.map(notif => `
                <div class="log-entry log-${notif.color === 'pink' ? 'alert' : notif.color === 'teal' ? 'success' : 'info'}">
                    <span class="log-time">${notif.time}</span>
                    <div class="log-msg"><strong>${notif.title}</strong>: ${notif.text}</div>
                </div>
            `).join('');
        }
    }

    // Clear notifications click
    const clearBtn = document.getElementById('clear-notifications-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.notifications = [];
            updateNotificationsDropdown();
        });
    }

    // Toggle bell visibility
    const bellTrigger = document.getElementById('notification-trigger');
    const bellDropdown = document.getElementById('notification-dropdown');
    
    if (bellTrigger && bellDropdown) {
        bellTrigger.addEventListener('click', (e) => {
            if (e.target.closest('#notification-dropdown') === null) {
                bellDropdown.classList.toggle('active');
                e.stopPropagation();
            }
        });
        
        window.addEventListener('click', () => {
            bellDropdown.classList.remove('active');
        });
    }

    // Security logs builder
    function addSecurityLog(source, msg, typeClass = 'log-info') {
        const container = document.getElementById('security-log-list');
        if (!container) return;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry = document.createElement('div');
        entry.className = `log-entry ${typeClass}`;
        entry.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-msg"><strong>${source}</strong>: ${msg}</span>
        `;
        container.insertBefore(entry, container.firstChild);
        
        // Caps rules
        if (container.children.length > 25) {
            container.lastChild.remove();
        }
    }

    // ----------------------------------------------------------------------
    // 10. Dashboard Scene Selectors (Ambient control)
    // ----------------------------------------------------------------------
    const sceneArrive = document.getElementById('scene-arrive');
    const sceneMovie = document.getElementById('scene-movie');
    const sceneSleep = document.getElementById('scene-sleep');
    const sceneAway = document.getElementById('scene-away');

    function applyAmbientScene(sceneName) {
        state.scenes = sceneName;
        
        // Remove active class
        document.querySelectorAll('.scene-card').forEach(sc => sc.classList.remove('active'));
        const activeCard = document.getElementById(`scene-${sceneName}`);
        if (activeCard) activeCard.classList.add('active');

        const light = state.devices['living-light'];
        const ac = state.devices['living-ac'];
        const lock = state.devices['front-lock'];
        const sound = state.devices['media-sound'];
        const vacuum = state.devices['vacuum'];

        if (sceneName === 'arrive') {
            light.on = true; light.brightness = 85; light.color = '#ffb366'; // Warm Glow
            ac.on = true; ac.targetTemp = 21; ac.mode = 'cool';
            lock.locked = true;
            sound.on = true; sound.playing = true; sound.volume = 40;
            addNotification('Scene Mode Activated', 'Welcome home: lights set warm, lock secured.', 'teal');
            addSecurityLog('Scenes Controller', 'Arrive Home Activated', 'log-success');
            playTrack();
        } else if (sceneName === 'movie') {
            light.on = true; light.brightness = 25; light.color = '#a18cd1'; // Deep Violet Glow
            ac.on = true; ac.targetTemp = 20; ac.mode = 'cool';
            lock.locked = true;
            sound.on = true; sound.playing = true; sound.volume = 65;
            addNotification('Scene Mode Activated', 'Movie Night: deep dim lighting active.', 'purple');
            addSecurityLog('Scenes Controller', 'Movie Night Activated', 'log-info');
            playTrack();
        } else if (sceneName === 'sleep') {
            light.on = false;
            ac.on = true; ac.targetTemp = 23; ac.mode = 'eco';
            lock.locked = true;
            sound.on = false; sound.playing = false;
            addNotification('Scene Mode Activated', 'Deep Sleep: lights turned off, eco mode active.', 'teal');
            addSecurityLog('Scenes Controller', 'Deep Sleep Activated', 'log-success');
            pauseTrack();
        } else if (sceneName === 'away') {
            light.on = false;
            ac.on = false;
            lock.locked = true;
            sound.on = false; sound.playing = false;
            vacuum.status = 'cleaning';
            addNotification('Scene Mode Activated', 'Away Mode: devices off, robo-vacuum started cleaning.', 'purple');
            addSecurityLog('Scenes Controller', 'Away Mode Activated - Secured', 'log-alert');
            pauseTrack();
        }

        syncDeviceUI();
    }

    if (sceneArrive) sceneArrive.addEventListener('click', () => applyAmbientScene('arrive'));
    if (sceneMovie) sceneMovie.addEventListener('click', () => applyAmbientScene('movie'));
    if (sceneSleep) sceneSleep.addEventListener('click', () => applyAmbientScene('sleep'));
    if (sceneAway) sceneAway.addEventListener('click', () => applyAmbientScene('away'));

    // ----------------------------------------------------------------------
    // 11. Widget Inputs & Control Binds
    // ----------------------------------------------------------------------
    
    // Light Toggles
    const wlToggle = document.getElementById('widget-light-toggle');
    if (wlToggle) {
        wlToggle.addEventListener('change', (e) => {
            state.devices['living-light'].on = e.target.checked;
            syncDeviceUI();
        });
    }
    const oLightToggle = document.getElementById('toggle-living-light');
    if (oLightToggle) {
        oLightToggle.addEventListener('change', (e) => {
            state.devices['living-light'].on = e.target.checked;
            syncDeviceUI();
        });
    }

    // Light Brightness
    const wlBrightness = document.getElementById('widget-light-brightness');
    if (wlBrightness) {
        wlBrightness.addEventListener('input', (e) => {
            state.devices['living-light'].brightness = parseInt(e.target.value);
            syncDeviceUI();
        });
    }

    // Light presets
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            if (state.devices['living-light'].on) {
                const hex = dot.getAttribute('data-color');
                state.devices['living-light'].color = hex;
                syncDeviceUI();
            }
        });
    });

    const customColorTrigger = document.getElementById('light-color-input');
    if (customColorTrigger) {
        customColorTrigger.addEventListener('input', (e) => {
            if (state.devices['living-light'].on) {
                state.devices['living-light'].color = e.target.value;
                syncDeviceUI();
            }
        });
    }

    // Thermostat Toggle
    const wtToggle = document.getElementById('widget-thermostat-toggle');
    if (wtToggle) {
        wtToggle.addEventListener('change', (e) => {
            state.devices['living-ac'].on = e.target.checked;
            syncDeviceUI();
        });
    }
    const oAcToggle = document.getElementById('toggle-living-ac');
    if (oAcToggle) {
        oAcToggle.addEventListener('change', (e) => {
            state.devices['living-ac'].on = e.target.checked;
            syncDeviceUI();
        });
    }

    // Thermostat modes selection
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.devices['living-ac'].on) {
                state.devices['living-ac'].mode = btn.getAttribute('data-mode');
                syncDeviceUI();
            }
        });
    });

    // Sound Speaker Toggle
    const wmToggle = document.getElementById('widget-music-toggle');
    if (wmToggle) {
        wmToggle.addEventListener('change', (e) => {
            state.devices['media-sound'].on = e.target.checked;
            if (!e.target.checked) {
                pauseTrack();
            } else {
                playTrack();
            }
        });
    }
    const oSoundToggle = document.getElementById('toggle-media-sound');
    if (oSoundToggle) {
        oSoundToggle.addEventListener('change', (e) => {
            state.devices['media-sound'].on = e.target.checked;
            if (!e.target.checked) {
                pauseTrack();
            } else {
                playTrack();
            }
        });
    }

    // Speaker volume
    const wmVolume = document.getElementById('widget-music-volume');
    if (wmVolume) {
        wmVolume.addEventListener('input', (e) => {
            state.devices['media-sound'].volume = parseInt(e.target.value);
            syncDeviceUI();
        });
    }

    // Vacuum Clean
    const btnVacClean = document.getElementById('btn-vacuum-start');
    if (btnVacClean) {
        btnVacClean.addEventListener('click', () => {
            state.devices['vacuum'].status = 'cleaning';
            addNotification('Robo-Vacuum', 'Cleaning path started automatically.', 'cyan');
            syncDeviceUI();
        });
    }

    // Vacuum Dock
    const btnVacDock = document.getElementById('btn-vacuum-dock');
    if (btnVacDock) {
        btnVacDock.addEventListener('click', () => {
            state.devices['vacuum'].status = 'returning';
            addNotification('Robo-Vacuum', 'Returning to home charge dock...', 'purple');
            syncDeviceUI();
        });
    }

    // Backyard light toggle
    const wlFloodlight = document.getElementById('widget-floodlight-toggle');
    if (wlFloodlight) {
        wlFloodlight.addEventListener('change', (e) => {
            state.devices['patio-flood'].on = e.target.checked;
            syncDeviceUI();
        });
    }

    // Bedroom Blinds controls
    const blindsToggle = document.getElementById('widget-blinds-toggle');
    if (blindsToggle) {
        blindsToggle.addEventListener('change', (e) => {
            state.devices['bedroom-blinds'].on = e.target.checked;
            syncDeviceUI();
        });
    }

    const blindsPosSlider = document.getElementById('widget-blinds-position');
    if (blindsPosSlider) {
        blindsPosSlider.addEventListener('input', (e) => {
            state.devices['bedroom-blinds'].position = parseInt(e.target.value);
            syncDeviceUI();
        });
    }

    // Bedroom Bedside Lamp controls
    const lampToggle = document.getElementById('widget-lamp-toggle');
    if (lampToggle) {
        lampToggle.addEventListener('change', (e) => {
            state.devices['bedroom-lamp'].on = e.target.checked;
            syncDeviceUI();
        });
    }

    const lampBrightSlider = document.getElementById('widget-lamp-brightness');
    if (lampBrightSlider) {
        lampBrightSlider.addEventListener('input', (e) => {
            state.devices['bedroom-lamp'].brightness = parseInt(e.target.value);
            syncDeviceUI();
        });
    }

    // Bedroom Bedside Lamp scene preset color dots clicks
    const lampCard = document.querySelector('[data-room="bedroom"] .color-palette-presets');
    if (lampCard) {
        lampCard.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                if (state.devices['bedroom-lamp'].on) {
                    state.devices['bedroom-lamp'].color = dot.getAttribute('data-color');
                    syncDeviceUI();
                }
            });
        });
    }

    // Bedroom Air Purifier controls
    const purifierToggle = document.getElementById('widget-purifier-toggle');
    if (purifierToggle) {
        purifierToggle.addEventListener('change', (e) => {
            state.devices['bedroom-purifier'].on = e.target.checked;
            syncDeviceUI();
        });
    }

    document.querySelectorAll('.fan-mode-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.devices['bedroom-purifier'].on) {
                state.devices['bedroom-purifier'].fan = btn.getAttribute('data-fan');
                syncDeviceUI();
            }
        });
    });

    // Kitchen Coffee Machine controls
    const coffeeToggle = document.getElementById('widget-coffee-toggle');
    if (coffeeToggle) {
        coffeeToggle.addEventListener('change', (e) => {
            state.devices['kitchen-coffee'].on = e.target.checked;
            if (!e.target.checked) {
                state.devices['kitchen-coffee'].brewing = false;
                state.devices['kitchen-coffee'].brewProgress = 0;
            }
            syncDeviceUI();
        });
    }

    const coffeeRecipeSelect = document.getElementById('coffee-recipe-select');
    if (coffeeRecipeSelect) {
        coffeeRecipeSelect.addEventListener('change', (e) => {
            state.devices['kitchen-coffee'].recipe = e.target.value;
            syncDeviceUI();
        });
    }

    const btnCoffeeBrew = document.getElementById('btn-coffee-brew');
    if (btnCoffeeBrew) {
        btnCoffeeBrew.addEventListener('click', () => {
            const coffee = state.devices['kitchen-coffee'];
            if (coffee.on && !coffee.brewing) {
                coffee.brewing = true;
                coffee.brewProgress = 0;
                addNotification('Coffee Maker', `Started brewing ${coffee.recipe.toUpperCase()}...`, 'purple');
                addSecurityLog('Kitchen Hub', `Espresso brew cycle initiated: [${coffee.recipe}]`, 'log-info');
                syncDeviceUI();
            }
        });
    }

    // Kitchen Refrigerator Shopping list additions
    const btnAddShopping = document.getElementById('btn-add-shopping-item');
    const shoppingInput = document.getElementById('shopping-item-input');
    if (btnAddShopping && shoppingInput) {
        btnAddShopping.addEventListener('click', () => {
            const val = shoppingInput.value.trim();
            if (val) {
                const fridge = state.devices['kitchen-fridge'];
                if (!fridge.items.includes(val)) {
                    fridge.items.push(val);
                    shoppingInput.value = '';
                    addNotification('Refrigerator Tracker', `Added "${val}" to grocery checklist.`, 'teal');
                    syncDeviceUI();
                } else {
                    addNotification('Checklist Info', `"${val}" is already tracked.`, 'cyan');
                }
            }
        });
        
        shoppingInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btnAddShopping.click();
            }
        });
    }

    // Backyard Sprinklers controls
    const sprinklerToggle = document.getElementById('widget-sprinkler-toggle');
    if (sprinklerToggle) {
        sprinklerToggle.addEventListener('change', (e) => {
            state.devices['backyard-sprinkler'].on = e.target.checked;
            syncDeviceUI();
        });
    }

    // Room tab selection filter
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(tb => tb.classList.remove('active'));
            btn.classList.add('active');
            
            const room = btn.getAttribute('data-room');
            document.querySelectorAll('.device-detail-card').forEach(card => {
                if (room === 'all' || card.getAttribute('data-room') === room) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // Camera screenshot snapshot action
    const btnSnapshot = document.getElementById('btn-cam-screenshot');
    if (btnSnapshot) {
        btnSnapshot.addEventListener('click', () => {
            addNotification('Camera system', 'Screenshot snap saved successfully to dashboard downloads.', 'teal');
            addSecurityLog('Driveway Cam', 'Screenshot snapshot recorded by operator Sarah', 'log-info');
        });
    }

    // Cam Pan Controls
    const btnPanLeft = document.getElementById('btn-cam-ptz-left');
    if (btnPanLeft) {
        btnPanLeft.addEventListener('click', () => {
            panAngle -= 0.15;
            addSecurityLog('CCTV System', 'Pan adjust command sent: Sweep LEFT', 'log-info');
        });
    }
    const btnPanRight = document.getElementById('btn-cam-ptz-right');
    if (btnPanRight) {
        btnPanRight.addEventListener('click', () => {
            panAngle += 0.15;
            addSecurityLog('CCTV System', 'Pan adjust command sent: Sweep RIGHT', 'log-info');
        });
    }

    // ----------------------------------------------------------------------
    // 12. Visual Automation Flows Rules Compiler Creator
    // ----------------------------------------------------------------------
    const btnSaveAutomation = document.getElementById('btn-save-automation');
    
    function renderAutomationRules() {
        const list = document.getElementById('automation-rules-list');
        if (!list) return;

        if (state.automations.length === 0) {
            list.innerHTML = '<div class="empty-state">No customized logical rules compiled.</div>';
            return;
        }

        list.innerHTML = state.automations.map(rule => `
            <div class="rule-card" data-id="${rule.id}">
                <div class="rule-info">
                    <div class="rule-icon-box"><i class="fa-solid fa-gears"></i></div>
                    <div class="rule-details">
                        <span class="rule-title">${rule.label}</span>
                        <span class="rule-summary">Active compiler checking live intervals.</span>
                    </div>
                </div>
                <div class="rule-controls">
                    <label class="switch-slide">
                        <input type="checkbox" class="rule-toggle" ${rule.active ? 'checked' : ''}>
                        <span class="switch-slider-round"></span>
                    </label>
                    <button class="btn-trash delete-rule-btn"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </div>
        `).join('');

        // Bind events
        list.querySelectorAll('.rule-toggle').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const id = parseInt(e.target.closest('.rule-card').getAttribute('data-id'));
                const rule = state.automations.find(r => r.id === id);
                if (rule) {
                    rule.active = e.target.checked;
                    addNotification('Automation Engine', `Logic Rule status toggled: ${rule.active ? 'Armed' : 'Disarmed'}`, 'purple');
                }
            });
        });

        list.querySelectorAll('.delete-rule-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.closest('.rule-card').getAttribute('data-id'));
                state.automations = state.automations.filter(r => r.id !== id);
                addNotification('Compiler System', 'Automation logic rule compiled code deleted.', 'pink');
                renderAutomationRules();
            });
        });
    }

    if (btnSaveAutomation) {
        btnSaveAutomation.addEventListener('click', () => {
            const trigDev = document.getElementById('automation-trigger-device').value;
            const trigCond = document.getElementById('automation-trigger-condition').value;
            const trigVal = document.getElementById('automation-trigger-value').value;
            const actDev = document.getElementById('automation-action-device').value;
            const actState = document.getElementById('automation-action-state').value;

            if (!trigDev || !trigCond || !trigVal || !actDev || !actState) {
                addNotification('Builder Warning', 'Please fill out all logic step selectors first.', 'pink');
                return;
            }

            const deviceNames = {
                'temp-sensor': 'Living Thermostat Temp',
                'door-lock': 'Front Door Lock State',
                'motion-sensor': 'Backyard Motion Sensor',
                'time-event': 'Time Event'
            };
            const condSym = { gt: '>', lt: '<', eq: '==', ne: '!=' };
            const targetNames = {
                'living-light': 'Living Light',
                'living-ac': 'AC Climate',
                'front-lock': 'Front Lock',
                'media-sound': 'Speaker',
                'patio-flood': 'Patio Floodlights'
            };
            const stateLabels = {
                'turn-on': 'Turn ON',
                'turn-off': 'Turn OFF',
                'dim-50': 'Dim to 50%',
                'set-cool': 'Set Cool (20°C)',
                'lock': 'Lock Door'
            };

            const ruleLabel = `IF ${deviceNames[trigDev]} ${condSym[trigCond]} "${trigVal}" THEN ${stateLabels[actState]} ${targetNames[actDev]}`;
            
            const newRule = {
                id: Date.now(),
                triggerDevice: trigDev,
                triggerCondition: trigCond,
                triggerValue: trigVal,
                actionDevice: actDev,
                actionState: actState,
                active: true,
                label: ruleLabel
            };

            state.automations.push(newRule);
            addNotification('Compiler System', 'Logic parsed successfully. Rule compiled and active.', 'teal');
            renderAutomationRules();
            
            // Clear inputs
            document.getElementById('automation-trigger-value').value = '';
        });
    }

    // ----------------------------------------------------------------------
    // 13. System Settings Panel Binds
    // ----------------------------------------------------------------------
    const setSimEngine = document.getElementById('setting-sim-engine');
    if (setSimEngine) {
        setSimEngine.addEventListener('change', (e) => {
            state.simulationEnabled = e.target.checked;
            addNotification('Settings Toggled', `Simulation Loop: ${state.simulationEnabled ? 'Enabled' : 'Disabled'}`, 'teal');
            restartSimulationInterval();
        });
    }

    const setSimSpeed = document.getElementById('setting-sim-speed');
    if (setSimSpeed) {
        setSimSpeed.addEventListener('change', (e) => {
            state.simulationSpeed = parseInt(e.target.value);
            addNotification('Settings Dynamic', 'Telemetry update polling rates speed changed.', 'cyan');
            restartSimulationInterval();
        });
    }

    const btnReset = document.getElementById('btn-factory-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            state.devices['living-light'].brightness = 80;
            state.devices['living-light'].color = '#ffb366';
            state.devices['living-ac'].targetTemp = 21;
            state.devices['living-ac'].ambientTemp = 22.4;
            state.devices['living-ac'].mode = 'cool';
            state.devices['front-lock'].locked = true;
            state.devices['media-sound'].trackIndex = 0;
            state.devices['media-sound'].progress = 0;
            
            state.automations = [
                { id: 1, triggerDevice: 'temp-sensor', triggerCondition: 'gt', triggerValue: '24', actionDevice: 'living-ac', actionState: 'turn-on', active: true, label: 'Cool Down: IF Living Temp > 24°C THEN Turn AC ON' }
            ];
            
            addNotification('Ecosystem Reset', 'All nodes reset to standard default profiles.', 'teal');
            renderAutomationRules();
            syncDeviceUI();
        });
    }

    // Clock updates
    setInterval(() => {
        const d = new Date();
        const clockVal = d.toLocaleTimeString();
        const dateVal = d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const curTime = document.getElementById('current-time');
        const curDate = document.getElementById('current-date');
        const camTime = document.getElementById('cam-time');
        const largeCamTime = document.getElementById('large-cam-time');

        if (curTime) curTime.textContent = clockVal;
        if (curDate) curDate.textContent = dateVal;
        if (camTime) camTime.textContent = clockVal;
        if (largeCamTime) largeCamTime.textContent = d.toLocaleString();
    }, 1000);

    // ----------------------------------------------------------------------
    // 14. Charts Integration Engine (Chart.js configuration)
    // ----------------------------------------------------------------------
    function initEcosystemCharts() {
        Chart.defaults.color = 'var(--text-muted)';
        Chart.defaults.font.family = "'Inter', sans-serif";

        // Glassmorphism glow shadow effects plugin
        const glowPlugin = {
            id: 'shadowLine',
            beforeDraw: (chart) => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 4;
            },
            afterDraw: (chart) => {
                chart.ctx.restore();
            }
        };

        // --- 14a. Overview Mini Load line Chart ---
        const miniCtx = document.getElementById('miniEnergyChart');
        if (miniCtx) {
            miniEnergyChartObj = new Chart(miniCtx, {
                type: 'line',
                data: {
                    labels: state.historyLabels,
                    datasets: [{
                        label: 'Total Load (kW)',
                        data: state.historyPower,
                        borderColor: '#00f2fe',
                        borderWidth: 2,
                        pointBackgroundColor: '#00f2fe',
                        pointBorderColor: '#00ebd7',
                        pointRadius: 2,
                        fill: true,
                        backgroundColor: (context) => {
                            const chart = context.chart;
                            const {ctx, chartArea} = chart;
                            if (!chartArea) return null;
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
                            gradient.addColorStop(1, 'rgba(0, 242, 254, 0)');
                            return gradient;
                        },
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { display: false },
                        y: { 
                            grid: { color: 'rgba(255, 255, 255, 0.04)' },
                            border: { dash: [5, 5] }
                        }
                    }
                }
            });
        }

        // --- 14b. Analytics Large Grid History Chart ---
        const largeCtx = document.getElementById('largeEnergyAnalyticsChart');
        if (largeCtx) {
            largeEnergyChartObj = new Chart(largeCtx, {
                type: 'line',
                data: {
                    labels: state.historyLabels,
                    datasets: [{
                        label: 'Real-time Watts Load (kW)',
                        data: state.historyPower,
                        borderColor: '#a18cd1',
                        borderWidth: 3,
                        pointBackgroundColor: '#a18cd1',
                        pointHoverRadius: 6,
                        fill: true,
                        backgroundColor: (context) => {
                            const chart = context.chart;
                            const {ctx, chartArea} = chart;
                            if (!chartArea) return null;
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(161, 140, 209, 0.3)');
                            gradient.addColorStop(1, 'rgba(161, 140, 209, 0)');
                            return gradient;
                        },
                        tension: 0.45
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { grid: { color: 'rgba(255, 255, 255, 0.02)' } },
                        y: { 
                            grid: { color: 'rgba(255, 255, 255, 0.04)' },
                            border: { dash: [5, 5] }
                        }
                    }
                }
            });
        }

        // --- 14c. Appliance splits distribution donut ---
        const applianceCtx = document.getElementById('applianceDistributionChart');
        if (applianceCtx) {
            applianceChartObj = new Chart(applianceCtx, {
                type: 'doughnut',
                data: {
                    labels: ['HVAC AC', 'Smart Lights', 'Media Audio', 'Vacuum Clean', 'Grid Base'],
                    datasets: [{
                        data: [65, 12, 5, 3, 15],
                        backgroundColor: [
                            'rgba(161, 140, 209, 0.7)',
                            'rgba(246, 211, 101, 0.7)',
                            'rgba(0, 242, 254, 0.7)',
                            'rgba(255, 154, 162, 0.7)',
                            'rgba(110, 106, 130, 0.6)'
                        ],
                        borderColor: 'rgba(15, 12, 28, 0.6)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { 
                            position: 'bottom',
                            labels: { boxWidth: 12, padding: 12 }
                        }
                    },
                    cutout: '68%'
                }
            });
        }
    }

    function updateChartsData() {
        if (miniEnergyChartObj) {
            miniEnergyChartObj.data.labels = state.historyLabels;
            miniEnergyChartObj.data.datasets[0].data = state.historyPower;
            miniEnergyChartObj.update('none'); // Update fast with no animations lagging
        }
        
        if (largeEnergyChartObj) {
            largeEnergyChartObj.data.labels = state.historyLabels;
            largeEnergyChartObj.data.datasets[0].data = state.historyPower;
            largeEnergyChartObj.update('none');
        }

        // Update active device split shares dynamically
        if (applianceChartObj) {
            let acWatt = state.devices['living-ac'].on ? 850 : 0;
            if (state.devices['living-ac'].mode === 'eco' && acWatt > 0) acWatt = 425;
            const lWatt = state.devices['living-light'].on ? (state.devices['living-light'].brightness/100)*60 : 0;
            const sWatt = state.devices['media-sound'].on ? (state.devices['media-sound'].volume/100)*30 : 0;
            const vWatt = state.devices['vacuum'].status === 'cleaning' ? 40 : 0;
            const bWatt = 150; // base load

            applianceChartObj.data.datasets[0].data = [acWatt, lWatt, sWatt, vWatt, bWatt];
            applianceChartObj.update('none');
        }
    }

    // ----------------------------------------------------------------------
    // 15. Initialisation
    // ----------------------------------------------------------------------
    syncDeviceUI();
    renderAutomationRules();
    initCanvasFeeds();
    
    // Add default arrival notifications
    setTimeout(() => {
        addNotification('System Initialised', 'Ecosystem online. Secured in Home Mode.', 'teal');
        addNotification('Scene Activated', 'Active Scene Profile: Arrive Home loaded.', 'cyan');
    }, 800);

    // Load Charts
    initEcosystemCharts();

    // Start Simulation Interval
    restartSimulationInterval();
    } catch (error) {
        console.error("CRITICAL RUNTIME ERROR:", error);
        const errBanner = document.createElement('div');
        errBanner.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; background: #ff0055; color: #fff; padding: 20px; z-index: 9999; font-family: monospace; font-size: 14px; line-height: 1.5;";
        errBanner.innerHTML = '<strong>AETHERIA SYSTEM CRASH:</strong> ' + error.message + '<br><br>' + (error.stack ? error.stack.split('\n').join('<br>') : '');
        document.body.insertBefore(errBanner, document.body.firstChild);
    }
}

if (document.readyState === 'loading') {
    window.remoteLog('INIT', 'Document is loading, binding DOMContentLoaded listener...');
    document.addEventListener('DOMContentLoaded', initAetheria);
} else {
    window.remoteLog('INIT', 'Document is already loaded, running init immediately...');
    initAetheria();
}
