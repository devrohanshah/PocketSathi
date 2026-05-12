// ===== Analytics Module =====
const analytics = {
    chart: null,

    // Initialize analytics
    async init() {
        await this.loadAnalytics();
    },

    // Load analytics data
    async loadAnalytics() {
        try {
            const monthlyTotal = await expenses.getMonthlyTotal();
            const categoryBreakdown = await expenses.getCategoryBreakdown();

            // Get number of days in current month
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const dailyAverage = monthlyTotal / daysInMonth;

            // Update stats
            document.getElementById('monthlyTotal').textContent = `₹${monthlyTotal.toFixed(2)}`;
            document.getElementById('dailyAverage').textContent = `₹${dailyAverage.toFixed(2)}`;

            // Render category chart
            await this.renderChart(categoryBreakdown);

            // Render category breakdown list
            this.renderCategoryList(categoryBreakdown);
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    },

    // Render chart using Chart.js
    async renderChart(categoryBreakdown) {
        const ctx = document.getElementById('categoryChart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        const labels = Object.keys(categoryBreakdown);
        const data = Object.values(categoryBreakdown);
        const colors = [
            '#4F46E5', '#06B6D4', '#10B981', '#F59E0B',
            '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'
        ];

        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderColor: 'var(--bg-primary)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'var(--text-primary)',
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    },

    // Render category breakdown list
    renderCategoryList(categoryBreakdown) {
        const container = document.getElementById('categoryBreakdown');
        
        if (Object.keys(categoryBreakdown).length === 0) {
            container.innerHTML = '<p class="empty-state">No spending data</p>';
            return;
        }

        const sorted = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]);

        container.innerHTML = sorted.map(([category, amount]) => {
            const percentage = (amount / Object.values(categoryBreakdown).reduce((a, b) => a + b, 0) * 100).toFixed(1);
            return `
                <div class="category-item">
                    <div class="item-left">
                        <span class="item-title">${expenses.categoryEmojis[category] || '📌'} ${category}</span>
                        <div style="background: var(--bg-tertiary); height: 6px; border-radius: 3px; margin-top: 6px;">
                            <div style="background: var(--primary-color); height: 100%; border-radius: 3px; width: ${percentage}%;"></div>
                        </div>
                    </div>
                    <div>
                        <div class="item-amount">₹${amount.toFixed(2)}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${percentage}%</div>
                    </div>
                </div>
            `;
        }).join('');
    }
};
