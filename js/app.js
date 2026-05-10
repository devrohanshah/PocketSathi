(function () {
  "use strict";

  const DB_NAME = "PocketSathiDB";
  const DB_VERSION = 2;
  const STORES = ["expenses", "credits", "reminders"];
  const CATEGORY_KEYWORDS = {
    Food: ["food", "tea", "coffee", "lunch", "dinner", "breakfast", "snack", "milk", "grocery"],
    Transport: ["petrol", "fuel", "bus", "train", "taxi", "auto", "rickshaw", "uber", "ola"],
    Shopping: ["shop", "shopping", "clothes", "mobile", "purchase", "buy"],
    Utilities: ["electricity", "water", "gas", "internet", "recharge", "bill", "rent"],
    Health: ["medicine", "doctor", "hospital", "health", "pharmacy"],
    Education: ["school", "college", "book", "course", "fees", "tuition"],
    Entertainment: ["movie", "game", "party", "music", "show"],
    Other: []
  };

  const App = {
    db: null,
    profile: null,
    deferredPrompt: null,
    recognition: null,
    currentView: "authView",
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

    async hashPin(pin, salt) {
      const data = new TextEncoder().encode(`${salt}:${pin}`);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    },

    async routeFromSession() {
      const session = this.readLocal("session", null);
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
        reminders: "remindersView"
      }[action] || "dashboardView";
    },

    migrateLegacyProfile() {
      if (this.profile) return;
      const legacy = localStorage.getItem("user_profile");
      if (!legacy) return;

      try {
        const parsed = JSON.parse(legacy);
        if (!parsed?.name) return;
        this.profile = {
          name: parsed.name,
          currency: parsed.currency || "INR",
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

      document.body.addEventListener("click", (event) => {
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
          settings: "settingsView"
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
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.profile) {
          this.renderDashboard();
          this.checkReminders();
        }
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
    },

    async createProfile(event) {
      event.preventDefault();
      const name = document.getElementById("setupName").value.trim();
      const currency = document.getElementById("setupCurrency").value;
      const pin = document.getElementById("setupPin").value.trim();
      const confirm = document.getElementById("confirmPin").value.trim();

      if (!name) return this.toast("Please enter your name", "error");
      if (!/^\d{4,6}$/.test(pin)) return this.toast("PIN must be 4 to 6 digits", "error");
      if (pin !== confirm) return this.toast("PINs do not match", "error");

      const salt = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const pinHash = await this.hashPin(pin, salt);
      this.profile = { name, currency, salt, pinHash, createdAt: new Date().toISOString() };
      this.writeLocal("profile", this.profile);
      this.writeLocal("session", "open");
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

      this.writeLocal("session", "open");
      document.getElementById("loginPin").value = "";
      await this.showView("dashboardView");
    },

    async quickAdd(event) {
      event.preventDefault();
      const input = document.getElementById("quickExpense");
      const parsed = this.parseExpenseText(input.value);
      if (!parsed.amount) return this.toast("Write like: Tea 20", "warning");

      await this.add("expenses", {
        id: crypto.randomUUID(),
        title: parsed.title || "Expense",
        amount: parsed.amount,
        category: parsed.category,
        paymentMethod: "Cash",
        date: this.today(),
        time: this.timeNow(),
        note: "",
        createdAt: new Date().toISOString()
      });

      input.value = "";
      this.toast("Expense saved", "success");
      await this.renderDashboard();
    },

    parseExpenseText(text) {
      const raw = text.trim();
      const amountMatch = raw.match(/(?:rs\.?\s*)?(\d+(?:\.\d+)?)/i);
      const amount = amountMatch ? Number(amountMatch[1]) : 0;
      const title = raw.replace(amountMatch ? amountMatch[0] : "", "").replace(/\s+/g, " ").trim();
      const category = this.detectCategory(raw);
      return { title, amount, category };
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

      await this.add("expenses", {
        id: crypto.randomUUID(),
        title: title || "Expense",
        amount,
        category: data.get("category"),
        paymentMethod: data.get("paymentMethod"),
        date,
        time: this.timeNow(),
        note: String(data.get("note") || "").trim(),
        createdAt: new Date().toISOString()
      });

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

      await this.add("credits", {
        id: crypto.randomUUID(),
        type: data.get("type"),
        person,
        amount,
        paidAmount: 0,
        remainingAmount: amount,
        dueDate: data.get("dueDate") || this.today(),
        note: String(data.get("note") || "").trim(),
        status: "pending",
        createdAt: new Date().toISOString()
      });

      form.reset();
      this.setDefaultDates();
      this.toast("Record saved", "success");
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
      const today = this.today();
      const month = today.slice(0, 7);
      const todayTotal = this.sum(expenses.filter((expense) => expense.date === today), "amount");
      const monthTotal = this.sum(expenses.filter((expense) => expense.date.startsWith(month)), "amount");
      const pendingDues = this.sum(credits.filter((record) => record.type === "owe" && record.status !== "completed"), "remainingAmount");

      document.getElementById("greeting").textContent = `Welcome, ${this.profile.name}`;
      document.getElementById("todayTotal").textContent = this.money(todayTotal);
      document.getElementById("monthTotal").textContent = this.money(monthTotal);
      document.getElementById("pendingDues").textContent = this.money(pendingDues);

      this.renderExpenseList("recentList", expenses.sort(this.sortByDateDesc).slice(0, 5), false);
      this.renderCreditList("dueList", credits.filter((record) => record.status !== "completed").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4), false);
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
            <div class="item-meta">${expense.category} · ${expense.paymentMethod} · ${expense.date}</div>
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
      const lent = credits.filter((record) => record.type === "lent" && record.status !== "completed");
      const owe = credits.filter((record) => record.type === "owe" && record.status !== "completed");
      document.getElementById("lentTotal").textContent = this.money(this.sum(lent, "remainingAmount"));
      document.getElementById("oweTotal").textContent = this.money(this.sum(owe, "remainingAmount"));
      this.renderCreditList("creditList", credits.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), true);
    },

    renderCreditList(containerId, records, withActions) {
      const container = document.getElementById(containerId);
      if (!records.length) {
        container.innerHTML = `<div class="empty">No pending records</div>`;
        return;
      }

      container.innerHTML = records.map((record) => `
        <article class="item">
          <div>
            <div class="item-title">${this.escape(record.person)} ${record.type === "lent" ? "owes you" : "to pay"}</div>
            <div class="item-meta">Due ${record.dueDate} · ${record.status}</div>
            ${record.note ? `<div class="item-meta">${this.escape(record.note)}</div>` : ""}
          </div>
          <div>
            <div class="item-amount">${this.money(record.remainingAmount)}</div>
            ${withActions ? `
              <div class="item-actions">
                <button class="mini-button" data-record-action="pay" data-store="credits" data-id="${record.id}" type="button">Pay</button>
                <button class="mini-button" data-record-action="complete" data-store="credits" data-id="${record.id}" type="button">Done</button>
                <button class="mini-button danger" data-record-action="delete" data-store="credits" data-id="${record.id}" type="button">Delete</button>
              </div>` : ""}
          </div>
        </article>
      `).join("");
    },

    async renderAnalytics() {
      const expenses = await this.getAll("expenses");
      const today = this.today();
      const month = today.slice(0, 7);
      const monthExpenses = expenses.filter((expense) => expense.date.startsWith(month));
      const monthTotal = this.sum(monthExpenses, "amount");
      const dayOfMonth = Number(today.slice(8, 10));

      document.getElementById("analyticsMonthTotal").textContent = this.money(monthTotal);
      document.getElementById("dailyAverage").textContent = this.money(monthTotal / Math.max(dayOfMonth, 1));
      this.renderBars("categoryBars", this.groupSum(monthExpenses, "category"), "No spending data");
      this.renderBars("weeklyBars", this.groupByWeek(monthExpenses), "No weekly spending yet");
    },

    renderBars(containerId, groups, emptyText) {
      const container = document.getElementById(containerId);
      const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
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
            <div class="item-meta">${reminder.date} · ${reminder.repeat}</div>
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
        const records = await this.getAll("credits");
        const record = records.find((item) => item.id === id);
        if (!record) return;
        record.paidAmount = record.amount;
        record.remainingAmount = 0;
        record.status = "completed";
        await this.put("credits", record);
        this.toast("Marked complete", "success");
      }

      if (storeName === "credits" && action === "pay") {
        const records = await this.getAll("credits");
        const record = records.find((item) => item.id === id);
        if (!record) return;
        const amount = Number(prompt(`Remaining: ${this.money(record.remainingAmount)}\nPayment amount:`));
        if (!amount || amount <= 0) return;
        if (amount > record.remainingAmount) return this.toast("Payment is more than remaining amount", "error");
        record.paidAmount += amount;
        record.remainingAmount -= amount;
        record.status = record.remainingAmount > 0 ? "partial" : "completed";
        await this.put("credits", record);
        this.toast("Payment saved", "success");
      }

      if (this.currentView === "historyView") await this.renderHistory();
      if (this.currentView === "moneyView") await this.renderCredits();
      if (this.currentView === "remindersView") await this.renderReminders();
      if (this.currentView === "dashboardView") await this.renderDashboard();
    },

    async checkReminders() {
      if (!this.profile) return;
      const reminders = await this.getAll("reminders");
      const today = this.today();

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

    async requestNotifications() {
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") await Notification.requestPermission();
    },

    notify(title, body) {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, tag: "pocketsathi-reminder", icon: "icons/icon.svg" });
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
      this.recognition.lang = "en-IN";
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
    },

    async saveSettings(event) {
      event.preventDefault();
      const form = new FormData(event.target);
      const name = String(form.get("name") || "").trim();
      if (!name) return this.toast("Enter your name", "error");
      this.profile.name = name;
      this.profile.currency = form.get("currency");
      this.writeLocal("profile", this.profile);
      this.toast("Settings saved", "success");
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
      this.toast(`${name === "dark" ? "Dark mode" : "Elder mode"} ${prefs[name] ? "on" : "off"}`, "success");
    },

    applyPreferences() {
      const prefs = this.readLocal("preferences", { dark: false, elder: false });
      document.body.classList.toggle("dark", !!prefs.dark);
      document.body.classList.toggle("elder", !!prefs.elder);
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
      const [expenses, credits, reminders] = await Promise.all(STORES.map((store) => this.getAll(store)));
      return {
        app: "PocketSathi",
        version: 2,
        exportedAt: new Date().toISOString(),
        profile: this.profile ? { name: this.profile.name, currency: this.profile.currency } : null,
        expenses,
        credits,
        reminders
      };
    },

    async importJson(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const data = JSON.parse(await file.text());
        if (!confirm("Import will replace local expenses, dues, and reminders. Continue?")) return;

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
        groups[item[key]] = (groups[item[key]] || 0) + item.amount;
        return groups;
      }, {});
    },

    groupByWeek(items) {
      return items.reduce((groups, item) => {
        const day = Number(item.date.slice(8, 10));
        const label = `Week ${Math.ceil(day / 7)}`;
        groups[label] = (groups[label] || 0) + item.amount;
        return groups;
      }, {});
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
