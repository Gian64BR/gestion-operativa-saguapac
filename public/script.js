/**
 * Cooperative Agua - Frontend Logic
 * Handles basic interactions, UI toggles, and form submissions
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- 0. Rellenar automáticamente el login tras crear un usuario ---
    try {
        const prefillRaw = sessionStorage.getItem('prefillLogin');
        if (prefillRaw) {
            const prefill = JSON.parse(prefillRaw);
            const userInput = document.getElementById('username');
            const passInput = document.getElementById('password');
            if (userInput && passInput && prefill.username) {
                userInput.value = prefill.username;
                passInput.value = prefill.password || '';
                const loginBtn = document.querySelector('#loginForm button[type="submit"]');
                if (loginBtn) loginBtn.focus();
            }
            sessionStorage.removeItem('prefillLogin');
        }
    } catch (e) {
        sessionStorage.removeItem('prefillLogin');
    }

    // --- 1. Password Visibility Toggles ---

    const setupPasswordToggle = (toggleId, inputId) => {
        const toggleBtn = document.getElementById(toggleId);
        const inputField = document.getElementById(inputId);

        if (toggleBtn && inputField) {
            toggleBtn.addEventListener('click', () => {
                const type = inputField.getAttribute('type') === 'password' ? 'text' : 'password';
                inputField.setAttribute('type', type);

                // Toggle icon state (simplified visual cue)
                toggleBtn.style.color = type === 'text' ? 'var(--color-accent)' : 'var(--color-text-muted)';
            });
        }
    };

    setupPasswordToggle('toggleLoginPassword', 'password');
    setupPasswordToggle('toggleRegPassword', 'newPassword');
    setupPasswordToggle('toggleConfirmPassword', 'confirmPassword');

    // --- 3. Form Submissions ---

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const btn = loginForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Verificando... <div class="ripple"></div>';

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;

            // 🔒 SECURITY FIX: Removed hardcoded credentials backdoor
            fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        localStorage.clear(); // Limpiar rastro previo
                        // Normalizar rol: 'administrador' -> 'admin' para compatibilidad con el frontend
                        const normalizedRole = data.role === 'administrador' ? 'admin' : data.role;
                        localStorage.setItem('userRole', normalizedRole);
                        localStorage.setItem('userName', data.fullName || username);
                        localStorage.setItem('userId', data.userId);
                        // Redirigir a la página original o al dashboard por defecto
                        const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
                        sessionStorage.removeItem('redirectAfterLogin');
                        window.location.href = redirectUrl || 'dashboard.html';
                    } else {
                        alert(data.message);
                        btn.innerHTML = originalText;
                    }
                })
                .catch(err => {
                    console.error(err);
                    alert("Error de conexión al servidor. Intente más tarde.");
                    btn.innerHTML = originalText;
                });
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const pass = document.getElementById('newPassword').value;
            const confirmPass = document.getElementById('confirmPassword').value;

            if (pass !== confirmPass) {
                alert("Las contraseñas no coinciden. Por favor, intente nuevamente.");
                return;
            }

            if (pass.length < 8) {
                alert("La contraseña debe tener más de 8 caracteres.");
                return;
            }

            const usernameInput = document.getElementById('newUsername');
            const username = usernameInput ? usernameInput.value.trim() : 'Nuevo Usuario';
            const fullNameInput = document.getElementById('fullname');
            const fullName = fullNameInput ? fullNameInput.value.trim() : username;
            const docIdInput = document.getElementById('documentId');
            const documentId = docIdInput ? docIdInput.value.trim() : null;
            const roleSelect = document.getElementById('role');
            const role = roleSelect ? roleSelect.value : 'operador';

            const btn = registerForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Registrando... <div class="ripple"></div>';

            fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password: pass, role, fullName, documentId })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert("🟢 Usuario registrado correctamente. Por favor inicie sesión.");
                        btn.innerHTML = originalText;
                        sessionStorage.setItem('prefillLogin', JSON.stringify({ username, password: pass }));
                        window.location.href = 'index.html';
                    } else {
                        alert("Error: " + (data.message || 'No se pudo registrar'));
                        btn.innerHTML = originalText;
                    }
                })
                .catch(err => {
                    console.error(err);
                    alert("Error de conexión al servidor. Intente más tarde.");
                    btn.innerHTML = originalText;
                });
        });
    }

    // --- 3.b Registro Rápido (nombre + carnet) ---
    const quickForm = document.getElementById('quickRegisterForm');
    const regTabs = document.querySelectorAll('.reg-tab');
    const regPanels = document.querySelectorAll('.reg-panel');

    function generarPasswordRapida(nombreCompleto, carnet) {
        const palabras = (nombreCompleto || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
        const iniciales = palabras.map(p =>
            p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase()
        ).join('');
        const ci = (carnet || '').replace(/\D/g, '');
        return { ci, iniciales, password: `${ci}${iniciales}` };
    }

    function actualizarPreviewRapida() {
        const nombre = document.getElementById('quickFullName').value;
        const carnet = document.getElementById('quickCarnet').value;
        const { ci, password } = generarPasswordRapida(nombre, carnet);
        const userEl = document.getElementById('quickPreviewUser');
        const passEl = document.getElementById('quickPreviewPass');
        if (userEl) userEl.textContent = ci || '—';
        if (passEl) passEl.textContent = password || '—';
    }

    const quickFullNameInput = document.getElementById('quickFullName');
    const quickCarnetInput = document.getElementById('quickCarnet');
    if (quickFullNameInput) quickFullNameInput.addEventListener('input', actualizarPreviewRapida);
    if (quickCarnetInput) quickCarnetInput.addEventListener('input', actualizarPreviewRapida);

    if (regTabs.length && regPanels.length) {
        regTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                regTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.getAttribute('data-tab');
                regPanels.forEach(panel => {
                    panel.classList.toggle('hidden', panel.getAttribute('data-panel') !== target);
                });
            });
        });
    }

    if (quickForm) {
        quickForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const fullName = document.getElementById('quickFullName').value.trim();
            const carnet = document.getElementById('quickCarnet').value.trim();

            if (!fullName || !carnet) {
                alert('Ingrese el nombre completo y el número de carnet.');
                return;
            }

            const { ci } = generarPasswordRapida(fullName, carnet);
            const btn = quickForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Creando... <div class="ripple"></div>';

            fetch('/api/register-quick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, documentId: ci })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert(`🟢 Cuenta creada con registro rápido.\n\nUsuario: ${data.username}\nContraseña: ${data.password}\nRol: Operador`);
                        sessionStorage.setItem('prefillLogin', JSON.stringify({ username: data.username, password: data.password }));
                        window.location.href = 'index.html';
                    } else {
                        alert('Error: ' + (data.message || 'No se pudo crear la cuenta'));
                        btn.innerHTML = originalText;
                    }
                })
                .catch(err => {
                    console.error(err);
                    alert('Error de conexión al servidor. Intente más tarde.');
                    btn.innerHTML = originalText;
                });
        });
    }

    // --- 4. Button Ripple Effects ---
    const buttons = document.querySelectorAll('.btn-primary');
    buttons.forEach(btn => {
        btn.addEventListener('click', function (e) {
            let ripple = this.querySelector('.ripple');
            if (ripple) {
                // If ripple exists, remove animation class to restart it
                ripple.style.animation = 'none';
                ripple.offsetHeight; /* trigger reflow */
                ripple.style.animation = null;
            } else {
                // Should not happen if HTML is correct, but safe fallback
                ripple = document.createElement('div');
                ripple.classList.add('ripple');
                this.appendChild(ripple);
            }
        });
    });
});
