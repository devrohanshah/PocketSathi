// ===== Reminders Module =====
const reminders = {
    // Request notification permission
    async requestPermission() {
        if (!('Notification' in window)) {
            console.log('Notifications not supported');
            return;
        }

        if (Notification.permission === 'granted') {
            return;
        }

        if (Notification.permission !== 'denied') {
            await Notification.requestPermission();
        }
    },

    // Add reminder
    async addReminder() {
        const title = prompt('Reminder title:');
        if (!title) return;

        const description = prompt('Description (optional):');
        const date = prompt('Due date (YYYY-MM-DD):');
        if (!date) return;

        const repeat = prompt('Repeat? (daily/weekly/once):', 'once');

        const reminder = {
            id: Date.now(),
            title,
            description: description || '',
            date,
            repeat,
            notification_status: 'pending',
            created_at: new Date().toISOString()
        };

        try {
            await storage.add('reminders', reminder);
            ui.showToast('Reminder added', 'success');
            await this.checkReminders();
        } catch (error) {
            console.error('Error adding reminder:', error);
            ui.showToast('Error adding reminder', 'error');
        }
    },

    // Check for due reminders
    async checkReminders() {
        try {
            await this.requestPermission();
            const allReminders = await storage.getAll('reminders');
            const today = new Date().toISOString().split('T')[0];

            for (const reminder of allReminders) {
                if (reminder.date === today && reminder.notification_status === 'pending') {
                    this.sendNotification(reminder.title, reminder.description);
                    reminder.notification_status = 'notified';
                    await storage.update('reminders', reminder);
                }
            }
        } catch (error) {
            console.error('Error checking reminders:', error);
        }
    },

    // Send notification
    sendNotification(title, description) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('PocketSathi Reminder', {
                body: `${title}\n${description}`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%234F46E5" width="192" height="192"/><text x="96" y="120" font-size="120" font-weight="bold" fill="white" text-anchor="middle">₹</text></svg>',
                tag: 'pocketsathi-reminder'
            });
        }
    },

    // Start checking reminders periodically
    startPeriodicCheck() {
        setInterval(() => this.checkReminders(), 60000); // Check every minute
    }
};