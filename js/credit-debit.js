// ===== Credit/Debit Module =====
const creditDebit = {
    // Add credit or debt record
    async addRecord(type) {
        const personName = prompt('Person name:');
        if (!personName) return;

        const amount = parseFloat(prompt('Amount:'));
        if (!amount || amount <= 0) {
            ui.showToast('Invalid amount', 'error');
            return;
        }

        const dueDate = prompt('Due date (YYYY-MM-DD):');
        if (!dueDate) return;

        const record = {
            id: Date.now(),
            person_name: personName,
            type: type, // 'lent' or 'owe'
            amount,
            paid_amount: 0,
            remaining_amount: amount,
            due_date: dueDate,
            status: 'pending', // pending, partial, completed
            created_at: new Date().toISOString()
        };

        try {
            await storage.add('credits', record);
            ui.showToast(`${type === 'lent' ? 'Lending' : 'Debt'} record added`, 'success');
            await this.loadRecords();
        } catch (error) {
            console.error('Error adding record:', error);
            ui.showToast('Error adding record', 'error');
        }
    },

    // Load all credit/debit records
    async loadRecords() {
        try {
            const allRecords = await storage.getAll('credits');
            const lentRecords = allRecords.filter(r => r.type === 'lent');
            const oweRecords = allRecords.filter(r => r.type === 'owe');

            await this.renderRecords('lent', lentRecords);
            await this.renderRecords('owe', oweRecords);
            await this.updateCreditSummary(lentRecords, oweRecords);
        } catch (error) {
            console.error('Error loading records:', error);
        }
    },

    // Render records by type
    async renderRecords(type, records) {
        const containerId = type === 'lent' ? 'lentList' : 'oweList';
        const container = document.getElementById(containerId);

        if (records.length === 0) {
            container.innerHTML = '<p class="empty-state">No records</p>';
            return;
        }

        container.innerHTML = records.map(record => {
            const statusClass = record.status === 'completed' ? 'text-success' : 
                               record.status === 'partial' ? 'text-warning' : 'text-danger';
            
            return `
                <div class="credit-item">
                    <div class="item-left">
                        <span class="item-title">${record.person_name}</span>
                        <span class="item-meta">Due: ${record.due_date}</span>
                        <span class="item-meta">Status: ${record.status}</span>
                    </div>
                    <div style="text-align: right;">
                        <div class="item-amount ${statusClass}">₹${record.remaining_amount.toFixed(2)}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            Paid: ₹${record.paid_amount.toFixed(2)}
                        </div>
                        <div style="display: flex; gap: 4px; margin-top: 8px;">
                            <button onclick="creditDebit.markPartialPayment(${record.id})" style="flex: 1; padding: 4px; font-size: 11px;">Pay</button>
                            <button onclick="creditDebit.markComplete(${record.id})" style="flex: 1; padding: 4px; font-size: 11px;">Complete</button>
                            <button onclick="creditDebit.deleteRecord(${record.id})" style="flex: 1; padding: 4px; font-size: 11px;">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Update credit summary
    async updateCreditSummary(lentRecords, oweRecords) {
        const totalLent = lentRecords.reduce((sum, r) => sum + r.remaining_amount, 0);
        const totalOwe = oweRecords.reduce((sum, r) => sum + r.remaining_amount, 0);

        document.getElementById('totalLent').textContent = `₹${totalLent.toFixed(2)}`;
        document.getElementById('totalOwe').textContent = `₹${totalOwe.toFixed(2)}`;
    },

    // Mark partial payment
    async markPartialPayment(id) {
        try {
            const record = await storage.get('credits', id);
            if (!record) return;

            const paymentAmount = parseFloat(prompt(`Remaining: ₹${record.remaining_amount}\nEnter payment amount:`));
            if (!paymentAmount || paymentAmount <= 0) return;

            if (paymentAmount > record.remaining_amount) {
                ui.showToast('Payment exceeds remaining amount', 'error');
                return;
            }

            record.paid_amount += paymentAmount;
            record.remaining_amount -= paymentAmount;
            record.status = record.remaining_amount > 0 ? 'partial' : 'completed';

            await storage.update('credits', record);
            ui.showToast('Payment recorded', 'success');
            await this.loadRecords();
        } catch (error) {
            console.error('Error recording payment:', error);
            ui.showToast('Error recording payment', 'error');
        }
    },

    // Mark as complete
    async markComplete(id) {
        try {
            const record = await storage.get('credits', id);
            if (!record) return;

            record.paid_amount = record.amount;
            record.remaining_amount = 0;
            record.status = 'completed';

            await storage.update('credits', record);
            ui.showToast('Record marked as complete', 'success');
            await this.loadRecords();
        } catch (error) {
            console.error('Error updating record:', error);
            ui.showToast('Error updating record', 'error');
        }
    },

    // Delete record
    async deleteRecord(id) {
        if (!confirm('Delete this record?')) return;

        try {
            await storage.delete('credits', id);
            ui.showToast('Record deleted', 'success');
            await this.loadRecords();
        } catch (error) {
            console.error('Error deleting record:', error);
            ui.showToast('Error deleting record', 'error');
        }
    },

    // Get pending dues
    async getPendingDues() {
        try {
            const allRecords = await storage.getAll('credits');
            const pendingRecords = allRecords.filter(r => r.status !== 'completed' && r.type === 'owe');
            return pendingRecords.reduce((sum, r) => sum + r.remaining_amount, 0);
        } catch (error) {
            console.error('Error calculating pending dues:', error);
            return 0;
        }
    }
};
