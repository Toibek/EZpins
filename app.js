
//#region -- STATE
const params = new URLSearchParams(window.location.search);
const VIEWER_ID = params.get('world') || 'default';
const STORAGE_KEY = `multiMapViewerDataV2_${VIEWER_ID}`;

let state = {
    currentMapId: null,
    maps: {}
};

let isDraggingPin = false;
let draggingPinIndex = null;
let dragMoved = false;

let zoom = 1;
let offsetX = 0;
let offsetY = 0;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let startOffsetX = 0;
let startOffsetY = 0;
let panMoved = false;

const viewer = document.getElementById('viewer');
const imageLayer = document.getElementById('image-layer');
const img = document.getElementById('main-image');
const placeholder = document.getElementById('placeholder');
const fileJson = document.getElementById('file-json');
//#endregion

//#region -- FUNCTIONS --

function generateId(prefix = 'map') {
    return prefix + '-' + Math.random().toString(36).slice(2, 9);
}

function getCurrentMap() {
    return state.maps[state.currentMapId] || null;
}

//#region saving & loading

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save state:', e);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            state = JSON.parse(raw);
        } else {
            const id = generateId();
            state = {
                currentMapId: id,
                maps: {
                    [id]: {
                        id,
                        name: 'Map 1',
                        imageUrl: '',
                        pins: []
                    }
                }
            };
        }
    } catch (e) {
        console.warn('Failed to load state, resetting:', e);
        const id = generateId();
        state = {
            currentMapId: id,
            maps: {
                [id]: {
                    id,
                    name: 'Map 1',
                    imageUrl: '',
                    pins: []
                }
            }
        };
    }
}

//#endregion

//#region view 
function applyTransform() {
    imageLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
}

function resetView() {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    applyTransform();
}
//#endregion

//#region rendering

function renderImage() {
    const map = getCurrentMap();
    if (!map || !map.imageUrl) {
        imageLayer.style.display = 'none';
        img.src = '';
        placeholder.style.display = 'block';
        return;
    }
    img.src = map.imageUrl;
    imageLayer.style.display = 'inline-block';
    placeholder.style.display = 'none';
    resetView();
}

function renderPins() {
    clearPinsFromDOM();
    const map = getCurrentMap();
    if (!map) return;
    map.pins.forEach((pin, index) => {
        const color = getPinColor(pin);

        const el = document.createElement('div');
        el.className = 'pin';
        el.style.left = pin.xPercent + '%';
        el.style.top = pin.yPercent + '%';
        el.dataset.index = index;

        const base = document.createElement('div');
        base.className = 'pin-base';
        base.style.background = color;

        const tail = document.createElement('div');
        tail.className = 'pin-tail';
        tail.style.borderTopColor = color;

        const content = document.createElement('div');
        content.className = 'pin-content';

        const iconVal = pin.icon || '';
        if (iconVal) {
            if (iconVal.trim().startsWith('http')) {
                const imgEl = document.createElement('img');
                imgEl.src = iconVal.trim();
                imgEl.alt = '';
                content.appendChild(imgEl);
            } else {
                content.textContent = iconVal;
            }
        }

        el.appendChild(base);
        el.appendChild(tail);
        el.appendChild(content);

        imageLayer.appendChild(el);
    });
}

function clearPinsFromDOM() {
    imageLayer.querySelectorAll('.pin').forEach(el => el.remove());
}

function getPinColor(pin) {
    return pin.color || getComputedStyle(document.documentElement)
        .getPropertyValue('--pin-default-color')
        .trim() || '#ffffff';
}

function fullRender() {
    renderImage();
    renderPins();
}
//#endregion

//#region tooltips

function hideTooltip() {
    const existing = document.getElementById('active-tooltip');
    if (existing) existing.remove();
}

function positionTooltip(tooltip, pinElement) {
    const pinRect = pinElement.getBoundingClientRect();
    const viewerRect = viewer.getBoundingClientRect();

    let x = pinRect.left - viewerRect.left + pinRect.width / 2;
    let y = pinRect.top - viewerRect.top - 10;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function showInfoTooltip(pinElement, pin, index) {
    hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.id = 'active-tooltip';

    const color = getPinColor(pin);


    const iconRow = document.createElement('div');
    iconRow.className = 'tooltip-icon-display';

    if (pin.icon || color) {
        const circle = document.createElement('div')
        circle.className = 'tooltip-icon-circle';
        circle.style.background = color;
        iconRow.appendChild(circle);

        if (pin.icon) {
            if (pin.icon.trim().startsWith('http')) {
                const iconImg = document.createElement('img');
                iconImg.src = pin.icon.trim();
                iconImg.alt = '';
                circle.appendChild(iconImg);
            } else {
                const iconSpan = document.createElement('span');
                iconSpan.textContent = pin.icon;
                circle.appendChild(iconSpan);
            }
        }
    }

    const titleRow = document.createElement('div');
    titleRow.className = 'tooltip-title-display';
    titleRow.textContent = pin.title || '(Untitled pin)';
    iconRow.appendChild(titleRow);
    tooltip.appendChild(iconRow);

    if (pin.text) {
        const bodyRow = document.createElement('div');
        bodyRow.className = 'tooltip-body-display';
        bodyRow.textContent = pin.text;
        tooltip.appendChild(bodyRow);
    }

    const actions = document.createElement('div');
    actions.className = 'tooltip-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
        showEditTooltip(pinElement, pin, index);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'danger';
    deleteBtn.addEventListener('click', () => {
        if (!confirm('Delete this pin?')) return;
        const map = getCurrentMap();
        if (!map) return;
        map.pins.splice(index, 1);
        saveState();
        hideTooltip();
        renderPins();
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', hideTooltip);

    //actions.appendChild(editBtn);
    //actions.appendChild(deleteBtn);
    //actions.appendChild(closeBtn);
    tooltip.appendChild(actions);

    viewer.appendChild(tooltip);
    positionTooltip(tooltip, pinElement);
}

function showEditTooltip(pinElement, pin, index) {
    hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.id = 'active-tooltip';

    const currentColor = getPinColor(pin);

    const rowTitle = document.createElement('div');
    rowTitle.className = 'tooltip-row';
    const labelTitle = document.createElement('div');
    labelTitle.className = 'tooltip-label';
    labelTitle.textContent = 'Title';
    const inputTitle = document.createElement('input');
    inputTitle.type = 'text';
    inputTitle.value = pin.title || '';
    rowTitle.appendChild(labelTitle);
    rowTitle.appendChild(inputTitle);

    const rowNote = document.createElement('div');
    rowNote.className = 'tooltip-row';
    const labelNote = document.createElement('div');
    labelNote.className = 'tooltip-label';
    labelNote.textContent = 'Note';
    const inputNote = document.createElement('textarea');
    inputNote.value = pin.text || '';
    rowNote.appendChild(labelNote);
    rowNote.appendChild(inputNote);

    const rowIcon = document.createElement('div');
    rowIcon.className = 'tooltip-row';
    const labelIcon = document.createElement('div');
    labelIcon.className = 'tooltip-label';
    labelIcon.textContent = 'Icon (emoji or image URL)';
    const inputIcon = document.createElement('input');
    inputIcon.type = 'text';
    inputIcon.placeholder = '🏰 or https://.../icon.png';
    inputIcon.value = pin.icon || '';
    rowIcon.appendChild(labelIcon);
    rowIcon.appendChild(inputIcon);

    const rowColor = document.createElement('div');
    rowColor.className = 'tooltip-row';
    const labelColor = document.createElement('div');
    labelColor.className = 'tooltip-label';
    labelColor.textContent = 'Pin color';
    const inputColor = document.createElement('input');
    inputColor.type = 'color';
    inputColor.value = currentColor;
    rowColor.appendChild(labelColor);
    rowColor.appendChild(inputColor);

    const actions = document.createElement('div');
    actions.className = 'tooltip-actions';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
        const map = getCurrentMap();
        if (!map) return;
        const p = map.pins[index];
        if (!p) return;
        p.title = inputTitle.value.trim();
        p.text = inputNote.value.trim();
        p.icon = inputIcon.value.trim();
        p.color = inputColor.value || currentColor;
        saveState();
        hideTooltip();
        renderPins();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'danger';
    deleteBtn.addEventListener('click', () => {
        const map = getCurrentMap();
        if (!map) return;
        map.pins.splice(index, 1);
        saveState();
        hideTooltip();
        renderPins();
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', hideTooltip);

    actions.appendChild(saveBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(closeBtn);

    tooltip.appendChild(rowTitle);
    tooltip.appendChild(rowNote);
    tooltip.appendChild(rowIcon);
    tooltip.appendChild(rowColor);
    tooltip.appendChild(actions);

    viewer.appendChild(tooltip);
    positionTooltip(tooltip, pinElement);
}
//#endregion

//#region menu

function hideGlobalMenu() {
    const existing = document.getElementById('global-menu');
    if (existing) existing.remove();
}

function showGlobalMenu(event) {
    if (document.getElementById('global-menu')) {
        hideGlobalMenu();
        return;
    }

    const menu = document.createElement('div');
    menu.className = 'global-menu';
    menu.id = 'global-menu';

    const current = getCurrentMap();
    const mapsArray = Object.values(state.maps);

    // --- SELECT ---
    //Header
    const titleSelect = document.createElement('h3');
    titleSelect.textContent = 'Map Select';
    menu.appendChild(titleSelect);

    const rowMap = document.createElement('div');
    rowMap.className = 'global-menu-row';
    //Select
    const select = document.createElement('select');
    mapsArray.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.id === state.currentMapId) opt.selected = true;
        select.appendChild(opt);
    });
    //New
    const btnAdd = document.createElement('button');
    btnAdd.textContent = 'New';
    btnAdd.addEventListener('click', addMap);

    rowMap.appendChild(select);
    rowMap.appendChild(btnAdd);
    menu.appendChild(rowMap);

    //Settings
    const titleSettings = document.createElement('h3');
    titleSettings.textContent = 'Map Settings';
    menu.appendChild(titleSettings);

    const rowImage = document.createElement('div');
    rowImage.className = 'global-menu-row';

    const labelName = document.createElement('label');
    labelName.textContent = 'Map name';
    rowImage.appendChild(labelName);
    const inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.value = current.name;
    rowImage.append(inputName);

    const labelImage = document.createElement('label');
    labelImage.textContent = 'Image URL';
    rowImage.appendChild(labelImage);

    const inputUrl = document.createElement('input');
    inputUrl.type = 'text';
    inputUrl.value = current ? (current.imageUrl || '') : '';
    rowImage.appendChild(inputUrl);

    const imgButtons = document.createElement('div');
    imgButtons.style.display = 'flex';
    imgButtons.style.gap = '0.25rem';
    imgButtons.style.marginTop = '0.25rem';

    //Save
    const btnApply = document.createElement('button');
    btnApply.textContent = 'Save';
    btnApply.addEventListener('click', () => {
        const current = getCurrentMap();
        if (!current) return;
        current.imageUrl = inputUrl.value.trim();
        current.name = inputName.value;
        saveState();
        fullRender();
        hideGlobalMenu();
    });
    //Delete
    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.className = 'danger';
    btnDelete.addEventListener('click', deleteMap);

    //Appending
    imgButtons.appendChild(btnApply);
    imgButtons.appendChild(btnDelete);
    rowImage.appendChild(imgButtons);

    menu.appendChild(rowImage);

    //Shortcuts / controls hint
    const shortcuts = document.createElement('div');
    shortcuts.className = 'global-menu-shortcuts';
    shortcuts.innerHTML = `
      <h3>Controls</h3>
      • Scroll: zoom<br>
      • Drag on map: pan<br>
      • Ctrl+click empty: add pin<br>
      • Click lick pin: view info<br>
      • Right click pin: edit<br>
      • Shift+drag pin: move<br>
      • Right click empty: Open menu
    `;
    menu.appendChild(shortcuts);

    // Actions: close
    const actions = document.createElement('div');
    actions.className = 'global-menu-actions';

    const btnClose = document.createElement('button');
    btnClose.textContent = 'Close';
    btnClose.addEventListener('click', hideGlobalMenu);

    actions.appendChild(btnClose);
    menu.appendChild(actions);

    // --- positioning ---

    const viewerRect = viewer.getBoundingClientRect();
    const x = viewerRect.left //event.clientX - viewerRect.left;
    const y = viewerRect.top //event.clientY - viewerRect.top;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    viewer.appendChild(menu);

    // Handle map change from dropdown
    select.addEventListener('change', () => {
        const id = select.value;
        if (!state.maps[id]) return;
        state.currentMapId = id;
        saveState();
        fullRender();
        hideGlobalMenu();
    });
}

function addMap() {
    const name = prompt('New map name?', 'New Map');
    if (!name) return;
    const url = prompt('Image URL for this map? (You can change it later)', '') || '';
    const id = generateId();
    state.maps[id] = {
        id,
        name: name.trim(),
        imageUrl: url.trim(),
        pins: []
    };
    state.currentMapId = id;
    saveState();
    fullRender();
    hideGlobalMenu();
}

function deleteMap() {
    const current = getCurrentMap();
    if (!current) return;
    if (!confirm(`Delete map "${current.name}" and all its pins?`)) return;
    delete state.maps[current.id];
    const remaining = Object.values(state.maps);
    if (remaining.length) {
        state.currentMapId = remaining[0].id;
    } else {
        const id = generateId();
        state.maps[id] = {
            id,
            name: 'Map 1',
            imageUrl: '',
            pins: []
        };
        state.currentMapId = id;
    }
    saveState();
    fullRender();
    hideGlobalMenu();
}


function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EZpin-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importJson() {
    fileJson.value = '';
    fileJson.click();
}
//#endregion

//#endregion

//#region -- LISTENERS

imageLayer.addEventListener('mousedown', (event) => {
    const map = getCurrentMap();
    if (!map || !map.imageUrl) return;

    if (event.target.closest('.pin') || event.target.closest('.tooltip')) return;
    if (event.button !== 0) return;

    isPanning = true;
    panMoved = false;
    panStartX = event.clientX;
    panStartY = event.clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
});

fileJson.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported || typeof imported !== 'object' || !imported.maps) {
                alert('This JSON does not look like map viewer data.');
                return;
            }
            state = imported;
            saveState();
            fullRender();
        } catch (err) {
            console.error(err);
            alert('Failed to parse JSON.');
        }
    };
    reader.readAsText(file);
});

//#region window
window.addEventListener('mousemove', (event) => {
    if (isPanning) {
        const dx = event.clientX - panStartX;
        const dy = event.clientY - panStartY;
        if (!panMoved && (dx * dx + dy * dy > 4)) {
            panMoved = true;
        }
        offsetX = startOffsetX + dx;
        offsetY = startOffsetY + dy;
        applyTransform();
    }
});

window.addEventListener('mouseup', (event) => {
    const map = getCurrentMap();

    if (isPanning) {
        isPanning = false;

        if (!panMoved && map && map.imageUrl) {
            if (document.getElementById('active-tooltip')) {
                hideTooltip();
            } else if (document.getElementById('global-menu')) {
                hideGlobalMenu();
            } else if (event.ctrlKey || event.metaKey) {
                const rect = imageLayer.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;

                const xPercent = (x / rect.width) * 100;
                const yPercent = (y / rect.height) * 100;

                map.pins.push({
                    xPercent,
                    yPercent,
                    title: '',
                    text: '',
                    icon: '',
                    color: getComputedStyle(document.documentElement)
                        .getPropertyValue('--pin-default-color')
                        .trim() || '#ffffff'
                });

                saveState();
                renderPins();
            }
        }
    }

    if (isDraggingPin) {
        isDraggingPin = false;
        draggingPinIndex = null;
        saveState();
        renderPins();
    }
});

window.addEventListener('mousemove', (event) => {
    if (!isDraggingPin) return;
    const map = getCurrentMap();
    if (!map || !map.imageUrl) return;

    const rect = imageLayer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;

    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));

    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    const pin = map.pins[draggingPinIndex];
    if (!pin) return;

    dragMoved = true;
    pin.xPercent = xPercent;
    pin.yPercent = yPercent;

    const pinEl = imageLayer.querySelector(`.pin[data-index="${draggingPinIndex}"]`);
    if (pinEl) {
        pinEl.style.left = xPercent + '%';
        pinEl.style.top = yPercent + '%';
    }
});

window.addEventListener('resize', () => {
    hideTooltip();
});

//#endregion
//#region viewer

viewer.addEventListener('mousedown', (event) => {
    const pinEl = event.target.closest('.pin');
    if (!pinEl) return;

    if (!event.shiftKey) return;
    event.preventDefault();

    const index = parseInt(pinEl.dataset.index, 10);
    const map = getCurrentMap();
    if (!map) return;

    isDraggingPin = true;
    draggingPinIndex = index;
    dragMoved = false;
    hideTooltip();
});

viewer.addEventListener('click', (event) => {
    if (event.target.closest('.tooltip')) return;

    const pinEl = event.target.closest('.pin');
    if (!pinEl) return;

    if (dragMoved) {
        dragMoved = false;
        return;
    }

    event.stopPropagation();
    const index = parseInt(pinEl.dataset.index, 10);
    const map = getCurrentMap();
    if (!map) return;
    const pin = map.pins[index];

    if (event.ctrlKey || event.metaKey) {
        showEditTooltip(pinEl, pin, index);
    } else {
        showInfoTooltip(pinEl, pin, index);
    }
});

viewer.addEventListener('wheel', (event) => {
    const map = getCurrentMap();
    if (!map || !map.imageUrl) return;

    event.preventDefault();

    const delta = -event.deltaY;
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * zoomFactor));
    if (newZoom === zoom) return;

    const rect = imageLayer.getBoundingClientRect();
    const viewerRect = viewer.getBoundingClientRect();

    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;

    const ux = cx / zoom;
    const uy = cy / zoom;

    zoom = newZoom;

    const newRectLeft = event.clientX - ux * zoom;
    const newRectTop = event.clientY - uy * zoom;

    offsetX = newRectLeft - viewerRect.left;
    offsetY = newRectTop - viewerRect.top;

    applyTransform();
}, { passive: false });

viewer.addEventListener('contextmenu', (event) => {
    if (event.ctrlKey) return;
    //if (event.target.closest('.tooltip')) return;
    event.preventDefault();
    const pinEl = event.target.closest('.pin');
    if (pinEl) {

        event.stopPropagation();
        const index = parseInt(pinEl.dataset.index, 10);
        const map = getCurrentMap();
        if (!map) return;
        const pin = map.pins[index];

        showEditTooltip(pinEl, pin, index);
        return;
    }


    const map = getCurrentMap();
    if (!map) return;

    showGlobalMenu(event);
});

//#endregion
//#endregion

loadState();
fullRender();