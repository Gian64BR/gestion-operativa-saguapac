/**
 * Cooperative Agua - Frontend Logic
 * Handles basic interactions, UI toggles, and form submissions
 */

document.addEventListener('DOMContentLoaded', () => {

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
