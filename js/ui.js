// ===== UI Controller Module =====
const ui = {
    currentScreen: 'auth',
    isDarkMode: false,
    isElderMode: false,

    // Initialize UI
    init() {
        this.loadPreferences();
        this.setupEventListeners();
        this.setDefaultDate();
    },

    // Load saved preferences
    loadPreferences() {
        const preferences = storage.getLocal('ui_preferences', {});
        this.isDarkMode = preferences.darkMode || false;
        this.isElderMode = preferences.elderMode || false;

        if (this.isDarkMode) {
            document.body.classList.add('dark-mode');
        }
        if (this.isElderMode) {
            document.body.classList.add('elder-mode');
        }
    },

    // Setup event listeners
    setupEventListeners() {
        // Allow Enter to submit forms
        document.getElementById('pinInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') auth.login();
        });

        document.getElementById('setupPin')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') auth.setup();
        });
    },

    // Set default date to today
    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('expenseDate');
        if (dateInput) {
            dateInput.value = today;
        }
    },

    // Show screens
    showAuthScreen() {
        this.switchScreen('authScreen');
        auth.showLoginForm();
    },

    showDashboard() {
        this.switchScreen('dashboardScreen');
        this.updateDashboard();
    },

    showAddExpenseScreen() {
        this.switchScreen('addExpenseScreen');
        this.setDefaultDate();
    },

    showExpenseHistory() {
        this.switchScreen('expenseHistoryScreen');
        expenses.loadExpenses();
    },

    showCreditDebit() {
        this.switchScreen('creditDebitScreen');
        creditDebit.loadRecords();
    },

    showAnalytics() {
        this.switchScreen('analyticsScreen');
        analytics.loadAnalytics();
    },

    showSettings() {
        this.switchScreen('settingsScreen');
        this.loadSettingsForm();
    },

    // Switch screen
    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
        this.updateNavigation(screenId);
    },

    // Update navigation active state
    updateNavigation(screenId) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const navMap = {
            'dashboardScreen': 0,
            'expenseHistoryScreen': 1,
            'creditDebitScreen': 2,
            'analyticsScreen': 3,
            'settingsScreen': 4
        };

        const navIndex = navMap[screenId];
        if (navIndex !== undefined) {
            document.querySelectorAll('.nav-btn')[navIndex].classList.add('active');
        }
    },

    // Update dashboard
    async updateDashboard() {
        try {
            const todayTotal = await expenses.getTodayTotal();
            const pendingDues = await creditDebit.getPendingDues();

            document.getElementById('todaySpending').textContent = `₹${todayTotal.toFixed(2)}`;
            document.getElementById('pendingDues').textContent = `₹${pendingDues.toFixed(2)}`;

            await expenses.loadRecentTransactions();
        } catch (error) {
            console.error('Error updating dashboard:', error);
        }
    },

    // Dark mode toggle
    toggleDarkMode() {
        this.isDarkMode = !this.isDarkMode;
        document.body.classList.toggle('dark-mode');
        this.savePreferences();
        this.showToast(this.isDarkMode ? 'Dark mode ON' : 'Dark mode OFF', 'success');
    },

    // Elder mode toggle
    toggleEldersMode() {
        this.isElderMode = !this.isElderMode;
        document.body.classList.toggle('elder-mode');
        this.savePreferences();
        this.showToast(this.isElderMode ? 'Elder mode ON' : 'Elder mode OFF', 'success');
    },

    // Save preferences
    savePreferences() {
        const preferences = {
            darkMode: this.isDarkMode,
            elderMode: this.isElderMode
        };
        storage.setLocal('ui_preferences', preferences);
    },

    // Load settings form
    loadSettingsForm() {
        const user = auth.currentUser;
        if (user) {
            document.getElementById('settingName').value = user.name;
            document.getElementById('settingCurrency').value = user.currency;
            document.getElementById('settingLanguage').value = user.language;
        }
    },

    // Save settings
    async saveSettings() {
        try {
            const name = document.getElementById('settingName').value.trim();
            const currency = document.getElementById('settingCurrency').value;
            const language = document.getElementById('settingLanguage').value;

            if (!name) {
                this.showToast('Please enter your name', 'error');
                return;
            }

            auth.currentUser.name = name;
            auth.currentUser.currency = currency;
            auth.currentUser.language = language;

            storage.setLocal('user_profile', auth.currentUser);
            storage.setLocal('current_user', auth.currentUser);

            this.showToast('Settings saved', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showToast('Error saving settings', 'error');
        }
    },

    // Show toast notification
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    // Start voice entry
    startVoiceEntry() {
        voice.start();
    },

    // Show filter options
    showFilterOptions() {
        const filterOptions = document.getElementById('filterOptions');
        filterOptions.classList.toggle('hidden');
    },

    // Credit/Debit tab switching
    switchCreditTab(type) {
        const lentSection = document.getElementById('lentSection');
        const oweSection = document.getElementById('oweSection');
        const tabBtns = document.querySelectorAll('.tab-btn');

        if (type === 'lent') {
            lentSection.classList.add('active');
            lentSection.classList.remove('hidden');
            oweSection.classList.remove('active');
            oweSection.classList.add('hidden');
            tabBtns[0].classList.add('active');
            tabBtns[1].classList.remove('active');
        } else {
            oweSection.classList.add('active');
            oweSection.classList.remove('hidden');
            lentSection.classList.remove('active');
            lentSection.classList.add('hidden');
            tabBtns[1].classList.add('active');
            tabBtns[0].classList.remove('active');
        }
    },

    // Show add credit form
    showAddCreditForm(type) {
        creditDebit.addRecord(type);
    }
};
