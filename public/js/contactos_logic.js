/**
 * contactos_logic.js
 * Lógica específica para el directorio de contactos(contactos.html)
 */

// Contacts database — starts empty, persists via PostgreSQL
let contactsDB = [];

// Avatar state
let currentAvatarDataUrl = null; // Base64 WEBP string
let cropperState = { img: null, scale: 1, offsetX: 0, offsetY: 0 };

async function loadContacts() {
    try {
        const response = await apiFetch('/api/contacts');
        const raw = response.data || response;
        contactsDB = raw.map(c => ({
            id: c.id,
            name: c.nombre,
            area: c.area || '',
            gerencia: c.gerencia || '',
            role: c.cargo,
            internalId: c.internal_id || '',
            phone: c.telefono || '',
            nota: c.nota || '',
            avatar: c.avatar || ''
        }));
    } catch (e) {
        console.error('Error al cargar contactos:', e);
        contactsDB = [];
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Iniciar cabecera y variables globales (utils.js)
    if (typeof setupHeader === 'function') setupHeader();

    // 2. Comportamiento Admin (Botón Administrar Internos)
    const role = localStorage.getItem('userRole') || 'Usuario';
    const pageHeader = document.querySelector('.page-header');

    if ((role === 'admin' || role === 'administrador') && pageHeader && !document.getElementById('btnAdminContactos')) {
        const adminBtnHtml = `
            <div style="margin-top: 15px;">
                <button id="btnAdminContactos" class="btn-primary" style="font-size: 0.95rem; font-weight: 600; padding: 0.7rem 1.4rem; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(20, 184, 166, 0.2), 0 2px 4px -1px rgba(20, 184, 166, 0.1); display: flex; align-items: center; justify-content: center; gap: 0.6rem; transition: all 0.25s ease; border: 1.5px solid rgba(255,255,255,0.1);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 12px -1px rgba(20, 184, 166, 0.3), 0 4px 6px -1px rgba(20, 184, 166, 0.2)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 6px -1px rgba(20, 184, 166, 0.2), 0 2px 4px -1px rgba(20, 184, 166, 0.1)';" onclick="toggleAdminPanel()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                Administrar Internos
                </button>
            </div>
        `;
        pageHeader.insertAdjacentHTML('beforeend', adminBtnHtml);
    }

    await loadContacts();
    renderContacts(contactsDB);
    // Persistir la cantidad de internos para que el Dashboard los lea
    localStorage.setItem('internosCount', contactsDB.length);

    // 3. Setup Buscador Básico
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
        searchInput.placeholder = "Buscar coincidencia (Ejemplo: UV 01)";

        // Remove global search logic attached by utils.js by cloning node
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        // Hide global dropdown mapping
        const globalDropdown = document.getElementById('searchResultsDropdown');
        if (globalDropdown) globalDropdown.style.display = 'none';

        newSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query.length === 0) {
                renderContacts(contactsDB);
                return;
            }

            const filtered = contactsDB.filter(c =>
                c.name.toLowerCase().includes(query) ||
                c.internalId.includes(query) ||
                c.area.toLowerCase().includes(query) ||
                c.gerencia.toLowerCase().includes(query) ||
                c.role.toLowerCase().includes(query) ||
                (c.nota && c.nota.toLowerCase().includes(query))
            );
            renderContacts(filtered);
        });
    }
});

function renderContacts(data) {
    const container = document.getElementById('contactListContainer');
    if (!container) return;

    // Asegurar que el listado esté siempre ordenado por internalId de menor a mayor
    data.sort((a, b) => {
        const numA = parseInt(a.internalId, 10);
        const numB = parseInt(b.internalId, 10);
        return numA - numB;
    });

    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--color-text-muted);">No se encontraron contactos</div>';
        return;
    }

    data.forEach((c, index) => {
        const card = document.createElement('div');
        card.className = 'contact-card';
        const initial = c.name.charAt(0);

        // Correlativo secuencial basado en la posición actual
        const correlativo = index + 1;

        // Avatar: image or initial (click to enlarge if has avatar)
        let avatarHtml;
        if (c.avatar) {
            avatarHtml = `<img class="contact-avatar-img" src="${c.avatar}" alt="${c.name}" onclick="openAvatarModal('${c.name}', '${c.avatar}')" style="cursor:pointer;" />`;
        } else {
            avatarHtml = `<div class="contact-avatar">${initial}</div>`;
        }

        let editIconHtml = '';
        if (isAdmin()) {
            editIconHtml = `<div class="contact-edit-icon" onclick="editContactFromList('${c.id}')" title="Editar Interno">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
            </div>`;
        }

        // Phone display
        const phoneHtml = c.phone ? `<div class="contact-phone">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            <span>${c.phone}</span>
        </div>` : '';

        card.innerHTML = `
            <div class="contact-card-header">
                ${avatarHtml}
                <div class="contact-info">
                    <div class="contact-internal-number">${c.internalId}</div>
                    <div class="contact-name">${c.name}</div>
                    <div class="contact-role-inline">${c.role}</div>
                </div>
                <div class="contact-correlativo" title="Nro ${correlativo} de ${data.length}">#${correlativo}</div>
                ${editIconHtml}
            </div>
            <div class="contact-card-divider"></div>
            <div class="contact-card-body">
                <div class="contact-details-grid">
                    <div class="contact-detail-item">
                        <span class="contact-detail-label">Área</span>
                        <span class="contact-detail-value">${c.area || '—'}</span>
                    </div>
                    ${c.gerencia ? `<div class="contact-detail-item">
                        <span class="contact-detail-label">Gerencia</span>
                        <span class="contact-detail-value">${c.gerencia}</span>
                    </div>` : ''}
                    ${c.phone ? `<div class="contact-detail-item">
                        <span class="contact-detail-label">Teléfono</span>
                        <span class="contact-detail-value contact-detail-phone">${c.phone}</span>
                    </div>` : ''}
                </div>
                ${c.nota ? `<div class="contact-nota">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span>${c.nota}</span>
                </div>` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Lógica del CRUD de Contactos Integrado ---
window.toggleAdminPanel = function () {
    const panel = document.getElementById('adminContactosPanel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') {
            resetContactForm();
            setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }, 100);
        }
    }
};

window.cerrarAdminPanel = function () {
    const panel = document.getElementById('adminContactosPanel');
    if (panel) panel.style.display = 'none';
};

window.editContactFromList = function (id) {
    const panel = document.getElementById('adminContactosPanel');
    if (panel && panel.style.display === 'none') {
        panel.style.display = 'block';
    }

    const contact = contactsDB.find(c => String(c.id) === String(id));
    if (contact) {
        document.getElementById('editContactOldId').value = contact.id;
        document.getElementById('newContactName').value = contact.name;
        // FIX Bug 1: internalId and phone are SEPARATE fields
        document.getElementById('newContactId').value = contact.internalId || '';
        document.getElementById('newContactArea').value = contact.area || '';
        document.getElementById('newContactRole').value = contact.role;
        // FIX Bug 2: gerencia is its own field, not tied to area
        document.getElementById('newContactGerencia').value = contact.gerencia || '';
        document.getElementById('newContactPhone').value = contact.phone || '';
        document.getElementById('newContactNota').value = contact.nota || '';

        // Load avatar if exists
        if (contact.avatar) {
            currentAvatarDataUrl = contact.avatar;
            document.getElementById('avatarPreviewImg').src = contact.avatar;
            document.getElementById('avatarPreviewImg').style.display = 'block';
            document.getElementById('avatarPreviewInitial').style.display = 'none';
            document.getElementById('btnRemoveAvatar').style.display = 'inline-block';
        } else {
            removeAvatar();
        }

        document.getElementById('adminContactFormTitle').textContent = 'Editar Interno';
        const saveBtn = document.getElementById('btnSaveContact');
        saveBtn.textContent = 'Guardar Cambios';

        document.getElementById('btnClearForm').style.display = 'block';
        document.getElementById('btnDeleteContact').style.display = 'block';

        setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }, 100);
    }
};

window.resetContactForm = function () {
    document.getElementById('editContactOldId').value = '';
    document.getElementById('newContactName').value = '';
    document.getElementById('newContactId').value = '';
    document.getElementById('newContactArea').value = '';
    document.getElementById('newContactRole').value = '';
    document.getElementById('newContactGerencia').value = '';
    document.getElementById('newContactPhone').value = '';
    document.getElementById('newContactNota').value = '';

    removeAvatar();

    document.getElementById('adminContactFormTitle').textContent = 'Agregar Nuevo Interno';
    const saveBtn = document.getElementById('btnSaveContact');
    saveBtn.textContent = 'Añadir al directorio';

    document.getElementById('btnClearForm').style.display = 'block';
    document.getElementById('btnDeleteContact').style.display = 'none';
};

window.submitContactForm = async function () {
    const dbId = document.getElementById('editContactOldId').value;
    const name = document.getElementById('newContactName').value.trim();
    const internalId = document.getElementById('newContactId').value.trim();
    const area = document.getElementById('newContactArea').value.trim();
    const role = document.getElementById('newContactRole').value.trim();
    const gerencia = document.getElementById('newContactGerencia').value.trim();
    const phone = document.getElementById('newContactPhone').value.trim();
    const nota = document.getElementById('newContactNota').value.trim();

    if (!name || !area || !role || !gerencia) {
        alert("Completa todos los campos obligatorios (Nombre, Área, Gerencia, Cargo).");
        return;
    }

    const payload = {
        nombre: name,
        cargo: role,
        area: area,
        gerencia: gerencia,
        role: role,
        internal_id: internalId,
        telefono: phone,
        nota: nota || null,
        avatar: currentAvatarDataUrl || null
    };

    try {
        if (dbId) {
            await apiFetch(`/api/contacts/${dbId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            alert("🟢 Interno modificado exitosamente.");
        } else {
            await apiFetch('/api/contacts', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            alert("🟢 Nuevo interno agregado.");
        }

        resetContactForm();
        await loadContacts();
        renderContacts(contactsDB);
    } catch (err) {
        alert("Error al guardar contacto: " + err.message);
    }
};

window.deleteSelectedContact = async function () {
    const dbId = document.getElementById('editContactOldId').value;
    const name = document.getElementById('newContactName').value;
    if (!dbId) return;

    if (confirm(`¿Estás seguro de que deseas ELIMINAR el interno de ${name}?`)) {
        try {
            await apiFetch(`/api/contacts/${dbId}`, { method: 'DELETE' });
            alert("🔴 Interno eliminado del directorio.");
            resetContactForm();
            await loadContacts();
            renderContacts(contactsDB);
        } catch (err) {
            alert("Error al eliminar contacto: " + err.message);
        }
    }
};

// ==================== AVATAR HANDLING ====================

window.handleAvatarUpload = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen válido.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        openCropperModal(e.target.result);
    };
    reader.readAsDataURL(file);

    event.target.value = '';
};

function openCropperModal(dataUrl) {
    const modal = document.getElementById('avatarCropperModal');
    const img = document.getElementById('cropperImage');

    // Set the image source FIRST so it's visible
    img.src = dataUrl;

    // Reset styles
    img.style.position = 'absolute';
    img.style.left = '0px';
    img.style.top = '0px';
    img.style.transform = 'none';

    cropperState.img = new Image();
    cropperState.img.onload = function () {
        cropperState.scale = 1;
        cropperState.offsetX = 0;
        cropperState.offsetY = 0;
        document.getElementById('cropperZoom').value = 1;
        // Small delay to let container render
        setTimeout(() => renderCropperImage(), 50);
    };
    cropperState.img.crossOrigin = 'anonymous';
    cropperState.img.src = dataUrl;

    setupCropperDrag();

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function renderCropperImage() {
    const img = document.getElementById('cropperImage');
    if (!cropperState.img || !cropperState.img.complete || !cropperState.img.naturalWidth) return;

    const container = img.parentElement;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const natW = cropperState.img.naturalWidth;
    const natH = cropperState.img.naturalHeight;

    // Calculate base scale to cover the container
    const scaleW = containerW / natW;
    const scaleH = containerH / natH;
    const baseScale = Math.max(scaleW, scaleH) * cropperState.scale;

    const scaledW = natW * baseScale;
    const scaledH = natH * baseScale;

    // Center the image + apply offset
    const centerX = (containerW - scaledW) / 2 + cropperState.offsetX;
    const centerY = (containerH - scaledH) / 2 + cropperState.offsetY;

    img.style.width = scaledW + 'px';
    img.style.height = scaledH + 'px';
    img.style.position = 'absolute';
    img.style.left = centerX + 'px';
    img.style.top = centerY + 'px';
    img.style.transform = 'none';
}

function setupCropperDrag() {
    const container = document.getElementById('cropperImage').parentElement;
    let isDragging = false;
    let startX, startY, startOffsetX, startOffsetY;

    // Remove old listeners by cloning
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);

    // Re-reference the cropper image element after clone
    const cropperImg = document.getElementById('cropperImage');

    newContainer.addEventListener('mousedown', function (e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startOffsetX = cropperState.offsetX;
        startOffsetY = cropperState.offsetY;
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        cropperState.offsetX = startOffsetX + (e.clientX - startX);
        cropperState.offsetY = startOffsetY + (e.clientY - startY);
        renderCropperImage();
    });

    document.addEventListener('mouseup', function () {
        isDragging = false;
    });

    // Touch support
    newContainer.addEventListener('touchstart', function (e) {
        isDragging = true;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startOffsetX = cropperState.offsetX;
        startOffsetY = cropperState.offsetY;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!isDragging) return;
        const touch = e.touches[0];
        cropperState.offsetX = startOffsetX + (touch.clientX - startX);
        cropperState.offsetY = startOffsetY + (touch.clientY - startY);
        renderCropperImage();
    }, { passive: true });

    document.addEventListener('touchend', function () {
        isDragging = false;
    });
}

window.updateCropperZoom = function (val) {
    cropperState.scale = parseFloat(val);
    renderCropperImage();
};

window.closeCropperModal = function () {
    const modal = document.getElementById('avatarCropperModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        const img = document.getElementById('cropperImage');
        img.src = '';
        img.style.position = '';
        img.style.left = '';
        img.style.top = '';
        img.style.width = '';
        img.style.height = '';
        img.style.transform = '';
        cropperState = { img: null, scale: 1, offsetX: 0, offsetY: 0 };
    }, 300);
};

/**
 * cropAndSaveAvatar: Uses canvas to draw the visible portion of the image
 * within the circular overlay, then converts to WEBP at 70% quality.
 */
window.cropAndSaveAvatar = function () {
    const naturalImg = cropperState.img;
    if (!naturalImg || !naturalImg.complete || !naturalImg.naturalWidth) {
        alert('No hay imagen válida para recortar.');
        return;
    }

    const displayImg = document.getElementById('cropperImage');
    const container = displayImg.parentElement;

    // Container and overlay dimensions
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const overlaySize = 200;

    // The overlay is centered in the container
    const overlayCenterX = containerW / 2;
    const overlayCenterY = containerH / 2;
    const overlayLeft = overlayCenterX - overlaySize / 2;
    const overlayTop = overlayCenterY - overlaySize / 2;

    // Get the displayed image position and size (we set these in renderCropperImage)
    const imgLeft = parseFloat(displayImg.style.left) || 0;
    const imgTop = parseFloat(displayImg.style.top) || 0;
    const imgW = displayImg.clientWidth;
    const imgH = displayImg.clientHeight;

    // Scale factor from displayed to natural
    const natW = naturalImg.naturalWidth;
    const natH = naturalImg.naturalHeight;
    const scaleX = natW / imgW;
    const scaleY = natH / imgH;

    // Calculate source rectangle in the natural image
    const sx = (overlayLeft - imgLeft) * scaleX;
    const sy = (overlayTop - imgTop) * scaleY;
    const sWidth = overlaySize * scaleX;
    const sHeight = overlaySize * scaleY;

    // Create canvas
    const canvas = document.createElement('canvas');
    const outputSize = 200;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    // Circular clip
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Draw the cropped portion
    ctx.drawImage(naturalImg, sx, sy, sWidth, sHeight, 0, 0, outputSize, outputSize);

    // Convert to WEBP at 70% quality
    const dataUrl = canvas.toDataURL('image/webp', 0.7);

    // Update the avatar preview
    currentAvatarDataUrl = dataUrl;
    document.getElementById('avatarPreviewImg').src = dataUrl;
    document.getElementById('avatarPreviewImg').style.display = 'block';
    document.getElementById('avatarPreviewInitial').style.display = 'none';
    document.getElementById('btnRemoveAvatar').style.display = 'inline-block';

    closeCropperModal();
};

window.removeAvatar = function () {
    currentAvatarDataUrl = null;
    document.getElementById('avatarPreviewImg').src = '';
    document.getElementById('avatarPreviewImg').style.display = 'none';
    document.getElementById('avatarPreviewInitial').style.display = 'block';
    document.getElementById('btnRemoveAvatar').style.display = 'none';
};

function updateAvatarPreviewInitial() {
    const name = document.getElementById('newContactName').value.trim();
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    document.getElementById('avatarPreviewInitial').textContent = initial;
}

// Listen to name changes to update avatar initial
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('newContactName');
    if (nameInput) {
        nameInput.addEventListener('input', updateAvatarPreviewInitial);
    }
});

// ==================== AVATAR VIEWER MODAL ====================

window.openAvatarModal = function (name, dataUrl) {
    const modal = document.getElementById('avatarViewerModal');
    document.getElementById('avatarViewerName').textContent = name;
    document.getElementById('avatarViewerImg').src = dataUrl;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
};

window.closeAvatarViewer = function () {
    const modal = document.getElementById('avatarViewerModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('avatarViewerImg').src = '';
    }, 300);
};
