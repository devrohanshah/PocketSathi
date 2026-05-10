// ===== Expenses Module =====
const expenses = {
    currentFilter: { category: '', month: '' },
    categoryEmojis: {
        'Food': '🍔',
        'Transport': '🚗',
        'Shopping': '🛍️',
        'Entertainment': '🎬',
        'Utilities': '💡',
        'Health': '⚕️',
        'Education': '📚',
        'Other': '📌'
    },

    // Add new expense
    async addExpense() {
        const amount = parseFloat(document.getElementById('expenseAmount').value);
        const category = document.getElementById('expenseCategory').value;
        const title = document.getElementById('expenseTitle').value.trim();
        const paymentMethod = document.getElementById('paymentMethod').value;
        const date = document.getElementById('expenseDate').value;
        const note = document.getElementById('expenseNote').value.trim();

        // Validation
        if (!amount || amount <= 0) {
            ui.showToast('Please enter valid amount', 'error');
            return;
        }

        if (!category) {
            ui.showToast('Please select category', 'error');
            return;
        }

        if (!date) {
            ui.showToast('Please select date', 'error');
            return;
        }

        const expense = {
            id: Date.now(),
            amount,
            category,
            title: title || 'Expense',
            paymentMethod,
            date,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            note,
            createdAt: new Date().toISOString()
        };

        try {
            await storage.add('expenses', expense);
            ui.showToast('Expense added successfully', 'success');
            
            // Clear form
            document.getElementById('expenseForm').reset();
            document.getElementById('expenseDate').valueAsDate = new Date();
            
            // Update UI
            ui.showDashboard();
            await this.loadRecentTransactions();
        } catch (error) {
            console.error('Error adding expense:', error);
            ui.showToast('Error adding expense', 'error');
        }
    },

    // Load recent transactions for dashboard
    async loadRecentTransactions() {
        try {
            const allExpenses = await storage.getAll('expenses');
            const sorted = allExpenses
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);

            const container = document.getElementById('recentTransactions');

            if (sorted.length === 0) {
                container.innerHTML = '<p class="empty-state">No transactions yet</p>';
                return;
            }

            container.innerHTML = sorted.map(exp => `
                <div class="transaction-item" onclick="expenses.showExpenseDetail(${exp.id})">
                    <div class="item-left">
                        <span class="item-title">${this.categoryEmojis[exp.category] || '📌'} ${exp.title}</span>
                        <span class="item-meta">${exp.date} • ${exp.paymentMethod}</span>
                    </div>
                    <span class="item-amount amount-negative">-₹${exp.amount.toFixed(2)}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    },

    // Load all expenses for history
    async loadExpenses() {
        try {
            let allExpenses = await storage.getAll('expenses');

            // Apply filters
            if (this.currentFilter.category) {
                allExpenses = allExpenses.filter(e => e.category === this.currentFilter.category);
            }

            if (this.currentFilter.month) {
                allExpenses = allExpenses.filter(e => e.date.startsWith(this.currentFilter.month));
            }

            const sorted = allExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

            const container = document.getElementById('expensesList');

            if (sorted.length === 0) {
                container.innerHTML = '<p class="empty-state">No expenses found</p>';
                return;
            }

            container.innerHTML = sorted.map(exp => `
                <div class="expense-item" onclick="expenses.showExpenseDetail(${exp.id})">
                    <div class="item-left">
                        <span class="item-title">${this.categoryEmojis[exp.category] || '📌'} ${exp.title}</span>
                        <span class="item-meta">${exp.date} • ${exp.paymentMethod}</span>
                        ${exp.note ? `<span class="item-meta">📝 ${exp.note}</span>` : ''}
                    </div>
                    <div>
                        <span class="item-amount amount-negative">-₹${exp.amount.toFixed(2)}</span>
                        <button class="delete-btn" onclick="event.stopPropagation(); expenses.deleteExpense(${exp.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading expenses:', error);
        }
    },

    // Filter expenses
    async filterExpenses() {
        this.currentFilter.category = document.getElementById('filterCategory').value;
        this.currentFilter.month = document.getElementById('filterMonth').value;
        await this.loadExpenses();
    },

    // Show expense detail
    async showExpenseDetail(id) {
        try {
            const expense = await storage.get('expenses', id);
            if (expense) {
                alert(`${expense.title}\n\nAmount: ₹${expense.amount}\nCategory: ${expense.category}\nDate: ${expense.date}\nPayment: ${expense.paymentMethod}\n${expense.note ? `Note: ${expense.note}` : ''}`);
            }
        } catch (error) {
            console.error('Error loading expense detail:', error);
        }
    },

    // Delete expense
    async deleteExpense(id) {
        if (!confirm('Are you sure you want to delete this expense?')) return;

        try {
            await storage.delete('expenses', id);
            ui.showToast('Expense deleted', 'success');
            await this.loadExpenses();
            await this.loadRecentTransactions();
        } catch (error) {
            console.error('Error deleting expense:', error);
            ui.showToast('Error deleting expense', 'error');
        }
    },

    // Get today's total
    async getTodayTotal() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const allExpenses = await storage.getAll('expenses');
            const todayExpenses = allExpenses.filter(e => e.date === today);
            return todayExpenses.reduce((sum, e) => sum + e.amount, 0);
        } catch (error) {
            console.error('Error calculating today total:', error);
            return 0;
        }
    },

    // Get monthly total
    async getMonthlyTotal() {
        try {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const allExpenses = await storage.getAll('expenses');
            const monthlyExpenses = allExpenses.filter(e => e.date.startsWith(currentMonth));
            return monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
        } catch (error) {
            console.error('Error calculating monthly total:', error);
            return 0;
        }
    },

    // Get category breakdown
    async getCategoryBreakdown() {
        try {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const allExpenses = await storage.getAll('expenses');
            const monthlyExpenses = allExpenses.filter(e => e.date.startsWith(currentMonth));

            const breakdown = {};
            monthlyExpenses.forEach(exp => {
                if (!breakdown[exp.category]) {
                    breakdown[exp.category] = 0;
                }
                breakdown[exp.category] += exp.amount;
            });

            return breakdown;
        } catch (error) {
            console.error('Error calculating category breakdown:', error);
            return {};
        }
    }
};