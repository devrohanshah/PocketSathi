// ===== Authentication Module =====
const auth = {
    currentUser: null,
    isAuthenticated: false,

    // Initialize auth
    init() {
        this.currentUser = storage.getLocal('current_user', null);
        this.isAuthenticated = !!this.currentUser;
        
        if (this.isAuthenticated) {
            ui.showDashboard();
        } else {
            ui.showAuthScreen();
        }
    },

    // Show login form
    showLoginForm() {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('setupForm').classList.add('hidden');
        document.getElementById('pinInput').focus();
    },

    // Show setup form
    showSetupForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('setupForm').classList.remove('hidden');
        document.getElementById('nameInput').focus();
    },

    // Login with PIN
    login() {
        const pin = document.getElementById('pinInput').value.trim();

        if (!pin) {
            ui.showToast('Please enter PIN', 'error');
            return;
        }

        const user = storage.getLocal('user_profile', null);

        if (!user) {
            ui.showToast('No user profile found', 'error');
            return;
        }

        if (this.hashPin(pin) === user.pin_hash) {
            this.currentUser = user;
            this.isAuthenticated = true;
            storage.setLocal('current_user', user);
            ui.showToast('Welcome back!', 'success');
            document.getElementById('pinInput').value = '';
            ui.showDashboard();
        } else {
            ui.showToast('Invalid PIN', 'error');
            document.getElementById('pinInput').value = '';
            document.getElementById('pinInput').focus();
        }
    },

    // Setup new user
    setup() {
        const name = document.getElementById('nameInput').value.trim();
        const currency = document.getElementById('currencySelect').value;
        const pin = document.getElementById('setupPin').value.trim();
        const confirmPin = document.getElementById('confirmPin').value.trim();

        // Validation
        if (!name) {
            ui.showToast('Please enter your name', 'error');
            return;
        }

        if (pin.length < 4 || pin.length > 6) {
            ui.showToast('PIN must be 4-6 digits', 'error');
            return;
        }

        if (pin !== confirmPin) {
            ui.showToast('PINs do not match', 'error');
            return;
        }

        if (!/^\d+$/.test(pin)) {
            ui.showToast('PIN must be numeric', 'error');
            return;
        }

        // Create user profile
        const userProfile = {
            id: 1,
            name,
            currency,
            pin_hash: this.hashPin(pin),
            created_at: new Date().toISOString(),
            language: 'en',
            theme: 'light'
        };

        storage.setLocal('user_profile', userProfile);
        this.currentUser = userProfile;
        this.isAuthenticated = true;
        storage.setLocal('current_user', userProfile);

        ui.showToast('Profile created successfully', 'success');
        
        // Clear form
        document.getElementById('nameInput').value = '';
        document.getElementById('setupPin').value = '';
        document.getElementById('confirmPin').value = '';

        ui.showDashboard();
    },

    // Simple hash function for PIN
    hashPin(pin) {
        return btoa(pin + 'PocketSathi_Salt_12345');
    },

    // Show change PIN dialog
    showChangePin() {
        const currentPin = prompt('Enter current PIN:');
        if (!currentPin) return;

        if (this.hashPin(currentPin) !== this.currentUser.pin_hash) {
            ui.showToast('Invalid PIN', 'error');
            return;
        }

        const newPin = prompt('Enter new PIN (4-6 digits):');
        if (!newPin) return;

        const confirmNewPin = prompt('Confirm new PIN:');
        if (!confirmNewPin) return;

        if (newPin !== confirmNewPin) {
            ui.showToast('PINs do not match', 'error');
            return;
        }

        if (newPin.length < 4 || newPin.length > 6) {
            ui.showToast('PIN must be 4-6 digits', 'error');
            return;
        }

        if (!/^\d+$/.test(newPin)) {
            ui.showToast('PIN must be numeric', 'error');
            return;
        }

        // Update PIN
        this.currentUser.pin_hash = this.hashPin(newPin);
        storage.setLocal('user_profile', this.currentUser);
        storage.setLocal('current_user', this.currentUser);

        ui.showToast('PIN changed successfully', 'success');
    },

    // Logout
    logout() {
        if (confirm('Are you sure you want to logout?')) {
            this.currentUser = null;
            this.isAuthenticated = false;
            storage.removeLocal('current_user');
            document.getElementById('pinInput').value = '';
            ui.showAuthScreen();
        }
    }
};
