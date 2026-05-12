// ===== IndexedDB Storage Module =====
const storage = {
    dbName: 'PocketSathiDB',
    version: 1,
    db: null,

    // Initialize IndexedDB
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('expenses')) {
                    const expenseStore = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
                    expenseStore.createIndex('date', 'date', { unique: false });
                    expenseStore.createIndex('category', 'category', { unique: false });
                }

                if (!db.objectStoreNames.contains('credits')) {
                    const creditStore = db.createObjectStore('credits', { keyPath: 'id', autoIncrement: true });
                    creditStore.createIndex('type', 'type', { unique: false });
                    creditStore.createIndex('date', 'date', { unique: false });
                }

                if (!db.objectStoreNames.contains('reminders')) {
                    const reminderStore = db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
                    reminderStore.createIndex('date', 'date', { unique: false });
                }

                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    },

    // Add item to store
    async add(storeName, data) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Get all items from store
    async getAll(storeName) {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Get item by ID
    async get(storeName, id) {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);

        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Update item
    async update(storeName, data) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Delete item
    async delete(storeName, id) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // Query by index
    async queryByIndex(storeName, indexName, value) {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);

        return new Promise((resolve, reject) => {
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Clear entire store
    async clear(storeName) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // LocalStorage helpers
    setLocal(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('LocalStorage error:', e);
        }
    },

    getLocal(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('LocalStorage error:', e);
            return defaultValue;
        }
    },

    removeLocal(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('LocalStorage error:', e);
        }
    },

    // Export data as JSON
    async exportData() {
        try {
            const expenses = await this.getAll('expenses');
            const credits = await this.getAll('credits');
            const reminders = await this.getAll('reminders');
            const settings = this.getLocal('user_settings', {});

            const exportData = {
                version: 1,
                exportDate: new Date().toISOString(),
                expenses,
                credits,
                reminders,
                settings
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `PocketSathi_backup_${new Date().getTime()}.json`;
            link.click();
            URL.revokeObjectURL(url);

            ui.showToast('Data exported successfully', 'success');
        } catch (error) {
            console.error('Export error:', error);
            ui.showToast('Error exporting data', 'error');
        }
    },

    // Import data from JSON
    async importData(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const text = await file.text();
            const importData = JSON.parse(text);

            // Clear existing data
            await this.clear('expenses');
            await this.clear('credits');
            await this.clear('reminders');

            // Import expenses
            if (importData.expenses && Array.isArray(importData.expenses)) {
                for (const expense of importData.expenses) {
                    await this.add('expenses', expense);
                }
            }

            // Import credits
            if (importData.credits && Array.isArray(importData.credits)) {
                for (const credit of importData.credits) {
                    await this.add('credits', credit);
                }
            }

            // Import reminders
            if (importData.reminders && Array.isArray(importData.reminders)) {
                for (const reminder of importData.reminders) {
                    await this.add('reminders', reminder);
                }
            }

            // Import settings
            if (importData.settings) {
                this.setLocal('user_settings', importData.settings);
            }

            ui.showToast('Data imported successfully', 'success');
            setTimeout(() => location.reload(), 1000);
        } catch (error) {
            console.error('Import error:', error);
            ui.showToast('Error importing data', 'error');
        }
    },

    // Show import file dialog
    showImportForm() {
        document.getElementById('importFile').click();
    }
};
