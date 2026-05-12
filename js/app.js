(function () {
  "use strict";

  const DB_NAME = "PocketSathiDB";
  const DB_VERSION = 3;
  const BUDGET_CYCLE_DAYS = 30;
  const STORES = ["expenses", "credits", "reminders", "analytics"];
  const CATEGORY_KEYWORDS = {
    Food: ["food", "tea", "coffee", "lunch", "dinner", "breakfast", "snack", "milk", "grocery", "pizza", "momo", "chai", "khana", "சாப்பாடு"],
    Transport: ["petrol", "fuel", "bus", "train", "taxi", "auto", "rickshaw", "uber", "ola", "metro", "bus"],
    Shopping: ["shop", "shopping", "clothes", "mobile", "purchase", "buy", "shoes", "dress"],
    Utilities: ["electricity", "water", "gas", "internet", "recharge", "bill", "rent", "hostel"],
    Health: ["medicine", "doctor", "hospital", "health", "pharmacy"],
    Education: ["school", "college", "book", "course", "fees", "tuition", "class"],
    Entertainment: ["movie", "game", "party", "music", "show", "netflix", "spotify"],
    Other: []
  };

  const App = {
    db: null,
    profile: null,
    deferredPrompt: null,
    recognition: null,
    currentView: "authView",
    toastTimer: null,
    currencySymbols: {
      INR: "Rs",
      NPR: "Rs",
      USD: "$",
      EUR: "EUR",
      GBP: "GBP"
    },

    async init() {
      this.db = await this.openDb();
      this.profile = this.readLocal("profile", null);
      this.removeLocal("session");
      this.migrateLegacyProfile();
      this.applyPreferences();
      this.populateCategorySelects();
      this.setDefaultDates();
      this.bindEvents();
      this.setupVoice();
      this.requestPersistentStorage();
      await this.registerServiceWorker();
      await this.routeFromSession();
      this.checkReminders();
      setInterval(() => this.checkReminders(), 60000);
    },

    openDb() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          if (!db.objectStoreNames.contains("expenses")) {
            const store = db.createObjectStore("expenses", { keyPath: "id" });
            store.createIndex("date", "date", { unique: false });
            store.createIndex("category", "category", { unique: false });
          }

          if (!db.objectStoreNames.contains("credits")) {
            const store = db.createObjectStore("credits", { keyPath: "id" });
            store.createIndex("type", "type", { unique: false });
            store.createIndex("dueDate", "dueDate", { unique: false });
          }

          if (!db.objectStoreNames.contains("reminders")) {
            const store = db.createObjectStore("reminders", { keyPath: "id" });
            store.createIndex("date", "date", { unique: false });
          }

          if (!db.objectStoreNames.contains("analytics")) {
            const store = db.createObjectStore("analytics", { keyPath: "id" });
            store.createIndex("date", "date", { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    tx(storeName, mode = "readonly") {
      return this.db.transaction(storeName, mode).objectStore(storeName);
    },

    add(storeName, value) {
      return this.request(this.tx(storeName, "readwrite").add(value));
    },

    put(storeName, value) {
      return this.request(this.tx(storeName, "readwrite").put(value));
    },

    delete(storeName, id) {
      return this.request(this.tx(storeName, "readwrite").delete(id));
    },

    clear(storeName) {
      return this.request(this.tx(storeName, "readwrite").clear());
    },

    getAll(storeName) {
      return this.request(this.tx(storeName).getAll());
    },

    request(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    readLocal(key, fallback) {
      try {
        const value = localStorage.getItem(`pocketsathi:${key}`);
        return value ? JSON.parse(value) : fallback;
      } catch (error) {
        return fallback;
      }
    },

    writeLocal(key, value) {
      localStorage.setItem(`pocketsathi:${key}`, JSON.stringify(value));
    },

    removeLocal(key) {
      localStorage.removeItem(`pocketsathi:${key}`);
    },

    readSession(key, fallback) {
      try {
        const value = sessionStorage.getItem(`pocketsathi:${key}`);
        return value ? JSON.parse(value) : fallback;
      } catch (error) {
        return fallback;
      }
    },

    writeSession(key, value) {
      sessionStorage.setItem(`pocketsathi:${key}`, JSON.stringify(value));
    },

    removeSession(key) {
      sessionStorage.removeItem(`pocketsathi:${key}`);
    },

    async hashPin(pin, salt) {
      const data = new TextEncoder().encode(`${salt}:${pin}`);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    },

    async routeFromSession() {
      const session = this.readSession("session", null);
      if (this.profile && session === "open") {
        this.fillSettings();
        await this.showView(this.initialRoute());
      } else if (this.profile) {
        this.showAuth();
      } else {
        document.getElementById("loginForm").classList.add("hidden");
        document.getElementById("setupForm").classList.remove("hidden");
        this.showAuth();
      }
    },

    initialRoute() {
      const action = new URLSearchParams(location.search).get("action");
      return {
        add: "addView",
        "add-expense": "addView",
        analytics: "analyticsView",
        debts: "moneyView",
        reminders: "remindersView",
        afford: "affordView",
        survival: "survivalView"
      }[action] || "dashboardView";
    },

    migrateLegacyProfile() {
      if (this.profile) {
        this.profile.monthlyAllowance = Number(this.profile.monthlyAllowance || 0);
        this.profile.cycleDay = Number(this.profile.cycleDay || 1);
        this.writeLocal("profile", this.profile);
        return;
      }

      const legacy = localStorage.getItem("user_profile");
      if (!legacy) return;

      try {
        const parsed = JSON.parse(legacy);
        if (!parsed?.name) return;
        this.profile = {
          name: parsed.name,
          currency: parsed.currency || "INR",
          monthlyAllowance: Number(parsed.monthlyAllowance || 0),
          cycleDay: 1,
          salt: parsed.pin_hash ? "legacy" : String(Date.now()),
          pinHash: parsed.pin_hash || "",
          legacyPin: !!parsed.pin_hash,
          createdAt: parsed.created_at || new Date().toISOString()
        };
        this.writeLocal("profile", this.profile);
      } catch (error) {
        console.warn("Legacy profile migration skipped", error);
      }
    },

    showAuth() {
      this.switchView("authView");
      document.getElementById("bottomNav").classList.add("hidden");
    },

    async showView(viewId) {
      if (!this.profile) {
        this.showAuth();
        return;
      }

      this.switchView(viewId);
      document.getElementById("bottomNav").classList.remove("hidden");
      this.updateNav(viewId);

      if (viewId === "dashboardView") await this.renderDashboard();
      if (viewId === "historyView") await this.renderHistory();
      if (viewId === "moneyView") await this.renderCredits();
      if (viewId === "analyticsView") await this.renderAnalytics();
      if (viewId === "affordView") await this.renderAfford();
      if (viewId === "survivalView") await this.renderSurvival();
      if (viewId === "remindersView") await this.renderReminders();
      if (viewId === "settingsView") this.fillSettings();
    },

    switchView(viewId) {
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      document.getElementById(viewId).classList.add("active");
      this.currentView = viewId;
      window.scrollTo({ top: 0, behavior: "auto" });
    },

    updateNav(viewId) {
      const map = {
        dashboardView: "dashboard",
        addView: "add",
        historyView: "history",
        moneyView: "money",
        analyticsView: "analytics",
        remindersView: "reminders",
        settingsView: "settings"
      };

      document.querySelectorAll(".nav-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.action === map[viewId]);
      });
    },

    bindEvents() {
      document.getElementById("showSetup").addEventListener("click", () => {
        document.getElementById("loginForm").classList.add("hidden");
        document.getElementById("setupForm").classList.remove("hidden");
      });

      document.getElementById("showLogin").addEventListener("click", () => {
        document.getElementById("setupForm").classList.add("hidden");
        document.getElementById("loginForm").classList.remove("hidden");
      });

      document.getElementById("setupForm").addEventListener("submit", (event) => this.createProfile(event));
      document.getElementById("loginForm").addEventListener("submit", (event) => this.login(event));
      document.getElementById("quickExpenseForm").addEventListener("submit", (event) => this.quickAdd(event));
      document.getElementById("expenseForm").addEventListener("submit", (event) => this.saveExpense(event));
      document.getElementById("creditForm").addEventListener("submit", (event) => this.saveCredit(event));
      document.getElementById("reminderForm").addEventListener("submit", (event) => this.saveReminder(event));
      document.getElementById("settingsForm").addEventListener("submit", (event) => this.saveSettings(event));
      document.getElementById("affordForm").addEventListener("submit", (event) => this.checkAfford(event));
      document.getElementById("historyCategory").addEventListener("change", () => this.renderHistory());
      document.getElementById("historyMonth").addEventListener("change", () => this.renderHistory());
      document.getElementById("voiceButton").addEventListener("click", () => this.startVoice());
      document.getElementById("themeToggle").addEventListener("click", () => this.togglePreference("dark"));
      document.getElementById("elderToggle").addEventListener("click", () => this.togglePreference("elder"));
      document.getElementById("exportJson").addEventListener("click", () => this.exportJson());
      document.getElementById("exportCsv").addEventListener("click", () => this.exportCsv());
      document.getElementById("importFile").addEventListener("change", (event) => this.importJson(event));
      document.getElementById("changePin").addEventListener("click", () => this.changePin());
      document.getElementById("logout").addEventListener("click", () => this.logout());
      document.getElementById("navLogout").addEventListener("click", () => this.logout());
      document.getElementById("installApp").addEventListener("click", () => this.promptInstall());
      document.getElementById("installFromSettings").addEventListener("click", () => this.promptInstall());
      document.getElementById("enableNotifications").addEventListener("click", () => this.requestNotifications(true));

      document.body.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-suggestion]");
        if (chip) {
          document.getElementById("quickExpense").value = chip.dataset.suggestion;
          document.getElementById("quickExpense").focus();
          return;
        }

        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;
        const action = actionButton.dataset.action;
        const routes = {
          dashboard: "dashboardView",
          add: "addView",
          history: "historyView",
          money: "moneyView",
          analytics: "analyticsView",
          reminders: "remindersView",
          settings: "settingsView",
          afford: "affordView",
          survival: "survivalView"
        };
        if (routes[action]) this.showView(routes[action]);
      });

      document.body.addEventListener("click", (event) => {
        const button = event.target.closest("[data-record-action]");
        if (!button) return;
        this.handleRecordAction(button.dataset.recordAction, button.dataset.store, button.dataset.id);
      });

      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        this.deferredPrompt = event;
        document.getElementById("installApp").classList.remove("hidden");
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.profile) {
          this.renderDashboard();
          this.checkReminders();
        }
      });

      window.addEventListener("pagehide", () => {
        this.removeSession("session");
      });
    },

    populateCategorySelects() {
      const categories = Object.keys(CATEGORY_KEYWORDS);
      const options = categories.map((category) => `<option value="${category}">${category}</option>`).join("");
      document.getElementById("expenseCategory").innerHTML = options;
      document.getElementById("historyCategory").innerHTML = `<option value="">All categories</option>${options}`;
    },

    setDefaultDates() {
      const today = this.today();
      ["expenseDate", "dueDate", "reminderDate"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = today;
      });
      const monthInput = document.getElementById("historyMonth");
      if (monthInput && !monthInput.value) monthInput.value = today.slice(0, 7);
    },

    async createProfile(event) {
      event.preventDefault();
      const name = document.getElementById("setupName").value.trim();
      const currency = document.getElementById("setupCurrency").value;
      const monthlyAllowance = Number(document.getElementById("setupAllowance").value || 0);
      const pin = document.getElementById("setupPin").value.trim();
      const confirm = document.getElementById("confirmPin").value.trim();

      if (!name) return this.toast("Please enter your name", "error");
      if (monthlyAllowance < 0) return this.toast("Enter valid pocket money", "error");
      if (!/^\d{4,6}$/.test(pin)) return this.toast("PIN must be 4 to 6 digits", "error");
      if (pin !== confirm) return this.toast("PINs do not match", "error");

      const salt = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const pinHash = await this.hashPin(pin, salt);
      this.profile = {
        name,
        currency,
        monthlyAllowance,
        cycleDay: 1,
        salt,
        pinHash,
        createdAt: new Date().toISOString()
      };
      this.writeLocal("profile", this.profile);
      this.writeSession("session", "open");
      event.target.reset();
      this.toast("Profile created", "success");
      await this.showView("dashboardView");
    },

    async login(event) {
      event.preventDefault();
      const pin = document.getElementById("loginPin").value.trim();
      if (!this.profile) return this.toast("Create a local profile first", "warning");
      const pinHash = await this.hashPin(pin, this.profile.salt);
      const legacyHash = btoa(`${pin}PocketSathi_Salt_12345`);
      const isLegacyMatch = this.profile.legacyPin && legacyHash === this.profile.pinHash;

      if (pinHash !== this.profile.pinHash && !isLegacyMatch) {
        document.getElementById("loginPin").value = "";
        return this.toast("Invalid PIN", "error");
      }

      if (isLegacyMatch) {
        this.profile.legacyPin = false;
        this.profile.salt = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        this.profile.pinHash = await this.hashPin(pin, this.profile.salt);
        this.writeLocal("profile", this.profile);
      }

      this.writeSession("session", "open");
      document.getElementById("loginPin").value = "";
      await this.showView("dashboardView");
    },

    async quickAdd(event) {
      event.preventDefault();
      const input = document.getElementById("quickExpense");
      const text = input.value.trim();
      const debt = this.parseDebtText(text);
      if (debt) {
        await this.addCreditRecord(debt);
        input.value = "";
        this.toast("Debt saved", "success");
        await this.renderDashboard();
        return;
      }

      const parsed = this.parseExpenseText(text);
      if (!parsed.amount) return this.toast("Write like: Tea 20", "warning");

      await this.addExpenseRecord({
        title: parsed.title || "Expense",
        amount: parsed.amount,
        category: parsed.category,
        paymentMethod: "Cash",
        date: this.today(),
        note: ""
      });

      this.rememberSuggestion(`${parsed.title || "Expense"} ${parsed.amount}`);
      input.value = "";
      this.toast("Expense saved", "success");
      await this.renderDashboard();
    },

    async addExpenseRecord(data) {
      await this.add("expenses", {
        id: crypto.randomUUID(),
        title: data.title,
        amount: Number(data.amount),
        category: data.category || this.detectCategory(data.title),
        paymentMethod: data.paymentMethod || "Cash",
        date: data.date || this.today(),
        time: this.timeNow(),
        note: data.note || "",
        createdAt: new Date().toISOString()
      });
    },

    async addCreditRecord(data) {
      const amount = Number(data.amount);
      await this.add("credits", {
        id: crypto.randomUUID(),
        type: data.type,
        person: data.person,
        amount,
        paidAmount: 0,
        remainingAmount: amount,
        dueDate: data.dueDate || this.today(),
        note: data.note || "",
        status: "pending",
        history: [],
        createdAt: new Date().toISOString()
      });
    },

    parseExpenseText(text) {
      const raw = text.trim();
      const amountMatch = raw.match(/(?:rs\.?|₹|\$)?\s*(\d+(?:\.\d+)?)/i);
      const amount = amountMatch ? Number(amountMatch[1]) : 0;
      const title = raw.replace(amountMatch ? amountMatch[0] : "", "").replace(/\s+/g, " ").trim();
      const category = this.detectCategory(raw);
      return { title, amount, category };
    },

    parseDebtText(text) {
      const raw = text.trim();
      const lower = raw.toLowerCase();
      if (!/(lent|loaned|owe|borrow|borrowed|udhar|उधार)/.test(lower)) return null;

      const parsed = this.parseExpenseText(raw);
      if (!parsed.amount) return null;
      const type = /(lent|loaned|gave)/.test(lower) ? "lent" : "owe";
      let person = raw
        .replace(/(?:lent|loaned|gave|owe|borrowed|borrow|from|to|rs\.?|₹|\$|\d+(?:\.\d+)?|udhar|उधार)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!person) person = "Friend";
      return { type, person, amount: parsed.amount, dueDate: this.today(), note: "Voice or quick entry" };
    },

    detectCategory(text) {
      const lower = text.toLowerCase();
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some((keyword) => lower.includes(keyword))) return category;
      }
      return "Other";
    },

    async saveExpense(event) {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const amount = Number(data.get("amount"));
      const title = String(data.get("title") || "").trim();
      const date = String(data.get("date") || this.today());

      if (!amount || amount <= 0) return this.toast("Enter a valid amount", "error");

      await this.addExpenseRecord({
        title: title || "Expense",
        amount,
        category: data.get("category"),
        paymentMethod: data.get("paymentMethod"),
        date,
        note: String(data.get("note") || "").trim()
      });

      this.rememberSuggestion(`${title || "Expense"} ${amount}`);
      form.reset();
      this.setDefaultDates();
      this.toast("Expense saved", "success");
      await this.showView("dashboardView");
    },

    async saveCredit(event) {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const amount = Number(data.get("amount"));
      const person = String(data.get("person") || "").trim();

      if (!person) return this.toast("Enter person name", "error");
      if (!amount || amount <= 0) return this.toast("Enter a valid amount", "error");

      await this.addCreditRecord({
        type: data.get("type"),
        person,
        amount,
        dueDate: data.get("dueDate") || this.today(),
        note: String(data.get("note") || "").trim()
      });

      form.reset();
      this.setDefaultDates();
      this.toast("Debt saved", "success");
      await this.renderCredits();
    },

    async saveReminder(event) {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      if (!title) return this.toast("Enter reminder title", "error");

      await this.add("reminders", {
        id: crypto.randomUUID(),
        title,
        date: data.get("date") || this.today(),
        repeat: data.get("repeat"),
        note: String(data.get("note") || "").trim(),
        notifiedOn: "",
        createdAt: new Date().toISOString()
      });

      await this.requestNotifications();
      form.reset();
      this.setDefaultDates();
      this.toast("Reminder saved", "success");
      await this.renderReminders();
    },

    async renderDashboard() {
      const [expenses, credits] = await Promise.all([this.getAll("expenses"), this.getAll("credits")]);
      const stats = this.budgetStats(expenses);
      const pending = credits.filter((record) => record.status !== "completed");
      const borrowed = this.sum(pending.filter((record) => record.type === "owe"), "remainingAmount");
      const lent = this.sum(pending.filter((record) => record.type === "lent"), "remainingAmount");
      const health = this.healthState(stats);

      document.getElementById("greeting").textContent = `Hi, ${this.profile.name}`;
      document.getElementById("moneyLeft").textContent = this.money(stats.remaining);
      document.getElementById("monthlyBudget").textContent = this.money(stats.allowance);
      document.getElementById("savingsPercent").textContent = `${Math.round(stats.savingsPercent)}%`;
      document.getElementById("safeDaily").textContent = this.money(stats.safeDaily);
      document.getElementById("safeDailyHint").textContent = `${stats.remainingDays} days left of ${stats.cycleDays}`;
      document.getElementById("todayTotal").textContent = this.money(stats.todayTotal);
      document.getElementById("dailyLimitStatus").textContent = stats.todayTotal > stats.safeDaily && stats.safeDaily > 0 ? "Slow down today" : "Within safe limit";
      document.getElementById("survivalDays").textContent = stats.survivalDays === Infinity ? `${stats.remainingDays} days` : `${stats.survivalDays} days`;
      document.getElementById("survivalHint").textContent = health.hint;
      document.getElementById("borrowedTotal").textContent = this.money(borrowed);
      document.getElementById("lentHomeTotal").textContent = this.money(lent);

      const healthCard = document.getElementById("healthCard");
      healthCard.classList.remove("status-good", "status-watch", "status-danger");
      healthCard.classList.add(health.className);
      document.getElementById("healthLabel").textContent = health.label;

      this.renderSuggestions();
      this.renderMiniBars("todayBreakdown", this.groupSum(stats.todayExpenses, "category"), "No spending today");
      this.renderExpenseList("recentList", expenses.sort(this.sortByDateDesc).slice(0, 5), false);
      this.renderCreditList("dueList", pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4), false);
      await this.saveDailySnapshot(stats);
    },

    async saveDailySnapshot(stats) {
      try {
        await this.put("analytics", {
          id: this.today(),
          date: this.today(),
          monthTotal: stats.monthTotal,
          todayTotal: stats.todayTotal,
          remaining: stats.remaining,
          safeDaily: stats.safeDaily,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.warn("Daily snapshot skipped", error);
      }
    },

    budgetStats(expenses) {
      const today = this.today();
      const cycle = this.budgetCycle(today);
      const month = today.slice(0, 7);
      const monthExpenses = expenses.filter((expense) => expense.date >= cycle.start && expense.date <= cycle.end);
      const todayExpenses = expenses.filter((expense) => expense.date === today);
      const monthTotal = this.sum(monthExpenses, "amount");
      const todayTotal = this.sum(todayExpenses, "amount");
      const allowance = Number(this.profile?.monthlyAllowance || 0);
      const remaining = allowance > 0 ? Math.max(allowance - monthTotal, 0) : 0;
      const usedDays = this.daysBetween(cycle.start, today) + 1;
      const remainingDays = Math.max(BUDGET_CYCLE_DAYS - usedDays + 1, 1);
      const safeDaily = allowance > 0 ? remaining / Math.max(remainingDays, 1) : 0;
      const dailyAverage = monthTotal / Math.max(usedDays, 1);
      const survivalDays = dailyAverage > 0 ? Math.floor(remaining / dailyAverage) : Infinity;
      const savingsPercent = allowance > 0 ? (remaining / allowance) * 100 : 0;

      return {
        today,
        month,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        cycleDays: BUDGET_CYCLE_DAYS,
        allowance,
        monthExpenses,
        todayExpenses,
        monthTotal,
        todayTotal,
        remaining,
        usedDays,
        remainingDays,
        safeDaily,
        dailyAverage,
        survivalDays,
        savingsPercent
      };
    },

    healthState(stats) {
      if (!stats.allowance) return { label: "Setup needed", hint: "Add pocket money", className: "status-watch" };
      if (stats.remaining <= 0) return { label: "Emergency", hint: "Budget finished", className: "status-danger" };
      if (stats.todayTotal > stats.safeDaily && stats.safeDaily > 0) return { label: "Careful", hint: "Daily limit crossed", className: "status-watch" };
      if (stats.survivalDays !== Infinity && stats.survivalDays < stats.remainingDays) return { label: "Watch", hint: `May finish in ${stats.survivalDays} days`, className: "status-watch" };
      return { label: "Safe", hint: "You are on track", className: "status-good" };
    },

    async renderHistory() {
      let expenses = await this.getAll("expenses");
      const category = document.getElementById("historyCategory").value;
      const month = document.getElementById("historyMonth").value;
      if (category) expenses = expenses.filter((expense) => expense.category === category);
      if (month) expenses = expenses.filter((expense) => expense.date.startsWith(month));
      this.renderExpenseList("historyList", expenses.sort(this.sortByDateDesc), true);
    },

    renderExpenseList(containerId, expenses, withActions) {
      const container = document.getElementById(containerId);
      if (!expenses.length) {
        container.innerHTML = `<div class="empty">No expenses yet</div>`;
        return;
      }

      container.innerHTML = expenses.map((expense) => `
        <article class="item">
          <div>
            <div class="item-title">${this.escape(expense.title)}</div>
            <div class="item-meta">${this.escape(expense.category)} &middot; ${this.escape(expense.paymentMethod)} &middot; ${expense.date}</div>
            ${expense.note ? `<div class="item-meta">${this.escape(expense.note)}</div>` : ""}
          </div>
          <div>
            <div class="item-amount">${this.money(expense.amount)}</div>
            ${withActions ? `<div class="item-actions"><button class="mini-button danger" data-record-action="delete" data-store="expenses" data-id="${expense.id}" type="button">Delete</button></div>` : ""}
          </div>
        </article>
      `).join("");
    },

    async renderCredits() {
      const credits = await this.getAll("credits");
      const active = credits.filter((record) => record.status !== "completed");
      const lent = active.filter((record) => record.type === "lent");
      const owe = active.filter((record) => record.type === "owe");
      document.getElementById("lentTotal").textContent = this.money(this.sum(lent, "remainingAmount"));
      document.getElementById("oweTotal").textContent = this.money(this.sum(owe, "remainingAmount"));
      this.renderCreditList("creditList", credits.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), true);
    },

    renderCreditList(containerId, records, withActions) {
      const container = document.getElementById(containerId);
      if (!records.length) {
        container.innerHTML = `<div class="empty">No pending debts</div>`;
        return;
      }

      container.innerHTML = records.map((record) => `
        <article class="item">
          <div>
            <div class="item-title">${this.escape(record.person)} ${record.type === "lent" ? "owes you" : "to pay"}</div>
            <div class="item-meta">Due ${record.dueDate} &middot; ${record.status}</div>
            ${record.note ? `<div class="item-meta">${this.escape(record.note)}</div>` : ""}
          </div>
          <div>
            <div class="item-amount">${this.money(record.remainingAmount)}</div>
            ${withActions ? `
              <div class="item-actions">
                <button class="mini-button" data-record-action="pay" data-store="credits" data-id="${record.id}" type="button">Pay</button>
                <button class="mini-button" data-record-action="complete" data-store="credits" data-id="${record.id}" type="button">Done</button>
                <button class="mini-button" data-record-action="share" data-store="credits" data-id="${record.id}" type="button">Share</button>
                <button class="mini-button danger" data-record-action="delete" data-store="credits" data-id="${record.id}" type="button">Delete</button>
              </div>` : ""}
          </div>
        </article>
      `).join("");
    },

    async renderAnalytics() {
      const [expenses, credits] = await Promise.all([this.getAll("expenses"), this.getAll("credits")]);
      const stats = this.budgetStats(expenses);
      const categoryGroups = this.groupSum(stats.monthExpenses, "category");
      const biggest = Object.entries(categoryGroups).sort((a, b) => b[1] - a[1])[0];
      const pendingDebt = this.sum(credits.filter((record) => record.status !== "completed"), "remainingAmount");

      document.getElementById("analyticsMonthTotal").textContent = this.money(stats.monthTotal);
      document.getElementById("dailyAverage").textContent = this.money(stats.dailyAverage);
      document.getElementById("biggestCategory").textContent = biggest ? biggest[0] : "None";
      this.renderInsights("weeklyInsights", this.weeklyInsights(expenses, stats, pendingDebt, biggest));
      this.renderBars("categoryBars", categoryGroups, "No spending data");
      this.renderBars("weeklyBars", this.groupByWeek(stats.monthExpenses), "No weekly spending yet");
    },

    weeklyInsights(expenses, stats, pendingDebt, biggest) {
      const last7 = this.sum(this.filterDays(expenses, 7), "amount");
      const prev7 = this.sum(this.filterDays(expenses, 14, 7), "amount");
      const streak = this.noOverspendStreak(expenses, stats.allowance);
      const impulseNow = this.sum(this.filterDays(expenses, 7).filter((item) => ["Shopping", "Entertainment"].includes(item.category)), "amount");
      const impulsePrev = this.sum(this.filterDays(expenses, 14, 7).filter((item) => ["Shopping", "Entertainment"].includes(item.category)), "amount");
      const impulseChange = impulsePrev > 0 ? Math.round(((impulseNow - impulsePrev) / impulsePrev) * 100) : 0;
      const insights = [];

      insights.push(biggest ? `Most money went to ${biggest[0]} this month.` : "No category is dominating yet.");
      insights.push(last7 <= prev7 || prev7 === 0 ? "This week is under control." : `This week increased by ${this.money(last7 - prev7)}.`);
      insights.push(`No-overspending streak: ${streak} days.`);
      insights.push(stats.allowance ? `Savings left: ${Math.round(stats.savingsPercent)}%.` : "Set pocket money to unlock survival math.");
      if (impulsePrev > 0) insights.push(`Impulse categories changed by ${impulseChange}% this week.`);
      if (pendingDebt > 0) insights.push(`Pending debt total is ${this.money(pendingDebt)}.`);
      return insights;
    },

    renderInsights(containerId, insights) {
      const container = document.getElementById(containerId);
      container.innerHTML = insights.map((text) => `<div class="insight">${this.escape(text)}</div>`).join("");
    },

    renderBars(containerId, groups, emptyText) {
      const container = document.getElementById(containerId);
      const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!entries.length) {
        container.innerHTML = `<div class="empty">${emptyText}</div>`;
        return;
      }

      const max = Math.max(...entries.map((entry) => entry[1]), 1);
      container.innerHTML = entries.map(([label, amount]) => {
        const width = Math.max((amount / max) * 100, 3);
        return `
          <div class="bar-row">
            <div class="bar-top"><span>${this.escape(label)}</span><span>${this.money(amount)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
          </div>
        `;
      }).join("");
    },

    renderMiniBars(containerId, groups, emptyText) {
      const container = document.getElementById(containerId);
      const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
      if (!entries.length) {
        container.innerHTML = `<div class="empty">${emptyText}</div>`;
        return;
      }

      container.innerHTML = entries.map(([label, amount]) => `
        <div class="mini-bar">
          <span>${this.escape(label)}</span>
          <b>${this.money(amount)}</b>
        </div>
      `).join("");
    },

    async renderAfford() {
      const container = document.getElementById("affordResult");
      if (!container.innerHTML.trim()) {
        const expenses = await this.getAll("expenses");
        const stats = this.budgetStats(expenses);
        container.innerHTML = `
          <div class="result-big">${this.money(stats.safeDaily)}</div>
          <p class="muted">Current safe spending per day</p>
        `;
      }
    },

    async checkAfford(event) {
      event.preventDefault();
      const data = new FormData(event.target);
      const name = String(data.get("name") || "This").trim();
      const amount = Number(data.get("amount"));
      if (!amount || amount <= 0) return this.toast("Enter a valid price", "error");

      const expenses = await this.getAll("expenses");
      const stats = this.budgetStats(expenses);
      const afterRemaining = Math.max(stats.remaining - amount, 0);
      const afterDaily = afterRemaining / Math.max(stats.remainingDays, 1);
      const risk = amount > stats.remaining ? "Not safe" : afterDaily < stats.safeDaily * 0.55 ? "Heavy impact" : "Manageable";
      const container = document.getElementById("affordResult");

      container.innerHTML = `
        <div class="result-big">${this.escape(risk)}</div>
        <p>If you buy ${this.escape(name)}, safe spending becomes <b>${this.money(afterDaily)}</b> per day.</p>
        <p class="muted">Money left after purchase: ${this.money(afterRemaining)}</p>
      `;
    },

    async renderSurvival() {
      const [expenses, credits] = await Promise.all([this.getAll("expenses"), this.getAll("credits")]);
      const stats = this.budgetStats(expenses);
      const health = this.healthState(stats);
      const owe = this.sum(credits.filter((record) => record.type === "owe" && record.status !== "completed"), "remainingAmount");
      const afterDebt = Math.max(stats.remaining - owe, 0);
      const afterDebtDaily = afterDebt / Math.max(stats.remainingDays, 1);

      document.getElementById("survivalPanel").innerHTML = `
        <div class="status-pill">${this.escape(health.label)}</div>
        <div class="result-big">${stats.survivalDays === Infinity ? `${stats.remainingDays} days` : `${stats.survivalDays} days`}</div>
        <p>At the current spending speed, your money may survive this long.</p>
        <div class="debt-strip">
          <span>Safe per day <b>${this.money(stats.safeDaily)}</b></span>
          <span>After debt <b>${this.money(afterDebtDaily)}</b></span>
        </div>
        <p class="muted">${this.escape(health.hint)}</p>
      `;
    },

    async renderReminders() {
      const reminders = await this.getAll("reminders");
      const container = document.getElementById("reminderList");
      if (!reminders.length) {
        container.innerHTML = `<div class="empty">No reminders</div>`;
        return;
      }

      container.innerHTML = reminders.sort((a, b) => a.date.localeCompare(b.date)).map((reminder) => `
        <article class="item">
          <div>
            <div class="item-title">${this.escape(reminder.title)}</div>
            <div class="item-meta">${reminder.date} &middot; ${reminder.repeat}</div>
            ${reminder.note ? `<div class="item-meta">${this.escape(reminder.note)}</div>` : ""}
          </div>
          <div class="item-actions">
            <button class="mini-button danger" data-record-action="delete" data-store="reminders" data-id="${reminder.id}" type="button">Delete</button>
          </div>
        </article>
      `).join("");
    },

    async handleRecordAction(action, storeName, id) {
      if (action === "delete") {
        if (!confirm("Delete this record?")) return;
        await this.delete(storeName, id);
        this.toast("Deleted", "success");
      }

      if (storeName === "credits" && action === "complete") {
        const record = await this.findRecord("credits", id);
        if (!record) return;
        record.paidAmount = record.amount;
        record.remainingAmount = 0;
        record.status = "completed";
        record.history = (record.history || []).concat({ type: "complete", amount: record.amount, at: new Date().toISOString() });
        await this.put("credits", record);
        this.toast("Marked complete", "success");
      }

      if (storeName === "credits" && action === "pay") {
        const record = await this.findRecord("credits", id);
        if (!record) return;
        const amount = Number(prompt(`Remaining: ${this.money(record.remainingAmount)}\nPayment amount:`));
        if (!amount || amount <= 0) return;
        if (amount > record.remainingAmount) return this.toast("Payment is more than remaining amount", "error");
        record.paidAmount = Number(record.paidAmount || 0) + amount;
        record.remainingAmount = Math.max(Number(record.remainingAmount || 0) - amount, 0);
        record.status = record.remainingAmount > 0 ? "partial" : "completed";
        record.history = (record.history || []).concat({ type: "payment", amount, at: new Date().toISOString() });
        await this.put("credits", record);
        this.toast("Payment saved", "success");
      }

      if (storeName === "credits" && action === "share") {
        const record = await this.findRecord("credits", id);
        if (!record) return;
        this.shareDebt(record);
      }

      if (this.currentView === "historyView") await this.renderHistory();
      if (this.currentView === "moneyView") await this.renderCredits();
      if (this.currentView === "remindersView") await this.renderReminders();
      if (this.currentView === "dashboardView") await this.renderDashboard();
    },

    async findRecord(storeName, id) {
      const records = await this.getAll(storeName);
      return records.find((item) => item.id === id);
    },

    shareDebt(record) {
      const message = record.type === "lent"
        ? `Hi ${record.person}, pending amount is ${this.money(record.remainingAmount)}.`
        : `Reminder for me: pay ${record.person} ${this.money(record.remainingAmount)}.`;
      if (navigator.share) {
        navigator.share({ title: "PocketSathi debt reminder", text: message }).catch(() => {});
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    },

    async checkReminders() {
      if (!this.profile) return;
      const [reminders, expenses] = await Promise.all([this.getAll("reminders"), this.getAll("expenses")]);
      const today = this.today();
      const stats = this.budgetStats(expenses);

      if (stats.allowance && stats.remaining <= stats.safeDaily && stats.remaining > 0) {
        this.notify("Low money alert", `Only ${this.money(stats.remaining)} left this month.`);
      }

      if (stats.allowance && stats.todayTotal > stats.safeDaily && stats.safeDaily > 0) {
        this.notify("Budget warning", `Today crossed safe limit by ${this.money(stats.todayTotal - stats.safeDaily)}.`);
      }

      for (const reminder of reminders) {
        if (reminder.repeat === "once" && reminder.notifiedOn) continue;
        if (reminder.date <= today && reminder.notifiedOn !== today) {
          this.notify("PocketSathi reminder", `${reminder.title}${reminder.note ? `: ${reminder.note}` : ""}`);
          reminder.notifiedOn = today;
          reminder.date = this.nextReminderDate(reminder.date, reminder.repeat);
          await this.put("reminders", reminder);
        }
      }
    },

    nextReminderDate(dateText, repeat) {
      if (repeat === "weekly") {
        const date = new Date(`${dateText}T00:00:00`);
        date.setDate(date.getDate() + 7);
        return this.isoDate(date);
      }
      if (repeat === "monthly") {
        const date = new Date(`${dateText}T00:00:00`);
        date.setMonth(date.getMonth() + 1);
        return this.isoDate(date);
      }
      return dateText;
    },

    async requestNotifications(showToast = false) {
      if (!("Notification" in window)) {
        if (showToast) this.toast("Notifications are not supported", "warning");
        return;
      }
      if (Notification.permission === "default") await Notification.requestPermission();
      if (showToast) this.toast(Notification.permission === "granted" ? "Notifications on" : "Notifications blocked", Notification.permission === "granted" ? "success" : "warning");
    },

    notify(title, body) {
      const key = `notify:${title}:${this.today()}`;
      if (this.readLocal(key, false)) return;
      this.writeLocal(key, true);

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, tag: "pocketsathi", icon: "icons/icon.svg" });
      } else if (this.currentView !== "authView") {
        this.toast(body, "warning");
      }
    },

    setupVoice() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.readLocal("voiceLang", "en-IN");
      this.recognition.onstart = () => this.toast("Listening...", "success");
      this.recognition.onerror = () => this.toast("Voice input unavailable", "error");
      this.recognition.onresult = async (event) => {
        const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ");
        document.getElementById("quickExpense").value = transcript;
        await this.quickAdd(new Event("submit"));
      };
    },

    startVoice() {
      if (!this.recognition) return this.toast("Voice recognition is not supported in this browser", "warning");
      this.recognition.start();
    },

    fillSettings() {
      if (!this.profile) return;
      document.getElementById("settingsName").value = this.profile.name;
      document.getElementById("settingsCurrency").value = this.profile.currency;
      document.getElementById("settingsAllowance").value = Number(this.profile.monthlyAllowance || 0);
      document.getElementById("settingsCycleDay").value = Number(this.profile.cycleDay || 1);
    },

    async saveSettings(event) {
      event.preventDefault();
      const form = new FormData(event.target);
      const name = String(form.get("name") || "").trim();
      const monthlyAllowance = Number(form.get("monthlyAllowance") || 0);
      const cycleDay = Math.min(Math.max(Number(form.get("cycleDay") || 1), 1), 28);
      if (!name) return this.toast("Enter your name", "error");
      if (monthlyAllowance < 0) return this.toast("Enter valid pocket money", "error");
      this.profile.name = name;
      this.profile.currency = form.get("currency");
      this.profile.monthlyAllowance = monthlyAllowance;
      this.profile.cycleDay = cycleDay;
      this.writeLocal("profile", this.profile);
      this.toast("Budget saved", "success");
      await this.renderDashboard();
    },

    async changePin() {
      if (!this.profile) return;
      const current = prompt("Current PIN:");
      if (!current) return;
      const currentHash = await this.hashPin(current, this.profile.salt);
      if (currentHash !== this.profile.pinHash) return this.toast("Invalid PIN", "error");

      const next = prompt("New PIN, 4 to 6 digits:");
      if (!/^\d{4,6}$/.test(next || "")) return this.toast("PIN must be 4 to 6 digits", "error");
      const confirm = prompt("Confirm new PIN:");
      if (next !== confirm) return this.toast("PINs do not match", "error");

      this.profile.pinHash = await this.hashPin(next, this.profile.salt);
      this.writeLocal("profile", this.profile);
      this.toast("PIN changed", "success");
    },

    logout() {
      this.removeSession("session");
      this.removeLocal("session");
      document.getElementById("loginForm").classList.remove("hidden");
      document.getElementById("setupForm").classList.add("hidden");
      this.showAuth();
    },

    togglePreference(name) {
      const prefs = this.readLocal("preferences", { dark: false, elder: false });
      prefs[name] = !prefs[name];
      this.writeLocal("preferences", prefs);
      this.applyPreferences();
      this.toast(`${name === "dark" ? "Dark mode" : "Large text"} ${prefs[name] ? "on" : "off"}`, "success");
    },

    applyPreferences() {
      const prefs = this.readLocal("preferences", { dark: false, elder: false });
      document.body.classList.toggle("dark", !!prefs.dark);
      document.body.classList.toggle("elder", !!prefs.elder);
    },

    async promptInstall() {
      if (!this.deferredPrompt) {
        this.toast("Use browser install menu if available", "warning");
        return;
      }
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      document.getElementById("installApp").classList.add("hidden");
    },

    rememberSuggestion(value) {
      const cleaned = value.trim().replace(/\s+/g, " ");
      if (!cleaned) return;
      const recent = this.readLocal("suggestions", []);
      this.writeLocal("suggestions", [cleaned].concat(recent.filter((item) => item !== cleaned)).slice(0, 8));
    },

    renderSuggestions() {
      const suggestions = this.readLocal("suggestions", ["Tea 20", "Lunch 80", "Bus 30", "Recharge 199"]).slice(0, 6);
      const container = document.getElementById("recentSuggestions");
      container.innerHTML = suggestions.map((item) => `<button class="chip" data-suggestion="${this.escape(item)}" type="button">${this.escape(item)}</button>`).join("");
    },

    async exportJson() {
      const data = await this.collectExport();
      this.download(`pocketsathi-backup-${this.today()}.json`, JSON.stringify(data, null, 2), "application/json");
      this.toast("JSON backup ready", "success");
    },

    async exportCsv() {
      const expenses = await this.getAll("expenses");
      const rows = [["date", "time", "title", "amount", "category", "payment_method", "note"]]
        .concat(expenses.sort(this.sortByDateDesc).map((expense) => [
          expense.date,
          expense.time,
          expense.title,
          expense.amount,
          expense.category,
          expense.paymentMethod,
          expense.note || ""
        ]));
      const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      this.download(`pocketsathi-expenses-${this.today()}.csv`, csv, "text/csv");
      this.toast("CSV export ready", "success");
    },

    async collectExport() {
      const [expenses, credits, reminders, analytics] = await Promise.all(STORES.map((store) => this.getAll(store)));
      return {
        app: "PocketSathi",
        version: 3,
        exportedAt: new Date().toISOString(),
        profile: this.profile ? {
          name: this.profile.name,
          currency: this.profile.currency,
          monthlyAllowance: this.profile.monthlyAllowance,
          cycleDay: this.profile.cycleDay
        } : null,
        expenses,
        credits,
        reminders,
        analytics
      };
    },

    async importJson(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const data = JSON.parse(await file.text());
        if (!confirm("Import will replace local expenses, debts, reminders, and analytics. Continue?")) return;

        await Promise.all(STORES.map((store) => this.clear(store)));
        for (const store of STORES) {
          if (Array.isArray(data[store])) {
            for (const item of data[store]) await this.add(store, item);
          }
        }

        this.toast("Import complete", "success");
        await this.renderDashboard();
      } catch (error) {
        this.toast("Could not import file", "error");
      } finally {
        event.target.value = "";
      }
    },

    download(filename, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },

    groupSum(items, key) {
      return items.reduce((groups, item) => {
        groups[item[key]] = (groups[item[key]] || 0) + Number(item.amount || 0);
        return groups;
      }, {});
    },

    groupByWeek(items) {
      return items.reduce((groups, item) => {
        const day = Number(item.date.slice(8, 10));
        const label = `Week ${Math.ceil(day / 7)}`;
        groups[label] = (groups[label] || 0) + Number(item.amount || 0);
        return groups;
      }, {});
    },

    filterDays(items, daysBack, offset = 0) {
      const end = new Date();
      end.setDate(end.getDate() - offset);
      const start = new Date(end);
      start.setDate(start.getDate() - daysBack + 1);
      const startText = this.isoDate(start);
      const endText = this.isoDate(end);
      return items.filter((item) => item.date >= startText && item.date <= endText);
    },

    noOverspendStreak(expenses, allowance) {
      if (!allowance) return 0;
      const dailyBase = allowance / BUDGET_CYCLE_DAYS;
      const groups = this.groupSum(expenses, "date");
      let streak = 0;
      const cursor = new Date();
      for (let i = 0; i < 31; i += 1) {
        const dateText = this.isoDate(cursor);
        if ((groups[dateText] || 0) > dailyBase) break;
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      return streak;
    },

    sum(items, key) {
      return items.reduce((total, item) => total + Number(item[key] || 0), 0);
    },

    sortByDateDesc(a, b) {
      return `${b.date} ${b.time || ""}`.localeCompare(`${a.date} ${a.time || ""}`);
    },

    money(amount) {
      const symbol = this.currencySymbols[this.profile?.currency || "INR"] || "Rs";
      return `${symbol} ${Number(amount || 0).toFixed(2)}`;
    },

    today() {
      return this.isoDate(new Date());
    },

    isoDate(date) {
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    },

    budgetCycle(dateText) {
      const cycleDay = Math.min(Math.max(Number(this.profile?.cycleDay || 1), 1), 28);
      const today = new Date(`${dateText}T00:00:00`);
      const start = new Date(today.getFullYear(), today.getMonth(), cycleDay);
      if (today < start) start.setMonth(start.getMonth() - 1);
      const end = new Date(start);
      end.setDate(end.getDate() + BUDGET_CYCLE_DAYS - 1);
      return {
        start: this.isoDate(start),
        end: this.isoDate(end)
      };
    },

    daysBetween(startText, endText) {
      const start = new Date(`${startText}T00:00:00`);
      const end = new Date(`${endText}T00:00:00`);
      return Math.max(Math.floor((end - start) / 86400000), 0);
    },

    timeNow() {
      return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },

    escape(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    },

    toast(message, type = "info") {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.className = `toast show ${type}`;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    },

    async registerServiceWorker() {
      if (!("serviceWorker" in navigator)) return;
      try {
        await navigator.serviceWorker.register("service-worker.js");
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    },

    async requestPersistentStorage() {
      if (navigator.storage?.persist) {
        try {
          await navigator.storage.persist();
        } catch (error) {
          console.warn("Persistent storage request failed", error);
        }
      }
    }
  };

  window.PocketSathi = App;
  document.addEventListener("DOMContentLoaded", () => {
    App.init().catch((error) => {
      console.error(error);
      const toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = "PocketSathi could not start";
        toast.className = "toast show error";
      }
    });
  });
})();
